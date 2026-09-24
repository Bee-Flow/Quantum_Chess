/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The replay of a finished game for the review: states, steps and names from a local record or an online game DTO,
 * replayed with the recorded rolls (`u`, or the outcome key when a move has no `u`).
 */

import { t } from '@nextcloud/l10n'
import { applyMove, initialState } from '../engine/index.js'
import { localPlayerName } from '../game/localPlayers.js'
import { currentUser } from '../services/initialState.js'

/**
 * Replay a finished game.
 *
 * @param {object} input `{source, id, local}` or `{source, id, online}`
 * @param {string} input.source local | online
 * @param {string} input.id game id
 * @param {object} [input.local] local game record
 * @param {object} [input.online] online game DTO
 * @return {{source: string, id: string, startState: object|null,
 *   moves: Array<{code: string, u: number|null, outcome?: string}>, states: object[], steps: object[],
 *   names: {w: string, b: string}, viewer: 'w'|'b'|null, result: object|null}}
 *   (`viewer` is null for pass & play, where both sides are the same person)
 */
export function reviewGame({ source, id, local, online }) {
	let startState
	let moves
	let names
	let viewer
	let result
	if (local) {
		startState = local.startState ?? null
		moves = local.moves.map((m) => (Number.isInteger(m.u)
			? { code: m.code, u: m.u }
			: { code: m.code, u: null, ...(m.key ? { outcome: m.key } : {}) }))
		names = { w: localPlayerName(local, 'w'), b: localPlayerName(local, 'b') }
		viewer = local.humanColor ?? null
		result = local.result ?? null
	} else {
		startState = online.startState ?? null
		moves = online.moves.map((m) => {
			const u = m.measurement?.u
			return Number.isInteger(u)
				? { code: m.code, u }
				: { code: m.code, u: null, ...(m.measurement?.key ? { outcome: m.measurement.key } : {}) }
		})
		names = {
			w: online.white?.displayName ?? t('quantumchess', 'White'),
			b: online.black?.displayName ?? t('quantumchess', 'Black'),
		}
		viewer = online.black?.userId && online.black.userId === currentUser.uid ? 'b' : 'w'
		result = online.result ? { result: online.result, reason: online.resultReason ?? null } : null
	}
	const states = [startState ?? initialState()]
	const steps = []
	for (const m of moves) {
		const before = states[states.length - 1]
		const res = applyMove(
			before,
			m.code,
			Number.isInteger(m.u) ? { u: m.u } : (m.outcome ? { outcome: m.outcome } : {}),
		)
		steps.push({ before, after: res.state, move: res.move, measurement: res.measurement })
		states.push(res.state)
	}
	const last = states[states.length - 1]
	return { source, id, startState, moves, states, steps, names, viewer, result: result ?? last.result ?? null }
}
