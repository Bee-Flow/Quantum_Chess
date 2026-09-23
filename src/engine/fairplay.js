/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Fair-play support keys (ENGINE-RULES Appendix D, SPEC §8.8). They ignore weights, ids, links, castling, `ep` and
 * history, so re-weighting a world or swapping ids does not change them.
 */

import { analyse } from './analysis.js'
import { TYPE_CHAR } from './geometry.js'

/**
 * The 64 support characters of a state, in square order: the type letter of occ(s), upper case for White, lower
 * case for Black, `.` when the square is certainly empty.
 *
 * @param {object} state valid engine state
 * @return {string[]}
 */
function supportSquares(state) {
	const a = analyse(state)
	const out = new Array(64)
	for (let s = 0; s < 64; s++) {
		const id = a.occ[s]
		if (id < 0) {
			out[s] = '.'
		} else {
			const ch = TYPE_CHAR[a.typeCodes[id]]
			out[s] = id < 16 ? ch.toUpperCase() : ch
		}
	}
	return out
}

/**
 * Support key: `turn + '|' + 64 characters` (Appendix D).
 *
 * @param {object} state valid engine state
 * @return {string}
 */
export function supportKey(state) {
	return state.turn + '|' + supportSquares(state).join('')
}

/**
 * Colour mirror of the support key: ranks flipped (r ↔ 7 − r), colours swapped (letter case) and turn swapped.
 *
 * @param {object} state valid engine state
 * @return {string}
 */
export function supportKeyMirror(state) {
	const sq = supportSquares(state)
	const out = new Array(64)
	for (let s = 0; s < 64; s++) {
		const ch = sq[s]
		const swapped = ch === '.' ? ch : (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase())
		out[(7 - (s >> 3)) * 8 + (s & 7)] = swapped
	}
	return (state.turn === 'w' ? 'b' : 'w') + '|' + out.join('')
}
