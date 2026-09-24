/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The app shell and local games: the lobby paints, a computer game plays and undoes a move, pass & play splits a
 * knight and plays every move type (split, merge, Measure and a rolled capture, with the rolls forced through the
 * page's random source), the rules page shows its boards and a settings change survives a reload.
 */
import { applyMove, initialState } from '../../src/engine/index.js'
import {
	api,
	clickSquare,
	expect,
	installRollQueue,
	localGameRecord,
	openApp,
	rollFor,
	test,
	waitForSave,
	waitForTurn,
} from './helpers/index.mjs'

/**
 * The move codes of the open local game.
 *
 * @param {import('@playwright/test').Page} page the page
 * @return {Promise<string[]>}
 */
async function localMoves(page) {
	return (await localGameRecord(page))?.moves.map((m) => m.code) ?? []
}

test.describe('app shell and local games', () => {
	test.use({ user: 'bob' })

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
		expect((await localGameRecord(page)).moves.map((m) => m.by)).toEqual(['human', 'engine'])
		await page.locator('[data-test=undo]').click()
		await expect(page.locator('.qc-moves__move')).toHaveCount(0)
		expect((await localGameRecord(page)).assisted).toBe(true)
	})

	test('pass & play splits a knight @phone', async ({ page }) => {
		await openApp(page, '/new?mode=local', { ready: '[data-test=start-game]' })
		await page.locator('[data-test=start-game]').click()
		await waitForTurn(page)
		await page.keyboard.press('2')
		await clickSquare(page, 'g1')
		await clickSquare(page, 'f3')
		await clickSquare(page, 'h3')
		await expect.poll(() => localMoves(page)).toEqual(['g1-f3|h3'])
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
		const saved = waitForSave(page, '/settings/preferences', (body) => body.preferences?.boardTheme === 'quantum')
		await page.locator('.qc-settings__theme', { hasText: 'Quantum' }).click()
		await expect(page.locator('.qc-home .qc-mini-board').first()).toHaveAttribute('data-board-theme', 'quantum')
		await saved
		await openApp(page, '/', { ready: '.qc-home' })
		await expect(page.locator('.qc-home .qc-mini-board').first()).toHaveAttribute('data-board-theme', 'quantum')
		// back to the default
		await openApp(page, '/?dialog=settings', { ready: '.qc-settings__themes' })
		const restored = waitForSave(page, '/settings/preferences', (body) => body.preferences?.boardTheme === 'slate')
		await page.locator('.qc-settings__theme', { hasText: 'Blue' }).click()
		await restored
	})
})

test.describe('pass & play', () => {
	test.use({ user: 'carol' })

	test.afterAll(async () => {
		await api('carol', 'PUT', 'api/settings/preferences', { preferences: {} }).catch(() => {})
	})

	test('split, merge, Measure and a rolled capture @phone', async ({ page }, testInfo) => {
		// the same moves in the engine, to know which roll values give which outcome
		const codes = ['g1-f3|h3', 'e7-e5', 'f3|h3-g1', 'b8-a6|c6', 'g1-f3|h3', '?a6', 'f3-e5']
		const states = [initialState()]
		for (const code of codes.slice(0, -1)) {
			states.push(applyMove(states.at(-1), code, { u: 0 }).state)
		}
		const measureU = rollFor(states[5], '?a6', 'a6')
		const captureU = rollFor(states[6], 'f3-e5', 'capture')

		await installRollQueue(page)
		// Confirm moves off, so a rolled move is played by the click on its target also on touch screens
		await api('carol', 'PUT', 'api/settings/preferences', { preferences: { confirmMoves: 'never' } })
		await openApp(page, '/new?mode=local', { ready: '[data-test=start-game]' })
		await page.locator('[data-test=start-game]').click()
		await waitForTurn(page)

		// 1. White splits the knight
		await page.keyboard.press('2')
		await clickSquare(page, 'g1')
		await clickSquare(page, 'f3')
		await clickSquare(page, 'h3')
		await expect.poll(() => localMoves(page)).toEqual(codes.slice(0, 1))
		await expect(page.locator('.qc-board')).toContainText('50')
		await waitForTurn(page)

		// 1… a pawn move
		await page.keyboard.press('1')
		await clickSquare(page, 'e7')
		await clickSquare(page, 'e5')
		await expect.poll(() => localMoves(page)).toEqual(codes.slice(0, 2))
		await waitForTurn(page)

		// 2. White merges the two parts back on g1
		await page.keyboard.press('3')
		await clickSquare(page, 'f3')
		await clickSquare(page, 'g1')
		await expect.poll(() => localMoves(page)).toEqual(codes.slice(0, 3))
		await waitForTurn(page)

		// 2… Black splits, 3. White splits again
		await page.keyboard.press('2')
		await clickSquare(page, 'b8')
		await clickSquare(page, 'a6')
		await clickSquare(page, 'c6')
		await expect.poll(() => localMoves(page)).toEqual(codes.slice(0, 4))
		await waitForTurn(page)
		await page.keyboard.press('2')
		await clickSquare(page, 'g1')
		await clickSquare(page, 'f3')
		await clickSquare(page, 'h3')
		await expect.poll(() => localMoves(page)).toEqual(codes.slice(0, 5))
		await waitForTurn(page)

		// 3… Black measures the knight: it is on a6
		await page.evaluate((u) => window.__qcRolls.push(u), measureU)
		await page.keyboard.press('4')
		await clickSquare(page, 'a6')
		await clickSquare(page, 'a6')
		await expect.poll(() => localMoves(page)).toEqual(codes.slice(0, 6))
		await waitForTurn(page)

		// 4. White's half-knight on f3 takes on e5: a rolled capture, forced to succeed
		await page.evaluate((u) => window.__qcRolls.push(u), captureU)
		await page.keyboard.press('1')
		await clickSquare(page, 'f3')
		await clickSquare(page, 'e5')
		await expect.poll(() => localMoves(page), { timeout: 15_000 }).toEqual(codes)
		await expect(page.locator('.qc-board')).toContainText(/Captured/i, { timeout: 15_000 })
		await testInfo.attach('pass-and-play', { body: await page.screenshot(), contentType: 'image/png' })

		// the roll log lists the Measure and the capture
		const log = page.locator('[data-test=tab-log]')
		if (await log.isVisible()) {
			await log.click()
			await expect(page.locator('.qc-rolls')).toContainText(/Captured/i)
			await expect(page.locator('.qc-rolls')).toContainText(/Measure/i)
		}
	})
})
