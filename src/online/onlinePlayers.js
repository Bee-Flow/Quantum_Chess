/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The players, the result and the capabilities of an online game as the game screen shows them, derived from the
 * server's game record (GameLive). Pure functions; `useOnlineGame` wraps them in computed values.
 */

import { t } from '@nextcloud/l10n'
import { formatDeadline } from '../services/format.js'

/** @typedef {import('../services/api.js').GameLive} GameLive */
/** @typedef {import('../services/api.js').UserRef} UserRef */

/**
 * @typedef {object} Viewer
 * @property {string|null} uid the viewer's user id
 * @property {string} displayName the viewer's display name
 */

/**
 * Whether the viewer plays in this game (as creator, invited opponent or seated player).
 *
 * @param {GameLive|null} game the game
 * @param {string|null} me the viewer's user id
 * @return {boolean}
 */
export function isParticipant(game, me) {
	return !!game && !!me && [game.creator?.userId, game.opponent?.userId, game.white?.userId, game.black?.userId].includes(me)
}

/**
 * The user in a colour's seat. Before the start the seats follow the colour choice; with random colours the viewer is
 * shown at the bottom as White until the server draws the colours.
 *
 * @param {GameLive|null} game the game
 * @param {'w'|'b'} color the seat
 * @param {Viewer} viewer who is looking
 * @return {UserRef|null}
 */
export function seatOf(game, color, viewer) {
	if (!game) {
		return null
	}
	if (game.white || game.black) {
		return color === 'w' ? game.white : game.black
	}
	const creatorColor = game.colorChoice === 'b' ? 'b' : 'w'
	if (game.creator?.userId !== viewer.uid && game.colorChoice === 'r') {
		return color === 'w' ? game.opponent ?? { userId: viewer.uid, displayName: viewer.displayName } : game.creator
	}
	return color === creatorColor ? game.creator : game.opponent
}

/**
 * The display name of a seat: the user, "Open seat" for an open challenge, else the colour.
 *
 * @param {GameLive|null} game the game
 * @param {'w'|'b'} color the seat
 * @param {Viewer} viewer who is looking
 * @return {string}
 */
export function seatName(game, color, viewer) {
	const user = seatOf(game, color, viewer)
	if (user?.displayName) {
		return user.displayName
	}
	if (game?.status === 'open') {
		return t('quantumchess', 'Open seat')
	}
	return color === 'w' ? t('quantumchess', 'White') : t('quantumchess', 'Black')
}

/**
 * The PlayerInfo of one seat, with the status line under the name ("● Your move · 18 h left").
 *
 * @param {GameLive|null} game the game
 * @param {'w'|'b'} color the seat
 * @param {object} context what else the card shows
 * @param {Viewer} context.viewer who is looking
 * @param {{w: string, b: string}} context.names display names of both seats
 * @param {'w'|'b'|null} context.myColor the viewer's colour
 * @param {number} context.now the server's time in Unix seconds
 * @return {import('../game/gameController.js').PlayerInfo}
 */
export function onlinePlayerInfo(game, color, { viewer, names, myColor, now }) {
	const user = seatOf(game, color, viewer)
	const rating = game?.ratings?.[color] ?? null
	let statusText = ''
	if (game && (game.status === 'pending' || game.status === 'open')) {
		statusText = t('quantumchess', 'Not started yet')
	} else if (game?.status === 'active' && game.turn === color) {
		const left = game.deadlineAt ? formatDeadline(game.deadlineAt, now) : ''
		const who = color === myColor ? t('quantumchess', 'Your move') : t('quantumchess', '{name} to move', { name: names[color] })
		statusText = '● ' + who + (left ? ' · ' + left : '')
	}
	return {
		color,
		kind: 'user',
		name: names[color],
		userId: user?.userId ?? undefined,
		rating: rating?.rating ?? undefined,
		provisional: rating?.provisional ?? false,
		deadlineAt: game?.deadlineAt ?? undefined,
		statusText,
	}
}

/**
 * The end of an online game, as decided by the server.
 *
 * @param {GameLive|null} game the game
 * @return {import('../game/gameController.js').GameResult|null}
 */
export function onlineResult(game) {
	if (game?.status === 'finished') {
		return { result: game.result, reason: game.resultReason, winner: game.winner ?? null, source: 'server' }
	}
	if (game?.status === 'aborted') {
		return { result: '*', reason: 'aborted', winner: null, source: 'server' }
	}
	return null
}
