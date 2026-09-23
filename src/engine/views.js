/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Derived views (ENGINE-RULES §8). They are defined identically in both engines; the UI, the coach, the AI and
 * describeForLlm use them.
 */

import { analyse, positions, superposedIds } from './analysis.js'
import { LINK_THRESHOLD, T } from './constants.js'
import { dangerA, dangerOf } from './danger.js'
import { IllegalMoveError } from './errors.js'
import { DIR_OF, TYPE_CHAR, TYPE_K } from './geometry.js'
import { resolveMove } from './moves.js'
import { canonicalWorlds, outcomeCaptures, recordKeys, recordOutcomeBoards } from './outcomes.js'
import { rescaleWeights } from './rescale.js'
import { colorOf, letterCodeOf } from './squares.js'

/**
 * Display percentage of a weight (§8): 0 only for W = 0, 100 only for W = T, otherwise 1..99 (round half up).
 * Accepts non-integer weights (for risk values on the T scale).
 *
 * @param {number} W weight 0..T
 * @return {number}
 */
export function pct(W) {
	if (W <= 0) {
		return 0
	}
	if (W >= T) {
		return 100
	}
	return Math.min(99, Math.max(1, Math.floor((200 * W + T) / (2 * T))))
}

/**
 * For each square: null if no world has a piece there, otherwise `{piece, type, color, weight, probability}`.
 *
 * @param {object} state valid engine state
 * @return {Array<null|{piece: number, type: string, color: string, weight: number, probability: number}>}
 */
export function squareView(state) {
	const a = analyse(state)
	const out = new Array(64)
	for (let s = 0; s < 64; s++) {
		const id = a.occ[s]
		if (id < 0) {
			out[s] = null
		} else {
			const weight = a.occW[s]
			out[s] = { piece: id, type: TYPE_CHAR[a.typeCodes[id]], color: colorOf(id), weight, probability: weight / T }
		}
	}
	return out
}

/**
 * For each id 0..31: its locations `[{square, weight, probability}]` in ascending square order (empty for captured
 * ids).
 *
 * @param {object} state valid engine state
 * @return {Array<Array<{square: number, weight: number, probability: number}>>}
 */
export function pieceLocations(state) {
	const a = analyse(state)
	const out = new Array(32)
	for (let id = 0; id < 32; id++) {
		out[id] = a.locs[id].map((s, j) => ({ square: s, weight: a.locW[id][j], probability: a.locW[id][j] / T }))
	}
	return out
}

/**
 * What-if view (§8): given X = occ(sq), for each square the piece standing there in the worlds with X on sq, with
 * its conditional probability. Returns null when sq is empty in every world.
 *
 * @param {object} state valid engine state
 * @param {number} sq square index
 * @return {Array<null|{piece: number, weight: number, probability: number}>|null}
 */
export function conditionalView(state, sq) {
	const a = analyse(state)
	const X = a.occ[sq]
	if (X < 0) {
		return null
	}
	const code = letterCodeOf(X)
	const acc = new Float64Array(64)
	let W0 = 0
	for (let i = 0; i < a.n; i++) {
		const b = a.boards[i]
		if (b.charCodeAt(sq) !== code) {
			continue
		}
		const w = a.weights[i]
		W0 += w
		for (let s = 0; s < 64; s++) {
			if (b.charCodeAt(s) !== 46) {
				acc[s] += w
			}
		}
	}
	const out = new Array(64)
	for (let s = 0; s < 64; s++) {
		out[s] = acc[s] === 0 ? null : { piece: a.occ[s], weight: acc[s], probability: acc[s] / W0 }
	}
	return out
}

/**
 * Linked pieces (§8): pairs [X, Y] (X < Y) of live superposed pieces whose joint location distribution differs from
 * independence by at least 2^-12 somewhere: |T·W(X@a ∧ Y@b) − W(X@a)·W(Y@b)| ≥ 2^36.
 *
 * @param {object} state valid engine state
 * @return {Array<[number, number]>}
 */
export function links(state) {
	const a = analyse(state)
	const ids = superposedIds(a, 0).concat(superposedIds(a, 1))
	const out = []
	const joint = new Float64Array(4096)
	for (let x = 0; x < ids.length; x++) {
		const X = ids[x]
		const px = positions(a, X)
		for (let y = x + 1; y < ids.length; y++) {
			const Y = ids[y]
			const py = positions(a, Y)
			joint.fill(0)
			for (let i = 0; i < a.n; i++) {
				joint[px[i] * 64 + py[i]] += a.weights[i]
			}
			if (linked(a, X, Y, joint)) {
				out.push([X, Y])
			}
		}
	}
	return out
}

/**
 * The link test for one pair.
 *
 * @param {object} a analysis
 * @param {number} X first id
 * @param {number} Y second id
 * @param {Float64Array} joint joint weights indexed [a * 64 + b]
 * @return {boolean}
 */
function linked(a, X, Y, joint) {
	const lx = a.locs[X]
	const ly = a.locs[Y]
	for (let i = 0; i < lx.length; i++) {
		const wx = a.locW[X][i]
		for (let j = 0; j < ly.length; j++) {
			const wy = a.locW[Y][j]
			if (Math.abs(T * joint[lx[i] * 64 + ly[j]] - wx * wy) >= LINK_THRESHOLD) {
				return true
			}
		}
	}
	return false
}

/**
 * Connected components of links(): arrays of ids (ascending), ordered by their smallest id.
 *
 * @param {object} state valid engine state
 * @return {number[][]}
 */
export function linkGroups(state) {
	const parent = Array.from({ length: 32 }, (_, i) => i)
	const find = (x) => {
		while (parent[x] !== x) {
			parent[x] = parent[parent[x]]
			x = parent[x]
		}
		return x
	}
	const members = new Set()
	for (const [x, y] of links(state)) {
		members.add(x)
		members.add(y)
		const rx = find(x)
		const ry = find(y)
		if (rx !== ry) {
			parent[Math.max(rx, ry)] = Math.min(rx, ry)
		}
	}
	const groups = new Map()
	for (const id of [...members].sort((p, q) => p - q)) {
		const r = find(id)
		if (!groups.has(r)) {
			groups.set(r, [])
		}
		groups.get(r).push(id)
	}
	return [...groups.values()].sort((p, q) => p[0] - q[0])
}

/**
 * moveRisk(s, m) (§8): Σ over the outcomes of P(o) · (0 if o captures the enemy king, else kingDanger(state_o,
 * mover) / T). A probability in [0, 1]; the numerator is exact (Σ W_o · D_o ≤ 2^48).
 *
 * @param {object} state valid engine state
 * @param {object|string} move move input
 * @return {number}
 */
export function moveRisk(state, move) {
	const a = analyse(state)
	const r = resolveMove(a, move)
	if (r.reason !== undefined) {
		throw new IllegalMoveError(r.reason, move)
	}
	const rec = r.rec
	if (rec.risk !== undefined) {
		return rec.risk
	}
	const enemyKing = a.ci === 0 ? 16 : 0
	if (unaffectedDanger(a, rec)) {
		rec.risk = dangerA(a, a.ci) / T
		return rec.risk
	}
	const keys = recordKeys(rec)
	let num = 0
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i]
		const W = rec.resolution === 'rolled' ? rec.outcomes[i].weight : T
		if (rec.captureId === enemyKing && outcomeCaptures(rec, key)) {
			continue
		}
		const o = recordOutcomeBoards(a, rec, key)
		let D = dangerOf(o.boards, o.weights, o.boards.length, a.typeCodes, a.ci)
		if (o.total < T && D > 0) {
			if (D === o.total) {
				D = T
			} else {
				// Partial danger after a roll: measure it on the exact rescaled state (§5.3).
				const worlds = canonicalWorlds(o.boards, o.weights)
				const w = rescaleWeights(worlds.map((x) => x[1]))
				D = dangerOf(worlds.map((x) => x[0]), w, worlds.length, a.typeCodes, a.ci)
			}
		}
		num += W * D
	}
	rec.risk = num / (T * T)
	return rec.risk
}

/**
 * Can this move leave the mover's king danger unchanged for sure? True for a move that is not rolled, captures
 * nothing, does not move the king and touches no square on a line through the mover's king: every world keeps its
 * attack status (knight, pawn and king attacks have no lanes, and no attacker disappears).
 *
 * @param {object} a analysis
 * @param {object} rec record
 * @return {boolean}
 */
function unaffectedDanger(a, rec) {
	if (rec.resolution === 'rolled' || rec.wCap > 0 || rec.type === TYPE_K) {
		return false
	}
	const k = a.locs[a.ci === 0 ? 0 : 16][0]
	const touched = [rec.f, rec.t, rec.f2, rec.t2]
	for (let i = 0; i < touched.length; i++) {
		if (touched[i] >= 0 && DIR_OF[k * 64 + touched[i]] >= 0) {
			return false
		}
	}
	return true
}
