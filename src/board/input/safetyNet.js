/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The king safety net (docs/engine-rules.md §8): before a move that leaves the player's own king at risk of being
 * captured, the board asks once, when a clearly safer move exists.
 */

import { riskOf } from '../preview.js'

/** @typedef {import('../../engine/types.js').EngineState} EngineState */
/** @typedef {import('../../engine/types.js').LegalMove} LegalMove */

/** The net asks from this risk of losing the king (0…1). */
export const SAFETY_RISK = 0.1

/** … when another move lowers that risk by at least this much. */
export const SAFETY_MARGIN = 0.1

/**
 * @typedef {object} SafetyWarning
 * @property {object} move the move the player chose
 * @property {number} risk its risk (0…1) that the player's king can be captured
 * @property {{move: object, risk: number}} safer the safest legal move and its risk
 */

/**
 * Whether the safety net should ask before this move.
 *
 * @param {EngineState} state the position
 * @param {LegalMove} move the chosen move
 * @param {object[]} legalMoves every legal move of the player
 * @return {SafetyWarning|null} null when the move is safe enough or no clearly safer move exists
 */
export function safetyWarning(state, move, legalMoves) {
	const risk = riskOf(state, move)
	if (risk < SAFETY_RISK) {
		return null
	}
	let best = null
	for (const m of legalMoves) {
		const r = riskOf(state, m)
		if (best === null || r < best.risk) {
			best = { move: m, risk: r }
		}
	}
	if (best === null || best.risk > risk - SAFETY_MARGIN) {
		return null
	}
	return { move, risk, safer: best }
}
