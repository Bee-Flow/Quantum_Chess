/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Packaging checks: the app is installed and reachable, its icons are served, every test user can open it, and
 * the page is free of console errors. They also exercise the e2e scaffolding itself.
 */
import { api, appMenuIcon, env, expect, openApp, test } from './helpers/index.mjs'

test.describe('installation', () => {
	test('the app opens with its icon in the header', async ({ page }, testInfo) => {
		await openApp(page)
		await expect(page).toHaveTitle(/Quantum Chess/)
		await expect(appMenuIcon(page)).toBeAttached()
		await testInfo.attach('app', { body: await page.screenshot(), contentType: 'image/png' })
	})

	test('both icons are served as SVG', async ({ page, request }) => {
		await openApp(page)
		// the header knows where the app lives (apps/, custom_apps/ or another apps path)
		const icon = appMenuIcon(page)
		const src = (await icon.getAttribute('src')) ?? (await icon.getAttribute('style')).match(/url\("?([^")]+)"?\)/)[1]
		for (const url of [src, src.replace('app.svg', 'app-dark.svg')]) {
			const response = await request.get(new URL(url, env.baseURL).href)
			expect(response.ok(), `${url} is served`).toBe(true)
			expect(response.headers()['content-type']).toContain('image/svg+xml')
		}
	})

	test('the API answers for a logged-in user', async () => {
		const summary = await api('bob', 'GET', 'api/games/summary')
		expect(typeof summary.rev).toBe('string')
	})
})

test.describe('test users', () => {
	test('bob and carol can open the app side by side', async ({ twoUsers }) => {
		const { bob, carol } = twoUsers
		await Promise.all([openApp(bob.page), openApp(carol.page)])
		await expect(bob.page).toHaveTitle(/Quantum Chess/)
		await expect(carol.page).toHaveTitle(/Quantum Chess/)
	})

	test('the app opens at phone size @phone', async ({ page }) => {
		await openApp(page)
		const width = await page.evaluate(() => document.documentElement.scrollWidth)
		const viewport = page.viewportSize()
		expect(width, 'no horizontal scrolling').toBeLessThanOrEqual(viewport.width)
	})
})
