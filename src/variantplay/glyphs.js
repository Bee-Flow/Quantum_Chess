/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * How the pieces of the variants are drawn. A piece type declares a glyph:
 *
 * - `{ sprite: 'k' }`: a piece of the cburnett set (the orthodox pieces). Sides whose colour is not white or black
 *   (four-player chess) get the white piece tinted in their colour;
 * - `{ text, shape }`: a character or short text on a token: `circle` (a round token in the side's colour),
 *   `shogi` (a wooden pentagon that points at the opponent) or `xiangqi` (a round wooden disc). `text` may be a
 *   function of the side (xiangqi writes several pieces differently for Red and Black).
 */

/** Fill colours of the named side colours. */
const SIDE_FILLS = {
	white: '#ffffff',
	black: '#2b2b2b',
	red: '#c62828',
	blue: '#1565c0',
	yellow: '#f9a825',
	green: '#2e7d32',
}

/**
 * The fill colour of a side.
 *
 * @param {object} side side declaration (`color`, optionally `fill`)
 * @return {string}
 */
export function sideFill(side) {
	return side.fill ?? SIDE_FILLS[side.color] ?? side.color ?? '#888888'
}

/**
 * Whether text on a fill colour should be dark.
 *
 * @param {string} hex colour `#rrggbb`
 * @return {boolean}
 */
export function darkTextOn(hex) {
	const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
	if (!m) {
		return true
	}
	const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255)
	return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5
}

/**
 * How to draw a piece: `{ kind: 'sprite', symbol, tint }` or `{ kind: 'text', text, shape, fill, ink }`.
 *
 * @param {object} V variant
 * @param {string} type piece type
 * @param {number} side side index
 * @return {object}
 */
export function glyphOf(V, type, side) {
	const T = V.types[type]
	const g = T?.glyph ?? { text: type.toUpperCase(), shape: 'circle' }
	const sd = V.sides[side]
	if (g.sprite) {
		const color = sd.color === 'black' ? 'b' : 'w'
		const tint = sd.color === 'white' || sd.color === 'black' ? null : sideFill(sd)
		return { kind: 'sprite', symbol: 'qc-piece-cburnett-' + color + g.sprite.toUpperCase(), tint }
	}
	const text = typeof g.text === 'function' ? g.text(side) : g.text
	if (g.shape === 'shogi') {
		return { kind: 'text', shape: 'shogi', text, fill: '#f2d7a1', ink: g.promoted ? '#b71c1c' : '#1b1b1b' }
	}
	if (g.shape === 'xiangqi') {
		return {
			kind: 'text',
			shape: 'xiangqi',
			text,
			fill: '#f6e7c8',
			ink: sd.color === 'red' ? '#b71c1c' : '#1b1b1b',
		}
	}
	const fill = sideFill(sd)
	return { kind: 'text', shape: g.shape ?? 'circle', text, fill, ink: darkTextOn(fill) ? '#1b1b1b' : '#ffffff' }
}

/**
 * The name of a piece type for screen readers and tooltips.
 *
 * @param {object} V variant
 * @param {string} type piece type
 * @return {string}
 */
export function typeName(V, type) {
	const n = V.types[type]?.name
	return typeof n === 'function' ? n() : (n ?? type)
}
