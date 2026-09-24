/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Setup positions (Appendix A): FEN, prelude and state errors, and the certain FEN.
 *
 * Section numbers (§) and appendices refer to docs/engine-rules.md.
 */

import { describe, expect, it } from 'vitest'
import { E, S } from './helpers.js'

describe('setupPosition errors', () => {
	const err = (fn) => {
		try {
			fn()
		} catch (e) {
			return [e.name, e.code, e.detail]
		}
		return null
	}

	it('FEN errors', () => {
		for (const fen of [
			'',
			'x',
			'8/8/8 w - - 0 1',
			'9/8/8/8/8/8/8/8 w - - 0 1',
			'4k3/8/8/8/8/8/8/4K2 w - - 0 1',
			'4k3/8/8/8/8/8/8/4K3 x - - 0 1',
			'4k3/8/8/8/8/8/8/4K3 w KK - 0 1',
			'4k3/8/8/8/8/8/8/4K3 w - e4 0 1',
			'4k3/8/8/8/8/8/8/4K3 w - - 100 1',
			'4k3/8/8/8/8/8/8/4K3 w - - 0 0',
			'4k3/8/8/8/8/8/8/4X3 w - - 0 1',
			'4k3/8/8/8/8/8/8/4K3 w - - -1 1',
			42,
		]) {
			expect(err(() => E.setupPosition({ fen }))[1]).toBe('bad_fen')
		}
		// halfmove and fullmove may be omitted (0 and 1)
		const short = E.setupPosition({ fen: '4k3/8/8/8/8/8/8/4K3 w - -' })
		expect([short.halfmove, short.fullmove]).toEqual([0, 1])
	})

	it('king count, too many pieces, invalid state', () => {
		expect(err(() => E.setupPosition({ fen: '8/8/8/8/8/8/8/4K3 w - - 0 1' }))[1]).toBe('king_count')
		expect(err(() => E.setupPosition({ fen: '4k3/8/8/8/8/8/8/3KK3 w - - 0 1' }))[1]).toBe('king_count')
		expect(err(() => E.setupPosition({ fen: '4k3/8/8/8/8/NNNNNNNN/NNNN4/4K3 w - - 0 1' }))[1])
			.toBe('too_many_pieces')
		expect(err(() => E.setupPosition({ fen: '4k3/8/8/8/8/8/8/P3K3 w - - 0 1' }))[1]).toBe('invalid_state')
		expect(err(() => E.setupPosition({ fen: '4k3/8/8/8/8/8/8/4K3 w - e6 0 1' }))[1]).toBe('invalid_state')
		expect(err(() => E.setupPosition({ state: { v: 1 } }))[1]).toBe('invalid_state')
		expect(E.setupPosition({ state: E.initialState() })).toEqual(E.initialState())
	})

	it('prelude errors', () => {
		const fen = '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1'
		expect(err(() => E.setupPosition({ fen, prelude: ['nonsense'] }))[1]).toBe('prelude_bad_code')
		expect(err(() => E.setupPosition({ fen, prelude: ['O-O'] }))[1]).toBe('prelude_bad_code')
		expect(err(() => E.setupPosition({ fen, prelude: [42] }))[1]).toBe('prelude_bad_code')
		expect(err(() => E.setupPosition({ fen, prelude: 'g8-f6' }))[1]).toBe('prelude_bad_code')
		expect(err(() => E.setupPosition({ fen, prelude: ['a1-a2'] })))
			.toEqual(['SetupError', 'prelude_illegal', 'no_piece'])
		expect(err(() => E.setupPosition({ fen, prelude: ['c1-c2'] })))
			.toEqual(['SetupError', 'prelude_illegal', 'unreachable'])
		expect(err(() => E.setupPosition({ fen: '4k3/8/8/8/8/8/8/2B1K2k w - - 0 1', prelude: [] }))[1])
			.toBe('king_count')
		expect(err(() => E.setupPosition({ fen: '8/8/8/8/8/8/3k4/4K3 w - - 0 1', prelude: ['e1-d2'] }))[1])
			.toBe('prelude_king_captured')
		expect(E.setupPosition({
			fen,
			prelude: [{ code: 'g8-f6|h6' }, { code: 'c1-h6', outcome: 'capture' }],
		}).captured).toContain(23)
	})

	it('certainFen', () => {
		const s = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		expect(E.certainFen(s)).toBe('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1')
		expect(E.certainFen(E.initialState())).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
	})
})
