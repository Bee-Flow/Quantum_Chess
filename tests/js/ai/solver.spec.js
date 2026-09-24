/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The solver: every trainer puzzle is proven with its accepted moves; goals, horizons and limits.
 */

import { describe, expect, it } from 'vitest'
import { pliesFor, solve } from '../../../src/ai/solver.js'
import { S } from './helpers.js'

/** The trainer's puzzles and lesson step L1.3: setup, goal and the verified accepted set. */
const PUZZLES = [
	['P01', 'forced', '7k/5p1p/6p1/8/8/8/1B3PPP/3q2K1 w - - 0 1', [], ['b2-h8'], 1],
	['P02', 'forced', '7k/6pp/8/8/8/3Q4/8/1K6 w - - 0 1', ['d3-d1|d5'], ['d1|d5-d8'], 1],
	['P03', 'forced', '7k/6pr/8/4N3/2B5/8/8/2K5 w - - 0 1', ['e5-g6|f7'], ['g6|f7-h8', 'f7-h8'], 1],
	['P04', 'forced', 'R6k/6pp/3N4/8/8/8/8/2K5 w - - 0 1', ['d6-f7|e8'], ['e8-c7', 'e8-d6', 'e8-f6', 'e8-d6|c7', 'e8-f6|c7', 'e8-d6|f6', 'f7|e8-d6'], 1],
	['P05', 'forced', 'R6k/1n4pp/8/8/8/8/2K5/8 w - - 0 1', ['b7-c5|d8'], ['a8-d8'], 1],
	['P06', 'forced', '5b1k/4P1pp/3n4/8/8/8/2K5/8 w - - 0 1', ['d6-b5|e8'], ['e7-f8=Q', 'e7-f8=R'], 1],
	['P07', 'forced', 'r5k1/5ppp/3n4/8/8/8/8/1K2R3 w - - 0 1', ['d6-b5|c8', 'a8-e8'], ['e1-e8'], 1],
	['P08', 'max', '7k/7p/6p1/8/8/8/8/Q3K3 w - - 0 1', ['a1-c3|a8', 'c3-b2|d4'], ['b2|a8-h8', 'd4|a8-h8'], 0.75],
	['P09', 'survive', '3r3k/6pp/8/6B1/4q3/8/8/4K3 w - - 0 1', ['e4-b4|h4'], ['e1-e2', 'e1-f1'], 0],
	['P10', 'material', 'r6N/7p/8/8/2b5/k7/8/3K4 w - - 0 1', [], ['h8-g6|f7'], 1.5],
	['P11', 'survive', 'R5k1/4rppp/8/8/8/1K6/8/8 b - - 0 1', [], ['e7-e1|e8', 'e7-e2|e8', 'e7-e3|e8', 'e7-e4|e8', 'e7-e5|e8', 'e7-e6|e8', 'e7-b7|e8'], 0.5],
	['L1.3', 'forced', '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1', [], ['a1-a8'], 1],
]

describe('solve: the trainer puzzles', () => {
	for (const [id, goal, fen, prelude, accepted, value] of PUZZLES) {
		it(`${id} (${goal}): accepted set and value`, () => {
			const r = solve(S(fen, prelude), { goal })
			expect(r.exact).toBe(true)
			expect([...r.accepted].sort()).toEqual([...accepted].sort())
			expect(r.value).toBeCloseTo(value, 9)
			// Every move was enumerated, best first.
			expect(r.moves.length).toBeGreaterThanOrEqual(accepted.length)
			expect(r.moves[0].value).toBeCloseTo(value, 9)
		})
	}

	it('P02 is unique among all 540 legal moves', () => {
		const r = solve(S('7k/6pp/8/8/8/3Q4/8/1K6 w - - 0 1', ['d3-d1|d5']), { goal: 'forced' })
		expect(r.moves).toHaveLength(540)
		expect(r.moves.filter((m) => m.value === 1)).toHaveLength(1)
	})

	it('P08 traps: 50 % and 25 % shots are not accepted', () => {
		const r = solve(S('7k/7p/6p1/8/8/8/8/Q3K3 w - - 0 1', ['a1-c3|a8', 'c3-b2|d4']), { goal: 'max' })
		const v = Object.fromEntries(r.moves.map((m) => [m.code, m.value]))
		expect(v['a8-h8']).toBe(0.5)
		expect(v['b2|d4-h8']).toBe(0.5)
		expect(v['d4-h8']).toBe(0.25)
		expect(v['b2-h8']).toBe(0.25)
	})

	it('P09 traps: g5-d8 loses the king for certain, e1-f2 leaves 50 %', () => {
		const r = solve(S('3r3k/6pp/8/6B1/4q3/8/8/4K3 w - - 0 1', ['e4-b4|h4']), { goal: 'survive' })
		const v = Object.fromEntries(r.moves.map((m) => [m.code, m.value]))
		expect(v['g5-d8']).toBe(1)
		expect(v['e1-d1']).toBe(1)
		expect(v['e1-f2']).toBe(0.5)
	})
})

describe('solve: goals, horizons and limits', () => {
	it('computes default plies from goal and horizon', () => {
		expect(pliesFor('forced', 1, false)).toBe(1)
		expect(pliesFor('max', 2, false)).toBe(3)
		expect(pliesFor('survive', 1, false)).toBe(2)
		expect(pliesFor('material', 1, true)).toBe(3)
	})

	it('solves for the side not to move: every reply of the loser is lost', () => {
		// Black to move in W14 after a1-a8 would already be over (E1b); use the lesson position one ply earlier with
		// Black to move instead: Black cannot stop Ra1-a8 here, so White's forced win within one move holds.
		const s = S('6k1/5ppp/8/8/8/8/8/R3K3 b - - 0 1')
		const r = solve(s, { goal: 'forced', horizon: 1, side: 'w' })
		expect(r.plies).toBe(2)
		// Black can run with the king (g8-f8 then a1-a8 is not a trap because the king reaches e7): not forced.
		expect(r.value).toBeLessThan(1)
		expect(r.accepted).toEqual([]) // accepted moves only for the side to move
	})

	it('supports a ply override (the 3-ply material grading of the gamble lesson)', () => {
		const s = S('6k1/5ppp/8/2q5/4PN2/7P/5PP1/6K1 w - - 0 1', ['c5-d5|h5'])
		const r = solve(s, { goal: 'material', plies: 3 })
		const v = Object.fromEntries(r.moves.map((m) => [m.code, m.value]))
		// The gamble lesson (L09): e4-d5 and f4-d5 gain 4.5 pawns, f4-h5 gains 3.0 (losses are negative gains).
		expect(v['e4-d5']).toBeCloseTo(-4.5, 9)
		expect(v['f4-d5']).toBeCloseTo(-4.5, 9)
		expect(v['f4-h5']).toBeCloseTo(-3.0, 9)
		expect([...r.accepted].sort()).toEqual(['e4-d5', 'f4-d5'])
	})

	it('reports exact: false when the node limit stops it', () => {
		const r = solve(S('3r3k/6pp/8/6B1/4q3/8/8/4K3 w - - 0 1', ['e4-b4|h4']), { goal: 'survive', nodeLimit: 50 })
		expect(r.exact).toBe(false)
	})

	it('rejects unknown goals', () => {
		expect(() => solve(S('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1'), { goal: 'win' })).toThrow(TypeError)
	})
})
