/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Job dispatch shared by the Web Worker and the main-thread fallback (SPEC §4.4). A job is a generator task: the
 * worker runs it in one go, the fallback in short time slices between frames.
 *
 * Payloads: `{state, options}`; `evaluateMove`: `{state, code, options}`; `analyzeGame`: `{record, options}`;
 * `benchmark`: `{}`. States arrive by structured clone and are validated before use.
 */

import { InvalidStateError, validateState } from '../engine/index.js'
import { analyzeGameTask, analyzeTask, evaluateMoveTask } from './analyze.js'
import { benchmarkTask } from './benchmark.js'
import { bestMoveTask } from './bestmove.js'
import { candidatesTask } from './candidates.js'
import { solve } from './solver.js'

/** Job types of the worker protocol (besides `cancel`). */
export const JOB_TYPES = Object.freeze(['bestMove', 'analyze', 'evaluateMove', 'candidates', 'solve', 'analyzeGame', 'benchmark'])

/**
 * A validated canonical copy of a state from a message.
 *
 * @param {unknown} input state
 * @return {object}
 */
function stateOf(input) {
	const v = validateState(input)
	if (!v.ok) {
		throw new InvalidStateError(v.error, v.message)
	}
	return v.state
}

/**
 * A task that runs a synchronous function (it never pauses).
 *
 * @param {function(): object} fn function
 * @return {{next: function(): {done: boolean, value: object}}}
 */
function syncTask(fn) {
	return { next: () => ({ done: true, value: fn() }) }
}

/**
 * Create the task of a job.
 *
 * @param {string} type job type
 * @param {object} payload payload
 * @param {{slice: function(): number, progress?: function(object): void}} ctx context
 * @return {Generator}
 */
export function createTask(type, payload, ctx) {
	const p = payload || {}
	const options = { ...(p.options || {}) }
	delete options.signal
	delete options.onProgress
	delete options.rng
	const progress = typeof ctx.progress === 'function' ? ctx.progress : undefined
	switch (type) {
		case 'bestMove':
			return bestMoveTask(stateOf(p.state), { ...options, onProgress: progress }, ctx)
		case 'analyze':
			return analyzeTask(stateOf(p.state), { ...options, onProgress: progress }, ctx)
		case 'evaluateMove':
			return evaluateMoveTask(stateOf(p.state), p.code, options, ctx)
		case 'candidates':
			return candidatesTask(stateOf(p.state), options, ctx)
		case 'solve': {
			const state = stateOf(p.state)
			return syncTask(() => solve(state, options))
		}
		case 'analyzeGame': {
			const record = p.record || {}
			const start = record.startState ? stateOf(record.startState) : null
			return analyzeGameTask({ startState: start, moves: record.moves || [] }, { ...options, onProgress: progress }, ctx)
		}
		case 'benchmark':
			return benchmarkTask(ctx)
		default:
			throw new TypeError('unknown job type: ' + String(type))
	}
}

/**
 * Error → `{name, message}` for a protocol `error` response.
 *
 * @param {unknown} e error
 * @return {{name: string, message: string, code?: string}}
 */
export function errorPayload(e) {
	if (e && typeof e === 'object') {
		const out = { name: String(e.name || 'Error'), message: String(e.message || e) }
		if (typeof e.code === 'string') {
			out.code = e.code
		}
		return out
	}
	return { name: 'Error', message: String(e) }
}
