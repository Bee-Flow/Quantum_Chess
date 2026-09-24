/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The lobby store: a singleton seeded from the `lobby` initial state, so Home and the navigation paint without a
 * request. `start()` polls the cheap summary with its ETag (30 s, 15 s while Home shows the lobby, 120 s in a hidden
 * tab) and loads the full lobby only when the token changed.
 */

import { showError } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import { computed, ref } from 'vue'
import * as realApi from '../../services/api.js'
import { initial } from '../../services/initialState.js'
import { usePoller } from './usePoller.js'

let store = null

/**
 * Create a lobby store (exported for tests; the app uses the singleton `useLobby()`).
 *
 * @param {object} [deps] {api, initialLobby, notify, poller}
 * @return {object}
 */
export function createLobby(deps = {}) {
	const d = { api: realApi, initialLobby: initial('lobby', null), notify: (text) => showError(text), poller: {}, ...deps }
	const api = d.api
	const lobby = ref(d.initialLobby)
	const loading = ref(false)
	const error = ref(null)
	let etag = d.initialLobby?.rev ? `"${d.initialLobby.rev}"` : null
	let fastWatchers = 0

	const counts = computed(() => {
		const c = lobby.value?.counts ?? {}
		const yourTurn = c.yourTurn ?? 0
		const invitations = c.invitations ?? 0
		return { yourTurn, invitations, total: yourTurn + invitations }
	})

	/** Load the full lobby. */
	async function refresh() {
		loading.value = true
		try {
			lobby.value = await api.getLobby()
			if (lobby.value?.rev) {
				etag = `"${lobby.value.rev}"`
			}
			error.value = null
		} catch (e) {
			error.value = e
			throw e
		} finally {
			loading.value = false
		}
	}

	/** One summary poll: reload the lobby when the token changed. */
	async function pollOnce() {
		const res = await api.getSummary(etag)
		if (res.status === 304) {
			return
		}
		const token = res.data?.rev ?? null
		if (res.etag) {
			etag = res.etag
		}
		if (token === null || token !== lobby.value?.rev) {
			await refresh()
		}
	}

	const poller = usePoller(pollOnce, {
		interval: ({ hidden }) => (hidden ? 120000 : (fastWatchers > 0 ? 15000 : 30000)),
		...d.poller,
	})

	/**
	 * Run an action on a game, then reload the lobby.
	 *
	 * @param {() => Promise<object>} fn API call
	 * @return {Promise<object|null>} the answer
	 */
	async function act(fn) {
		try {
			const res = await fn()
			await refresh().catch(() => {})
			return res
		} catch (e) {
			d.notify(e?.message || t('quantumchess', 'That did not work. Please try again.'))
			await refresh().catch(() => {})
			return null
		}
	}

	return {
		lobby,
		counts,
		loading,
		error,
		refresh: () => refresh().catch(() => {}),
		/** Start polling (idempotent). */
		start: () => poller.start({ immediate: false }),
		stop: () => poller.stop(),
		/** Check the summary now (after an action elsewhere). */
		poke: () => poller.pollNow(),
		/**
		 * Home shows the lobby: poll faster until the returned function is called.
		 *
		 * @return {() => void} release
		 */
		watchFast() {
			fastWatchers++
			poller.pollNow()
			let released = false
			return () => {
				if (!released) {
					released = true
					fastWatchers--
				}
			}
		},
		connection: poller.connection,
		accept: (id) => act(() => api.acceptGame(id)),
		decline: (id) => act(() => api.declineGame(id)),
		cancel: (id) => act(() => api.cancelGame(id)),
		join: (id) => act(() => api.joinGame(id)),
		rematch: (id) => act(() => api.requestRematch(id)),
	}
}

/**
 * The lobby store (singleton).
 *
 * @return {object} {lobby, counts, loading, error, refresh(), start(), stop(), poke(), watchFast(), accept(id),
 *   decline(id), cancel(id), join(id), rematch(id)}
 */
export function useLobby() {
	if (!store) {
		store = createLobby()
	}
	return store
}
