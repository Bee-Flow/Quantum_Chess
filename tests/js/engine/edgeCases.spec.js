/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Every numbered edge case (1–86) of the edge-case table (§11), as a test.
 *
 * Section numbers (§) refer to docs/engine-rules.md.
 */

import { describe, expect, it } from 'vitest'
import { craft, E, H, locOf, play, S, T, W, withFields } from './helpers.js'

const why = (s, m) => E.whyIllegal(s, m)
const res = (s, m) => E.findMove(s, m).resolution
const outs = (s, m) => E.findMove(s, m).outcomes

const START = E.initialState()
const W2 = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
const W4a = play(S('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), 'b6-a4|c4')
const W4b = play(W4a, 'a1-a8')
const W6 = S('7k/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1-d4|h5'])
const W7 = ['g8-f6|h6', 'e1-e2', 'f6-d5|e4'].reduce((st, c) => play(st, c), S('4k1n1/8/8/8/8/3P4/8/4K3 b - - 0 1'))
const W8 = S('4k3/8/6n1/8/8/8/8/1NBQK2R w - - 0 1', ['b1-a3|c3', 'c1-d2|e3', 'd1-b3|a4', 'g6-f4|h4'])
const W14 = S('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1')

describe('edge cases 1–20', () => {
	it('#1 classical piece, clear lane, empty target: certain, no u', () => {
		const r = E.applyMove(START, 'g1-f3', { u: 5 })
		expect(r.move.resolution).toBe('certain')
		expect(r.measurement).toBe(null)
		expect(E.getOutcomes(START, 'g1-f3').map((o) => [o.key, o.weight, o.happened])).toEqual([['certain', T, true]])
	})

	it('#2 classical captures classical: certain capture, measurement null', () => {
		const s = S('4k3/8/8/7n/8/8/8/4K2R w - - 0 1')
		const r = E.applyMove(s, 'h1-h5')
		expect(r.move.resolution).toBe('certain')
		expect(r.move.outcomes).toEqual([{ key: 'capture', weight: T }])
		expect(r.measurement).toBe(null)
		expect(r.state.captured[r.state.captured.length - 1]).toBe(22)
		expect(E.getOutcomes(s, 'h1-h5')[0].captured).toBe(22)
	})

	it('#3 slider past an uncertain enemy: quantum and linked', () => {
		expect(res(W4a, 'a1-a8')).toBe('quantum')
		expect(E.links(W4b)).toEqual([[2, 22]])
	})

	it('#4 slider past an own ghost: quantum, own link, budget does not grow', () => {
		const s = S('4k3/8/8/8/8/8/8/RN2K3 w - - 0 1', ['b1-a3|c3'])
		expect(E.budget(s, 'w')).toBe(2)
		expect(res(s, 'a1-a8')).toBe('quantum')
		const s2 = play(s, 'a1-a8')
		expect(E.budget(s2, 'w')).toBe(2)
		expect(E.links(s2)).toEqual([[2, 6]])
	})

	it('#5 lane crosses a ghost, target certainly holds an enemy: capture or miss', () => {
		const s = S('r3k3/8/1n6/8/8/8/8/R3K3 w - - 0 1', ['b6-a4|c4'])
		expect(outs(s, 'a1-a8')).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'capture', weight: 8388608 }])
		const cap = play(s, 'a1-a8', { outcome: 'capture' })
		expect(locOf(cap, 22)).toEqual({ c4: T })
		expect(cap.captured).toContain(18)
		const miss = play(s, 'a1-a8', { outcome: 'miss' })
		expect(locOf(miss, 2)).toEqual({ a1: T })
		expect(locOf(miss, 22)).toEqual({ a4: T })
		expect(locOf(miss, 18)).toEqual({ a8: T })
	})

	it('#6 certain attacker, enemy ghost ½ on the target: move ½ / capture ½', () => {
		expect(outs(W2, 'c1-h6')).toEqual([{ key: 'move', weight: 8388608 }, { key: 'capture', weight: 8388608 }])
		expect(locOf(play(W2, 'c1-h6', { outcome: 'move' }), 23)).toEqual({ f6: T })
	})

	it('#7 attacker ½ on f, enemy certain on the target: miss ½ / capture ½', () => {
		const s = S('4k3/8/8/4n3/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3'])
		expect(outs(s, 'f3-e5')).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'capture', weight: 8388608 }])
		expect(locOf(play(s, 'f3-e5', { outcome: 'miss' }), 7)).toEqual({ h3: T })
	})

	it('#8 ghost against ghost: three outcomes', () => {
		const s = S('4k3/8/3b4/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3', 'd6-c7|e5'])
		expect(outs(s, 'f3-e5').map((o) => [o.key, o.weight])).toEqual([['miss', 8388608], ['move', 4194304], ['capture', 4194304]])
	})

	it('#9 own ghost possibly on the target: in M, move means it is elsewhere', () => {
		const s = S('4k3/8/8/8/8/8/8/RN2K3 w - - 0 1', ['b1-a3|c3'])
		expect(res(s, 'a1-a3')).toBe('rolled')
		expect(outs(s, 'a1-a3')).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'move', weight: 8388608 }])
		expect(locOf(play(s, 'a1-a3', { outcome: 'move' }), 6)).toEqual({ c3: T })
		const miss = play(s, 'a1-a3', { outcome: 'miss' })
		expect(locOf(miss, 2)).toEqual({ a1: T })
		expect(locOf(miss, 6)).toEqual({ a3: T })
	})

	it('#10 own piece certainly on the target: own_piece', () => {
		expect(why(START, 'a1-a2')).toBe('own_piece')
		expect(why(START, 'e1-e2')).toBe('own_piece')
	})

	it('#11 moving a part onto another part: not in M, weights gather', () => {
		const s = S('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', ['a1-a3|a5'])
		expect(outs(s, 'a3-a5')).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'move', weight: 8388608 }])
		expect(res(s, 'a3-a5')).toBe('quantum')
		const s2 = play(s, 'a3-a5')
		expect(W(s2).length).toBe(1)
		expect(locOf(s2, 2)).toEqual({ a5: T })
	})

	it('#12 enemy on the target only where X is not on f: still in M, rolled miss/move', () => {
		const s = play(W4b, 'e8-d8')
		const m = E.findMove(s, 'a8-a4')
		expect(m.resolution).toBe('rolled')
		expect(m.outcomes).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'move', weight: 8388608 }])
		const r = play(s, 'a8-a4', { outcome: 'move' })
		expect(E.validateState(r).ok).toBe(true)
		expect(locOf(r, 2)).toEqual({ a4: T })
		expect(locOf(r, 22)).toEqual({ c4: T })
	})

	it('#13 lane blocked in every world with X on f: blocked', () => {
		expect(why(START, 'a1-a3')).toBe('blocked')
		expect(why(START, 'f1-c4')).toBe('blocked')
	})

	it('#14 a ghost part moves to an empty square: quantum, budget unchanged', () => {
		const s = play(play(START, 'g1-f3|h3'), 'e7-e5')
		expect(res(s, 'f3-g5')).toBe('quantum')
		const s2 = play(s, 'f3-g5')
		expect(E.budget(s2, 'w')).toBe(2)
		expect(locOf(s2, 7)).toEqual({ g5: 8388608, h3: 8388608 })
	})

	it('#15 a piece never blocks itself', () => {
		const s = S('4k3/8/8/8/8/R7/8/4K3 w - - 0 1', ['a3-a1|a4'])
		expect(locOf(s, 2)).toEqual({ a1: 8388608, a4: 8388608 })
		expect(res(s, 'a1-a8')).toBe('quantum')
		expect(locOf(play(s, 'a1-a8'), 2)).toEqual({ a4: 8388608, a8: 8388608 })
	})

	it('#16 split target possibly occupied (even by X): split_target_occupied', () => {
		const s = S('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', ['a1-a3|a5'])
		expect(why(s, 'a3-b3|a5')).toBe('split_target_occupied')
		expect(why(START, 'g1-e2|f3')).toBe('split_target_occupied')
	})

	it('#17 split lanes never both clear: split_blocked', () => {
		expect(why(S('4k3/8/8/8/8/8/P7/R3K3 w - - 0 1'), 'a1-b1|a3')).toBe('split_blocked')
		const s = S('4k3/8/8/8/8/2n5/8/R3K3 w - - 0 1', ['c3-a4|b1'])
		expect(why(s, 'a1-c1|a5')).toBe('split_blocked')
	})

	it('#18 a split lane blocked in some worlds: that child stays home', () => {
		const s1 = play(S('4k3/8/8/8/8/6n1/8/1K1R4 b - - 0 1'), 'g3-f1|h5')
		expect(locOf(play(s1, 'd1-h1|d5'), 2)).toEqual({ d1: 4194304, h1: 4194304, d5: 8388608 })
	})

	it('#19 splitting a part of a ghost', () => {
		expect(locOf(W7, 23)).toEqual({ h6: 8388608, d5: 4194304, e4: 4194304 })
	})

	it('#20 a split that would leave 5 squares: location_cap', () => {
		const s = S('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3', 'e8-d8', 'f3-e5|g5', 'd8-e8', 'h3-f2|f4', 'e8-d8'])
		expect(Object.keys(locOf(s, 7)).length).toBe(4)
		expect(why(s, 'e5-c4|c6')).toBe('location_cap')
	})
})

describe('edge cases 21–40', () => {
	it('#21 a split over the budget: budget_full, never a roll', () => {
		expect(why(W8, 'h1-h3|h5')).toBe('budget_full')
		expect(E.findMove(W8, 'h1-h3|h5')).toBe(null)
		// At 8/8 every split is illegal; none is turned into a roll.
		expect(E.generateMoves(W8).filter((m) => m.type === 'split')).toEqual([])
	})

	it('#22 a branching world of weight 1: child 2 is dropped', () => {
		const s = craft([
			[{ e1: 'A', a1: 'C', e8: 'a', a2: 'g' }, T - 1],
			[{ e1: 'A', a1: 'C', e8: 'a', h5: 'g' }, 1],
		])
		const m = E.findMove(s, 'a1-a3|b1')
		expect(m.code).toBe('a1-b1|a3')
		const s2 = play(s, m)
		expect(locOf(s2, 2)).toEqual({ a1: 8388607, b1: 8388609 })
		expect(W(s2).map((w) => w[1]).sort((x, y) => x - y)).toEqual([1, 8388607, 8388608])
	})

	it('#23 odd weights: child 1 (lower index) gets the extra unit', () => {
		const s = S('4k1n1/8/8/8/7R/3P4/8/4K3 w - - 0 1', ['g8-f6|h6', 'f6-d5|e4', 'd3-e4@miss'])
		expect(locOf(play(s, 'h4-h3|a4'), 2)).toEqual({ h3: 8388609, a4: 8388607 })
	})

	it('#24 t1 on the lane to t2: legal and clean', () => {
		const s = S('4k3/8/8/8/8/8/8/R3K3 w - - 0 1')
		expect(res(s, 'a1-a3|a5')).toBe('quantum')
		expect(locOf(play(s, 'a1-a3|a5'), 2)).toEqual({ a3: 8388608, a5: 8388608 })
	})

	it('#25 kings and pawns never split or merge', () => {
		expect(why(START, 'e1-d1|f1')).toBe('cannot_split')
		expect(why(START, 'e2-e3|e4')).toBe('cannot_split')
		// A king or pawn is never on two squares, so a merge of one fails at check 6 (merge_mismatch) before check 7.
		expect(why(START, 'e1|e2-e3')).toBe('merge_mismatch')
		expect(why(START, 'd2|e2-d3')).toBe('merge_mismatch')
	})

	it('#26 a merge that surely arrives is certain; a third part makes it uncertain', () => {
		const s = play(play(START, 'g1-f3|h3'), 'e7-e5')
		expect(res(s, 'f3|h3-g1')).toBe('certain')
		const s3 = play(W7, 'e2-e1')
		expect(res(s3, 'd5|e4-f6')).toBe('quantum')
	})

	it('#27 merge onto an empty target where a part may not arrive: quantum', () => {
		const s = play(W7, 'e2-e1')
		expect(outs(s, 'd5|e4-f6')).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'move', weight: 8388608 }])
	})

	it('#28 a named part can never arrive: merge_part_stuck', () => {
		const s = S('4k3/8/8/8/8/1P6/8/R3K3 w - - 0 1', ['a1-a3|c1'])
		expect(why(s, 'a3|c1-c3')).toBe('merge_part_stuck')
	})

	it('#29 merge onto one of its sources: unreachable', () => {
		const s = S('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', ['a1-a3|c1'])
		expect(why(s, 'a3|c1-a3')).toBe('unreachable')
		expect(why(s, 'c1|a3-c1')).toBe('unreachable')
	})

	it('#30 merge onto a friendly piece: merge_target_own', () => {
		const s = S('4k3/8/8/8/8/2P5/8/R3K3 w - - 0 1', ['a1-a3|c1'])
		expect(why(s, 'a3|c1-c3')).toBe('merge_target_own')
	})

	it('#31 certain converging capture', () => {
		expect(res(W6, 'd4|h5-h8')).toBe('certain')
		expect(outs(W6, 'd4|h5-h8')).toEqual([{ key: 'capture', weight: T }])
	})

	it('#32 converging capture that may miss: rolled', () => {
		const s = craft([
			[{ e1: 'A', h8: 'a', d4: 'B' }, T / 4],
			[{ e1: 'A', h8: 'a', h5: 'B' }, T / 4],
			[{ e1: 'A', h8: 'a', a1: 'B' }, T / 2],
		])
		const m = E.findMove(s, 'd4|h5-h8')
		expect(m.resolution).toBe('rolled')
		expect(m.outcomes).toEqual([{ key: 'miss', weight: T / 2 }, { key: 'capture', weight: T / 2 }])
		expect(play(s, m, { outcome: 'capture' }).result).toEqual({ result: '1-0', reason: 'king_captured' })
		expect(locOf(play(s, m, { outcome: 'miss' }), 1)).toEqual({ a1: T })
	})

	it('#33 two of three parts merge; the third is untouched or gathers the weight', () => {
		const s = play(W7, 'e2-e1')
		expect(locOf(play(s, 'd5|e4-f6'), 23)).toEqual({ f6: 8388608, h6: 8388608 })
		const r = craft([
			[{ e1: 'A', e8: 'a', a1: 'C' }, T / 4],
			[{ e1: 'A', e8: 'a', a3: 'C' }, T / 2],
			[{ e1: 'A', e8: 'a', a5: 'C' }, T / 4],
		])
		expect(res(r, 'a1|a5-a3')).toBe('quantum')
		const r2 = play(r, 'a1|a5-a3')
		expect(W(r2).length).toBe(1)
		expect(locOf(r2, 2)).toEqual({ a3: T })
	})

	it('#34 a merge lane may pass the other source', () => {
		const s = S('4k3/8/8/8/8/8/R7/4K3 w - - 0 1', ['a2-a1|a3'])
		expect(res(s, 'a1|a3-a5')).toBe('certain')
		expect(locOf(play(s, 'a1|a3-a5'), 2)).toEqual({ a5: T })
	})

	it('#35 Measure of a certain or an enemy piece', () => {
		expect(why(START, '?e1')).toBe('not_superposed')
		expect(why(START, '?e8')).toBe('not_your_piece')
		expect(why(W4b, '?a1')).toBe('not_your_piece')
	})

	it('#36 Measure of a piece linked to an enemy piece collapses both', () => {
		const r = play(W4b, '?c4', { u: 3 })
		expect(locOf(r, 22)).toEqual({ a4: T })
		expect(locOf(r, 2)).toEqual({ a1: T })
	})

	it('#37 pawn push onto a possibly occupied square: a probe', () => {
		const s = S('4k3/8/8/8/6n1/8/4P3/4K3 w - - 0 1', ['g4-e3|h6'])
		expect(res(s, 'e2-e3')).toBe('rolled')
		expect(outs(s, 'e2-e3')).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'move', weight: 8388608 }])
		const miss = play(s, 'e2-e3', { outcome: 'miss' })
		expect(locOf(miss, 12)).toEqual({ e2: T })
		expect(locOf(miss, 22)).toEqual({ e3: T })
	})

	it('#38 double push with the target possibly occupied: rolled, never one square', () => {
		const s = S('4k3/8/8/6n1/8/8/4P3/4K3 w - - 0 1', ['g5-e4|h3'])
		expect(outs(s, 'e2-e4')).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'move', weight: 8388608 }])
		expect(locOf(play(s, 'e2-e4', { outcome: 'miss' }), 12)).toEqual({ e2: T })
	})

	it('#39 pawn diagonal onto an uncertain enemy: capture or miss', () => {
		expect(outs(W7, 'd3-e4')).toEqual([{ key: 'miss', weight: 12582912 }, { key: 'capture', weight: 4194304 }])
		expect(locOf(play(W7, 'd3-e4', { outcome: 'miss' }), 23)).toEqual({ h6: 11184811, d5: 5592405 })
	})

	it('#40 a quantum move over the budget falls back to a roll', () => {
		const m = E.findMove(W8, 'h1-h8')
		expect([m.resolution, m.fallback, m.measured]).toEqual(['rolled', true, true])
	})
})

describe('edge cases 41–60', () => {
	it('#41 the opponent can only lower your budget', () => {
		for (const m of E.generateMoves(play(W8, 'e1-f1'))) {
			for (const o of E.getOutcomes(play(W8, 'e1-f1'), m)) {
				expect(E.budget(o.state, 'w')).toBeLessThanOrEqual(8)
			}
		}
	})

	it('#42 pawn diagonal onto an empty or own square: nothing_to_capture', () => {
		expect(why(START, 'e2-d3')).toBe('nothing_to_capture')
		expect(why(S('4k3/8/8/8/8/3N4/4P3/4K3 w - - 0 1'), 'e2-d3')).toBe('nothing_to_capture')
	})

	it('#43 en passant is always certain', () => {
		const s = play(S('4k3/8/8/8/3p2n1/8/4P3/4K3 w - - 0 1', ['g4-e3|h6']), 'e2-e4', { outcome: 'move' })
		expect(res(s, 'd4-e3')).toBe('certain')
		expect(E.applyMove(s, 'd4-e3', { u: 1 }).measurement).toBe(null)
	})

	it('#44 promotion push onto a possibly occupied square: rolled, type only on move', () => {
		const s = S('7k/4P1n1/8/8/8/8/8/K7 w - - 0 1', ['g7-e8|f5'])
		const codes = ['e7-e8=Q', 'e7-e8=R', 'e7-e8=B', 'e7-e8=N']
		for (const c of codes) {
			expect(outs(s, c)).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'move', weight: 8388608 }])
		}
		expect(E.legalCodes(s).filter((c) => c.startsWith('e7-e8'))).toEqual(codes)
		expect(play(s, 'e7-e8=Q', { outcome: 'miss' }).types[8]).toBe('p')
		expect(play(s, 'e7-e8=N', { outcome: 'move' }).types[8]).toBe('n')
	})

	it('#45 a promotion capture of the king sets the type, then E1', () => {
		const r = play(S('3k4/4P3/8/8/8/8/8/K7 w - - 0 1'), 'e7-d8=Q')
		expect(r.types[8]).toBe('q')
		expect(r.result).toEqual({ result: '1-0', reason: 'king_captured' })
	})

	it('#46 king onto a square possibly holding an own piece: rolled move/miss, castling kept on miss', () => {
		const s = S('4k3/8/8/8/8/8/8/4K1NR w K - 0 1', ['g1-e2|f3'])
		expect(outs(s, 'e1-e2')).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'move', weight: 8388608 }])
		const miss = play(s, 'e1-e2', { outcome: 'miss' })
		expect(locOf(miss, 7)).toEqual({ e2: T })
		expect(miss.castling).toBe('K')
	})

	it('#47 king onto a square possibly holding an enemy: rolled move/capture, the king arrives', () => {
		const s = S('4k3/8/8/8/8/5n2/8/4K3 w - - 0 1', ['f3-d2|h2'])
		expect(outs(s, 'e1-d2')).toEqual([{ key: 'move', weight: 8388608 }, { key: 'capture', weight: 8388608 }])
		for (const k of ['move', 'capture']) {
			expect(locOf(play(s, 'e1-d2', { outcome: k }), 0)).toEqual({ d2: T })
		}
	})

	it('#48 a ghost attacker ½ against a classical king', () => {
		expect(outs(W6, 'h5-h8')).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'capture', weight: 8388608 }])
		expect(locOf(play(W6, 'h5-h8', { outcome: 'miss' }), 1)).toEqual({ d4: T })
	})

	it('#49 a king captures a king', () => {
		expect(play(S('8/8/8/8/8/8/3k4/4K3 w - - 0 1'), 'e1-d2').result).toEqual({ result: '1-0', reason: 'king_captured' })
	})

	it('#50 castling with a possibly occupied square: castle_blocked', () => {
		const s = S('4k3/8/8/8/8/6n1/8/4K2R w K - 0 1', ['g3-f1|h5'])
		expect(s.castling).toBe('K')
		expect(why(s, 'e1-g1')).toBe('castle_blocked')
		expect(why(s, 'O-O')).toBe('castle_blocked')
		expect(why(s, 'O-O-O')).toBe('castle_no_right')
	})

	it('#51 castling through attack is legal and certain', () => {
		const s = S('4kr2/8/8/8/8/8/8/4K2R w K - 0 1')
		expect(res(s, 'O-O')).toBe('certain')
		const r = play(s, 'e1-g1')
		expect(locOf(r, 0)).toEqual({ g1: T })
		expect(locOf(r, 3)).toEqual({ f1: T })
		expect(r.castling).toBe('-')
		expect(E.moveNotation(s, 'e1-g1')).toBe('O-O')
	})

	it('#52 a rook split and merged home does not regain the right', () => {
		const s = S('4k3/8/8/8/8/8/8/4K2R w K - 0 1')
		const s2 = play(play(play(s, 'h1-h3|h5'), 'e8-d8'), 'h3|h5-h1')
		expect(s2.castling).toBe('-')
	})

	it('#53 the castling rook is captured', () => {
		const s = S('4k3/8/8/8/8/8/1b6/R3K3 b Q - 0 1')
		expect(s.castling).toBe('Q')
		expect(play(s, 'b2-a1').castling).toBe('-')
	})

	it('#54 a rolled-class move with one key is certain', () => {
		const r = E.applyMove(START, 'e2-e4', { u: 1 })
		expect(r.move.resolution).toBe('certain')
		expect(r.measurement).toBe(null)
	})

	it('#55 identical worlds merge without a rescale', () => {
		const s = S('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', ['a1-a3|a5'])
		expect(W(play(s, 'a3-a5'))).toEqual([['....A...........................C...........................a...', T]])
	})

	it('#56 a move possible only in a weight-1 world is legal and shown as 1%', () => {
		const s = craft([
			[{ e1: 'A', e8: 'a', f3: 'H' }, 1],
			[{ e1: 'A', e8: 'a', h3: 'H' }, T - 1],
		])
		const m = E.findMove(s, 'f3-e5')
		expect(m.outcomes).toEqual([{ key: 'miss', weight: T - 1 }, { key: 'move', weight: 1 }])
		expect(E.pct(m.happenWeight)).toBe(1)
		expect(E.pct(T - 1)).toBe(99)
	})

	it('#57 bare kings, not adjacent: draw', () => {
		expect(play(S('4k3/8/8/8/8/8/3n4/4K3 w - - 0 1'), 'e1-d2').result).toEqual({ result: '1/2-1/2', reason: 'bare_kings' })
	})

	it('#58 a king capture on ply 1200 is king_captured', () => {
		const s = withFields(S('8/8/8/8/8/8/3k4/4K3 w - - 0 1'), { ply: 1199 })
		const r = play(s, 'e1-d2')
		expect(r.ply).toBe(1200)
		expect(r.result).toEqual({ result: '1-0', reason: 'king_captured' })
	})

	it('#59 a split/merge cycle: the third occurrence is a draw', () => {
		const cycle = ['g1-f3|h3', 'b8-a6|c6', 'f3|h3-g1', 'a6|c6-b8']
		let s = START
		for (const c of cycle) {
			s = play(s, c)
		}
		expect(s.result).toBe(null)
		expect(H(s)).toBe(E.START_HASH)
		for (const c of cycle) {
			s = play(s, c)
		}
		expect(s.ply).toBe(8)
		expect(s.result).toEqual({ result: '1/2-1/2', reason: 'repetition' })
	})

	it('#60 no legal move: draw', () => {
		const s = S('8/8/8/8/8/8/pp1p4/krb1K3 w - - 0 1')
		const r = play(s, 'e1-d1')
		expect(r.result).toEqual({ result: '1/2-1/2', reason: 'no_moves' })
	})
})

describe('edge cases 61–86', () => {
	it('#61 a finished game', () => {
		const done = play(W14, 'a1-a8')
		expect(E.generateMoves(done)).toEqual([])
		expect(() => E.applyMove(done, 'g8-f8')).toThrowError(expect.objectContaining({ name: 'IllegalMoveError', code: 'game_over' }))
		expect(E.hasAnyLegalMove(done)).toBe(false)
		expect(E.findMove(done, 'g8-f8')).toBe(null)
	})

	it('#62/#63 roll memo identities', () => {
		const s = S('7k/4P1n1/8/8/8/8/8/K7 w - - 0 1', ['g7-e8|f5'])
		expect(E.rollIdentity(s, 'e7-e8=Q')).toBe(E.rollIdentity(s, 'e7-e8=N'))
		expect(E.rollIdentity(s, 'e7-e8=Q')).toBe('0/' + E.positionHash(s) + '/e7-e8')
		expect(E.rollIdentity(W2, 'c1-h6')).not.toBe(E.rollIdentity(W2, 'c1-g5'))
		expect(E.rollIdentity(withFields(W2, { ply: 4 }), 'c1-h6')).not.toBe(E.rollIdentity(W2, 'c1-h6'))
	})

	it('#64 a forced outcome that is not an outcome', () => {
		expect(() => E.applyMove(W2, 'c1-h6', { outcome: 'miss' })).toThrowError(expect.objectContaining({ name: 'EngineArgumentError' }))
		expect(() => E.applyMove(W6, 'd4|h5-h8', { outcome: 'miss' })).not.toThrow()
		expect(() => E.applyMove(START, 'e2-e4', { outcome: 'bogus', u: -5, rng: 7 })).not.toThrow()
	})

	it('#65 blocked branching projections count (W13)', () => {
		const s = S('4k3/8/8/8/8/6n1/8/KNBR4 w - - 0 1', ['g3-f1|h5', 'b1-a3|c3', 'c1-b2|e3'])
		expect(why(s, 'd1-h1|d5')).toBe('budget_full')
	})

	it('#66 a roll just below a boundary', () => {
		const r = E.applyMove(W2, 'c1-h6', { u: 8388607 })
		expect(r.measurement.key).toBe('move')
		expect(E.rollDisplay(r.measurement)).toContain('rolled 0.4999 → Moved')
	})

	it('#67 a rolled prelude move needs @key', () => {
		expect(() => S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6', 'c1-h6'])).toThrowError(expect.objectContaining({ code: 'prelude_needs_outcome' }))
		expect(() => S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6', 'c1-h6@miss'])).toThrowError(expect.objectContaining({ code: 'prelude_bad_outcome' }))
		expect(() => S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6@move'])).toThrowError(expect.objectContaining({ code: 'prelude_outcome_unused' }))
	})

	it('#68 prelude moves run with ep "-"; the FEN ep survives', () => {
		const s = S('4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1', ['e2-e4'])
		expect(s.ep).toBe('-')
		expect(locOf(s, 12)).toEqual({ e4: T })
		const g = S('4k3/8/8/8/3pP3/8/8/4K1N1 b - e3 0 1', ['g1-f3|h3'])
		expect(g.ep).toBe('e3')
	})

	it('#69 two queens compete for an id', () => {
		const s = S('4k3/8/8/8/8/8/8/2QQK3 w - - 0 1')
		expect(locOf(s, 1)).toEqual({ d1: T })
		expect(locOf(s, 8)).toEqual({ c1: T })
		expect(s.types[8]).toBe('q')
	})

	it('#70 a double push to the h-file does not see the a-file', () => {
		expect(play(S('4k3/8/8/p7/8/8/7P/4K3 w - - 0 1'), 'h2-h4').ep).toBe('-')
	})

	it('#71 index order everywhere', () => {
		const s = S('4k1n1/8/8/8/7R/3P4/8/4K3 w - - 0 1', ['g8-f6|h6', 'f6-d5|e4', 'd3-e4@miss'])
		expect(E.findMove(s, 'h4-a4|h3').code).toBe('h4-h3|a4')
	})

	it('#72 chain entries without a roll or a key', () => {
		const c0 = E.chainStart(42, 'alice', 'bob', 1790000000)
		const r = E.applyMove(START, 'e2-e4')
		const json = E.serializeState(r.state)
		expect(E.chainNext(c0, 0, 'e2-e4', null, null, r.state)).toBe(E.sha256hex(c0 + '|0|e2-e4|-|-|' + E.sha256hex(json)))
		const f = E.applyMove(W2, 'c1-h6', { outcome: 'capture' })
		expect(f.measurement.u).toBe(null)
		expect(E.chainNext(c0, 0, 'c1-h6', f.measurement.u, f.measurement.key, f.state))
			.toBe(E.sha256hex(c0 + '|0|c1-h6|-|capture|' + E.sha256hex(E.serializeState(f.state))))
		expect(() => E.chainStart(42.5, 'a', 'b', 1)).toThrow()
		expect(() => E.chainStart(42, 'a', 'b', '1790000000')).toThrow()
	})

	it('#73 a king off its home square is not castling', () => {
		expect(why(S('8/8/8/8/8/8/8/4k2K b - - 0 1'), 'e1-g1')).toBe('unreachable')
	})

	it('#74 castling by the side not to move', () => {
		expect(why(START, { type: 'standard', from: [60], to: [62] })).toBe('not_your_piece')
		expect(why(play(START, 'e2-e4'), 'e1-g1')).toBe('not_your_piece')
	})

	it('#75 Measure of an empty square', () => {
		expect(why(START, '?e4')).toBe('no_piece')
		expect(why(START, { type: 'measure', from: [28], to: [] })).toBe('no_piece')
	})

	it('#76 promo on a split, merge or Measure: malformed', () => {
		expect(why(START, { type: 'split', from: [6], to: [21, 23], promo: 'q' })).toBe('malformed')
		expect(why(START, { type: 'merge', from: [21, 23], to: [6], promo: 'q' })).toBe('malformed')
		expect(why(START, { type: 'measure', from: [6], to: [], promo: 'q' })).toBe('malformed')
	})

	it('#77 a piece letter that does not match', () => {
		expect(why(W2, 'Nc1-h6')).toBe('piece_mismatch')
		expect(E.findMove(W2, 'Nc1-h6')).toBe(null)
		expect(E.findMove(W2, 'Bc1-h6').code).toBe('c1-h6')
	})

	it('#78 the opponent cannot deny your splits with a weight-1 world', () => {
		const s = craft([
			[{ e1: 'A', a1: 'C', g1: 'H', e8: 'a', a2: 'g' }, T - 1],
			[{ e1: 'A', a1: 'C', g1: 'H', e8: 'a', h5: 'g' }, 1],
		])
		expect(E.isLegal(s, 'g1-f3|h3')).toBe(true)
		expect(E.isLegal(s, 'a1-b1|a3')).toBe(true)
	})

	it('#79 annotated notation parses', () => {
		expect(E.parseMoveCode('Qd4|h5xh8 #')).toEqual({ type: 'merge', from: [27, 39], to: [63], letter: 'Q' })
		expect(E.parseMoveCode('?Na4 {c4 50%}')).toEqual({ type: 'measure', from: [24], to: [], letter: 'N' })
		expect(E.parseMoveCode('Nf3xe5 {capture 25%} #')).toEqual({ type: 'standard', from: [21], to: [36], letter: 'N' })
		expect(E.parseMoveCode('N?a4')).toBe(null)
	})

	it('#80 a 25% king shot', () => {
		const s = S('k7/8/8/8/8/8/8/R3K3 w - - 0 1', ['a1-a3|b1', 'a3-a4|c3'])
		expect(locOf(s, 2)).toEqual({ b1: 8388608, a4: 4194304, c3: 4194304 })
		expect(E.kingDanger(s, 'b')).toBe(4194304)
		expect(E.pct(E.kingDanger(s, 'b'))).toBe(25)
		expect(outs(s, 'a4-a8')).toEqual([{ key: 'miss', weight: 12582912 }, { key: 'capture', weight: 4194304 }])
		const b = play(s, 'e1-f1')
		expect(E.isLegal(b, 'a8-a7')).toBe(true)
		expect(E.moveRisk(b, 'a8-b8')).toBe(0.5)
	})

	it('#81 king_trapped (W14)', () => {
		expect(play(W14, 'a1-a8').result).toEqual({ result: '1-0', reason: 'king_trapped' })
	})

	it('#82 a capture that leaves adjacent bare kings', () => {
		const r = play(S('8/8/4k3/3n4/4K3/8/8/8 w - - 0 1'), 'e4-d5')
		expect(r.result).toBe(null)
		expect(E.kingDanger(r, 'w')).toBe(T)
	})

	it('#83 fifty moves and repetition yield to a pending king capture', () => {
		const s = S('8/8/8/8/8/8/3k4/4K2R w - - 99 1')
		const r = play(s, 'h1-h2')
		expect(r.halfmove).toBe(100)
		expect(r.result).toBe(null)
		expect(E.validateState(r).ok).toBe(true)
		expect(play(r, 'd2-e1').result).toEqual({ result: '0-1', reason: 'king_captured' })
		expect(play(S('8/8/8/8/k7/8/8/4K2R w - - 99 1'), 'h1-h2').result).toEqual({ result: '1/2-1/2', reason: 'fifty_moves' })
		let p = S('4r2k/8/8/8/8/8/8/1N2K3 b - - 0 1')
		const seq = ['h8-g8', 'b1-c3', 'g8-h8', 'c3-b1', 'h8-g8', 'b1-c3', 'g8-h8', 'c3-b1']
		for (const c of seq) {
			p = play(p, c)
			expect(p.result).toBe(null)
		}
		expect(p.history.filter((h) => h === H(p)).length).toBe(3)
		expect(play(p, 'h8-g8').result).toEqual({ result: '1/2-1/2', reason: 'repetition' })
	})

	it('#84 a solid attacker whose lane crosses a ghost can miss', () => {
		const s = S('4k3/8/8/8/6n1/8/8/2B1K3 w - - 0 1', ['g4-e3|h6'])
		expect(outs(s, 'c1-h6')).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'capture', weight: 8388608 }])
	})

	it('#85 a reply that may capture the enemy king is an escape', () => {
		const s = S('6k1/5ppp/8/6n1/8/8/8/R3K3 w - - 0 1', ['g5-f3|h3'])
		const r = play(s, 'a1-a8')
		expect(E.kingDanger(r, 'b')).toBe(T)
		expect(r.result).toBe(null)
		expect(outs(r, 'f3-e1')).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'capture', weight: 8388608 }])
	})

	it('#85 a certain king capture is an escape even if the own king stays attacked', () => {
		const s = S('rr6/7k/8/8/8/8/8/K6R b - - 0 1')
		const r = play(s, 'h7-h8')
		expect(E.kingDanger(r, 'w')).toBe(T)
		expect(E.findMove(r, 'h1-h8').resolution).toBe('certain')
		expect(E.kingTrapped(r)).toBe(false)
		expect(r.result).toBe(null)
		expect(E.moveRisk(r, 'h1-h8')).toBe(0)
		expect(E.moveRisk(r, 'h1-h2')).toBe(1)
	})

	it('#86 the trapping move at ply 1199 is not a trap', () => {
		const s = withFields(W14, { ply: 1198 })
		const r = play(s, 'a1-a8')
		expect(r.ply).toBe(1199)
		expect(r.result).toBe(null)
		expect(play(r, 'g8-f8').result).toEqual({ result: '1/2-1/2', reason: 'max_ply' })
	})
})
