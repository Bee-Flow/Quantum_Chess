/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The computer player of the chess variants: a small expectimax search that averages over the outcomes of every roll.
 * It works for every variant through the quantum layer; a variant may add its own terms with `evaluate(world, side)`
 * (King of the Hill rewards a central king, Antichess reverses material, ...).
 *
 * The search yields to the browser every few milliseconds, so the board stays responsive while the computer thinks.
 */

import { branches, legalMoves, splitsFrom, stateAfter, T } from './quantum.mjs'
import { HAND } from '/home/tom/Projects/Quantum_Chess/Quantum_Chess/src/variants/core/world.js'

/**
 * The levels: how deep the computer looks, how much noise it adds (in centipawns) and how long it may think.
 */
export const LEVELS = Object.freeze([
	Object.freeze({ id: 'easy', reply: false, noise: 120, splits: 2, timeMs: 400 }),
	Object.freeze({ id: 'normal', reply: true, noise: 25, splits: 6, timeMs: 1500 }),
	Object.freeze({ id: 'hard', reply: true, fullReply: true, noise: 0, splits: 10, timeMs: 4000 }),
])

const WIN = 100000

/**
 * Whether a side counts as a winner of a finished game.
 *
 * @param {object} result game result
 * @param {number} side side index
 * @return {boolean}
 */
function isWinner(result, side) {
	return result.winner === side || (Array.isArray(result.winners) && result.winners.includes(side))
}

/**
 * The value of a world for a side: own material minus the average enemy material, plus the variant's own terms.
 *
 * @param {object} V variant
 * @param {object} b world
 * @param {number} side side index
 * @return {number}
 */
function worldValue(V, b, side) {
	let own = 0
	const enemy = new Array(V.sideCount).fill(0)
	for (let id = 0; id < b.sq.length; id++) {
		const s = b.sq[id]
		if (s < 0 && s !== HAND) {
			continue
		}
		const v = (V.types[b.ty[id]]?.value ?? 100) * (s === HAND ? 0.8 : 1)
		if (b.sd[id] === side) {
			own += v
		} else if (V.enemies(side, b.sd[id])) {
			enemy[b.sd[id]] += v
		} else {
			own += v * 0.5
		}
	}
	const enemies = enemy.filter((v, s) => s !== side && V.enemies(side, s))
	const avg = enemies.length ? enemies.reduce((a, c) => a + c, 0) / enemies.length : 0
	let score = own - avg
	if (V.materialSign === -1) {
		score = -score
	}
	if (V.evaluate) {
		score += V.evaluate(b, side)
	}
	return score
}

/**
 * The value of a state for a side.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} side side index
 * @return {number}
 */
export function evaluateState(V, state, side) {
	if (state.result) {
		if (state.result.winner === null && !state.result.winners) {
			return 0
		}
		return isWinner(state.result, side) ? WIN - state.ply : -WIN + state.ply
	}
	let score = 0
	for (const { b, w } of state.worlds) {
		score += (w / T) * worldValue(V, b, side)
	}
	return score
}

/**
 * The expected value of a move for `side`, averaged over its outcomes.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {string} code move code
 * @param {(s: object) => number} score value of a resulting state
 * @return {number|null}
 */
function expected(V, state, code, score) {
	const list = branches(V, state, code)
	if (!list) {
		return null
	}
	let v = 0
	for (const br of list) {
		v += (br.weight / T) * score(stateAfter(V, state, code, br, list, { light: true }))
	}
	return v
}

/**
 * The candidate moves of a state: every ordinary move, measurement and merge, plus a few splits.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} splitCount how many splits to consider
 * @param {() => number} rng random numbers
 * @return {string[]}
 */
function candidates(V, state, splitCount, rng) {
	const out = legalMoves(V, state).map((m) => m.code)
	if (splitCount > 0) {
		const froms = new Set()
		for (const { b } of state.worlds) {
			for (let id = 0; id < b.sq.length; id++) {
				if (b.sd[id] === state.turn && b.sq[id] >= 0 && V.types[b.ty[id]]?.splittable) {
					froms.add(b.sq[id])
				}
			}
		}
		const pool = []
		for (const f of froms) {
			pool.push(...splitsFromLimited(V, state, f))
		}
		for (let i = 0; i < splitCount && pool.length; i++) {
			const k = Math.floor(rng() * pool.length)
			out.push(pool.splice(k, 1)[0])
		}
	}
	return out
}

/**
 * A handful of splits of the piece on `f` (the full list grows quadratically with the number of targets).
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} f from square
 * @return {string[]}
 */
function splitsFromLimited(V, state, f) {
	return splitsFrom(V, state, f).slice(0, 6).map((m) => m.code)
}

/**
 * Whether a move might capture something (tried first, and the only replies of the normal level).
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {string} code move code
 * @return {boolean}
 */
function mightCapture(V, state, code) {
	const list = branches(V, state, code)
	return Boolean(list && list.some((b) => b.captures.length > 0))
}

/**
 * Wait for the browser to breathe.
 *
 * @return {Promise<void>}
 */
function breathe() {
	return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Choose a move for the side to move.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {object} [opts] options
 * @param {string} [opts.level] easy, normal or hard
 * @param {() => number} [opts.rng] random numbers
 * @param {AbortSignal} [opts.signal] abort the search
 * @return {Promise<string|null>} a move code, or null when there is none
 */
export async function chooseMove(V, state, { level = 'normal', rng = Math.random, signal } = {}) {
	const L = LEVELS.find((l) => l.id === level) ?? LEVELS[1]
	const me = state.turn
	// hidden-information variants: search the position as this side sees it, then keep the moves that are legal
	const real = state
	if (V.aiView) {
		state = V.aiView(state, me)
	}
	const moves = candidates(V, state, L.splits, rng).filter((c) => real === state || branches(V, real, c))
	if (!moves.length) {
		return null
	}
	const started = Date.now()
	let lastBreath = started
	const deadline = started + L.timeMs
	const captures = moves.filter((c) => mightCapture(V, state, c))
	const ordered = [...captures, ...moves.filter((c) => !captures.includes(c))]
	let best = null
	let bestValue = -Infinity
	for (const code of ordered) {
		if (signal?.aborted) {
			return null
		}
		if (Date.now() > deadline && best !== null) {
			break
		}
		const value = expected(V, state, code, (s) => {
			if (!L.reply || s.result) {
				return evaluateState(V, s, me)
			}
			return replyValue(V, s, me, L)
		})
		if (value === null) {
			continue
		}
		const noisy = value + (L.noise ? (rng() - 0.5) * 2 * L.noise : 0)
		if (noisy > bestValue) {
			bestValue = noisy
			best = code
		}
		if (Date.now() - lastBreath > 12) {
			await breathe()
			lastBreath = Date.now()
		}
	}
	return best
}

/**
 * The value for `me` after the next side answers with its best move (captures only below the hard level).
 *
 * @param {object} V variant
 * @param {object} s state after my move
 * @param {number} me my side
 * @param {object} L level
 * @return {number}
 */
function replyValue(V, s, me, L) {
	const them = s.turn
	if (them === me) {
		return continuationValue(V, s, me)
	}
	let codes = legalMoves(V, s).map((m) => m.code)
	if (!L.fullReply) {
		codes = codes.filter((c) => mightCapture(V, s, c))
	}
	if (!codes.length) {
		return evaluateState(V, s, me)
	}
	let worst = evaluateState(V, s, me)
	let bestForThem = -Infinity
	for (const c of codes) {
		let mine = 0
		let theirs = 0
		const list = branches(V, s, c)
		if (!list) {
			continue
		}
		for (const br of list) {
			const n = stateAfter(V, s, c, br, list, { light: true })
			mine += (br.weight / T) * evaluateState(V, n, me)
			theirs += (br.weight / T) * evaluateState(V, n, them)
		}
		if (theirs > bestForThem) {
			bestForThem = theirs
			worst = mine
		}
	}
	return worst
}

/**
 * U3 (prototype): the value of my best next move of the same turn (at most 40 candidates, in the variant's order).
 *
 * @param {object} V variant
 * @param {object} s state
 * @param {number} me my side
 * @return {number}
 */
function continuationValue(V, s, me) {
	let best = evaluateState(V, s, me)
	const codes = legalMoves(V, s).map((m) => m.code).slice(0, 40)
	for (const c of codes) {
		const list = branches(V, s, c)
		if (!list) {
			continue
		}
		let v = 0
		for (const br of list) {
			v += (br.weight / T) * evaluateState(V, stateAfter(V, s, c, br, list, { light: true }), me)
		}
		best = Math.max(best, v)
	}
	return best
}
