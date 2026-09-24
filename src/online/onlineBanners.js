/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The banners of an online game above the board: a history the server changed, a game that cannot be verified, a move
 * that could not be sent, and the connection state.
 */

import { t } from '@nextcloud/l10n'

/**
 * The banners to show.
 *
 * @param {object} status the game's state
 * @param {{ply: number}|null} status.altered the first move that does not match its hash chain, if any
 * @param {boolean} status.unverifiable the chain cannot be checked (a player's account was deleted)
 * @param {string|null} status.pendingPhase phase of the move on its way: sending, retrying or failed
 * @param {string} status.connection the poller's connection state
 * @param {object} actions what the banner buttons do
 * @param {() => void} actions.retry send the failed move again
 * @param {() => void} actions.undo drop the failed move
 * @param {() => void} actions.reload reload the page
 * @return {import('../game/gameController.js').GameBanner[]}
 */
export function onlineBanners({ altered, unverifiable, pendingPhase, connection }, { retry, undo, reload }) {
	const list = []
	if (altered) {
		list.push({
			id: 'altered',
			type: 'error',
			text: t('quantumchess', 'Game history was altered on the server'),
			actions: [],
		})
	} else if (unverifiable) {
		list.push({
			id: 'unverifiable',
			type: 'info',
			text: t('quantumchess', 'Can’t be verified: a player’s account was deleted'),
			actions: [],
		})
	}
	if (pendingPhase === 'failed') {
		list.push({
			id: 'pending',
			type: 'warning',
			text: t('quantumchess', 'Your move hasn’t been sent'),
			actions: [
				{ label: t('quantumchess', 'Retry'), handler: retry },
				{ label: t('quantumchess', 'Undo'), handler: undo },
			],
		})
	}
	if (connection === 'expired') {
		list.push({
			id: 'connection',
			type: 'error',
			text: t('quantumchess', 'Your session expired. Reload the page.'),
			actions: [{ label: t('quantumchess', 'Reload'), handler: reload }],
		})
	} else if (connection === 'maintenance') {
		list.push({
			id: 'connection',
			type: 'warning',
			text: t('quantumchess', 'Nextcloud is in maintenance mode'),
			actions: [],
		})
	} else if (connection === 'retrying' || connection === 'offline' || pendingPhase === 'retrying') {
		list.push({
			id: 'connection',
			type: 'warning',
			text: t('quantumchess', 'Connection lost, retrying…'),
			actions: [],
		})
	}
	return list
}
