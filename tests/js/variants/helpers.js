/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Helpers for the variant tests: build states from explicit worlds, play moves with a chosen outcome.
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
