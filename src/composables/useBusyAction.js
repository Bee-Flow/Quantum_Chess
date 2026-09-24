/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * A busy flag for buttons that start an asynchronous action.
 */

import { ref } from 'vue'

/**
 * `run(action)` sets `busy` while the action runs, so the buttons that start it can be disabled. The action's
 * promise is returned unchanged, including a rejection.
 *
 * @return {{busy: import('vue').Ref<boolean>, run: (action: () => unknown) => Promise<void>}}
 */
export function useBusyAction() {
	const busy = ref(false)

	/**
	 * Run an action and keep `busy` set until it settles.
	 *
	 * @param {() => unknown} action the action, sync or async
	 */
	async function run(action) {
		busy.value = true
		try {
			await action()
		} finally {
			busy.value = false
		}
	}

	return { busy, run }
}
