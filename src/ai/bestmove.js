/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The computer opponent's move choice (GAME-DESIGN §6.1): the search plus each level's personality — softmax
 * temperature, random and top-half picks, split/merge/measure policies, king-shot thresholds, how often it notices
 * danger to its own king, the roll bonus, the level-5 exact solver, and the display delay.
 *
 * The level noise uses an injected RNG (`rng` function or `seed`); it is never the roll source.
 */

import { BUDGET, budget, generateMoves, kingDanger, moveRisk, seededRng, T } from '../engine/index.js'
import { features } from './evaluate.js'
import { reaches } from './geometry.js'
import { levelOf, SOLVER_MAX_PIECES, SOLVER_MAX_WORLDS } from './levels.js'
import { captureWeight, cleanValue, Searcher, victimOf } from './search.js'
import { solve } from './solver.js'

/** The level noise may not pick a move whose king risk exceeds the safest move's by more than this. */
const KING_GUARD = 0.10

/**
 * A level-noise RNG from the options: `rng` (function), `seed` (integer) or a fresh random seed.
 *
 * @param {object} options options
 * @return {function(): number}
 */
export function noiseRng(options) {
	if (typeof options.rng === 'function') {
		return options.rng
	}
	if (Number.isInteger(options.seed)) {
		return seededRng(options.seed)
	}
	const c = globalThis.crypto
	const seed = c && typeof c.getRandomValues === 'function' ? c.getRandomValues(new Uint32Array(1))[0] : Date.now() >>> 0
	return seededRng(seed)
}

/**
 * Is this move a king shot, and with which probability?
 *
 * @param {object} f features
 * @param {object} m LegalMove
 * @return {number} capture probability of the enemy king (0 if none)
 */
function kingShot(f, m) {
	const vid = victimOf(f, m)
	if (vid !== 0 && vid !== 16) {
		return 0
	}
	return captureWeight(m) / T
}

/**
 * Does any part of this piece stand on a square the enemy attacks? (Level 2 merges only then.)
 *
 * @param {object} f features
 * @param {number} id piece id
 * @return {boolean}
 */
function partAttacked(f, id) {
	const enemy = id < 16 ? 1 : 0
	for (let s = 0; s < 64; s++) {
		if (f.occ[s] === id && f.att[enemy * 64 + s] > 0) {
			return true
		}
	}
	return false
}

/**
 * Does a part of the measured piece attack an enemy piece (geometrically)? Level 3 measures only then, or with a
 * full budget: the Measure may make that capture certain.
 *
 * @param {object} f features
 * @param {number} id piece id
 * @return {boolean}
 */
function partAttacks(f, id) {
	const own = id < 16 ? 0 : 1
	const type = f.types[id]
	for (let s = 0; s < 64; s++) {
		if (f.occ[s] !== id) {
			continue
		}
		for (let t = 0; t < 64; t++) {
			const o = f.occ[t]
			if (o >= 0 && (o < 16 ? 0 : 1) !== own && reaches(type, s, t)) {
				return true
			}
		}
	}
	return false
}

/**
 * The level's move pool (before search): policy filters for splits, merges and Measures.
 *
 * @param {object} state position
 * @param {object[]} moves legal moves
 * @param {object} level level
 * @param {boolean} funSplit level 1 rolled its "split for fun"
 * @return {object[]}
 */
function policyPool(state, moves, level, funSplit) {
	const f = features(state)
	const splitTypes = new Set(level.splitTypes)
	const full = budget(state, state.turn) >= BUDGET
	let pool = moves.filter((m) => {
		if (m.type === 'split') {
			return splitTypes.has(state.types[m.piece]) && (level.splitRate >= 1 || funSplit)
		}
		if (m.type === 'merge') {
			return level.merges === true || (level.merges === 'hanging' && partAttacked(f, m.piece))
		}
		if (m.type === 'measure') {
			return level.measures === true || (level.measures === 'useful' && (full || partAttacks(f, m.piece)))
		}
		return true
	})
	if (funSplit) {
		const splits = pool.filter((m) => m.type === 'split')
		if (splits.length > 0) {
			pool = splits
		}
	}
	return pool.length > 0 ? pool : moves
}

/**
 * Pick a move from the searched values with the level's noise.
 *
 * @param {Array<{code: string, value: number, resolution: string}>} scored searched moves (best first)
 * @param {object} level level
 * @param {function(): number} rng noise RNG
 * @param {(function(string): boolean)|null} [safe] moves the non-random picks may choose (the best always may)
 * @return {object} the chosen entry
 */
export function pickMove(scored, level, rng, safe = null) {
	const all = scored.map((m) => ({ ...m, v: m.value + (m.resolution === 'rolled' ? level.rollBonus : 0) }))
	all.sort((a, b) => b.v - a.v)
	const r = rng()
	if (r < level.randomRate) {
		return all[Math.floor(rng() * all.length)]
	}
	// A level that watches its king never lets the noise pick a move that hands the opponent a king shot.
	const list = safe === null ? all : all.filter((m, i) => i === 0 || safe(m.code))
	if (r < level.randomRate + level.topHalfRate) {
		const half = list.slice(0, Math.max(1, Math.ceil(list.length / 2)))
		return half[Math.floor(rng() * half.length)]
	}
	if (list.length > 1 && r < level.randomRate + level.topHalfRate + level.secondRate) {
		return list[1]
	}
	if (level.softmaxT > 0) {
		const top = list[0].v
		const weights = list.map((m) => Math.exp((m.v - top) / level.softmaxT))
		const total = weights.reduce((a, b) => a + b, 0)
		let x = rng() * total
		for (let i = 0; i < list.length; i++) {
			x -= weights[i]
			if (x < 0) {
				return list[i]
			}
		}
		return list[list.length - 1]
	}
	const ties = list.filter((m) => m.v >= list[0].v - level.tieWindow)
	return ties.length > 1 ? ties[Math.floor(rng() * ties.length)] : list[0]
}

/**
 * Sample the remaining display delay: a total time in the level's `displayMs` range minus the time already spent.
 *
 * @param {object} level level
 * @param {function(): number} rng noise RNG
 * @param {number} elapsed ms already spent thinking
 * @return {number}
 */
function displayDelay(level, rng, elapsed) {
	const [lo, hi] = level.displayMs
	const total = lo + rng() * (hi - lo)
	return Math.max(0, Math.round(total - elapsed))
}

/**
 * The computer's move as a resumable task (a generator: it yields between search slices). Options:
 * `{level, rng?, seed?, fast?, timeMs?, nodeBudget?, deterministic?, onProgress?, now?}`. `deterministic` uses the
 * level's node budget and no clock. Result (SPEC §4.3): `{code, E, depth, nodes, candidates: [{code, E}],
 * displayMs}` — `E` is White's expected score after the move.
 *
 * @param {object} state position (game not over)
 * @param {object} options options
 * @param {{slice: function(): number}} [ctx] slicing context
 * @yields {void}
 * @return {object}
 */
export function* bestMoveTask(state, options = {}, ctx = { slice: () => Infinity }) {
	const level = levelOf(options.level ?? 1)
	const rng = noiseRng(options)
	const now = options.now || (() => performance.now())
	const start = now()
	const moves = generateMoves(state)
	if (moves.length === 0) {
		throw new Error('game_over: no legal move')
	}
	const white = state.turn === 'w'
	const toWhite = (v) => (white ? v : 1 - v)
	const finish = (code, value, extra = {}) => ({
		code,
		E: toWhite(cleanValue(value)),
		depth: extra.depth ?? 0,
		nodes: extra.nodes ?? 0,
		candidates: extra.candidates ?? [{ code, E: toWhite(cleanValue(value)) }],
		displayMs: options.fast ? 0 : displayDelay(level, rng, now() - start),
	})
	const f = features(state)
	// Every level takes a certain king capture.
	for (const m of moves) {
		if (kingShot(f, m) === 1) {
			return finish(m.code, 1)
		}
	}
	if (moves.length === 1) {
		return finish(moves[0].code, 0.5)
	}
	// Level 5: the exact solver in small positions.
	if (level.useSolver) {
		const pieces = 32 - state.captured.length
		if (pieces <= SOLVER_MAX_PIECES && state.worlds.length <= SOLVER_MAX_WORLDS) {
			for (let horizon = 1; horizon <= 2; horizon++) {
				const r = solve(state, { goal: 'forced', horizon, nodeLimit: horizon === 1 ? 10000 : 20000 })
				if (r.accepted.length > 0) {
					return finish(r.accepted[0], 1, { depth: r.plies, nodes: r.nodes })
				}
				yield
			}
		}
	}
	let pool = moves
	// Levels 1–2: always shoot at the king from the threshold up, never below it.
	if (level.kingShotMin !== null) {
		let best = null
		for (const m of moves) {
			const p = kingShot(f, m)
			if (p >= level.kingShotMin && (best === null || p > best.p)) {
				best = { m, p }
			}
		}
		if (best !== null) {
			return finish(best.m.code, best.p)
		}
		pool = pool.filter((m) => kingShot(f, m) === 0)
	}
	const funSplit = level.splitRate < 1 && rng() < level.splitRate
	pool = policyPool(state, pool.length > 0 ? pool : moves, level, funSplit)
	// Does it notice danger to its own king this time?
	const blind = level.defendRate < 1 && kingDanger(state, state.turn) > 0 && rng() >= level.defendRate
	const deterministic = Boolean(options.deterministic)
	const searcher = new Searcher(state, {
		level,
		timeMs: options.timeMs ?? (deterministic ? Infinity : Math.max(level.timeMs / 4, level.timeMs - (now() - start))),
		maxMs: deterministic ? undefined : level.maxMs,
		nodeBudget: options.nodeBudget ?? (deterministic ? level.nodeBudget : Infinity),
		rootMoves: pool.map((m) => m.code),
		splitTop: level.splitTop,
		margin: level.softmaxT > 0 ? Math.min(1, 4.6 * level.softmaxT) : level.tieWindow,
		ignoreKing: blind ? state.turn : null,
		onProgress: options.onProgress,
		now,
	})
	while (!searcher.step(ctx.slice())) {
		yield
	}
	const res = searcher.result()
	const scored = res.moves.filter((m) => m.value !== null)
	let safe = null
	if (!blind) {
		// Noticing the king: noise may not choose a move that gives the opponent a much bigger king shot.
		const risk = new Map(scored.map((m) => [m.code, moveRisk(state, m.code)]))
		const minRisk = Math.min(...risk.values())
		safe = (code) => risk.get(code) <= minRisk + KING_GUARD
	}
	const chosen = scored.length > 0 ? pickMove(scored, level, rng, safe) : { code: pool[0].code, value: 0.5 }
	return finish(chosen.code, chosen.value, {
		depth: res.depth,
		nodes: res.nodes,
		candidates: scored.slice(0, 5).map((m) => ({ code: m.code, E: m.E })),
	})
}

/**
 * The computer's move, synchronously (tests, tools). See `bestMoveTask`.
 *
 * @param {object} state position
 * @param {object} [options] options
 * @return {object}
 */
export function bestMove(state, options = {}) {
	const task = bestMoveTask(state, options)
	let r = task.next()
	while (!r.done) {
		r = task.next()
	}
	return r.value
}
