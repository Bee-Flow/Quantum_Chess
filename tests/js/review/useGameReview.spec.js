// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * useGameReview: the reasons a game cannot be reviewed, stepping through a replayed local game, and the analysis that
 * runs once and then comes from the cache.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameReview } from '../../../src/review/composables/useGameReview.js'

vi.mock('../../../src/ai/client.js', () => ({ analyzeGame: vi.fn(), ENGINE_VERSION: 'test' }))
vi.mock('../../../src/services/api.js', () => ({ getGame: vi.fn(), saveTrainerProgress: vi.fn(async (doc) => doc), getTrainerProgress: vi.fn(async () => ({})) }))

const RECORD = {
	id: 'lg_review',
	mode: 'local',
	humanColor: null,
	players: { w: { kind: 'local', name: 'Ann' }, b: { kind: 'local', name: 'Ben' } },
	startState: null,
	moves: [{ code: 'g1-f3|h3', u: null }, { code: 'e7-e5', u: null }],
	result: { result: '0-1', reason: 'resignation' },
}

/**
 * An analysis of each move of RECORD.
 *
 * @return {object[]}
 */
function plies() {
	return RECORD.moves.map((m, i) => ({ ply: i, color: i % 2 ? 'b' : 'w', code: m.code, bestCode: m.code, EBefore: 0.5, bestE: 0.5, playedE: 0.5, realisedE: 0.5, outcomes: null }))
}

beforeEach(() => {
	localStorage.clear()
})

describe('useGameReview', () => {
	it('explains why a game cannot be reviewed', async () => {
		const missing = useGameReview({ source: 'local', id: 'lg_missing' }, { loadLocalGame: () => null })
		await missing.start()
		expect(missing.error.value).toBe('This game is not on this device any more.')

		const running = useGameReview({ source: 'online', id: 'g1' }, { getGame: async () => ({ status: 'active' }) })
		await running.start()
		expect(running.error.value).toBe('Available after the game.')

		const broken = useGameReview({ source: 'online', id: 'g2' }, { getGame: async () => Promise.reject(new Error('404')) })
		await broken.start()
		expect(broken.error.value).toBe('The game could not be loaded.')
	})

	it('replays a local game, steps through it and analyses it once', async () => {
		const analyzeGame = vi.fn(async (record, { onProgress }) => {
			const list = plies()
			list.forEach(onProgress)
			return { plies: list }
		})
		const r = useGameReview({ source: 'local', id: RECORD.id }, { loadLocalGame: () => RECORD, analyzeGame })
		await r.start()
		expect(r.error.value).toBeNull()
		expect(r.ply.value).toBe(2)
		expect(r.entries.value.map((e) => e.code)).toEqual(['g1-f3|h3', 'e7-e5'])
		expect(r.resultLine.value).toContain(' · ')
		await vi.waitFor(() => expect(r.analysing.value).toBe(false))
		expect(analyzeGame).toHaveBeenCalledWith({ startState: null, moves: RECORD.moves }, expect.objectContaining({ msPerPly: 400, level: 4 }))
		expect(r.plies.value).toHaveLength(2)

		r.go(99)
		expect(r.ply.value).toBe(2)
		r.go(1)
		expect(r.lastMove.value.move.code).toBe('g1-f3|h3')
		r.chipMove({ code: 'e7-e5' })
		expect(r.arrows.value).toEqual([expect.objectContaining({ kind: 'best' })])
		r.go(0)
		expect(r.arrows.value).toEqual([])
		expect(r.lastMove.value).toBeNull()

		const again = useGameReview({ source: 'local', id: RECORD.id }, { loadLocalGame: () => RECORD, analyzeGame })
		await again.start()
		expect(again.plies.value).toHaveLength(2)
		expect(analyzeGame).toHaveBeenCalledTimes(1)
	})
})
