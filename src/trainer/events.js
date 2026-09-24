/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The trainer's handling of game events, which other features report through `report.js`: the graduation lesson (L11)
 * is completed when its game against the computer is won without help.
 */

import { readJson, removeKey, writeJson } from '../services/storage.js'
import { recordLesson } from './progress.js'

/**
 * A game event reported to the trainer.
 *
 * @typedef {object} GameEvent
 * @property {'gameOver'} type what happened
 * @property {'computer'|'ai'|'local'} mode the kind of local game
 * @property {boolean} won the local user won
 * @property {boolean} assisted the user took help (hints, the coach, undo)
 * @property {string} [gameId] the local game id
 */

/** localStorage key of the local game started from lesson 11. */
export const GRADUATION_KEY = 'quantumchess.trainer.graduationGame'

let pendingId = null

/**
 * Remember the local game that counts as lesson 11.
 *
 * @param {string} id local game id
 */
export function markGraduationGame(id) {
	pendingId = id
	writeJson(GRADUATION_KEY, { id, at: Date.now() })
}

/**
 * Handle a game event: a won, unassisted game against the computer that was started from lesson 11 completes it.
 *
 * @param {GameEvent} event the event
 */
export function reportGameEvent(event) {
	if (event?.type !== 'gameOver' || !event.won || event.assisted || event.mode !== 'computer') {
		return
	}
	const id = readJson(GRADUATION_KEY, null)?.id ?? pendingId
	if (!id || (event.gameId !== undefined && event.gameId !== id)) {
		return
	}
	pendingId = null
	removeKey(GRADUATION_KEY)
	recordLesson('L11', 3)
}
