/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The user search of the opponent pickers: the recent opponents first, then the users found by a search (only the
 * answer to the latest search is shown), as NcSelectUsers options.
 */

import { ref } from 'vue'
import { getRecentOpponents, searchUsers } from '../../services/api.js'

/**
 * An NcSelectUsers option for a user.
 *
 * @param {{userId: string, displayName: string, subline?: string}} u the user
 * @return {{id: string, user: string, displayName: string, subname: string}}
 */
export const toOption = (u) => ({ id: u.userId, user: u.userId, displayName: u.displayName, subname: u.subline ?? '' })

/**
 * @return {{userOptions: import('vue').Ref<object[]>, searching: import('vue').Ref<boolean>,
 *   onSearch: (term: string) => Promise<void>}}
 */
export function useUserSearch() {
	const userOptions = ref([])
	const searching = ref(false)
	let searchSeq = 0

	getRecentOpponents().then((users) => {
		if (userOptions.value.length === 0) {
			userOptions.value = users.map(toOption)
		}
	}).catch(() => {})

	/**
	 * Search users; only the answer to the latest search is shown.
	 *
	 * @param {string} term search text
	 */
	async function onSearch(term) {
		const seq = ++searchSeq
		if (!term || term.length < 1) {
			return
		}
		searching.value = true
		try {
			const users = await searchUsers(term, { limit: 10 })
			if (seq === searchSeq) {
				userOptions.value = users.map(toOption)
			}
		} catch {
			// keep the list
		} finally {
			if (seq === searchSeq) {
				searching.value = false
			}
		}
	}

	return { userOptions, searching, onSearch }
}
