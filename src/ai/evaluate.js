/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Static evaluation (GAME-DESIGN §6.1) on the marginals W(X@s): O(64 · worlds) to read the state, then O(pieces)
 * instead of one evaluation per possibility.
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
import { centreDistance, distance, KING, KNIGHT, PAWN_ATTACKS, RAYS } from './geometry.js'
import { LEAF_K, PIECE_VALUES } from './levels.js'

/** Weights of the evaluation terms (centipawns). Exported for tests and tuning. */
export const EVAL_WEIGHTS = Object.freeze({
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

const PAWN_PST = [
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	50,
	50,
	50,
	50,
	50,
	50,
	50,
	50,
	10,
	10,
	20,
	30,
	30,
	20,
	10,
	10,
	5,
	5,
	10,
	25,
	25,
	10,
	5,
	5,
	0,
	0,
	0,
	20,
	20,
	0,
	0,
	0,
	5,
	-5,
	-10,
	0,
	0,
	-10,
	-5,
	5,
	5,
	10,
	10,
	-20,
	-20,
	10,
	10,
	5,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
]
const KNIGHT_PST = [
	-50,
	-40,
	-30,
	-30,
	-30,
	-30,
	-40,
	-50,
	-40,
	-20,
	0,
	0,
	0,
	0,
	-20,
	-40,
	-30,
	0,
	10,
	15,
	15,
	10,
	0,
	-30,
	-30,
	5,
	15,
	20,
	20,
	15,
	5,
	-30,
	-30,
	0,
	15,
	20,
	20,
	15,
	0,
	-30,
	-30,
	5,
	10,
	15,
	15,
	10,
	5,
	-30,
	-40,
	-20,
	0,
	5,
	5,
	0,
	-20,
	-40,
	-50,
	-40,
	-30,
	-30,
	-30,
	-30,
	-40,
	-50,
]
const BISHOP_PST = [
	-20,
	-10,
	-10,
	-10,
	-10,
	-10,
	-10,
	-20,
	-10,
	0,
	0,
	0,
	0,
	0,
	0,
	-10,
	-10,
	0,
	5,
	10,
	10,
	5,
	0,
	-10,
	-10,
	5,
	5,
	10,
	10,
	5,
	5,
	-10,
	-10,
	0,
	10,
	10,
	10,
	10,
	0,
	-10,
	-10,
	10,
	10,
	10,
	10,
	10,
	10,
	-10,
	-10,
	5,
	0,
	0,
	0,
	0,
	5,
	-10,
	-20,
	-10,
	-10,
	-10,
	-10,
	-10,
	-10,
	-20,
]
const ROOK_PST = [
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	5,
	10,
	10,
	10,
	10,
	10,
	10,
	5,
	-5,
	0,
	0,
	0,
	0,
	0,
	0,
	-5,
	-5,
	0,
	0,
	0,
	0,
	0,
	0,
	-5,
	-5,
	0,
	0,
	0,
	0,
	0,
	0,
	-5,
	-5,
	0,
	0,
	0,
	0,
	0,
	0,
	-5,
	-5,
	0,
	0,
	0,
	0,
	0,
	0,
	-5,
	0,
	0,
	0,
	5,
	5,
	0,
	0,
	0,
]
const QUEEN_PST = [
	-20,
	-10,
	-10,
	-5,
	-5,
	-10,
	-10,
	-20,
	-10,
	0,
	0,
	0,
	0,
	0,
	0,
	-10,
	-10,
	0,
	5,
	5,
	5,
	5,
	0,
	-10,
	-5,
	0,
	5,
	5,
	5,
	5,
	0,
	-5,
	0,
	0,
	5,
	5,
	5,
	5,
	0,
	-5,
	-10,
	5,
	5,
	5,
	5,
	5,
	0,
	-10,
	-10,
	0,
	5,
	0,
	0,
	0,
	0,
	-10,
	-20,
	-10,
	-10,
	-5,
	-5,
	-10,
	-10,
	-20,
]
const KING_MG_PST = [
	-30,
	-40,
	-40,
	-50,
	-50,
	-40,
	-40,
	-30,
	-30,
	-40,
	-40,
	-50,
	-50,
	-40,
	-40,
	-30,
	-30,
	-40,
	-40,
	-50,
	-50,
	-40,
	-40,
	-30,
	-30,
	-40,
	-40,
	-50,
	-50,
	-40,
	-40,
	-30,
	-20,
	-30,
	-30,
	-40,
	-40,
	-30,
	-30,
	-20,
	-10,
	-20,
	-20,
	-20,
	-20,
	-20,
	-20,
	-10,
	20,
	20,
	0,
	0,
	0,
	0,
	20,
	20,
	20,
	30,
	10,
	0,
	0,
	10,
	30,
	20,
]
const KING_EG_PST = [
	-50,
	-40,
	-30,
	-20,
	-20,
	-30,
	-40,
	-50,
	-30,
	-20,
	-10,
	0,
	0,
	-10,
	-20,
	-30,
	-30,
	-10,
	20,
	30,
	30,
	20,
	-10,
	-30,
	-30,
	-10,
	30,
	40,
	40,
	30,
	-10,
	-30,
	-30,
	-10,
	30,
	40,
	40,
	30,
	-10,
	-30,
	-30,
	-10,
	20,
	30,
	30,
	20,
	-10,
	-30,
	-30,
	-30,
	0,
	0,
	0,
	0,
	-30,
	-30,
	-50,
	-30,
	-30,
	-30,
	-30,
	-30,
	-30,
	-50,
]

/**
 * Tables per colour, indexed by square (a1 = 0): the tables above are written rank 8 first.
 *
 * @param {number[]} table rank-8-first table
 * @return {Int16Array[]} [white, black]
 */
function sides(table) {
	const w = new Int16Array(64)
	const b = new Int16Array(64)
	for (let s = 0; s < 64; s++) {
		const f = s & 7
		const r = s >> 3
		w[s] = table[(7 - r) * 8 + f]
		b[s] = table[r * 8 + f]
	}
	return [w, b]
}

const PST = {
	p: sides(PAWN_PST),
	n: sides(KNIGHT_PST),
	b: sides(BISHOP_PST),
	r: sides(ROOK_PST),
	q: sides(QUEEN_PST),
}
const KING_MG = sides(KING_MG_PST)
const KING_EG = sides(KING_EG_PST)
const PASSED = [0, 5, 10, 20, 35, 60, 100, 0]

const FEATURES = new WeakMap()

/** Type letter → index: p 0, n 1, b 2, r 3, q 4, k 5. */
const TYPE_INDEX = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 }
const VALUE_OF = [100, 300, 300, 500, 900, 0]
const ATTACKER_VALUE_OF = [100, 300, 300, 500, 900, 2000]
const MOBILITY_OF = [0, 4, 4, 2, 1, 0]
const PHASE_OF = [0, 1, 1, 2, 4, 0]
const PST_OF = [PST.p, PST.n, PST.b, PST.r, PST.q]
const SCRATCH_WEIGHT = new Float64Array(64)
const SCRATCH_GAIN = new Float64Array(32)
const SCRATCH_FILES = new Int8Array(16)

/**
 * Offsets into `features().att`: attack probability of colour c at s is `att[c * 64 + s]`, the value of its cheapest
 * attacker with probability ≥ 0.2 is `att[CHEAP + c * 64 + s]`.
 */
export const CHEAP = 128

/**
 * Convert centipawns to an expected score: `1 / (1 + e^(−cp / k))` (GD §5.3.1).
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
 * Per-state marginals and attack maps, cached per state object (states are immutable).
 *
 * - `occ[s]`: the id that may stand on s, or −1; `p[s]`: its probability there; `ti[id]`: type index
 *   (p n b r q k = 0…5); `partsCount[id]`: number of squares of the piece (0 = captured); `kingSq[c]`.
 * - `att`: see `CHEAP`. Attack probabilities use an independence approximation over the squares of a lane.
 * - `mobility[c]` in centipawns; `threats`: `[w1, w2, b1, b2]`, the two largest expected capture gains of each
 *   colour (per victim piece, the best over its squares).
 *
 * @param {object} state engine state
 * @return {object}
 */
export function features(state) {
	let f = FEATURES.get(state)
	if (f !== undefined) {
		return f
	}
	const worlds = state.worlds
	const n = worlds.length
	const occ = new Int8Array(64).fill(-1)
	const p = new Float64Array(64)
	if (n === 1) {
		const b = worlds[0][0]
		for (let s = 0; s < 64; s++) {
			const c = b.charCodeAt(s)
			if (c !== 46) {
				occ[s] = c < 0x61 ? c - 0x41 : c - 0x61 + 16
				p[s] = 1
			}
		}
	} else {
		const weight = SCRATCH_WEIGHT
		weight.fill(0)
		for (let i = 0; i < n; i++) {
			const b = worlds[i][0]
			const w = worlds[i][1]
			for (let s = 0; s < 64; s++) {
				const c = b.charCodeAt(s)
				if (c !== 46) {
					weight[s] += w
					if (occ[s] < 0) {
						occ[s] = c < 0x61 ? c - 0x41 : c - 0x61 + 16
					}
				}
			}
		}
		for (let s = 0; s < 64; s++) {
			if (occ[s] >= 0) {
				p[s] = weight[s] / T
			}
		}
	}
	const types = state.types
	const ti = new Int8Array(32)
	for (let id = 0; id < 32; id++) {
		ti[id] = TYPE_INDEX[types[id]]
	}
	const partsCount = new Int8Array(32)
	const kingSq = [-1, -1]
	for (let s = 0; s < 64; s++) {
		const id = occ[s]
		if (id >= 0) {
			partsCount[id]++
			if (id === 0) {
				kingSq[0] = s
			} else if (id === 16) {
				kingSq[1] = s
			}
		}
	}
	f = { occ, p, ti, types, partsCount, kingSq, n, att: null, mobility: null, threats: null, base: undefined }
	attackMaps(f)
	FEATURES.set(state, f)
	return f
}

/**
 * Fill the attack maps, mobility and capture threats of a feature object.
 *
 * @param {object} f features
 */
function attackMaps(f) {
	const { occ, p, ti } = f
	const att = new Float64Array(256)
	att.fill(Infinity, CHEAP)
	let mob0 = 0
	let mob1 = 0
	for (let from = 0; from < 64; from++) {
		const id = occ[from]
		if (id < 0) {
			continue
		}
		const c = id < 16 ? 0 : 1
		const base = c * 64
		const type = ti[id]
		const pf = p[from]
		const val = ATTACKER_VALUE_OF[type]
		if (type === 0) {
			const list = PAWN_ATTACKS[c][from]
			for (let j = 0; j < list.length; j++) {
				const k = base + list[j]
				if (pf > att[k]) {
					att[k] = pf
				}
				if (pf >= 0.2 && val < att[CHEAP + k]) {
					att[CHEAP + k] = val
				}
			}
			continue
		}
		let mob = 0
		if (type === 1 || type === 5) {
			const list = type === 1 ? KNIGHT[from] : KING[from]
			for (let j = 0; j < list.length; j++) {
				const s = list[j]
				const k = base + s
				if (pf > att[k]) {
					att[k] = pf
				}
				if (pf >= 0.2 && val < att[CHEAP + k]) {
					att[CHEAP + k] = val
				}
				const o = occ[s]
				if (o < 0 || (o < 16 ? 0 : 1) !== c) {
					mob += pf
				}
			}
		} else {
			const d0 = type === 2 ? 4 : 0
			const d1 = type === 3 ? 4 : 8
			for (let d = d0; d < d1; d++) {
				const ray = RAYS[from * 8 + d]
				let clear = 1
				for (let j = 0; j < ray.length; j++) {
					const s = ray[j]
					const pa = pf * clear
					const k = base + s
					if (pa > att[k]) {
						att[k] = pa
					}
					if (pa >= 0.2 && val < att[CHEAP + k]) {
						att[CHEAP + k] = val
					}
					const o = occ[s]
					if (o < 0) {
						mob += pa
						continue
					}
					if ((o < 16 ? 0 : 1) !== c) {
						mob += pa
					}
					if (o !== id) {
						clear *= 1 - p[s]
						if (clear < 0.05) {
							break
						}
					}
				}
			}
		}
		if (c === 0) {
			mob0 += mob * MOBILITY_OF[type]
		} else {
			mob1 += mob * MOBILITY_OF[type]
		}
	}
	f.att = att
	f.mobility = [mob0, mob1]
	// Capture threats: for each piece part of the victim colour, the gain available to the attacker colour.
	const threats = [0, 0, 0, 0]
	for (let a = 0; a < 2; a++) {
		const gain = SCRATCH_GAIN
		gain.fill(0)
		const v = 1 - a
		for (let s = 0; s < 64; s++) {
			const id = occ[s]
			if (id < 0 || (id < 16 ? 0 : 1) !== v || ti[id] === 5) {
				continue
			}
			const pa = att[a * 64 + s]
			if (pa <= 0) {
				continue
			}
			const val = VALUE_OF[ti[id]]
			let cost = 0
			if (att[v * 64 + s] >= 0.5) {
				const ch = att[CHEAP + a * 64 + s]
				cost = ch === Infinity ? val : Math.min(ch, val)
			}
			const g = pa * p[s] * (val - cost)
			if (g > gain[id]) {
				gain[id] = g
			}
		}
		let g1 = 0
		let g2 = 0
		for (let id = 0; id < 32; id++) {
			const g = gain[id]
			if (g > g1) {
				g2 = g1
				g1 = g
			} else if (g > g2) {
				g2 = g
			}
		}
		threats[a * 2] = g1
		threats[a * 2 + 1] = g2
	}
	f.threats = threats
}

/**
 * Expected loss (centipawns) of each piece of a colour to a capture by the other side, from the attack map:
 * P(attack) × P(piece there) × (value − the cheapest attacker's value when the square is defended). Kings are 0
 * (their danger is `kingDanger`). Used by the candidate tags `saves:` and `hangs:` and the coach.
 *
 * @param {object} state engine state
 * @param {'w'|'b'} color the colour of the threatened pieces
 * @return {Float64Array} length 32, by piece id
 */
export function pieceThreats(state, color) {
	const f = features(state)
	const { occ, p, ti, att } = f
	const v = color === 'w' ? 0 : 1
	const a = 1 - v
	const out = new Float64Array(32)
	for (let s = 0; s < 64; s++) {
		const id = occ[s]
		if (id < 0 || (id < 16 ? 0 : 1) !== v || ti[id] === 5) {
			continue
		}
		const pa = att[a * 64 + s]
		if (pa <= 0) {
			continue
		}
		const val = VALUE_OF[ti[id]]
		let cost = 0
		if (att[v * 64 + s] >= 0.5) {
			const ch = att[CHEAP + a * 64 + s]
			cost = ch === Infinity ? val : Math.min(ch, val)
		}
		const g = pa * p[s] * (val - cost)
		if (g > out[id]) {
			out[id] = g
		}
	}
	return out
}

/**
 * Material of a colour in centipawns (PIECE_VALUES; kings count 0). Material is certain in this game: every live
 * piece stands somewhere in every possibility.
 *
 * @param {object} state engine state
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
 * @param {object} state engine state
 * @return {number}
 */
export function baseCp(state) {
	const f = features(state)
	if (f.base !== undefined) {
		return f.base
	}
	const { occ, p, ti, partsCount, att } = f
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
			v = PST_OF[t][c][s]
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
			if (isPassed(f, s, c)) {
				const rel = c === 0 ? s >> 3 : 7 - (s >> 3)
				structure += sign * PASSED[rel] * (0.5 + eg)
			}
		} else if (files[own + file] === 0) {
			structure += sign * p[s] * (files[(1 - c) * 8 + file] === 0 ? EVAL_WEIGHTS.rookOpen : EVAL_WEIGHTS.rookSemiOpen)
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
			const k = f.kingSq[c]
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
	if (f.kingSq[0] >= 0 && f.kingSq[1] >= 0) {
		if (nonPawn1 === 0 && pawns1 === 0 && mat0 >= 300) {
			mop += 10 * centreDistance(f.kingSq[1]) + 4 * (7 - distance(f.kingSq[0], f.kingSq[1]))
		}
		if (nonPawn0 === 0 && pawns0 === 0 && mat1 >= 300) {
			mop -= 10 * centreDistance(f.kingSq[0]) + 4 * (7 - distance(f.kingSq[0], f.kingSq[1]))
		}
	}
	// Quantum bookkeeping: own budget above 1 costs readability, a full enemy budget turns its quantum moves into rolls.
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
	const th = f.threats
	const m1 = th[mover * 2]
	const o1 = th[(1 - mover) * 2]
	const o2 = th[(1 - mover) * 2 + 1]
	const threats = msign * (EVAL_WEIGHTS.threatMover * m1 - EVAL_WEIGHTS.threatFirst * o1 - EVAL_WEIGHTS.threatSecond * o2)
	const mobility = f.mobility[0] - f.mobility[1]
	const tempo = msign * EVAL_WEIGHTS.tempo
	f.base = mat0 - mat1 + pst + structure + bonus + kings + mop + quantum + threats + mobility + tempo
	return f.base
}

/**
 * Is the pawn on s (colour c) passed? (No enemy pawn in front on its own or an adjacent file.)
 *
 * @param {object} f features
 * @param {number} s square
 * @param {number} c colour index
 * @return {boolean}
 */
function isPassed(f, s, c) {
	const file = s & 7
	const rank = s >> 3
	const step = c === 0 ? 1 : -1
	for (let df = -1; df <= 1; df++) {
		const x = file + df
		if (x < 0 || x > 7) {
			continue
		}
		for (let r = rank + step; r >= 0 && r < 8; r += step) {
			const id = f.occ[r * 8 + x]
			if (id >= 0 && f.ti[id] === 0 && (id < 16 ? 0 : 1) !== c) {
				return false
			}
		}
	}
	return true
}

/**
 * Static evaluation in centipawns from White's point of view (SPEC §4.1). Includes king exposure: the side not to
 * move pays `kingShot × kingDanger` (the mover could capture its king now), the mover a smaller amount.
 *
 * Params: `{ignoreKing: 'w'|'b'|null}` evaluates as if that side's king were never in danger (the "does not notice
 * danger to its own king" behaviour of the low levels).
 *
 * @param {object} state engine state (a game that is over evaluates to ±10000 or 0)
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
 * @param {object} state engine state (result null)
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
