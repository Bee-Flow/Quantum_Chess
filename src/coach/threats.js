/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Threat warnings and opportunities (GAME-DESIGN §5.3.3): pCap(X) = the opponent's best single-move chance to
 * capture piece X, as if it were the opponent's turn; the maximum over moves, not the sum.
 */

import { generateMoves, getOutcomes, kingDanger, otherColor, pieceLocations, positionHash, T } from '../engine/index.js'

/** Piece values in pawns (for the expected loss). */
export const VALUES = Object.freeze({ p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 })

/**
 * The state with `color` to move (a copy with a fresh history when the turn has to change).
 *
 * @param {object} state position
 * @param {'w'|'b'} color side to move
 * @return {object}
 */
export function withTurn(state, color) {
	if (state.turn === color) {
		return state
	}
	const s = { ...state, turn: color, ep: '-', halfmove: 0, result: null }
	s.history = [positionHash(s)]
	return s
}

/**
 * The threats against `color`'s pieces (kings excluded; their danger is the king ring).
 *
 * @param {object} state position
 * @param {'w'|'b'} color the threatened side
 * @return {Array<{id: number, type: string, pCap: number, expectedLoss: number, square: number, from: number}>}
 *   sorted by expected loss
 */
export function threatsAgainst(state, color) {
	if (state.result) {
		return []
	}
	const s = withTurn(state, otherColor(color))
	const types = s.types
	const mine = color === 'w' ? [0, 16] : [16, 32]
	const locations = pieceLocations(s)
	const squares = new Set()
	for (let id = mine[0]; id < mine[1]; id++) {
		if (types[id].toLowerCase() !== 'k') {
			for (const l of locations[id] ?? []) {
				squares.add(l.square)
			}
		}
	}
	const best = new Map()
	for (const m of generateMoves(s)) {
		if (!m.capture || !m.to.some((sq) => squares.has(sq))) {
			continue
		}
		const byId = new Map()
		for (const o of getOutcomes(s, m.code)) {
			if (o.captured !== null && o.captured >= mine[0] && o.captured < mine[1]) {
				byId.set(o.captured, (byId.get(o.captured) ?? 0) + o.weight)
			}
		}
		for (const [id, w] of byId) {
			if (!best.has(id) || best.get(id).w < w) {
				best.set(id, { w, square: m.to[0], from: m.from[0] })
			}
		}
	}
	const out = []
	for (const [id, b] of best) {
		const type = types[id].toLowerCase()
		const pCap = b.w / T
		out.push({ id, type, pCap, expectedLoss: pCap * VALUES[type], square: b.square, from: b.from })
	}
	return out.sort((a, b) => b.expectedLoss - a.expectedLoss)
}

/**
 * The threats a coach level shows (Beginner: pCap ≥ 25 % and an expected loss ≥ 1 pawn; Standard: ≥ 2 pawns).
 *
 * @param {object[]} threats threatsAgainst result
 * @param {'beginner'|'standard'} level coach level
 * @return {object[]}
 */
export function visibleThreats(threats, level) {
	const minLoss = level === 'beginner' ? 1 : 2
	return threats.filter((x) => x.pCap >= 0.25 - 1e-9 && x.expectedLoss >= minLoss - 1e-9)
}

/**
 * The chance (0..1) that `color` can capture the enemy king with its best move if it were its turn.
 *
 * @param {object} state position
 * @param {'w'|'b'} color attacker
 * @return {number}
 */
export function kingShot(state, color) {
	return state.result ? 0 : kingDanger(state, otherColor(color)) / T
}

/**
 * The most likely square of a piece.
 *
 * @param {object} state position
 * @param {number} id piece id
 * @return {number|null}
 */
export function likeliestSquare(state, id) {
	const locs = pieceLocations(state)[id] ?? []
	return locs.length ? locs.reduce((a, b) => (b.weight > a.weight ? b : a)).square : null
}
