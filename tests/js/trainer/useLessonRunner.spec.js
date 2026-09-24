/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The lesson step machine: a task checked by its predicate with the scripted reply, a failed task and Try again, hints
 * that cost a star, a quiz, and the stars at the end.
 */

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useLessonRunner } from '../../../src/trainer/composables/useLessonRunner.js'
import { usePlayback } from '../../../src/trainer/composables/usePlayback.js'

vi.mock('../../../src/services/api.js', () => ({
	getTrainerProgress: vi.fn(async () => ({})),
	saveTrainerProgress: vi.fn(async (doc) => doc),
}))

/**
 * A runner for a lesson, on a playback without a board.
 *
 * @param {string} id lesson id
 * @return {object}
 */
function runner(id) {
	const lessonId = ref(id)
	const openGame = vi.fn()
	const r = useLessonRunner({ lessonId: () => lessonId.value, playback: usePlayback(ref(null)), createGame: () => ({ id: 'lg_test' }), openGame })
	return { r, lessonId, openGame }
}

/**
 * The legal move with this code.
 *
 * @param {object} r runner
 * @param {string} code move code
 * @return {object}
 */
const legal = (r, code) => r.legalMoves.value.find((m) => m.code === code)

describe('useLessonRunner', () => {
	it('starts on the first step of the lesson in the route', () => {
		const { r } = runner('l02')
		expect(r.lesson.value.id).toBe('L02')
		expect(r.index.value).toBe(0)
		expect(r.step.value.type).toBe('task')
		expect(r.interactive.value).toBe(true)
		expect(r.legalMoves.value.every((m) => m.type === 'split')).toBe(true)
	})

	it('accepts the task move, plays the scripted reply and moves on', async () => {
		const { r } = runner('L02')
		await r.onMove(legal(r, 'g1-f3|h3'))
		expect(r.phase.value).toBe('success')
		expect(r.message.value).toMatchObject({ type: 'success' })
		r.advance()
		expect(r.index.value).toBe(1)
		expect(r.phase.value).toBe('ready')
	})

	it('counts a failed task and a hint, and resets the task with Try again', async () => {
		const { r } = runner('L02')
		await r.onMove(legal(r, 'g1-f3|h3'))
		r.advance()
		r.nextHint()
		expect(r.hintTexts.value).toHaveLength(1)
		const wrong = r.legalMoves.value.find((m) => m.code.startsWith('h3-'))
		expect(wrong).toBeDefined()
		await r.onMove(wrong)
		expect(r.phase.value).toBe('failed')
		r.retry()
		expect(r.phase.value).toBe('ready')
		expect(r.message.value).toBeNull()
	})

	it('grades a quiz and finishes with the stars', async () => {
		const { r } = runner('L02')
		await r.onMove(legal(r, 'g1-f3|h3'))
		r.advance()
		await r.onMove(r.legalMoves.value[0])
		r.advance()
		expect(r.step.value.type).toBe('quiz')
		r.answer(0)
		expect(r.answerVariant(0)).toBe('error')
		r.answer(1)
		expect(r.phase.value).toBe('success')
		r.advance()
		r.advance()
		expect(r.finished.value).toBe(true)
		expect(r.stars.value).toBe(2)
		expect(r.starsText.value).toBe('Replay the lesson without hints and retries for three stars.')
	})

	it('restarts when the route names another lesson', async () => {
		const { r, lessonId } = runner('L02')
		await r.onMove(legal(r, 'g1-f3|h3'))
		lessonId.value = 'L03'
		await Promise.resolve()
		expect(r.lesson.value.id).toBe('L03')
		expect(r.index.value).toBe(0)
		expect(r.phase.value).toBe('ready')
	})
})
