/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Shared playback of the lesson and puzzle screens: the shown position, the last-move highlight, the animation
 * handshake with the board (SPEC §14.4.2) and engine replies from the AI worker.
 */

import { t } from '@nextcloud/l10n'
import { shallowRef, toRaw } from 'vue'
import { bestMove } from '../ai/client.js'
import { findMove } from '../engine/index.js'
import { playMove } from './runner.js'

/**
 * @param {import('vue').Ref<object|null>} boardRef TrainerBoard component ref
 * @return {object} {state, lastMove, set(state), play(code, {outcome, actor, lessonRoll}), engineReply(level, outcome?)}
 */
export function usePlayback(boardRef) {
	const state = shallowRef(null)
	const lastMove = shallowRef(null)
	const names = { w: t('quantumchess', 'White'), b: t('quantumchess', 'Black') }

	/**
	 * Show a position without animation.
	 *
	 * @param {object|null} s position
	 */
	function set(s) {
		state.value = s
		lastMove.value = null
	}

	/**
	 * Apply, animate and show a move.
	 *
	 * @param {string} code move code
	 * @param {object} [options] options
	 * @param {string|null} [options.outcome] forced outcome (lesson roll), null for a real roll
	 * @param {'self'|'opponent'} [options.actor] who moves
	 * @param {boolean} [options.lessonRoll] tag the result chip
	 * @return {Promise<{before: object, after: object, move: object, measurement: object|null}>}
	 */
	async function play(code, { outcome = null, actor = 'self', lessonRoll = false } = {}) {
		const before = toRaw(state.value)
		const res = playMove(before, code, outcome)
		const mover = before.turn
		try {
			await boardRef.value?.play({
				before,
				after: res.state,
				move: res.move,
				measurement: res.measurement,
				actor,
				names: { mover: names[mover], opponent: names[mover === 'w' ? 'b' : 'w'] },
				lessonRoll: lessonRoll && res.measurement !== null,
			})
		} catch {
			// an animation failure never blocks the lesson
		}
		state.value = res.state
		lastMove.value = { move: res.move, key: res.measurement?.key ?? null }
		return { before, after: res.state, move: res.move, measurement: res.measurement }
	}

	/**
	 * Let the built-in engine reply.
	 *
	 * @param {number} level engine level 1–5
	 * @param {function(object, string): (string|null)} [outcomeFor] forced outcome key for (state, code), or null
	 * @return {Promise<object|null>} the step, or null when there is nothing to play
	 */
	async function engineReply(level, outcomeFor = null) {
		const s = toRaw(state.value)
		if (!s || s.result) {
			return null
		}
		let code
		try {
			code = (await bestMove(s, { level, fast: true }))?.code ?? null
		} catch {
			code = null
		}
		if (!code || !findMove(s, code)) {
			return null
		}
		return play(code, { outcome: outcomeFor ? outcomeFor(s, code) : null, actor: 'opponent' })
	}

	return { state, lastMove, names, set, play, engineReply }
}
