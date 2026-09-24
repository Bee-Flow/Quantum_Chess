/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Static evaluation of the computer player, computed on the per-state features (`features.js`): O(64 · worlds) to
 * read the state, then O(pieces) instead of one evaluation per possibility.
 *
 * Terms: material (certain: every live piece stands somewhere in every possibility), piece-square tables weighted by
 * the marginals, king exposure (a heavy penalty × `kingDanger`, because there is no check), hanging material
 * (P(capture) × value from a probabilistic attack map), mobility, light pawn structure, rooks on open files, the
 * bishop pair, a mop-up term for bare kings, a small penalty per unit of own budget above 1 and a small bonus when the
 * opponent's budget is full.
 *
 * Centipawns are White's point of view; the search works in E-space (`toE`), White's or the side to move's expected
 * score.
 */

import { budget, kingDanger, kingTrapped, T } from '../engine/index.js'
import { features, VALUE_OF } from './features.js'
import { centerDistance, distance, KING } from './geometry.js'
import { LEAF_K, PIECE_VALUES } from './levels.js'
import { KING_EG, KING_MG, PASSED, PST } from './pieceSquareTables.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */

/** @typedef {import('./features.js').Features} Features */

/** Weights of the evaluation terms (centipawns). */
const EVAL_WEIGHTS = Object.freeze({
	kingShot: 1200, // non-mover's king exposure: the mover may capture it now
	ownKingDanger: 70, // mover's own king exposure (it can still react)
	certainDanger: 140, // mover's own king certainly capturable but not trapped: forced to react
	kingZone: 8, // enemy attack weight on the squares around the king
	shield: 10, // pawn in front of a castled king
	threatMover: 0.3, // share of the mover's best capture gain
	threatFirst: 0.1, // share of the opponent's best capture gain against the mover
	threatSecond: 0.5, // … and of its second-best (only one piece can be saved per move)
	tempo: 10,
	doubled: 12,
	isolated: 10,
	rookOpen: 15,
	rookSemiOpen: 8,
	bishopPair: 30,
	budgetUnit: 6, // per unit of own budget above 1
	budgetFullBonus: 20, // when the opponent's budget is full
})

/** Game phase weight by type index: the phase runs from 24 (all minor and major pieces) down to 0 (endgame). */
const PHASE_OF = [0, 1, 1, 2, 4, 0]
const SCRATCH_FILES = new Int8Array(16)

/**
 * Convert centipawns to an expected score: `1 / (1 + e^(−cp / k))`.
 *
 * @param {number} cp centipawns (any point of view)
 * @param {number} [k] scale, default LEAF_K
 * @return {number} expected score in (0, 1) for the same point of view
 */
export function toE(cp, k = LEAF_K) {
	return 1 / (1 + Math.exp(-cp / k))
}

/**
 * Inverse of toE: centipawns for an expected score (clamped to ±10000).
 *
 * @param {number} e expected score
 * @param {number} [k] scale
 * @return {number}
 */
export function toCp(e, k = LEAF_K) {
	if (e <= 0) {
		return -10000
	}
	if (e >= 1) {
		return 10000
	}
	return Math.max(-10000, Math.min(10000, -k * Math.log(1 / e - 1)))
}

/**
 * Material of a colour in centipawns (PIECE_VALUES; kings count 0). Material is certain in this game: every live
 * piece stands somewhere in every possibility.
 *
 * @param {EngineState} state engine state
 * @param {'w'|'b'} color colour
 * @return {number}
 */
export function materialOf(state, color) {
	const base = color === 'w' ? 0 : 16
	let sum = 0
	for (let id = base; id < base + 16; id++) {
		if (!state.captured.includes(id)) {
			sum += PIECE_VALUES[state.types[id]]
		}
	}
	return sum
}

/**
 * Everything except the king-exposure terms, in centipawns from White's point of view. Cached on the features.
 *
 * @param {EngineState} state engine state
 * @return {number}
 */
function baseCp(state) {
	const feat = features(state)
	if (feat.base !== undefined) {
		return feat.base
	}
	const { occ, p, ti, partsCount, att } = feat
	let phase = 0
	let mat0 = 0
	let mat1 = 0
	let bishops0 = 0
	let bishops1 = 0
	let nonPawn0 = 0
	let nonPawn1 = 0
	let pawns0 = 0
	let pawns1 = 0
	let superposed0 = false
	let superposed1 = false
	for (let id = 0; id < 32; id++) {
		const parts = partsCount[id]
		if (parts === 0) {
			continue
		}
		const t = ti[id]
		phase += PHASE_OF[t]
		if (id < 16) {
			mat0 += VALUE_OF[t]
			bishops0 += t === 2 ? 1 : 0
			nonPawn0 += t >= 1 && t <= 4 ? 1 : 0
			pawns0 += t === 0 ? 1 : 0
			superposed0 = superposed0 || parts > 1
		} else {
			mat1 += VALUE_OF[t]
			bishops1 += t === 2 ? 1 : 0
			nonPawn1 += t >= 1 && t <= 4 ? 1 : 0
			pawns1 += t === 0 ? 1 : 0
			superposed1 = superposed1 || parts > 1
		}
	}
	const eg = 1 - Math.min(24, phase) / 24
	const files = SCRATCH_FILES
	files.fill(0)
	let pst = 0
	for (let s = 0; s < 64; s++) {
		const id = occ[s]
		if (id < 0) {
			continue
		}
		const c = id < 16 ? 0 : 1
		const t = ti[id]
		let v
		if (t === 5) {
			v = KING_MG[c][s] * (1 - eg) + KING_EG[c][s] * eg
		} else {
			v = PST[t][c][s]
			if (t === 0) {
				files[c * 8 + (s & 7)]++
			}
		}
		pst += (c === 0 ? p[s] : -p[s]) * v
	}
	// Pawn structure (pawns are classical: p[s] = 1) and rooks on open files.
	let structure = 0
	for (let s = 0; s < 64; s++) {
		const id = occ[s]
		if (id < 0) {
			continue
		}
		const t = ti[id]
		if (t !== 0 && t !== 3) {
			continue
		}
		const c = id < 16 ? 0 : 1
		const sign = c === 0 ? 1 : -1
		const file = s & 7
		const own = c * 8
		if (t === 0) {
			const count = files[own + file]
			if (count > 1) {
				structure -= sign * EVAL_WEIGHTS.doubled / count
			}
			if ((file === 0 || files[own + file - 1] === 0) && (file === 7 || files[own + file + 1] === 0)) {
				structure -= sign * EVAL_WEIGHTS.isolated
			}
			if (isPassed(feat, s, c)) {
				const rel = c === 0 ? s >> 3 : 7 - (s >> 3)
				structure += sign * PASSED[rel] * (0.5 + eg)
			}
		} else if (files[own + file] === 0) {
			structure += sign * p[s]
				* (files[(1 - c) * 8 + file] === 0 ? EVAL_WEIGHTS.rookOpen : EVAL_WEIGHTS.rookSemiOpen)
		}
	}
	let bonus = 0
	if (bishops0 >= 2) {
		bonus += EVAL_WEIGHTS.bishopPair
	}
	if (bishops1 >= 2) {
		bonus -= EVAL_WEIGHTS.bishopPair
	}
	// King shelter (middlegame) and enemy pressure around the king.
	let kings = 0
	if (eg < 1) {
		for (let c = 0; c < 2; c++) {
			const k = feat.kingSq[c]
			if (k < 0) {
				continue
			}
			const sign = c === 0 ? 1 : -1
			let zone = 0
			const around = KING[k]
			const enemy = (1 - c) * 64
			for (let j = 0; j < around.length; j++) {
				zone += att[enemy + around[j]]
			}
			kings -= sign * zone * EVAL_WEIGHTS.kingZone * (1 - eg)
			if (c === 0 ? k >> 3 === 0 : k >> 3 === 7) {
				const fwd = c === 0 ? 8 : -8
				for (let df = -1; df <= 1; df++) {
					const file = (k & 7) + df
					if (file < 0 || file > 7) {
						continue
					}
					const id = occ[k + fwd + df]
					if (id >= 0 && ti[id] === 0 && (id < 16 ? 0 : 1) === c) {
						kings += sign * EVAL_WEIGHTS.shield * (1 - eg)
					}
				}
			}
		}
	}
	// Mop-up: a bare king is driven to the edge and approached.
	let mop = 0
	if (feat.kingSq[0] >= 0 && feat.kingSq[1] >= 0) {
		if (nonPawn1 === 0 && pawns1 === 0 && mat0 >= 300) {
			mop += 10 * centerDistance(feat.kingSq[1]) + 4 * (7 - distance(feat.kingSq[0], feat.kingSq[1]))
		}
		if (nonPawn0 === 0 && pawns0 === 0 && mat1 >= 300) {
			mop -= 10 * centerDistance(feat.kingSq[0]) + 4 * (7 - distance(feat.kingSq[0], feat.kingSq[1]))
		}
	}
	// Quantum bookkeeping: own budget above 1 costs readability; a full enemy budget turns its quantum moves into
	// rolls.
	const b0 = superposed0 ? budget(state, 'w') : 1
	const b1 = superposed1 ? budget(state, 'b') : 1
	let quantum = (b1 - b0) * EVAL_WEIGHTS.budgetUnit
	if (b1 >= 8) {
		quantum += EVAL_WEIGHTS.budgetFullBonus
	}
	if (b0 >= 8) {
		quantum -= EVAL_WEIGHTS.budgetFullBonus
	}
	// Threats: the mover realises part of its best capture; the other side's two best threats weigh on the mover.
	const mover = state.turn === 'w' ? 0 : 1
	const msign = mover === 0 ? 1 : -1
	const th = feat.threats
	const m1 = th[mover * 2]
	const o1 = th[(1 - mover) * 2]
	const o2 = th[(1 - mover) * 2 + 1]
	const threats = msign
		* (EVAL_WEIGHTS.threatMover * m1 - EVAL_WEIGHTS.threatFirst * o1 - EVAL_WEIGHTS.threatSecond * o2)
	const mobility = feat.mobility[0] - feat.mobility[1]
	const tempo = msign * EVAL_WEIGHTS.tempo
	feat.base = mat0 - mat1 + pst + structure + bonus + kings + mop + quantum + threats + mobility + tempo
	return feat.base
}

/**
 * Is the pawn on s (colour c) passed? (No enemy pawn in front on its own or an adjacent file.)
 *
 * @param {Features} feat features
 * @param {number} s square
 * @param {number} c colour index
 * @return {boolean}
 */
function isPassed(feat, s, c) {
	const file = s & 7
	const rank = s >> 3
	const step = c === 0 ? 1 : -1
	for (let df = -1; df <= 1; df++) {
		const x = file + df
		if (x < 0 || x > 7) {
			continue
		}
		for (let r = rank + step; r >= 0 && r < 8; r += step) {
			const id = feat.occ[r * 8 + x]
			if (id >= 0 && feat.ti[id] === 0 && (id < 16 ? 0 : 1) !== c) {
				return false
			}
		}
	}
	return true
}

/**
 * Static evaluation in centipawns from White's point of view. Includes king exposure: the side not to
 * move pays `kingShot × kingDanger` (the mover could capture its king now), the mover a smaller amount.
 *
 * Params: `{ignoreKing: 'w'|'b'|null}` evaluates as if that side's king were never in danger (the "does not notice
 * danger to its own king" behaviour of the low levels).
 *
 * @param {EngineState} state engine state (a game that is over evaluates to ±10000 or 0)
 * @param {object} [params] options
 * @return {number}
 */
export function evaluate(state, params = {}) {
	if (state.result !== null) {
		return state.result.result === '1-0' ? 10000 : state.result.result === '0-1' ? -10000 : 0
	}
	let cp = baseCp(state)
	const ignore = params && params.ignoreKing ? params.ignoreKing : null
	const mover = state.turn
	const other = mover === 'w' ? 'b' : 'w'
	const msign = mover === 'w' ? 1 : -1
	const shot = ignore === other ? 0 : kingDanger(state, other) / T
	const own = ignore === mover ? 0 : kingDanger(state, mover) / T
	cp += msign * (shot * EVAL_WEIGHTS.kingShot - own * EVAL_WEIGHTS.ownKingDanger)
	return cp
}

/**
 * Static expected score **for the side to move** (the search's leaf value).
 *
 * - A certain king capture by the mover is worth 1.
 * - A king shot with probability p is worth `p + (1 − p) · E(rest)`: the shot is taken, and a miss costs a tempo.
 * - A mover whose own king is certainly capturable is lost (0) when it is trapped (E1b), and pays a penalty
 *   otherwise.
 *
 * @param {EngineState} state engine state (result null)
 * @param {number} ignoreKing colour index (0 White, 1 Black) whose king danger is ignored, or −1
 * @return {number} in [0, 1]
 */
export function staticE(state, ignoreKing = -1) {
	const mover = state.turn === 'w' ? 0 : 1
	const shotW = ignoreKing === 1 - mover ? 0 : kingDanger(state, mover === 0 ? 'b' : 'w')
	if (shotW >= T) {
		return 1
	}
	const ownW = ignoreKing === mover ? 0 : kingDanger(state, state.turn)
	let cp = baseCp(state)
	if (mover === 1) {
		cp = -cp
	}
	if (ownW >= T) {
		if (kingTrapped(state)) {
			return 0
		}
		cp -= EVAL_WEIGHTS.certainDanger
	} else {
		cp -= (ownW / T) * EVAL_WEIGHTS.ownKingDanger
	}
	const shot = shotW / T
	return shot + (1 - shot) * toE(cp)
}
