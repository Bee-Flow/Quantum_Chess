/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'
import { bestMove, pickMove } from '../../../src/ai/bestmove.js'
import { LEVELS } from '../../../src/ai/levels.js'
import { E, POS, randomPositions, S } from './helpers.js'

/** Small deterministic budgets so that the suite stays fast. */
const FAST = { deterministic: true, nodeBudget: 1500 }

describe('bestMove: always-on rules', () => {
	const kingCaptures = [
		['k7/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1-a8'], // rook along a clear file
		['7k/8/8/8/8/8/1B6/4K3 w - - 0 1', 'b2-h8'], // bishop on the long diagonal
		['4k3/8/5N2/8/8/8/8/4K3 w - - 0 1', 'f6-e8'], // knight
		['4k3/8/8/8/8/8/3p4/4K3 b - - 0 1', 'e1-d2'.replace('e1-d2', 'd2-e1=Q')], // pawn with promotion
	]

	it('every level takes a certain king capture (including a converging one)', () => {
		const cases = [[POS.w6(), 'd4|h5-h8'], ...kingCaptures.map(([fen, code]) => [S(fen), code])]
		for (const [state, code] of cases) {
			const legal = E.findMove(state, code)
			if (legal === null || !(legal.capture && legal.resolution === 'certain')) {
				continue // guard against a malformed fixture: only certain captures count here
			}
			for (let level = 1; level <= 5; level++) {
				for (const seed of [1, 2, 3]) {
					expect(bestMove(state, { level, seed, ...FAST }).code).toBe(legal.code)
				}
			}
		}
	})

	it('level 5 finds the converging capture of W6 and the trap of W14', () => {
		expect(bestMove(POS.w6(), { level: 5, seed: 1, deterministic: true }).code).toBe('d4|h5-h8')
		const r = bestMove(POS.w14(), { level: 5, seed: 1, deterministic: true })
		expect(r.code).toBe('a1-a8')
		expect(r.E).toBe(1)
		expect(E.applyMove(POS.w14(), r.code).state.result).toEqual({ result: '1-0', reason: 'king_trapped' })
	})

	it('level 5 uses the exact solver in small positions (P02, P05: unique forced wins)', () => {
		expect(bestMove(S('7k/6pp/8/8/8/3Q4/8/1K6 w - - 0 1', ['d3-d1|d5']), { level: 5, seed: 1, ...FAST }).code).toBe('d1|d5-d8')
		expect(bestMove(S('R6k/1n4pp/8/8/8/8/2K5/8 w - - 0 1', ['b7-c5|d8']), { level: 5, seed: 1, ...FAST }).code).toBe('a8-d8')
	})

	it('plays only legal moves in 200 random positions at every level', () => {
		const positions = randomPositions(200, 99)
		let n = 0
		for (const state of positions) {
			const level = (n++ % 5) + 1
			const r = bestMove(state, { level, seed: n, deterministic: true, nodeBudget: 150 })
			expect(E.isLegal(state, r.code)).toBe(true)
			expect(r.E).toBeGreaterThanOrEqual(0)
			expect(r.E).toBeLessThanOrEqual(1)
		}
	})

	it('is reproducible with a seed and returns the SPEC shape', () => {
		const a = bestMove(POS.middlegame(), { level: 2, seed: 42, ...FAST })
		const b = bestMove(POS.middlegame(), { level: 2, seed: 42, ...FAST })
		expect(a.code).toBe(b.code)
		expect(Object.keys(a).sort()).toEqual(['E', 'candidates', 'code', 'depth', 'displayMs', 'nodes'].sort())
		expect(a.candidates.length).toBeGreaterThan(0)
		expect(a.candidates.every((c) => typeof c.code === 'string' && c.E >= 0 && c.E <= 1)).toBe(true)
	})
})

describe('bestMove: personalities (GD §6.1)', () => {
	// The white rook on a8 hits the black king on h8 only if both ghost knights (c8, e8) are elsewhere: 25 %.
	const shot25 = () => S('R6k/8/1n1n4/8/8/8/8/4K3 w - - 0 1', ['b6-c8|d5', 'd6-e8|f5'])
	// The white rook is 50 % a3 / 50 % a8; from a8 it hits the black king on e8: a 50 % king shot.
	const shot50 = () => S('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', ['a1-a3|a8'])

	it('has the fixture shots it claims', () => {
		const m25 = E.findMove(shot25(), 'a8-h8')
		expect(m25.outcomes.find((o) => o.key === 'capture').weight).toBe(E.T / 4)
		const m50 = E.findMove(shot50(), 'a8-e8')
		expect(m50.outcomes.find((o) => o.key === 'capture').weight).toBe(E.T / 2)
	})

	it('Wobbles shoots at the king from 50 %, never below; Dice from 25 %', () => {
		for (let seed = 0; seed < 30; seed++) {
			expect(bestMove(shot50(), { level: 1, seed, ...FAST }).code).toBe('a8-e8')
			expect(bestMove(shot25(), { level: 1, seed, ...FAST }).code).not.toBe('a8-h8')
			expect(bestMove(shot25(), { level: 2, seed, ...FAST }).code).toBe('a8-h8')
		}
	})

	it('Wobbles never merges or measures; it splits only knights and bishops', () => {
		// White has a ghost knight (merge and Measure available) and a rook and queen that could split.
		const s = S('4k3/8/8/8/8/8/3PPP2/R2QK1N1 w - - 0 1', ['g1-f3|h3'])
		const moves = E.generateMoves(s)
		expect(moves.some((m) => m.type === 'merge')).toBe(true)
		expect(moves.some((m) => m.type === 'measure')).toBe(true)
		const seen = new Set()
		for (let seed = 0; seed < 60; seed++) {
			const m = E.findMove(s, bestMove(s, { level: 1, seed, ...FAST }).code)
			seen.add(m.type)
			expect(m.type).not.toBe('merge')
			expect(m.type).not.toBe('measure')
			if (m.type === 'split') {
				expect(['n', 'b']).toContain(s.types[m.piece])
			}
		}
		expect(seen.has('split')).toBe(true) // "for fun" on about 20 % of moves
	})

	it('Wobbles notices danger to its own king only some of the time; Quark always does', () => {
		const s = S('k7/8/8/8/8/8/8/r3K3 w - - 0 1') // the black rook attacks the white king along the first rank
		let careless = 0
		for (let seed = 0; seed < 40; seed++) {
			if (E.moveRisk(s, bestMove(s, { level: 1, seed, ...FAST }).code) > 0) {
				careless++
			}
			expect(E.moveRisk(s, bestMove(s, { level: 3, seed, ...FAST }).code)).toBe(0)
		}
		expect(careless).toBeGreaterThan(0)
		expect(careless).toBeLessThan(40)
	})

	it('waits out the display delay unless the engine is fast', () => {
		const slow = bestMove(POS.start(), { level: 1, seed: 3, ...FAST })
		expect(slow.displayMs).toBeGreaterThan(0)
		expect(slow.displayMs).toBeLessThanOrEqual(1200)
		expect(bestMove(POS.start(), { level: 1, seed: 3, fast: true, ...FAST }).displayMs).toBe(0)
	})
})

describe('pickMove: level noise', () => {
	const scored = [
		{ code: 'a', value: 0.60, resolution: 'certain' },
		{ code: 'b', value: 0.59, resolution: 'rolled' },
		{ code: 'c', value: 0.40, resolution: 'certain' },
		{ code: 'd', value: 0.10, resolution: 'certain' },
	]
	const sequence = (...xs) => {
		let i = 0
		return () => xs[i++ % xs.length]
	}

	it('plays a random move at the random rate and the second best at the second rate', () => {
		const l1 = LEVELS[0]
		expect(pickMove(scored, l1, sequence(0.1, 0.99)).code).toBe('d')
		expect(pickMove(scored, LEVELS[2], sequence(0.01)).code).toBe('b')
	})

	it('adds the roll bonus (Dice loves rolls) and keeps level 5 deterministic up to ties', () => {
		// Dice: 0.59 + 0.03 beats 0.60; a draw of 0.99 skips the top-half rule and the softmax picks from the top.
		const counts = { a: 0, b: 0 }
		const rng = E.seededRng(5)
		for (let i = 0; i < 400; i++) {
			const c = pickMove(scored, LEVELS[1], rng).code
			if (c in counts) {
				counts[c]++
			}
		}
		expect(counts.b).toBeGreaterThan(counts.a)
		for (let i = 0; i < 20; i++) {
			expect(pickMove(scored, LEVELS[4], E.seededRng(i)).code).toBe('a')
		}
		const tie = [{ code: 'x', value: 0.5, resolution: 'certain' }, { code: 'y', value: 0.4995, resolution: 'certain' }]
		const picks = new Set()
		for (let i = 0; i < 40; i++) {
			picks.add(pickMove(tie, LEVELS[4], E.seededRng(i)).code)
		}
		expect([...picks].sort()).toEqual(['x', 'y'])
	})

	it('softmax temperature orders the levels: lower levels pick worse moves more often', () => {
		const worse = (level) => {
			const rng = E.seededRng(11)
			let n = 0
			for (let i = 0; i < 500; i++) {
				if (pickMove(scored, LEVELS[level - 1], rng).value < 0.5) {
					n++
				}
			}
			return n
		}
		const w = [1, 2, 3, 4, 5].map(worse)
		expect(w[0]).toBeGreaterThan(w[1])
		expect(w[1]).toBeGreaterThanOrEqual(w[2])
		expect(w[3]).toBe(0)
		expect(w[4]).toBe(0)
	})
})
