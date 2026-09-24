/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Nextcloud notifications: an online invitation is accepted from the notification panel, and the game opens for the
 * first move. The notification texts and actions are tested through the API in api/games.spec.mjs.
 */
import { api, clickSquare, expect, getUser, openApp, test, waitForTurn } from './helpers/index.mjs'

test.describe('online invitation from a notification', () => {
	test.use({ user: 'bob' })

	test('bob accepts in the notification panel and the game opens', async ({ page }) => {
		// no open invitation between the two (one per pair)
		const lobby = await api('admin', 'GET', 'api/games')
		for (const g of lobby.outgoing ?? []) {
			if (g.opponent?.userId === getUser('bob').uid) {
				await api('admin', 'POST', `api/games/${g.id}/cancel`)
			}
		}
		const { game } = await api('admin', 'POST', 'api/games', { opponent: getUser('bob').uid, rated: false, timeControl: 'corr:3d', color: 'b' })
		await openApp(page, '/', { ready: '.qc-home' })
		await page.locator('#notifications .header-menu__trigger, #notifications button').first().click()
		const item = page.locator('.notification', { hasText: /invited you/ }).first()
		await expect(item).toBeVisible({ timeout: 15_000 })
		await item.getByRole('button', { name: 'Accept' }).click()
		await expect.poll(async () => {
			const res = await api('bob', 'GET', `api/games/${game.id}`)
			return (res.game ?? res).status
		}).toBe('active')
		await openApp(page, `/game/${game.id}`, { ready: '.qc-board' })
		await waitForTurn(page)
		await clickSquare(page, 'd2')
		await clickSquare(page, 'd4')
		await expect.poll(async () => {
			const res = await api('admin', 'GET', `api/games/${game.id}`)
			return (res.game ?? res).moves?.length ?? 0
		}, { timeout: 15_000 }).toBe(1)
		await api('bob', 'POST', `api/games/${game.id}/abort`).catch(() => {})
	})
})
