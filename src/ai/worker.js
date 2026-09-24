/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Web Worker entry of the computer player.
 *
 * Request `{id, type, payload}` with `type` ∈ `bestMove, analyze, evaluateMove, candidates, solve, analyzeGame,
 * benchmark, cancel` (`cancel` payload: `{id}`). Responses `{id, type: 'progress' | 'result' | 'error', payload}`;
 * errors carry `{name, message}`.
 *
 * Jobs run one at a time. A search runs in one piece (the client terminates the worker to stop it at once); between
 * the plies of `analyzeGame` and similar steps the worker returns to its event loop, so a `cancel` stops such a job
 * cooperatively.
 */

import { createTask, errorPayload } from './jobs.js'

const cancelled = new Set()
const queue = []
let busy = false

/**
 * Wait for the next macrotask (lets `cancel` messages in).
 *
 * @return {Promise<void>}
 */
function nextTask() {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Run one job to its end (or until cancelled).
 *
 * @param {{id: number, type: string, payload: object}} msg request
 */
async function run(msg) {
	const { id, type, payload } = msg
	const ctx = {
		slice: () => Infinity,
		progress: (p) => postMessage({ id, type: 'progress', payload: p }),
	}
	try {
		const task = createTask(type, payload, ctx)
		let r = task.next()
		while (!r.done) {
			await nextTask()
			if (cancelled.has(id)) {
				return
			}
			r = task.next()
		}
		if (!cancelled.has(id)) {
			postMessage({ id, type: 'result', payload: r.value })
		}
	} catch (e) {
		postMessage({ id, type: 'error', payload: errorPayload(e) })
	} finally {
		cancelled.delete(id)
	}
}

/**
 * Work through the queue.
 */
async function pump() {
	if (busy) {
		return
	}
	busy = true
	while (queue.length > 0) {
		const msg = queue.shift()
		if (cancelled.has(msg.id)) {
			cancelled.delete(msg.id)
			continue
		}
		await run(msg)
	}
	busy = false
}

self.onmessage = (event) => {
	const msg = event.data || {}
	if (msg.type === 'cancel') {
		if (msg.payload && Number.isInteger(msg.payload.id)) {
			if (cancelled.size > 256) {
				cancelled.clear()
			}
			cancelled.add(msg.payload.id)
		}
		return
	}
	if (!Number.isInteger(msg.id)) {
		return
	}
	queue.push(msg)
	pump()
}
