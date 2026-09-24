/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * First-launch benchmark: a 300 ms search of a fixed middlegame gives the device's node rate. Slow devices keep the
 * levels' think times (so levels 4–5 simply search less deep) and the coach defaults to Standard with 400 ms.
 *
 * The result is cached in `localStorage` (`quantumchess.engine.v1.bench`) by the page; the worker has no storage and
 * only measures.
 */

import { setupPosition } from '../engine/index.js'
import { ENGINE_VERSION } from './levels.js'
import { Searcher } from './search.js'
import { NO_SLICE, runSync } from './tasks.js'

/** @typedef {import('./tasks.js').SliceContext} SliceContext */

/** localStorage key of the cached result. Stored client data: never rename it. */
export const BENCH_KEY = 'quantumchess.engine.v1.bench'

/** Measuring time in ms. */
const BENCH_MS = 300

/** Below this many nodes per second a device counts as slow (a desktop does about 15 000). */
const SLOW_NPS = 4000

/** A cached result is re-measured after this long (ms). */
const BENCH_MAX_AGE = 30 * 24 * 3600 * 1000

const BENCH_POSITION = {
	fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1',
	prelude: ['f3-g5|h4', 'c6-a5|b4'],
}

/**
 * Benchmark task (generator, yields between slices).
 *
 * @param {SliceContext} [ctx] slicing context
 * @param {object} [options] `{timeMs = BENCH_MS, now?}`
 * @yields {void}
 * @return {{nodesPerSecond: number, slow: boolean}}
 */
export function* benchmarkTask(ctx = NO_SLICE, options = {}) {
	const now = options.now || (() => performance.now())
	const searcher = new Searcher(setupPosition(BENCH_POSITION), {
		level: 5,
		timeMs: options.timeMs ?? BENCH_MS,
		maxDepth: 12,
		now,
	})
	const start = now()
	while (!searcher.step(ctx.slice())) {
		yield
	}
	const elapsed = Math.max(1, now() - start)
	const nodesPerSecond = Math.round(searcher.nodes / (elapsed / 1000))
	return { nodesPerSecond, slow: nodesPerSecond < SLOW_NPS }
}

/**
 * Run the benchmark synchronously (about 300 ms) and cache the result when `localStorage` exists.
 *
 * @return {{nodesPerSecond: number, slow: boolean}}
 */
export function benchmark() {
	const result = runSync(benchmarkTask())
	writeCachedBenchmark(result)
	return result
}

/**
 * The browser's localStorage, or null (worker, private mode, blocked storage).
 *
 * @return {Storage|null}
 */
function storage() {
	try {
		return typeof globalThis.localStorage === 'object' && globalThis.localStorage !== null ? globalThis.localStorage : null
	} catch {
		return null
	}
}

/**
 * The cached benchmark result of this version of the computer player, or null.
 *
 * @param {number} [nowMs] current time (ms since the epoch)
 * @return {{nodesPerSecond: number, slow: boolean}|null}
 */
export function readCachedBenchmark(nowMs = Date.now()) {
	const s = storage()
	if (s === null) {
		return null
	}
	try {
		const data = JSON.parse(s.getItem(BENCH_KEY) || 'null')
		if (data && data.v === ENGINE_VERSION && Number.isFinite(data.nodesPerSecond) && nowMs - data.at < BENCH_MAX_AGE) {
			return { nodesPerSecond: data.nodesPerSecond, slow: data.nodesPerSecond < SLOW_NPS }
		}
	} catch {
		// A broken entry is simply measured again.
	}
	return null
}

/**
 * Cache a benchmark result (ignored when storage is unavailable).
 *
 * @param {{nodesPerSecond: number}} result result
 * @param {number} [nowMs] current time (ms since the epoch)
 */
export function writeCachedBenchmark(result, nowMs = Date.now()) {
	const s = storage()
	if (s === null) {
		return
	}
	try {
		s.setItem(BENCH_KEY, JSON.stringify({ v: ENGINE_VERSION, nodesPerSecond: result.nodesPerSecond, at: nowMs }))
	} catch {
		// Quota or privacy settings: the benchmark runs again next time.
	}
}
