/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Exact solver for small positions: puzzle verification, lesson checks, the level-5 endgame and the coach's
 * "♚ in N".
 *
 * It enumerates **every** legal move and every outcome with the real rules (`getOutcomes`, including the trapped-king
 * end E1b, so "cannot escape" counts as a win) up to a fixed number of plies. No heuristics: values are exact
 * probabilities (or expected material), and the accepted sets are the moves that reach the optimum.
 *
 * Goals (`side` is the solver's side):
 * - `forced`: value 1 when every outcome wins within the horizon. `value` is the win probability; `accepted` are the
 *   moves that win with certainty.
 * - `max`: the maximum probability of winning (capturing the king or trapping it) within the horizon; accepted within
 *   0.5 percentage points.
 * - `survive`: the minimum probability that the opponent wins within the horizon; accepted within 0.5 pp.
 * - `material`: the minimum expected material loss in pawns (`PIECE_VALUES` / 100, a king counts 100) against the
 *   best replies; negative values are gains; accepted within 0.005 pawns.
 *
 * `horizon` counts the solver side's moves (default 1). The plies searched are `2·horizon − 1` for `forced`/`max`
 * (the opponent's replies in between) and `2·horizon` for `survive`/`material` (ending with the opponent's reply),
 * plus one when the opponent is to move first. `plies` overrides this (for example a 3-ply material grading).
 */

import { generateMoves, getOutcomes } from '../engine/index.js'
import { PIECE_VALUES } from './levels.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */
/** @typedef {import('../engine/types.js').LegalMove} LegalMove */

export const SOLVER_GOALS = Object.freeze(['forced', 'max', 'survive', 'material'])

/** Tolerance for the accepted sets of `max` and `survive` (probability) and `material` (pawns). */
const SOLVER_TOLERANCE = Object.freeze({ max: 0.005, survive: 0.005, material: 0.005 })

const KING_PAWNS = 100

/** Thrown when the node limit is reached. */
class Limit {}

/**
 * Material of a colour in pawns, counting a live king as KING_PAWNS.
 *
 * @param {EngineState} state state
 * @param {'w'|'b'} color colour
 * @return {number}
 */
function pawnsOf(state, color) {
	const base = color === 'w' ? 0 : 16
	let sum = 0
	for (let id = base; id < base + 16; id++) {
		if (!state.captured.includes(id)) {
			const t = state.types[id]
			sum += t === 'k' ? KING_PAWNS : PIECE_VALUES[t] / 100
		}
	}
	return sum
}

/**
 * Default number of plies for a goal and horizon.
 *
 * @param {string} goal goal
 * @param {number} horizon moves of the solver's side
 * @param {boolean} opponentFirst the opponent moves first
 * @return {number}
 */
export function pliesFor(goal, horizon, opponentFirst) {
	const base = goal === 'forced' || goal === 'max' ? 2 * horizon - 1 : 2 * horizon
	return base + (opponentFirst ? 1 : 0)
}

/**
 * Solve a position exactly.
 *
 * Internally every goal is a score for `side` that `side` maximises and the opponent minimises: the win probability
 * (`forced`, `max`), minus the opponent's win probability (`survive`) or the material balance change in pawns
 * (`material`). Decision nodes use alpha-beta, chance nodes Star1 with exact bounds, and a transposition table keeps
 * bounds per position and depth; every root move is still searched with a full window, so its value is exact.
 *
 * @param {EngineState} state engine state
 * @param {object} [options] `{goal = 'forced', horizon = 1, side = state.turn, nodeLimit = 200000, plies?}`
 * @return {{value: number, moves: Array<{code: string, value: number}>, accepted: string[], exact: boolean, nodes: number, plies: number}}
 */
export function solve(state, options = {}) {
	const goal = options.goal ?? 'forced'
	if (!SOLVER_GOALS.includes(goal)) {
		throw new TypeError('unknown solver goal: ' + String(goal))
	}
	const horizon = Math.max(1, options.horizon ?? 1)
	const side = options.side ?? state.turn
	const plies = options.plies ?? pliesFor(goal, horizon, side !== state.turn)
	const nodeLimit = options.nodeLimit ?? 200000
	const other = side === 'w' ? 'b' : 'w'
	const material = goal === 'material'
	const memo = new Map()
	let nodes = 0
	let limited = false

	/**
	 * Score of a finished game for `side` (material: nothing more to gain or lose).
	 *
	 * @param {object} s finished position
	 * @return {number}
	 */
	function terminal(s) {
		if (material) {
			return 0
		}
		const r = s.result.result
		if (r === '1/2-1/2') {
			return 0
		}
		const winner = r === '1-0' ? 'w' : 'b'
		if (goal === 'survive') {
			return winner === other ? -1 : 0
		}
		return winner === side ? 1 : 0
	}

	/**
	 * Bounds of the score of an unfinished position.
	 *
	 * @param {object} s position
	 * @return {number[]} [lower, upper]
	 */
	function bounds(s) {
		if (goal === 'survive') {
			return [-1, 0]
		}
		if (material) {
			return [-pawnsOf(s, side), pawnsOf(s, other)]
		}
		return [0, 1]
	}

	/**
	 * Moves in a helpful order: king shots and likely captures first.
	 *
	 * @param {object} s position
	 * @return {object[]}
	 */
	function ordered(s) {
		const list = generateMoves(s)
		const weight = (m) => {
			if (!m.capture) {
				return 0
			}
			if (m.resolution !== 'rolled') {
				return 2
			}
			const c = m.outcomes.find((o) => o.key === 'capture')
			return c ? 1 + c.weight / 16777216 : 0
		}
		return list.map((m, i) => ({ m, w: weight(m), i })).sort((a, b) => b.w - a.w || a.i - b.i).map((x) => x.m)
	}

	/**
	 * Chance node: the average over the outcomes of a move, with Star1 cut-offs outside (alpha, beta).
	 *
	 * @param {object} s position
	 * @param {LegalMove} m LegalMove
	 * @param {number} k plies left after the move
	 * @param {number} alpha lower bound
	 * @param {number} beta upper bound
	 * @return {number}
	 */
	function moveValue(s, m, k, alpha, beta) {
		const before = material ? pawnsOf(s, side) - pawnsOf(s, other) : 0
		const outs = getOutcomes(s, m).map((o) => {
			nodes++
			if (nodes > nodeLimit) {
				throw new Limit()
			}
			const delta = material ? (pawnsOf(o.state, side) - pawnsOf(o.state, other)) - before : 0
			if (o.state.result !== null || k <= 0) {
				const v = delta + (o.state.result !== null ? terminal(o.state) : 0)
				return { p: o.probability, state: null, delta, lo: v, hi: v }
			}
			const [lo, hi] = bounds(o.state)
			return { p: o.probability, state: o.state, delta, lo: delta + lo, hi: delta + hi }
		})
		let restLo = 0
		let restHi = 0
		for (const o of outs) {
			restLo += o.p * o.lo
			restHi += o.p * o.hi
		}
		let sum = 0
		for (const o of outs) {
			restLo -= o.p * o.lo
			restHi -= o.p * o.hi
			let x
			if (o.state === null) {
				x = o.lo
			} else {
				const a = (alpha - sum - restHi) / o.p - o.delta
				const b = (beta - sum - restLo) / o.p - o.delta
				x = o.delta + value(o.state, k, a, b)
			}
			sum += o.p * x
			if (sum + restHi <= alpha) {
				return sum + restHi
			}
			if (sum + restLo >= beta) {
				return sum + restLo
			}
		}
		return sum
	}

	/**
	 * Decision node with k plies left: `side` maximises, the opponent minimises (fail-soft alpha-beta).
	 *
	 * @param {object} s position (result null)
	 * @param {number} k plies left
	 * @param {number} alpha lower bound
	 * @param {number} beta upper bound
	 * @return {number}
	 */
	function value(s, k, alpha, beta) {
		if (k <= 0) {
			return 0
		}
		const key = s.history[s.history.length - 1] + '|' + k
		const hit = memo.get(key)
		if (hit !== undefined) {
			if (hit.lo === hit.hi || hit.lo >= beta) {
				return hit.lo
			}
			if (hit.hi <= alpha) {
				return hit.hi
			}
			alpha = Math.max(alpha, hit.lo)
			beta = Math.min(beta, hit.hi)
		}
		// Nothing lies outside the natural bounds: reaching one ends the search of this node.
		const [lo, hi] = bounds(s)
		alpha = Math.max(alpha, lo)
		beta = Math.min(beta, hi)
		const a0 = alpha
		const b0 = beta
		const max = s.turn === side
		let best = max ? -Infinity : Infinity
		for (const m of ordered(s)) {
			const v = moveValue(s, m, k - 1, alpha, beta)
			if (max) {
				if (v > best) {
					best = v
				}
				if (best > alpha) {
					alpha = best
				}
			} else {
				if (v < best) {
					best = v
				}
				if (best < beta) {
					beta = best
				}
			}
			if (alpha >= beta) {
				break
			}
		}
		if (best === -Infinity || best === Infinity) {
			best = 0
		}
		const old = hit ?? { lo: -Infinity, hi: Infinity }
		const entry = { lo: old.lo, hi: old.hi }
		if (best <= a0) {
			entry.hi = Math.min(entry.hi, best)
		} else if (best >= b0) {
			entry.lo = Math.max(entry.lo, best)
		} else {
			entry.lo = best
			entry.hi = best
		}
		memo.set(key, entry)
		return best
	}

	const scores = []
	try {
		for (const m of generateMoves(state)) {
			scores.push({ code: m.code, score: moveValue(state, m, plies - 1, -Infinity, Infinity) })
		}
	} catch (e) {
		if (!(e instanceof Limit)) {
			throw e
		}
		limited = true
	}
	// Report in the goal's own units: probabilities for forced/max/survive, a loss in pawns for material.
	const report = (x) => (goal === 'survive' || material ? (x === 0 ? 0 : -x) : x)
	const rootMax = state.turn === side
	const indexed = scores.map((x, i) => ({ ...x, i }))
	indexed.sort((a, b) => (a.score === b.score ? a.i - b.i : rootMax ? b.score - a.score : a.score - b.score))
	const sorted = indexed.map((x) => ({ code: x.code, value: report(x.score) }))
	const bestScore = indexed.length > 0 ? indexed[0].score : 0
	let accepted = []
	if (indexed.length > 0 && rootMax) {
		if (goal === 'forced') {
			accepted = indexed.filter((x) => x.score === 1).map((x) => x.code)
		} else {
			const tol = SOLVER_TOLERANCE[goal]
			accepted = indexed.filter((x) => x.score >= bestScore - tol).map((x) => x.code)
		}
	}
	return { value: report(bestScore), moves: sorted, accepted, exact: !limited, nodes, plies }
}
