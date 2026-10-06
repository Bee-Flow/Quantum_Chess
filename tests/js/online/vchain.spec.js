/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The hash chain of online variant games: it matches the shared fixture (which the PHP twin checks too), its options
 * are canonical, and it refuses values that would not print as plain decimals.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { canonicalOptions, vchainNext, vchainStart } from '../../../src/online/vchain.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = JSON.parse(readFileSync(join(HERE, '../../fixtures/online-variants.json'), 'utf8'))

describe('variant chain', () => {
	it.each(FIXTURE.chains.map((c) => [c.variant + ' ' + c.gameId, c]))('matches the fixture for %s', (_, c) => {
		let chain = vchainStart(c.gameId, c.variant, c.options, c.seats, c.createdAt)
		expect(chain).toBe(c.start)
		for (const m of c.moves) {
			chain = vchainNext(chain, m.ply, m.seat, m.code, m.u)
			expect(chain).toBe(m.chain)
		}
	})

	it('writes options with sorted keys, whatever their order', () => {
		expect(canonicalOptions({ timelines: '3', reach: '1', a: true, n: 518 }))
			.toBe('{"a":true,"n":518,"reach":"1","timelines":"3"}')
		expect(canonicalOptions({})).toBe('{}')
		expect(vchainStart(1, 'x', { b: 1, a: 2 }, ['u'], 0)).toBe(vchainStart(1, 'x', { a: 2, b: 1 }, ['u'], 0))
	})

	it('depends on every seat and on the roll', () => {
		const a = vchainStart(1, 'bughouse', {}, ['a', 'b', 'c', 'd'], 5)
		expect(vchainStart(1, 'bughouse', {}, ['a', 'b', 'd', 'c'], 5)).not.toBe(a)
		expect(vchainNext(a, 0, 0, 'e2-e4', 1)).not.toBe(vchainNext(a, 0, 0, 'e2-e4', 2))
	})

	it('refuses values that are not plain', () => {
		expect(() => canonicalOptions({ x: 1.5 })).toThrow(TypeError)
		expect(() => canonicalOptions({ x: null })).toThrow(TypeError)
		expect(() => vchainStart(-1, 'atomic', {}, [], 0)).toThrow(TypeError)
		expect(() => vchainNext('c', 0, 0, 'e2-e4', 0.5)).toThrow(TypeError)
	})
})
