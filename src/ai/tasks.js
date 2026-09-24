/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Helpers for the computer player's resumable tasks. A task is a generator that yields between slices of work; the
 * Web Worker runs it in one go, the main-thread fallback in short time slices between frames, and the synchronous API
 * (`index.js`) straight to the end.
 */

/**
 * @typedef {object} SliceContext
 * @property {() => number} slice the clock value at which the current slice ends (Infinity: never pause)
 * @property {(progress: object) => void} [progress] progress callback of the job, if any
 */

/** The context of a task that runs to the end without pausing. */
export const NO_SLICE = Object.freeze({ slice: () => Infinity })

/**
 * Run a searcher to the end, yielding between slices.
 *
 * @param {import('./search.js').Searcher} searcher searcher
 * @param {SliceContext} ctx slicing context
 * @yields {void}
 * @return {import('./search.js').SearchResult} the search result
 */
export function* runSearcher(searcher, ctx) {
	while (!searcher.step(ctx.slice())) {
		yield
	}
	return searcher.result()
}

/**
 * Run a task generator synchronously.
 *
 * @param {Generator} task task
 * @return {unknown}
 */
export function runSync(task) {
	let r = task.next()
	while (!r.done) {
		r = task.next()
	}
	return r.value
}

/**
 * A task that runs a synchronous function (it never pauses).
 *
 * @param {() => object} fn function
 * @return {{next: () => {done: boolean, value: object}}}
 */
export function syncTask(fn) {
	return { next: () => ({ done: true, value: fn() }) }
}

/**
 * A fresh 32-bit seed for the level noise: from the CSPRNG when available, otherwise from the clock.
 *
 * @return {number}
 */
export function freshSeed() {
	const c = globalThis.crypto
	return c && typeof c.getRandomValues === 'function' ? c.getRandomValues(new Uint32Array(1))[0] : (Date.now() >>> 0)
}
