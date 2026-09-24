/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Public legality API (§4.10–§4.12): generateMoves, findMove, whyIllegal, isLegal, hasAnyLegalMove.
 *
 * PHP twin: the move methods of lib/Engine/Engine.php. Section numbers (§) refer to docs/engine-rules.md.
 */

import { analyze } from './analysis.js'
import { allRecords, someRecord } from './moveGenerator.js'
import { resolveMove } from './moveInput.js'
import { legalOf } from './moveRecord.js'

/** @typedef {import('./types.js').EngineState} EngineState */
/** @typedef {import('./types.js').LegalMove} LegalMove */

/**
 * Every legal move of the side to move in canonical order (§4.10), as LegalMove objects:
 * `{type, from, to, promo?, code, piece, resolution, measured, fallback, capture, happenWeight, outcomes,
 * successProbability}`. Returns `[]` when the game is over. The array is fresh; the move objects are shared per
 * state and must be treated as read-only.
 *
 * @param {EngineState} state valid engine state
 * @return {LegalMove[]}
 */
export function generateMoves(state) {
	const a = analyze(state)
	if (state.result !== null) {
		return []
	}
	const recs = allRecords(a)
	const out = new Array(recs.length)
	for (let i = 0; i < recs.length; i++) {
		out[i] = legalOf(recs[i])
	}
	return out
}

/**
 * The canonical codes of every legal move, in order.
 *
 * @param {EngineState} state valid engine state
 * @return {string[]}
 */
export function legalCodes(state) {
	return generateMoves(state).map((m) => m.code)
}

/**
 * The LegalMove matching a move object, LegalMove or code string (lenient parser, §4.12), or null (also on a
 * piece-letter mismatch). Measure moves match by piece.
 *
 * @param {EngineState} state valid engine state
 * @param {MoveInput} moveOrCode move input
 * @return {LegalMove|null}
 */
export function findMove(state, moveOrCode) {
	const a = analyze(state)
	if (state.result !== null) {
		return null
	}
	const r = resolveMove(a, moveOrCode)
	return r.rec === undefined ? null : legalOf(r.rec)
}

/**
 * The first failing reason code of §4.11, or null when the move is legal. Never throws for a valid state.
 *
 * @param {EngineState} state valid engine state
 * @param {unknown} input move input; anything malformed is reported as `malformed`
 * @return {string|null}
 */
export function whyIllegal(state, input) {
	const r = resolveMove(analyze(state), input)
	return r.reason === undefined ? null : r.reason
}

/**
 * `whyIllegal(state, move) === null`.
 *
 * @param {EngineState} state valid engine state
 * @param {MoveInput} move move input
 * @return {boolean}
 */
export function isLegal(state, move) {
	return whyIllegal(state, move) === null
}

/**
 * Does the side to move have at least one legal move? Stops at the first one found.
 *
 * @param {EngineState} state valid engine state
 * @return {boolean}
 */
export function hasAnyLegalMove(state) {
	const a = analyze(state)
	if (state.result !== null) {
		return false
	}
	if (a.trapped !== null) {
		return a.trapped.anyLegal
	}
	return someRecord(a, () => true)
}
