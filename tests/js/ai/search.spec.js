/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'
import { search, Searcher } from '../../../src/ai/search.js'
import { E, POS, S } from './helpers.js'

describe('search: tactics (node budgets, deterministic)', () => {
	it('takes a certain converging capture of the king (W6) at every level', () => {
		for (let level = 1; level <= 5; level++) {
			const r = search(POS.w6(), { level, timeMs: Infinity, nodeBudget: 20000 })
			expect(r.code).toBe('d4|h5-h8')
			expect(r.E).toBe(1)
		}
	})

	it('finds the move that leaves the king unable to escape (W14)', () => {
		for (const level of [2, 3, 4, 5]) {
			const r = search(POS.w14(), { level, timeMs: Infinity, nodeBudget: 30000 })
			expect(r.code).toBe('a1-a8')
			expect(r.E).toBe(1)
		}
	})

	it('wins a hanging queen and escapes certain danger', () => {
		const queen = search(S('k7/8/8/3q4/8/8/8/K2R4 w - - 0 1'), { level: 3, timeMs: Infinity, nodeBudget: 30000 })
		expect(queen.code).toBe('d1-d5')
		const escape = S('k7/8/8/8/8/8/8/r3K3 w - - 0 1')
		const r = search(escape, { level: 3, timeMs: Infinity, nodeBudget: 30000 })
		expect(E.moveRisk(escape, r.code)).toBe(0)
	})

	it('captures first although its own king is in certain danger (P01: no check)', () => {
		const p01 = S('7k/5p1p/6p1/8/8/8/1B3PPP/3q2K1 w - - 0 1')
		expect(E.kingDanger(p01, 'w')).toBe(E.T)
		expect(search(p01, { level: 3, timeMs: Infinity, nodeBudget: 30000 }).code).toBe('b2-h8')
	})

	it('prefers the converging capture with 75 % over single-part shots (P08)', () => {
		const p08 = S('7k/7p/6p1/8/8/8/8/Q3K3 w - - 0 1', ['a1-c3|a8', 'c3-b2|d4'])
		const r = search(p08, { level: 4, timeMs: Infinity, nodeBudget: 40000 })
		expect(['b2|a8-h8', 'd4|a8-h8']).toContain(r.code)
	})

	it('plays the pawn probe that wins most in L9 (not the knight that can be lost)', () => {
		const l9 = S('6k1/5ppp/8/2q5/4PN2/7P/5PP1/6K1 w - - 0 1', ['c5-d5|h5'])
		const r = search(l9, { level: 4, timeMs: Infinity, nodeBudget: 60000 })
		expect(['e4-d5', 'f4-d5']).toContain(r.code)
	})
})

describe('search: results and mechanics', () => {
	it('returns White\'s E, per-move values, principal variation, depth and nodes', () => {
		const r = search(POS.w2(), { level: 3, timeMs: Infinity, nodeBudget: 20000, exactOutcomes: true })
		expect(r.code).toBe('c1-h6')
		expect(r.E).toBeGreaterThan(0.5)
		expect(r.E).toBeLessThan(1)
		expect(r.pv[0]).toBe('c1-h6')
		expect(r.depth).toBeGreaterThanOrEqual(1)
		expect(r.nodes).toBeGreaterThan(0)
		const best = r.moves[0]
		expect(best.outcomes.map((o) => o.key)).toEqual(['move', 'capture'])
		// The ex-ante value is the probability-weighted average of the outcome values.
		const avg = best.outcomes.reduce((s, o) => s + (o.weight / E.T) * o.value, 0)
		expect(avg).toBeCloseTo(best.value, 9)
		expect(best.outcomes[1].value).toBeGreaterThan(best.outcomes[0].value)
	})

	it('is deterministic under a node budget', () => {
		const a = search(POS.ghosts(), { level: 4, timeMs: Infinity, nodeBudget: 8000 })
		const b = search(POS.ghosts(), { level: 4, timeMs: Infinity, nodeBudget: 8000 })
		expect(a.code).toBe(b.code)
		expect(a.E).toBe(b.E)
		expect(a.nodes).toBe(b.nodes)
	})

	it('gives the same answer when run in time slices (resumable search)', () => {
		const whole = new Searcher(POS.ghosts(), { level: 3, timeMs: Infinity, maxDepth: 3 })
		whole.step()
		let t = 0
		const clock = () => t
		const sliced = new Searcher(POS.ghosts(), { level: 3, timeMs: Infinity, maxDepth: 3, now: clock })
		let slices = 0
		// Each slice may run for 300 "clock" units; the fake clock advances by one per node check.
		const origTick = sliced.tick.bind(sliced)
		sliced.tick = () => {
			t++
			origTick()
		}
		while (!sliced.step(t + 300)) {
			slices++
		}
		expect(slices).toBeGreaterThan(3)
		expect(sliced.result().code).toBe(whole.result().code)
		expect(sliced.result().E).toBeCloseTo(whole.result().E, 2)
	})

	it('Star2 probing does not change the decision', () => {
		for (const make of [POS.w2, POS.ghosts]) {
			const on = search(make(), { level: 5, timeMs: Infinity, maxDepth: 3, star2: true })
			const off = search(make(), { level: 5, timeMs: Infinity, maxDepth: 3, star2: false })
			expect(on.code).toBe(off.code)
			expect(on.E).toBeCloseTo(off.E, 2)
		}
	})

	it('restricts the root and reports progress per iteration', () => {
		const seen = []
		const r = search(POS.start(), {
			level: 3,
			timeMs: Infinity,
			rootMoves: ['e2-e4', 'a2-a3'],
			onProgress: (p) => seen.push(p),
		})
		expect(r.moves.map((m) => m.code).sort()).toEqual(['a2-a3', 'e2-e4'])
		expect(seen.map((p) => p.depth)).toEqual([1, 2, 3])
		expect(seen.every((p) => typeof p.E === 'number' && typeof p.code === 'string')).toBe(true)
	})

	it('stops at the time limit but always completes the first iteration', () => {
		let t = 0
		const r = search(POS.ghosts(), { level: 5, timeMs: 1, now: () => t++ })
		expect(r.depth).toBeGreaterThanOrEqual(1)
		expect(r.moves.every((m) => m.value !== null)).toBe(true)
	})

	it('uses a partial last iteration for the move, but not for analysis values', () => {
		const partial = search(POS.ghosts(), { level: 4, timeMs: Infinity, nodeBudget: 3000 })
		const consistent = search(POS.ghosts(), { level: 4, timeMs: Infinity, nodeBudget: 3000, usePartial: false })
		// With usePartial off every move carries the value of the same (last complete) depth.
		const depths = new Set(consistent.moves.map((m) => m.depth))
		expect(depths.size).toBe(1)
		expect(partial.moves.length).toBe(consistent.moves.length)
	})
})
