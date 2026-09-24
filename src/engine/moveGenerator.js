/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Generation of the legal move list (§4.10): every legal record of the side to move in canonical order, and a lazy
 * walk in "escape first" order for the questions that stop at the first answer (any legal move, E1b).
 *
 * PHP twin: lib/Engine/Internal/MoveGenerator.php. Section numbers (§) refer to docs/engine-rules.md.
 */

import { T } from './constants.js'
import {
	GEO,
	KING,
	KNIGHT,
	PAWN_CAPTURES,
	PAWN_DOUBLE,
	PAWN_PUSH,
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
import { recCode } from './moveRecord.js'
import { evalStandard } from './moveRules.js'
import { evalMeasure, evalMerge, evalSplit, splitContext, splitFlags } from './quantumMoves.js'

/** @typedef {import('./analysis.js').Analysis} Analysis */
/** @typedef {import('./moveRecord.js').MoveRecord} MoveRecord */

/**
 * Push the legal standard moves (including castling) of X from f.
 *
 * @param {Analysis} a analysis
 * @param {number} X piece id
 * @param {number} f from square
 * @param {MoveRecord[]} out records
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
 * @param {Analysis} a analysis
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
 * @param {Analysis} a analysis
 * @param {number} X piece id
 * @param {number} f from square
 * @param {MoveRecord[]} out records
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
 * @param {Analysis} a analysis
 * @param {number} X piece id
 * @param {MoveRecord[]} out records
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
 * @param {Analysis} a analysis
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
 * @param {Analysis} a analysis
 * @return {MoveRecord[]}
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
 * @param {Analysis} a analysis
 * @param {(rec: MoveRecord) => boolean} visit visitor
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
