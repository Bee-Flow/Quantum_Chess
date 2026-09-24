/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Generic, locale-aware formatting of times and ratings. Probabilities are formatted by `engine/ui` and game results by
 * `game/resultText.js`.
 */

import { n, t } from '@nextcloud/l10n'

/**
 * Time left until a deadline ("18 h left", "3 days left", "less than a minute left").
 *
 * @param {number|null} deadlineAt Unix seconds
 * @param {number} now Unix seconds
 * @return {string}
 */
export function formatDeadline(deadlineAt, now = Date.now() / 1000) {
	if (!deadlineAt) {
		return ''
	}
	const s = Math.max(0, deadlineAt - now)
	if (s < 60) {
		return t('quantumchess', 'less than a minute left')
	}
	if (s < 3600) {
		const m = Math.floor(s / 60)
		return n('quantumchess', '%n min left', '%n min left', m)
	}
	if (s < 2 * 86400) {
		const h = Math.floor(s / 3600)
		return n('quantumchess', '%n h left', '%n h left', h)
	}
	const d = Math.floor(s / 86400)
	return n('quantumchess', '%n day left', '%n days left', d)
}

/**
 * A relative time ("2 min ago").
 *
 * @param {number} ts Unix seconds
 * @param {number} [now] Unix seconds
 * @return {string}
 */
export function formatRelative(ts, now = Date.now() / 1000) {
	const s = Math.max(0, Math.round(now - ts))
	if (s < 45) {
		return t('quantumchess', 'just now')
	}
	if (s < 3600) {
		return n('quantumchess', '%n min ago', '%n min ago', Math.max(1, Math.round(s / 60)))
	}
	if (s < 86400) {
		return n('quantumchess', '%n h ago', '%n h ago', Math.round(s / 3600))
	}
	return n('quantumchess', '%n day ago', '%n days ago', Math.round(s / 86400))
}

/**
 * A rating with the provisional marker.
 *
 * @param {number|null} rating rating
 * @param {boolean} provisional provisional flag
 * @return {string}
 */
export function formatRating(rating, provisional = false) {
	if (rating === null || rating === undefined) {
		return ''
	}
	return String(Math.round(rating)) + (provisional ? '?' : '')
}
