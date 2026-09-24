/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Evaluation of standard moves and castling (§4.3–§4.6, checks 9–15 of §4.11), and the lane and counting helpers that
 * the quantum moves share. Every candidate move is evaluated by the same functions, whether it comes from the
 * generator, from `whyIllegal` or from `findMove`, so the three can never disagree.
 *
 * PHP twin: lib/Engine/Internal/MoveRules.php. Section numbers (§) refer to docs/engine-rules.md.
 */

import { positions, restClasses } from './analysis.js'
import { BUDGET, CASTLING, T } from './constants.js'
import { GEO, LANE, pawnKind, TYPE_B, TYPE_K, TYPE_P, TYPE_Q, TYPE_R } from './geometry.js'
import { CAPTURE, MISS, MOVE, MoveRecord, PROMO_INDEX } from './moveRecord.js'
import { letterCodeOf } from './squares.js'

/** @typedef {import('./analysis.js').Analysis} Analysis */

const NO_SQUARES = Object.freeze([])

/** Scratch marks for distinct-key counting (keys < 64 · 64). */
export const MARK = new Uint32Array(4096)
let stamp = 0

/**
 * Start a new distinct-key count.
 *
 * @return {number} the stamp to use
 */
export function newStamp() {
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
export function isEnemyCode(c, ci) {
	return ci === 0 ? (c >= 0x61 && c <= 0x70) : (c >= 0x41 && c <= 0x50)
}

/**
 * Lane squares that are possibly occupied, or `null` when the lane is certainly clear, or `false` when some lane
 * square is certainly occupied (blocked in every world).
 *
 * @param {Analysis} a analysis
 * @param {number[]} lane lane squares
 * @return {number[]|null|false}
 */
export function laneOccupied(a, lane) {
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
export function laneClear(b, laneOcc) {
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
export function standardLane(type, f, t, pk) {
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
 * @param {MoveRecord} rec move record
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
 * @param {MoveRecord} rec move record
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
 * @param {Analysis} a analysis
 * @param {MoveRecord} rec record with weights set (wMiss, wMove, wCap) and inM
 */
export function classify(a, rec) {
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
 * @param {Analysis} a analysis
 * @param {MoveRecord} rec record
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
 * @param {Analysis} a analysis
 * @param {number} X piece id
 * @param {number} f from
 * @param {number} t to
 * @param {string|null} promo promotion letter or null
 * @return {MoveRecord|string} record or reason
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
	})
	classify(a, rec)
	return rec
}

/**
 * Evaluate castling (§4.6, checks 9, 10, 12).
 *
 * @param {Analysis} a analysis
 * @param {number} X king id
 * @param {number} f from (home)
 * @param {number} t to (home ± 2)
 * @param {string|null} promo promotion letter or null
 * @return {MoveRecord|string} record or reason
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
	})
}
