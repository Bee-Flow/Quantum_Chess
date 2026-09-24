/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Canonical move codes (§4.1) and the lenient parser (§4.12).
 *
 * PHP twin: lib/Engine/Internal/Parser.php. Section numbers (§) refer to docs/engine-rules.md.
 */

import { SQUARE_NAMES } from './squares.js'

/**
 * Canonical code of a move object (§4.1). Split targets and merge sources are emitted in index order.
 *
 * @param {{type: string, from: number[], to: number[], promo?: string}} move move object
 * @return {string}
 */
export function moveCode(move) {
	const from = move.from
	const to = move.to
	switch (move.type) {
		case 'standard':
			return SQUARE_NAMES[from[0]] + '-' + SQUARE_NAMES[to[0]] + (move.promo ? '=' + move.promo.toUpperCase() : '')
		case 'split': {
			const a = Math.min(to[0], to[1])
			const b = Math.max(to[0], to[1])
			return SQUARE_NAMES[from[0]] + '-' + SQUARE_NAMES[a] + '|' + SQUARE_NAMES[b]
		}
		case 'merge': {
			const a = Math.min(from[0], from[1])
			const b = Math.max(from[0], from[1])
			return SQUARE_NAMES[a] + '|' + SQUARE_NAMES[b] + '-' + SQUARE_NAMES[to[0]]
		}
		case 'measure':
			return '?' + SQUARE_NAMES[from[0]]
		default:
			throw new TypeError('unknown move type')
	}
}

/**
 * Remove a trailing promotion suffix (`=Q`, `=R`, `=B`, `=N`) from a canonical code (§9.3).
 *
 * @param {string} code canonical code
 * @return {string}
 */
export function stripPromo(code) {
	return /=[QRBN]$/.test(code) ? code.slice(0, -2) : code
}

/**
 * Is the character code whitespace in the parser's sense (space, tab, CR, LF)?
 *
 * @param {number} c character code
 * @return {boolean}
 */
function isWs(c) {
	return c === 32 || c === 9 || c === 13 || c === 10
}

/**
 * File letter (a-h or A-H) → 0..7, else -1.
 *
 * @param {number} c character code
 * @return {number}
 */
function fileCode(c) {
	if (c >= 97 && c <= 104) {
		return c - 97
	}
	if (c >= 65 && c <= 72) {
		return c - 65
	}
	return -1
}

/**
 * Tiny cursor over the normalised input.
 */
class Cursor {
	/**
	 * @param {string} s input
	 */
	constructor(s) {
		this.s = s
		this.i = 0
	}

	/**
	 * Character code at offset k from the cursor, or -1.
	 *
	 * @param {number} [k] offset
	 * @return {number}
	 */
	peek(k = 0) {
		const j = this.i + k
		return j < this.s.length ? this.s.charCodeAt(j) : -1
	}

	/**
	 * At the end?
	 *
	 * @return {boolean}
	 */
	end() {
		return this.i >= this.s.length
	}

	/**
	 * Read a square, or return -1 without moving.
	 *
	 * @return {number}
	 */
	square() {
		const f = fileCode(this.peek())
		const r = this.peek(1)
		if (f < 0 || r < 49 || r > 56) {
			return -1
		}
		this.i += 2
		return (r - 49) * 8 + f
	}

	/**
	 * Read an optional piece letter (K Q R B N followed by a file letter).
	 *
	 * @return {string|null}
	 */
	piece() {
		const c = this.peek()
		if ((c === 75 || c === 81 || c === 82 || c === 66 || c === 78) && fileCode(this.peek(1)) >= 0) {
			this.i += 1
			return String.fromCharCode(c)
		}
		return null
	}

	/**
	 * Read an optional one-character separator from a set of codes.
	 *
	 * @param {number[]} set allowed codes
	 * @return {boolean} whether one was read
	 */
	optional(set) {
		if (set.includes(this.peek())) {
			this.i += 1
			return true
		}
		return false
	}
}

const SEP = [45, 120, 88, 58] // - x X :
const PAIRSEP = [124, 47, 44] // | / ,
const OH = [79, 111, 48] // O o 0
const PROMO = { Q: 'q', R: 'r', B: 'b', N: 'n', q: 'q', r: 'r', b: 'b', n: 'n' }

/**
 * Normalisation pipeline of §4.12 (steps 1–3).
 *
 * @param {string} code raw input
 * @return {string}
 */
export function normaliseCode(code) {
	let s = code
	const brace = s.indexOf('{')
	if (brace >= 0) {
		s = s.slice(0, brace)
	}
	let a = 0
	let b = s.length
	while (a < b && isWs(s.charCodeAt(a))) {
		a++
	}
	while (b > a && isWs(s.charCodeAt(b - 1))) {
		b--
	}
	while (b > a) {
		const c = s.charCodeAt(b - 1)
		if (c === 43 || c === 35 || c === 33 || c === 63 || isWs(c)) {
			b--
		} else {
			break
		}
	}
	return s.slice(a, b)
}

/**
 * Lenient parser (§4.12).
 *
 * Returns `null`, a castling marker `{castle: 'O-O' | 'O-O-O'}`, or a move object
 * `{type, from, to, promo?, letter?}` with split targets and merge sources sorted by index, `promo` in lower case
 * and `letter` (K Q R B N) only when a piece letter was given. The letter is not part of the move; `findMove` and
 * `whyIllegal` check it against the piece (`piece_mismatch`).
 *
 * @param {string} code input text
 * @return {null|{castle: string}|{type: string, from: number[], to: number[], promo?: string, letter?: string}}
 */
export function parseMoveCode(code) {
	if (typeof code !== 'string') {
		return null
	}
	const s = normaliseCode(code)
	if (s.length === 0) {
		return null
	}
	const cur = new Cursor(s)
	// castle
	if (OH.includes(cur.peek())) {
		return parseCastle(s)
	}
	// measure: "?" [piece] sq
	if (cur.peek() === 63) {
		cur.i = 1
		const letter = cur.piece()
		const sq = cur.square()
		if (sq < 0 || !cur.end()) {
			return null
		}
		return withLetter({ type: 'measure', from: [sq], to: [] }, letter)
	}
	// measure: measword 1*wsp sq
	if (s.length > 7 && s.slice(0, 7).toLowerCase() === 'measure') {
		cur.i = 7
		let spaces = 0
		while (cur.peek() === 32 || cur.peek() === 9) {
			cur.i++
			spaces++
		}
		const sq = cur.square()
		if (spaces === 0 || sq < 0 || !cur.end()) {
			return null
		}
		return { type: 'measure', from: [sq], to: [] }
	}
	const letter = cur.piece()
	const a = cur.square()
	if (a < 0) {
		return null
	}
	if (cur.optional(PAIRSEP)) {
		// merge: sq pairsep sq [sep] sq
		const b = cur.square()
		if (b < 0) {
			return null
		}
		cur.optional(SEP)
		const t = cur.square()
		if (t < 0 || !cur.end()) {
			return null
		}
		return withLetter({ type: 'merge', from: a < b ? [a, b] : [b, a], to: [t] }, letter)
	}
	cur.optional(SEP)
	const b = cur.square()
	if (b < 0) {
		return null
	}
	if (cur.optional(PAIRSEP)) {
		// split: sq [sep] sq pairsep sq
		const c = cur.square()
		if (c < 0 || !cur.end()) {
			return null
		}
		return withLetter({ type: 'split', from: [a], to: b < c ? [b, c] : [c, b] }, letter)
	}
	// standard: sq [sep] sq [promo]
	let promo = null
	if (!cur.end()) {
		cur.optional([61]) // =
		const p = PROMO[String.fromCharCode(cur.peek())]
		if (p === undefined) {
			return null
		}
		cur.i++
		promo = p
		if (!cur.end()) {
			return null
		}
	}
	const move = { type: 'standard', from: [a], to: [b] }
	if (promo !== null) {
		move.promo = promo
	}
	return withLetter(move, letter)
}

/**
 * Attach the piece letter (if any) as the last key.
 *
 * @param {object} move move object
 * @param {string|null} letter piece letter
 * @return {object}
 */
function withLetter(move, letter) {
	if (letter !== null) {
		move.letter = letter
	}
	return move
}

/**
 * castle = oh "-" oh [ "-" oh ].
 *
 * @param {string} s normalised input
 * @return {{castle: string}|null}
 */
function parseCastle(s) {
	const oh = (i) => OH.includes(s.charCodeAt(i))
	if (s.length === 3 && oh(0) && s[1] === '-' && oh(2)) {
		return { castle: 'O-O' }
	}
	if (s.length === 5 && oh(0) && s[1] === '-' && oh(2) && s[3] === '-' && oh(4)) {
		return { castle: 'O-O-O' }
	}
	return null
}
