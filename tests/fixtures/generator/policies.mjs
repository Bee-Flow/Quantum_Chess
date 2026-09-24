/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Seeded move-choice policies of the random fixture games. Each policy steers the games towards a group of rules
 * features (quantum moves, captures, merges and Measures, pawn play, king hunts, repetitions, the 50-move rule), so
 * that the fixtures cover them all.
 */

import * as E from '../../../src/engine/index.js'

const T = E.T

/**
 * Pick one element with the rng.
 *
 * @param {Array<T>} list list
 * @param {() => number} rng rng
 * @return {T}
 * @template T
 */
export function pick(list, rng) {
	return list[Math.floor(rng() * list.length)]
}

/**
 * Greedy one-ply hunter: wins at once when it can, otherwise raises the enemy king danger (endgames only).
 *
 * @param {object} s state
 * @param {object[]} moves legal moves
 * @param {() => number} rng rng
 * @return {object}
 */
function hunter(s, moves, rng) {
	const me = s.turn
	const them = me === 'w' ? 'b' : 'w'
	let best = null
	let bestScore = -Infinity
	for (const m of moves) {
		let score = rng() * 0.5
		for (const o of E.getOutcomes(s, m)) {
			const p = o.weight / T
			const res = o.state.result
			if (res !== null && res.result !== '1/2-1/2') {
				score += p * 100
			} else if (res !== null) {
				score -= p * 5
			} else {
				score += p * (E.kingDanger(o.state, them) / T * 10 - E.kingDanger(o.state, me) / T * 8)
				score += p * (s.captured.length < o.state.captured.length ? 3 : 0)
			}
		}
		if (score > bestScore) {
			bestScore = score
			best = m
		}
	}
	return best
}

/**
 * Choose a move by policy.
 *
 * @param {string} policy policy name
 * @param {object} s state
 * @param {object[]} moves legal moves
 * @param {() => number} rng rng
 * @return {object}
 */
export function choose(policy, s, moves, rng) {
	const r = rng()
	switch (policy) {
		case 'quantum': {
			const q = moves.filter((m) => m.resolution !== 'certain')
			return r < 0.65 && q.length > 0 ? pick(q, rng) : pick(moves, rng)
		}
		case 'aggressive': {
			const c = moves.filter((m) => m.capture)
			return r < 0.75 && c.length > 0 ? pick(c, rng) : pick(moves, rng)
		}
		case 'merge': {
			const c = moves.filter((m) => m.type === 'merge' || m.type === 'measure')
			const q = moves.filter((m) => m.type === 'split')
			if (r < 0.45 && c.length > 0) {
				return pick(c, rng)
			}
			return r < 0.75 && q.length > 0 ? pick(q, rng) : pick(moves, rng)
		}
		case 'pawns': {
			const p = moves.filter((m) => m.type === 'standard' && s.types[m.piece] === 'p')
			return r < 0.7 && p.length > 0 ? pick(p, rng) : pick(moves, rng)
		}
		case 'hunter':
			return r < 0.9 ? hunter(s, moves, rng) : pick(moves, rng)
		case 'shuffle': {
		// Reversible moves only, preferring ones that recreate a position already seen.
			const rev = moves.filter((m) => m.resolution === 'certain' && !m.capture && m.type === 'standard' && s.types[m.piece] !== 'p')
			const seen = new Set(s.history)
			const back = rev.filter((m) => seen.has(E.positionHash(E.applyForSearch(s, m))))
			if (back.length > 0 && r < 0.8) {
				return pick(back, rng)
			}
			return rev.length > 0 ? pick(rev, rng) : pick(moves, rng)
		}
		case 'fifty': {
		// No captures, no pawn moves, never a repeated position: the 50-move rule ends the game.
			const seen = new Set(s.history)
			const ok = moves.filter((m) => m.resolution === 'certain' && !m.capture && s.types[m.piece] !== 'p' && m.type === 'standard'
				&& !seen.has(E.positionHash(E.applyForSearch(s, m))))
			return ok.length > 0 ? pick(ok, rng) : pick(moves, rng)
		}
		default:
			return pick(moves, rng)
	}
}
