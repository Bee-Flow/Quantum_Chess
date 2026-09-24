/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The legal move list (§4.10) and whyIllegal (§4.11): order, every reason code and the check order.
 *
 * Section numbers (§) and appendices refer to docs/engine-rules.md.
 */

import { describe, expect, it } from 'vitest'
import { E, play, S, T } from './helpers.js'

const START = E.initialState()

describe('the legal move list', () => {
	it('move order example', () => {
		const s = S('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1')
		expect(E.legalCodes(s)).toEqual(['e1-d1', 'e1-f1', 'e1-d2', 'e1-e2', 'e1-f2', 'g1-e2', 'g1-f3', 'g1-h3', 'g1-e2|f3', 'g1-e2|h3', 'g1-f3|h3'])
	})

	it('LegalMove shape and key order', () => {
		const s = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		const m = E.findMove(s, 'c1-h6')
		expect(Object.keys(m)).toEqual(['type', 'from', 'to', 'code', 'piece', 'resolution', 'measured', 'fallback', 'capture', 'happenWeight', 'outcomes', 'successProbability'])
		const p = E.findMove(S('7k/4P1n1/8/8/8/8/8/K7 w - - 0 1', ['g7-e8|f5']), 'e7-e8=R')
		expect(Object.keys(p).slice(0, 5)).toEqual(['type', 'from', 'to', 'promo', 'code'])
		expect(p.promo).toBe('r')
		const split = E.findMove(START, 'g1-f3|h3')
		expect(split).toMatchObject({ resolution: 'quantum', measured: false, capture: false, happenWeight: T, outcomes: [], successProbability: 1 })
		const castle = E.findMove(S('4k3/8/8/8/8/8/8/4K2R w K - 0 1'), 'O-O')
		expect(castle).toMatchObject({ code: 'e1-g1', resolution: 'certain', outcomes: [], happenWeight: T })
	})

	it('generateMoves returns a fresh array of shared moves', () => {
		const a = E.generateMoves(START)
		const b = E.generateMoves(START)
		expect(a).not.toBe(b)
		expect(a[0]).toBe(b[0])
		a.pop()
		expect(E.generateMoves(START).length).toBe(22)
	})

	it('findMove accepts objects, LegalMoves, codes and castling markers; Measure by any part', () => {
		const s = play(S('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), 'b6-a4|c4')
		const s2 = play(s, 'e1-d1')
		expect(E.findMove(s2, { type: 'measure', from: [26], to: [] }).code).toBe('?a4')
		expect(E.findMove(s2, 'measure c4').code).toBe('?a4')
		expect(E.findMove(s2, '?Nc4').code).toBe('?a4')
		expect(E.findMove(s2, '?Bc4')).toBe(null)
		expect(E.findMove(START, { type: 'split', from: [6], to: [23, 21] }).code).toBe('g1-f3|h3')
		expect(E.findMove(START, { type: 'standard', from: [12], to: [28], promo: null }).code).toBe('e2-e4')
		expect(E.findMove(START, 'O-O')).toBe(null)
		const c = S('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1')
		expect(E.findMove(c, 'O-O-O').code).toBe('e8-c8')
		expect(E.findMove(c, '0-0').code).toBe('e8-g8')
	})
})

describe('whyIllegal: every code and the check order', () => {
	const w2 = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])

	it('game_over comes first for well-formed input; unparsable strings are malformed', () => {
		const done = play(S('8/8/8/8/8/8/3k4/4K3 w - - 0 1'), 'e1-d2')
		expect(E.whyIllegal(done, 'e8-e7')).toBe('game_over')
		expect(E.whyIllegal(done, { type: 'bogus' })).toBe('game_over')
		expect(E.whyIllegal(done, 'zz')).toBe('malformed')
	})

	it('malformed shapes', () => {
		const bad = [
			null,
			undefined,
			42,
			'e2',
			[],
			{},
			{ type: 'standard' },
			{ type: 'standard', from: [12], to: [] },
			{ type: 'standard', from: 12, to: 28 },
			{ type: 'standard', from: [12.5], to: [28] },
			{ type: 'standard', from: [12], to: [64] },
			{ type: 'standard', from: [-1], to: [28] },
			{ type: 'standard', from: ['12'], to: [28] },
			{ type: 'split', from: [6], to: [21] },
			{ type: 'split', from: [6], to: [21, 21] },
			{ type: 'merge', from: [21], to: [6] },
			{ type: 'merge', from: [21, 21], to: [6] },
			{ type: 'measure', from: [6], to: [1] },
			{ type: 'measure', from: [], to: [] },
			{ type: 'standard', from: [12], to: [28], promo: 'k' },
			{ type: 'standard', from: [12], to: [28], promo: 'Q' },
			{ type: 'castle', from: [4], to: [6] },
			{ castle: 'O-O' },
			{ type: 'standard', from: [NaN], to: [28] },
			{ type: 'standard', from: [Infinity], to: [28] },
		]
		for (const m of bad) {
			expect(E.whyIllegal(START, m)).toBe('malformed')
		}
		const hostile = {
			get type() {
				throw new Error('boom')
			},
		}
		expect(E.whyIllegal(START, hostile)).toBe('malformed')
		const trap = new Proxy({}, {
			get() {
				throw new Error('x')
			},
		})
		expect(E.whyIllegal(START, trap)).toBe('malformed')
	})

	it('codes 3–21', () => {
		expect(E.whyIllegal(START, 'e4-e5')).toBe('no_piece')
		expect(E.whyIllegal(START, 'e7-e5')).toBe('not_your_piece')
		expect(E.whyIllegal(START, 'Ne2-e4')).toBe('piece_mismatch')
		expect(E.whyIllegal(START, 'Kg1-f3')).toBe('piece_mismatch')
		expect(E.whyIllegal(START, 'b1|g1-e2')).toBe('merge_mismatch')
		expect(E.whyIllegal(START, 'b1|e4-d2')).toBe('merge_mismatch')
		expect(E.whyIllegal(START, 'e2-e3|e4')).toBe('cannot_split')
		expect(E.whyIllegal(START, '?b1')).toBe('not_superposed')
		const castle = S('4k3/8/8/8/8/8/8/R3K1NR w Q - 0 1')
		expect(E.whyIllegal(castle, 'e1-g1')).toBe('castle_no_right')
		expect(E.whyIllegal(S('4k3/8/8/8/8/8/8/R3K1NR w KQ - 0 1'), 'e1-g1')).toBe('castle_blocked')
		expect(E.whyIllegal(castle, { type: 'standard', from: [4], to: [2], promo: 'q' })).toBe('promotion_invalid')
		expect(E.whyIllegal(START, 'g1-g3')).toBe('unreachable')
		expect(E.whyIllegal(START, 'e2-e5')).toBe('unreachable')
		expect(E.whyIllegal(START, 'e2-e1')).toBe('unreachable')
		expect(E.whyIllegal(START, 'b1-a3|b3')).toBe('unreachable')
		const promo = S('7k/4P3/8/8/8/8/8/K7 w - - 0 1')
		expect(E.whyIllegal(promo, 'e7-e8')).toBe('promotion_required')
		expect(E.whyIllegal(START, 'e2-e4=Q')).toBe('promotion_invalid')
		expect(E.whyIllegal(START, 'g1-f3=Q')).toBe('promotion_invalid')
		expect(E.whyIllegal(START, 'e2-f3')).toBe('nothing_to_capture')
		expect(E.whyIllegal(START, 'c1-e3')).toBe('blocked')
		expect(E.whyIllegal(S('4k3/8/8/8/8/4n3/4P3/4K3 w - - 0 1'), 'e2-e3')).toBe('blocked')
		expect(E.whyIllegal(S('4k3/8/8/8/8/4n3/4P3/4K3 w - - 0 1'), 'e2-e4')).toBe('blocked')
		expect(E.whyIllegal(START, 'g1-e2')).toBe('own_piece')
		expect(E.whyIllegal(START, 'b1-a3|d2')).toBe('split_target_occupied')
		expect(E.whyIllegal(START, 'a1-a3|a5')).toBe('split_blocked')
		const s3 = S('4k3/8/8/8/8/2P5/8/R3K3 w - - 0 1', ['a1-a3|c1'])
		expect(E.whyIllegal(s3, 'a3|c1-c3')).toBe('merge_target_own')
		expect(E.whyIllegal(S('4k3/8/8/8/8/1P6/8/R3K3 w - - 0 1', ['a1-a3|c1']), 'a3|c1-c3')).toBe('merge_part_stuck')
		expect(E.whyIllegal(w2, 'c1-h6')).toBe(null)
		expect(E.isLegal(w2, 'c1-h6')).toBe(true)
	})

	it('every reason code is listed with its check number', () => {
		for (const code of E.ILLEGAL_REASONS) {
			expect(E.ILLEGAL_REASON_CHECK[code]).toBeGreaterThan(0)
		}
	})

	it('a castling marker resolves for the side to move (a rook on e1 plays e1-g1)', () => {
		const s = S('4k3/8/8/8/8/8/8/K3R3 w - - 0 1')
		expect(E.findMove(s, 'O-O').code).toBe('e1-g1')
		expect(E.whyIllegal(S('4k3/8/8/8/8/8/8/K7 w - - 0 1'), 'O-O')).toBe('no_piece')
	})
})
