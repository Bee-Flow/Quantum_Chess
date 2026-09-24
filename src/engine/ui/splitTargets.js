/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * splitTargets: every geometric split target of a piece with its `whyIllegal` code, so the board can draw enabled
 * and disabled split markers with the same codes the rules use.
 */

import { analyze } from '../analysis.js'
import { ILLEGAL_REASON_CHECK } from '../constants.js'
import { TARGETS, TYPE_B, TYPE_N, TYPE_Q, TYPE_R } from '../geometry.js'
import { resolveMove } from '../moveInput.js'
import { legalOf } from '../moveRecord.js'
import { SQUARE_NAMES } from '../squares.js'

/**
 * Split targets of the piece on `from`.
 *
 * Returns `{from, piece, reason, targets, pairs}`:
 * - `reason` is set (and the lists are empty) when the piece cannot split at all: `game_over`, `no_piece`,
 *   `not_your_piece` or `cannot_split`.
 * - `targets`: every square the piece reaches geometrically from `from`, ascending:
 *   `{square, legal, reason, partners}`. `partners` are the squares that make a legal split together with it. For
 *   a target without partners, `reason` is `split_target_occupied` when the square itself may hold a piece, and
 *   otherwise the most frequent reason of its pairs (ties: the later check of docs/engine-rules.md §4.11).
 * - `pairs`: every geometric pair `{to: [t1, t2], code, reason, move}` (move is the LegalMove when legal).
 *
 * @param {object} state valid engine state
 * @param {number} from square of (a part of) the piece
 * @return {{from: number, piece: number|null, reason: string|null, targets: object[], pairs: object[]}}
 */
export function splitTargets(state, from) {
	const a = analyze(state)
	const X = a.occ[from]
	const out = { from, piece: X >= 0 ? X : null, reason: null, targets: [], pairs: [] }
	if (state.result !== null) {
		out.reason = 'game_over'
		return out
	}
	if (X < 0) {
		out.reason = 'no_piece'
		return out
	}
	if ((X < 16) !== (a.ci === 0)) {
		out.reason = 'not_your_piece'
		return out
	}
	const type = a.typeCodes[X]
	if (type !== TYPE_Q && type !== TYPE_R && type !== TYPE_B && type !== TYPE_N) {
		out.reason = 'cannot_split'
		return out
	}
	const geo = TARGETS[type][from]
	const byTarget = new Map(geo.map((t) => [t, { partners: [], reasons: new Map() }]))
	for (let i = 0; i < geo.length; i++) {
		for (let j = i + 1; j < geo.length; j++) {
			const t1 = geo[i]
			const t2 = geo[j]
			const r = resolveMove(a, { type: 'split', from: [from], to: [t1, t2] })
			const reason = r.reason ?? null
			out.pairs.push({
				to: [t1, t2],
				code: SQUARE_NAMES[from] + '-' + SQUARE_NAMES[t1] + '|' + SQUARE_NAMES[t2],
				reason,
				move: reason === null ? legalOf(r.rec) : null,
			})
			for (const [t, other] of [[t1, t2], [t2, t1]]) {
				const e = byTarget.get(t)
				if (reason === null) {
					e.partners.push(other)
				} else {
					e.reasons.set(reason, (e.reasons.get(reason) ?? 0) + 1)
				}
			}
		}
	}
	for (const t of geo) {
		const e = byTarget.get(t)
		let reason = null
		if (e.partners.length === 0) {
			if (a.occ[t] >= 0) {
				reason = 'split_target_occupied'
			} else {
				const counts = [...e.reasons]
				const other = counts.filter(([k]) => k !== 'split_target_occupied')
				const pool = other.length > 0 ? other : counts
				pool.sort((x, y) => y[1] - x[1] || ILLEGAL_REASON_CHECK[y[0]] - ILLEGAL_REASON_CHECK[x[0]])
				reason = pool.length > 0 ? pool[0][0] : 'split_target_occupied'
			}
		}
		out.targets.push({ square: t, legal: e.partners.length > 0, reason, partners: e.partners.sort((x, y) => x - y) })
	}
	return out
}
