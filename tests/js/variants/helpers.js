/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Helpers for the variant tests: build states from explicit worlds, play moves with a chosen outcome, give the
 * computer a budget of work instead of time (`workClock`) and time a search on a busy machine (`stopwatch`).
 */

import { expect } from 'vitest'
import { applyOutcome, branches, STATE_VERSION, T } from '../../../src/variants/core/quantum.js'
import { worldFrom } from '../../../src/variants/core/world.js'

/**
 * A state from explicit worlds: `[[placement, relativeWeight], ...]` (see `worldFrom`).
 *
 * @param {object} V variant
 * @param {Array<[Record<string, string>, number]>} worlds placements with relative weights
 * @param {number} [turn] side to move
 * @param {(w: object) => void} [edit] change every world after it is built (extra state, hands, ...)
 * @return {object}
 */
export function stateOf(V, worlds, turn = 0, edit = null) {
	const total = worlds.reduce((a, [, w]) => a + w, 0)
	let rest = T
	const list = worlds.map(([placement, rel], i) => {
		const b = worldFrom(V, placement, {})
		if (edit) {
			edit(b)
		} else if (V.topology.dims === 2 && !b.x.castle) {
			b.x = { ep: -1, epVictim: -1, castle: [] }
		}
		const w = i === worlds.length - 1 ? rest : Math.floor((T * rel) / total)
		rest -= w
		return { b, w }
	})
	return {
		v: STATE_VERSION,
		variant: V.id,
		options: {},
		worlds: list,
		turn,
		ply: 0,
		quiet: 0,
		result: null,
		history: [],
	}
}

/**
 * Play a move that must be legal; when it has several outcomes, take outcome `index` (default the first).
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {string} code move code
 * @param {number} [index] outcome index
 * @return {object}
 */
export function play(V, state, code, index = 0) {
	const list = branches(V, state, code)
	expect(list, 'legal: ' + code).not.toBeNull()
	return applyOutcome(V, state, code, index)
}

/**
 * A clock for the time budget of the computer (the option `now` of `chooseMove`) that counts work instead of time:
 * each read moves it `ms` milliseconds on. The search reads it at each of its checks (each candidate, outcome and
 * answer), so it gets the same work done on any machine, however busy (vitest runs many files at once), and makes
 * the same choice for the same seed. The default, 0.01 ms per check (the level times then allow 40,000, 150,000
 * and 400,000 checks), lets every search of a few worlds in these tests finish, as it does in the app on a desktop,
 * where such a check takes 5 to 20 microseconds (the longest search, 4D chess from the start at the hard level, takes
 * 184,000 checks); at 64 worlds a check takes 0.1 to 1.5 ms, and a test there passes a larger step.
 *
 * @param {number} [ms] milliseconds per read
 * @return {(() => number) & {elapsed: () => number}} the clock; `elapsed()` is the time it has counted
 */
export function workClock(ms = 0.01) {
	let reads = 0
	const now = () => ++reads * ms
	now.elapsed = () => reads * ms
	return now
}

/**
 * The processor time this thread has used, in milliseconds (the whole process where Node cannot tell the thread).
 *
 * @return {number}
 */
export function cpuMs() {
	const { user, system } = process.threadCpuUsage ? process.threadCpuUsage() : process.cpuUsage()
	return (user + system) / 1000
}

/**
 * A stopwatch for a timed check on a busy machine: the milliseconds since the call, as the processor time of this
 * thread (never more than the wall-clock time). Other work on the machine holds the thread back but does not count,
 * so a search that keeps to its time on an idle machine passes under load too; a search or a step that is too slow
 * still shows.
 *
 * @return {() => number} the milliseconds since the call
 */
export function stopwatch() {
	const wall = performance.now()
	const cpu = cpuMs()
	return () => Math.min(performance.now() - wall, cpuMs() - cpu)
}
