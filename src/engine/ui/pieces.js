/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Piece names and figurines for copy (GAME-DESIGN §3.6.2, §9.1). JS-only display helpers.
 */

import { t } from '@nextcloud/l10n'

/** Options for strings rendered as plain text (never as HTML): no escaping, no sanitising. */
export const TEXT = Object.freeze({ escape: false, sanitize: false })

/** U+FE0E asks for the text (not emoji) presentation of the chess symbols. */
const VS15 = '︎'

/** Unicode figurines by colour and type. */
export const FIGURINES = Object.freeze({
	w: Object.freeze({ k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' }),
	b: Object.freeze({ k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }),
})

/**
 * The figurine of a piece, in text presentation.
 *
 * @param {string} type k q r b n p
 * @param {'w'|'b'} color colour
 * @return {string}
 */
export function figurine(type, color) {
	return FIGURINES[color][type] + VS15
}

/**
 * Translated piece name ("white knight").
 *
 * @param {string} type k q r b n p
 * @param {'w'|'b'} color colour
 * @return {string}
 */
export function pieceName(type, color) {
	const names = color === 'w'
		? {
				k: t('quantumchess', 'white king'),
				q: t('quantumchess', 'white queen'),
				r: t('quantumchess', 'white rook'),
				b: t('quantumchess', 'white bishop'),
				n: t('quantumchess', 'white knight'),
				p: t('quantumchess', 'white pawn'),
			}
		: {
				k: t('quantumchess', 'black king'),
				q: t('quantumchess', 'black queen'),
				r: t('quantumchess', 'black rook'),
				b: t('quantumchess', 'black bishop'),
				n: t('quantumchess', 'black knight'),
				p: t('quantumchess', 'black pawn'),
			}
	return names[type] ?? ''
}

/**
 * Translated piece type without colour ("knight").
 *
 * @param {string} type k q r b n p
 * @return {string}
 */
export function pieceTypeName(type) {
	const names = {
		k: t('quantumchess', 'king'),
		q: t('quantumchess', 'queen'),
		r: t('quantumchess', 'rook'),
		b: t('quantumchess', 'bishop'),
		n: t('quantumchess', 'knight'),
		p: t('quantumchess', 'pawn'),
	}
	return names[type] ?? ''
}

/**
 * Translated colour name ("White").
 *
 * @param {'w'|'b'} color colour
 * @return {string}
 */
export function colorName(color) {
	return color === 'w' ? t('quantumchess', 'White') : t('quantumchess', 'Black')
}

/**
 * Colour of a piece id (ER §2.2).
 *
 * @param {number} id piece id 0..31
 * @return {'w'|'b'}
 */
export function colorOfId(id) {
	return id < 16 ? 'w' : 'b'
}

/**
 * Type of a piece id in a state.
 *
 * @param {object} state engine state
 * @param {number} id piece id 0..31
 * @return {string}
 */
export function typeOfId(state, id) {
	return state.types[id]
}

/**
 * Upper-case the first letter (sentence case for names that start a sentence).
 *
 * @param {string} text text
 * @return {string}
 */
export function capitalise(text) {
	return text === '' ? text : text.charAt(0).toLocaleUpperCase() + text.slice(1)
}

/**
 * Sentence case for spoken text: upper-case the first letter of every sentence.
 *
 * @param {string} text text
 * @return {string}
 */
export function sentenceCase(text) {
	return text.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (match, lead, letter) => lead + letter.toLocaleUpperCase())
}
