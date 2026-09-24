/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The synchronous SHA-256 of the game record chain.
 */

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { E } from './helpers.js'

describe('sha256hex (pure JS, synchronous)', () => {
	it('FIPS 180-4 vectors', () => {
		expect(E.sha256hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
		expect(E.sha256hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
		expect(E.sha256hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
			.toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
		expect(E.sha256hex('a'.repeat(1000000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0')
	})

	it('agrees with node:crypto on UTF-8 and every length around the block size', () => {
		const texts = ['ü', '日本語', '😀 emoji', 'useré|42']
		for (let n = 0; n < 140; n++) {
			texts.push('x'.repeat(n))
		}
		for (const t of texts) {
			expect(E.sha256hex(t)).toBe(createHash('sha256').update(t, 'utf8').digest('hex'))
		}
	})
})
