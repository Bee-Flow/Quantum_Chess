/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Canonical move codes (§4.1) and the lenient parser (§4.12).
 *
 * Section numbers (§) and appendices refer to docs/engine-rules.md.
 */

import { describe, expect, it } from 'vitest'
import { E, S } from './helpers.js'

const START = E.initialState()

describe('lenient parser', () => {
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

describe('canonical codes', () => {
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
