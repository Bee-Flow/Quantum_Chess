/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Key moments of a review (GAME-DESIGN §5.4): the 3 largest decision errors per player and the 2 largest luck
 * swings, in game order.
 */

import { qualityOfPly } from './quality.js'

/** Errors below this many percentage points are not key moments. */
export const MIN_ERROR_PP = 5
/** Luck swings below this many percentage points are not key moments. */
export const MIN_LUCK_PP = 10

/**
 * @param {object[]} plies PlyAnalysis list
 * @return {Array<{ply: number, kind: 'error'|'luck', color: string, code: string, bestCode: string, label: string,
 *   deltaPp: number, luckPp: number}>}
 */
export function keyMoments(plies) {
	const rows = plies.map((p) => ({ p, q: qualityOfPly(p) }))
	const errors = []
	for (const color of ['w', 'b']) {
		errors.push(...rows
			.filter((r) => r.p.color === color && !r.p.forced && r.q.deltaPp >= MIN_ERROR_PP)
			.sort((a, b) => b.q.deltaPp - a.q.deltaPp)
			.slice(0, 3)
			.map((r) => ({ ply: r.p.ply, kind: 'error', color, code: r.p.code, bestCode: r.p.bestCode, label: r.q.label, deltaPp: r.q.deltaPp, luckPp: r.q.luckPp })))
	}
	const luck = rows
		.filter((r) => Math.abs(r.q.luckPp) >= MIN_LUCK_PP)
		.sort((a, b) => Math.abs(b.q.luckPp) - Math.abs(a.q.luckPp))
		.slice(0, 2)
		.map((r) => ({ ply: r.p.ply, kind: 'luck', color: r.p.color, code: r.p.code, bestCode: r.p.bestCode, label: r.q.luck ?? '', deltaPp: r.q.deltaPp, luckPp: r.q.luckPp }))
	const seen = new Set()
	return [...errors, ...luck]
		.sort((a, b) => a.ply - b.ply || (a.kind === 'error' ? -1 : 1))
		.filter((m) => {
			const k = m.ply + m.kind
			return seen.has(k) ? false : seen.add(k)
		})
}
