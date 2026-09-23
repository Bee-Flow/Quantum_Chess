/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Random inputs (ENGINE-RULES §5.2, §9.1). The engine never calls Math.random.
 */

import { T } from './constants.js'
import { EngineArgumentError } from './errors.js'

/**
 * Validate an explicit roll `u` (integer, 0 ≤ u < 2^24).
 *
 * @param {unknown} u candidate
 * @return {number}
 */
export function checkU(u) {
	if (typeof u !== 'number' || !Number.isInteger(u) || u < 0 || u >= T) {
		throw new EngineArgumentError('u must be an integer with 0 ≤ u < 2^24')
	}
	return u
}

/**
 * `u = floor(r · 2^24)` for a double r from an rng (§5.2). r must be finite with 0 ≤ r < 1.
 *
 * @param {unknown} r random double
 * @return {number}
 */
export function uFromRandom(r) {
	if (typeof r !== 'number' || !Number.isFinite(r) || r < 0 || r >= 1) {
		throw new EngineArgumentError('rng must return a finite number r with 0 ≤ r < 1')
	}
	return Math.floor(r * T)
}

/**
 * A fresh CSPRNG roll: `crypto.getRandomValues(new Uint32Array(1))[0] >>> 8` (§9.1).
 *
 * @return {number}
 */
export function randomU() {
	const c = globalThis.crypto
	if (!c || typeof c.getRandomValues !== 'function') {
		throw new EngineArgumentError('no CSPRNG available: pass u, rng or outcome')
	}
	return c.getRandomValues(new Uint32Array(1))[0] >>> 8
}

/**
 * The outcome key chosen by u (§5.2): the first outcome whose cumulative weight exceeds u.
 *
 * @param {Array<{key: string, weight: number}>} outcomes outcomes in key order (sum T)
 * @param {number} u roll
 * @return {string}
 */
export function keyForU(outcomes, u) {
	let acc = 0
	for (let i = 0; i < outcomes.length; i++) {
		acc += outcomes[i].weight
		if (u < acc) {
			return outcomes[i].key
		}
	}
	return outcomes[outcomes.length - 1].key
}

/**
 * A small seeded PRNG (mulberry32) for tests, fixtures and demos. Never used for real games.
 *
 * @param {number} seed 32-bit seed
 * @return {function(): number} rng returning doubles in [0, 1)
 */
export function seededRng(seed) {
	let s = seed >>> 0
	return function() {
		s = (s + 0x6d2b79f5) >>> 0
		let z = s
		z = Math.imul(z ^ (z >>> 15), z | 1)
		z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
		return ((z ^ (z >>> 14)) >>> 0) / 4294967296
	}
}
