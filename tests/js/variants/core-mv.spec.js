/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The core hook `allowQuantum(state, action)` (handoff/research/multiverse-final.md section 7.1): a variant may forbid
 * a split, merge or measurement that the generic rules allow. Every place that lists or plays these actions follows
 * it (splits, merge candidates and merges, the merge danger, measurements), and a variant without the hook plays as
 * before.
 */

import { describe, expect, it } from 'vitest'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import {
	branches,
	isLegal,
	legalMoves,
	mergesFrom,
	royalDanger,
	splitsFrom,
} from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { stateOf } from './helpers.js'

/**
 * An orthodox test variant with an optional `allowQuantum` hook. The hook's calls are recorded in `calls`.
 *
 * @param {((state: object, action: object) => boolean)|null} allow the hook, or null for none
 * @return {object}
 */
function variant(allow) {
	const spec = orthodoxSpec()
	const extra = { id: 'test', category: 'rules', calls: [] }
	if (allow) {
		/**
		 * The hook under test, recording its calls.
		 *
		 * @param {object} state state
		 * @param {object} action action
		 * @return {boolean}
		 */
		extra.allowQuantum = (state, action) => {
			extra.calls.push(action)
			return allow(state, action)
		}
	}
	return defineVariant(Object.assign(spec, extra))
}

/**
 * The rank (0-7) of a square of the 8 × 8 board.
 *
 * @param {object} V variant
 * @param {number} sq square
 * @return {number}
 */
function rank(V, sq) {
	return V.topology.coords[sq][1]
}

/** A plain variant, and one whose splits must stay on one rank, merges start from one rank, measures on ranks 1-4. */
const PLAIN = variant(null)
const RANKED = variant((state, { type, from, to }) => {
	if (type === 'split') {
		return rank(RANKED, to[0]) === rank(RANKED, to[1])
	}
	if (type === 'merge') {
		// merges onto the d file are forbidden too
		return rank(RANKED, from[0]) === rank(RANKED, from[1]) && !(to.length && RANKED.topology.coords[to[0]][0] === 3)
	}
	return rank(RANKED, from[0]) <= 3
})

/**
 * The square with a name.
 *
 * @param {string} name square name
 * @return {number}
 */
function sq(name) {
	return PLAIN.topology.byName(name)
}

/**
 * A two-world state with one White knight (the same id) on `a` in one world and on `b` in the other, and the kings.
 *
 * @param {object} V variant
 * @param {string} a square of the first part
 * @param {string} b square of the second part
 * @param {Record<string, string>} [extra] more pieces in both worlds
 * @return {object}
 */
function ghost(V, a, b, extra = {}) {
	return stateOf(V, [
		[{ [a]: '0:n', e1: '0:k', e8: '1:k', ...extra }, 1],
		[{ [b]: '0:n', e1: '0:k', e8: '1:k', ...extra }, 1],
	], 0, (w) => {
		w.x = { ep: -1, epVictim: -1, castle: [] }
	})
}

describe('allowQuantum: splits', () => {
	it('lists and plays only the splits the variant allows, with the targets in ascending order', () => {
		const start = [[{ d4: '0:n', e1: '0:k', e8: '1:k' }, 1]]
		const all = splitsFrom(PLAIN, stateOf(PLAIN, start), sq('d4')).map((m) => m.code)
		expect(all.length).toBe(28)
		const s = stateOf(RANKED, start)
		const allowed = splitsFrom(RANKED, s, sq('d4')).map((m) => m.code)
		expect(allowed).toEqual(['d4-c2|e2', 'd4-b3|f3', 'd4-b5|f5', 'd4-c6|e6'])
		expect(isLegal(RANKED, s, 'd4-b3|b5')).toBe(false)
		expect(branches(RANKED, s, 'd4-f3|b3')).not.toBeNull()
		const call = RANKED.calls.findLast((a) => a.type === 'split')
		expect(call).toEqual({ type: 'split', from: [sq('d4')], to: [sq('b3'), sq('f3')] })
	})
})

describe('allowQuantum: merges', () => {
	it('checks the pair of parts without a target for the merge marks', () => {
		// parts on b1 and e2 (two ranks) share the target c3
		expect(mergesFrom(PLAIN, ghost(PLAIN, 'b1', 'e2'), sq('b1')).map((m) => m.code)).toEqual(['b1|e2-c3'])
		RANKED.calls.length = 0
		const s = ghost(RANKED, 'b1', 'e2')
		expect(mergesFrom(RANKED, s, sq('b1'))).toEqual([])
		expect(RANKED.calls).toContainEqual({ type: 'merge', from: [sq('b1'), sq('e2')], to: [] })
		expect(isLegal(RANKED, s, 'b1|e2-c3')).toBe(false)
		expect(legalMoves(RANKED, s).filter((m) => m.type === 'merge')).toEqual([])
	})

	it('checks each target: a forbidden target is neither listed nor legal', () => {
		// parts on b1 and f1 (one rank) share only the target d2, on the forbidden d file
		expect(isLegal(PLAIN, ghost(PLAIN, 'b1', 'f1'), 'b1|f1-d2')).toBe(true)
		const s = ghost(RANKED, 'b1', 'f1')
		expect(mergesFrom(RANKED, s, sq('b1'))).toEqual([])
		expect(branches(RANKED, s, 'b1|f1-d2')).toBeNull()
		expect(RANKED.calls).toContainEqual({ type: 'merge', from: [sq('b1'), sq('f1')], to: [sq('d2')] })
		// parts on c1 and g1 share e2 (allowed)
		expect(mergesFrom(RANKED, ghost(RANKED, 'c1', 'g1'), sq('g1')).map((m) => m.code)).toEqual(['c1|g1-e2'])
	})

	it('leaves a forbidden converging capture out of the king danger', () => {
		// a White knight 50 % b1 / 50 % f1 could merge onto d2, where the Black king stands
		const kings = { a8: '0:k', d2: '1:k' }
		const place = (a) => ({ [a]: '0:n', ...kings })
		const plain = stateOf(PLAIN, [[place('b1'), 1], [place('f1'), 1]], 1)
		expect(royalDanger(PLAIN, plain, 1)).toBe(1)
		const ranked = stateOf(RANKED, [[place('b1'), 1], [place('f1'), 1]], 1)
		expect(royalDanger(RANKED, ranked, 1)).toBe(0.5)
	})
})

describe('allowQuantum: measurements', () => {
	it('lists one measurement per allowed part; without the hook one from the first part', () => {
		expect(legalMoves(PLAIN, ghost(PLAIN, 'b1', 'g6')).filter((m) => m.type === 'measure').map((m) => m.code))
			.toEqual(['?b1'])
		const both = ghost(RANKED, 'b1', 'c3')
		expect(legalMoves(RANKED, both).filter((m) => m.type === 'measure').map((m) => m.code)).toEqual(['?b1', '?c3'])
		const one = ghost(RANKED, 'b1', 'g6')
		expect(legalMoves(RANKED, one).filter((m) => m.type === 'measure').map((m) => m.code)).toEqual(['?b1'])
		expect(isLegal(RANKED, one, '?g6')).toBe(false)
		expect(isLegal(PLAIN, ghost(PLAIN, 'b1', 'g6'), '?g6')).toBe(true)
		expect(branches(RANKED, one, '?b1').map((b) => b.key)).toEqual(['b1', 'g6'])
	})

	it('offers no measurement at all when the variant allows none of the parts', () => {
		const s = ghost(RANKED, 'b6', 'g6')
		expect(legalMoves(RANKED, s).filter((m) => m.type === 'measure')).toEqual([])
		expect(isLegal(RANKED, s, '?b6')).toBe(false)
	})
})
