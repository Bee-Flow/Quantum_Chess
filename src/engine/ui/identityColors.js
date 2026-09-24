/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * identityColors: every ghost gets an identity colour `--qc-id-n` (n = 1..6) in the order it became a ghost, stable
 * for the game and recycled when it becomes solid. Display only.
 */

import { analyze } from '../analysis.js'

/** Number of identity colours (`--qc-id-1` … `--qc-id-6`). */
const IDENTITY_COLORS = 6

/**
 * Superposed live ids of a state, ascending.
 *
 * @param {object} state engine state
 * @return {number[]}
 */
function ghosts(state) {
	const a = analyze(state)
	const out = []
	for (let id = 0; id < 32; id++) {
		if (a.locs[id].length > 1) {
			out.push(id)
		}
	}
	return out
}

/**
 * Identity colours for the ghosts of the last state of a game.
 *
 * Walks the states in order. A piece that is a ghost keeps its colour; a piece that becomes solid (or is captured)
 * frees it; a new ghost takes the lowest free colour, or, when all six are taken, the colour used by the fewest
 * ghosts (lowest number first). New ghosts of the same state are served in id order.
 *
 * @param {object|object[]} history the game's states in order (or a single state)
 * @param {Record<number, number>} [previous] an assignment to continue from (for incremental updates)
 * @return {Record<number, number>} id → colour number 1..6, for the ghosts of the last state
 */
export function identityColors(history, previous = {}) {
	const states = Array.isArray(history) ? history : [history]
	const assigned = new Map(Object.entries(previous).map(([k, v]) => [Number(k), v]))
	for (const state of states) {
		const now = ghosts(state)
		for (const id of [...assigned.keys()]) {
			if (!now.includes(id)) {
				assigned.delete(id)
			}
		}
		for (const id of now) {
			if (assigned.has(id)) {
				continue
			}
			const use = new Array(IDENTITY_COLORS + 1).fill(0)
			for (const n of assigned.values()) {
				use[n]++
			}
			let best = 1
			for (let n = 2; n <= IDENTITY_COLORS; n++) {
				if (use[n] < use[best]) {
					best = n
				}
			}
			assigned.set(id, best)
		}
	}
	const out = {}
	for (const [id, n] of [...assigned].sort((x, y) => x[0] - y[0])) {
		out[id] = n
	}
	return out
}
