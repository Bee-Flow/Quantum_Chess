/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * A polling loop: one request at a time, the next one scheduled after the previous answer with an interval that the
 * caller computes from the context (visible or hidden tab), an immediate poll when the tab becomes visible or the
 * network comes back, exponential backoff on errors (×2, ±20 % jitter, capped at 120 s), `Retry-After`, and a
 * connection state for the banners.
 */

import { ref } from 'vue'

export const BACKOFF_CAP_MS = 120_000
export const BACKOFF_BASE_MS = 2_000

/**
 * @param {(options: {signal: AbortSignal}) => Promise<unknown>} fetchFn one poll; throws ApiError-like errors
 * @param {object} options options
 * @param {(ctx: {hidden: boolean}) => number|null} options.interval next delay in ms, null = wait for pollNow()
 * @param {() => void} [options.onWake] called when the tab becomes visible or the network returns, before polling
 * @param {() => number} [options.random] jitter source, 0…1 (tests)
 * @param {Document} [options.doc] document (tests)
 * @param {Window} [options.win] window (tests)
 * @return {object} {connection, failures, start(), stop(), pollNow(), running}
 */
export function usePoller(fetchFn, { interval, onWake = () => {}, random = Math.random, doc = globalThis.document, win = globalThis.window } = {}) {
	/** @type {import('vue').Ref<'ok'|'retrying'|'offline'|'maintenance'|'expired'>} */
	const connection = ref('ok')
	const failures = ref(0)
	const running = ref(false)
	let timer = null
	let started = false
	let inFlight = null
	let again = false

	const hidden = () => doc?.visibilityState === 'hidden'

	/**
	 * Schedule the next poll.
	 *
	 * @param {number|null} ms delay, null = none
	 */
	function schedule(ms) {
		clearTimeout(timer)
		timer = null
		if (started && ms !== null && ms !== undefined && Number.isFinite(ms)) {
			timer = setTimeout(tick, Math.max(0, ms))
		}
	}

	/**
	 * The delay after a failure.
	 *
	 * @param {unknown} error the error
	 * @return {number}
	 */
	function backoff(error) {
		if (Number.isFinite(error?.retryAfter) && error.retryAfter > 0) {
			return error.retryAfter * 1000
		}
		const base = Math.max(BACKOFF_BASE_MS, interval({ hidden: hidden() }) ?? BACKOFF_BASE_MS)
		const raw = Math.min(BACKOFF_CAP_MS, base * 2 ** Math.max(0, failures.value - 1))
		return Math.round(raw * (0.8 + 0.4 * random()))
	}

	/** One poll, then the next schedule. */
	async function tick() {
		if (!started) {
			return
		}
		if (inFlight) {
			again = true
			return
		}
		clearTimeout(timer)
		timer = null
		const controller = new AbortController()
		inFlight = controller
		running.value = true
		let next
		try {
			await fetchFn({ signal: controller.signal })
			failures.value = 0
			connection.value = 'ok'
			next = interval({ hidden: hidden() })
		} catch (error) {
			if (error?.name === 'AbortError') {
				return
			}
			failures.value++
			const status = error?.status ?? 0
			if (status === 401) {
				connection.value = 'expired'
				next = null
			} else {
				if (status === 503) {
					connection.value = 'maintenance'
				} else if (status === 0 && win?.navigator?.onLine === false) {
					connection.value = 'offline'
				} else if (failures.value >= 2) {
					connection.value = 'retrying'
				}
				next = backoff(error)
			}
		} finally {
			if (inFlight === controller) {
				inFlight = null
				running.value = false
			}
		}
		if (again && started) {
			again = false
			schedule(0)
		} else {
			schedule(next)
		}
	}

	/** Poll now (and restart the fast intervals, which the interval function decides). */
	function pollNow() {
		if (!started) {
			return
		}
		if (inFlight) {
			again = true
			return
		}
		schedule(0)
	}

	const onVisibility = () => {
		if (!hidden()) {
			onWake()
			pollNow()
		}
	}
	const onOnline = () => {
		onWake()
		pollNow()
	}

	/**
	 * Start polling (idempotent).
	 *
	 * @param {object} [options] {immediate: poll at once (default), delay: first delay otherwise}
	 * @param {boolean} [options.immediate] poll at once
	 */
	function start({ immediate = true } = {}) {
		if (started) {
			return
		}
		started = true
		doc?.addEventListener?.('visibilitychange', onVisibility)
		win?.addEventListener?.('online', onOnline)
		schedule(immediate ? 0 : interval({ hidden: hidden() }))
	}

	/** Stop polling and cancel the running request. */
	function stop() {
		started = false
		clearTimeout(timer)
		timer = null
		inFlight?.abort()
		inFlight = null
		running.value = false
		again = false
		doc?.removeEventListener?.('visibilitychange', onVisibility)
		win?.removeEventListener?.('online', onOnline)
	}

	return { connection, failures, running, start, stop, pollNow }
}
