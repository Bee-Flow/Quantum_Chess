/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The initial state the server renders into the app page (`user`, `features`, `preferences`, `lobby`,
 * `trainerProgress`, `appVersion`), so the first screen needs no API request. Reading never throws: unit tests and the
 * settings pages have no initial state and get the fallbacks.
 */

import { loadState } from '@nextcloud/initial-state'

/**
 * Read an initial state.
 *
 * @template T
 * @param {string} key state key
 * @param {T} fallback value when the state is missing or null
 * @return {T}
 */
export function initial(key, fallback) {
	try {
		const value = loadState('quantumchess', key, fallback)
		return value === null || value === undefined ? fallback : value
	} catch {
		return fallback
	}
}

/** `{uid, displayName, isAdmin, language, locale}` of the current user. */
export const currentUser = initial('user', { uid: null, displayName: '', isAdmin: false, language: 'en', locale: 'en' })

/** Feature flags: online games, open challenges, rated games, chat, leaderboard, LLM sources. */
export const features = initial('features', {
	multiplayer: false,
	openChallenges: false,
	rated: false,
	chat: false,
	leaderboardMode: 'off',
	ai: { nextcloud: false, shared: false, personal: false, any: false, default: null, noticeAcked: [] },
})
