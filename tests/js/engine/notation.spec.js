/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Move notation (§5.7) and its round trip through the lenient parser.
 *
 * Section numbers (§) and appendices refer to docs/engine-rules.md.
 */

import { describe, expect, it } from 'vitest'
import { E, play, S } from './helpers.js'

const START = E.initialState()

describe('notation', () => {
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

	it('every worked-example notation string parses back to its move', () => {
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
