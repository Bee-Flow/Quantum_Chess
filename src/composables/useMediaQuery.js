/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Reactive CSS media queries.
 */

import { ref } from 'vue'

/** One shared ref per query: the listeners live as long as the page. */
const queries = new Map()

/**
 * Whether a media query matches, updated when the answer changes. Without `window.matchMedia` (unit tests in Node)
 * the value is always `false`.
 *
 * @param {string} query media query, e.g. `(prefers-reduced-motion: reduce)`
 * @return {import('vue').Ref<boolean>}
 */
export function useMediaQuery(query) {
	let matches = queries.get(query)
	if (matches) {
		return matches
	}
	matches = ref(false)
	if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
		const list = window.matchMedia(query)
		matches.value = list.matches
		list.addEventListener?.('change', (event) => {
			matches.value = event.matches
		})
	}
	queries.set(query, matches)
	return matches
}
