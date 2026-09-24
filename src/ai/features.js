/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The per-state features of the static evaluation, cached per state object (states are immutable): the marginal
 * occupancy W(X@s) of every square, a probabilistic attack map of both colours, mobility and the capture threats.
 * Reading a state costs O(64 · worlds); every evaluation term after that costs O(pieces) instead of one evaluation
 * per possibility.
 */

import { T } from '../engine/index.js'
import { KING, KNIGHT, PAWN_ATTACKS, RAYS } from './geometry.js'
import { PIECE_VALUES } from './levels.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */

/**
 * @typedef {object} Features
 * @property {Int8Array} occ the id that may stand on each square, or −1
 * @property {Float64Array} p the probability that `occ[s]` stands on s
 * @property {Int8Array} ti type index per id (p n b r q k = 0…5)
 * @property {string} types the state's `types` string
 * @property {Int8Array} partsCount number of squares of each id (0: captured)
 * @property {number[]} kingSq square of each colour's king, or −1 ([White, Black])
 * @property {number} n number of worlds
 * @property {Float64Array} att attack map, see `CHEAP`
 * @property {number[]} mobility mobility of each colour in centipawns ([White, Black])
 * @property {number[]} threats the two largest expected capture gains of each colour: [w1, w2, b1, b2]
 * @property {number|undefined} base the static evaluation without king exposure, filled in by `evaluate.js`
 */

const FEATURES = new WeakMap()

/** Type letter → index: p 0, n 1, b 2, r 3, q 4, k 5. */
const TYPE_INDEX = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 }

/** Material value by type index (`PIECE_VALUES` in type-index order; the king counts 0). */
export const VALUE_OF = ['p', 'n', 'b', 'r', 'q', 'k'].map((type) => PIECE_VALUES[type])

/** Value of an attacker by type index: a king is the most expensive attacker (it may never be recaptured). */
const ATTACKER_VALUE_OF = [100, 300, 300, 500, 900, 2000]

/** Centipawns per reachable square by type index. */
const MOBILITY_OF = [0, 4, 4, 2, 1, 0]

const SCRATCH_WEIGHT = new Float64Array(64)
const SCRATCH_GAIN = new Float64Array(32)

/**
 * Offsets into `features().att`: attack probability of colour c at s is `att[c * 64 + s]`, the value of its cheapest
 * attacker with probability ≥ 0.2 is `att[CHEAP + c * 64 + s]`.
 */
export const CHEAP = 128

/**
 * Per-state marginals and attack maps, cached per state object (states are immutable).
 *
 * - `occ[s]`: the id that may stand on s, or −1; `p[s]`: its probability there; `ti[id]`: type index
 *   (p n b r q k = 0…5); `partsCount[id]`: number of squares of the piece (0 = captured); `kingSq[c]`.
 * - `att`: see `CHEAP`. Attack probabilities use an independence approximation over the squares of a lane.
 * - `mobility[c]` in centipawns; `threats`: `[w1, w2, b1, b2]`, the two largest expected capture gains of each
 *   colour (per victim piece, the best over its squares).
 *
 * @param {EngineState} state engine state
 * @return {Features}
 */
export function features(state) {
	let feat = FEATURES.get(state)
	if (feat !== undefined) {
		return feat
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
	feat = { occ, p, ti, types, partsCount, kingSq, n, att: null, mobility: null, threats: null, base: undefined }
	attackMaps(feat)
	FEATURES.set(state, feat)
	return feat
}

/**
 * Fill the attack maps, mobility and capture threats of a feature object.
 *
 * @param {Features} feat features
 */
function attackMaps(feat) {
	const { occ, p, ti } = feat
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
	feat.att = att
	feat.mobility = [mob0, mob1]
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
	feat.threats = threats
}

/**
 * Expected loss (centipawns) of each piece of a colour to a capture by the other side, from the attack map:
 * P(attack) × P(piece there) × (value − the cheapest attacker's value when the square is defended). Kings are 0
 * (their danger is `kingDanger`). Used by the candidate tags `saves:` and `hangs:` and the coach.
 *
 * @param {EngineState} state engine state
 * @param {'w'|'b'} color the colour of the threatened pieces
 * @return {Float64Array} length 32, by piece id
 */
export function pieceThreats(state, color) {
	const feat = features(state)
	const { occ, p, ti, att } = feat
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
