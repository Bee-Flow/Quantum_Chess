/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The admin and personal settings pages: every section renders without console errors, and saved values persist.
 * The settings and LLM routes themselves are tested with a fake provider in api/ai.spec.mjs.
 */
import { api, env, expect, test } from './helpers/index.mjs'

const adminPage = `${env.baseURL}${env.indexPhp}/settings/admin/quantumchess`
const personalPage = `${env.baseURL}${env.indexPhp}/settings/user/quantumchess`

test.describe('admin settings', () => {
	test('render every section and save a value @phone', async ({ page }, testInfo) => {
		const before = await api('admin', 'GET', 'api/settings/admin')
		await page.goto(adminPage)
		for (const name of [
			'Online play',
			'Ratings and leaderboard',
			'Nextcloud AI',
			'Organisation AI provider',
			'Personal keys and local servers',
			'Limits and notices',
			'Diagnostics',
		]) {
			await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
		}
		await testInfo.attach('admin settings', {
			body: await page.screenshot({ fullPage: true }),
			contentType: 'image/png',
		})

		const field = page.getByLabel('Invitation expiry (days)')
		const next = before.invite_expiry_days === 21 ? 20 : 21
		try {
			await field.fill(String(next))
			await expect
				.poll(async () => (await api('admin', 'GET', 'api/settings/admin')).invite_expiry_days)
				.toBe(next)
		} finally {
			await api('admin', 'PUT', 'api/settings/admin', { invite_expiry_days: before.invite_expiry_days })
		}
		const width = await page.evaluate(() => document.documentElement.scrollWidth)
		expect(width, 'no horizontal scrolling').toBeLessThanOrEqual(page.viewportSize().width)
	})
})

test.describe('personal settings', () => {
	test.use({ user: 'bob' })

	test('render every section and save a switch @phone', async ({ page }, testInfo) => {
		const before = await api('bob', 'GET', 'api/settings/multiplayer')
		await page.goto(personalPage)
		for (const name of ['Online play', 'Notifications', 'AI opponent and coach']) {
			await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
		}
		await expect(page.getByText('What is sent to the AI')).toBeVisible()
		await testInfo.attach('personal settings', {
			body: await page.screenshot({ fullPage: true }),
			contentType: 'image/png',
		})

		try {
			await page.getByText('Draw offers', { exact: true }).click()
			await expect
				.poll(async () => (await api('bob', 'GET', 'api/settings/multiplayer')).notifications.drawOffers)
				.toBe(!before.notifications.drawOffers)
		} finally {
			await api('bob', 'PUT', 'api/settings/multiplayer', {
				notifications: { drawOffers: before.notifications.drawOffers },
			})
		}
		const width = await page.evaluate(() => document.documentElement.scrollWidth)
		expect(width, 'no horizontal scrolling').toBeLessThanOrEqual(page.viewportSize().width)
	})
})
