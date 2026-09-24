/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Evaluation of the quantum moves: split (§4.7), merge (§4.8) and Measure (§4.9), with checks 8, 11 and 16–21 of
 * §4.11.
 *
 * PHP twin: lib/Engine/Internal/QuantumMoves.php. Section numbers (§) refer to docs/engine-rules.md.
 */

import { positions, restClasses } from './analysis.js'
import { BUDGET, MAX_LOCATIONS, T } from './constants.js'
import { GEO } from './geometry.js'
import { MoveRecord } from './moveRecord.js'
import { classify, isEnemyCode, laneClear, laneOccupied, MARK, newStamp, standardLane } from './moveRules.js'
import { letterCodeOf, SQUARE_NAMES } from './squares.js'

/** @typedef {import('./analysis.js').Analysis} Analysis */

/**
 * Data shared by all splits of one piece from one square, filled lazily.
 *
 * @typedef {object} SplitContext
 * @property {number} X piece id
 * @property {number} f from square
 * @property {number} letter board character code of the piece
 * @property {number} type type code of the piece
 * @property {number[]} onF indices of the worlds with the piece on `f`
 * @property {Int32Array|null} rc rest class of every world (the projection classes without the piece), once known
 * @property {number} base distinct (rest class, square) keys of the worlds without the piece on `f`, once known
 * @property {Map<number, Uint8Array>} flags lane-clear flags of the worlds of `onF`, per target square
 */

/**
 * Per-(X, f) data shared by all splits of X from f.
 *
 * @param {Analysis} a analysis
 * @param {number} X piece id
 * @param {number} f from
 * @return {SplitContext}
 */
export function splitContext(a, X, f) {
	const letter = letterCodeOf(X)
	const onF = []
	for (let i = 0; i < a.n; i++) {
		if (a.boards[i].charCodeAt(f) === letter) {
			onF.push(i)
		}
	}
	return { X, f, letter, type: a.typeCodes[X], onF, rc: null, base: -1, flags: new Map() }
}

/**
 * Rest classes and the distinct (rest class, square) count of worlds without X on f (for S5).
 *
 * @param {Analysis} a analysis
 * @param {SplitContext} ctx split context
 */
function splitBudgetBase(a, ctx) {
	if (ctx.rc !== null) {
		return
	}
	ctx.rc = restClasses(a, ctx.X).cls
	const pos = positions(a, ctx.X)
	const st = newStamp()
	let count = 0
	for (let i = 0; i < a.n; i++) {
		if (pos[i] === ctx.f) {
			continue
		}
		const key = ctx.rc[i] * 64 + pos[i]
		if (MARK[key] !== st) {
			MARK[key] = st
			count++
		}
	}
	ctx.base = count
}

/**
 * Lane-clear flags for the worlds of ctx.onF, for a split target t. Cached in the context.
 *
 * @param {Analysis} a analysis
 * @param {SplitContext} ctx split context
 * @param {number} t target
 * @return {Uint8Array}
 */
export function splitFlags(a, ctx, t) {
	let fl = ctx.flags.get(t)
	if (fl !== undefined) {
		return fl
	}
	fl = new Uint8Array(ctx.onF.length)
	const laneOcc = laneOccupied(a, standardLane(ctx.type, ctx.f, t, null))
	if (laneOcc !== false) {
		for (let j = 0; j < ctx.onF.length; j++) {
			fl[j] = laneClear(a.boards[ctx.onF[j]], laneOcc) ? 1 : 0
		}
	}
	ctx.flags.set(t, fl)
	return fl
}

/**
 * Evaluate a split (S2–S7; checks 11, 16–19). X = occ(f) is a q/r/b/n of the side to move.
 *
 * @param {Analysis} a analysis
 * @param {number} X piece id
 * @param {number} f from
 * @param {number} t1 lower target index
 * @param {number} t2 higher target index
 * @param {SplitContext} [context] split context from splitContext (optional)
 * @return {MoveRecord|string} record or reason
 */
export function evalSplit(a, X, f, t1, t2, context) {
	const type = a.typeCodes[X]
	if (t1 === f || t2 === f || GEO[type * 4096 + f * 64 + t1] !== 1 || GEO[type * 4096 + f * 64 + t2] !== 1) {
		return 'unreachable'
	}
	if (a.occ[t1] >= 0 || a.occ[t2] >= 0) {
		return 'split_target_occupied'
	}
	const ctx = context || splitContext(a, X, f)
	const c1 = splitFlags(a, ctx, t1)
	const c2 = splitFlags(a, ctx, t2)
	const onF = ctx.onF
	let s4 = false
	let hasT1 = false
	let hasT2 = false
	let hasF = false
	let happen = 0
	for (let j = 0; j < onF.length; j++) {
		const w = a.weights[onF[j]]
		const x1 = c1[j] === 1
		const x2 = c2[j] === 1
		if (x1 && x2) {
			s4 = true
		}
		if (x1) {
			hasT1 = true
		}
		if (x2 && w >= 2) {
			hasT2 = true
		}
		if (!x1 || (!x2 && w >= 2)) {
			hasF = true
		}
		if (x1 || x2) {
			happen += w
		}
	}
	if (!s4) {
		return 'split_blocked'
	}
	const locAfter = a.locs[X].length - 1 + (hasT1 ? 1 : 0) + (hasT2 ? 1 : 0) + (hasF ? 1 : 0)
	if (locAfter > MAX_LOCATIONS) {
		return 'location_cap'
	}
	splitBudgetBase(a, ctx)
	const rc = ctx.rc
	const st = newStamp()
	let count = ctx.base
	for (let j = 0; j < onF.length; j++) {
		const i = onF[j]
		const base = rc[i] * 64
		const k1 = base + (c1[j] === 1 ? t1 : f)
		if (MARK[k1] !== st) {
			MARK[k1] = st
			count++
		}
		if (a.weights[i] >= 2) {
			const k2 = base + (c2[j] === 1 ? t2 : f)
			if (MARK[k2] !== st) {
				MARK[k2] = st
				count++
			}
		}
	}
	if (count > BUDGET) {
		return 'budget_full'
	}
	return new MoveRecord({
		kind: 'split',
		X,
		ci: X < 16 ? 0 : 1,
		type,
		letter: ctx.letter,
		f,
		t: t1,
		f2: -1,
		t2,
		promo: null,
		castle: null,
		pawn: null,
		ep: false,
		laneOcc: null,
		laneOcc2: null,
		flags1: c1,
		flags2: c2,
		onF,
		inM: false,
		wMiss: 0,
		wMove: 0,
		wCap: 0,
		captureId: -1,
		fallback: false,
		resolution: 'quantum',
		outcomes: [],
		happenWeight: happen,
		from: [f],
		to: [t1, t2],
		sortKey: ((1 * 64 + f) * 64 + t1) * 64 + t2,
	})
}

/**
 * Evaluate a merge (M2–M4; checks 11, 20, 21). occ(f1) = occ(f2) = X, a q/r/b/n of the side to move.
 *
 * @param {Analysis} a analysis
 * @param {number} X piece id
 * @param {number} f1 lower source
 * @param {number} f2 higher source
 * @param {number} t target
 * @return {MoveRecord|string} record or reason
 */
export function evalMerge(a, X, f1, f2, t) {
	const type = a.typeCodes[X]
	const ci = X < 16 ? 0 : 1
	if (t === f1 || t === f2 || GEO[type * 4096 + f1 * 64 + t] !== 1 || GEO[type * 4096 + f2 * 64 + t] !== 1) {
		return 'unreachable'
	}
	const z = a.occ[t]
	if (z >= 0 && z !== X && (z < 16) === (ci === 0)) {
		return 'merge_target_own'
	}
	const lane1 = laneOccupied(a, standardLane(type, f1, t, null))
	const lane2 = laneOccupied(a, standardLane(type, f2, t, null))
	const letter = letterCodeOf(X)
	let wMiss = 0
	let wMove = 0
	let wCap = 0
	let m1 = false
	let m2 = false
	for (let i = 0; i < a.n; i++) {
		const b = a.boards[i]
		const w = a.weights[i]
		let arrive = false
		if (b.charCodeAt(f1) === letter) {
			if (lane1 !== false && laneClear(b, lane1)) {
				arrive = true
				m1 = true
			}
		} else if (b.charCodeAt(f2) === letter) {
			if (lane2 !== false && laneClear(b, lane2)) {
				arrive = true
				m2 = true
			}
		}
		if (!arrive) {
			wMiss += w
		} else if (isEnemyCode(b.charCodeAt(t), ci)) {
			wCap += w
		} else {
			wMove += w
		}
	}
	if (!m1 || !m2) {
		return 'merge_part_stuck'
	}
	const rec = new MoveRecord({
		kind: 'merge',
		X,
		ci,
		type,
		letter,
		f: f1,
		t,
		f2,
		t2: -1,
		promo: null,
		castle: null,
		pawn: null,
		ep: false,
		laneOcc: lane1 === false ? null : lane1,
		laneOcc2: lane2 === false ? null : lane2,
		inM: z >= 0 && (z < 16) !== (ci === 0),
		wMiss,
		wMove,
		wCap,
		captureId: wCap > 0 ? z : -1,
		fallback: false,
		resolution: null,
		outcomes: null,
		happenWeight: 0,
		from: [f1, f2],
		to: [t],
		sortKey: ((2 * 64 + f1) * 64 + f2) * 64 + t,
	})
	classify(a, rec)
	return rec
}

/**
 * Evaluate a Measure of X (§4.9; check 8).
 *
 * @param {Analysis} a analysis
 * @param {number} X piece id
 * @return {MoveRecord|string} record or reason
 */
export function evalMeasure(a, X) {
	const loc = a.locs[X]
	if (loc.length < 2) {
		return 'not_superposed'
	}
	const outcomes = loc.map((s, j) => ({ key: SQUARE_NAMES[s], weight: a.locW[X][j] }))
	return new MoveRecord({
		kind: 'measure',
		X,
		ci: X < 16 ? 0 : 1,
		type: a.typeCodes[X],
		letter: letterCodeOf(X),
		f: loc[0],
		t: -1,
		f2: -1,
		t2: -1,
		promo: null,
		castle: null,
		pawn: null,
		ep: false,
		laneOcc: null,
		laneOcc2: null,
		inM: false,
		wMiss: 0,
		wMove: 0,
		wCap: 0,
		captureId: -1,
		fallback: false,
		resolution: 'rolled',
		outcomes,
		happenWeight: T,
		from: [loc[0]],
		to: [],
		sortKey: (3 * 64 + loc[0]) * 64 * 64,
	})
}
