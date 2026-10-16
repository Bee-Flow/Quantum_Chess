/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Words for GameSummary fields shared by the lobby cards, the invitation panel and the recent games.
 */

import { n, t } from '@nextcloud/l10n'
import { otherColor } from '../engine/index.js'
import { reasonCopy } from '../game/resultText.js'
import { formatDeadline } from '../services/format.js'
import { reasonText } from '../variantplay/texts.js'
import { catalogEntry } from '../variants/index.js'

/** @typedef {import('../services/api.js').GameSummary} GameSummary */
/** @typedef {import('../services/api.js').UserRef} UserRef */

/**
 * "3 days per move" / "No deadline".
 *
 * @param {string} tc time control, e.g. corr:3d
 * @return {string}
 */
export function timeControlText(tc) {
	const m = /^corr:(\d+)d$/.exec(tc ?? '')
	if (!m) {
		return t('quantumchess', 'No deadline')
	}
	return n('quantumchess', '%n day per move', '%n days per move', Number(m[1]))
}

/**
 * The other player of a game from the viewer's side.
 *
 * @param {GameSummary} g the game
 * @param {string|null} me viewer uid
 * @return {UserRef|null}
 */
export function otherPlayer(g, me) {
	if (Array.isArray(g.seats)) {
		return otherPlayers(g, me)[0] ?? null
	}
	if (g.white && g.black) {
		return g.white.userId === me ? g.black : g.white
	}
	if (g.creator?.userId === me) {
		return g.opponent ?? null
	}
	return g.creator ?? null
}

/**
 * The viewer's colour before and after the start: "You play White", "Colours are drawn at the start".
 *
 * @param {GameSummary} g the game
 * @param {string|null} me viewer uid
 * @return {string}
 */
export function colorText(g, me) {
	if (Array.isArray(g.seats)) {
		return g.colorChoice === 'r'
			? t('quantumchess', 'Seats are drawn at the start')
			: t('quantumchess', 'Seats as chosen by {name}', { name: g.creator?.displayName ?? '' })
	}
	let color = g.myColor
	if (!color && g.colorChoice && g.colorChoice !== 'r') {
		color = g.creator?.userId === me ? g.colorChoice : otherColor(g.colorChoice)
	}
	if (color === 'w') {
		return t('quantumchess', 'You play White')
	}
	if (color === 'b') {
		return t('quantumchess', 'You play Black')
	}
	return t('quantumchess', 'Colours are drawn at the start')
}

/**
 * "Move 14 · 18 h left" ("18 h left" for a chess variant game).
 *
 * @param {GameSummary} g the game
 * @param {number} now Unix seconds
 * @return {string}
 */
export function progressText(g, now) {
	// a variant game counts its plies differently (several moves per turn in 5D chess): its badge names the variant
	const move = g.variant ? '' : t('quantumchess', 'Move {n}', { n: Math.floor((g.ply ?? 0) / 2) + 1 })
	const left = g.deadlineAt ? formatDeadline(g.deadlineAt, now) : ''
	return [move, left].filter(Boolean).join(' · ')
}

/**
 * The result from the viewer's side with the rating change: "Won · +12", "Lost", "Draw", "Aborted".
 *
 * @param {GameSummary} g the game
 * @return {{text: string, outcome: 'win'|'loss'|'draw'|'aborted', delta: string}}
 */
export function outcomeText(g) {
	if (g.status === 'aborted') {
		return { text: t('quantumchess', 'Aborted'), outcome: 'aborted', delta: '' }
	}
	const delta = g.ratingChange && g.myColor ? g.ratingChange[g.myColor] : null
	const deltaText = typeof delta === 'number' ? (delta >= 0 ? '+' : '') + delta : ''
	let outcome
	if (Array.isArray(g.seats)) {
		// a game of more than two seats keeps the result '*': the variant result code names the winning seats
		const winners = seatedWinners(g)
		const mine = g.myColor === null || g.myColor === undefined ? null : Number(g.myColor)
		outcome = !winners.length ? 'draw' : (winners.includes(mine) ? 'win' : 'loss')
	} else {
		outcome = !g.winner ? 'draw' : (g.winner === g.myColor ? 'win' : 'loss')
	}
	const text = {
		draw: t('quantumchess', 'Draw'),
		win: t('quantumchess', 'Won'),
		loss: t('quantumchess', 'Lost'),
	}[outcome]
	return { text, outcome, delta: deltaText }
}

/**
 * The winning seats of a game with more than two seats from its variant result code ("win:0,2/resignation"); empty for
 * a draw or a game without a result.
 *
 * @param {GameSummary} g the game
 * @return {number[]}
 */
export function seatedWinners(g) {
	const m = /^win:(\d+(?:,\d+)*)\//.exec(g?.variantResult ?? '')
	return m ? m[1].split(',').map(Number) : []
}

/**
 * Why a finished game ended, for the recent games: "Alice resigned", "Draw by agreement"; '' for an aborted game or an
 * unknown reason. A game with more than two seats names no colour: "A player resigned".
 *
 * @param {GameSummary} g the game
 * @return {string}
 */
export function endReasonText(g) {
	if (g.status === 'aborted') {
		return ''
	}
	const reason = g.resultReason ?? ''
	if (!Array.isArray(g.seats)) {
		const names = { w: g.white?.displayName ?? '', b: g.black?.displayName ?? '' }
		return reasonCopy(reason, { winner: g.winner, names })
	}
	const words = {
		resignation: t('quantumchess', 'A player resigned'),
		timeout: t('quantumchess', 'A player ran out of time'),
		abandoned: t('quantumchess', 'The game was abandoned'),
		agreement: t('quantumchess', 'Draw by agreement'),
		player_deleted: t('quantumchess', 'A player’s account was deleted'),
	}
	if (words[reason]) {
		return words[reason]
	}
	// the generic words of the variant rules ("a king was captured"); the variant itself is not loaded on Home
	const text = reason ? reasonText({}, reason) : ''
	return text && text !== reason ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}

/**
 * The name of the chess variant of a game, or '' for a game of classic Quantum Chess.
 *
 * @param {{variant?: string|null}} game the game
 * @return {string}
 */
export function variantText(game) {
	return game?.variant ? (catalogEntry(game.variant)?.name() ?? game.variant) : ''
}

/**
 * The other players of a game with more than two seats (`seats`), in seat order; for any other game the opponent.
 *
 * @param {GameSummary} g the game
 * @param {string|null} me viewer uid
 * @return {UserRef[]}
 */
export function otherPlayers(g, me) {
	if (!Array.isArray(g?.seats)) {
		const other = otherPlayer(g, me)
		return other ? [other] : []
	}
	return g.seats.map((s) => s.player).filter((p) => p && p.userId !== me)
}

/**
 * The players of a game with more than two seats in seat order, an open seat included: "Alice, Bob, open seat, Carol".
 *
 * @param {GameSummary} g the game
 * @return {string}
 */
export function seatsText(g) {
	return (g?.seats ?? []).map((s) => s.player?.displayName ?? t('quantumchess', 'open seat')).join(', ')
}

/**
 * Names joined as a list: "Alice", "Alice and Bob", "Alice, Bob and Carol".
 *
 * @param {string[]} names the names
 * @return {string}
 */
export function nameList(names) {
	const list = names.filter(Boolean)
	if (list.length < 2) {
		return list[0] ?? ''
	}
	// TRANSLATORS: the end of a list of player names, such as "Alice, Bob and Carol"; {list} is "Alice, Bob"
	return t('quantumchess', '{list} and {last}', { list: list.slice(0, -1).join(', '), last: list[list.length - 1] })
}

/**
 * The other players of a game in words: "Bob" for a game of two, "Alice, Bob and Carol" for a game of four (open seats
 * left out).
 *
 * @param {GameSummary} g the game
 * @param {string|null} me viewer uid
 * @return {string}
 */
export function playersText(g, me) {
	return nameList(otherPlayers(g, me).map((p) => p.displayName ?? p.userId ?? ''))
}

/**
 * The player whose move it is in a running game, or null.
 *
 * @param {GameSummary} g the game
 * @return {UserRef|null}
 */
export function toMovePlayer(g) {
	if (Array.isArray(g?.seats)) {
		return g.seats.find((s) => String(s.seat) === String(g.turn))?.player ?? null
	}
	if (g?.turn === 'w') {
		return g.white ?? null
	}
	return g?.turn === 'b' ? (g.black ?? null) : null
}

/**
 * The name of the player whose move it is in a running game, or ''.
 *
 * @param {GameSummary} g the game
 * @return {string}
 */
export function toMoveName(g) {
	const p = toMovePlayer(g)
	return p?.displayName ?? p?.userId ?? ''
}

/**
 * Whose move it is, from the viewer's side: "Your move" or "Waiting for Carol".
 *
 * @param {GameSummary} g the game
 * @return {string}
 */
export function turnText(g) {
	if (g.yourTurn) {
		return t('quantumchess', 'Your move')
	}
	const name = toMoveName(g)
	return name ? t('quantumchess', 'Waiting for {name}', { name }) : t('quantumchess', 'Waiting for opponent')
}

/**
 * A game with more than two seats that waits for players: "Waiting for players (2 of 4)", counting the seats taken.
 *
 * @param {GameSummary} g the game
 * @return {string}
 */
export function seatsJoinedText(g) {
	const seats = g?.seats ?? []
	const joined = seats.filter((s) => s.player && s.accepted).length
	return t('quantumchess', 'Waiting for players ({joined} of {seats})', { joined, seats: seats.length })
}
