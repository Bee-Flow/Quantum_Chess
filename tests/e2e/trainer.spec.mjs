/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The trainer: lessons 1–3 and puzzle P01 completed by clicking, and the stars survive a reload (the progress is
 * stored on the server).
 */
import { clickSquare, expect, occ, openApp, test, byTestId as tid, waitForSave } from './helpers/index.mjs'

test.use({ user: 'carol' })

/**
 * Play a move by clicks once the board accepts input.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string[]} squares squares to click in order
 * @param {string} [mode] move switcher mode (Split, Merge, Measure)
 */
async function play(page, squares, mode = null) {
	await page.locator('.qc-board--interactive').waitFor()
	if (mode) {
		await page.keyboard.press(String(['Move', 'Split', 'Merge', 'Measure'].indexOf(mode) + 1))
	}
	for (const sq of squares) {
		await clickSquare(page, sq)
	}
	// on touch screens a rolled move waits for a confirmation
	const confirm = page.locator('.qc-controls__status button', { hasText: 'Play' })
	if (await confirm.isVisible()) {
		await confirm.click()
	}
}

/**
 * Wait for the task result and continue.
 *
 * @param {import('@playwright/test').Page} page the page
 */
async function next(page) {
	await tid(page, 'lesson-next').click()
}

test.beforeAll(async () => {
	await occ(['user:setting', 'carol', 'quantumchess', 'trainer_progress', '--delete']).catch(() => {})
})

test('lessons 1–3 and puzzle 1 by clicking; progress persists', async ({ page }) => {
	test.setTimeout(240_000)
	await openApp(page, 'trainer', { ready: '[data-test="trainer-continue"]' })
	await tid(page, 'continue-lesson').click()

	// Lesson 1
	await expect(page.getByRole('heading', { name: /Capture the king/ })).toBeVisible()
	await next(page)
	await play(page, ['d1', 'd8'])
	await expect(tid(page, 'lesson-message')).toContainText('captured for certain')
	await next(page)
	await play(page, ['e2', 'f1'])
	await expect(tid(page, 'lesson-message')).toContainText('Safe')
	await next(page)
	await play(page, ['a1', 'a8'])
	await expect(tid(page, 'lesson-message')).toContainText('cannot escape')
	await next(page)
	await next(page)
	await expect(page.getByText('Lesson complete!')).toBeVisible()
	await tid(page, 'next-lesson').click()

	// Lesson 2
	await expect(page.getByRole('heading', { name: /Split/ })).toBeVisible()
	await play(page, ['g1', 'f3', 'h3'], 'Split')
	await expect(tid(page, 'lesson-message')).toContainText('50 %')
	await expect(tid(page, 'lesson-next')).toBeVisible()
	await next(page)
	await play(page, ['f3', 'e5', 'g5'], 'Split')
	await expect(tid(page, 'lesson-message')).toContainText('3/8')
	await expect(tid(page, 'lesson-next')).toBeVisible()
	await next(page)
	await tid(page, 'answer-0').click()
	await expect(tid(page, 'lesson-message')).toContainText('Not quite')
	await tid(page, 'answer-1').click()
	await next(page)
	await next(page)
	await expect(page.getByText('Lesson complete!')).toBeVisible()
	await tid(page, 'next-lesson').click()

	// Lesson 3
	await expect(page.getByRole('heading', { name: /Merge and converging capture/ })).toBeVisible()
	await play(page, ['a3', 'b5'], 'Merge')
	await expect(tid(page, 'lesson-message')).toContainText('solid again')
	await next(page)
	await tid(page, 'lesson-hint').click()
	await play(page, ['a3', 'b5'], 'Merge')
	await expect(tid(page, 'lesson-message')).toContainText('0 %')
	await expect(tid(page, 'lesson-next')).toBeVisible({ timeout: 30_000 })
	await next(page)
	await tid(page, 'answer-2').click()
	await next(page)
	await play(page, ['d4', 'h8'], 'Merge')
	await expect(tid(page, 'lesson-message')).toContainText('Preparation beats dice')
	await next(page)
	await expect(page.getByText('Lesson complete!')).toBeVisible()

	// Puzzle 1
	await openApp(page, 'trainer/puzzle/P01', { ready: '[data-test="puzzle-card"]' })
	const saved = waitForSave(page, '/trainer/progress', (body) => Boolean(body.progress?.puzzles?.P01?.solved))
	await play(page, ['b2', 'h8'])
	await expect(tid(page, 'puzzle-message')).toContainText('Solved!')

	// Progress survives a reload (server copy; the local mirror is cleared)
	await saved
	await page.evaluate(() => window.localStorage.removeItem(`quantumchess/${document.head.dataset.user}/trainer.v1`))
	await openApp(page, 'trainer', { ready: '[data-test="trainer-continue"]' })
	await expect(tid(page, 'lesson-L01')).toHaveClass(/qc-trainer__lesson--done/)
	await expect(tid(page, 'lesson-L03')).toHaveClass(/qc-trainer__lesson--done/)
	await expect(tid(page, 'puzzle-P01')).toHaveClass(/qc-trainer__puzzle--solved/)
	await expect(tid(page, 'trainer-continue')).toContainText('Land = roll')
})

test('the trainer at phone size @phone', async ({ page }) => {
	await openApp(page, 'trainer/lesson/L04', { ready: '[data-test="lesson-card"]' })
	await play(page, ['d1', 'd5'])
	await expect(tid(page, 'lesson-message')).toContainText('Captured')
	await tid(page, 'show-other-result').click()
	await expect(tid(page, 'other-result-text')).toContainText('Moved')
	await openApp(page, 'trainer', { ready: '[data-test="trainer-continue"]' })
})
