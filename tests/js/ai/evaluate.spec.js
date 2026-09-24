/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The static evaluation: scale conversions, material and positional terms, colour symmetry, and the side-to-move view.
 */

import { describe, expect, it } from 'vitest'
import { evaluate, materialOf, staticE, toCp, toE } from '../../../src/ai/evaluate.js'
import { features, pieceThreats } from '../../../src/ai/features.js'
import { E, POS, S } from './helpers.js'

/**
 * Colour-mirror a FEN (ranks flipped, colours and side to move swapped).
 *
 * @param {string} fen FEN
 * @return {string}
 */
function mirrorFen(fen) {
	const [board, turn, castling, , half, full] = fen.split(' ')
	const swap = (s) => s.replace(/[a-z]/gi, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
	const rows = board.split('/').reverse().map(swap).join('/')
	const flags = castling === '-' ? '-' : ['K', 'Q', 'k', 'q'].filter((f) => swap(castling).includes(f)).join('')
	return `${rows} ${turn === 'w' ? 'b' : 'w'} ${flags || '-'} - ${half} ${full}`
}

describe('toE / toCp', () => {
	it('maps centipawns to expected score with k = 250 and back', () => {
		expect(toE(0)).toBe(0.5)
		expect(toE(250)).toBeCloseTo(1 / (1 + Math.exp(-1)), 12)
		expect(toE(-250)).toBeCloseTo(1 - toE(250), 12)
		expect(toCp(toE(137))).toBeCloseTo(137, 6)
		expect(toCp(0)).toBe(-10000)
		expect(toCp(1)).toBe(10000)
	})
})

describe('evaluate', () => {
	it('is small in the start position and colour-symmetric', () => {
		expect(Math.abs(evaluate(E.initialState()))).toBeLessThanOrEqual(20)
		for (const fen of [
			'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1',
			'4k3/pp3ppp/8/3n4/8/2B5/PP3PPP/4K3 w - - 0 1',
			'6k1/5ppp/8/8/3Q4/8/5PPP/6K1 b - - 0 1',
		]) {
			const a = evaluate(S(fen))
			const b = evaluate(S(mirrorFen(fen)))
			expect(a).toBeCloseTo(-b, 6)
		}
	})

	it('counts material (certain in every possibility)', () => {
		expect(materialOf(E.initialState(), 'w')).toBe(3900)
		expect(materialOf(POS.w2(), 'b')).toBe(300)
		const up = evaluate(S('4k3/8/8/8/8/8/8/3QK3 w - - 0 1'))
		expect(up).toBeGreaterThan(700)
	})

	it('reads marginals: a ghost knight counts once, on both squares with half weight', () => {
		const f = features(POS.w2())
		const h6 = E.squareIndex('h6')
		const f6 = E.squareIndex('f6')
		expect(f.occ[h6]).toBe(23)
		expect(f.p[h6]).toBe(0.5)
		expect(f.p[f6]).toBe(0.5)
		expect(f.partsCount[23]).toBe(2)
	})

	it('prices hanging material: the bishop hits the h6 part of the ghost knight (50 % × 300)', () => {
		const t = pieceThreats(POS.w2(), 'b')
		expect(t[23]).toBeCloseTo(150, 6)
		expect(pieceThreats(POS.w2(), 'w').every((x) => x === 0)).toBe(true)
	})

	it('penalises king exposure: the side not to move pays for the mover\'s king shot', () => {
		// White to move with a 100 % converging capture of the black king (W6).
		expect(evaluate(POS.w6())).toBeGreaterThan(1000)
		const blind = evaluate(POS.w6(), { ignoreKing: 'b' })
		expect(blind).toBeLessThan(evaluate(POS.w6()))
	})

	it('scores finished games as ±10000 or 0', () => {
		const won = E.applyMove(POS.w6(), 'd4|h5-h8').state
		expect(evaluate(won)).toBe(10000)
	})
})

describe('staticE (side to move)', () => {
	it('is 1 with a certain king capture and 0 for a trapped king', () => {
		expect(staticE(POS.w6())).toBe(1)
		const trapped = E.applyForSearch(POS.w14(), 'a1-a8')
		expect(trapped.result).toBe(null) // E1b is skipped inside the search …
		expect(staticE(trapped)).toBe(0) // … and the leaf evaluation finds it
	})

	it('values a king shot at least at its probability', () => {
		// The white rook is 50 % a3 / 50 % a8; from a8 it hits the black king on e8 along a clear rank.
		const s = S('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', ['a1-a3|a8'])
		expect(E.kingDanger(s, 'b')).toBe(E.T / 2)
		expect(staticE(s)).toBeGreaterThanOrEqual(0.5)
		expect(staticE(s, 1)).toBeLessThan(staticE(s)) // Black blind to its king: the shot is not counted
	})
})
