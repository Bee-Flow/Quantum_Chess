/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * FNV-1a-64 position hash (ENGINE-RULES §5.4), computed with two 32-bit halves (no BigInt, no string building).
 *
 * The hashed text is `turn|castling|ep|types|board_0:weight_0,board_1:weight_1,…` over the worlds in canonical order.
 */

const HEX = '0123456789abcdef'

/**
 * Streaming FNV-1a-64 over ASCII text. The state is kept in `hi`/`lo` (unsigned 32-bit halves).
 */
class Fnv64 {
	constructor() {
		// Offset basis cbf29ce484222325
		this.hi = 0xcbf29ce4
		this.lo = 0x84222325
	}

	/**
	 * Feed one byte.
	 *
	 * @param {number} byte 0..255
	 */
	byte(byte) {
		const lo = (this.lo ^ byte) >>> 0
		// h · 0x100000001b3 mod 2^64 = h · 0x1b3 + (h << 40)
		const a = lo * 0x1b3
		const carry = Math.floor(a / 4294967296)
		this.hi = (Math.imul(this.hi, 0x1b3) + carry + (lo << 8)) >>> 0
		this.lo = a >>> 0
	}

	/**
	 * Feed the characters of an ASCII string.
	 *
	 * @param {string} s text
	 */
	text(s) {
		let hi = this.hi
		let lo = this.lo
		for (let i = 0; i < s.length; i++) {
			lo = (lo ^ s.charCodeAt(i)) >>> 0
			const a = lo * 0x1b3
			hi = (Math.imul(hi, 0x1b3) + Math.floor(a / 4294967296) + (lo << 8)) >>> 0
			lo = a >>> 0
		}
		this.hi = hi
		this.lo = lo
	}

	/**
	 * The digest as 16 lowercase hex digits.
	 *
	 * @return {string}
	 */
	hex() {
		let out = ''
		for (let i = 28; i >= 0; i -= 4) {
			out += HEX[(this.hi >>> i) & 15]
		}
		for (let i = 28; i >= 0; i -= 4) {
			out += HEX[(this.lo >>> i) & 15]
		}
		return out
	}
}

/**
 * FNV-1a-64 of an ASCII string, as 16 lowercase hex digits.
 *
 * @param {string} text ASCII text
 * @return {string}
 */
export function fnv1a64(text) {
	const h = new Fnv64()
	h.text(text)
	return h.hex()
}

/**
 * Position hash from its parts (§5.4). `worlds` must be in canonical order.
 *
 * @param {string} turn 'w' or 'b'
 * @param {string} castling castling field
 * @param {string} ep en-passant field
 * @param {string} types types string
 * @param {Array<[string, number]>} worlds canonical worlds
 * @return {string}
 */
export function hashParts(turn, castling, ep, types, worlds) {
	const h = new Fnv64()
	h.text(turn)
	h.byte(124)
	h.text(castling)
	h.byte(124)
	h.text(ep)
	h.byte(124)
	h.text(types)
	h.byte(124)
	for (let i = 0; i < worlds.length; i++) {
		if (i > 0) {
			h.byte(44)
		}
		h.text(worlds[i][0])
		h.byte(58)
		h.text(String(worlds[i][1]))
	}
	return h.hex()
}

/**
 * Position hash of a state (§5.4): FNV-1a-64 over `turn|castling|ep|types|board:weight,…`.
 *
 * @param {object} state engine state
 * @return {string} 16 lowercase hex digits
 */
export function positionHash(state) {
	return hashParts(state.turn, state.castling, state.ep, state.types, state.worlds)
}

/**
 * The exact text that `positionHash` hashes (for debugging and documentation).
 *
 * @param {object} state engine state
 * @return {string}
 */
export function positionHashInput(state) {
	return state.turn + '|' + state.castling + '|' + state.ep + '|' + state.types + '|'
		+ state.worlds.map((w) => w[0] + ':' + w[1]).join(',')
}
