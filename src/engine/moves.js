/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Move evaluation, legality (§4.4–§4.11) and generation (§4.10).
 *
 * Every candidate move is evaluated by the same functions, whether it comes from the generator, from `whyIllegal`
 * or from `findMove`, so the three can never disagree. A legal move is represented internally by a *record* that
 * keeps everything `applyMove` needs; its public face is the LegalMove object (`rec.legal`).
 */

import { analyse, positions, restClasses } from './analysis.js'
import { BUDGET, CASTLING, MAX_LOCATIONS, T } from './constants.js'
import {
	GEO,
	KING,
	KNIGHT,
	LANE,
	PAWN_CAPTURES,
	PAWN_DOUBLE,
	PAWN_PUSH,
	pawnKind,
	RAYS,
	SLIDE_DIRS,
	TARGETS,
	TYPE_B,
	TYPE_K,
	TYPE_N,
	TYPE_P,
	TYPE_Q,
	TYPE_R,
} from './geometry.js'
import { parseMoveCode } from './parser.js'
import { letterCodeOf, SQUARE_NAMES } from './squares.js'

export const MISS = 0
export const MOVE = 1
export const CAPTURE = 2
export const KEY_NAMES = ['miss', 'move', 'capture']

const PROMO_INDEX = { q: 1, r: 2, b: 3, n: 4 }
const PROMOS = ['q', 'r', 'b', 'n']
const LETTER_TYPE = { K: TYPE_K, Q: TYPE_Q, R: TYPE_R, B: TYPE_B, N: TYPE_N }
const NO_SQUARES = Object.freeze([])

/**
 * Internal move record: everything applyMove needs about one legal move in one state. All instances share one
 * field layout (monomorphic property access in the hot loops).
 */
class MoveRecord {
	/**
	 * @param {object} p fields
	 */
	constructor(p) {
		this.kind = p.kind
		this.X = p.X
		this.ci = p.ci
		this.type = p.type
		this.letter = p.letter
		this.f = p.f
		this.t = p.t
		this.f2 = p.f2
		this.t2 = p.t2
		this.promo = p.promo
		this.castle = p.castle
		this.pawn = p.pawn
		this.ep = p.ep
		this.laneOcc = p.laneOcc
		this.laneOcc2 = p.laneOcc2
		this.flags1 = p.flags1 ?? null
		this.flags2 = p.flags2 ?? null
		this.onF = p.onF ?? null
		this.inM = p.inM
		this.wMiss = p.wMiss
		this.wMove = p.wMove
		this.wCap = p.wCap
		this.captureId = p.captureId
		this.fallback = p.fallback
		this.resolution = p.resolution
		this.outcomes = p.outcomes
		this.happenWeight = p.happenWeight
		this.from = p.from
		this.to = p.to
		this.sortKey = p.sortKey
		this.code = null
		this.legal = null
		this.risk = undefined
	}

	/**
	 * A copy with another promotion piece (the four promotions have identical weights).
	 *
	 * @param {string} promo promotion letter
	 * @return {MoveRecord}
	 */
	withPromo(promo) {
		const r = new MoveRecord(this)
		r.promo = promo
		r.outcomes = this.outcomes.map((o) => ({ key: o.key, weight: o.weight }))
		r.sortKey = ((0 * 64 + this.f) * 64 + this.t) * 64 + PROMO_INDEX[promo]
		return r
	}
}

/** Scratch marks for distinct-key counting (keys < 64 · 64). */
const MARK = new Uint32Array(4096)
let stamp = 0

/**
 * Start a new distinct-key count.
 *
 * @return {number} the stamp to use
 */
function newStamp() {
	stamp++
	if (stamp === 0xffffffff) {
		MARK.fill(0)
		stamp = 1
	}
	return stamp
}

/**
 * Is character code c a piece of the colour opposite to ci?
 *
 * @param {number} c character code
 * @param {number} ci colour index of the mover
 * @return {boolean}
 */
function isEnemyCode(c, ci) {
	return ci === 0 ? (c >= 0x61 && c <= 0x70) : (c >= 0x41 && c <= 0x50)
}

/**
 * Lane squares that are possibly occupied, or `null` when the lane is certainly clear, or `false` when some lane
 * square is certainly occupied (blocked in every world).
 *
 * @param {object} a analysis
 * @param {number[]} lane lane squares
 * @return {number[]|null|false}
 */
function laneOccupied(a, lane) {
	let out = null
	for (let i = 0; i < lane.length; i++) {
		const s = lane[i]
		if (a.occ[s] >= 0) {
			if (a.occW[s] === T) {
				return false
			}
			if (out === null) {
				out = []
			}
			out.push(s)
		}
	}
	return out
}

/**
 * Is the lane clear in board b? `laneOcc` from laneOccupied (not false).
 *
 * @param {string} b board
 * @param {number[]|null} laneOcc possibly occupied lane squares
 * @return {boolean}
 */
function laneClear(b, laneOcc) {
	if (laneOcc === null) {
		return true
	}
	for (let i = 0; i < laneOcc.length; i++) {
		if (b.charCodeAt(laneOcc[i]) !== 46) {
			return false
		}
	}
	return true
}

/**
 * The lane of a standard move of a piece of type code `type`.
 *
 * @param {number} type type code
 * @param {number} f from
 * @param {number} t to
 * @param {string|null} pk pawn kind
 * @return {number[]}
 */
function standardLane(type, f, t, pk) {
	if (type === TYPE_Q || type === TYPE_R || type === TYPE_B) {
		return LANE[f * 64 + t]
	}
	if (pk === 'double') {
		return [(f + t) >> 1]
	}
	return NO_SQUARES
}

/**
 * Per-world key of a standard (non-castling) move in board b (§4.3).
 *
 * @param {object} rec move record
 * @param {string} b board
 * @return {number} MISS, MOVE or CAPTURE
 */
export function standardKeyIn(rec, b) {
	if (b.charCodeAt(rec.f) !== rec.letter) {
		return MISS
	}
	if (!laneClear(b, rec.laneOcc)) {
		return MISS
	}
	const c = b.charCodeAt(rec.t)
	if (rec.pawn === 'push' || rec.pawn === 'double') {
		return c === 46 ? MOVE : MISS
	}
	if (rec.pawn === 'diagonal') {
		return rec.ep || isEnemyCode(c, rec.ci) ? CAPTURE : MISS
	}
	if (c === 46) {
		return MOVE
	}
	return isEnemyCode(c, rec.ci) ? CAPTURE : MISS
}

/**
 * Per-world key of a merge in board b (§4.8), and which source arrived (1 or 2, 0 for miss).
 *
 * @param {object} rec move record
 * @param {string} b board
 * @return {number} 0 miss, 1 from f1, 2 from f2 (the key is MOVE or CAPTURE by the target content)
 */
export function mergeSourceIn(rec, b) {
	if (b.charCodeAt(rec.f) === rec.letter) {
		return laneClear(b, rec.laneOcc) ? 1 : 0
	}
	if (b.charCodeAt(rec.f2) === rec.letter) {
		return laneClear(b, rec.laneOcc2) ? 2 : 0
	}
	return 0
}

/**
 * Build the outcome list and resolution of a standard move or merge from its key weights (§4.5).
 *
 * @param {object} a analysis
 * @param {object} rec record with weights set (wMiss, wMove, wCap) and inM
 */
function classify(a, rec) {
	const outcomes = []
	if (rec.wMiss > 0) {
		outcomes.push({ key: 'miss', weight: rec.wMiss })
	}
	if (rec.wMove > 0) {
		outcomes.push({ key: 'move', weight: rec.wMove })
	}
	if (rec.wCap > 0) {
		outcomes.push({ key: 'capture', weight: rec.wCap })
	}
	rec.outcomes = outcomes
	rec.happenWeight = rec.wMove + rec.wCap
	if (rec.inM) {
		rec.resolution = outcomes.length >= 2 ? 'rolled' : 'certain'
	} else if (rec.wMiss > 0) {
		// [miss, move]: quantum unless the unmeasured result would exceed the budget.
		if (budgetAfterQuantum(a, rec) > BUDGET) {
			rec.fallback = true
			rec.resolution = 'rolled'
		} else {
			rec.resolution = 'quantum'
		}
	} else {
		rec.resolution = 'certain'
	}
}

/**
 * B(mover) after the unmeasured result of a standard move or merge outside M (§4.5 budget fallback).
 *
 * @param {object} a analysis
 * @param {object} rec record
 * @return {number}
 */
function budgetAfterQuantum(a, rec) {
	const rc = restClasses(a, rec.X).cls
	const pos = positions(a, rec.X)
	const st = newStamp()
	let count = 0
	for (let i = 0; i < a.n; i++) {
		const b = a.boards[i]
		let moved
		if (rec.kind === 'merge') {
			moved = mergeSourceIn(rec, b) !== 0
		} else {
			moved = standardKeyIn(rec, b) !== MISS
		}
		const key = rc[i] * 64 + (moved ? rec.t : pos[i])
		if (MARK[key] !== st) {
			MARK[key] = st
			count++
		}
	}
	return count
}

/**
 * Evaluate a standard move of X from f to t (checks 9–15 of §4.11). X = occ(f) is of the side to move.
 *
 * @param {object} a analysis
 * @param {number} X piece id
 * @param {number} f from
 * @param {number} t to
 * @param {string|null} promo promotion letter or null
 * @return {object|string} record or reason
 */
export function evalStandard(a, X, f, t, promo) {
	const type = a.typeCodes[X]
	const ci = X < 16 ? 0 : 1
	if (type === TYPE_K && f === (ci === 0 ? 4 : 60) && (t === f + 2 || t === f - 2)) {
		return evalCastle(a, X, f, t, promo)
	}
	let pk = null
	if (type === TYPE_P) {
		pk = pawnKind(ci, f, t)
		if (pk === null) {
			return 'unreachable'
		}
	} else if (GEO[type * 4096 + f * 64 + t] !== 1) {
		return 'unreachable'
	}
	const needsPromo = type === TYPE_P && (t >> 3) === (ci === 0 ? 7 : 0)
	if (needsPromo && promo === null) {
		return 'promotion_required'
	}
	if (!needsPromo && promo !== null) {
		return 'promotion_invalid'
	}
	const laneOcc = laneOccupied(a, standardLane(type, f, t, pk))
	const letter = letterCodeOf(X)
	const isEp = pk === 'diagonal' && t === a.ep
	let wMiss = 0
	let wMove = 0
	let wCap = 0
	let anyClear = false
	if (laneOcc === false) {
		wMiss = T
	} else if (laneOcc === null && a.locs[X].length === 1) {
		// X certain on f and the lane certainly clear: the marginals decide.
		anyClear = true
		const z = a.occ[t]
		const wz = a.occW[t]
		if (pk === 'push' || pk === 'double') {
			wMove = T - wz
			wMiss = wz
		} else if (pk === 'diagonal') {
			if (isEp) {
				wCap = T
			} else if (z >= 0 && (z < 16) !== (ci === 0)) {
				wCap = wz
				wMiss = T - wz
			} else {
				wMiss = T
			}
		} else if (z < 0) {
			wMove = T
		} else if ((z < 16) !== (ci === 0)) {
			wCap = wz
			wMove = T - wz
		} else {
			wMiss = wz
			wMove = T - wz
		}
	} else {
		for (let i = 0; i < a.n; i++) {
			const b = a.boards[i]
			const w = a.weights[i]
			if (b.charCodeAt(f) !== letter || !laneClear(b, laneOcc)) {
				wMiss += w
				continue
			}
			anyClear = true
			const c = b.charCodeAt(t)
			if (pk === 'push' || pk === 'double') {
				if (c === 46) {
					wMove += w
				} else {
					wMiss += w
				}
			} else if (pk === 'diagonal') {
				if (isEp || isEnemyCode(c, ci)) {
					wCap += w
				} else {
					wMiss += w
				}
			} else if (c === 46) {
				wMove += w
			} else if (isEnemyCode(c, ci)) {
				wCap += w
			} else {
				wMiss += w
			}
		}
	}
	if (wMove + wCap === 0) {
		if (pk === 'diagonal') {
			return 'nothing_to_capture'
		}
		if (pk === 'push' || pk === 'double' || !anyClear) {
			return 'blocked'
		}
		return 'own_piece'
	}
	const occT = a.occ[t]
	const rec = new MoveRecord({
		kind: 'standard',
		X,
		ci,
		type,
		letter,
		f,
		t,
		f2: -1,
		t2: -1,
		promo,
		castle: null,
		pawn: pk,
		ep: isEp,
		laneOcc: laneOcc === false ? null : laneOcc,
		laneOcc2: null,
		inM: type === TYPE_P || type === TYPE_K || (occT >= 0 && occT !== X),
		wMiss,
		wMove,
		wCap,
		captureId: wCap > 0 ? (isEp ? a.occ[ci === 0 ? t - 8 : t + 8] : occT) : -1,
		fallback: false,
		resolution: null,
		outcomes: null,
		happenWeight: 0,
		from: [f],
		to: [t],
		sortKey: ((0 * 64 + f) * 64 + t) * 64 + (promo === null ? 0 : PROMO_INDEX[promo]),
		legal: null,
	})
	classify(a, rec)
	return rec
}

/**
 * Evaluate castling (§4.6, checks 9, 10, 12).
 *
 * @param {object} a analysis
 * @param {number} X king id
 * @param {number} f from (home)
 * @param {number} t to (home ± 2)
 * @param {string|null} promo promotion letter or null
 * @return {object|string} record or reason
 */
function evalCastle(a, X, f, t, promo) {
	const flag = t > f ? (X === 0 ? 'K' : 'k') : (X === 0 ? 'Q' : 'q')
	if (!a.state.castling.includes(flag)) {
		return 'castle_no_right'
	}
	const c = CASTLING[flag]
	for (let i = 0; i < c.empty.length; i++) {
		if (a.occ[c.empty[i]] >= 0) {
			return 'castle_blocked'
		}
	}
	if (promo !== null) {
		return 'promotion_invalid'
	}
	return new MoveRecord({
		kind: 'standard',
		X,
		ci: X < 16 ? 0 : 1,
		type: TYPE_K,
		letter: letterCodeOf(X),
		f,
		t,
		f2: -1,
		t2: -1,
		promo: null,
		castle: c,
		pawn: null,
		ep: false,
		laneOcc: null,
		laneOcc2: null,
		inM: false,
		wMiss: 0,
		wMove: T,
		wCap: 0,
		captureId: -1,
		fallback: false,
		resolution: 'certain',
		outcomes: [],
		happenWeight: T,
		from: [f],
		to: [t],
		sortKey: ((0 * 64 + f) * 64 + t) * 64,
		legal: null,
	})
}

/**
 * Per-(X, f) data shared by all splits of X from f.
 *
 * @param {object} a analysis
 * @param {number} X piece id
 * @param {number} f from
 * @return {object}
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
 * @param {object} a analysis
 * @param {object} ctx split context
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
 * @param {object} a analysis
 * @param {object} ctx split context
 * @param {number} t target
 * @return {Uint8Array}
 */
function splitFlags(a, ctx, t) {
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
 * @param {object} a analysis
 * @param {number} X piece id
 * @param {number} f from
 * @param {number} t1 lower target index
 * @param {number} t2 higher target index
 * @param {object} [context] split context from splitContext (optional)
 * @return {object|string} record or reason
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
		legal: null,
	})
}

/**
 * Evaluate a merge (M2–M4; checks 11, 20, 21). occ(f1) = occ(f2) = X, a q/r/b/n of the side to move.
 *
 * @param {object} a analysis
 * @param {number} X piece id
 * @param {number} f1 lower source
 * @param {number} f2 higher source
 * @param {number} t target
 * @return {object|string} record or reason
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
		legal: null,
	})
	classify(a, rec)
	return rec
}

/**
 * Evaluate a Measure of X (§4.9; check 8).
 *
 * @param {object} a analysis
 * @param {number} X piece id
 * @return {object|string} record or reason
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
		legal: null,
	})
}

/**
 * The canonical code of a record.
 *
 * @param {object} rec record
 * @return {string}
 */
export function recCode(rec) {
	switch (rec.kind) {
		case 'standard':
			return SQUARE_NAMES[rec.f] + '-' + SQUARE_NAMES[rec.t] + (rec.promo === null ? '' : '=' + rec.promo.toUpperCase())
		case 'split':
			return SQUARE_NAMES[rec.f] + '-' + SQUARE_NAMES[rec.t] + '|' + SQUARE_NAMES[rec.t2]
		case 'merge':
			return SQUARE_NAMES[rec.f] + '|' + SQUARE_NAMES[rec.f2] + '-' + SQUARE_NAMES[rec.t]
		default:
			return '?' + SQUARE_NAMES[rec.f]
	}
}

/**
 * The public LegalMove of a record (§4.10), built once.
 *
 * @param {object} rec record
 * @return {object}
 */
export function legalOf(rec) {
	if (rec.legal !== null) {
		return rec.legal
	}
	const m = { type: rec.kind, from: rec.from.slice(), to: rec.to.slice() }
	if (rec.promo !== null) {
		m.promo = rec.promo
	}
	m.code = recCode(rec)
	m.piece = rec.X
	m.resolution = rec.resolution
	m.measured = rec.resolution === 'rolled'
	m.fallback = rec.fallback
	m.capture = rec.wCap > 0
	m.happenWeight = rec.happenWeight
	m.outcomes = rec.outcomes.map((o) => ({ key: o.key, weight: o.weight }))
	m.successProbability = rec.happenWeight / T
	rec.legal = m
	rec.code = m.code
	return m
}

/**
 * Push the legal standard moves (including castling) of X from f.
 *
 * @param {object} a analysis
 * @param {number} X piece id
 * @param {number} f from square
 * @param {object[]} out records
 */
function genStandardFrom(a, X, f, out) {
	const type = a.typeCodes[X]
	const ci = X < 16 ? 0 : 1
	const own = (s) => a.occ[s] >= 0 && (a.occ[s] < 16) === (ci === 0)
	const tryMove = (t, promo) => {
		const r = evalStandard(a, X, f, t, promo)
		if (typeof r !== 'string') {
			out.push(r)
			return r
		}
		return null
	}
	if (type === TYPE_P) {
		const lastRank = ci === 0 ? 7 : 0
		const targets = []
		const push = PAWN_PUSH[ci][f]
		if (push >= 0) {
			targets.push(push)
		}
		const dbl = PAWN_DOUBLE[ci][f]
		if (dbl >= 0) {
			targets.push(dbl)
		}
		const caps = PAWN_CAPTURES[ci][f]
		for (let i = 0; i < caps.length; i++) {
			const t = caps[i]
			const z = a.occ[t]
			if (t === a.ep || (z >= 0 && (z < 16) !== (ci === 0))) {
				targets.push(t)
			}
		}
		for (const t of targets) {
			if ((t >> 3) === lastRank) {
				const r = tryMove(t, 'q')
				if (r !== null) {
					out.push(r.withPromo('r'), r.withPromo('b'), r.withPromo('n'))
				}
			} else {
				tryMove(t, null)
			}
		}
		return
	}
	if (type === TYPE_K || type === TYPE_N) {
		const targets = type === TYPE_K ? KING[f] : KNIGHT[f]
		for (let i = 0; i < targets.length; i++) {
			const t = targets[i]
			if (own(t) && a.occW[t] === T) {
				continue
			}
			tryMove(t, null)
		}
		if (type === TYPE_K && f === (ci === 0 ? 4 : 60) && a.state.castling !== '-') {
			tryMove(f + 2, null)
			tryMove(f - 2, null)
		}
		return
	}
	const dirs = SLIDE_DIRS[type]
	for (let d = 0; d < dirs.length; d++) {
		const ray = RAYS[f * 8 + dirs[d]]
		for (let i = 0; i < ray.length; i++) {
			const t = ray[i]
			const certain = a.occ[t] >= 0 && a.occ[t] !== X && a.occW[t] === T
			if (!(certain && own(t))) {
				tryMove(t, null)
			}
			if (certain) {
				break
			}
		}
	}
}

/**
 * Split targets of X from f worth trying: empty in every world and not behind a certain blocker.
 *
 * @param {object} a analysis
 * @param {number} X piece id
 * @param {number} f from square
 * @return {number[]} ascending
 */
function splitCandidates(a, X, f) {
	const type = a.typeCodes[X]
	const out = []
	if (type === TYPE_N) {
		const targets = KNIGHT[f]
		for (let i = 0; i < targets.length; i++) {
			if (a.occ[targets[i]] < 0) {
				out.push(targets[i])
			}
		}
		return out
	}
	const dirs = SLIDE_DIRS[type]
	for (let d = 0; d < dirs.length; d++) {
		const ray = RAYS[f * 8 + dirs[d]]
		for (let i = 0; i < ray.length; i++) {
			const t = ray[i]
			if (a.occ[t] < 0) {
				out.push(t)
			} else if (a.occW[t] === T) {
				break
			}
		}
	}
	return out.sort((x, y) => x - y)
}

/**
 * Push the legal splits of X from f.
 *
 * @param {object} a analysis
 * @param {number} X piece id
 * @param {number} f from square
 * @param {object[]} out records
 */
function genSplitsFrom(a, X, f, out) {
	const targets = splitCandidates(a, X, f)
	if (targets.length < 2) {
		return
	}
	const ctx = splitContext(a, X, f)
	// Targets that are never reachable cannot be part of a legal split (S4).
	const usable = targets.filter((t) => splitFlags(a, ctx, t).includes(1))
	for (let i = 0; i < usable.length; i++) {
		for (let j = i + 1; j < usable.length; j++) {
			const r = evalSplit(a, X, f, usable[i], usable[j], ctx)
			if (typeof r !== 'string') {
				out.push(r)
			}
		}
	}
}

/**
 * Push the legal merges of a superposed X.
 *
 * @param {object} a analysis
 * @param {number} X piece id
 * @param {object[]} out records
 */
function genMerges(a, X, out) {
	const loc = a.locs[X]
	const type = a.typeCodes[X]
	const ci = X < 16 ? 0 : 1
	for (let i = 0; i < loc.length; i++) {
		for (let j = i + 1; j < loc.length; j++) {
			const f1 = loc[i]
			const f2 = loc[j]
			const targets = TARGETS[type][f1]
			for (let k = 0; k < targets.length; k++) {
				const t = targets[k]
				if (t === f2 || GEO[type * 4096 + f2 * 64 + t] !== 1) {
					continue
				}
				const z = a.occ[t]
				if (z >= 0 && z !== X && (z < 16) === (ci === 0)) {
					continue
				}
				const r = evalMerge(a, X, f1, f2, t)
				if (typeof r !== 'string') {
					out.push(r)
				}
			}
		}
	}
}

/**
 * Is id a q/r/b/n?
 *
 * @param {object} a analysis
 * @param {number} id piece id
 * @return {boolean}
 */
function isQuantumType(a, id) {
	const ty = a.typeCodes[id]
	return ty === TYPE_Q || ty === TYPE_R || ty === TYPE_B || ty === TYPE_N
}

/**
 * All legal records of the side to move, in canonical order (§4.10). Cached in the analysis.
 *
 * @param {object} a analysis
 * @return {object[]}
 */
export function allRecords(a) {
	if (a.moves !== null) {
		return a.moves
	}
	const out = []
	if (a.state.result === null) {
		const base = a.ci * 16
		for (let X = base; X < base + 16; X++) {
			const loc = a.locs[X]
			if (loc.length === 0) {
				continue
			}
			const quantum = isQuantumType(a, X)
			for (let i = 0; i < loc.length; i++) {
				genStandardFrom(a, X, loc[i], out)
				if (quantum) {
					genSplitsFrom(a, X, loc[i], out)
				}
			}
			if (loc.length > 1) {
				genMerges(a, X, out)
				out.push(evalMeasure(a, X))
			}
		}
		out.sort((x, y) => x.sortKey - y.sortKey)
	}
	// Keep identity with records created earlier by findMove/whyIllegal on this state.
	const map = new Map()
	for (let i = 0; i < out.length; i++) {
		const code = recCode(out[i])
		const earlier = a.recs === null ? undefined : a.recs.get(code)
		if (earlier !== undefined) {
			out[i] = earlier
		}
		out[i].code = code
		map.set(code, out[i])
	}
	a.recs = map
	a.moves = out
	return out
}

/**
 * Visit legal records lazily in "escape first" order: king moves, other standard moves, merges, measures, splits.
 * Stops as soon as the visitor returns true. Used by hasAnyLegalMove and kingTrapped (which asks for captures right
 * after the king moves: taking the attacker is the other quick escape).
 *
 * @param {object} a analysis
 * @param {function(object): boolean} visit visitor
 * @param {boolean} [capturesFirst] visit king moves, then captures, before the other standard moves
 * @return {boolean} whether the visitor stopped the walk
 */
export function someRecord(a, visit, capturesFirst = false) {
	if (a.state.result !== null) {
		return false
	}
	if (a.moves !== null) {
		if (capturesFirst) {
			const king = a.ci * 16
			const pass = (want) => a.moves.some((r) => (r.X === king || r.wCap > 0) === want && visit(r))
			return pass(true) || pass(false)
		}
		for (let i = 0; i < a.moves.length; i++) {
			if (visit(a.moves[i])) {
				return true
			}
		}
		return false
	}
	const base = a.ci * 16
	const order = [base]
	for (let X = base + 1; X < base + 16; X++) {
		order.push(X)
	}
	const buf = []
	const drain = () => {
		for (let i = 0; i < buf.length; i++) {
			if (visit(buf[i])) {
				return true
			}
		}
		buf.length = 0
		return false
	}
	if (capturesFirst) {
		// King moves, then every capture (it may remove the attacker), then the other standard moves.
		for (const X of order) {
			for (const f of a.locs[X]) {
				genStandardFrom(a, X, f, buf)
			}
			if (X === base && drain()) {
				return true
			}
		}
		const rest = buf.filter((r) => r.wCap === 0)
		const caps = buf.filter((r) => r.wCap > 0)
		buf.length = 0
		buf.push(...caps, ...rest)
		if (drain()) {
			return true
		}
	} else {
		for (const X of order) {
			const loc = a.locs[X]
			for (let i = 0; i < loc.length; i++) {
				genStandardFrom(a, X, loc[i], buf)
				if (drain()) {
					return true
				}
			}
		}
	}
	for (const X of order) {
		if (a.locs[X].length > 1) {
			genMerges(a, X, buf)
			buf.push(evalMeasure(a, X))
			if (drain()) {
				return true
			}
		}
	}
	for (const X of order) {
		if (a.locs[X].length > 0 && isQuantumType(a, X)) {
			const loc = a.locs[X]
			for (let i = 0; i < loc.length; i++) {
				genSplitsFrom(a, X, loc[i], buf)
				if (drain()) {
					return true
				}
			}
		}
	}
	return false
}

/**
 * Normalise a move object (§4.11 check 2). Returns a clean move `{type, from, to, promo}` (promo null when absent)
 * or null when malformed. Split targets and merge sources are sorted by index.
 *
 * @param {unknown} input move object
 * @return {{type: string, from: number[], to: number[], promo: string|null}|null}
 */
export function normaliseMoveObject(input) {
	if (input === null || typeof input !== 'object' || Array.isArray(input)) {
		return null
	}
	const type = input.type
	const from = input.from
	const to = input.to
	const promoIn = input.promo
	let nf
	let nt
	switch (type) {
		case 'standard':
			nf = 1
			nt = 1
			break
		case 'split':
			nf = 1
			nt = 2
			break
		case 'merge':
			nf = 2
			nt = 1
			break
		case 'measure':
			nf = 1
			nt = 0
			break
		default:
			return null
	}
	if (!Array.isArray(from) || !Array.isArray(to) || from.length !== nf || to.length !== nt) {
		return null
	}
	const f = []
	const t = []
	for (let i = 0; i < nf; i++) {
		const s = from[i]
		if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 63) {
			return null
		}
		f.push(s)
	}
	for (let i = 0; i < nt; i++) {
		const s = to[i]
		if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 63) {
			return null
		}
		t.push(s)
	}
	let promo = null
	if (promoIn !== undefined && promoIn !== null) {
		if (type !== 'standard' || !PROMOS.includes(promoIn)) {
			return null
		}
		promo = promoIn
	}
	if (type === 'split') {
		if (t[0] === t[1]) {
			return null
		}
		t.sort((x, y) => x - y)
	}
	if (type === 'merge') {
		if (f[0] === f[1]) {
			return null
		}
		f.sort((x, y) => x - y)
	}
	return { type, from: f, to: t, promo }
}

/**
 * Resolve a move input against a state: the full §4.11 pipeline.
 *
 * Returns `{rec}` for a legal move (with the Measure `from` normalised) or `{reason}`.
 *
 * @param {object} a analysis
 * @param {unknown} input move object, LegalMove or code string
 * @return {{rec: object}|{reason: string}}
 */
export function resolveMove(a, input) {
	const state = a.state
	let obj = input
	let letter = null
	if (typeof input === 'string') {
		// An unparsable string is malformed before anything else; the parsed move then runs checks 1–21.
		const p = parseMoveCode(input)
		if (p === null) {
			return { reason: 'malformed' }
		}
		if (p.castle !== undefined) {
			const home = state.turn === 'w' ? 4 : 60
			obj = { type: 'standard', from: [home], to: [p.castle === 'O-O' ? home + 2 : home - 2] }
		} else {
			obj = { type: p.type, from: p.from, to: p.to, promo: p.promo }
			letter = p.letter === undefined ? null : p.letter
		}
	}
	if (state.result !== null) {
		return { reason: 'game_over' }
	}
	let mv
	try {
		mv = normaliseMoveObject(obj)
	} catch {
		mv = null
	}
	if (mv === null) {
		return { reason: 'malformed' }
	}
	const f0 = mv.from[0]
	const X = a.occ[f0]
	if (X < 0) {
		return { reason: 'no_piece' }
	}
	if ((X < 16) !== (a.ci === 0)) {
		return { reason: 'not_your_piece' }
	}
	if (letter !== null && LETTER_TYPE[letter] !== a.typeCodes[X]) {
		return { reason: 'piece_mismatch' }
	}
	const code = codeOfNormalised(a, mv, X)
	if (a.recs !== null) {
		const cached = a.recs.get(code)
		if (cached !== undefined) {
			return { rec: cached }
		}
	}
	const r = evaluate(a, mv, X)
	if (typeof r === 'string') {
		return { reason: r }
	}
	r.code = code
	if (a.recs === null) {
		a.recs = new Map()
	}
	a.recs.set(code, r)
	return { rec: r }
}

/**
 * Canonical code of a normalised move (Measure squares already mapped to min loc(X)).
 *
 * @param {object} a analysis
 * @param {{type: string, from: number[], to: number[], promo: string|null}} mv normalised move
 * @param {number} X piece on from[0]
 * @return {string}
 */
function codeOfNormalised(a, mv, X) {
	switch (mv.type) {
		case 'standard':
			return SQUARE_NAMES[mv.from[0]] + '-' + SQUARE_NAMES[mv.to[0]] + (mv.promo === null ? '' : '=' + mv.promo.toUpperCase())
		case 'split':
			return SQUARE_NAMES[mv.from[0]] + '-' + SQUARE_NAMES[mv.to[0]] + '|' + SQUARE_NAMES[mv.to[1]]
		case 'merge':
			return SQUARE_NAMES[mv.from[0]] + '|' + SQUARE_NAMES[mv.from[1]] + '-' + SQUARE_NAMES[mv.to[0]]
		default:
			return '?' + SQUARE_NAMES[a.locs[X][0]]
	}
}

/**
 * Checks 6 onwards for a normalised move whose piece passed checks 3–5.
 *
 * @param {object} a analysis
 * @param {{type: string, from: number[], to: number[], promo: string|null}} mv normalised move
 * @param {number} X piece id
 * @return {object|string} record or reason
 */
function evaluate(a, mv, X) {
	const type = a.typeCodes[X]
	switch (mv.type) {
		case 'merge': {
			if (a.occ[mv.from[1]] !== X) {
				return 'merge_mismatch'
			}
			if (type === TYPE_K || type === TYPE_P) {
				return 'cannot_merge'
			}
			return evalMerge(a, X, mv.from[0], mv.from[1], mv.to[0])
		}
		case 'split':
			if (type === TYPE_K || type === TYPE_P) {
				return 'cannot_split'
			}
			return evalSplit(a, X, mv.from[0], mv.to[0], mv.to[1])
		case 'measure':
			return evalMeasure(a, X)
		default:
			return evalStandard(a, X, mv.from[0], mv.to[0], mv.promo)
	}
}

/**
 * Convenience: analysis + resolveMove.
 *
 * @param {object} state valid engine state
 * @param {unknown} input move input
 * @return {{rec: object}|{reason: string}}
 */
export function resolve(state, input) {
	return resolveMove(analyse(state), input)
}
