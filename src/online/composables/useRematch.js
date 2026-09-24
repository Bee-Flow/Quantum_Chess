/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The rematch of a finished online game: offering, accepting, declining and withdrawing it, and following its state. A
 * rematch is a new game that the server links to the finished one (`rematchId`). Only changes seen in this session take
 * the player into the new game.
 */

import { t } from '@nextcloud/l10n'
import { computed, shallowRef } from 'vue'

/** @typedef {import('../../services/api.js').GameFull} GameFull */
/** @typedef {import('../../services/api.js').GameLive} GameLive */

/**
 * A game without its move list and chat (GameFull → GameLive shape).
 *
 * @param {GameFull|GameLive} full the game
 * @return {object}
 */
export function withoutLists(full) {
	const copy = { ...full }
	delete copy.moves
	delete copy.chat
	return copy
}

/**
 * @param {object} game the finished game
 * @param {number} game.gameId its id
 * @param {object} game.api the HTTP client (`services/api.js`)
 * @param {string|null} game.me the viewer's user id
 * @param {(fn: () => Promise<object>) => Promise<object|null>} game.act runs a game action and refreshes the game
 * @param {() => void} game.pollNow poll the server now
 * @param {object} deps injected dependencies: notify {info}, now, onRematchStarted
 * @return {object} {rematchGame, rematchState, offeredAt, load, follow, rematch, cancelRematch, declineRematch}
 */
export function useRematch({ gameId, api, me, act, pollNow }, deps) {
	/** The rematch game (GameLive), once there is one. */
	const rematchGame = shallowRef(null)
	let since = 0
	let requested = false

	/** `pending` while the viewer's own offer waits, `offered` when the other player offers one. */
	const rematchState = computed(() => {
		const r = rematchGame.value
		if (!r || r.status !== 'pending') {
			return null
		}
		return r.creator?.userId === me ? 'pending' : 'offered'
	})

	/**
	 * Load the rematch game of a finished game.
	 *
	 * @param {number} rid rematch game id
	 */
	async function load(rid) {
		try {
			rematchGame.value = withoutLists(await api.getGame(rid))
			since = deps.now()
			pollNow()
		} catch {
			rematchGame.value = null
		}
	}

	/**
	 * React to a change of the rematch game: move into it when it started, tell the player when it was declined.
	 *
	 * @param {string|null} before the previous status
	 */
	function follow(before) {
		const r = rematchGame.value
		if (!r || r.status === before) {
			return
		}
		if (r.status === 'active' && (before === 'pending' || requested)) {
			deps.notify.info(t('quantumchess', 'The rematch has started'))
			deps.onRematchStarted(r.id)
		} else if (['declined', 'expired', 'cancelled'].includes(r.status) && before === 'pending'
			&& r.creator?.userId === me) {
			requested = false
			deps.notify.info(t('quantumchess', 'The rematch was declined'))
		}
	}

	/** Accept the other player's offer, or offer a rematch. */
	async function rematch() {
		const r = rematchGame.value
		if (r?.status === 'pending' && r.creator?.userId === me) {
			return
		}
		if (r?.status === 'active') {
			deps.onRematchStarted(r.id)
			return
		}
		requested = true
		const before = r?.status ?? null
		const next = await act(() => api.requestRematch(gameId))
		if (next) {
			rematchGame.value = withoutLists(next)
			since = deps.now()
			follow(before)
		}
	}

	/** Withdraw the viewer's own rematch offer. */
	async function cancelRematch() {
		const r = rematchGame.value
		if (r?.status === 'pending' && r.creator?.userId === me) {
			requested = false
			const res = await act(() => api.cancelGame(r.id))
			if (res) {
				rematchGame.value = res
			}
		}
	}

	/** Decline the other player's rematch offer. */
	async function declineRematch() {
		const r = rematchGame.value
		if (r?.status === 'pending') {
			const res = await act(() => api.declineGame(r.id))
			if (res) {
				rematchGame.value = res
			}
		}
	}

	return {
		rematchGame,
		rematchState,
		/**
		 * When the rematch was last offered or loaded (ms); polling stays quick for a while after it.
		 *
		 * @return {number}
		 */
		offeredAt: () => since,
		load,
		follow,
		rematch,
		cancelRematch,
		declineRematch,
	}
}
