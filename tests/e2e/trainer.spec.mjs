/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The trainer (IMPLEMENTATION-PLAN §5.10 acceptance, lean scope): lessons 1–3 and puzzle P01 completed by clicking,
 * and the stars survive a reload (server progress).
 */
import { expect, occ, openApp, test } from './helpers/index.mjs'

test.use({ user: 'carol' })

const FILES = 'abcdefgh'
const SHOTS = process.env.QC_SHOTS ?? null

/**
 * An element by its data-test attribute.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} id data-test value
 * @return {import('@playwright/test').Locator}
 */
const tid = (page, id) => page.locator(`[data-test="${id}"]`)

/**
 * Click a square of a white-oriented board.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} square e.g. 'e2'
 */
async function clickSquare(page, square) {
	await page.locator('.qc-board').first().scrollIntoViewIfNeeded()
	const box = await page.locator('.qc-board').first().boundingBox()
	const s = box.width / 8
	await page.mouse.click(box.x + (FILES.indexOf(square[0]) + 0.5) * s, box.y + (7 - (Number(square[1]) - 1) + 0.5) * s)
}

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
	// touch devices confirm rolled moves (GAME-DESIGN §3.5.6)
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

/**
 * Save a screenshot when QC_SHOTS is set.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} name file name
 */
async function shot(page, name) {
	if (SHOTS) {
		await page.screenshot({ path: `${SHOTS}/${name}.png` })
	}
}

test.beforeAll(async () => {
	await occ(['user:setting', 'carol', 'quantumchess', 'trainer_progress', '--delete']).catch(() => {})
})

test('lessons 1–3 and puzzle 1 by clicking; progress persists', async ({ page }) => {
	test.setTimeout(240_000)
	await openApp(page, 'trainer', { ready: '[data-test="trainer-continue"]' })
	await shot(page, 'trainer-home-empty')
	await tid(page, 'continue-lesson').click()

	// Lesson 1
	await expect(page.getByRole('heading', { name: /Capture the king/ })).toBeVisible()
	await shot(page, 'lesson1-explain')
	await next(page)
	await play(page, ['d1', 'd8'])
	await expect(tid(page, 'lesson-message')).toContainText('captured for certain')
	await shot(page, 'lesson1-task1-done')
	await next(page)
	await play(page, ['e2', 'f1'])
	await expect(tid(page, 'lesson-message')).toContainText('Safe')
	await next(page)
	await play(page, ['a1', 'a8'])
	await expect(tid(page, 'lesson-message')).toContainText('cannot escape')
	await next(page)
	await next(page)
	await expect(page.getByText('Lesson complete!')).toBeVisible()
	await shot(page, 'lesson1-complete')
	await tid(page, 'next-lesson').click()

	// Lesson 2
	await expect(page.getByRole('heading', { name: /Split/ })).toBeVisible()
	await play(page, ['g1', 'f3', 'h3'], 'Split')
	await expect(tid(page, 'lesson-message')).toContainText('50 %')
	await expect(tid(page, 'lesson-next')).toBeVisible()
	await next(page)
	await play(page, ['f3', 'e5', 'g5'], 'Split')
	await expect(tid(page, 'lesson-message')).toContainText('3/8')
	await shot(page, 'lesson2-split-again')
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
	await shot(page, 'lesson3-quiz')
	await next(page)
	await play(page, ['d4', 'h8'], 'Merge')
	await expect(tid(page, 'lesson-message')).toContainText('Preparation beats dice')
	await shot(page, 'lesson3-converging')
	await next(page)
	await expect(page.getByText('Lesson complete!')).toBeVisible()

	// Puzzle 1
	await openApp(page, 'trainer/puzzle/P01', { ready: '[data-test="puzzle-card"]' })
	await play(page, ['b2', 'h8'])
	await expect(tid(page, 'puzzle-message')).toContainText('Solved!')
	await shot(page, 'puzzle1-solved')

	// Progress survives a reload (server copy; the local mirror is cleared)
	await page.waitForTimeout(2600)
	await page.evaluate(() => window.localStorage.removeItem(`quantumchess/${document.head.dataset.user}/trainer.v1`))
	await openApp(page, 'trainer', { ready: '[data-test="trainer-continue"]' })
	await expect(tid(page, 'lesson-L01')).toHaveClass(/qc-trainer__lesson--done/)
	await expect(tid(page, 'lesson-L03')).toHaveClass(/qc-trainer__lesson--done/)
	await expect(tid(page, 'puzzle-P01')).toHaveClass(/qc-trainer__puzzle--solved/)
	await expect(tid(page, 'trainer-continue')).toContainText('Land = roll')
	await shot(page, 'trainer-home-progress')
})

test('the trainer at phone size @phone', async ({ page }) => {
	await openApp(page, 'trainer/lesson/L04', { ready: '[data-test="lesson-card"]' })
	await play(page, ['d1', 'd5'])
	await expect(tid(page, 'lesson-message')).toContainText('Captured')
	await tid(page, 'show-other-result').click()
	await expect(tid(page, 'other-result-text')).toContainText('Moved')
	await shot(page, 'phone-lesson4-other-result')
	await openApp(page, 'trainer', { ready: '[data-test="trainer-continue"]' })
	await shot(page, 'phone-trainer-home')
})
