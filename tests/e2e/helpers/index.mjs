/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Entry point for spec files: `import { test, expect, openApp } from './helpers/index.mjs'`.
 *
 * `test` is Playwright's test with these additions:
 * - option `user` ('admin' by default): the built-in `page` is logged in as that user,
 *   e.g. `test.use({ user: 'bob' })`;
 * - `consoleErrors` (automatic): collects console errors of `page` and fails the test if any remain at the end;
 *   call `consoleErrors.clear()` after a step that is expected to log an error;
 * - `openAs(user, options?)`: a further logged-in page in its own context, with its own error check;
 * - `twoUsers`: `{ bob, carol }`, two logged-in pages for multiplayer tests (users from env.users).
 */
import { test as base, expect } from '@playwright/test'
import { authFile, hasSavedLogin, newUserPage } from './auth.mjs'
import { collectConsoleErrors } from './console.mjs'
import { getUser } from './env.mjs'

export { expect }
export { api, ApiError, ocs, waitForServer } from './api.mjs'
export { APP_ROOT, appMenuIcon, openApp } from './app.mjs'
export { authFile, login, newUserPage, saveLogin } from './auth.mjs'
export { collectConsoleErrors, DEFAULT_IGNORED } from './console.mjs'
export { appUrl, env, getUser } from './env.mjs'
export { ensureUser, ensureUsers, occ, resetAppData, setAppConfig, setUserSetting } from './occ.mjs'

/**
 * @param {import('@playwright/test').TestInfo} testInfo current test
 * @return {boolean} whether the test has passed so far (then leftover console errors should fail it)
 */
const passedSoFar = (testInfo) => testInfo.status === testInfo.expectedStatus

export const test = base.extend({
	user: ['admin', { option: true }],

	storageState: async ({ user }, use) => {
		await use(hasSavedLogin(user) ? authFile(user) : undefined)
	},

	consoleErrors: [async ({ page }, use, testInfo) => {
		const collector = collectConsoleErrors(page)
		await use(collector)
		if (passedSoFar(testInfo)) {
			expect(collector.errors, 'console errors on the page').toEqual([])
		}
	}, { auto: true }],

	openAs: async ({ browser, viewport }, use, testInfo) => {
		const opened = []
		await use(async (who, options = {}) => {
			const { context, page } = await newUserPage(browser, who, { viewport, ...options })
			const consoleErrors = collectConsoleErrors(page)
			opened.push({ context, consoleErrors, who })
			return { context, page, consoleErrors }
		})
		for (const { context, consoleErrors, who } of opened) {
			await context.close()
			if (passedSoFar(testInfo)) {
				expect(consoleErrors.errors, `console errors on the page of ${getUser(who).uid}`).toEqual([])
			}
		}
	},

	twoUsers: async ({ openAs }, use) => {
		const bob = await openAs('bob')
		const carol = await openAs('carol')
		await use({ bob, carol })
	},
})
