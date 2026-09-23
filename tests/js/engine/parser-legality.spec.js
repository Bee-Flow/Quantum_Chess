/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * ENGINE-RULES §4.1, §4.10–§4.12, §5.7: codes, the lenient parser, move order, whyIllegal and notation.
 */

import { describe, expect, it } from 'vitest'
import { E, play, S, T } from './helpers.js'

const START = E.initialState()

describe('§4.12 parser fixtures', () => {
	const cases = [
		['Qd4|h5xh8 #', { type: 'merge', from: [27, 39], to: [63], letter: 'Q' }],
		['?Na4 {c4 50%}', { type: 'measure', from: [24], to: [], letter: 'N' }],
		['Nf3xe5 {capture 25%} #', { type: 'standard', from: [21], to: [36], letter: 'N' }],
		['Bc1xh6 {capture 50%}', { type: 'standard', from: [2], to: [47], letter: 'B' }],
		['g1-h3|f3', { type: 'split', from: [6], to: [21, 23] }],
		['g1f3/h3', { type: 'split', from: [6], to: [21, 23] }],
		['G1-F3,H3', { type: 'split', from: [6], to: [21, 23] }],
		['h3/f3g1', { type: 'merge', from: [21, 23], to: [6] }],
		['E2E4', { type: 'standard', from: [12], to: [28] }],
		['e2:e4', { type: 'standard', from: [12], to: [28] }],
		['  e2-e4+ \t', { type: 'standard', from: [12], to: [28] }],
		['\r\ne2-e4+\n', { type: 'standard', from: [12], to: [28] }],
		['e7e8q', { type: 'standard', from: [52], to: [60], promo: 'q' }],
		['e7-e8=Q', { type: 'standard', from: [52], to: [60], promo: 'q' }],
		['e7-e8=q!?', { type: 'standard', from: [52], to: [60], promo: 'q' }],
		['measure A4', { type: 'measure', from: [24], to: [] }],
		['MeAsUrE\t \ta4', { type: 'measure', from: [24], to: [] }],
		['?a4', { type: 'measure', from: [24], to: [] }],
		['o-o-o', { castle: 'O-O-O' }],
		['0-0-0', { castle: 'O-O-O' }],
		['O-O', { castle: 'O-O' }],
		['O-o-0+', { castle: 'O-O-O' }],
		['B1-c3', { type: 'standard', from: [1], to: [18] }],
		['Bb1-c3', { type: 'standard', from: [1], to: [18], letter: 'B' }],
		['e2xe4', { type: 'standard', from: [12], to: [28] }],
		['e2Xe4', { type: 'standard', from: [12], to: [28] }],
		['Ke1-g1', { type: 'standard', from: [4], to: [6], letter: 'K' }],
		['e2-e4 {anything at all', { type: 'standard', from: [12], to: [28] }],
	]
	for (const [input, expected] of cases) {
		it(JSON.stringify(input), () => {
			expect(E.parseMoveCode(input)).toEqual(expected)
		})
	}

	const rejected = [
		'N?a4',
		'e2 e4',
		'e2-e4-e5',
		'Pe2-e4',
		'e9-e4',
		'',
		'   ',
		'{e2-e4}',
		'e2-',
		'e2-e4=',
		'e2-e4=K',
		'e2-e4=P',
		'measure',
		'measurea4',
		'measure a4 b5',
		'?',
		'??a4',
		'O-O-O-O',
		'O--O',
		'O-O-',
		'K?a4',
		'k e1-e2',
		'ke1-e2',
		'e2|e4',
		'e2-e4|',
		'e2-e4|e5|e6',
		'g1-f3|h3=Q',
		'a1-a2 x',
		'e2–e4',
		'e2 e4',
		'ｅ2-e4',
		'i2-i4',
		'e0-e1',
	]
	for (const input of rejected) {
		it('rejects ' + JSON.stringify(input), () => {
			expect(E.parseMoveCode(input)).toBe(null)
		})
	}

	it('rejects non-strings', () => {
		for (const x of [null, undefined, 42, {}, [], true]) {
			expect(E.parseMoveCode(x)).toBe(null)
		}
	})

	it('equal pair members parse but are malformed moves', () => {
		expect(E.parseMoveCode('g1-f3|f3')).toEqual({ type: 'split', from: [6], to: [21, 21] })
		expect(E.whyIllegal(START, 'g1-f3|f3')).toBe('malformed')
	})
})

describe('§4.1 canonical codes', () => {
	it('moveCode', () => {
		expect(E.moveCode({ type: 'standard', from: [12], to: [28] })).toBe('e2-e4')
		expect(E.moveCode({ type: 'standard', from: [52], to: [60], promo: 'q' })).toBe('e7-e8=Q')
		expect(E.moveCode({ type: 'split', from: [6], to: [23, 21] })).toBe('g1-f3|h3')
		expect(E.moveCode({ type: 'merge', from: [23, 21], to: [6] })).toBe('f3|h3-g1')
		expect(E.moveCode({ type: 'measure', from: [24], to: [] })).toBe('?a4')
		expect(E.moveCode({ type: 'split', from: [31], to: [24, 23] })).toBe('h4-h3|a4')
		expect(E.stripPromo('e7-e8=N')).toBe('e7-e8')
		expect(E.stripPromo('g1-f3|h3')).toBe('g1-f3|h3')
	})

	it('every generated code is canonical and parses back to its move', () => {
		for (const s of [START, S('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), S('7k/4P1n1/8/8/8/8/8/K7 w - - 0 1', ['g7-e8|f5'])]) {
			for (const m of E.generateMoves(s)) {
				expect(E.moveCode(m)).toBe(m.code)
				const p = E.parseMoveCode(m.code)
				expect({ type: p.type, from: p.from, to: p.to, promo: p.promo }).toEqual({ type: m.type, from: m.from, to: m.to, promo: m.promo })
				expect(E.findMove(s, m.code)).toBe(m)
			}
		}
	})

	it('squares', () => {
		expect(E.squareName(28)).toBe('e4')
		expect(E.squareIndex('e4')).toBe(28)
		expect(E.squareIndex('H8')).toBe(63)
		expect(E.squareIndex('i1')).toBe(-1)
		expect(E.squareIndex(28)).toBe(-1)
		expect(E.letterOf(0)).toBe('A')
		expect(E.letterOf(31)).toBe('p')
		expect(E.idOfCode('p'.charCodeAt(0))).toBe(31)
		expect(E.idOfCode('.'.charCodeAt(0))).toBe(-1)
	})
})

describe('§4.10 the legal move list', () => {
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

describe('§4.11 whyIllegal: every code and the check order', () => {
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

describe('§5.7 notation', () => {
	it('examples', () => {
		const w2 = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		expect(E.moveNotation(w2, 'c1-h6', { key: 'move', u: 1, outcomes: [] })).toBe('Bc1-h6 {move 50%}')
		expect(E.moveNotation(START, 'g1-f3|h3')).toBe('Ng1-f3|h3')
		expect(E.moveNotation(START, 'e2-e4')).toBe('e2-e4')
		const w4 = play(play(S('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), 'b6-a4|c4'), 'a1-a8')
		expect(E.moveNotation(w4, '?a4', { key: 'c4', u: 9000000 })).toBe('?Na4 {c4 50%}')
		const ks = S('3k4/4P3/8/8/8/8/8/K7 w - - 0 1')
		expect(E.moveNotation(ks, 'e7-d8=Q')).toBe('e7xd8=Q #')
		expect(() => E.moveNotation(w2, 'c1-h6')).toThrowError(expect.objectContaining({ name: 'EngineArgumentError' }))
		expect(() => E.moveNotation(w2, 'c1-c2')).toThrowError(expect.objectContaining({ name: 'IllegalMoveError' }))
	})

	it('every §10 notation string parses back to its move', () => {
		const pairs = [
			['Bc1xh6 {capture 50%}', 'c1-h6'],
			['d3-e4 {miss 75%}', 'd3-e4'],
			['?Na4 {c4 50%}', '?a4'],
			['Qd4|h5xh8 #', 'd4|h5-h8'],
			['Ng1-f3|h3', 'g1-f3|h3'],
			['Nf3xe5 {capture 25%} #', 'f3-e5'],
			['Ra1-a8 #', 'a1-a8'],
			['O-O', null],
			['e7-e8=Q', 'e7-e8=Q'],
		]
		for (const [text, code] of pairs) {
			const p = E.parseMoveCode(text)
			if (code === null) {
				expect(p).toEqual({ castle: 'O-O' })
			} else {
				expect(E.moveCode(p)).toBe(code)
			}
		}
	})
})
