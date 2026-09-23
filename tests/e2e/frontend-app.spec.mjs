/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The app shell and local games (frontend-app): the lobby paints, a computer game plays and undoes a move, pass &
 * play splits a knight, the rules page shows its boards and a settings change survives a reload.
 */
import { expect, openApp, test } from './helpers/index.mjs'

test.use({ user: 'bob' })

const FILES = 'abcdefgh'

/**
 * Click a square of the (white-oriented) board.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} square square name, e.g. 'e2'
 */
async function clickSquare(page, square) {
	const box = await page.locator('.qc-board').first().boundingBox()
	const s = box.width / 8
	const f = FILES.indexOf(square[0])
	const r = Number(square[1]) - 1
	await page.mouse.click(box.x + (f + 0.5) * s, box.y + (7 - r + 0.5) * s)
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
 * The local game record of the open game.
 *
 * @param {import('@playwright/test').Page} page the page
 * @return {Promise<object>}
 */
async function record(page) {
	return page.evaluate(() => {
		const id = window.location.hash.split('/').pop()
		return JSON.parse(window.localStorage.getItem(`quantumchess/${document.head.dataset.user}/localGame.v1.` + id))
	})
}

test.describe('app shell and local games', () => {
	test('the lobby paints with the play tiles @phone', async ({ page }) => {
		await openApp(page, '/', { ready: '.qc-home' })
		await expect(page.locator('[data-test=tile-computer]')).toBeVisible()
		await expect(page.locator('[data-test=tile-local]')).toBeVisible()
		await expect(page.locator('[data-test=tile-ai]')).toBeVisible()
	})

	test('a computer game replies, and undo marks it assisted', async ({ page }) => {
		await openApp(page, '/new?mode=computer', { ready: '[data-test=start-game]' })
		await page.locator('[data-test=level-1]').check({ force: true })
		await page.locator('[data-test=start-game]').click()
		await waitForTurn(page)
		await clickSquare(page, 'e2')
		await clickSquare(page, 'e4')
		await expect(page.locator('.qc-moves__move')).toHaveCount(2, { timeout: 30_000 })
		await waitForTurn(page)
		expect((await record(page)).moves.map((m) => m.by)).toEqual(['human', 'engine'])
		await page.locator('[data-test=undo]').click()
		await expect(page.locator('.qc-moves__move')).toHaveCount(0)
		expect((await record(page)).assisted).toBe(true)
	})

	test('pass & play splits a knight @phone', async ({ page }) => {
		await openApp(page, '/new?mode=local', { ready: '[data-test=start-game]' })
		await page.locator('[data-test=start-game]').click()
		await waitForTurn(page)
		await page.keyboard.press('2')
		await clickSquare(page, 'g1')
		await clickSquare(page, 'f3')
		await clickSquare(page, 'h3')
		await expect.poll(async () => (await record(page)).moves.map((m) => m.code)).toEqual(['g1-f3|h3'])
		await waitForTurn(page)
		await expect(page.locator('[data-test=player-b]')).toContainText('Black')
	})

	test('the rules page shows live boards', async ({ page }) => {
		await openApp(page, '/rules', { ready: '.qc-rules' })
		expect(await page.locator('.qc-rules .qc-mini-board').count()).toBeGreaterThan(8)
		await page.locator('.qc-rules-board__outcomes button').first().click()
	})

	test('a settings change applies live and survives a reload', async ({ page }) => {
		await openApp(page, '/?dialog=settings', { ready: '.qc-settings__themes' })
		await page.locator('.qc-settings__theme', { hasText: 'Quantum' }).click()
		await expect(page.locator('.qc-home .qc-mini-board').first()).toHaveAttribute('data-board-theme', 'quantum')
		await page.waitForTimeout(1200) // debounced save
		await openApp(page, '/', { ready: '.qc-home' })
		await expect(page.locator('.qc-home .qc-mini-board').first()).toHaveAttribute('data-board-theme', 'quantum')
		// back to the default
		await openApp(page, '/?dialog=settings', { ready: '.qc-settings__themes' })
		await page.locator('.qc-settings__theme', { hasText: 'Blue' }).click()
		await page.waitForTimeout(1200)
	})
})
