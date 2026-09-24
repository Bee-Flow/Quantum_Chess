/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Largest-remainder rescale (§5.3).
 *
 * PHP twin: `Worlds::rescale()` in lib/Engine/Internal/Worlds.php. Section numbers (§) refer to docs/engine-rules.md.
 */

import { T } from './constants.js'

/**
 * Rescale integer weights (canonical order) whose sum S is below T so that they sum to exactly T.
 * Returns a new array; the input is not modified. Ties of the remainder go to the lower index.
 *
 * @param {number[]} weights positive integers with 0 < sum ≤ T
 * @return {number[]}
 */
export function rescaleWeights(weights) {
	const m = weights.length
	let S = 0
	for (let i = 0; i < m; i++) {
		S += weights[i]
	}
	if (S === T) {
		return weights.slice()
	}
	if (!(S > 0 && S < T)) {
		throw new RangeError('rescale needs 0 < S < T')
	}
	const q = new Array(m)
	const r = new Array(m)
	let sumQ = 0
	for (let i = 0; i < m; i++) {
		const N = weights[i] * T
		let qi = Math.floor(N / S)
		let ri = N - qi * S
		// Mandatory adjustment (never fires at these magnitudes).
		while (ri < 0) {
			qi--
			ri += S
		}
		while (ri >= S) {
			qi++
			ri -= S
		}
		q[i] = qi
		r[i] = ri
		sumQ += qi
	}
	let D = T - sumQ
	if (D > 0) {
		const order = Array.from({ length: m }, (_, i) => i)
		order.sort((x, y) => (r[y] - r[x]) || (x - y))
		for (let k = 0; k < m && D > 0; k++, D--) {
			q[order[k]]++
		}
	}
	return q
}
