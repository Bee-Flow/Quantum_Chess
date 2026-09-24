// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * storage.js: every key belongs to the logged-in user, so an expired session followed by another login on the same
 * browser never shows (or syncs) the previous account's trainer progress, local games or caches.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { readJson, removeKey, userKey, writeJson } from '../../../src/services/storage.js'

const user = {
	set current(value) {
		if (value) {
			document.head.setAttribute('data-user', value.uid)
		} else {
			document.head.removeAttribute('data-user')
		}
	},
}

beforeEach(() => {
	localStorage.clear()
	user.current = null
})

describe('user-scoped storage', () => {
	it('prefixes the keys with the user id', () => {
		expect(userKey('quantumchess.trainer.v1')).toBe('quantumchess.trainer.v1')
		user.current = { uid: 'bob' }
		expect(userKey('quantumchess.trainer.v1')).toBe('quantumchess/bob/trainer.v1')
		expect(userKey('quantumchess.localGame.v1.lg_1')).toBe('quantumchess/bob/localGame.v1.lg_1')
		user.current = { uid: 'a.b@example.com' }
		expect(userKey('quantumchess.trainer.v1')).toBe('quantumchess/a.b@example.com/trainer.v1')
	})

	it('keeps one account from reading another account\'s data', () => {
		user.current = { uid: 'bob' }
		writeJson('quantumchess.trainer.v1', { lessons: { L01: { done: true } } })
		expect(readJson('quantumchess.trainer.v1', {})).toEqual({ lessons: { L01: { done: true } } })
		expect(localStorage.getItem('quantumchess.trainer.v1')).toBeNull()

		user.current = { uid: 'carol' }
		expect(readJson('quantumchess.trainer.v1', {})).toEqual({})
		writeJson('quantumchess.trainer.v1', { lessons: {} })
		removeKey('quantumchess.trainer.v1')

		user.current = { uid: 'bob' }
		expect(readJson('quantumchess.trainer.v1', {})).toEqual({ lessons: { L01: { done: true } } })
	})
})
