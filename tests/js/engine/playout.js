/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Shared pieces of the property tests: start positions, move-choice policies and a cheap assertion.
 */

import { E, S } from './helpers.js'

export const START_POSITIONS = [
	() => E.initialState(),
	() => S('r3k2r/pppq1ppp/2n2n2/3pp3/3PP3/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 1'),
	() => S('4k3/pp3ppp/8/8/8/8/PP3PPP/4K3 w - - 0 1'),
	() => S('3qk3/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1-d4|h5', 'd8-a5|d5']),
	() => S('r3k3/1P6/8/8/8/8/6p1/4K2R w Kq - 0 1'),
	() => S('4k3/8/8/2n1b3/8/8/8/2N1K1B1 w - - 0 1'),
	() => S('7k/5ppp/8/8/8/8/5PPP/R6K w - - 0 1'),
]

/**
 * Cheap assertion for hot loops (vitest's expect is comparatively slow).
 *
 * @param {boolean} cond condition
 * @param {string} message failure text
 */
export function check(cond, message) {
	if (!cond) {
		throw new Error(message)
	}
}

/**
 * Choose a move by a policy.
 *
 * @param {object[]} moves legal moves
 * @param {function(): number} rng seeded rng
 * @param {string} policy policy name
 * @return {object}
 */
export function choose(moves, rng, policy) {
	const pick = (list) => list[Math.floor(rng() * list.length)]
	const r = rng()
	if (policy === 'quantum' && r < 0.6) {
		const q = moves.filter((m) => m.type !== 'standard' || m.resolution !== 'certain')
		if (q.length > 0) {
			return pick(q)
		}
	}
	if (policy === 'aggressive' && r < 0.7) {
		const c = moves.filter((m) => m.capture)
		if (c.length > 0) {
			return pick(c)
		}
	}
	if (policy === 'merge' && r < 0.5) {
		const c = moves.filter((m) => m.type === 'merge' || m.type === 'measure')
		if (c.length > 0) {
			return pick(c)
		}
	}
	return pick(moves)
}
