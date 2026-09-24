/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * A game against an LLM opponent ("AI opponent" in the app), answered by the local fake OpenAI-compatible server of
 * helpers/fake-openai.mjs through a personal provider.
 */
import { api, clickSquare, expect, openApp, startFakeOpenAi, test, waitForTurn } from './helpers/index.mjs'

test.describe('AI opponent', () => {
	test.use({ user: 'bob' })
	/** @type {Awaited<ReturnType<typeof startFakeOpenAi>>} */
	let fake
	let adminBefore

	test.beforeAll(async () => {
		fake = await startFakeOpenAi()
		adminBefore = await api('admin', 'GET', 'api/settings/admin')
		await api('admin', 'PUT', 'api/settings/admin', { local_allowlist: [fake.baseUrl], allow_personal_keys: true })
		await api('bob', 'PUT', 'api/settings/personal', {
			provider: { preset: 'custom', baseUrl: fake.baseUrl, model: 'fake-chess-1' },
			apiKey: 'sk-test-e2e-1234',
			defaultSource: 'personal',
		})
		await api('bob', 'POST', 'api/ai/notice', { source: 'personal' })
	})

	test.afterAll(async () => {
		await api('bob', 'PUT', 'api/settings/personal', { provider: null, apiKey: '', defaultSource: null }).catch(() => {})
		if (adminBefore) {
			await api('admin', 'PUT', 'api/settings/admin', {
				local_allowlist: adminBefore.local_allowlist,
				allow_personal_keys: adminBefore.allow_personal_keys,
			}).catch(() => {})
		}
		await fake?.close()
	})

	test('the persona answers with the provider\'s move and comment', async ({ page }, testInfo) => {
		await openApp(page, '/new?mode=ai', { ready: '[data-test=start-game]' })
		await page.locator('[data-test=persona-professor]').click()
		await page.locator('input[name=qc-ai-color][value=w]').check({ force: true })
		await page.locator('[data-test=start-game]').click()
		await waitForTurn(page)
		await clickSquare(page, 'e2')
		await clickSquare(page, 'e4')
		// the fake model plays the engine's first candidate and says so in the chat
		await expect(page.locator('.qc-moves__move')).toHaveCount(2, { timeout: 45_000 })
		await expect(page.getByText('A fine, solid move to start with!').first()).toBeVisible({ timeout: 15_000 })
		const chats = fake.requests.filter((r) => r.path.endsWith('/chat/completions'))
		expect(chats.length).toBeGreaterThan(0)
		expect(JSON.stringify(chats[0].body)).toContain('Professor Qubit')
		await testInfo.attach('ai-opponent', { body: await page.screenshot(), contentType: 'image/png' })
	})
})
