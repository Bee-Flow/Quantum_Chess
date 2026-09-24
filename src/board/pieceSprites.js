/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The inline SVG piece sprite. The 12 cburnett files are imported `?raw` at build time and turned into `<symbol>`s:
 * crisp at any size, no extra requests, and allowed by the Nextcloud content security policy. Every piece graphic is
 * `<use href="#qc-piece-<set>-<color><TYPE>">`. The folder layout `img/pieces/<set>/` leaves room for more sets.
 */

import bB from '../../img/pieces/cburnett/bB.svg?raw'
import bK from '../../img/pieces/cburnett/bK.svg?raw'
import bN from '../../img/pieces/cburnett/bN.svg?raw'
import bP from '../../img/pieces/cburnett/bP.svg?raw'
import bQ from '../../img/pieces/cburnett/bQ.svg?raw'
import bR from '../../img/pieces/cburnett/bR.svg?raw'
import wB from '../../img/pieces/cburnett/wB.svg?raw'
import wK from '../../img/pieces/cburnett/wK.svg?raw'
import wN from '../../img/pieces/cburnett/wN.svg?raw'
import wP from '../../img/pieces/cburnett/wP.svg?raw'
import wQ from '../../img/pieces/cburnett/wQ.svg?raw'
import wR from '../../img/pieces/cburnett/wR.svg?raw'

/** The piece sets that are shipped. */
export const PIECE_SETS = Object.freeze(['cburnett'])

/** The id of the sprite's `<svg>` element. */
export const SPRITE_ID = 'qc-piece-sprite'

const CBURNETT = { bB, bK, bN, bP, bQ, bR, wB, wK, wN, wP, wQ, wR }

/**
 * Symbol id of a piece graphic.
 *
 * @param {string} set piece set (cburnett)
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
	cached = `<svg id="${SPRITE_ID}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" `
		+ 'style="position:absolute;width:0;height:0;overflow:hidden">' + symbols.join('') + '</svg>'
	return cached
}
