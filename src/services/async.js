/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Promise helpers for waits that can be cancelled with an `AbortSignal`.
 */

/**
 * Wait `ms` milliseconds. Rejects with an `AbortError` as soon as the signal fires, or at once when it has already
 * fired.
 *
 * @param {number} ms delay in milliseconds; zero or less resolves on the next timer tick
 * @param {AbortSignal} [signal] cancels the wait
 * @return {Promise<void>}
 */
export function sleep(ms, signal) {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException('Aborted', 'AbortError'))
			return
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort)
			resolve()
		}, ms)
		/** Cancel the timer and reject. */
		function onAbort() {
			clearTimeout(timer)
			reject(new DOMException('Aborted', 'AbortError'))
		}
		signal?.addEventListener('abort', onAbort, { once: true })
	})
}
