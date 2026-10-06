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

import { positionHash } from '../variants/index.js'

export { positionHash }

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
