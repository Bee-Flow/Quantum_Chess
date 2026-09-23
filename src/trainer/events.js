/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The only trainer entry point of other modules (SPEC §14.8.3): `reportGameEvent(event)`, fire and forget.
 * In 1.0 it completes the graduation lesson (L11) when its game is won; achievements and counters are deferred
 * (docs/LEAN-1.0.md), so every other event is ignored.
 */

import { readJson, removeKey, writeJson } from '../services/storage.js'

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
 * Report a game event.
 *
 * @param {object} event SPEC §14.8.3 event
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
	import('./progress.js').then((m) => m.recordLesson('L11', 3)).catch(() => {})
}
