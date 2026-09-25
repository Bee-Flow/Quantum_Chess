/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The texts of variant games: outcome labels, follow-up rolls, results and the rules shared by every variant.
 */

import { n, t } from '@nextcloud/l10n'
import { sideName } from '../variants/index.js'

/**
 * A percentage for display, e.g. `50 %`; never 0 % or 100 % for something that is possible but not certain.
 *
 * @param {number} p probability 0..1
 * @return {string}
 */
export function percent(p) {
	let v = Math.round(p * 100)
	if (p > 0 && v === 0) {
		v = 1
	}
	if (p < 1 && v === 100) {
		v = 99
	}
	return t('quantumchess', '{percent} %', { percent: v })
}

/**
 * The label of an outcome key.
 *
 * @param {string} key miss, move, capture, split, gone or a square name
 * @return {string}
 */
export function outcomeText(key) {
	switch (key) {
		case 'miss':
			return t('quantumchess', 'Missed')
		case 'move':
			return t('quantumchess', 'Moved')
		case 'capture':
			return t('quantumchess', 'Captured')
		case 'split':
			return t('quantumchess', 'Split')
		case 'gone':
			return t('quantumchess', 'No longer on the board')
		default:
			return t('quantumchess', 'On {square}', { square: key })
	}
}

/**
 * The label of a follow-up roll note (`solid:…` or `end:…`).
 *
 * @param {object} V variant
 * @param {string} note note
 * @return {string}
 */
export function noteText(V, note) {
	if (note.startsWith('solid:')) {
		return t('quantumchess', 'A piece that is always solid was settled')
	}
	if (note.startsWith('end:')) {
		const raw = note.slice(4)
		const result = raw === 'null' ? null : JSON.parse(raw)
		return result
			? t('quantumchess', 'The game ends: {result}', { result: resultText(V, result) })
			: t('quantumchess', 'The game goes on')
	}
	return note
}

/**
 * Why a game ended.
 *
 * @param {object} V variant
 * @param {string} reason reason code
 * @return {string}
 */
export function reasonText(V, reason) {
	const own = V.reasonText ? V.reasonText(reason) : null
	if (own) {
		return own
	}
	switch (reason) {
		case 'king':
			return t('quantumchess', 'a king was captured')
		case 'resign':
			return t('quantumchess', 'resignation')
		case 'quiet':
			return t('quantumchess', '50 moves without a capture or a pawn move')
		case 'moveLimit':
			return t('quantumchess', 'the move limit')
		case 'noMoves':
			return t('quantumchess', 'no legal move')
		default:
			return reason
	}
}

/**
 * A result sentence: "White wins (a king was captured)" or "Draw (…)".
 *
 * @param {object} V variant
 * @param {object} result result
 * @return {string}
 */
export function resultText(V, result) {
	const why = reasonText(V, result.reason)
	if (result.winner !== null && result.winner !== undefined) {
		return t('quantumchess', '{side} wins ({reason})', { side: sideName(V, result.winner), reason: why })
	}
	if (Array.isArray(result.winners) && result.winners.length) {
		const names = result.winners.map((s) => sideName(V, s)).join(' & ')
		return n(
			'quantumchess',
			'{sides} wins ({reason})',
			'{sides} win ({reason})',
			result.winners.length,
			{ sides: names, reason: why },
		)
	}
	return t('quantumchess', 'Draw ({reason})', { reason: why })
}

/**
 * The quantum rules shared by every variant, as short sentences.
 *
 * @return {string[]}
 */
export function sharedRules() {
	return [
		t('quantumchess', 'Split: a piece that is not a king or pawn may move to two empty squares at once and becomes a ghost, 50 % on each.'),
		t('quantumchess', 'Merge: bring two parts of a ghost together on one square.'),
		t(
			'quantumchess',
			'Land = roll, pass = link: landing where a piece might be is settled by a roll; sliding past such a square links the pieces.',
		),
		t(
			'quantumchess',
			'Kings and pawns (and the pieces the variant names) are always solid: their moves are settled at once.',
		),
		t('quantumchess', 'Measure: spend your turn to find out where one of your ghosts really is.'),
		t('quantumchess', 'If the game might be over in some possibilities but not in others, a roll decides.'),
		t('quantumchess', 'Each side has a budget of 8 possible arrangements of its pieces.'),
	]
}
