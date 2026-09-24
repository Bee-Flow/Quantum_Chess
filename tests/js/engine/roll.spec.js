/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Display percentages and the roll display (§8, §9.4).
 *
 * Section numbers (§) and appendices refer to docs/engine-rules.md.
 */

import { describe, expect, it } from 'vitest'
import { E, T } from './helpers.js'

describe('pct and roll display', () => {
	it('pct never shows an uncertain event as 0% or 100%', () => {
		expect([0, 1, T / 200, T / 2, T - 1, T].map(E.pct)).toEqual([0, 1, 1, 50, 99, 100])
		expect(E.pct(Math.floor(T * 0.125))).toBe(13)
		expect(E.pct(Math.floor(T * 0.745))).toBe(74)
	})

	it('forced outcomes, Measures and translated labels', () => {
		expect(E.rollDisplay({ key: 'capture', u: null, outcomes: [{ key: 'move', weight: T / 2 }, { key: 'capture', weight: T / 2 }] }))
			.toBe('Moved [0.0000, 0.5000) · Captured [0.5000, 1.0000) · forced → Captured')
		expect(E.rollDisplay({ key: 'c4', u: 9000000, outcomes: [{ key: 'a4', weight: T / 2 }, { key: 'c4', weight: T / 2 }] }))
			.toBe('a4 [0.0000, 0.5000) · c4 [0.5000, 1.0000) · rolled 0.5364 → c4')
		expect(E.rollDisplay({ key: 'move', u: 1, outcomes: [{ key: 'miss', weight: 1 }, { key: 'move', weight: T - 1 }] }, { miss: 'Gemist', move: 'Gezet', rolled: 'geworpen' }))
			.toBe('Gemist [0.00000000, 0.00000005) · Gezet [0.00000005, 1.00000000) · geworpen 0.00000005 → Gezet')
		const i = E.rollIntervals({ key: 'move', u: 6227703, outcomes: [{ key: 'move', weight: T / 2 }, { key: 'capture', weight: T / 2 }] })
		expect(i.decimals).toBe(4)
		expect(i.intervals[0]).toEqual({ key: 'move', start: 0, end: T / 2, startText: '0.0000', endText: '0.5000', chosen: true })
		expect(E.decimalOfWeight(8388607, 4)).toBe('0.4999')
		expect(E.decimalOfWeight(T, 8)).toBe('1.00000000')
	})
})
