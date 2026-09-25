/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * `defineVariant()` turns the declaration of a variant module into the object the quantum layer, the computer player
 * and the board use: defaults for everything a variant may leave out, normalised piece types and per-variant caches.
 *
 * A declaration has at least `id`, `category`, `sides`, `topology`, `types` and `setup(options, rng)`. The optional
 * hooks are documented in docs/development/architecture.md (section "Chess variants"). The quantum layer
 * (quantum.js) also reads these optional fields and hooks:
 *
 * - `applyMiss(b, action, side, info) -> world`: a world in which the played action did not take effect (an idle
 *   world: the move, split or merge missed there, every world of a Measure, every world of a skipped turn). `action`
 *   is `{ type: 'move', code, key, sample }`, `{ type: 'split', code, id, from: [f], to: [t1, t2] }`,
 *   `{ type: 'merge', code, id, from: [f1, f2], to: [t] }`, `{ type: 'measure', code, id, from: [s], to: [] }` or
 *   `{ type: 'pass', code: null, from: [], to: [] }`; `side` is the side whose turn it was; `info.hit` is true when
 *   some world of the same outcome took the action. Returns the world itself when nothing changes and never mutates
 *   it (per-ply bookkeeping such as the en passant square). Default: idle worlds stay unchanged.
 * - `unifyWorlds(bs, mover) -> bs`: the worlds of the chosen outcome, with state-level bookkeeping made identical in
 *   every world (castling rights); same length and order, unchanged worlds by reference, never mutating, and only
 *   data that neither the solid pieces nor `worldResult` read.
 * - `budgetRule(b, side) -> { sides?, limit? }`: the sides that share one quantum budget and its limit (defaults: the
 *   side alone and 8), read on the first world; must be cheap and must never lower a limit during a game.
 * - `recordInfo(prev, code, branch, next) -> object | null`: JSON data stored as `info` on the history record.
 * - `compulsoryCapture` (default false): when some legal move might capture, only such moves are legal (no splits,
 *   no measurements, only merges that might capture).
 * - `passWhenStuck` (default false; true or a function of the new state): a side without a legal move sits out and
 *   the next side that can move is to move, instead of the `noMoves` result.
 * - type flag `resetsQuiet` (default: solid and not royal): moving a piece of this type resets the quiet counter.
 * - move field `certain` (default true for the kinds `castle` and `ep`): a certain move is legal only when every
 *   world generates it as a certain move, so it never rolls, never links and is never a split or merge path.
 */

import { normaliseType } from './world.mjs'

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
		compulsoryCapture: spec.compulsoryCapture ?? false,
		passWhenStuck: spec.passWhenStuck ?? false,
		types,
		orient: spec.orient ?? defaultOrient,
		enemies: spec.enemies ?? ((a, b) => a !== b),
		lineCache: new Map(),
		genCache: new WeakMap(),
	})
	V.sideCount = V.sides.length
	V.solidTypes = new Set(Object.keys(types).filter((t) => types[t].solid || types[t].royal))
	V.royalTypes = new Set(Object.keys(types).filter((t) => types[t].royal))
	// the types whose moves reset the quiet counter (pawns by default)
	V.quietTypes = new Set(Object.keys(types)
		.filter((t) => types[t].resetsQuiet ?? (types[t].solid && !types[t].royal)))
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
