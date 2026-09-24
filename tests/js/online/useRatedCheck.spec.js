// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * useRatedCheck: asks the server when the opponent changes and explains why a rated game is not possible.
 */

import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { useRatedCheck } from '../../../src/online/composables/useRatedCheck.js'

/** Let the watcher and the awaited check settle. */
async function settle() {
	await nextTick()
	await Promise.resolve()
	await nextTick()
}

describe('useRatedCheck', () => {
	it('is null until an opponent is chosen, then follows the server', async () => {
		const opponent = ref(null)
		const checkRated = vi.fn(async (uid) => (uid === 'bob' ? { rated: true, reason: null } : { rated: false, reason: 'admin' }))
		const blocked = useRatedCheck(opponent, { rated: true, checkRated })
		expect(blocked.value).toBe(null)

		opponent.value = 'bob'
		await settle()
		expect(checkRated).toHaveBeenCalledWith('bob')
		expect(blocked.value).toBe(null)

		opponent.value = 'admin'
		await settle()
		expect(blocked.value).toBe('Rated games are not available for this pair.')

		opponent.value = null
		await settle()
		expect(blocked.value).toBe(null)
		expect(checkRated).toHaveBeenCalledTimes(2)
	})

	it('treats a refusal without a reason as blocked and a failed check as allowed', async () => {
		const opponent = ref(null)
		let answer = () => Promise.resolve({ rated: false, reason: null })
		const blocked = useRatedCheck(opponent, { rated: true, checkRated: () => answer() })
		opponent.value = 'carol'
		await settle()
		expect(blocked.value).not.toBe(null)

		answer = () => Promise.reject(new Error('offline'))
		opponent.value = 'dave'
		await settle()
		expect(blocked.value).toBe(null)
	})

	it('never asks when rated games are switched off', async () => {
		const opponent = ref(null)
		const checkRated = vi.fn()
		const blocked = useRatedCheck(opponent, { rated: false, checkRated })
		opponent.value = 'bob'
		await settle()
		expect(checkRated).not.toHaveBeenCalled()
		expect(blocked.value).toBe(null)
	})
})
