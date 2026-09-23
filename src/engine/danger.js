/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * King danger (ENGINE-RULES §8) and the trapped-king test (§6, E1b). Both are normative: the end checks use them.
 */

import { analyse } from './analysis.js'
import { MAX_PLY, T } from './constants.js'
import { KING, KNIGHT, PAWN_ATTACKERS, RAYS, TYPE_B, TYPE_K, TYPE_N, TYPE_P, TYPE_Q, TYPE_R } from './geometry.js'
import { someRecord } from './moves.js'
import { outcomeCaptures, recordKeys, recordOutcomeBoards } from './outcomes.js'
import { idOfCode } from './squares.js'

const ACC = new Float64Array(64)
const WHO = new Int8Array(64)
const TOP1 = new Float64Array(32)
const TOP2 = new Float64Array(32)

/**
 * The best single-move capture weight of colour ci's king by the other side, over raw worlds (§8 kingDanger).
 * The worlds need not be canonical or sum to T; the result is at most the sum of the weights.
 *
 * @param {string[]} boards boards
 * @param {number[]} weights weights
 * @param {number} n number of worlds
 * @param {Int8Array} typeCodes type code per id
 * @param {number} ci colour index of the threatened king
 * @return {number}
 */
export function dangerOf(boards, weights, n, typeCodes, ci) {
	const k = boards[0].indexOf(ci === 0 ? 'A' : 'a')
	if (k < 0) {
		return 0
	}
	const eci = 1 - ci
	const lo = eci === 0 ? 0x41 : 0x61
	const hi = lo + 15
	const touched = []
	const knights = KNIGHT[k]
	const kings = KING[k]
	const pawns = PAWN_ATTACKERS[eci][k]
	for (let i = 0; i < n; i++) {
		const b = boards[i]
		const w = weights[i]
		for (let j = 0; j < knights.length; j++) {
			const s = knights[j]
			const c = b.charCodeAt(s)
			if (c >= lo && c <= hi && typeCodes[idOfCode(c)] === TYPE_N) {
				if (ACC[s] === 0) {
					touched.push(s)
				}
				ACC[s] += w
				WHO[s] = idOfCode(c)
			}
		}
		for (let j = 0; j < kings.length; j++) {
			const s = kings[j]
			const c = b.charCodeAt(s)
			if (c >= lo && c <= hi && typeCodes[idOfCode(c)] === TYPE_K) {
				if (ACC[s] === 0) {
					touched.push(s)
				}
				ACC[s] += w
				WHO[s] = idOfCode(c)
			}
		}
		for (let j = 0; j < pawns.length; j++) {
			const s = pawns[j]
			const c = b.charCodeAt(s)
			if (c >= lo && c <= hi && typeCodes[idOfCode(c)] === TYPE_P) {
				if (ACC[s] === 0) {
					touched.push(s)
				}
				ACC[s] += w
				WHO[s] = idOfCode(c)
			}
		}
		for (let d = 0; d < 8; d++) {
			const ray = RAYS[k * 8 + d]
			for (let j = 0; j < ray.length; j++) {
				const s = ray[j]
				const c = b.charCodeAt(s)
				if (c === 46) {
					continue
				}
				if (c >= lo && c <= hi) {
					const id = idOfCode(c)
					const ty = typeCodes[id]
					if (ty === TYPE_Q || (d < 4 ? ty === TYPE_R : ty === TYPE_B)) {
						if (ACC[s] === 0) {
							touched.push(s)
						}
						ACC[s] += w
						WHO[s] = id
					}
				}
				break
			}
		}
	}
	let best = 0
	if (touched.length > 0) {
		for (let j = 0; j < touched.length; j++) {
			const id = WHO[touched[j]]
			TOP1[id] = 0
			TOP2[id] = 0
		}
		for (let j = 0; j < touched.length; j++) {
			const s = touched[j]
			const id = WHO[s]
			const v = ACC[s]
			if (v > TOP1[id]) {
				TOP2[id] = TOP1[id]
				TOP1[id] = v
			} else if (v > TOP2[id]) {
				TOP2[id] = v
			}
		}
		for (let j = 0; j < touched.length; j++) {
			const id = WHO[touched[j]]
			const ty = typeCodes[id]
			// Converging capture: two parts of a q/r/b/n that both reach the king (§8). Their worlds are disjoint.
			const v = TOP1[id] + (ty === TYPE_Q || ty === TYPE_R || ty === TYPE_B || ty === TYPE_N ? TOP2[id] : 0)
			if (v > best) {
				best = v
			}
		}
		for (let j = 0; j < touched.length; j++) {
			ACC[touched[j]] = 0
		}
	}
	return best
}

/**
 * kingDanger(s, c) (§8): the weight (0..T) with which the opponent could capture c's king with its best single
 * move (standard or converging capture), if it were the opponent's turn. `kingDanger = T` is "certain danger".
 *
 * @param {object} state valid engine state
 * @param {'w'|'b'} color the king's colour
 * @return {number} integer weight
 */
export function kingDanger(state, color) {
	return dangerA(analyse(state), color === 'w' ? 0 : 1)
}

/**
 * kingDanger on an analysis, cached.
 *
 * @param {object} a analysis
 * @param {number} ci colour index of the king
 * @return {number}
 */
export function dangerA(a, ci) {
	let d = a.danger[ci]
	if (d < 0) {
		d = dangerOf(a.boards, a.weights, a.n, a.typeCodes, ci)
		a.danger[ci] = d
	}
	return d
}

/**
 * Does the (legal) record, in any of its outcomes, avoid leaving the mover's king certainly capturable
 * (or end the game at once by capturing the enemy king)? Used by E1b.
 *
 * @param {object} a analysis of the position to move in
 * @param {object} rec legal record
 * @return {boolean}
 */
function escapes(a, rec) {
	const ci = a.ci
	const enemyKing = ci === 0 ? 16 : 0
	const keys = recordKeys(rec)
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i]
		if (rec.captureId === enemyKing && outcomeCaptures(rec, key)) {
			return true
		}
		const o = recordOutcomeBoards(a, rec, key)
		if (dangerOf(o.boards, o.weights, o.boards.length, a.typeCodes, ci) < o.total) {
			return true
		}
	}
	return false
}

/**
 * E1b details for a state (§6): `{trapped, anyLegal}`. Cached on the analysis.
 *
 * The normative definition applies every outcome of every legal move with the normal pipeline minus E1b and asks
 * whether the game goes on with the mover's king certainly capturable. When that king is certainly capturable, the
 * side to move there has a certain king capture, so E2–E4 are suspended (D18) and E6 cannot fire; only E1 (the
 * reply captured the enemy king) or E5 (ply limit) could end the game. The test below is therefore exactly:
 * no reply reaches the ply limit, captures the enemy king, or leaves kingDanger below T.
 *
 * @param {object} a analysis
 * @return {{trapped: boolean, anyLegal: boolean}}
 */
export function trappedInfo(a) {
	if (a.trapped !== null) {
		return a.trapped
	}
	let info
	if (a.state.result !== null) {
		info = { trapped: false, anyLegal: false }
	} else if (a.state.ply + 1 >= MAX_PLY) {
		// Every reply ends the game by E5, which is an escape.
		info = { trapped: false, anyLegal: someRecord(a, () => true) }
	} else {
		let anyLegal = false
		const escaped = someRecord(a, (rec) => {
			anyLegal = true
			return escapes(a, rec)
		}, true)
		info = { trapped: anyLegal && !escaped, anyLegal }
	}
	a.trapped = info
	return info
}

/**
 * kingTrapped(s) (§6, E1b): the side to move has at least one legal move, and every outcome of every legal move
 * leaves the game running with its own king certainly capturable.
 *
 * @param {object} state valid engine state
 * @return {boolean}
 */
export function kingTrapped(state) {
	const a = analyse(state)
	if (state.result !== null) {
		return false
	}
	return trappedInfo(a).trapped
}

/**
 * Is T the king danger of colour ci in these worlds? (Helper for tests and views.)
 *
 * @param {object} state valid engine state
 * @param {'w'|'b'} color the king's colour
 * @return {boolean}
 */
export function certainDanger(state, color) {
	return kingDanger(state, color) === T
}
