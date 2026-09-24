/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Global bookkeeping after a move (§5.4, pipeline step A7).
 *
 * PHP twin: lib/Engine/Internal/Worlds.php. Section numbers (§) refer to docs/engine-rules.md.
 */

import { CASTLING, CASTLING_FLAGS } from './constants.js'
import { TYPE_P } from './geometry.js'
import { idOfCode, letterCodeOf, SQUARE_NAMES } from './squares.js'

/** @typedef {import('./moveRecord.js').MoveRecord} MoveRecord */

/**
 * State-based castling (§5.4): keep a present flag only while its king and rook are on their home squares in
 * every world. Flags are never added.
 *
 * @param {string} castling current field
 * @param {Array<[string, number]>} worlds worlds after the move
 * @return {string}
 */
export function castlingAfter(castling, worlds) {
	if (castling === '-') {
		return '-'
	}
	let out = ''
	for (const flag of CASTLING_FLAGS) {
		if (!castling.includes(flag)) {
			continue
		}
		const c = CASTLING[flag]
		const kc = letterCodeOf(c.king)
		const rc = letterCodeOf(c.rook)
		let keep = true
		for (let i = 0; i < worlds.length && keep; i++) {
			const b = worlds[i][0]
			keep = b.charCodeAt(c.from) === kc && b.charCodeAt(c.rookFrom) === rc
		}
		if (keep) {
			out += flag
		}
	}
	return out === '' ? '-' : out
}

/**
 * The en-passant field after a move (§5.4): the skipped square iff a pawn double push actually moved and an enemy
 * pawn stands beside its target (same rank, adjacent file; never t ± 1 by index).
 *
 * @param {MoveRecord} rec record
 * @param {string} key realised key
 * @param {Array<[string, number]>} worlds worlds after the move
 * @param {string} types types after the move
 * @return {string}
 */
export function epAfter(rec, key, worlds, types) {
	if (rec.pawn !== 'double' || key !== 'move') {
		return '-'
	}
	const t = rec.t
	const b = worlds[0][0]
	const file = t & 7
	for (const df of [-1, 1]) {
		const ff = file + df
		if (ff < 0 || ff > 7) {
			continue
		}
		const s = (t & ~7) + ff
		const id = idOfCode(b.charCodeAt(s))
		if (id >= 0 && (id < 16) !== (rec.ci === 0) && types[id] === 'p') {
			return SQUARE_NAMES[(rec.f + t) >> 1]
		}
	}
	return '-'
}

/**
 * The types string after a move: a pawn that moved or captured onto its last rank takes its promotion type.
 *
 * @param {string} types types before
 * @param {MoveRecord} rec record
 * @param {string} key realised key
 * @return {string}
 */
export function typesAfter(types, rec, key) {
	if (rec.type === TYPE_P && rec.promo !== null && (key === 'move' || key === 'capture')) {
		return types.slice(0, rec.X) + rec.promo + types.slice(rec.X + 1)
	}
	return types
}

/**
 * The halfmove clock after a move: 0 on a capture or an actual pawn move, otherwise +1.
 *
 * @param {number} halfmove before
 * @param {MoveRecord} rec record
 * @param {string} key realised key
 * @return {number}
 */
export function halfmoveAfter(halfmove, rec, key) {
	if (key === 'capture' || (rec.type === TYPE_P && key === 'move')) {
		return 0
	}
	return halfmove + 1
}
