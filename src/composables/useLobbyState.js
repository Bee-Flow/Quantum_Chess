/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The lobby for the shell: `useLobby()` of frontend-online (`src/online/lobby.js`) when it is bundled, otherwise a
 * small store seeded from the `lobby` initial state (first paint without a request, GAME-DESIGN §7.3).
 */

import { computed, ref } from 'vue'
import { getLobby } from '../services/api.js'
import { initial } from '../services/initialState.js'

const modules = import.meta.glob('../online/lobby.js', { eager: true })
const online = Object.values(modules)[0] ?? null

let fallback = null

/**
 * The fallback store (singleton).
 *
 * @return {object}
 */
function fallbackStore() {
	if (fallback) {
		return fallback
	}
	const lobby = ref(initial('lobby', null))
	const loading = ref(false)
	const error = ref(null)
	fallback = {
		lobby,
		loading,
		error,
		counts: computed(() => {
			const c = lobby.value?.counts ?? {}
			return { yourTurn: c.yourTurn ?? 0, invitations: c.invitations ?? 0, total: (c.yourTurn ?? 0) + (c.invitations ?? 0) }
		}),
		async refresh() {
			loading.value = true
			try {
				lobby.value = await getLobby()
				error.value = null
			} catch (e) {
				error.value = e
			} finally {
				loading.value = false
			}
		},
		start() {},
		stop() {},
	}
	return fallback
}

/**
 * The lobby store.
 *
 * @return {object} {lobby, counts, loading, error, refresh(), start(), stop(), …}
 */
export function useLobbyState() {
	return typeof online?.useLobby === 'function' ? online.useLobby() : fallbackStore()
}
