/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Whether a new online game against the chosen opponent can be rated: asks the server whenever the opponent changes.
 */

import { t } from '@nextcloud/l10n'
import { computed, ref, toValue, watch } from 'vue'
import { checkRated as defaultCheckRated } from '../../services/api.js'
import { features } from '../../services/initialState.js'

/**
 * Check whether a rated game against an opponent is possible.
 *
 * @param {import('vue').MaybeRefOrGetter<string|null|undefined>} opponentId the chosen opponent's user id
 * @param {object} [deps] dependencies (tests)
 * @param {boolean} [deps.rated] whether the administrator allows rated games
 * @param {(uid: string) => Promise<{rated: boolean, reason: string|null}>} [deps.checkRated] the server check
 * @return {import('vue').ComputedRef<string|null>} why a rated game is not possible, in words, or null
 */
export function useRatedCheck(opponentId, { rated = features.rated, checkRated = defaultCheckRated } = {}) {
	const reason = ref(null)
	watch(() => toValue(opponentId), async (uid) => {
		reason.value = null
		if (!uid || !rated) {
			return
		}
		try {
			const r = await checkRated(uid)
			reason.value = r.rated ? null : (r.reason ?? 'admin')
		} catch {
			reason.value = null
		}
	})
	return computed(() => (reason.value ? t('quantumchess', 'Rated games are not available for this pair.') : null))
}
