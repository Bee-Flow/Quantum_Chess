/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * `defineVariant()` turns the declaration of a variant module into the object the quantum layer, the computer player
 * and the board use: defaults for everything a variant may leave out, normalised piece types and per-variant caches.
 *
 * A declaration has at least `id`, `category`, `sides`, `topology`, `types` and `setup(options, rng)`. The optional
 * hooks are documented in docs/development/architecture.md (section "Chess variants").
 */

import { normaliseType } from './world.js'

/** The categories of the variant catalogue, in display order. */
export const CATEGORIES = Object.freeze(['dimensions', 'uncertainty', 'rules', 'boards', 'regional'])

/**
 * The default orientation of "oriented" vectors (pawns, soldiers, shogi pieces): the vectors are written for side 0,
 * which moves towards higher coordinate 1 (up the board); every other side of a two-sided game mirrors coordinate 1.
 *
 * @param {number} side side index
 * @param {number[]} vec vector for side 0
 * @return {number[]}
 */
function defaultOrient(side, vec) {
	if (side === 0) {
		return vec
	}
	const v = vec.slice()
	v[1] = -v[1]
	return v
}

/**
 * Complete a variant declaration.
 *
 * @param {object} spec the declaration
 * @return {object} the variant
 */
export function defineVariant(spec) {
	const types = {}
	for (const [id, type] of Object.entries(spec.types)) {
		types[id] = normaliseType(type)
	}
	// Completes the declaration in place, so hooks that refer to the declaration object see the finished variant.
	const V = Object.assign(spec, {
		options: spec.options ?? [],
		teams: spec.teams ?? null,
		hidden: spec.hidden ?? false,
		maxPly: spec.maxPly ?? 600,
		quietPlies: spec.quietPlies ?? 100,
		types,
		orient: spec.orient ?? defaultOrient,
		enemies: spec.enemies ?? ((a, b) => a !== b),
		lineCache: new Map(),
		genCache: new WeakMap(),
	})
	V.sideCount = V.sides.length
	V.solidTypes = new Set(Object.keys(types).filter((t) => types[t].solid || types[t].royal))
	V.royalTypes = new Set(Object.keys(types).filter((t) => types[t].royal))
	return V
}

/**
 * The display name of a side.
 *
 * @param {object} V variant
 * @param {number} side side index
 * @return {string}
 */
export function sideName(V, side) {
	const s = V.sides[side]
	return typeof s.name === 'function' ? s.name() : s.name
}

/**
 * The option values of a new game: the defaults, overridden by the given values that are valid.
 *
 * @param {object} V variant
 * @param {object} [given] chosen values
 * @return {object}
 */
export function optionValues(V, given = {}) {
	const out = {}
	for (const o of V.options) {
		const v = given[o.id]
		if (o.type === 'number' && Number.isInteger(v) && v >= o.min && v <= o.max) {
			out[o.id] = v
		} else if (o.type === 'choice' && o.values.some((c) => c.id === v)) {
			out[o.id] = v
		} else if (o.type === 'boolean' && typeof v === 'boolean') {
			out[o.id] = v
		} else {
			out[o.id] = o.default
		}
	}
	return out
}
