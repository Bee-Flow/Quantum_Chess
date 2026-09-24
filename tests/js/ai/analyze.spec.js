/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The computer player's analysis: the coach's position analysis, the evaluation of a single move, and the whole-game
 * review with its cache key.
 */

import { describe, expect, it } from 'vitest'
import { analyze, analyzeGame, analyzeGameTask, evaluateMove } from '../../../src/ai/analyze.js'
import { ENGINE_VERSION } from '../../../src/ai/levels.js'
import { E, POS, S } from './helpers.js'

const QUICK = { timeMs: Infinity, nodeBudget: 6000 }

describe('analyze (coach)', () => {
	it('returns White\'s E, multiPV lines, depth and nodes', () => {
		const a = analyze(POS.middlegame(), { ...QUICK, multiPv: 3 })
		expect(a.E).toBeGreaterThan(0)
		expect(a.E).toBeLessThan(1)
		expect(a.best).toHaveLength(3)
		expect(a.best[0].E).toBe(a.E)
		expect(a.best[0].E).toBeGreaterThanOrEqual(a.best[1].E)
		expect(a.best[1].E).toBeGreaterThanOrEqual(a.best[2].E)
		expect(a.best[0].pv[0]).toBe(a.best[0].code)
		expect(['certain', 'quantum', 'rolled']).toContain(a.best[0].resolution)
		expect(a.depth).toBeGreaterThanOrEqual(1)
		expect(a.nodes).toBeGreaterThan(0)
	})

	it('has no fog band when the principal line has no roll', () => {
		expect(analyze(POS.start(), QUICK).fog).toBe(null)
	})

	it('spans the outcomes of the first roll with the fog band (W2: the bishop attacks the ghost knight)', () => {
		const a = analyze(POS.w2(), { ...QUICK, multiPv: 1 })
		expect(a.best[0].code).toBe('c1-h6')
		const ev = evaluateMove(POS.w2(), 'c1-h6', QUICK)
		expect(a.fog).not.toBe(null)
		const outs = ev.outcomes.map((o) => o.E)
		expect(a.fog.min).toBeLessThanOrEqual(a.E)
		expect(a.fog.max).toBeGreaterThanOrEqual(a.E)
		// The band is the spread of the outcomes: Moved (the knight escapes to f6) vs Captured.
		expect(a.fog.max - a.fog.min).toBeGreaterThan(0.1)
		expect(Math.abs((a.fog.max - a.fog.min) - (Math.max(...outs) - Math.min(...outs)))).toBeLessThan(0.1)
	})

	it('shows "♚ in N" when the solver proves a certain win', () => {
		expect(analyze(POS.w6(), QUICK).mate).toEqual({ winner: 'w', moves: 1 })
		expect(analyze(POS.w6(), QUICK).E).toBe(1)
		expect(analyze(POS.w14(), QUICK).mate).toEqual({ winner: 'w', moves: 1 })
		expect(analyze(POS.middlegame(), QUICK).mate).toBe(null)
	})

	it('evaluates included moves and reports finished games', () => {
		const a = analyze(POS.start(), { ...QUICK, include: ['a2-a3', 'Ng1f3', 'e2-e5'] })
		expect(a.included.map((x) => x.code)).toEqual(['a2-a3', 'g1-f3', 'e2-e5'])
		expect(a.included[0].E).toBeGreaterThan(0)
		expect(a.included[2].E).toBe(null) // illegal: no value
		const over = E.applyMove(POS.w6(), 'd4|h5-h8').state
		expect(analyze(over)).toMatchObject({ E: 1, fog: null, mate: null, best: [] })
	})

	it('reports progress per iteration', () => {
		const seen = []
		analyze(POS.start(), { ...QUICK, onProgress: (p) => seen.push(p) })
		expect(seen.length).toBeGreaterThan(0)
		expect(seen[0]).toEqual({
			depth: 1,
			E: expect.any(Number),
			code: expect.any(String),
			nodes: expect.any(Number),
		})
	})
})

describe('evaluateMove', () => {
	it('gives the ex-ante value and the value after each outcome', () => {
		const ev = evaluateMove(POS.w2(), 'Bc1xh6', QUICK)
		expect(ev.code).toBe('c1-h6')
		expect(ev.outcomes.map((o) => [o.key, o.weight])).toEqual([['move', E.T / 2], ['capture', E.T / 2]])
		const avg = ev.outcomes.reduce((s, o) => s + (o.weight / E.T) * o.E, 0)
		expect(avg).toBeCloseTo(ev.E, 9)
		expect(ev.outcomes[1].E).toBeGreaterThan(ev.outcomes[0].E)
	})

	it('has one outcome for a move that is not rolled, and rejects illegal moves', () => {
		const ev = evaluateMove(POS.start(), 'g1-f3|h3', QUICK)
		expect(ev.outcomes).toEqual([{ key: 'quantum', weight: E.T, E: ev.E }])
		expect(evaluateMove(POS.start(), 'e2-e4', QUICK).outcomes[0].key).toBe('certain')
		expect(() => evaluateMove(POS.start(), 'e2-e5', QUICK)).toThrow(E.IllegalMoveError)
	})
})

describe('analyzeGame (review)', () => {
	// A short game with rolls: W2's position, the bishop hits the knight (a roll), then a few more moves.
	const record = () => {
		const start = POS.w2()
		const moves = [
			{ code: 'c1-h6', u: 1234 }, // Moved: the knight was on f6
			{ code: 'e8-e7', u: null },
			{ code: 'e1-d2', u: null },
			{ code: 'f6-g4|e4', u: null },
			{ code: 'h6-g5', u: null },
		]
		return { startState: start, moves }
	}

	it('analyses every ply with the recorded rolls', () => {
		const progress = []
		const g = analyzeGame(record(), { msPerPly: Infinity, nodeBudget: 3000, onProgress: (p) => progress.push(p) })
		expect(g.engineVersion).toBe(ENGINE_VERSION)
		expect(g.plies).toHaveLength(5)
		expect(progress).toHaveLength(5)
		const [first, second] = g.plies
		expect(first).toMatchObject({ ply: 0, color: 'w', code: 'c1-h6', forced: false, bestCode: 'c1-h6' })
		expect(first.outcomes.map((o) => o.key)).toEqual(['move', 'capture'])
		// u = 1234 < 2^23: the roll is "move"; realised E is that outcome's value.
		expect(first.realisedE).toBe(first.outcomes[0].E)
		expect(first.playedE).toBeCloseTo((first.outcomes[0].E + first.outcomes[1].E) / 2, 9)
		expect(first.bestE).toBe(first.EBefore)
		expect(first.secondBestE).toBeLessThanOrEqual(first.bestE)
		expect(second).toMatchObject({ ply: 1, color: 'b', code: 'e8-e7', outcomes: null })
		expect(second.realisedE).toBe(second.playedE)
		for (const p of g.plies) {
			for (const k of ['EBefore', 'bestE', 'playedE', 'realisedE']) {
				expect(p[k]).toBeGreaterThanOrEqual(0)
				expect(p[k]).toBeLessThanOrEqual(1)
			}
			expect(typeof p.allowsKingShot).toBe('boolean')
		}
	})

	it('flags forced moves and free king shots', () => {
		// White's only piece is the king; its only safe squares… the black rook covers the second rank.
		const s = S('k7/8/8/8/8/8/r7/7K w - - 0 1')
		const legal = E.generateMoves(s).map((m) => m.code)
		expect(legal.length).toBeGreaterThan(1)
		// h1-g2 walks onto the rook's rank (a certain king shot); h1-g1 stays safe.
		const g = analyzeGame(
			{ startState: s, moves: [{ code: 'h1-g2', u: 5 }] },
			{ msPerPly: Infinity, nodeBudget: 2000 },
		)
		expect(g.plies[0].allowsKingShot).toBe(true)
		const ok = analyzeGame(
			{ startState: s, moves: [{ code: 'h1-g1', u: 5 }] },
			{ msPerPly: Infinity, nodeBudget: 2000 },
		)
		expect(ok.plies[0].allowsKingShot).toBe(false)
	})

	it('yields after every ply and refuses a rolled move without its roll', () => {
		const task = analyzeGameTask(record(), { msPerPly: Infinity, nodeBudget: 1000 })
		const first = task.next()
		expect(first.done).toBe(false)
		expect(first.value.code).toBe('c1-h6')
		const bad = { startState: POS.w2(), moves: [{ code: 'c1-h6', u: null }] }
		expect(() => analyzeGame(bad, { msPerPly: Infinity, nodeBudget: 500 })).toThrow(/no recorded roll/)
	})
})
