/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The move list helpers: rows per move number and the one-line game summary.
 */

import { describe, expect, it } from 'vitest'
import { gameSummary, moveRows } from '../../../src/game/moveRows.js'

describe('move list helpers', () => {
	it('groups moves into rows, also when Black moves first', () => {
		const e = (color) => ({ color, code: 'a', notation: 'a' })
		expect(moveRows([e('w'), e('b'), e('w')]).map((r) => [r.number, !!r.w, !!r.b]))
			.toEqual([[1, true, true], [2, true, false]])
		expect(moveRows([e('b'), e('w')]).map((r) => [r.number, !!r.w, !!r.b]))
			.toEqual([[1, false, true], [2, true, false]])
	})

	it('summarises a game', () => {
		const m = (code, notation, key, weight) => ({
			code,
			notation,
			measurement: key ? { key, outcomes: [{ key, weight }] } : null,
		})
		const s = gameSummary([
			m('e2-e4', 'e2-e4'),
			m('c1-h6', 'Bc1xh6 {capture 12%}', 'capture', 2097152),
			m('d4|h5-h8', 'Qd4|h5xh8 #'),
		])
		expect(s).toEqual({ moves: 2, rolls: 1, rare: 1, converging: 1 })
	})
})
