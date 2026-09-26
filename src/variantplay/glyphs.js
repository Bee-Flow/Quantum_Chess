/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * How the pieces of the variants are drawn. A piece type declares a glyph:
 *
 * - `{ sprite: 'k' }`: a piece of the cburnett set (the orthodox pieces). Sides whose colour is not white or black
 *   (four-player chess) get the white piece tinted in their colour; `promoted: true` adds a small red "+" marker;
 *   `scale` (0 to 1) draws it smaller (Makruk's met, a small queen); `horn: true` gives a knight a unicorn's horn
 *   (the unicorn of 3D chess); `bar: true` gives a pawn a crossbar (the brawn of the multiverse);
 * - `{ sprites: ['b', 'n'] }`: a compound piece drawn as its two cburnett pieces side by side, the second in front
 *   (Capablanca's archbishop, bishop and knight, and chancellor, rook and knight);
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
 * How to draw a piece: `{ kind: 'sprite', symbol, tint, promoted?, scale?, horn?, bar? }` (`horn` and `bar`: the
 * colour of the horn or the crossbar, white or black), `{ kind: 'compound', parts: [{ symbol }, { symbol }], tint }` or
 * `{ kind: 'text', text, shape, fill, ink }`. A sprite glyph with `promoted: true` (a promoted pawn in the drop
 * variants, `+q`) carries a small red "+" marker.
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
	const color = sd.color === 'black' ? 'b' : 'w'
	const tint = sd.color === 'white' || sd.color === 'black' ? null : sideFill(sd)
	if (Array.isArray(g.sprites) && g.sprites.length === 2) {
		const parts = g.sprites.map((s) => ({ symbol: 'qc-piece-cburnett-' + color + s.toUpperCase() }))
		return { kind: 'compound', parts, tint }
	}
	if (g.sprite) {
		const out = { kind: 'sprite', symbol: 'qc-piece-cburnett-' + color + g.sprite.toUpperCase(), tint }
		if (g.promoted) {
			out.promoted = true
		}
		if (g.scale > 0 && g.scale < 1) {
			out.scale = g.scale
		}
		if (g.horn) {
			out.horn = color === 'b' ? 'black' : 'white'
		}
		if (g.bar) {
			out.bar = color === 'b' ? 'black' : 'white'
		}
		return out
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

/**
 * How far a piece of a side is turned, in degrees: its side's rotation (`sides[i].rotate`, by default 0 for the first
 * side and 180 for the others) plus the board's, so that a shogi pentagon points at the opponent as the player sees
 * the board, on the board and off it (hands, the promotion choice).
 *
 * @param {object} V variant
 * @param {number} side side index
 * @param {number} rotation the rotation of the board in degrees
 * @return {number} 0 to 359
 */
export function pieceSpin(V, side, rotation) {
	const own = V.sides[side]?.rotate ?? (side === 0 ? 0 : 180)
	return (((own + rotation) % 360) + 360) % 360
}
