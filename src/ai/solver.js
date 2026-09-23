/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Exact solver for small positions (GAME-DESIGN §5.2.1, SPEC §4.3): puzzles, lesson checks, the level-5 endgame
 * and the coach's "♚ in N".
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
 * plus one when the opponent is to move first. `plies` overrides this (e.g. the 3-ply material grading of lesson L9).
 */

import { generateMoves, getOutcomes } from '../engine/index.js'
import { PIECE_VALUES } from './levels.js'

export const SOLVER_GOALS = Object.freeze(['forced', 'max', 'survive', 'material'])

/** Tolerance for the accepted sets of `max` and `survive` (probability) and `material` (pawns). */
export const SOLVER_TOLERANCE = Object.freeze({ max: 0.005, survive: 0.005, material: 0.005 })

const KING_PAWNS = 100

/** Thrown when the node limit is reached. */
class Limit {}

/**
 * Material of a colour in pawns, counting a live king as KING_PAWNS.
 *
 * @param {object} state state
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
 * @param {object} state engine state
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
	const memo = new Map()
	let nodes = 0
	let limited = false

	// Win probability for `side` (forced/max) or for the opponent (survive) of a finished game.
	const terminal = (s) => {
		const r = s.result.result
		if (r === '1/2-1/2') {
			return 0
		}
		const winner = r === '1-0' ? 'w' : 'b'
		if (goal === 'survive') {
			return winner === other ? 1 : 0
		}
		return winner === side ? 1 : 0
	}
	// Does the side to move maximise the value?
	const maximises = (s) => (goal === 'forced' || goal === 'max') ? s.turn === side : s.turn !== side

	/**
	 * Value of a move: the average over its outcomes.
	 *
	 * @param {object} s position
	 * @param {object} m LegalMove
	 * @param {number} k plies left after this move
	 * @return {number}
	 */
	function moveValue(s, m, k) {
		let sum = 0
		const before = goal === 'material' ? [pawnsOf(s, side), pawnsOf(s, other)] : null
		for (const o of getOutcomes(s, m)) {
			nodes++
			if (nodes > nodeLimit) {
				throw new Limit()
			}
			let v
			if (goal === 'material') {
				const lost = before[0] - pawnsOf(o.state, side)
				const won = before[1] - pawnsOf(o.state, other)
				v = lost - won + (o.state.result === null ? value(o.state, k) : 0)
			} else {
				v = o.state.result !== null ? terminal(o.state) : value(o.state, k)
			}
			sum += o.probability * v
		}
		return sum
	}

	/**
	 * Value of a position with k plies left.
	 *
	 * @param {object} s position (result null)
	 * @param {number} k plies left
	 * @return {number}
	 */
	function value(s, k) {
		if (k <= 0) {
			return 0
		}
		const key = s.history[s.history.length - 1] + '|' + k
		const hit = memo.get(key)
		if (hit !== undefined) {
			return hit
		}
		const max = maximises(s)
		let best = max ? -Infinity : Infinity
		for (const m of generateMoves(s)) {
			const v = moveValue(s, m, k - 1)
			if (max ? v > best : v < best) {
				best = v
			}
			// Nothing beats a certain result.
			if (goal !== 'material' && ((max && best >= 1) || (!max && best <= 0))) {
				break
			}
		}
		if (best === -Infinity || best === Infinity) {
			best = 0
		}
		memo.set(key, best)
		return best
	}

	const moves = []
	const rootMax = maximises(state)
	try {
		for (const m of generateMoves(state)) {
			moves.push({ code: m.code, value: moveValue(state, m, plies - 1) })
		}
	} catch (e) {
		if (!(e instanceof Limit)) {
			throw e
		}
		limited = true
	}
	// Order: best for the side to move at the root first (stable).
	const indexed = moves.map((x, i) => ({ ...x, i }))
	indexed.sort((a, b) => (a.value === b.value ? a.i - b.i : rootMax ? b.value - a.value : a.value - b.value))
	const sorted = indexed.map(({ code, value: v }) => ({ code, value: v }))
	const best = sorted.length > 0 ? sorted[0].value : 0
	let accepted = []
	if (sorted.length > 0 && state.turn === side) {
		if (goal === 'forced') {
			accepted = sorted.filter((x) => x.value === 1).map((x) => x.code)
		} else {
			const tol = SOLVER_TOLERANCE[goal]
			accepted = sorted.filter((x) => (rootMax ? x.value >= best - tol : x.value <= best + tol)).map((x) => x.code)
		}
	}
	return { value: best, moves: sorted, accepted, exact: !limited, nodes, plies }
}
