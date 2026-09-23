/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The coach and the review (IMPLEMENTATION-PLAN §5.11 acceptance, lean scope): a computer game with the Beginner
 * coach shows the eval bar, quality badges, hints and the coach chat; the review of the finished game shows the
 * evaluation graph and key moments and steps through the moves.
 */
import { expect, openApp, test } from './helpers/index.mjs'

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
 * Wait until the board accepts input.
 *
 * @param {import('@playwright/test').Page} page the page
 */
async function waitForTurn(page) {
	await page.locator('.qc-board--interactive:not(.qc-board--busy)').waitFor({ timeout: 30_000 })
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

/**
 * Start a level-1 computer game with the Beginner coach.
 *
 * @param {import('@playwright/test').Page} page the page
 */
async function startGame(page) {
	await openApp(page, '/new?mode=computer', { ready: '[data-test=start-game]' })
	await tid(page, 'level-1').check({ force: true })
	await tid(page, 'start-game').click()
	await waitForTurn(page)
	await page.evaluate(() => {
		const id = window.location.hash.split('/').pop()
		const key = 'quantumchess.localGame.v1.' + id
		const rec = JSON.parse(window.localStorage.getItem(key))
		rec.options.coach = 'beginner'
		window.localStorage.setItem(key, JSON.stringify(rec))
	})
}

test('the coach during a computer game, then the review @phone', async ({ page }, info) => {
	test.setTimeout(180_000)
	const phone = info.project.name === 'phone'
	await startGame(page)
	await expect(tid(page, 'eval-bar')).toBeVisible({ timeout: 15_000 })
	await tid(page, 'tab-coach').click()
	await expect(tid(page, 'coach-panel')).toContainText('Your winning chances', { timeout: 15_000 })

	// a split, then a knight move: the coach grades each move
	await page.keyboard.press('2')
	await clickSquare(page, 'g1')
	await clickSquare(page, 'f3')
	await clickSquare(page, 'h3')
	await expect(tid(page, 'coach-last-move')).toBeVisible({ timeout: 30_000 })
	await expect(tid(page, 'quality-badge').first()).toBeVisible()
	await waitForTurn(page)
	await expect(tid(page, 'coach-hint-button')).toBeEnabled({ timeout: 15_000 })
	await tid(page, 'coach-hint-button').click()
	await expect(tid(page, 'coach-hint')).toBeVisible()
	await tid(page, 'coach-hint-button').click()
	await expect(tid(page, 'coach-hint')).toContainText('Idea')
	await shot(page, phone ? 'phone-coach-game' : 'coach-game-hint')

	await page.getByRole('button', { name: 'What is my opponent threatening?' }).click()
	await expect(page.locator('.qc-coach-chat__message--coach')).toBeVisible({ timeout: 60_000 })
	await shot(page, phone ? 'phone-coach-chat' : 'coach-chat')

	// finish the game and open its review
	const id = await page.evaluate(() => window.location.hash.split('/').pop())
	await clickSquare(page, 'e2')
	await clickSquare(page, 'e4')
	await expect(tid(page, 'coach-last-move')).toContainText('e2-e4', { timeout: 30_000 })
	await waitForTurn(page)
	if (phone) {
		await openApp(page, `/review/local/${id}`, { ready: '[data-test=eval-graph]' })
	} else {
		await tid(page, 'resign').click()
		await tid(page, 'confirm-resign').click()
		await page.getByRole('button', { name: 'Review' }).first().click()
	}
	await expect(tid(page, 'eval-graph')).toBeVisible({ timeout: 30_000 })
	await expect(page.getByText(/Analysing the game/)).toBeHidden({ timeout: 60_000 })
	await expect(page.locator('.qc-graph__area')).toBeVisible()
	await tid(page, 'review-prev').click()
	await tid(page, 'review-prev').click()
	await expect(page.locator('.qc-review__ply')).toContainText('Move 2 of 4')
	await shot(page, phone ? 'phone-review' : 'review')
})
