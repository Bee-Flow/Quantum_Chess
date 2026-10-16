/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The live push wrapper: each event is registered with notify_push once, its own subscribers can come and go, a failing
 * subscriber never stops the others, and `pushActive` turns true once notify_push delivers an event.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const listeners = {}
const listen = vi.fn((name, handler) => {
	listeners[name] = handler
	return true
})

vi.mock('@nextcloud/notify_push', () => ({ listen: (...args) => listen(...args) }))

beforeEach(() => {
	vi.resetModules()
	listen.mockClear()
	for (const key of Object.keys(listeners)) {
		delete listeners[key]
	}
})

describe('livePush', () => {
	it('registers the game event once and fans it out to its subscribers', async () => {
		const push = await import('../../../src/online/livePush.js')
		expect(push.pushActive.value).toBe(false)
		const a = vi.fn(() => {
			throw new Error('boom')
		})
		const b = vi.fn()
		const offA = push.onGameUpdate(a)
		push.onGameUpdate(b)
		expect(listen).toHaveBeenCalledTimes(1)
		expect(listen).toHaveBeenCalledWith('quantumchess_game', expect.any(Function))
		// the server offering push is not enough: push is active once something arrives
		expect(push.pushActive.value).toBe(false)
		listeners.quantumchess_game('quantumchess_game', { id: 4, rev: 9 })
		expect(push.pushActive.value).toBe(true)
		expect(a).toHaveBeenCalledWith({ id: 4, rev: 9 })
		expect(b).toHaveBeenCalledWith({ id: 4, rev: 9 })
		offA()
		listeners.quantumchess_game('quantumchess_game', null)
		expect(a).toHaveBeenCalledTimes(1)
		expect(b).toHaveBeenLastCalledWith(null)
	})

	it('listens to notifications separately', async () => {
		const push = await import('../../../src/online/livePush.js')
		const fn = vi.fn()
		const off = push.onNotification(fn)
		expect(listen).toHaveBeenCalledWith('notify_notification', expect.any(Function))
		listeners.notify_notification('notify_notification', undefined)
		expect(fn).toHaveBeenCalledWith(null)
		off()
		listeners.notify_notification('notify_notification', undefined)
		expect(fn).toHaveBeenCalledTimes(1)
	})

	it('stays inactive without notify_push', async () => {
		listen.mockReturnValueOnce(false)
		const push = await import('../../../src/online/livePush.js')
		push.onGameUpdate(() => {})
		expect(push.pushActive.value).toBe(false)
	})

	it('survives a notify_push that throws', async () => {
		listen.mockImplementationOnce(() => {
			throw new Error('no capabilities')
		})
		const push = await import('../../../src/online/livePush.js')
		expect(() => push.onGameUpdate(() => {})).not.toThrow()
		expect(push.pushActive.value).toBe(false)
	})
})
