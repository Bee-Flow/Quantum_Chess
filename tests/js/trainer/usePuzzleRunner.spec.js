/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The puzzle runner: grading against the accepted moves, the trap text and the punishing reply after a wrong move,
 * Try again, the two hint tiers, the stars, and a restart when the route names another puzzle.
 */

import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { usePlayback } from '../../../src/trainer/composables/usePlayback.js'
import { usePuzzleRunner } from '../../../src/trainer/composables/usePuzzleRunner.js'

vi.mock('../../../src/services/api.js', () => ({
	getTrainerProgress: vi.fn(async () => ({})),
	saveTrainerProgress: vi.fn(async (doc) => doc),
}))

/**
 * A runner for a puzzle, on a playback without a board whose computer reply is stubbed.
 *
 * @param {string} id puzzle id
 * @return {object}
 */
function runner(id) {
	const puzzleId = ref(id)
	const playback = usePlayback(ref(null))
	playback.engineReply = vi.fn(async () => null)
	const r = usePuzzleRunner({ puzzleId: () => puzzleId.value, playback })
	return { r, puzzleId, playback }
}

/**
 * The legal move with this code.
 *
 * @param {object} r runner
 * @param {string} code move code
 * @return {object}
 */
const legal = (r, code) => r.legalMoves.value.find((m) => m.code === code)

describe('usePuzzleRunner', () => {
	it('sets up the puzzle in the route', () => {
		const { r } = runner('p01')
		expect(r.puzzle.value.id).toBe('P01')
		expect(r.number.value).toBe(1)
		expect(r.next.value.id).toBe('P02')
		expect(r.goalText.value).toBe('Win with certainty.')
		expect(r.phase.value).toBe('ready')
		expect(legal(r, 'b2-h8')).toBeDefined()
	})

	it('accepts the solution with three stars', async () => {
		const { r, playback } = runner('P01')
		await r.onMove(legal(r, 'b2-h8'))
		expect(r.phase.value).toBe('solved')
		expect(r.message.value.type).toBe('success')
		expect(r.message.value.text).toMatch(/^Solved! /)
		expect(r.earned.value).toBe(3)
		expect(r.legalMoves.value).toEqual([])
		expect(playback.engineReply).not.toHaveBeenCalled()
	})

	it('explains the trap after a wrong move, lets the computer punish it, and resets with Try again', async () => {
		const { r, playback } = runner('P01')
		await r.onMove(legal(r, 'g1-h1'))
		expect(r.phase.value).toBe('failed')
		expect(r.message.value).toEqual({
			type: 'error',
			text: 'Any defence lets d1-g1 capture your king. There is no check: capture first.',
			detail: 'Try again.',
		})
		expect(playback.engineReply).toHaveBeenCalledTimes(1)
		r.reset()
		expect(r.phase.value).toBe('ready')
		expect(r.message.value).toBeNull()
		expect(legal(r, 'b2-h8')).toBeDefined()
	})

	it('reveals a nudge, then the idea, and hints cost stars', async () => {
		const { r } = runner('P01')
		r.nextHint()
		expect(r.hintTexts.value).toHaveLength(1)
		expect(r.highlights.value).toEqual([{ square: 9, kind: 'hint' }])
		expect(r.arrows.value).toEqual([])
		r.nextHint()
		expect(r.hintTexts.value[1]).toBe('Look at the move to h8.')
		expect(r.arrows.value).toEqual([{ from: 9, to: 63, kind: 'best' }])
		await r.onMove(legal(r, 'b2-h8'))
		expect(r.earned.value).toBeLessThan(3)
	})

	it('restarts when the route names another puzzle', async () => {
		const { r, puzzleId } = runner('P01')
		await r.onMove(legal(r, 'g1-h1'))
		puzzleId.value = 'P02'
		await nextTick()
		expect(r.puzzle.value.id).toBe('P02')
		expect(r.phase.value).toBe('ready')
		expect(r.message.value).toBeNull()
	})
})
