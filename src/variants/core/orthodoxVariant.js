/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * A ready-made two-sided variant with the orthodox pieces on an 8 × 8 board (castling, double steps, en passant and
 * promotion included). Variants that change only a few rules (King of the Hill, Three-check, Chess960, Atomic, ...)
 * start from `orthodoxSpec()` and override what differs.
 */

import { t } from '@nextcloud/l10n'
import {
	castlingMoves,
	orthodoxAfterMove,
	orthodoxTypes,
	pawnExtras,
	standardBoard,
	standardSetup,
} from './orthodox.js'

/** The sides of a two-sided game. */
export function whiteBlack() {
	return [
		{ id: 'w', name: () => t('quantumchess', 'White'), color: 'white' },
		{ id: 'b', name: () => t('quantumchess', 'Black'), color: 'black' },
	]
}

/**
 * The declaration of orthodox chess on an 8 × 8 board, to be extended by a variant.
 *
 * @param {object} [opts] options
 * @param {string} [opts.back] back rank from file a (default rnbqkbnr)
 * @param {boolean} [opts.royalKing] whether the king is royal (default true)
 * @param {string[]} [opts.promoteTo] promotion choices
 * @return {object}
 */
export function orthodoxSpec({ back = 'rnbqkbnr', royalKing = true, promoteTo } = {}) {
	const board = standardBoard(8, 8)
	const spec = {
		sides: whiteBlack(),
		topology: board.topology,
		board,
		types: orthodoxTypes({ lastRank: board.lastRank, promoteTo, royalKing }),
		setup() {
			return standardSetup(spec, back)
		},
		extraMoves(w, side) {
			return [
				...pawnExtras(spec, w, side, (s, sq) => board.rankOf(sq) === (s === 0 ? 1 : 6)),
				...castlingMoves(spec, w, side),
			]
		},
		afterMove(next, m) {
			orthodoxAfterMove(spec, next, m)
		},
	}
	// defineVariant completes this object in place, so the hooks above see the finished variant (orient, enemies)
	return spec
}
