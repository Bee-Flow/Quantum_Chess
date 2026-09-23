/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The inline SVG piece sprite (GAME-DESIGN §3.3): the 12 cburnett files are imported `?raw` at build time and turned
 * into `<symbol>`s (crisp at any size, no requests, CSP-friendly); the Letters set (a bold K Q R B N P on a disc, for
 * low vision) is generated. Every piece graphic is `<use href="#qc-piece-<set>-<color><TYPE>">`.
 */

import { reactive } from 'vue'
import bB from '../../../img/pieces/cburnett/bB.svg?raw'
import bK from '../../../img/pieces/cburnett/bK.svg?raw'
import bN from '../../../img/pieces/cburnett/bN.svg?raw'
import bP from '../../../img/pieces/cburnett/bP.svg?raw'
import bQ from '../../../img/pieces/cburnett/bQ.svg?raw'
import bR from '../../../img/pieces/cburnett/bR.svg?raw'
import wB from '../../../img/pieces/cburnett/wB.svg?raw'
import wK from '../../../img/pieces/cburnett/wK.svg?raw'
import wN from '../../../img/pieces/cburnett/wN.svg?raw'
import wP from '../../../img/pieces/cburnett/wP.svg?raw'
import wQ from '../../../img/pieces/cburnett/wQ.svg?raw'
import wR from '../../../img/pieces/cburnett/wR.svg?raw'

/** Piece sets shipped with 1.0. */
export const PIECE_SETS = Object.freeze(['cburnett', 'letters'])

/** The id of the sprite's `<svg>` element. */
export const SPRITE_ID = 'qc-piece-sprite'

const CBURNETT = { bB, bK, bN, bP, bQ, bR, wB, wK, wN, wP, wQ, wR }

/**
 * Symbol id of a piece graphic.
 *
 * @param {string} set piece set (cburnett | letters)
 * @param {'w'|'b'} color colour
 * @param {string} type k q r b n p (either case)
 * @return {string}
 */
export function pieceSymbolId(set, color, type) {
	const s = PIECE_SETS.includes(set) ? set : 'cburnett'
	return 'qc-piece-' + s + '-' + color + type.toUpperCase()
}

/**
 * The body and viewBox of a raw SVG file.
 *
 * @param {string} raw SVG source
 * @return {{viewBox: string, body: string}}
 */
export function svgBody(raw) {
	const open = raw.indexOf('<svg')
	const start = raw.indexOf('>', open) + 1
	const end = raw.lastIndexOf('</svg>')
	const viewBox = /viewBox="([^"]+)"/.exec(raw.slice(open, start))?.[1] ?? '0 0 45 45'
	return { viewBox, body: raw.slice(start, end).trim() }
}

/**
 * A generated Letters piece: a bold letter on a disc, white pieces light with a dark rim, black pieces dark.
 *
 * @param {'w'|'b'} color colour
 * @param {string} type k q r b n p
 * @return {string} symbol body for viewBox 0 0 45 45
 */
export function letterBody(color, type) {
	const white = color === 'w'
	const fill = white ? '#fbfbfb' : '#1c1f24'
	const rim = white ? '#1c1f24' : '#fbfbfb'
	const ink = white ? '#111317' : '#ffffff'
	const letter = type.toUpperCase()
	// A soft outer shadow ring keeps both discs readable on either square colour.
	return '<circle cx="22.5" cy="22.5" r="19.6" fill="rgb(0 0 0 / 0.28)"/>'
		+ `<circle cx="22.5" cy="22.5" r="18.4" fill="${fill}" stroke="${rim}" stroke-width="2.2"/>`
		+ `<text x="22.5" y="23.4" text-anchor="middle" dominant-baseline="central" fill="${ink}" `
		+ 'font-family="system-ui, -apple-system, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif" '
		+ `font-size="24" font-weight="800">${letter}</text>`
}

/** Mounted PieceSprite instances; only the first one renders the sprite. */
export const spriteRegistry = reactive({ next: 1, mounted: [] })

let cached = null

/**
 * The complete sprite markup (one hidden `<svg>` with every symbol of every set).
 *
 * @return {string}
 */
export function spriteMarkup() {
	if (cached !== null) {
		return cached
	}
	const symbols = []
	for (const [key, raw] of Object.entries(CBURNETT)) {
		const { viewBox, body } = svgBody(raw)
		symbols.push(`<symbol id="${pieceSymbolId('cburnett', key[0], key[1])}" viewBox="${viewBox}">${body}</symbol>`)
	}
	for (const color of ['w', 'b']) {
		for (const type of 'kqrbnp') {
			symbols.push(`<symbol id="${pieceSymbolId('letters', color, type)}" viewBox="0 0 45 45">${letterBody(color, type)}</symbol>`)
		}
	}
	cached = `<svg id="${SPRITE_ID}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" `
		+ 'style="position:absolute;width:0;height:0;overflow:hidden">' + symbols.join('') + '</svg>'
	return cached
}
