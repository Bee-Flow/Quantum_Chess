/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The texts of variant games: outcome labels, follow-up rolls, results, the lines a variant adds to a move record,
 * option values, move codes (and the move list's long algebraic notation) and the rules shared by every variant. A
 * variant may add its own texts with the optional hooks `noteText(note)`, `reasonText(reason)`,
 * `infoText(record, viewer, { brief })`, `codeText(code, record, { type, capture, state })`, `outcomeSquare(key,
 * { record, state })` (a square named by an outcome, as the move list writes it) and `dangerText(state, side,
 * percent)` (the danger line), and describe option values with `options[i].describe(value)`.
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
 * hand, without a reason: a drop misses on a square that was taken, but in shogi also where a pawn drop would mate. A
 * square (where a measured ghost was found) is written by the variant's `outcomeSquare(key, { record, state })` when
 * it has one (the multiverse adds the board's turn: `(+2T1)d3`), with the move's history record or, for a move not yet
 * played, the state before it.
 *
 * @param {string} key miss, move, capture, split, gone or a square name
 * @param {string} [code] the move code
 * @param {object} [where] where the move is
 * @param {object} [where.V] variant
 * @param {object|null} [where.record] the move's history record
 * @param {object|null} [where.state] the state before the move
 * @return {string}
 */
export function outcomeText(key, code = '', { V = null, record = null, state = null } = {}) {
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
		default: {
			const own = V?.outcomeSquare ? V.outcomeSquare(key, { record, state }) : null
			return t('quantumchess', 'On {square}', { square: typeof own === 'string' && own ? own : key })
		}
	}
}

/**
 * The danger line: "Your king is in danger: 50 %", or the variant's own `dangerText(state, side, percent)` (the
 * multiverse names the boards and says king or royal queen).
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} side the side whose danger it is
 * @param {number} p the chance
 * @return {string}
 */
export function dangerLine(V, state, side, p) {
	const own = V.dangerText ? V.dangerText(state, side, percent(p)) : null
	if (typeof own === 'string' && own) {
		return own
	}
	return t('quantumchess', 'Your king is in danger: {percent}', { percent: percent(p) })
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
 * The line that says an outcome ends the game ("The game ends: White wins (three checks)"), or '' when it does not or
 * when one of its roll notes already says so (an `end:` note of the game-end roll with a result).
 *
 * @param {object} V variant
 * @param {object|null|undefined} result the result after the outcome (`outcomes()`), or the game's result
 * @param {string[]} [notes] the roll notes of the outcome
 * @return {string}
 */
export function endText(V, result, notes = []) {
	if (!result || notes.some((note) => note.startsWith('end:') && note !== 'end:null')) {
		return ''
	}
	return t('quantumchess', 'The game ends: {result}', { result: resultText(V, result) })
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
		t('quantumchess', 'Measure: instead of a move, find out where one of your ghosts really is.'),
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
 * (`infoText(record, viewer, { brief })`: announcements, "Blue is out", a check mark) and one line per side that could
 * not move and sat out. `brief` asks for the lines that carry information only (the move list; Kriegspiel leaves out
 * "White moved." and "No pawn tries." there, which the umpire box still says).
 *
 * @param {object} V variant
 * @param {object} record history record
 * @param {number} viewer the side whose view is shown
 * @param {object} [opts] options
 * @param {boolean} [opts.brief] only the lines that carry information
 * @return {string[]}
 */
export function recordLines(V, record, viewer, { brief = false } = {}) {
	const out = []
	const own = V.infoText ? V.infoText(record, viewer, { brief }) : null
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
 * A move code for the move list: the variant's own `codeText(code, record)` first, with the history record of the
 * move when there is one (the multiverse writes a split or merge in absolute board coordinates from `record.info`);
 * otherwise a drop of a one-letter piece type is written with a capital letter (`p@e4` → `P@e4`) and every other code
 * as stored.
 *
 * @param {object} V variant
 * @param {string} code move code
 * @param {object|null} [record] the history record of the move, or null
 * @return {string}
 */
export function codeText(V, code, record = null) {
	const own = V.codeText ? V.codeText(code, record) : null
	if (typeof own === 'string' && own) {
		return own
	}
	const m = /^([a-z])@(.+)$/.exec(code)
	return m ? m[1].toUpperCase() + '@' + m[2] : code
}

/** A square name on one of several boards, with the board in front (`A:e4` in bughouse). */
const BOARD_NAME = /^([A-Z0-9]+):(.+)$/

/**
 * A move in long algebraic notation for the move list and the move waiting for confirmation: the letter of the piece
 * that moved (none for a pawn), the from square, `-` or `x` (something was captured), the target, and the promotion:
 * `Ng1-f3`, `e4xd5`, `e7-e8=Q`, with the quantum moves written the same way: a split `Ng1-f3|h3`, a merge
 * `Nf3|h3-g5`, a drop `N@f3` and a measurement `?f3`. On several boards whose squares are named `A:e4` (bughouse), the
 * board is written once, in front (`A: Ng1-f3|h3`). Where square names begin with a capital letter (the levels of 3D
 * and 4D chess, `Bc2`), a space keeps the piece letter apart (`N Bb1-Bc3`). The variant's own
 * `codeText(code, record, { type, capture, state })` comes first (the multiverse writes its moves in the manner of
 * 5dpgn); a code that is none of these (castling `O-O`) is written by `codeText`. A move whose piece is not known
 * (games saved before the move list kept it) is written without a letter.
 *
 * @param {object} V variant
 * @param {string} code move code
 * @param {object} [opts] options
 * @param {object|null} [opts.record] the history record of the move (its captures), or null
 * @param {string|null} [opts.type] the type of the piece that moved, or null when it is not known
 * @param {boolean} [opts.capture] without a record: whether the move captures
 * @param {object|null} [opts.state] without a record: the state before the move
 * @return {string}
 */
export function moveText(V, code, { record = null, type = null, capture = false, state = null } = {}) {
	const own = V.codeText ? V.codeText(code, record, { type, capture, state }) : null
	if (typeof own === 'string' && own) {
		return own
	}
	const plain = codeText(V, code, record)
	const m = /^([^|@?=]+?)(?:\|([^|@?=]+?))?-([^|@?=]+?)(?:\|([^|@?=]+?))?(?:=(.+))?$/.exec(code)
	const drop = /^(\+?[a-z]+)@(.+)$/.exec(code)
	if (!m && !drop) {
		return plain
	}
	const names = drop ? [drop[2]] : [m[1], m[2], m[3], m[4]].filter(Boolean)
	if (names.some((name) => V.topology.byName(name) < 0)) {
		return plain
	}
	// one board for every square: write it once, in front
	const boards = new Set(names.map((name) => BOARD_NAME.exec(name)?.[1] ?? ''))
	const board = boards.size === 1 ? [...boards][0] : ''
	const bare = (name) => (board ? name.slice(board.length + 1) : name)
	const tag = board ? board + ': ' : ''
	if (drop) {
		return tag + drop[1].toUpperCase() + '@' + bare(drop[2])
	}
	// no letter for a pawn, nor when the piece is not known
	const letter = !type || type === 'p' ? '' : type.toUpperCase()
	const first = bare(m[1])
	const gap = letter && /^[A-Z]/.test(first) ? ' ' : ''
	const took = record ? (record.captures?.length ?? 0) > 0 : capture
	const from = m[2] ? first + '|' + bare(m[2]) : first
	const to = m[4] ? bare(m[3]) + '|' + bare(m[4]) : bare(m[3])
	const promo = m[5] ? '=' + m[5].toUpperCase() : ''
	return tag + letter + gap + from + (took ? 'x' : '-') + to + promo
}
