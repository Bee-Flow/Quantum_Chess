/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The move and roll timeline.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnimator, DURATIONS } from '../../../src/board/animator.js'
import { E, S } from './helpers.js'

const ROLL = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])

/**
 * A rolled move event.
 *
 * @param {string} outcome forced outcome key
 * @return {object}
 */
function rolled(outcome = 'capture') {
	const r = E.applyMove(ROLL, 'c1-h6', { outcome })
	return { before: ROLL, after: r.state, move: r.move, measurement: r.measurement, actor: 'self' }
}

describe('animator', () => {
	let sounds
	let described

	beforeEach(() => {
		vi.useFakeTimers()
		sounds = []
		described = []
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	const make = (speed) => createAnimator({
		speed: () => speed,
		sound: (n) => sounds.push(n),
		describe: (e) => {
			described.push(e)
			return { chip: { text: 'chip' }, reveal: { from: 1, to: 2 }, speech: 'said' }
		},
	})

	it('resolves play() at once at speed Off and still shows the chip', async () => {
		const a = make(0)
		const event = rolled()
		await a.play(event)
		expect(a.state.busy).toBe(false)
		expect(a.state.display).toBe(event.after)
		expect(a.state.chip).toEqual({ text: 'chip' })
		expect(sounds).toContain('captured')
		vi.advanceTimersByTime(DURATIONS.chipReduced + 1)
		expect(a.state.chip).toBe(null)
	})

	it('runs travel, suspense, settle and collapse for a roll', async () => {
		const a = make(1)
		const event = rolled('move')
		let done = false
		a.play(event).then(() => {
			done = true
		})
		await vi.advanceTimersByTimeAsync(10)
		expect(a.state.travel).not.toBe(null)
		expect(a.state.display).toBe(ROLL)
		await vi.advanceTimersByTimeAsync(DURATIONS.travel)
		expect(a.state.ring.settled).toBe(null)
		expect(a.state.ring.segments.map((s) => s.key)).toEqual(['move', 'capture'])
		await vi.advanceTimersByTimeAsync(DURATIONS.suspense)
		expect(a.state.ring.settled).toBe('move')
		await vi.advanceTimersByTimeAsync(DURATIONS.settle)
		expect(a.state.display).toBe(event.after)
		expect(done).toBe(false)
		await vi.advanceTimersByTimeAsync(DURATIONS.collapse)
		expect(done).toBe(true)
		expect(a.state.busy).toBe(false)
		expect(a.state.reveal).toEqual({ from: 1, to: 2 })
		expect(sounds).toEqual(['move', 'moved'])
	})

	it('fast-forwards with finish()', async () => {
		const a = make(1)
		const p = a.play(rolled())
		await vi.advanceTimersByTimeAsync(10)
		a.finish()
		await p
		expect(a.state.busy).toBe(false)
		expect(described).toHaveLength(1)
	})

	it('keeps the suspense until an online roll is resolved, and restores on failure', async () => {
		const a = make(1)
		const event = rolled()
		const handle = a.startRoll({ before: ROLL, move: event.move, actor: 'self' })
		await vi.advanceTimersByTimeAsync(DURATIONS.travel + DURATIONS.suspense + 1000)
		expect(a.state.ring.settled).toBe(null)
		await vi.advanceTimersByTimeAsync(DURATIONS.serverWait)
		expect(a.state.chip).toEqual({ waiting: true })
		await handle.fail()
		expect(a.state.busy).toBe(false)
		expect(a.state.display).toBe(null)
		expect(a.state.ring).toBe(null)
	})

	it('slides a certain move without a chip', async () => {
		const a = createAnimator({ speed: () => 1, sound: (n) => sounds.push(n) })
		const s = S('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1')
		const r = E.applyMove(s, 'g1-f3')
		const p = a.play({ before: s, after: r.state, move: r.move, measurement: null, actor: 'self' })
		expect(Object.keys(a.state.origins)).toHaveLength(1)
		await vi.advanceTimersByTimeAsync(DURATIONS.move)
		await p
		expect(a.state.chip).toBe(null)
		expect(sounds).toEqual(['move'])
	})
})
