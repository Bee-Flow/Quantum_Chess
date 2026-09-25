/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The quantum layer shared by every chess variant: a game state is a list of weighted worlds (ordinary positions of the
 * variant, see world.js), and a move is played in all of them at once. The rules are those of classic Quantum Chess
 * (docs/rules.md), generalised; docs/variants.md explains them for players.
 *
 * - **Move**: an ordinary move of the variant, applied world by world. In a world where it cannot be played it
 *   "misses". A move is *measured* (settled by a roll) when the mover is solid, when it is a drop, or when its target
 *   might hold another piece ("land = roll"); otherwise a miss simply leaves the piece where it was and links it to
 *   whatever blocked it ("pass = link"), unless that would break the budget, in which case it is rolled after all.
 * - **Split**: a splittable piece moves to two certainly empty squares at once, half the weight each.
 * - **Merge**: two parts of one piece come together on one square.
 * - **Measure**: find out where one of your own superposed pieces really is.
 *
 * Castling and en passant are *certain* moves (`isCertain`): legal only when every world can play them, so they
 * never roll. Worlds where an action did not take effect ("idle" worlds) pass through the variant's optional
 * `applyMiss` hook, and the worlds of the chosen outcome through its optional `unifyWorlds` hook (variant.js lists
 * every optional hook the quantum layer reads).
 *
 * Two generic checks follow every move: the **solid roll** (solid pieces, such as kings and pawns, are never
 * superposed: if a move would leave one in different places in different worlds, a roll decides) and the
 * **game-end roll** (if the game would be over in some worlds but not in others, a roll decides whether it is).
 *
 * Weights are integers that always sum to T = 2^24 (like the classic rules engine), so the odds shown to players are
 * exact. Every function here is pure; states are plain JSON objects that must be treated as immutable.
 */

import { rescaleWeights } from '../../engine/index.js'
import { applyClassical, generate, HAND, nameOf, OFF, worldKey } from './world.js'

/** The sum of all world weights. */
export const T = 16777216
/** Maximum number of distinct arrangements of one side's pieces over the worlds (default of `budgetRule`). */
export const BUDGET = 8
/** Maximum number of worlds of a state. */
export const MAX_WORLDS = 64
/** Maximum number of squares one piece may be spread over. */
export const MAX_LOCATIONS = 4
/** The state format version. */
export const STATE_VERSION = 1

/**
 * @typedef {object} QState
 * @property {number} v state format version
 * @property {string} variant variant id
 * @property {object} options option values of the game
 * @property {Array<{b: object, w: number}>} worlds weighted worlds, weights summing to T
 * @property {number} turn side to move
 * @property {number} ply plies played
 * @property {number} quiet plies since the last capture, drop or move of a `resetsQuiet` type (pawns) that happened
 * @property {null|{winner: number|null, winners?: number[], reason: string}} result the result, or null
 * @property {object[]} history one record per move played: `{ code, side, key, notes, rolled, p, options, captures,
 *   from, to, skipped?, info? }`
 */

/**
 * @typedef {object} Branch
 * @property {number} weight integer weight of this outcome (all branches sum to T)
 * @property {string} key outcome key: miss, move, capture, split, a square name for a measurement, ...
 * @property {string[]} notes the follow-up rolls that led here (`solid:…`, `end:…`)
 * @property {Array<{b: object, w: number, k: string, cap: number, idle?: boolean, rq?: boolean}>} worlds the worlds
 *   of this outcome (weights not yet rescaled) with their per-world result `k` (miss, move, capture), the capture
 *   square `cap`, `idle` when the action did not take effect there and `rq` when it resets the quiet counter
 * @property {number[]} captures squares where something was captured
 */

const tableCache = new WeakMap()

/**
 * Start a new game.
 *
 * @param {object} V variant
 * @param {object} options option values (see `optionValues`)
 * @param {() => number} [rng] random numbers for variants with a random setup
 * @return {QState}
 */
export function newGame(V, options = {}, rng = Math.random) {
	const b = V.setup(options, rng)
	return {
		v: STATE_VERSION,
		variant: V.id,
		options,
		worlds: [{ b, w: T }],
		turn: 0,
		ply: 0,
		quiet: 0,
		result: null,
		history: [],
	}
}

/**
 * Whether a classical move is *certain*: legal only when every world generates it as a certain move, so it never
 * rolls and never links (castling and en passant by default; a variant opts out or in with the move field
 * `certain`).
 *
 * @param {object} m classical move
 * @return {boolean}
 */
export function isCertain(m) {
	return m.certain ?? (m.kind === 'castle' || m.kind === 'ep')
}

/**
 * The ordinary moves of the side to move, per world and as a union: `{ gens, union, captureKeys }`, cached per
 * state. A certain move's key stays in the union only when every world generates it as a certain move;
 * `captureKeys` are the union keys whose move captures in at least one world.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @return {{gens: Array<Map<string, object>>, union: Map<string, object>, captureKeys: Set<string>}}
 */
function table(V, state) {
	let tb = tableCache.get(state)
	if (tb === undefined) {
		const gens = state.worlds.map(({ b }) => generate(V, b, state.turn))
		const union = new Map()
		const certainKeys = new Set()
		const captureKeys = new Set()
		for (const g of gens) {
			for (const [k, m] of g) {
				if (!union.has(k)) {
					union.set(k, m)
				}
				if (isCertain(m)) {
					certainKeys.add(k)
				}
				if (m.capture >= 0) {
					captureKeys.add(k)
				}
			}
		}
		for (const k of certainKeys) {
			if (gens.some((g) => !g.has(k) || !isCertain(g.get(k)))) {
				union.delete(k)
				captureKeys.delete(k)
			}
		}
		tb = { gens, union, captureKeys }
		tableCache.set(state, tb)
	}
	return tb
}

/**
 * Whether the side to move must capture: the variant has a compulsory capture over the whole state
 * (`compulsoryCapture`) and some legal move key might capture. Then only moves that might capture are legal:
 * ordinary moves in `captureKeys` and merges with a capturing outcome; no splits and no measurements.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @return {boolean}
 */
export function mustCapture(V, state) {
	return Boolean(V.compulsoryCapture) && !state.result && table(V, state).captureKeys.size > 0
}

/**
 * The probability (0..1) of a weight.
 *
 * @param {number} w integer weight
 * @return {number}
 */
export function prob(w) {
	return w / T
}

// ---------------------------------------------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------------------------------------------

/**
 * Who may be on a square: `[{ id, side, type, weight, p }]`, most likely first.
 *
 * @param {QState} state state
 * @param {number} sq square
 * @return {Array<{id: number, side: number, type: string, weight: number, p: number}>}
 */
export function squareView(state, sq) {
	const acc = new Map()
	for (const { b, w } of state.worlds) {
		const id = b.board[sq]
		// also skips squares beyond the board (layout display cells), where there is no id at all
		if (!(id >= 0)) {
			continue
		}
		const key = id + ':' + b.ty[id] + ':' + b.sd[id]
		const e = acc.get(key)
		if (e) {
			e.weight += w
		} else {
			acc.set(key, { id, side: b.sd[id], type: b.ty[id], weight: w })
		}
	}
	return [...acc.values()].map((e) => ({ ...e, p: e.weight / T })).sort((a, b) => b.weight - a.weight)
}

/**
 * Every square with its possible occupants, for drawing the board: an array indexed by square.
 *
 * @param {QState} state state
 * @param {number} size number of squares
 * @return {Array<ReturnType<typeof squareView>>}
 */
export function boardView(state, size) {
	const out = []
	for (let sq = 0; sq < size; sq++) {
		out.push(squareView(state, sq))
	}
	return out
}

/**
 * Where a piece may be: `[{ sq, weight, p }]` (sq -1 for "no longer on the board", -2 for "in hand").
 *
 * @param {QState} state state
 * @param {number} id piece id
 * @return {Array<{sq: number, weight: number, p: number}>}
 */
export function pieceLocations(state, id) {
	const acc = new Map()
	for (const { b, w } of state.worlds) {
		const s = b.sq[id] >= 0 ? b.sq[id] : b.sq[id] === HAND ? HAND : OFF
		acc.set(s, (acc.get(s) ?? 0) + w)
	}
	return [...acc.entries()].map(([sq, weight]) => ({ sq, weight, p: weight / T })).sort((a, b) => a.sq - b.sq)
}

/**
 * The pieces in a side's hand (drop variants): `[{ type, min, max, expected }]` over the worlds.
 *
 * @param {QState} state state
 * @param {number} side side index
 * @return {Array<{type: string, min: number, max: number, expected: number}>}
 */
export function handView(state, side) {
	const types = new Map()
	state.worlds.forEach(({ b }, i) => {
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sq[id] === HAND && b.sd[id] === side) {
				const counts = types.get(b.ty[id]) ?? new Array(state.worlds.length).fill(0)
				counts[i]++
				types.set(b.ty[id], counts)
			}
		}
	})
	const out = []
	for (const [type, counts] of types) {
		let expected = 0
		counts.forEach((c, i) => {
			expected += c * state.worlds[i].w
		})
		out.push({ type, min: Math.min(...counts), max: Math.max(...counts), expected: expected / T })
	}
	return out.sort((a, b) => a.type.localeCompare(b.type))
}

/**
 * The arrangement of one side's pieces in a world, as a text key (the budget counts distinct keys).
 *
 * @param {object} b world
 * @param {number} side side index
 * @return {string}
 */
function projection(b, side) {
	const parts = []
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sd[id] === side && b.sq[id] !== OFF) {
			parts.push(b.sq[id] + b.ty[id])
		}
	}
	return parts.sort().join(',')
}

/**
 * The quantum budget used by a side: the number of distinct arrangements of its pieces over the worlds (1..8).
 *
 * @param {Array<{b: object}>} worlds worlds
 * @param {number} side side index
 * @return {number}
 */
export function budgetOf(worlds, side) {
	const set = new Set()
	for (const { b } of worlds) {
		set.add(projection(b, side))
	}
	return set.size
}

/**
 * The quantum budget used by a side in a state.
 *
 * @param {QState} state state
 * @param {number} side side index
 * @return {number}
 */
export function budget(state, side) {
	return budgetOf(state.worlds, side)
}

/**
 * The budget rule of a side: the sides whose pieces share one budget and its limit, from the variant's optional
 * `budgetRule(b, side)` evaluated on the first world (defaults: the side alone, `BUDGET`).
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {number} side side index
 * @return {{sides: number[], limit: number}}
 */
function budgetRuleOf(V, state, side) {
	const rule = (V.budgetRule && V.budgetRule(state.worlds[0].b, side)) || {}
	return { sides: rule.sides ?? [side], limit: rule.limit ?? BUDGET }
}

/**
 * The number of distinct arrangements of the pieces of several sides together over the worlds. With one side it is
 * `budgetOf`; with more, each piece's part of the key includes its side (a partner's hand knight is not one's own).
 *
 * @param {Array<{b: object}>} worlds worlds
 * @param {number[]} sides side indexes
 * @return {number}
 */
function arrangements(worlds, sides) {
	if (sides.length === 1) {
		return budgetOf(worlds, sides[0])
	}
	const set = new Set()
	for (const { b } of worlds) {
		const parts = []
		for (let id = 0; id < b.sq.length; id++) {
			if (sides.includes(b.sd[id]) && b.sq[id] !== OFF) {
				parts.push(b.sq[id] + ':' + b.sd[id] + b.ty[id])
			}
		}
		set.add(parts.sort().join(','))
	}
	return set.size
}

/**
 * Whether new worlds would break the budget of the side to move (its budget rule applies).
 *
 * @param {object} V variant
 * @param {QState} state state before the move
 * @param {Array<{b: object}>} worlds the worlds after the move
 * @return {boolean}
 */
function overBudget(V, state, worlds) {
	const { sides, limit } = budgetRuleOf(V, state, state.turn)
	return arrangements(worlds, sides) > limit
}

/**
 * The quantum budget of a side under the variant's budget rule: `{ used, limit, sides }`, where `used` counts the
 * distinct arrangements of the pieces of all `sides` together (a team budget) and `limit` is the most allowed.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {number} side side index
 * @return {{used: number, limit: number, sides: number[]}}
 */
export function budgetInfo(V, state, side) {
	const { sides, limit } = budgetRuleOf(V, state, side)
	return { used: arrangements(state.worlds, sides), limit, sides }
}

/**
 * A key of the solid pieces of a world: where every solid piece stands (by side and type, not by id), how many
 * solid pieces each hand holds, and the variant's own solid structure (`solidExtra`).
 *
 * @param {object} V variant
 * @param {object} b world
 * @return {string}
 */
function solidKey(V, b) {
	const parts = []
	for (let sq = 0; sq < b.board.length; sq++) {
		const id = b.board[sq]
		if (id >= 0 && V.solidTypes.has(b.ty[id])) {
			parts.push(sq + ':' + b.sd[id] + b.ty[id])
		}
	}
	const hand = []
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sq[id] === HAND && V.solidTypes.has(b.ty[id])) {
			hand.push(b.sd[id] + b.ty[id])
		}
	}
	// the variant may add structure that must be the same in every world (the timelines of the multiverse)
	return parts.join(',') + '|' + hand.sort().join('') + (V.solidExtra ? '|' + V.solidExtra(b) : '')
}

/**
 * The result of the game in one world, or null while it goes on there.
 *
 * @param {object} V variant
 * @param {object} b world
 * @param {number} mover the side that just moved
 * @return {null|{winner: number|null, winners?: number[], reason: string}}
 */
export function worldResult(V, b, mover) {
	if (V.worldResult) {
		return V.worldResult(b, mover)
	}
	// default: capture the king. The side whose royal pieces are all gone has lost.
	if (V.royalTypes.size === 0) {
		return null
	}
	const alive = []
	for (let s = 0; s < V.sideCount; s++) {
		if (hasRoyalPiece(V, b, s)) {
			alive.push(s)
		}
	}
	if (alive.length === V.sideCount) {
		return null
	}
	if (alive.length === 1) {
		return { winner: alive[0], reason: 'king' }
	}
	return alive.length === 0 ? { winner: null, reason: 'king' } : null
}

/**
 * Whether a side has a royal piece on the board in a world.
 *
 * @param {object} V variant
 * @param {object} b world
 * @param {number} side side index
 * @return {boolean}
 */
function hasRoyalPiece(V, b, side) {
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sd[id] === side && b.sq[id] >= 0 && V.royalTypes.has(b.ty[id])) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------------------------------------------
// Move codes
// ---------------------------------------------------------------------------------------------------------------

/**
 * Parse a quantum move code: an ordinary move key, `f-t1|t2` (split), `f1|f2-t` (merge) or `?s` (measure).
 *
 * @param {object} V variant
 * @param {string} code move code
 * @return {null|{type: string, code: string, from?: number[], to?: number[], key?: string}}
 */
export function parseCode(V, code) {
	if (typeof code !== 'string' || code === '') {
		return null
	}
	const topo = V.topology
	if (code[0] === '?') {
		const s = topo.byName(code.slice(1))
		return s < 0 ? null : { type: 'measure', code, from: [s], to: [] }
	}
	const bar = code.indexOf('|')
	if (bar >= 0) {
		const dash = code.indexOf('-')
		if (dash < 0) {
			return null
		}
		if (bar < dash) {
			const f1 = topo.byName(code.slice(0, bar))
			const f2 = topo.byName(code.slice(bar + 1, dash))
			const t = topo.byName(code.slice(dash + 1))
			return f1 < 0 || f2 < 0 || t < 0 ? null : { type: 'merge', code, from: [f1, f2], to: [t] }
		}
		const f = topo.byName(code.slice(0, dash))
		const t1 = topo.byName(code.slice(dash + 1, bar))
		const t2 = topo.byName(code.slice(bar + 1))
		return f < 0 || t1 < 0 || t2 < 0 ? null : { type: 'split', code, from: [f], to: [t1, t2] }
	}
	return { type: 'move', code, key: code }
}

/**
 * The code of a split.
 *
 * @param {object} V variant
 * @param {number} f from square
 * @param {number} t1 first target
 * @param {number} t2 second target
 * @return {string}
 */
export function splitCode(V, f, t1, t2) {
	const [a, b] = t1 < t2 ? [t1, t2] : [t2, t1]
	return nameOf(V, f) + '-' + nameOf(V, a) + '|' + nameOf(V, b)
}

/**
 * The code of a merge.
 *
 * @param {object} V variant
 * @param {number} f1 first part
 * @param {number} f2 second part
 * @param {number} t target
 * @return {string}
 */
export function mergeCode(V, f1, f2, t) {
	const [a, b] = f1 < f2 ? [f1, f2] : [f2, f1]
	return nameOf(V, a) + '|' + nameOf(V, b) + '-' + nameOf(V, t)
}

// ---------------------------------------------------------------------------------------------------------------
// Legal moves
// ---------------------------------------------------------------------------------------------------------------

/**
 * The unique piece of the side to move on a square over all worlds, or -1 when the square is empty in every world,
 * holds another side's piece in some world, or holds different pieces in different worlds.
 *
 * @param {QState} state state
 * @param {number} sq square
 * @return {number}
 */
export function ownPieceAt(state, sq) {
	let found = -1
	for (const { b } of state.worlds) {
		const id = b.board[sq]
		if (id < 0) {
			continue
		}
		if (b.sd[id] !== state.turn || (found >= 0 && found !== id)) {
			return -1
		}
		found = id
	}
	return found
}

/**
 * Whether a square is empty in every world.
 *
 * @param {QState} state state
 * @param {number} sq square
 * @return {boolean}
 */
export function certainlyEmpty(state, sq) {
	return state.worlds.every(({ b }) => b.board[sq] === -1)
}

/**
 * Whether piece `id` is superposed (in more than one place over the worlds).
 *
 * @param {QState} state state
 * @param {number} id piece id
 * @return {boolean}
 */
function superposed(state, id) {
	const first = state.worlds[0].b.sq[id]
	return state.worlds.some(({ b }) => b.sq[id] !== first)
}

/**
 * The ordinary moves of the side to move: `[{ code, type: 'move', from, to, promo, drop, kind }]`, one per key that
 * can be played in at least one world.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @return {object[]}
 */
export function ordinaryMoves(V, state) {
	if (state.result) {
		return []
	}
	const { union, captureKeys } = table(V, state)
	const must = mustCapture(V, state)
	const out = []
	for (const [key, m] of union) {
		if (!must || captureKeys.has(key)) {
			out.push({ code: key, type: 'move', from: m.from, to: m.to, promo: m.promo, drop: m.drop, kind: m.kind })
		}
	}
	return out
}

/**
 * Whether a classical move may never be the path of a split or a merge: castling and every certain move.
 *
 * @param {object} m classical move
 * @return {boolean}
 */
function noPath(m) {
	return m.kind === 'castle' || isCertain(m)
}

/**
 * The quiet targets of piece `id` from `f` in a world: squares it can reach with an ordinary non-capturing move
 * without promotion (certain moves excluded).
 *
 * @param {Map<string, object>} gen the world's moves
 * @param {number} id piece id
 * @param {number} f from square
 * @return {Map<number, object>}
 */
function quietTargets(gen, id, f) {
	const out = new Map()
	for (const m of gen.values()) {
		if (m.id === id && m.from === f && m.capture < 0 && !m.promo && !m.drop && !noPath(m)) {
			out.set(m.to, m)
		}
	}
	return out
}

/**
 * The squares piece `X` on `f` could split to (before pairing and the budget check): certainly empty squares that it
 * reaches with a quiet move in at least one world where it stands on `f`.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {number} f from square
 * @return {number[]}
 */
export function splitTargets(V, state, f) {
	if (state.result || mustCapture(V, state)) {
		return []
	}
	const X = ownPieceAt(state, f)
	if (X < 0) {
		return []
	}
	const { gens } = table(V, state)
	const targets = new Set()
	state.worlds.forEach(({ b }, i) => {
		if (b.board[f] !== X || !V.types[b.ty[X]].splittable) {
			return
		}
		for (const t of quietTargets(gens[i], X, f).keys()) {
			targets.add(t)
		}
	})
	return [...targets].filter((t) => certainlyEmpty(state, t)).sort((a, b) => a - b)
}

/**
 * The merges available to the piece with a part on `f`: `[{ code, from: [f1, f2], to: [t] }]`.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {number} f a square of one part
 * @return {object[]}
 */
export function mergesFrom(V, state, f) {
	if (state.result) {
		return []
	}
	const list = mergeCandidates(V, state, f)
	// a compulsory capture leaves only the merges that might capture
	return mustCapture(V, state) ? list.filter((m) => branches(V, state, m.code)) : list
}

/**
 * The merges of the piece with a part on `f` (see `mergesFrom`), before the compulsory-capture filter.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {number} f a square of one part
 * @return {object[]}
 */
function mergeCandidates(V, state, f) {
	const X = ownPieceAt(state, f)
	if (X < 0 || !superposed(state, X)) {
		return []
	}
	const { gens } = table(V, state)
	const locs = pieceLocations(state, X).map((l) => l.sq).filter((s) => s >= 0)
	const reach = new Map()
	for (const s of locs) {
		const set = new Set()
		state.worlds.forEach(({ b }, i) => {
			if (b.board[s] === X && V.types[b.ty[X]].splittable) {
				for (const m of gens[i].values()) {
					if (m.id === X && m.from === s && !m.promo && !noPath(m)) {
						set.add(m.to)
					}
				}
			}
		})
		reach.set(s, set)
	}
	const out = []
	for (const other of locs) {
		if (other === f || facesOf(state, X, [f, other]).size > 1) {
			continue
		}
		const common = [...reach.get(f)].filter((t) => reach.get(other).has(t) && t !== f && t !== other)
		for (const t of common) {
			if (friendlyMaybe(state, t, X)) {
				continue
			}
			out.push({
				code: mergeCode(V, f, other, t),
				type: 'merge',
				from: [f, other].sort((a, b) => a - b),
				to: [t],
			})
		}
	}
	return out
}

/**
 * The types ("faces") piece X has in the worlds where it stands on one of the given squares. Parts with different
 * faces (a promotion in some worlds only) cannot merge: Measure could never settle the face again.
 *
 * @param {QState} state state
 * @param {number} X piece id
 * @param {number[]} squares squares
 * @return {Set<string>}
 */
function facesOf(state, X, squares) {
	const out = new Set()
	for (const { b } of state.worlds) {
		if (squares.includes(b.sq[X])) {
			out.add(b.ty[X])
		}
	}
	return out
}

/**
 * Whether a square might hold a piece of the side to move other than X.
 *
 * @param {QState} state state
 * @param {number} t square
 * @param {number} X piece id
 * @return {boolean}
 */
function friendlyMaybe(state, t, X) {
	return state.worlds.some(({ b }) => b.board[t] >= 0 && b.board[t] !== X && b.sd[b.board[t]] === state.turn)
}

/**
 * Every legal move of the side to move. Splits are many; they are included only with `splits: true`.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {object} [opts] options
 * @param {boolean} [opts.splits] include splits (checked against the budget)
 * @return {object[]}
 */
export function legalMoves(V, state, { splits = false } = {}) {
	if (state.result) {
		return []
	}
	const out = ordinaryMoves(V, state)
	const must = mustCapture(V, state)
	const seen = new Set()
	for (const { b } of state.worlds) {
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sd[id] !== state.turn || b.sq[id] < 0 || seen.has(id)) {
				continue
			}
			seen.add(id)
			if (!superposed(state, id) && !splits) {
				continue
			}
			const locs = pieceLocations(state, id).map((l) => l.sq).filter((s) => s >= 0)
			const f0 = locs[0]
			if (ownPieceAt(state, f0) !== id) {
				continue
			}
			if (superposed(state, id)) {
				if (!must) {
					out.push({ code: '?' + nameOf(V, f0), type: 'measure', from: [f0], to: [] })
				}
				const merges = new Map()
				for (const f of locs) {
					for (const m of mergesFrom(V, state, f)) {
						merges.set(m.code, m)
					}
				}
				out.push(...merges.values())
			}
			if (splits) {
				for (const f of locs) {
					out.push(...splitsFrom(V, state, f))
				}
			}
		}
	}
	return out
}

/**
 * The legal splits of the piece on `f`.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {number} f from square
 * @return {object[]}
 */
export function splitsFrom(V, state, f) {
	const targets = splitTargets(V, state, f)
	const out = []
	for (let i = 0; i < targets.length; i++) {
		for (let j = i + 1; j < targets.length; j++) {
			const code = splitCode(V, f, targets[i], targets[j])
			if (branches(V, state, code)) {
				out.push({ code, type: 'split', from: [f], to: [targets[i], targets[j]] })
			}
		}
	}
	return out
}

// ---------------------------------------------------------------------------------------------------------------
// Outcomes
// ---------------------------------------------------------------------------------------------------------------

/**
 * Group worlds by a key function, keeping the first-seen order of the keys.
 *
 * @param {Array<{b: object, w: number, k?: string}>} worlds worlds
 * @param {(e: object) => string} keyOf key function
 * @return {Map<string, object[]>}
 */
function groupBy(worlds, keyOf) {
	const out = new Map()
	for (const e of worlds) {
		const k = keyOf(e)
		const list = out.get(k)
		if (list) {
			list.push(e)
		} else {
			out.set(k, [e])
		}
	}
	return out
}

/**
 * The weight of a list of worlds.
 *
 * @param {Array<{w: number}>} list worlds
 * @return {number}
 */
function weightOf(list) {
	let s = 0
	for (const e of list) {
		s += e.w
	}
	return s
}

/** Outcome keys in display order. */
const KEY_ORDER = ['miss', 'move', 'capture']

/**
 * Whether applying a classical move in a world resets the quiet-move counter: a drop, or a move of a piece whose type
 * (on the from square, before the move) is in `V.quietTypes` (by default the solid, non-royal types: pawns).
 *
 * @param {object} V variant
 * @param {object} b the world before the move
 * @param {object} m classical move
 * @return {boolean}
 */
function resetsQuiet(V, b, m) {
	if (m.drop) {
		return true
	}
	return m.from >= 0 && b.board[m.from] >= 0 && Boolean(V.quietTypes?.has(b.ty[b.board[m.from]]))
}

/**
 * The per-world result of an ordinary move: `[{ b, w, k, cap, idle?, rq? }]` with k miss, move or capture; `idle`
 * marks the worlds where the move did not happen, `rq` the worlds where it resets the quiet counter.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {string} key move key
 * @return {{worlds: object[], sample: object}|null}
 */
function perWorldMove(V, state, key) {
	const { gens, union } = table(V, state)
	const sample = union.get(key)
	if (!sample) {
		return null
	}
	const worlds = state.worlds.map(({ b, w }, i) => {
		const m = gens[i].get(key)
		if (!m) {
			return { b, w, k: 'miss', cap: -1, idle: true }
		}
		return {
			b: applyClassical(V, b, m),
			w,
			k: m.capture >= 0 ? 'capture' : 'move',
			cap: m.capture >= 0 ? m.to : -1,
			rq: resetsQuiet(V, b, m),
		}
	})
	return { worlds, sample }
}

/**
 * Apply the variant's `applyMiss` hook to the idle worlds of a move (the worlds where it did not take effect). The
 * entry flags are kept; without the hook, or when the hook returns the world itself, the entry is unchanged.
 *
 * @param {object} V variant
 * @param {QState} state state before the move
 * @param {object} action what was played: `{ type, code, ... }` (see the `applyMiss` hook in variant.js)
 * @param {object[]} entries per-world results
 * @param {boolean} hit whether some world of the same branch took the action, decided before the settling rolls
 * @return {object[]}
 */
function idleApply(V, state, action, entries, hit) {
	if (!V.applyMiss) {
		return entries
	}
	return entries.map((e) => {
		if (!e.idle) {
			return e
		}
		const b = V.applyMiss(e.b, action, state.turn, { hit })
		return b === e.b ? e : { ...e, b }
	})
}

/**
 * The piece that makes an ordinary move and its type after the move, when they are the same in every world that
 * generates the key: `{ id, type }`, or `{ id: -1 }` when they differ.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {string} key move key
 * @return {{id: number, type?: string}}
 */
function moverOf(V, state, key) {
	const { gens } = table(V, state)
	let id = -2
	let type = null
	state.worlds.forEach(({ b }, i) => {
		const m = gens[i].get(key)
		if (!m || id === -1) {
			return
		}
		const ty = m.promo || b.ty[m.id]
		if (id === -2) {
			id = m.id
			type = ty
		} else if (id !== m.id || type !== ty) {
			id = -1
		}
	})
	return id >= 0 ? { id, type } : { id: -1 }
}

/**
 * Whether an ordinary move is measured (settled by a roll when its per-world results differ). A part of the moving
 * piece itself on the target (same id, same type) is not "another piece": the moving part joins it.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {object} sample the move as generated in one world
 * @return {boolean}
 */
function isMeasured(V, state, sample) {
	if (sample.drop || sample.kind === 'drop') {
		return true
	}
	if (V.measured && V.measured(sample)) {
		return true
	}
	let self = null
	for (const { b } of state.worlds) {
		const mover = sample.from >= 0 ? b.board[sample.from] : -1
		if (mover >= 0 && V.solidTypes.has(b.ty[mover])) {
			return true
		}
		const occ = b.board[sample.to]
		if (occ >= 0 && occ !== mover) {
			self ??= moverOf(V, state, sample.key)
			if (occ !== self.id || b.ty[occ] !== self.type) {
				return true
			}
		}
	}
	return false
}

/**
 * All possible outcomes of a move, with their weights, or null when the move is illegal. This is the heart of the
 * quantum layer: `applyMove` samples one of these branches, the move preview shows them, and the computer player
 * averages over them.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {string} code move code
 * @return {Branch[]|null}
 */
export function branches(V, state, code) {
	if (state.result) {
		return null
	}
	const mv = parseCode(V, code)
	if (!mv) {
		return null
	}
	const must = mustCapture(V, state)
	if (must && (mv.type === 'split' || mv.type === 'measure'
		|| (mv.type === 'move' && !table(V, state).captureKeys.has(mv.key)))) {
		return null
	}
	let groups
	if (mv.type === 'move') {
		groups = moveBranches(V, state, mv.key)
	} else if (mv.type === 'split') {
		groups = splitBranches(V, state, mv)
	} else if (mv.type === 'merge') {
		groups = mergeBranches(V, state, mv)
	} else {
		groups = measureBranches(V, state, mv)
	}
	if (!groups || (must && !groups.some((g) => g.captures.length > 0))) {
		return null
	}
	const out = []
	for (const g of groups) {
		for (const s of settle(V, state, g)) {
			out.push(s)
		}
	}
	return out
}

/**
 * Turn per-world results into branches: one branch when not rolled, one per key when rolled.
 *
 * @param {object[]} worlds per-world results
 * @param {boolean} rolled whether the move is settled by a roll
 * @return {Branch[]}
 */
function toBranches(worlds, rolled) {
	if (!rolled) {
		return [{ weight: T, key: resultKey(worlds), rolled: false, notes: [], worlds, captures: capturesOf(worlds) }]
	}
	const g = groupBy(worlds, (e) => e.k)
	return [...g.entries()]
		.sort((a, b) => KEY_ORDER.indexOf(a[0]) - KEY_ORDER.indexOf(b[0]))
		.map(([key, list]) => ({
			weight: weightOf(list),
			key,
			rolled: true,
			notes: [],
			worlds: list,
			captures: capturesOf(list),
		}))
}

/**
 * The outcome key of a list of per-world results: capture if some world captured, else move if some world moved,
 * else miss.
 *
 * @param {Array<{k: string}>} list per-world results
 * @return {string}
 */
function resultKey(list) {
	const keys = new Set(list.map((e) => e.k))
	return keys.has('capture') ? 'capture' : keys.has('move') ? 'move' : 'miss'
}

/**
 * The capture squares of a list of per-world results.
 *
 * @param {Array<{cap: number}>} list per-world results
 * @return {number[]}
 */
function capturesOf(list) {
	return [...new Set(list.filter((e) => e.cap >= 0).map((e) => e.cap))]
}

/**
 * Outcomes of an ordinary move or a merge from its per-world results: one unrolled branch when every world gives the
 * same result or the move links (pass = link, the idle worlds pass through `applyMiss` with `hit` true), else one
 * rolled branch per result (the idle worlds of the Missed branch pass through `applyMiss` with `hit` false). A link
 * that would break the budget of the side to move is rolled after all.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {object[]} worlds per-world results
 * @param {object} action the action for `applyMiss`
 * @param {() => boolean} measured whether the move is measured (land = roll)
 * @return {Branch[]}
 */
function linkOrRoll(V, state, worlds, action, measured) {
	const keys = new Set(worlds.map((e) => e.k))
	if (keys.size === 1) {
		return toBranches(worlds, false)
	}
	if (!measured()) {
		const linked = idleApply(V, state, action, worlds, true)
		if (!overBudget(V, state, linked)) {
			return toBranches(linked, false)
		}
	}
	return toBranches(idleApply(V, state, action, worlds, false), true)
}

/**
 * Outcomes of an ordinary move.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {string} key move key
 * @return {Branch[]|null}
 */
function moveBranches(V, state, key) {
	const r = perWorldMove(V, state, key)
	if (!r) {
		return null
	}
	const action = { type: 'move', code: key, key, sample: r.sample }
	return linkOrRoll(V, state, r.worlds, action, () => isMeasured(V, state, r.sample))
}

/**
 * Outcomes of a split (never rolled), or null when it is illegal.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {object} mv parsed split
 * @return {Branch[]|null}
 */
function splitBranches(V, state, mv) {
	const f = mv.from[0]
	let [t1, t2] = mv.to
	if (t1 === t2 || t1 === f || t2 === f) {
		return null
	}
	if (t2 < t1) {
		[t1, t2] = [t2, t1]
	}
	const X = ownPieceAt(state, f)
	if (X < 0 || !certainlyEmpty(state, t1) || !certainlyEmpty(state, t2)) {
		return null
	}
	const home = state.worlds.find(({ b }) => b.board[f] === X).b
	if (!V.types[home.ty[X]].splittable) {
		return null
	}
	const { gens } = table(V, state)
	const entries = []
	let branching = false
	/**
	 * One child of a world: X moved by `m`, or idle (X not on `f`, or that quiet move is not possible there).
	 *
	 * @param {object} b world
	 * @param {number} w weight
	 * @param {object|null|undefined} m the quiet move of X in that world
	 */
	const child = (b, w, m) => {
		entries.push(m
			? { b: applyClassical(V, b, m), w, k: 'move', cap: -1, rq: resetsQuiet(V, b, m) }
			: { b, w, k: 'move', cap: -1, idle: true })
	}
	state.worlds.forEach(({ b, w }, i) => {
		if (b.board[f] !== X) {
			child(b, w, null)
			return
		}
		const q = quietTargets(gens[i], X, f)
		const m1 = q.get(t1)
		const m2 = q.get(t2)
		if (m1 && m2) {
			branching = true
		}
		const w1 = Math.ceil(w / 2)
		const w2 = w - w1
		child(b, w1, m1)
		if (w2 > 0) {
			child(b, w2, m2)
		}
	})
	if (!branching) {
		return null
	}
	const worlds = idleApply(V, state, { type: 'split', code: mv.code, id: X, from: [f], to: [t1, t2] }, entries, true)
	const merged = dedupe(worlds)
	if (merged.length > MAX_WORLDS || overBudget(V, state, merged)) {
		return null
	}
	const locs = new Set(merged.map(({ b }) => b.sq[X]))
	if (locs.size > MAX_LOCATIONS) {
		return null
	}
	return [{ weight: T, key: 'split', rolled: false, notes: [], worlds, captures: [] }]
}

/**
 * The per-world result of a merge: `{ X, worlds }` with `worlds` as for `perWorldMove` plus the move `m` each world
 * played (null in an idle world), or null when the merge is illegal. In each world X comes from `f1` if it can, else
 * from `f2`, else the merge misses there.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {object} mv parsed merge
 * @return {{X: number, worlds: object[]}|null}
 */
function perWorldMerge(V, state, mv) {
	const [f1, f2] = mv.from
	const t = mv.to[0]
	const X = ownPieceAt(state, f1)
	if (X < 0 || ownPieceAt(state, f2) !== X || f1 === f2 || t === f1 || t === f2 || friendlyMaybe(state, t, X)) {
		return null
	}
	if (!V.types[state.worlds[0].b.ty[X]].splittable || facesOf(state, X, [f1, f2]).size > 1) {
		return null
	}
	const { gens } = table(V, state)
	const find = (i, from) => {
		for (const m of gens[i].values()) {
			if (m.id === X && m.from === from && m.to === t && !m.promo && !noPath(m)) {
				return m
			}
		}
		return null
	}
	let arrive1 = false
	let arrive2 = false
	const worlds = state.worlds.map(({ b, w }, i) => {
		const m = (b.board[f1] === X && find(i, f1)) || (b.board[f2] === X && find(i, f2)) || null
		if (m && m.from === f1) {
			arrive1 = true
		}
		if (m && m.from === f2) {
			arrive2 = true
		}
		if (!m) {
			return { b, w, k: 'miss', cap: -1, idle: true, m: null }
		}
		return {
			b: applyClassical(V, b, m),
			w,
			k: m.capture >= 0 ? 'capture' : 'move',
			cap: m.capture >= 0 ? t : -1,
			rq: resetsQuiet(V, b, m),
			m,
		}
	})
	if (!arrive1 || !arrive2) {
		return null
	}
	return { X, worlds }
}

/**
 * Outcomes of a merge, or null when it is illegal.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {object} mv parsed merge
 * @return {Branch[]|null}
 */
function mergeBranches(V, state, mv) {
	const r = perWorldMerge(V, state, mv)
	if (!r) {
		return null
	}
	const t = mv.to[0]
	const action = { type: 'merge', code: mv.code, id: r.X, from: mv.from.slice(), to: [t] }
	const enemyMaybe = () => state.worlds.some(({ b }) => b.board[t] >= 0 && b.sd[b.board[t]] !== state.turn)
	return linkOrRoll(V, state, r.worlds, action, enemyMaybe)
}

/**
 * Outcomes of a measurement, or null when it is illegal.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {object} mv parsed measure
 * @return {Branch[]|null}
 */
function measureBranches(V, state, mv) {
	const X = ownPieceAt(state, mv.from[0])
	if (X < 0 || !superposed(state, X)) {
		return null
	}
	// every world is idle: the turn passes without a move on the board
	const action = { type: 'measure', code: mv.code, id: X, from: [mv.from[0]], to: [] }
	const g = groupBy(state.worlds, ({ b }) => String(b.sq[X]))
	return [...g.entries()]
		.sort((a, b) => Number(a[0]) - Number(b[0]))
		.map(([sq, list]) => {
			const idle = list.map(({ b, w }) => ({ b, w, k: 'move', cap: -1, idle: true }))
			return {
				weight: weightOf(list),
				key: Number(sq) >= 0 ? nameOf(V, Number(sq)) : 'gone',
				rolled: true,
				notes: [],
				worlds: idleApply(V, state, action, idle, false),
				captures: [],
			}
		})
}

/**
 * Merge identical worlds (summing their weights), keeping the first-seen order.
 *
 * @param {Array<{b: object, w: number}>} worlds worlds
 * @return {Array<{b: object, w: number}>}
 */
function dedupe(worlds) {
	const map = new Map()
	for (const { b, w } of worlds) {
		const k = worldKey(b)
		const e = map.get(k)
		if (e) {
			e.w += w
		} else {
			map.set(k, { b, w })
		}
	}
	return [...map.values()]
}

/**
 * Apply the solid roll and the game-end roll to a branch: split it further when solid pieces or the game result
 * differ between its worlds.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {Branch} branch branch
 * @return {Branch[]}
 */
function settle(V, state, branch) {
	let list = [branch]
	const split = (keyOf, noteOf) => {
		const out = []
		for (const br of list) {
			const g = groupBy(br.worlds, keyOf)
			if (g.size === 1) {
				out.push(br)
				continue
			}
			for (const [k, ws] of g) {
				out.push({
					...br,
					...partLabel(branch.key, ws),
					weight: weightOf(ws) * (br.weight / weightOf(br.worlds)),
					notes: [...br.notes, noteOf(ws[0].b, k)],
					worlds: ws,
					rolled: true,
				})
			}
		}
		list = out
	}
	split((e) => solidKey(V, e.b), (b) => 'solid:' + (V.solidExtra ? V.solidExtra(b) : ''))
	split((e) => JSON.stringify(worldResult(V, e.b, state.turn)), (b, k) => 'end:' + k)
	// weights of sub-branches: the share of the branch weight, as integers summing to the branch weight
	return integerWeights(list, branch.weight)
}

/**
 * The outcome key (and captures) of one part of a branch that a settling roll split: a part of a miss, move or
 * capture branch takes the key and the captures of its own worlds; a part of a split whose worlds are all idle is a
 * miss; other keys (a measured square, `gone`) stay.
 *
 * @param {string} key the key of the branch before the settling rolls
 * @param {object[]} ws the worlds of the part
 * @return {{key?: string, captures?: number[]}}
 */
function partLabel(key, ws) {
	if (key === 'miss' || key === 'move' || key === 'capture') {
		return { key: resultKey(ws), captures: capturesOf(ws) }
	}
	if (key === 'split') {
		return { key: ws.every((e) => e.idle) ? 'miss' : 'split' }
	}
	return {}
}

/**
 * Make the weights of sub-branches integers that sum exactly to `total` (largest remainder).
 *
 * @param {Branch[]} list branches with possibly fractional weights
 * @param {number} total the integer total
 * @return {Branch[]}
 */
function integerWeights(list, total) {
	if (list.length === 1) {
		return [{ ...list[0], weight: total }]
	}
	const floors = list.map((b) => Math.floor(b.weight))
	let rest = total - floors.reduce((a, b) => a + b, 0)
	const order = list
		.map((b, i) => i)
		.sort((a, b) => (list[b].weight - floors[b]) - (list[a].weight - floors[a]) || a - b)
	for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) {
		floors[order[k]]++
	}
	return list.map((b, i) => ({ ...b, weight: floors[i] }))
}

/**
 * The outcomes of a move for display: `[{ key, notes, p, captures }]`, or null when illegal.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {string} code move code
 * @return {Array<{key: string, notes: string[], p: number, captures: number[], rolled: boolean}>|null}
 */
export function outcomes(V, state, code) {
	const list = branches(V, state, code)
	return list
		? list.map((b) => ({ key: b.key, notes: b.notes, p: b.weight / T, captures: b.captures, rolled: b.rolled }))
		: null
}

/**
 * Whether a move is legal.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {string} code move code
 * @return {boolean}
 */
export function isLegal(V, state, code) {
	return branches(V, state, code) !== null
}

// ---------------------------------------------------------------------------------------------------------------
// Applying a move
// ---------------------------------------------------------------------------------------------------------------

/**
 * The next side to move after `side`, skipping sides that are out of the game.
 *
 * @param {object} V variant
 * @param {object} b a world of the new state
 * @param {number} side the side that just moved
 * @return {number}
 */
function nextSide(V, b, side) {
	if (V.nextSide) {
		return V.nextSide(b, side)
	}
	for (let i = 1; i <= V.sideCount; i++) {
		const s = (side + i) % V.sideCount
		if (!V.isOut || !V.isOut(b, s)) {
			return s
		}
	}
	return side
}

/**
 * The worlds of a new state: identical worlds merged, weights rescaled to sum to T, sorted by world key.
 *
 * @param {Array<{b: object, w: number}>} entries worlds with (unscaled) weights
 * @return {Array<{b: object, w: number}>}
 */
function normalWorlds(entries) {
	const merged = dedupe(entries)
	const weights = rescaleWeights(merged.map((e) => e.w))
	return merged
		.map((e, i) => ({ b: e.b, w: weights[i], key: worldKey(e.b) }))
		.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
		.map(({ b, w }) => ({ b, w }))
}

/**
 * The squares of a move for the history record (last-move marks): `{ from, to }`.
 *
 * @param {object} V variant
 * @param {QState} state state before the move
 * @param {object} mv parsed move code
 * @return {{from: number[], to: number[]}}
 */
function recordSquares(V, state, mv) {
	if (mv.type !== 'move') {
		return { from: mv.from.slice(), to: mv.to.slice() }
	}
	const sample = table(V, state).union.get(mv.key)
	return {
		from: sample && sample.from >= 0 ? [sample.from] : [],
		to: sample && sample.to >= 0 ? [sample.to] : [],
	}
}

/**
 * When the side to move of a new state has no legal move and the variant lets such a side sit out
 * (`passWhenStuck`): the state in which the next side that can move is to move, and the sides passed over. Each
 * skipped turn is an idle turn: every world passes through `applyMiss` with the action `pass`. Null when the variant
 * does not allow it or no side can move.
 *
 * @param {object} V variant
 * @param {QState} next the new state (no result, the side to move is stuck)
 * @return {{state: QState, skipped: number[]}|null}
 */
function sitOut(V, next) {
	const on = typeof V.passWhenStuck === 'function' ? V.passWhenStuck(next) : V.passWhenStuck
	if (!on) {
		return null
	}
	const stuck = next.turn
	const skipped = []
	let probe = next
	for (let i = 1; i < V.sideCount; i++) {
		const side = probe.turn
		skipped.push(side)
		const worlds = V.applyMiss
			? normalWorlds(probe.worlds.map(({ b, w }) => ({
					b: V.applyMiss(b, { type: 'pass', code: null, from: [], to: [] }, side, { hit: false }),
					w,
				})))
			: probe.worlds
		const turn = nextSide(V, worlds[0].b, side)
		if (turn === stuck || turn === side) {
			return null
		}
		// a new state object per probe: the move table is cached per state object
		probe = { ...probe, worlds, turn }
		if (hasLegalMove(V, probe)) {
			return { state: probe, skipped }
		}
	}
	return null
}

/**
 * Build the state after a chosen branch.
 *
 * @param {object} V variant
 * @param {QState} state state before the move
 * @param {string} code move code
 * @param {Branch} branch the chosen outcome
 * @param {Branch[]} all every outcome (for the history record)
 * @param {object} [opts] options
 * @param {boolean} [opts.light] for the computer player's search: no history record, no "no legal move" check
 * @return {QState}
 */
export function stateAfter(V, state, code, branch, all, { light = false } = {}) {
	let entries = branch.worlds
	if (V.unifyWorlds) {
		// state-level facts (castling rights) made identical in every world, before identical worlds merge
		const bs = V.unifyWorlds(entries.map((e) => e.b), state.turn)
		entries = entries.map((e, i) => (bs[i] === e.b ? e : { ...e, b: bs[i] }))
	}
	const worlds = normalWorlds(entries)
	const b0 = worlds[0].b
	const mv = parseCode(V, code)
	// only a move that really happened resets the counter: a capture, or a drop or pawn move in a world that played it
	const resetQuiet = branch.captures.length > 0 || branch.worlds.some((e) => e.rq)
	let record = null
	if (!light) {
		record = {
			code,
			side: state.turn,
			key: branch.key,
			notes: branch.notes,
			rolled: branch.rolled,
			p: branch.weight / T,
			options: all.length,
			captures: branch.captures,
			...recordSquares(V, state, mv),
		}
	}
	let next = {
		v: STATE_VERSION,
		variant: state.variant,
		options: state.options,
		worlds,
		turn: nextSide(V, b0, state.turn),
		ply: state.ply + 1,
		quiet: resetQuiet ? 0 : state.quiet + 1,
		result: worldResult(V, b0, state.turn),
		history: light ? state.history : [...state.history, record],
	}
	if (!next.result && V.stateResult) {
		next.result = V.stateResult(next)
	}
	if (!next.result && next.quiet >= V.quietPlies) {
		next.result = { winner: null, reason: 'quiet' }
	}
	if (!next.result && next.ply >= V.maxPly) {
		next.result = { winner: null, reason: 'moveLimit' }
	}
	if (!next.result && !light && !hasLegalMove(V, next)) {
		const out = sitOut(V, next)
		if (out) {
			next = out.state
			record.skipped = out.skipped
		} else {
			next.result = V.noMoves ? V.noMoves(next) : { winner: null, reason: 'noMoves' }
		}
	}
	if (!light && V.recordInfo) {
		const info = V.recordInfo(state, code, branch, next)
		if (info !== null && info !== undefined) {
			record.info = info
		}
	}
	return next
}

/**
 * Whether the side to move has any legal move (an ordinary move, a measurement or a merge; a side that can split can
 * also move).
 *
 * @param {object} V variant
 * @param {QState} state state
 * @return {boolean}
 */
export function hasLegalMove(V, state) {
	if (table(V, state).union.size > 0) {
		return true
	}
	return legalMoves(V, state).length > 0
}

/**
 * Pick a branch with a random number r in [0, 1).
 *
 * @param {Branch[]} list branches
 * @param {number} r random number
 * @return {Branch}
 */
export function pickBranch(list, r) {
	const u = Math.floor(r * T)
	let acc = 0
	for (const b of list) {
		acc += b.weight
		if (u < acc) {
			return b
		}
	}
	return list[list.length - 1]
}

/**
 * Play a move. Returns `{ state, branch, outcomes }`, or null when the move is illegal.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {string} code move code
 * @param {(() => number)|number} [rng] random number source, or a fixed number in [0, 1)
 * @return {{state: QState, branch: Branch, outcomes: Branch[]}|null}
 */
export function applyMove(V, state, code, rng = Math.random) {
	const list = branches(V, state, code)
	if (!list) {
		return null
	}
	const r = list.length === 1 ? 0 : typeof rng === 'number' ? rng : rng()
	const branch = pickBranch(list, r)
	return { state: stateAfter(V, state, code, branch, list), branch, outcomes: list }
}

/**
 * Play a move with a chosen outcome (index into `branches`), for tests, lessons and replays.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {string} code move code
 * @param {number} index outcome index
 * @return {QState|null}
 */
export function applyOutcome(V, state, code, index) {
	const list = branches(V, state, code)
	if (!list || !list[index]) {
		return null
	}
	return stateAfter(V, state, code, list[index], list)
}

/**
 * The chance (0..1) that one enemy move could capture a royal piece of `side` right now: the largest, over the moves
 * of every enemy, of the weight of the worlds in which that move takes a royal piece of `side`. A capture counts when
 * it captures a royal piece, or when `side` has a royal piece before it and none after it (explosions); a merge
 * counts with every world in which one of its parts captures (converging captures).
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {number} side side index
 * @return {number}
 */
export function royalDanger(V, state, side) {
	if (state.result || V.royalTypes.size === 0) {
		return 0
	}
	let best = 0
	for (let e = 0; e < V.sideCount; e++) {
		if (!V.enemies(e, side) || (V.isOut && V.isOut(state.worlds[0].b, e))) {
			continue
		}
		const acc = new Map()
		for (const { b, w } of state.worlds) {
			const royal = hasRoyalPiece(V, b, side)
			for (const m of generate(V, b, e).values()) {
				if (m.capture >= 0 && royalLoss(V, b, m, side, royal, null)) {
					acc.set(m.key, (acc.get(m.key) ?? 0) + w)
				}
			}
		}
		for (const w of acc.values()) {
			best = Math.max(best, w / T)
		}
		best = Math.max(best, mergeDanger(V, state, e, side))
	}
	return best
}

/**
 * Whether a capture in world `b` takes a royal piece of `side`: it captures one, or `side` had one (`royal`) and has
 * none after the move.
 *
 * @param {object} V variant
 * @param {object} b world before the move
 * @param {object} m capturing move
 * @param {number} side the side in danger
 * @param {boolean} royal whether `side` has a royal piece in `b`
 * @param {object|null} after the world after the move, if already known
 * @return {boolean}
 */
function royalLoss(V, b, m, side, royal, after) {
	if (b.sd[m.capture] === side && V.royalTypes.has(b.ty[m.capture])) {
		return true
	}
	return royal && !hasRoyalPiece(V, after ?? applyClassical(V, b, m), side)
}

/**
 * The largest danger to a royal piece of `side` from one merge of enemy `e` onto a square that may hold such a piece
 * (a converging capture): the weight of the worlds in which the merge takes a royal piece of `side`.
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {number} e enemy side
 * @param {number} side the side in danger
 * @return {number}
 */
function mergeDanger(V, state, e, side) {
	// a new state object for another side to move: the move table is cached per state object
	const se = state.turn === e ? state : { ...state, turn: e }
	const royalMaybe = (t) => se.worlds.some(({ b }) => {
		const id = b.board[t]
		return id >= 0 && b.sd[id] === side && V.royalTypes.has(b.ty[id])
	})
	const pieces = new Set()
	for (const { b } of se.worlds) {
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sd[id] === e && b.sq[id] >= 0 && V.types[b.ty[id]]?.splittable) {
				pieces.add(id)
			}
		}
	}
	let best = 0
	const seen = new Set()
	for (const X of pieces) {
		if (!superposed(se, X)) {
			continue
		}
		for (const { sq: f } of pieceLocations(se, X)) {
			for (const mv of f >= 0 ? mergeCandidates(V, se, f) : []) {
				if (seen.has(mv.code) || !royalMaybe(mv.to[0])) {
					continue
				}
				seen.add(mv.code)
				const r = perWorldMerge(V, se, mv)
				let w = 0
				r?.worlds.forEach((entry, i) => {
					const b = se.worlds[i].b
					if (entry.m && entry.m.capture >= 0
						&& royalLoss(V, b, entry.m, side, hasRoyalPiece(V, b, side), entry.b)) {
						w += entry.w
					}
				})
				best = Math.max(best, w / T)
			}
		}
	}
	return best
}

/**
 * The squares a side might reach with an ordinary move in some world (for fog of war).
 *
 * @param {object} V variant
 * @param {QState} state state
 * @param {number} side side index
 * @return {Set<number>}
 */
export function reachable(V, state, side) {
	const out = new Set()
	for (const { b } of state.worlds) {
		for (const m of generate(V, b, side).values()) {
			out.add(m.to)
		}
	}
	return out
}
