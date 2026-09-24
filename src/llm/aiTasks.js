/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Waiting for a Nextcloud Assistant task: the server answers an LLM request through Nextcloud Assistant with a task id,
 * and this module polls `getAiTask` after 1, 2 and 3 s, then every 5 s. It resolves with the answer and rejects with an
 * ApiError (the task failed) or an AbortError.
 */

import { ApiError, getAiTask } from '../services/api.js'
import { sleep } from '../services/async.js'

/** Delays between polls in ms; the last one repeats. */
export const AI_TASK_DELAYS = Object.freeze([1000, 2000, 3000, 5000])

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
