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
 *   `{ type: 'pass', code: null, from: [], to: [] }`; `side` is the side whose turn it was (for a pass the skipped
 *   side). `info.hit` is decided before the solid and game-end rolls: it is true for the idle worlds of an unrolled
 *   move or merge (pass = link) and of every split; it is false for the Missed group of a rolled move or merge
 *   (including the roll that replaces a link over the budget), for every world of a Measure and for a pass. So a final
 *   outcome that a settling roll labels Missed can still have been built with `hit` true. The hook must be pure: it
 *   returns the world itself when nothing changes and never mutates it (per-ply bookkeeping such as the en passant
 *   square). When a link would break the budget, the hook first runs with `hit` true, that result is discarded, and
 *   it runs again with `hit` false on the same world; it also runs in the computer player's search. Default: idle
 *   worlds stay unchanged. `orthodoxSpec()` brings `applyMiss: clearEnPassant` (one en passant square in `x.ep` and
 *   `x.epVictim`); a variant whose `x.ep` has another shape (bughouse: one per board) replaces it.
 * - `unifyWorlds(bs, mover) -> bs`: the worlds of the chosen outcome, with state-level bookkeeping made identical in
 *   every world (castling rights); same length and order, unchanged worlds by reference, never mutating, and only
 *   data that neither the solid pieces, `worldResult`, `stateResult` nor the captures of the next move depend on (the
 *   escape rule below builds its outcomes without this hook). `orthodoxSpec()` brings `unifyWorlds: unifyCastling`.
 * - `budgetRule(b, side) -> { sides?, limit? }`: the sides that share one quantum budget and its limit (defaults: the
 *   side alone and 8), read on the first world; must be cheap and must never lower a limit during a game.
 * - `recordInfo(prev, code, branch, next) -> object | null`: JSON data stored as `info` on the history record (null
 *   stores nothing). Called once per played move at the end of `stateAfter`, after the result, `stateResult`,
 *   `noMoves` and any sit-out: `next.turn` is the side really to move, and the record (`next.history.at(-1)`) already
 *   has `skipped`. Never called in light mode (the computer player's search). `branch.worlds` are the worlds of the
 *   chosen outcome before `unifyWorlds`.
 * - `solidExtra(b) -> string`: the variant's own solid structure (three-check: the check counters). Worlds that
 *   differ in it are settled by the solid roll, like solid pieces; the roll's note is `'solid:' + solidExtra(b)`.
 * - `compulsoryCapture` (default false): when some legal move might capture, only such moves are legal (no splits,
 *   no measurements, only merges that might capture).
 * - `passWhenStuck` (default false; true or a function of the new state): a side without a legal move sits out and
 *   the next side that can move is to move, instead of the `noMoves` result.
 * - type flag `resetsQuiet` (default: solid and not royal): moving a piece of this type resets the quiet counter.
 * - move field `certain` (default true for the kinds `castle` and `ep`): a certain move is legal only when every
 *   world generates it as a certain move, so it never rolls, never links and is never a split or merge path.
 *
 * The classic end rules of docs/rules.md (sections 5 and 6) are switched on by three flags. Their default is true for
 * a "classic" variant: exactly two sides, at least one royal type, no `compulsoryCapture`, and neither `nextSide` nor
 * `actions` (one move per turn). A variant sets a flag to false to leave that rule out:
 *
 * - `escapeRule`: after a move (not in the computer player's search), if every legal action of the side to move
 *   (moves, splits, merges, measurements; at least one) would leave one of its royal pieces to be captured for
 *   certain on the next move (one legal move or merge of the side that moves next takes it in every world: a king
 *   danger of 100 %), the game going on, and none of its actions could capture an enemy royal piece with any chance,
 *   the mover wins at once: `{ winner: mover, reason: 'cannotEscape' }` ("your king cannot escape"). An outcome that
 *   ends the game is an escape, and a side without any legal action gets `noMoves` instead. The search relies on
 *   `generate`, `applyClassical` (with `afterMove`) and `applyMiss` being pure functions of the world.
 * - `bareKingsDraw`: the game is drawn (`reason: 'bareKings'`) when only royal pieces are left on the board in every
 *   world and no hand holds a piece. It is checked after `worldResult` and `stateResult`, so a variant that already
 *   returns `'bareKings'` from `worldResult` keeps its own rule. King of the Hill sets it to false.
 * - `drawsWait`: the generic draws (the quiet-move draw and the bare-kings draw) wait while the side to move can
 *   capture an enemy royal piece for certain (a converging capture counts). Draws a variant returns from its own
 *   hooks are not affected, nor is the move limit. ("No legal move" cannot meet a certain capture.)
 *
 * One more declaration flag, read by the board UI only:
 *
 * - `specialMoves` (default true): false when the variant has neither castling nor en passant, so the shared rules
 *   card leaves out its sentence about them.
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
	// the classic end rules (docs/rules.md 5 and 6) fit a two-player game with royal pieces and one move per turn
	const classic = V.sideCount === 2 && V.royalTypes.size > 0 && !V.compulsoryCapture && !V.nextSide && !V.actions
	V.escapeRule = V.escapeRule ?? classic
	V.bareKingsDraw = V.bareKingsDraw ?? classic
	V.drawsWait = V.drawsWait ?? classic
	V.specialMoves = V.specialMoves ?? true
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
