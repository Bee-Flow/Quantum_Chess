/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Initial states provided by PageController (SPEC §13), read once and never throwing (unit tests and the settings
 * bundles have none).
 */

import { loadState } from '@nextcloud/initial-state'

/**
 * Read an initial state.
 *
 * @param {string} key state key
 * @param {any} fallback value when missing
 * @return {any}
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

/** Feature flags (multiplayer, open challenges, rated, chat, AI sources). */
export const features = initial('features', {
	multiplayer: false,
	openChallenges: false,
	rated: false,
	chat: false,
	leaderboardMode: 'off',
	ai: { nextcloud: false, shared: false, personal: false, any: false, default: null, noticeAcked: [] },
})
