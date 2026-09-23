/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The spoken description of a position (GAME-DESIGN §9.1, the **D** key): "White: king e1; queen d1; knight f3 50
 * percent or h3 50 percent; … Black: …; 4 possibilities; budget White 2 of 8, Black 1 of 8; White to move."
 */

import { n, t } from '@nextcloud/l10n'
import { budget, kingDanger, pct, pieceLocations, squareName, T, worldCount } from '../index.js'
import { colorName, pieceTypeName, TEXT } from './pieces.js'

const TYPE_ORDER = ['k', 'q', 'r', 'b', 'n', 'p']

/**
 * Spoken percentage.
 *
 * @param {number} weight weight 0..T
 * @return {string}
 */
function percent(weight) {
	return n('quantumchess', '%n percent', '%n percent', pct(weight))
}

/**
 * One side's pieces as spoken text.
 *
 * @param {object} state engine state
 * @param {'w'|'b'} color colour
 * @return {string}
 */
function sidePieces(state, color) {
	const locs = pieceLocations(state)
	const ids = []
	for (let id = color === 'w' ? 0 : 16, end = id + 16; id < end; id++) {
		if (locs[id].length > 0) {
			ids.push(id)
		}
	}
	ids.sort((a, b) => TYPE_ORDER.indexOf(state.types[a]) - TYPE_ORDER.indexOf(state.types[b]) || locs[a][0].square - locs[b][0].square)
	const items = []
	const pawns = []
	for (const id of ids) {
		const type = state.types[id]
		const where = locs[id].length === 1
			? squareName(locs[id][0].square)
			: locs[id].map((l) => t('quantumchess', '{square} {percent}', { square: squareName(l.square), percent: percent(l.weight) }, undefined, TEXT))
				.join(' ' + t('quantumchess', 'or') + ' ')
		if (type === 'p') {
			pawns.push(where)
		} else {
			items.push(t('quantumchess', '{piece} {where}', { piece: pieceTypeName(type), where }, undefined, TEXT))
		}
	}
	if (pawns.length > 0) {
		items.push(n('quantumchess', 'pawn {squares}', 'pawns {squares}', pawns.length, { squares: pawns.join(', ') }, TEXT))
	}
	return items.join('; ')
}

/**
 * Screen-reader description of a position.
 *
 * @param {object} state engine state
 * @param {object} [options] options
 * @param {'w'|'b'} [options.orientation] the viewer's side: it is described first
 * @return {string}
 */
export function describePosition(state, { orientation = 'w' } = {}) {
	const order = orientation === 'b' ? ['b', 'w'] : ['w', 'b']
	const parts = order.map((c) => t('quantumchess', '{color}: {pieces}.', { color: colorName(c), pieces: sidePieces(state, c) }, undefined, TEXT))
	const worlds = worldCount(state)
	// TRANSLATORS: "possibility" is one complete chessboard that could be the real one (RULES.md glossary)
	parts.push(n('quantumchess', '%n possibility.', '%n possibilities.', worlds))
	parts.push(t('quantumchess', 'Budget White {w} of 8, Black {b} of 8.', { w: budget(state, 'w'), b: budget(state, 'b') }, undefined, TEXT))
	for (const c of order) {
		const danger = kingDanger(state, c)
		if (danger > 0) {
			parts.push(danger >= T
				? t('quantumchess', '{color} king can be captured for certain.', { color: colorName(c) }, undefined, TEXT)
				: t('quantumchess', '{color} king danger {percent}.', { color: colorName(c), percent: percent(danger) }, undefined, TEXT))
		}
	}
	if (state.result !== null) {
		parts.push(t('quantumchess', 'The game is over.'))
	} else {
		parts.push(state.turn === 'w' ? t('quantumchess', 'White to move.') : t('quantumchess', 'Black to move.'))
	}
	return parts.join(' ')
}
