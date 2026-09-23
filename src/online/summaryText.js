/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Words for GameSummary fields shared by the lobby cards, the invitation panel and the recent games.
 */

import { n, t } from '@nextcloud/l10n'
import { formatDeadline } from '../services/format.js'

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
 * @param {object} g GameSummary
 * @param {string|null} me viewer uid
 * @return {object|null} UserRef
 */
export function otherPlayer(g, me) {
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
 * @param {object} g GameSummary
 * @param {string|null} me viewer uid
 * @return {string}
 */
export function colorText(g, me) {
	let color = g.myColor
	if (!color && g.colorChoice && g.colorChoice !== 'r') {
		color = g.creator?.userId === me ? g.colorChoice : (g.colorChoice === 'w' ? 'b' : 'w')
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
 * "Move 14 · 18 h left".
 *
 * @param {object} g GameSummary
 * @param {number} now Unix seconds
 * @return {string}
 */
export function progressText(g, now) {
	const move = t('quantumchess', 'Move {n}', { n: Math.floor((g.ply ?? 0) / 2) + 1 })
	const left = g.deadlineAt ? formatDeadline(g.deadlineAt, now) : ''
	return left ? `${move} · ${left}` : move
}

/**
 * The result from the viewer's side with the rating change: "Won · +12", "Lost", "Draw", "Aborted".
 *
 * @param {object} g GameSummary
 * @return {{text: string, outcome: 'win'|'loss'|'draw'|'aborted', delta: string}}
 */
export function outcomeText(g) {
	if (g.status === 'aborted') {
		return { text: t('quantumchess', 'Aborted'), outcome: 'aborted', delta: '' }
	}
	const delta = g.ratingChange && g.myColor ? g.ratingChange[g.myColor] : null
	const deltaText = typeof delta === 'number' ? (delta >= 0 ? '+' : '') + delta : ''
	if (!g.winner) {
		return { text: t('quantumchess', 'Draw'), outcome: 'draw', delta: deltaText }
	}
	return g.winner === g.myColor
		? { text: t('quantumchess', 'Won'), outcome: 'win', delta: deltaText }
		: { text: t('quantumchess', 'Lost'), outcome: 'loss', delta: deltaText }
}
