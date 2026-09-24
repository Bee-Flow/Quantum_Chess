/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * preferences.js: defaults, merge with unknown keys, effective values and the debounced save.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

const saved = []
vi.mock('../../../src/services/api.js', () => ({
	savePreferences: vi.fn(async (doc) => {
		saved.push(doc)
	}),
}))
vi.mock('@nextcloud/initial-state', () => ({
	loadState: (app, key, fallback) => (key === 'preferences' ? { sound: false, future: { x: 1 }, volume: 'loud', seenTips: 'x' } : fallback),
}))

const prefs = await import('../../../src/services/preferences.js')

afterEach(() => {
	vi.useRealTimers()
})

describe('preferences', () => {
	it('merges the stored document over the defaults and keeps unknown keys', () => {
		expect(prefs.preferences.sound).toBe(false)
		expect(prefs.preferences.future).toEqual({ x: 1 })
		expect(prefs.preferences.volume).toBe(40) // wrong type falls back
		expect(prefs.preferences.seenTips).toEqual([])
		expect(prefs.preferences.boardTheme).toBe('slate')
		expect(prefs.PREFERENCE_DEFAULTS.confirmMoves).toBeNull()
	})

	it('resolves effective values and never saves them', () => {
		expect(['never', 'rolled']).toContain(prefs.preferences.effective.confirmMoves)
		expect(['normal', 'off']).toContain(prefs.preferences.effective.animationSpeed)
		expect(prefs.preferences.effective.coachLevel).toBe('beginner')
		expect(Object.keys(prefs.preferencesDocument())).not.toContain('effective')
	})

	it('saves debounced (500 ms) with the whole document', async () => {
		vi.useFakeTimers()
		prefs.setPreference('volume', 55)
		prefs.setPreference('boardTheme', 'wood')
		prefs.markTipSeen('ghost')
		prefs.markTipSeen('ghost')
		expect(saved).toHaveLength(0)
		await vi.advanceTimersByTimeAsync(499)
		expect(saved).toHaveLength(0)
		await vi.advanceTimersByTimeAsync(2)
		expect(saved).toHaveLength(1)
		expect(saved[0]).toMatchObject({ volume: 55, boardTheme: 'wood', seenTips: ['ghost'], future: { x: 1 }, sound: false })
	})

	it('remembers new game options per mode', async () => {
		vi.useFakeTimers()
		prefs.rememberNewGame('computer', { level: 3, color: 'b' })
		prefs.rememberNewGame('local', { white: 'Ann', black: 'Ben' })
		expect(prefs.preferences.lastNewGame).toEqual({ computer: { level: 3, color: 'b' }, local: { white: 'Ann', black: 'Ben' } })
		await vi.advanceTimersByTimeAsync(600)
	})
})
