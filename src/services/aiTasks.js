/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Waiting for a Nextcloud AI task (SPEC §14.3.2, GAME-DESIGN §6.4): polls `getAiTask` after 1, 2 and 3 s, then every
 * 5 s. Resolves with the done payload, rejects with ApiError (status `error`) or AbortError.
 */

import { ApiError, getAiTask } from './api.js'

/** Delays between polls in ms; the last one repeats. */
export const AI_TASK_DELAYS = Object.freeze([1000, 2000, 3000, 5000])

/**
 * Sleep that rejects with AbortError when the signal fires.
 *
 * @param {number} ms delay
 * @param {AbortSignal} [signal] abort signal
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
		/** Abort handler. */
		function onAbort() {
			clearTimeout(timer)
			reject(new DOMException('Aborted', 'AbortError'))
		}
		signal?.addEventListener('abort', onAbort, { once: true })
	})
}

/**
 * Poll a task until it is done.
 *
 * @param {number} taskId task id
 * @param {object} [options] options
 * @param {AbortSignal} [options.signal] abort signal
 * @param {(info: {attempt: number, elapsedMs: number}) => void} [options.onTick] called after every pending answer
 * @return {Promise<object>} the done payload
 */
export async function waitForAiTask(taskId, { signal, onTick } = {}) {
	const started = Date.now()
	for (let attempt = 0; ; attempt++) {
		await sleep(AI_TASK_DELAYS[Math.min(attempt, AI_TASK_DELAYS.length - 1)], signal)
		const body = await getAiTask(taskId, { signal })
		if (body?.status === 'done') {
			return body
		}
		if (body?.status === 'error') {
			throw new ApiError({ status: 502, code: 'upstream', data: { upstream: body.error ?? null }, message: body.message ?? '' })
		}
		onTick?.({ attempt, elapsedMs: Date.now() - started })
	}
}
