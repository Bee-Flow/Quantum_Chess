/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The app shell inside Nextcloud: the browser tab title, and the page in the user's language.
 */
import { expect, getUser, occ, openApp, test } from './helpers/index.mjs'

test.describe('title and languages', () => {
	test.use({ user: 'carol' })

	test.afterEach(async () => {
		await occ(['user:setting', getUser('carol').uid, 'core', 'lang', 'en'])
	})

	test('the tab title names the app and the lobby speaks Dutch', async ({ page }) => {
		await openApp(page, '/', { ready: '.qc-home' })
		await expect(page).toHaveTitle(/^(\(\d+\) )?Quantum Chess - /)
		expect(await page.title()).not.toContain('[object')
		await occ(['user:setting', getUser('carol').uid, 'core', 'lang', 'nl'])
		await page.reload()
		await page.locator('.qc-home').waitFor()
		await expect(page.locator('[data-test=tile-computer]')).toContainText('Computer')
		await expect(page.locator('.qc-home')).toContainText('Samen spelen')
	})
})
