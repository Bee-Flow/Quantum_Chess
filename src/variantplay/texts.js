/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The texts of variant games: outcome labels, follow-up rolls, results, the lines a variant adds to a move record,
 * option values, move codes and the rules shared by every variant. A variant may add its own texts with the optional
 * hooks `noteText(note)`, `reasonText(reason)`, `infoText(record, viewer)` and `codeText(code)`, and describe option
 * values with `options[i].describe(value)`.
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
 * The label of an outcome key. A drop (a code with `@`) reads "Dropped", and its miss says that the piece stays in
 * hand, without a reason: a drop misses on a square that was taken, but in shogi also where a pawn drop would mate.
 *
 * @param {string} key miss, move, capture, split, gone or a square name
 * @param {string} [code] the move code
 * @return {string}
 */
export function outcomeText(key, code = '') {
	const drop = typeof code === 'string' && code.includes('@')
	switch (key) {
		case 'miss':
			return drop ? t('quantumchess', 'Missed: the piece stays in hand') : t('quantumchess', 'Missed')
		case 'move':
			return drop ? t('quantumchess', 'Dropped') : t('quantumchess', 'Moved')
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
 * The label of a follow-up roll note (`solid:…` or `end:…`). The variant's own `noteText(note)` is asked first (for
 * example a three-check counter roll); a string from it wins.
 *
 * @param {object} V variant
 * @param {string} note note
 * @return {string}
 */
export function noteText(V, note) {
	const own = V.noteText ? V.noteText(note) : null
	if (typeof own === 'string' && own) {
		return own
	}
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
		case 'bareKings':
			return t('quantumchess', 'only the two kings are left')
		case 'cannotEscape':
			// TRANSLATORS: why a game ended: every move of the loser would have let its king be captured for certain
			return t('quantumchess', 'the king could not escape')
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
 * The quantum rules shared by every variant, as short sentences. The sentence on castling and en passant is left out
 * for a variant that has neither (`specialMoves: false`). A variant with royal pieces also gets "capture the king"
 * (worded so that it does not deny check: three-check counts checks and Kriegspiel's umpire announces them; check
 * just never limits a move), and one with the classic escape rule (`escapeRule`, docs/rules.md 5) the king that
 * cannot escape, so the variant's own card only says what is special in it.
 *
 * @param {object} [V] variant
 * @return {string[]}
 */
export function sharedRules(V = null) {
	const out = [
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
	]
	if (V?.specialMoves !== false) {
		out.push(t(
			'quantumchess',
			'Castling and en passant are only possible when they are possible in every possibility, and they are never rolled.',
		))
	}
	out.push(
		t('quantumchess', 'If the game might be over in some possibilities but not in others, a roll decides.'),
		t('quantumchess', 'Each side has a budget of 8 possible arrangements of its pieces.'),
	)
	if (V?.royalTypes?.size > 0) {
		out.push(t(
			'quantumchess',
			'Check does not limit your moves: you win by capturing the enemy king, unless the variant has its own goal.',
		))
		if (V.escapeRule) {
			out.push(t(
				'quantumchess',
				'Your king cannot escape: if every move you could make would leave your king to be captured for certain, you lose at once, unless one of your moves could still capture the enemy king.',
			))
		}
	}
	return out
}

/**
 * The lines a move record adds to the move list and the last-move box: the variant's own lines
 * (`infoText(record, viewer)`: announcements, "Blue is out", a check mark) and one line per side that could not move
 * and sat out.
 *
 * @param {object} V variant
 * @param {object} record history record
 * @param {number} viewer the side whose view is shown
 * @return {string[]}
 */
export function recordLines(V, record, viewer) {
	const out = []
	const own = V.infoText ? V.infoText(record, viewer) : null
	if (Array.isArray(own)) {
		out.push(...own.filter((line) => typeof line === 'string' && line))
	}
	for (const side of record.skipped ?? []) {
		out.push(t('quantumchess', '{side} cannot move and sits out', { side: sideName(V, side) }))
	}
	return out
}

/**
 * The value of a game option for display: the option's own `describe(value)` when it has one, the label of the
 * choice, yes / no, or the number.
 *
 * @param {object} option option declaration
 * @param {string|number|boolean} value the value
 * @return {string}
 */
export function optionValueText(option, value) {
	const own = option.describe ? option.describe(value) : null
	if (typeof own === 'string' && own) {
		return own
	}
	if (option.type === 'choice') {
		const choice = option.values?.find((c) => c.id === value)
		if (choice) {
			return typeof choice.label === 'function' ? choice.label() : String(choice.label)
		}
	}
	if (option.type === 'boolean') {
		return value ? t('quantumchess', 'Yes') : t('quantumchess', 'No')
	}
	return String(value)
}

/**
 * One line per option of a game: "Start position (0–959): RNBQKBNR".
 *
 * @param {object} V variant
 * @param {object} options the option values of the game
 * @return {string[]}
 */
export function optionLines(V, options = {}) {
	return (V.options ?? []).map((o) => t('quantumchess', '{option}: {value}', {
		option: typeof o.label === 'function' ? o.label() : String(o.label ?? o.id),
		value: optionValueText(o, options[o.id] ?? o.default),
	}))
}

/**
 * A move code for the move list: the variant's own `codeText(code)` first; otherwise a drop of a one-letter piece
 * type is written with a capital letter (`p@e4` → `P@e4`) and every other code as stored.
 *
 * @param {object} V variant
 * @param {string} code move code
 * @return {string}
 */
export function codeText(V, code) {
	const own = V.codeText ? V.codeText(code) : null
	if (typeof own === 'string' && own) {
		return own
	}
	const m = /^([a-z])@(.+)$/.exec(code)
	return m ? m[1].toUpperCase() + '@' + m[2] : code
}
