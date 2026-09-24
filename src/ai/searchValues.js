/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Values shared by the search and its clients: the value of a finished game, the rounding of decided values, and what
 * a LegalMove captures and with which probability.
 *
 * Values are expected scores in [0, 1] for the side to move (win 1, draw ½, loss 0).
 */

import { T } from '../engine/index.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */
/** @typedef {import('../engine/types.js').LegalMove} LegalMove */

/** @typedef {import('./features.js').Features} Features */

/** Values closer than this to 0 or 1 are reported as exactly 0 or 1 (a won or lost game). */
const WIN_EPSILON = 1e-4

/** Per-ply discount of won/lost values, so that faster wins (and slower losses) are preferred. */
export const PLY_DISCOUNT = 1e-6

/**
 * The value of a finished game for the side to move in it.
 *
 * @param {EngineState} state state with a result
 * @param {number} ply distance from the root (for the win discount)
 * @return {number}
 */
export function terminalValue(state, ply) {
	const r = state.result.result
	if (r === '1/2-1/2') {
		return 0.5
	}
	const whiteWon = r === '1-0'
	const moverWon = (state.turn === 'w') === whiteWon
	return moverWon ? 1 - ply * PLY_DISCOUNT : ply * PLY_DISCOUNT
}

/**
 * Round a value to exactly 0 or 1 when it means a decided game.
 *
 * @param {number} v value
 * @return {number}
 */
export function cleanValue(v) {
	if (v >= 1 - WIN_EPSILON) {
		return 1
	}
	if (v <= WIN_EPSILON) {
		return 0
	}
	return v
}

/**
 * The capture weight of a LegalMove (0 when it cannot capture).
 *
 * @param {LegalMove} m LegalMove
 * @return {number}
 */
export function captureWeight(m) {
	if (!m.capture) {
		return 0
	}
	if (m.resolution !== 'rolled') {
		return T
	}
	for (let i = 0; i < m.outcomes.length; i++) {
		if (m.outcomes[i].key === 'capture') {
			return m.outcomes[i].weight
		}
	}
	return 0
}

/**
 * The piece a capturing LegalMove would take (id), or −1.
 *
 * @param {Features} feat features of the state before the move
 * @param {LegalMove} m LegalMove
 * @return {number}
 */
export function victimOf(feat, m) {
	if (!m.capture || m.type === 'measure' || m.type === 'split') {
		return -1
	}
	const t = m.to[0]
	const id = feat.occ[t]
	if (id >= 0 && (id < 16) !== (m.piece < 16)) {
		return id
	}
	// En passant: the pawn behind the target square.
	const behind = m.piece < 16 ? t - 8 : t + 8
	const ep = feat.occ[behind]
	return ep >= 0 ? ep : -1
}

/**
 * The outcome keys of a LegalMove, as `applyForSearch` expects them: `[{key, weight}]` (one entry with key null
 * for a move that is not rolled).
 *
 * @param {LegalMove} m LegalMove
 * @return {Array<{key: string|null, weight: number}>}
 */
export function outcomeList(m) {
	if (m.resolution !== 'rolled') {
		return [{ key: null, weight: T }]
	}
	return m.outcomes
}
