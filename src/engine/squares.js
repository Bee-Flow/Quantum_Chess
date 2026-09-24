/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Squares, piece ids and letters (§2.1, §2.2).
 *
 * PHP twin: lib/Engine/Internal/Tables.php. Section numbers (§) refer to docs/engine-rules.md.
 */

const FILES = 'abcdefgh'

/** Precomputed square names, index → name. */
export const SQUARE_NAMES = Object.freeze(Array.from({ length: 64 }, (_, i) => FILES[i & 7] + String((i >> 3) + 1)))

/**
 * Name of a square index (`28` → `'e4'`).
 *
 * @param {number} index square index 0..63
 * @return {string}
 */
export function squareName(index) {
	return SQUARE_NAMES[index]
}

/**
 * Index of a square name (`'e4'` → `28`). Accepts upper case files. Returns -1 for anything else.
 *
 * @param {string} name square name
 * @return {number}
 */
export function squareIndex(name) {
	if (typeof name !== 'string' || name.length !== 2) {
		return -1
	}
	let f = name.charCodeAt(0)
	if (f >= 65 && f <= 72) {
		f += 32
	}
	const r = name.charCodeAt(1)
	if (f < 97 || f > 104 || r < 49 || r > 56) {
		return -1
	}
	return (r - 49) * 8 + (f - 97)
}

/**
 * File (0..7) of a square.
 *
 * @param {number} s square index
 * @return {number}
 */
export function fileOf(s) {
	return s & 7
}

/**
 * Rank (0..7) of a square.
 *
 * @param {number} s square index
 * @return {number}
 */
export function rankOf(s) {
	return s >> 3
}

/**
 * Board letter of a piece id: `A`..`P` for White (0..15), `a`..`p` for Black (16..31).
 *
 * @param {number} id piece id
 * @return {string}
 */
export function letterOf(id) {
	return String.fromCharCode(id < 16 ? 0x41 + id : 0x61 + id - 16)
}

/**
 * Board character code of a piece id.
 *
 * @param {number} id piece id
 * @return {number}
 */
export function letterCodeOf(id) {
	return id < 16 ? 0x41 + id : 0x61 + id - 16
}

/**
 * Piece id of a board character code, or -1 for `.` or anything else.
 *
 * @param {number} code character code
 * @return {number}
 */
export function idOfCode(code) {
	if (code >= 0x41 && code <= 0x50) {
		return code - 0x41
	}
	if (code >= 0x61 && code <= 0x70) {
		return code - 0x61 + 16
	}
	return -1
}

/**
 * Colour of a piece id.
 *
 * @param {number} id piece id
 * @return {'w'|'b'}
 */
export function colorOf(id) {
	return id < 16 ? 'w' : 'b'
}

/**
 * The other colour.
 *
 * @param {'w'|'b'} c colour
 * @return {'w'|'b'}
 */
export function otherColor(c) {
	return c === 'w' ? 'b' : 'w'
}
