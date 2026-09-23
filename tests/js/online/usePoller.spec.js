/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * usePoller (SPEC §14.4.5, GAME-DESIGN §7.10): intervals from the caller, one request at a time, backoff ×2 with
 * jitter and a cap, Retry-After, the connection states, and an immediate poll when the tab becomes visible.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BACKOFF_CAP_MS, usePoller } from '../../../src/online/usePoller.js'

/**
 * A fake document/window pair with visibility and online events.
 *
 * @return {object}
 */
function fakeEnv() {
	const listeners = {}
	const target = {
		visibilityState: 'visible',
		navigator: { onLine: true },
		addEventListener: (type, fn) => {
			listeners[type] = fn
		},
		removeEventListener: (type) => {
			delete listeners[type]
		},
		fire: (type) => listeners[type]?.(),
		listeners,
	}
	return target
}

beforeEach(() => {
	vi.useFakeTimers()
})
afterEach(() => {
	vi.useRealTimers()
})

describe('usePoller', () => {
	it('polls at the interval the caller computes, with the hidden flag', async () => {
		const env = fakeEnv()
		const fetchFn = vi.fn(async () => {})
		const interval = vi.fn(({ hidden }) => (hidden ? 60000 : 2000))
		const p = usePoller(fetchFn, { interval, doc: env, win: env })
		p.start()
		await vi.advanceTimersByTimeAsync(0)
		expect(fetchFn).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(2000)
		expect(fetchFn).toHaveBeenCalledTimes(2)
		env.visibilityState = 'hidden'
		await vi.advanceTimersByTimeAsync(2000)
		expect(fetchFn).toHaveBeenCalledTimes(3)
		await vi.advanceTimersByTimeAsync(59000)
		expect(fetchFn).toHaveBeenCalledTimes(3)
		// becoming visible polls at once and calls onWake
		env.visibilityState = 'visible'
		env.fire('visibilitychange')
		await vi.advanceTimersByTimeAsync(0)
		expect(fetchFn).toHaveBeenCalledTimes(4)
		p.stop()
		expect(env.listeners.visibilitychange).toBeUndefined()
		await vi.advanceTimersByTimeAsync(120000)
		expect(fetchFn).toHaveBeenCalledTimes(4)
	})

	it('backs off ×2 with ±20 % jitter up to 120 s and shows the banner after two failures', async () => {
		const env = fakeEnv()
		const times = []
		const fetchFn = vi.fn(async () => {
			times.push(Date.now())
			throw Object.assign(new Error('down'), { status: 502 })
		})
		const p = usePoller(fetchFn, { interval: () => 2000, random: () => 0.5, doc: env, win: env })
		p.start()
		await vi.advanceTimersByTimeAsync(0)
		expect(p.failures.value).toBe(1)
		expect(p.connection.value).toBe('ok')
		await vi.advanceTimersByTimeAsync(1999)
		expect(fetchFn).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(1)
		expect(fetchFn).toHaveBeenCalledTimes(2)
		expect(p.connection.value).toBe('retrying')
		// next delay 4 s, then 8 s …
		await vi.advanceTimersByTimeAsync(4000)
		expect(fetchFn).toHaveBeenCalledTimes(3)
		await vi.advanceTimersByTimeAsync(8000)
		expect(fetchFn).toHaveBeenCalledTimes(4)
		for (let i = 0; i < 10; i++) {
			await vi.advanceTimersByTimeAsync(BACKOFF_CAP_MS)
		}
		const gaps = times.slice(1).map((t, i) => t - times[i])
		expect(gaps.slice(0, 5)).toEqual([2000, 4000, 8000, 16000, 32000])
		expect(gaps[gaps.length - 1]).toBe(BACKOFF_CAP_MS)
		p.stop()
	})

	it('applies the jitter range', async () => {
		const env = fakeEnv()
		let n = 0
		const fetchFn = vi.fn(async () => {
			n++
			throw Object.assign(new Error('x'), { status: 500 })
		})
		const p = usePoller(fetchFn, { interval: () => 2000, random: () => 0, doc: env, win: env })
		p.start()
		await vi.advanceTimersByTimeAsync(0)
		// first failure: base 2000 × 0.8
		await vi.advanceTimersByTimeAsync(1599)
		expect(n).toBe(1)
		await vi.advanceTimersByTimeAsync(1)
		expect(n).toBe(2)
		p.stop()
	})

	it('honours Retry-After and recovers', async () => {
		const env = fakeEnv()
		let fail = true
		const fetchFn = vi.fn(async () => {
			if (fail) {
				fail = false
				throw Object.assign(new Error('slow down'), { status: 429, retryAfter: 30 })
			}
		})
		const p = usePoller(fetchFn, { interval: () => 2000, doc: env, win: env })
		p.start()
		await vi.advanceTimersByTimeAsync(0)
		await vi.advanceTimersByTimeAsync(29999)
		expect(fetchFn).toHaveBeenCalledTimes(1)
		await vi.advanceTimersByTimeAsync(1)
		expect(fetchFn).toHaveBeenCalledTimes(2)
		expect(p.failures.value).toBe(0)
		expect(p.connection.value).toBe('ok')
		p.stop()
	})

	it('reports maintenance and an expired session (which stops polling)', async () => {
		const env = fakeEnv()
		const errors = [{ status: 503 }, { status: 401 }]
		const fetchFn = vi.fn(async () => {
			throw Object.assign(new Error('e'), errors.shift())
		})
		const p = usePoller(fetchFn, { interval: () => 2000, random: () => 0.5, doc: env, win: env })
		p.start()
		await vi.advanceTimersByTimeAsync(0)
		expect(p.connection.value).toBe('maintenance')
		await vi.advanceTimersByTimeAsync(2000)
		expect(p.connection.value).toBe('expired')
		await vi.advanceTimersByTimeAsync(300000)
		expect(fetchFn).toHaveBeenCalledTimes(2)
		p.stop()
	})

	it('never runs two requests at once; pollNow during a request polls right after it', async () => {
		const env = fakeEnv()
		let release
		const fetchFn = vi.fn(() => new Promise((resolve) => {
			release = resolve
		}))
		const p = usePoller(fetchFn, { interval: () => 30000, doc: env, win: env })
		p.start()
		await vi.advanceTimersByTimeAsync(0)
		p.pollNow()
		p.pollNow()
		await vi.advanceTimersByTimeAsync(0)
		expect(fetchFn).toHaveBeenCalledTimes(1)
		release()
		await vi.advanceTimersByTimeAsync(0)
		expect(fetchFn).toHaveBeenCalledTimes(2)
		release()
		p.stop()
	})
})
