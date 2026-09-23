/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Applying a move (ENGINE-RULES §5): the A1–A9 pipeline, sampling, getOutcomes and the end checks (§6).
 */

import { analyse } from './analysis.js'
import { castlingAfter, epAfter, halfmoveAfter, typesAfter } from './bookkeeping.js'
import { FIFTY_MOVE_PLIES, MAX_PLY, REPETITION_COUNT, T } from './constants.js'
import { dangerA, trappedInfo } from './danger.js'
import { EngineArgumentError, IllegalMoveError } from './errors.js'
import { hashParts } from './hash.js'
import { legalOf, resolveMove, someRecord } from './moves.js'
import { canonicalWorlds, recordKeys, recordOutcomeBoards } from './outcomes.js'
import { rescaleWeights } from './rescale.js'
import { checkU, keyForU, randomU, uFromRandom } from './rng.js'
import { makeState } from './state.js'

/**
 * Pick the outcome of a rolled record (§5.2). Returns the key and the u used (null when forced).
 *
 * @param {object} rec rolled record
 * @param {object} opts options ({outcome}, {u} or {rng})
 * @return {{key: string, u: number|null}}
 */
function sample(rec, opts) {
	if (opts.outcome !== undefined && opts.outcome !== null) {
		if (!rec.outcomes.some((o) => o.key === opts.outcome)) {
			throw new EngineArgumentError('outcome ' + String(opts.outcome) + ' is not an outcome of ' + rec.code)
		}
		return { key: opts.outcome, u: null }
	}
	let u
	if (opts.u !== undefined && opts.u !== null) {
		u = checkU(opts.u)
	} else if (typeof opts.rng === 'function') {
		u = uFromRandom(opts.rng())
	} else if (opts.rng !== undefined && opts.rng !== null) {
		throw new EngineArgumentError('rng must be a function')
	} else {
		u = randomU()
	}
	return { key: keyForU(rec.outcomes, u), u }
}

/**
 * Steps A2–A9 for a legal record and a chosen outcome key.
 *
 * @param {object} a analysis of the state before the move
 * @param {object} rec legal record
 * @param {string} key outcome key for a rolled move, or the resolution (`certain`/`quantum`) otherwise
 * @param {boolean} trapped run E1b
 * @param {boolean} endChecks run A9 at all (false inside a setup prelude)
 * @return {{state: object, key: string, captured: number}}
 */
export function applyRecord(a, rec, key, trapped, endChecks) {
	const prev = a.state
	// A2, A3
	const o = recordOutcomeBoards(a, rec, key)
	// A4, A5
	let worlds = canonicalWorlds(o.boards, o.weights)
	// A6
	if (o.total < T) {
		const w = rescaleWeights(worlds.map((x) => x[1]))
		worlds = worlds.map((x, i) => [x[0], w[i]])
	}
	// The key that bookkeeping sees: the rolled key, or the single outcome of a certain move.
	let realised = key
	if (rec.resolution === 'certain') {
		realised = rec.outcomes.length === 1 ? rec.outcomes[0].key : 'move'
	}
	const captured = realised === 'capture' ? rec.captureId : -1
	// A7
	const types = typesAfter(prev.types, rec, realised)
	const castling = castlingAfter(prev.castling, worlds)
	const ep = epAfter(rec, realised, worlds, types)
	const halfmove = halfmoveAfter(prev.halfmove, rec, realised)
	const fullmove = prev.turn === 'b' ? prev.fullmove + 1 : prev.fullmove
	const ply = prev.ply + 1
	const turn = prev.turn === 'w' ? 'b' : 'w'
	const capturedList = captured >= 0 ? prev.captured.concat([captured]) : prev.captured.slice()
	// A8
	const h = hashParts(turn, castling, ep, types, worlds)
	const history = halfmove === 0 ? [h] : prev.history.concat([h])
	const state = makeState({
		types,
		worlds,
		turn,
		castling,
		ep,
		halfmove,
		fullmove,
		ply,
		captured: capturedList,
		history,
		result: null,
	})
	// A9
	if (endChecks) {
		state.result = endResult(state, prev.turn, captured, trapped)
	}
	return { state, key: realised, captured }
}

/**
 * The end checks E1–E6 (§6) on a new state whose result is still null.
 *
 * @param {object} state new state
 * @param {'w'|'b'} mover the side that just moved
 * @param {number} captured captured id or -1
 * @param {boolean} trapped run E1b
 * @return {object|null}
 */
function endResult(state, mover, captured, trapped) {
	const win = mover === 'w' ? '1-0' : '0-1'
	// E1
	if (captured === 0 || captured === 16) {
		return { result: win, reason: 'king_captured' }
	}
	const na = analyse(state)
	let info = null
	// E1b
	if (trapped) {
		info = trappedInfo(na)
		if (info.trapped) {
			return { result: win, reason: 'king_trapped' }
		}
	}
	// D18: E2–E4 yield to a certain king capture by the side to move.
	let pending = null
	const kingCapturePending = () => {
		if (pending === null) {
			pending = dangerA(na, mover === 'w' ? 0 : 1) === T
		}
		return pending
	}
	// E2
	if (state.captured.length === 30 && !kingCapturePending()) {
		return { result: '1/2-1/2', reason: 'bare_kings' }
	}
	// E3
	const h = state.history[state.history.length - 1]
	let count = 0
	for (let i = 0; i < state.history.length; i++) {
		if (state.history[i] === h) {
			count++
		}
	}
	if (count >= REPETITION_COUNT && !kingCapturePending()) {
		return { result: '1/2-1/2', reason: 'repetition' }
	}
	// E4
	if (state.halfmove >= FIFTY_MOVE_PLIES && !kingCapturePending()) {
		return { result: '1/2-1/2', reason: 'fifty_moves' }
	}
	// E5
	if (state.ply >= MAX_PLY) {
		return { result: '1/2-1/2', reason: 'max_ply' }
	}
	// E6
	const anyLegal = info !== null ? info.anyLegal : someRecord(na, () => true)
	if (!anyLegal) {
		return { result: '1/2-1/2', reason: 'no_moves' }
	}
	return null
}

/**
 * Resolve the input or throw IllegalMoveError (A1).
 *
 * @param {object} a analysis
 * @param {unknown} move move input
 * @return {object} record
 */
function recordOrThrow(a, move) {
	const r = resolveMove(a, move)
	if (r.reason !== undefined) {
		throw new IllegalMoveError(r.reason, move)
	}
	return r.rec
}

/**
 * Build the measurement record (§5.5) of a rolled move.
 *
 * @param {object} rec record
 * @param {string} key chosen key
 * @param {number|null} u roll used, or null when forced
 * @param {number} captured captured id or -1
 * @return {object}
 */
function measurementOf(rec, key, u, captured) {
	return {
		key,
		u,
		captured: captured >= 0 ? captured : null,
		outcomes: rec.outcomes.map((o) => ({ key: o.key, weight: o.weight })),
		fallback: rec.fallback,
	}
}

/**
 * Apply a move (§5.1). Never mutates its input.
 *
 * Options (consulted only for rolled moves, §5.2; ignored and not validated otherwise):
 * - `outcome`: force an outcome key (replays, lessons); must be a key of the move's outcomes, else throws
 *   EngineArgumentError. The record then has `u: null`.
 * - `u`: the roll, an integer 0 ≤ u < 2^24.
 * - `rng`: a function returning a double in [0, 1); u = floor(r · 2^24).
 * - default: a CSPRNG roll (§9.1).
 *
 * @param {object} state valid engine state
 * @param {object|string} move move object, LegalMove or code
 * @param {{outcome?: string, u?: number, rng?: function(): number}} [opts] options
 * @return {{state: object, move: object, measurement: object|null}}
 * @throws {IllegalMoveError} when the move is illegal (code = whyIllegal reason)
 */
export function applyMove(state, move, opts = {}) {
	const a = analyse(state)
	const rec = recordOrThrow(a, move)
	const options = opts || {}
	if (rec.resolution === 'rolled') {
		const { key, u } = sample(rec, options)
		const r = applyRecord(a, rec, key, true, true)
		return { state: r.state, move: legalOf(rec), measurement: measurementOf(rec, key, u, r.captured) }
	}
	const r = applyRecord(a, rec, rec.resolution, true, true)
	return { state: r.state, move: legalOf(rec), measurement: null }
}

/**
 * All possible results of a move (§5.6): one entry per outcome of a rolled move (key order), otherwise one entry
 * with key `certain` or `quantum` and weight T. Entry: `{key, weight, probability, happened, captured, state}`.
 *
 * @param {object} state valid engine state
 * @param {object|string} move move input
 * @return {object[]}
 * @throws {IllegalMoveError} when the move is illegal
 */
export function getOutcomes(state, move) {
	return outcomesOf(state, move, true)
}

/**
 * getOutcomes with or without E1b.
 *
 * @param {object} state valid engine state
 * @param {object|string} move move input
 * @param {boolean} trapped run E1b in the outcome states
 * @return {object[]}
 */
function outcomesOf(state, move, trapped) {
	const a = analyse(state)
	const rec = recordOrThrow(a, move)
	const keys = recordKeys(rec)
	const out = new Array(keys.length)
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i]
		const weight = rec.resolution === 'rolled' ? rec.outcomes[i].weight : T
		const r = applyRecord(a, rec, key, trapped, true)
		out[i] = {
			key,
			weight,
			probability: weight / T,
			happened: key !== 'miss',
			captured: r.captured >= 0 ? r.captured : null,
			state: r.state,
		}
	}
	return out
}

/**
 * **Search only.** Like getOutcomes, but the outcome states skip E1b (Appendix C): a search finds the forced king
 * capture one ply later anyway. States produced this way MUST NOT be stored, shown or sent to the server.
 *
 * @param {object} state valid engine state
 * @param {object|string} move move input (a LegalMove of this state is fastest)
 * @return {object[]}
 */
export function outcomesForSearch(state, move) {
	return outcomesOf(state, move, false)
}

/**
 * **Search only.** Apply a move with a forced outcome key (or the only result of a move that is not rolled),
 * skipping E1b. States produced this way MUST NOT be stored, shown or sent to the server.
 *
 * @param {object} state valid engine state
 * @param {object|string} move move input
 * @param {string|null} [key] outcome key for a rolled move (ignored otherwise)
 * @return {object} the new state
 */
export function applyForSearch(state, move, key = null) {
	const a = analyse(state)
	const rec = recordOrThrow(a, move)
	if (rec.resolution === 'rolled') {
		if (!rec.outcomes.some((o) => o.key === key)) {
			throw new EngineArgumentError('outcome ' + String(key) + ' is not an outcome of ' + rec.code)
		}
		return applyRecord(a, rec, key, false, true).state
	}
	return applyRecord(a, rec, rec.resolution, false, true).state
}
