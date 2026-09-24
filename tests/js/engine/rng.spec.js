/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Randomness (§5.2, §9.1): u, rng and forced outcomes, and the largest-remainder rescale (§5.3).
 *
 * Section numbers (§) and appendices refer to docs/engine-rules.md.
 */

import { describe, expect, it } from 'vitest'
import { E, S, T } from './helpers.js'

describe('rescale', () => {
	it('vector and ties to the lower index', () => {
		expect(E.rescaleWeights([8388608, 4194304])).toEqual([11184811, 5592405])
		expect(E.rescaleWeights([1, 1, 1])).toEqual([5592406, 5592405, 5592405])
		expect(E.rescaleWeights([T])).toEqual([T])
		expect(() => E.rescaleWeights([T, 1])).toThrow(RangeError)
	})

	it('random weights: exact total, never below the old weight, error below one unit', () => {
		const rng = E.seededRng(7)
		for (let i = 0; i < 3000; i++) {
			const m = 1 + Math.floor(rng() * 64)
			const w = Array.from({ length: m }, () => 1 + Math.floor(rng() * (T / m - 1)))
			const S0 = w.reduce((a, b) => a + b, 0)
			if (S0 >= T) {
				continue
			}
			const r = E.rescaleWeights(w)
			expect(r.reduce((a, b) => a + b, 0)).toBe(T)
			for (let j = 0; j < m; j++) {
				expect(r[j]).toBeGreaterThanOrEqual(w[j])
				expect(Math.abs(r[j] - w[j] * T / S0)).toBeLessThan(1)
			}
		}
	})
})

describe('randomness', () => {
	it('u, rng and outcome precedence', () => {
		const w2 = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		expect(E.applyMove(w2, 'c1-h6', { outcome: 'move', u: 16000000 }).measurement)
			.toMatchObject({ key: 'move', u: null })
		expect(E.applyMove(w2, 'c1-h6', { u: 16000000, rng: () => 0 }).measurement)
			.toMatchObject({ key: 'capture', u: 16000000 })
		expect(E.applyMove(w2, 'c1-h6', { rng: () => 0 }).measurement).toMatchObject({ key: 'move', u: 0 })
		const r = E.applyMove(w2, 'c1-h6')
		expect(r.measurement.u).toBeGreaterThanOrEqual(0)
		expect(r.measurement.u).toBeLessThan(T)
	})

	it('invalid u and rng throw argument errors, not IllegalMove', () => {
		const w2 = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		for (const u of [-1, T, 1.5, '5', NaN]) {
			expect(() => E.applyMove(w2, 'c1-h6', { u }))
				.toThrowError(expect.objectContaining({ name: 'EngineArgumentError' }))
		}
		for (const r of [1, -0.1, NaN, Infinity, '0.5']) {
			expect(() => E.applyMove(w2, 'c1-h6', { rng: () => r }))
				.toThrowError(expect.objectContaining({ name: 'EngineArgumentError' }))
		}
		expect(() => E.applyMove(w2, 'c1-h6', { rng: 5 }))
			.toThrowError(expect.objectContaining({ name: 'EngineArgumentError' }))
	})

	it('the rng is consulted exactly once per rolled move and never otherwise', () => {
		let calls = 0
		const rng = () => {
			calls++
			return 0.25
		}
		const w2 = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		E.applyMove(w2, 'c1-h6', { rng })
		expect(calls).toBe(1)
		E.applyMove(w2, 'e1-e2', { rng })
		E.applyMove(E.initialState(), 'g1-f3|h3', { rng })
		expect(calls).toBe(1)
	})

	it('keyForU uses half-open intervals', () => {
		const o = [{ key: 'miss', weight: 3 }, { key: 'capture', weight: T - 3 }]
		expect(E.keyForU(o, 0)).toBe('miss')
		expect(E.keyForU(o, 2)).toBe('miss')
		expect(E.keyForU(o, 3)).toBe('capture')
		expect(E.randomU()).toBeLessThan(T)
	})
})
