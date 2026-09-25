/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The roll memo of a variant game on this device (docs/rules.md section 8): the random number of a move is drawn the
 * first time that move is played in a position and stored under the move's roll key, so undo never rerolls a result
 * the player has already seen. The key is `ply:positionHash:code`, like the roll identity of classic local games
 * (docs/engine-rules.md 9.3):
 *
 * - the position hash covers the side to move and every world with its weight, so the same move at the same ply in a
 *   different position (an undo followed by another earlier move) gets a new roll;
 * - the code loses a trailing promotion suffix (`e7-e8=q` and `e7-e8=n` share their roll: the promotion keys of one
 *   move have the same outcomes).
 *
 * Games saved with the older keys (`ply:code`) keep working: their keys are simply never found again.
 */

import { fnv1a64 } from '../engine/index.js'

/** The square index of a piece in hand (`HAND` of src/variants/core/world.js). */
const HAND = -2

/**
 * The text of a world, the same as `worldKey` of src/variants/core/world.js (two worlds with the same text are the
 * same position): the board with side, type and id per square, the hands by side and type, and the world's extra
 * data. The web app reads the variants only through src/variants/index.js, which does not export `worldKey`.
 *
 * @param {object} b world
 * @return {string}
 */
function worldText(b) {
	const hands = []
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sq[id] === HAND) {
			hands.push(b.sd[id] + b.ty[id])
		}
	}
	hands.sort()
	const board = b.board.map((id) => (id < 0 ? '.' : b.sd[id] + b.ty[id] + id)).join(',')
	return board + '|' + hands.join('') + '|' + JSON.stringify(b.x)
}

/**
 * A hash of a position: the side to move and every world as its text and weight, in the stored order (16 hex digits,
 * FNV-1a-64).
 *
 * @param {object} state state
 * @return {string}
 */
export function positionHash(state) {
	const parts = [String(state.turn)]
	for (const { b, w } of state.worlds) {
		parts.push(worldText(b) + '@' + w)
	}
	return fnv1a64(parts.join(';'))
}

/**
 * The memo key of a move's roll: the ply, the position hash and the code without a trailing promotion suffix.
 *
 * @param {object} state the state before the move
 * @param {string} code move code
 * @return {string}
 */
export function rollMemoKey(state, code) {
	return state.ply + ':' + positionHash(state) + ':' + code.replace(/=[^-|?@=\s]+$/, '')
}
