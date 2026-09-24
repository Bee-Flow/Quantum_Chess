/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Trainer progress: merging local and stored progress, the stars of lessons and puzzles, and the progress store.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/services/api.js', () => ({
	getTrainerProgress: vi.fn(async () => ({ lessons: { L02: { done: true, stars: 2, at: 50 } } })),
	saveTrainerProgress: vi.fn(async (doc) => doc),
}))

const {
	lessonStars,
	mergeProgress,
	nextLesson,
	progress,
	puzzleStars,
	recordLesson,
	refreshProgress,
} = await import('../../../src/trainer/progress.js')
const { reportGameEvent, markGraduationGame } = await import('../../../src/trainer/events.js')

describe('progress merge', () => {
	it('merges lessons, puzzles, achievements, counters, xp and streak', () => {
		const a = {
			v: 1,
			lessons: { L01: { done: true, stars: 2, at: 100 }, L02: { done: false, stars: 0, at: null } },
			puzzles: { P01: { solved: false, stars: 0, tries: 3, hints: 0, at: null } },
			achievements: { 'first-steps': 100 },
			counters: { splits: 4, engine: { 1: { w: 2, l: 0 } } },
			xp: 100,
			streak: { current: 2, best: 5, last: '2026-09-20' },
			extra: 'a',
		}
		const b = {
			lessons: { L01: { done: false, stars: 3, at: 50 }, L03: { done: true, stars: 1, at: 70 } },
			puzzles: { P01: { solved: true, stars: 2, tries: 1, hints: 1, at: 90 } },
			achievements: { 'first-steps': 80 },
			counters: { splits: 2, engine: { 1: { w: 1, l: 3 } } },
			xp: 50,
			streak: { current: 1, best: 3, last: '2026-09-22' },
			extra: 'b',
		}
		const m = mergeProgress(a, b)
		expect(m.lessons.L01).toEqual({ done: true, stars: 3, at: 50 })
		expect(m.lessons.L02.done).toBe(false)
		expect(m.lessons.L03.done).toBe(true)
		expect(m.puzzles.P01).toEqual({ solved: true, stars: 2, tries: 3, hints: 1, at: 90 })
		expect(m.achievements['first-steps']).toBe(80)
		expect(m.counters).toEqual({ splits: 4, engine: { 1: { w: 2, l: 3 } } })
		expect(m.xp).toBe(100)
		expect(m.streak).toEqual({ current: 1, best: 5, last: '2026-09-22' })
		expect(m.extra).toBe('b')
		expect(mergeProgress(b, a).lessons.L01).toEqual(m.lessons.L01)
	})
})

describe('stars', () => {
	it('lessons: 3 clean, 2 with ≤ 2 hints or 1 retry, else 1', () => {
		expect(lessonStars(0, 0)).toBe(3)
		expect(lessonStars(2, 0)).toBe(2)
		expect(lessonStars(0, 1)).toBe(2)
		expect(lessonStars(3, 0)).toBe(1)
		expect(lessonStars(1, 1)).toBe(1)
	})

	it('puzzles: 3 first try no hints, 2 with one hint or a second try, else 1', () => {
		expect(puzzleStars(1, 0)).toBe(3)
		expect(puzzleStars(1, 1)).toBe(2)
		expect(puzzleStars(2, 0)).toBe(2)
		expect(puzzleStars(2, 1)).toBe(1)
		expect(puzzleStars(3, 0)).toBe(1)
	})
})

describe('the progress store', () => {
	it('records lessons, merges the server copy and finds the next lesson', async () => {
		recordLesson('L01', 3)
		expect(progress.lessons.L01.done).toBe(true)
		await refreshProgress()
		expect(progress.lessons.L02).toMatchObject({ done: true, stars: 2 })
		expect(nextLesson([{ id: 'L01' }, { id: 'L02' }, { id: 'L03' }]).id).toBe('L03')
	})

	it('completes the graduation lesson when its game is won', async () => {
		reportGameEvent({ type: 'gameOver', mode: 'computer', won: true, assisted: false })
		await new Promise((resolve) => setTimeout(resolve, 10))
		expect(progress.lessons.L11).toBeUndefined()
		markGraduationGame('lg_1')
		reportGameEvent({ type: 'gameOver', mode: 'computer', won: false, assisted: false })
		reportGameEvent({ type: 'gameOver', mode: 'computer', won: true, assisted: false })
		await vi.waitFor(() => expect(progress.lessons.L11?.done).toBe(true))
	})
})
