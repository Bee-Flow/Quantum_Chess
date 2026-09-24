/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Analysis for the coach and the post-game review:
 *
 * - `analyze(state)`: White's expected score E, the best moves (multiPV) with principal variations, the values of
 *   extra moves (`include`), the **fog band** (min–max of E across the outcomes of the first roll on the principal
 *   line within `fogPlies` plies; `null` when there is none) and **"♚ in N"** (`mate`, proven by the exact solver).
 * - `evaluateMove(state, code)`: the ex-ante value of one move and the value after each of its outcomes.
 * - `analyzeGame(record)`: one `PlyAnalysis` per move, replayed with the recorded rolls; values are computed before
 *   the roll, so bad luck never makes a move a mistake.
 *
 * Every E in the results is **White's** expected score in [0, 1]; a won or lost game is exactly 1 or 0.
 *
 * Section numbers (§) refer to docs/engine-rules.md.
 */

import {
	applyForSearch,
	applyMove,
	findMove,
	generateMoves,
	IllegalMoveError,
	initialState,
	moveRisk,
	whyIllegal,
} from '../engine/index.js'
import { ENGINE_VERSION } from './levels.js'
import { Searcher } from './search.js'
import { cleanValue } from './searchValues.js'
import { solve } from './solver.js'
import { NO_SLICE, runSearcher, runSync } from './tasks.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */

/** @typedef {import('./tasks.js').SliceContext} SliceContext */

/** "♚ in N" is looked for up to this many moves of the winner. */
const MATE_MAX_MOVES = 2

/** Root margin for the review: moves within this of the best get exact values (brilliancy and only-move rules). */
const REVIEW_MARGIN = 0.16

/**
 * Canonical LegalMove for a code, or throw IllegalMoveError.
 *
 * @param {EngineState} state position
 * @param {string|object} code move input
 * @return {object}
 */
function legalOrThrow(state, code) {
	const m = findMove(state, code)
	if (m === null) {
		throw new IllegalMoveError(whyIllegal(state, code) ?? 'malformed', code)
	}
	return m
}

/**
 * White's expected score of a finished game.
 *
 * @param {EngineState} state state with a result
 * @return {number}
 */
function resultE(state) {
	const r = state.result.result
	return r === '1-0' ? 1 : r === '0-1' ? 0 : 0.5
}

/**
 * The fog band: min–max of White's E across the outcomes of the first roll on the principal line within `fogPlies`
 * plies, widened to contain E itself; `null` when the line has no roll. It shows how much the position depends on
 * luck.
 *
 * @param {Searcher} searcher finished searcher
 * @param {number} E White's E of the position
 * @param {number} fogPlies plies to look along the line (1 or 2)
 * @return {{min: number, max: number}|null}
 */
function fogBand(searcher, E, fogPlies) {
	const root = searcher.root[0]
	if (!root || fogPlies < 1) {
		return null
	}
	let values = null
	if (root.move.resolution === 'rolled') {
		values = root.children.map((c) => (c.value === null ? null : searcher.toWhite(cleanValue(c.value))))
	} else if (fogPlies >= 2) {
		const child = root.children[0].state
		if (child === null || child.result !== null) {
			return null
		}
		const entry = searcher.tt.get(child.history[child.history.length - 1])
		const reply = entry && entry.move ? findMove(child, entry.move) : null
		if (reply === null || reply.resolution !== 'rolled') {
			return null
		}
		const depth = Math.max(0, searcher.depth - 2)
		values = reply.outcomes.map((o) => {
			const gc = applyForSearch(child, reply, o.key)
			if (gc.result !== null) {
				return resultE(gc)
			}
			// The grandchild's side to move is the root's side to move.
			const v = searcher.valueOf(gc, depth, 5000)
			return v === null ? null : searcher.toWhite(cleanValue(v))
		})
	}
	if (values === null || values.some((v) => v === null)) {
		return null
	}
	return { min: Math.min(E, ...values), max: Math.max(E, ...values) }
}

/**
 * "♚ in N": when the search says the game is decided, ask the exact solver for a certain win within N moves.
 *
 * @param {EngineState} state position
 * @param {number} E White's E
 * @return {{winner: 'w'|'b', moves: number}|null}
 */
function mateOf(state, E) {
	if (E !== 0 && E !== 1) {
		return null
	}
	const winner = E === 1 ? 'w' : 'b'
	for (let n = 1; n <= MATE_MAX_MOVES; n++) {
		const r = solve(state, { goal: 'forced', horizon: n, side: winner, nodeLimit: n === 1 ? 20000 : 40000 })
		if (!r.exact) {
			return null
		}
		if (r.value === 1) {
			return { winner, moves: n }
		}
	}
	return null
}

/**
 * Analysis task (generator). Options: `{timeMs = 600, multiPv = 3, include = [], fogPlies = 2, level = 5,
 * nodeBudget?, onProgress?, now?}`. `onProgress({depth, E, code, nodes})` after each iteration ("deepening while the
 * player thinks").
 *
 * @param {EngineState} state position
 * @param {object} [options] options
 * @param {SliceContext} [ctx] slicing context
 * @yields {void}
 * @return {object} Analysis
 */
export function* analyzeTask(state, options = {}, ctx = NO_SLICE) {
	const started = (options.now || (() => performance.now()))()
	if (state.result !== null) {
		return { E: resultE(state), fog: null, mate: null, best: [], included: [], depth: 0, nodes: 0, timeMs: 0 }
	}
	const multiPv = Math.max(1, options.multiPv ?? 3)
	const include = []
	const includeMap = new Map()
	for (const code of options.include || []) {
		const m = findMove(state, code)
		includeMap.set(code, m === null ? null : m.code)
		if (m !== null) {
			include.push(m.code)
		}
	}
	const searcher = new Searcher(state, {
		level: options.level ?? 5,
		timeMs: options.timeMs ?? 600,
		nodeBudget: options.nodeBudget,
		multiPv,
		margin: 0.001,
		include,
		exactOutcomes: true,
		usePartial: false,
		now: options.now,
		onProgress: typeof options.onProgress === 'function'
			? (p) => options.onProgress({ depth: p.depth, E: p.E, code: p.code, nodes: p.nodes })
			: null,
	})
	const res = yield* runSearcher(searcher, ctx)
	const E = res.E
	const byCode = new Map(searcher.root.map((e) => [e.code, e]))
	const best = searcher.root
		.filter((e) => e.value !== null)
		.slice(0, multiPv)
		.map((e) => ({ code: e.code, E: searcher.toWhite(cleanValue(e.value)), pv: searcher.pv(e), resolution: e.move.resolution }))
	const included = (options.include || []).map((code) => {
		const canonical = includeMap.get(code)
		const e = canonical ? byCode.get(canonical) : undefined
		return { code: canonical ?? code, E: e && e.value !== null ? searcher.toWhite(cleanValue(e.value)) : null }
	})
	const fog = fogBand(searcher, E, options.fogPlies ?? 2)
	const mate = mateOf(state, E)
	const ended = (options.now || (() => performance.now()))()
	return { E, fog, mate, best, included, depth: res.depth, nodes: searcher.nodes, timeMs: Math.round(ended - started) }
}

/**
 * Analyse a position synchronously. See `analyzeTask`.
 *
 * @param {EngineState} state position
 * @param {object} [options] options
 * @return {object} Analysis
 */
export function analyze(state, options = {}) {
	return runSync(analyzeTask(state, options))
}

/**
 * Evaluate one move task (generator): `{code, E, outcomes: [{key, weight, E}]}` — `E` is the ex-ante value of
 * playing it; one outcome entry (`certain` or `quantum`) for a move that is not rolled. Options: `{timeMs = 400,
 * level = 5, nodeBudget?, now?}`. Throws IllegalMoveError for an illegal move.
 *
 * @param {EngineState} state position
 * @param {string|object} code move
 * @param {object} [options] options
 * @param {SliceContext} [ctx] slicing context
 * @yields {void}
 * @return {object} MoveEval
 */
export function* evaluateMoveTask(state, code, options = {}, ctx = NO_SLICE) {
	const m = legalOrThrow(state, code)
	const searcher = new Searcher(state, {
		level: options.level ?? 5,
		timeMs: options.timeMs ?? 400,
		nodeBudget: options.nodeBudget,
		rootMoves: [m.code],
		exactOutcomes: true,
		usePartial: false,
		now: options.now,
	})
	yield* runSearcher(searcher, ctx)
	const e = searcher.root[0]
	const w = (v) => (v === null ? null : searcher.toWhite(cleanValue(v)))
	return {
		code: m.code,
		E: w(e.value),
		outcomes: e.children.map((c) => ({ key: c.key ?? m.resolution, weight: c.weight, E: w(c.value) })),
	}
}

/**
 * Evaluate one move synchronously. See `evaluateMoveTask`.
 *
 * @param {EngineState} state position
 * @param {string|object} code move
 * @param {object} [options] options
 * @return {object} MoveEval
 */
export function evaluateMove(state, code, options = {}) {
	return runSync(evaluateMoveTask(state, code, options))
}

/**
 * Per-ply game analysis task (generator; yields after every ply). `record = {startState, moves: [{code, u,
 * outcome?}]}` is replayed with the recorded rolls. Options: `{msPerPly = 400, level = 4, nodeBudget?, onProgress?,
 * now?}`; `onProgress(plyAnalysis)` receives each ply as it is ready.
 *
 * PlyAnalysis: `{ply, color, code, forced, EBefore, bestCode, bestE, secondBestE, bestClassicalE, playedE, outcomes,
 * realisedE, allowsKingShot}` — `realisedE` is the value of the outcome that happened (the played value for a move that
 * is not rolled); `allowsKingShot` is true when the move leaves the king capturable with at least 25 % more than the
 * safest legal move would (a "free king shot", measured with `moveRisk`, §8).
 *
 * @param {{startState: object|null, moves: Array<{code: string, u?: number|null, outcome?: string|null}>}} record game
 * @param {object} [options] options
 * @param {SliceContext} [ctx] slicing context
 * @yields {object} each PlyAnalysis
 * @return {{engineVersion: string, plies: object[]}}
 */
export function* analyzeGameTask(record, options = {}, ctx = NO_SLICE) {
	let state = record.startState ?? initialState()
	const msPerPly = options.msPerPly ?? 400
	const level = options.level ?? 4
	const plies = []
	for (let i = 0; i < record.moves.length && state.result === null; i++) {
		const rec = record.moves[i]
		const m = legalOrThrow(state, rec.code)
		const hasU = rec.u !== undefined && rec.u !== null
		const hasOutcome = rec.outcome !== undefined && rec.outcome !== null
		if (m.resolution === 'rolled' && !hasU && !hasOutcome) {
			throw new Error('analyzeGame: the rolled move ' + m.code + ' at ply ' + i + ' has no recorded roll')
		}
		const legal = generateMoves(state)
		const forced = legal.length === 1
		const searcher = new Searcher(state, {
			level,
			timeMs: forced ? Math.round(msPerPly / 4) : msPerPly,
			nodeBudget: options.nodeBudget,
			include: [m.code],
			multiPv: 2,
			margin: REVIEW_MARGIN,
			exactOutcomes: true,
			usePartial: false,
			now: options.now,
		})
		yield* runSearcher(searcher, ctx)
		const w = (v) => (v === null ? null : searcher.toWhite(cleanValue(v)))
		const entries = searcher.root.filter((e) => e.value !== null)
		const best = entries[0]
		const second = entries.length > 1 ? entries[1] : null
		const classical = entries.find((e) => e.move.type === 'standard') ?? null
		const played = searcher.root.find((e) => e.code === m.code)
		const applied = applyMove(state, m.code, hasOutcome ? { outcome: rec.outcome } : { u: rec.u })
		const outcomes = m.resolution === 'rolled'
			? played.children.map((c) => ({ key: c.key, weight: c.weight, E: w(c.value) }))
			: null
		const playedE = w(played.value)
		const realised = outcomes === null ? null : outcomes.find((o) => o.key === applied.measurement.key)
		const risk = moveRisk(state, m.code)
		let minRisk = risk
		for (const x of legal) {
			const r = moveRisk(state, x)
			if (r < minRisk) {
				minRisk = r
			}
		}
		const ply = {
			ply: state.ply,
			color: state.turn,
			code: m.code,
			forced,
			EBefore: w(best.value),
			bestCode: best.code,
			bestE: w(best.value),
			secondBestE: second ? w(second.value) : null,
			bestClassicalE: classical ? w(classical.value) : null,
			playedE,
			outcomes,
			realisedE: realised ? realised.E : playedE,
			allowsKingShot: risk >= 0.25 && risk - minRisk >= 0.25,
		}
		plies.push(ply)
		if (typeof options.onProgress === 'function') {
			options.onProgress(ply)
		}
		state = applied.state
		yield ply
	}
	return { engineVersion: ENGINE_VERSION, plies }
}

/**
 * Analyse a whole game synchronously. See `analyzeGameTask`.
 *
 * @param {object} record game record
 * @param {object} [options] options
 * @return {{engineVersion: string, plies: object[]}}
 */
export function analyzeGame(record, options = {}) {
	return runSync(analyzeGameTask(record, options))
}
