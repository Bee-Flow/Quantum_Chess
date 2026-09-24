/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Promise API of the computer player for the UI. This module and `levels.js` are the only ones the rest of the web
 * app imports from src/ai.
 *
 * Vocabulary: the **rules engine** (src/engine) knows the rules; the **computer player** (src/ai) searches with it for
 * the built-in opponent, the coach, the review and the puzzles; an **LLM opponent** picks from its `candidates`.
 *
 * - One Web Worker per page, created lazily (`new Worker(new URL('./worker.js', import.meta.url), {type: 'module'})`).
 * - Jobs are queued and run one at a time; the computer's move and the LLM opponent's candidates go before coach
 *   analyses, and the post-game review goes last.
 * - Every function accepts `{signal}` and rejects with `DOMException('AbortError')` when it fires. A queued job is
 *   dropped; a running one is stopped at once by terminating the worker (a fresh one is created for the next job).
 * - `analyze` jobs of the same `channel` (default `'coach'`) supersede each other: a new one cancels the older one.
 * - If Workers are unavailable (no `Worker`, a CSP without `worker-src 'self'`, a module worker that fails to load),
 *   the jobs run on the main thread in short time slices between frames, with the same results.
 *
 * All E values are White's expected score, except `Candidate.E` (the side to move).
 */

import { readCachedBenchmark, writeCachedBenchmark } from './benchmark.js'
import { createTask } from './jobs.js'
import { ENGINE_VERSION } from './levels.js'
import { freshSeed } from './tasks.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */

/** Main-thread fallback: length of one computing slice in ms (then the browser gets a frame). */
const SLICE_MS = 40

const PRIORITY = { bestMove: 0, candidates: 0, solve: 0, benchmark: 0, evaluateMove: 1, analyze: 1, analyzeGame: 2 }

/**
 * The default worker factory (Vite bundles `worker.js` as a separate chunk from this exact expression).
 *
 * @return {Worker}
 */
function defaultFactory() {
	return new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })
}

let factory = defaultFactory
let worker = null
let workerAlive = false // the current worker has answered at least once
let workerBroken = false
let nextId = 1
let running = null
const queue = []
let benchmarkPromise = null

/**
 * Replace the worker factory (tests), or pass `null` to force the main-thread fallback. Resets the client.
 *
 * @param {(() => Worker)|null} fn factory
 */
export function setWorkerFactory(fn) {
	cancelAll()
	dropWorker()
	factory = fn
	workerBroken = fn === null
	benchmarkPromise = null
}

/**
 * Where jobs run now: `'worker'`, `'main-thread'` (fallback) or `'idle'` (no worker created yet).
 *
 * @return {'worker'|'main-thread'|'idle'}
 */
export function engineMode() {
	if (workerBroken) {
		return 'main-thread'
	}
	return worker === null ? 'idle' : 'worker'
}

/**
 * The error every cancelled job rejects with, the same as `fetch` uses for an aborted request.
 *
 * @return {DOMException}
 */
function abortError() {
	return new DOMException('The engine job was cancelled.', 'AbortError')
}

/**
 * An Error from a protocol error payload.
 *
 * @param {{name: string, message: string, code?: string}} payload payload
 * @return {Error}
 */
function errorFrom(payload) {
	const e = new Error(payload && payload.message ? payload.message : 'Engine error')
	e.name = payload && payload.name ? payload.name : 'Error'
	if (payload && payload.code) {
		e.code = payload.code
	}
	return e
}

/**
 * Terminate and forget the current worker.
 */
function dropWorker() {
	if (worker !== null) {
		try {
			worker.terminate()
		} catch {
			// Already gone.
		}
	}
	worker = null
	workerAlive = false
}

/**
 * The worker, created on first use; null when Workers cannot be used.
 *
 * @return {Worker|null}
 */
function ensureWorker() {
	if (workerBroken || factory === null) {
		return null
	}
	if (worker !== null) {
		return worker
	}
	try {
		worker = factory()
	} catch {
		workerBroken = true
		worker = null
		return null
	}
	workerAlive = false
	worker.onmessage = onMessage
	worker.onerror = onWorkerError
	worker.onmessageerror = onWorkerError
	return worker
}

/**
 * A message from the worker.
 *
 * @param {MessageEvent} event event
 */
function onMessage(event) {
	workerAlive = true
	const msg = event.data || {}
	const job = running
	if (job === null || msg.id !== job.id) {
		return
	}
	if (msg.type === 'progress') {
		job.progress(msg.payload)
	} else if (msg.type === 'result') {
		settle(job, null, msg.payload)
	} else if (msg.type === 'error') {
		settle(job, errorFrom(msg.payload))
	}
}

/**
 * The worker failed. Before it ever answered this means it cannot load (CSP, no module workers): switch to the
 * main thread for good and rerun the job there. Otherwise the job crashed: reject it and start a fresh worker later.
 *
 * @param {Event} event error event
 */
function onWorkerError(event) {
	if (event && typeof event.preventDefault === 'function') {
		event.preventDefault()
	}
	const job = running
	const neverAnswered = !workerAlive
	dropWorker()
	if (neverAnswered) {
		workerBroken = true
		if (job !== null) {
			job.where = 'main'
			runOnMainThread(job)
		}
		return
	}
	if (job !== null) {
		settle(job, new Error(event && event.message ? event.message : 'The engine worker stopped unexpectedly.'))
	}
}

/**
 * Finish a job and start the next one.
 *
 * @param {object} job job
 * @param {Error|null} error error or null
 * @param {unknown} [value] result
 */
function settle(job, error, value) {
	if (job.done) {
		return
	}
	job.done = true
	if (job.signal) {
		job.signal.removeEventListener('abort', job.onAbort)
	}
	if (running === job) {
		running = null
	}
	if (error) {
		job.reject(error)
	} else {
		job.resolve(value)
	}
	pump()
}

/**
 * Cancel a job: drop it from the queue, or stop it where it runs.
 *
 * @param {object} job job
 */
function cancelJob(job) {
	if (job.done) {
		return
	}
	const i = queue.indexOf(job)
	if (i >= 0) {
		queue.splice(i, 1)
	} else if (running === job) {
		job.cancelled = true
		if (job.where === 'worker' && worker !== null) {
			try {
				worker.postMessage({ id: job.id, type: 'cancel', payload: { id: job.id } })
			} catch {
				// The worker is being replaced anyway.
			}
			dropWorker()
		}
	}
	settle(job, abortError())
}

/**
 * Start the next job if nothing runs.
 */
function pump() {
	if (running !== null || queue.length === 0) {
		return
	}
	const job = queue.shift()
	running = job
	const w = ensureWorker()
	if (w !== null) {
		job.where = 'worker'
		try {
			w.postMessage({ id: job.id, type: job.type, payload: job.payload })
			return
		} catch {
			// DataCloneError or a dead worker: fall back to the main thread for this job.
		}
	}
	job.where = 'main'
	runOnMainThread(job)
}

/**
 * Wait for the next macrotask (a frame can render in between).
 *
 * @return {Promise<void>}
 */
function yieldToBrowser() {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Run a job on the main thread in time slices.
 *
 * @param {object} job job
 */
async function runOnMainThread(job) {
	const ctx = {
		slice: () => performance.now() + SLICE_MS,
		progress: (p) => job.progress(p),
	}
	try {
		const task = createTask(job.type, job.payload, ctx)
		let r = task.next()
		while (!r.done) {
			await yieldToBrowser()
			if (job.cancelled || job.done) {
				return
			}
			r = task.next()
		}
		settle(job, null, r.value)
	} catch (e) {
		settle(job, e instanceof Error ? e : errorFrom(e))
	}
}

/**
 * Queue a job.
 *
 * @param {string} type job type
 * @param {object} payload payload (structured-cloneable)
 * @param {object} [opts] `{signal, onProgress, channel}`
 * @return {Promise<unknown>}
 */
function submit(type, payload, opts = {}) {
	return new Promise((resolve, reject) => {
		const signal = opts.signal || null
		if (signal && signal.aborted) {
			reject(abortError())
			return
		}
		const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : null
		const job = {
			id: nextId++,
			type,
			payload,
			priority: PRIORITY[type] ?? 1,
			channel: opts.channel || null,
			signal,
			resolve,
			reject,
			done: false,
			cancelled: false,
			where: null,
			progress: (p) => {
				if (onProgress !== null && !job.done) {
					try {
						onProgress(p)
					} catch {
						// A failing progress callback must not break the job.
					}
				}
			},
		}
		job.onAbort = () => cancelJob(job)
		if (signal) {
			signal.addEventListener('abort', job.onAbort, { once: true })
		}
		if (job.channel !== null) {
			for (const old of queue.slice()) {
				if (old.channel === job.channel) {
					cancelJob(old)
				}
			}
			if (running !== null && running.channel === job.channel) {
				cancelJob(running)
			}
		}
		let at = queue.findIndex((j) => j.priority > job.priority)
		if (at < 0) {
			at = queue.length
		}
		queue.splice(at, 0, job)
		pump()
	})
}

/**
 * A 32-bit seed for the level noise: from `seed`, from one call of `rng`, or fresh.
 *
 * @param {object} options options
 * @return {number}
 */
function seedOf(options) {
	if (Number.isInteger(options.seed)) {
		return options.seed >>> 0
	}
	if (typeof options.rng === 'function') {
		return Math.floor(options.rng() * 4294967296) >>> 0
	}
	return freshSeed()
}

/**
 * The computer's move: `{code, E, depth, nodes, candidates: [{code, E}], displayMs}`. `code` is legal in `state`;
 * wait `displayMs` before playing it (0 when `fast`). `onProgress({depth, code, E, nodes, timeMs})` after every
 * search iteration ("Thinking… depth n").
 *
 * @param {EngineState} state position
 * @param {object} options `{level, rng?, seed?, fast?, signal?, onProgress?, timeMs?, nodeBudget?, deterministic?}`
 * @return {Promise<object>}
 */
export function bestMove(state, options = {}) {
	const { level, fast, timeMs, nodeBudget, deterministic } = options
	return submit('bestMove', {
		state,
		options: { level, seed: seedOf(options), fast: Boolean(fast), timeMs, nodeBudget, deterministic },
	}, options)
}

/**
 * Position analysis for the coach: `{E, fog, mate, best, included, depth, nodes, timeMs}`. A newer `analyze` on the
 * same `channel` (default `'coach'`; `null` for none) cancels this one.
 *
 * @param {EngineState} state position
 * @param {object} [options]
 *   `{timeMs = 600, multiPv = 3, include = [], fogPlies = 2, level?, signal?, onProgress?, channel?}`
 * @return {Promise<object>}
 */
export function analyze(state, options = {}) {
	const { timeMs = 600, multiPv = 3, include = [], fogPlies = 2, level, nodeBudget } = options
	const channel = options.channel === undefined ? 'coach' : options.channel
	return submit(
		'analyze',
		{ state, options: { timeMs, multiPv, include, fogPlies, level, nodeBudget } },
		{ ...options, channel },
	)
}

/**
 * Value of one move: `{code, E, outcomes: [{key, weight, E}]}`.
 *
 * @param {EngineState} state position
 * @param {string} code move
 * @param {object} [options] `{timeMs = 400, signal?}`
 * @return {Promise<object>}
 */
export function evaluateMove(state, code, options = {}) {
	const { timeMs = 400, level, nodeBudget } = options
	return submit('evaluateMove', { state, code, options: { timeMs, level, nodeBudget } }, options)
}

/**
 * Candidates for an LLM opponent: `[{code, E (side to move), tags, ok}]`.
 *
 * @param {EngineState} state position
 * @param {object} options `{strength, tolerance, signal?}`
 * @return {Promise<object[]>}
 */
export function candidates(state, options = {}) {
	const { strength, tolerance, multiPv, timeMs, nodeBudget } = options
	return submit('candidates', { state, options: { strength, tolerance, multiPv, timeMs, nodeBudget } }, options)
}

/**
 * Exact solver: `{value, moves: [{code, value}], accepted, exact}`.
 *
 * @param {EngineState} state position
 * @param {object} options `{goal, horizon, side, nodeLimit?, plies?, signal?}`
 * @return {Promise<object>}
 */
export function solve(state, options = {}) {
	const { goal, horizon, side, nodeLimit, plies } = options
	return submit('solve', { state, options: { goal, horizon, side, nodeLimit, plies } }, options)
}

/**
 * Whole-game analysis for the review: `{engineVersion, plies}`; `onProgress(plyAnalysis)` for every ply as it
 * arrives.
 *
 * @param {{startState: object|null, moves: Array<{code: string, u: number|null, outcome?: string}>}} record game
 * @param {object} [options] `{msPerPly = 400, level = 4, signal?, onProgress}`
 * @return {Promise<object>}
 */
export function analyzeGame(record, options = {}) {
	const { msPerPly = 400, level = 4, nodeBudget } = options
	const clean = {
		startState: record.startState ?? null,
		moves: (record.moves || []).map((m) => ({ code: m.code, u: m.u ?? null, outcome: m.outcome ?? null })),
	}
	return submit('analyzeGame', { record: clean, options: { msPerPly, level, nodeBudget } }, options)
}

/**
 * Abort every queued and running job.
 */
export function cancelAll() {
	for (const job of queue.slice()) {
		cancelJob(job)
	}
	if (running !== null) {
		cancelJob(running)
	}
}

/**
 * The device benchmark `{nodesPerSecond, slow}`: cached in localStorage, measured once (300 ms) otherwise.
 *
 * @return {Promise<{nodesPerSecond: number, slow: boolean}>}
 */
export function getBenchmark() {
	const cached = readCachedBenchmark()
	if (cached !== null) {
		return Promise.resolve(cached)
	}
	if (benchmarkPromise === null) {
		benchmarkPromise = submit('benchmark', {}).then((r) => {
			writeCachedBenchmark(r)
			return r
		}, (e) => {
			benchmarkPromise = null
			throw e
		})
	}
	return benchmarkPromise
}

export { ENGINE_VERSION }
