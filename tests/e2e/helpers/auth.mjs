/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Logging in. The global setup logs every test user in once and stores the browser state in
 * test-results/.auth/<uid>.json; tests reuse it through the `user` option of the fixtures in index.mjs, or call
 * login() themselves to test the login flow.
 */
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { authDir, env, getUser } from './env.mjs'

/**
 * Path of the stored browser state (cookies) of a user.
 *
 * @param {string|import('./env.mjs').TestUser} who test user key, uid or object
 * @return {string}
 */
export function authFile(who) {
	return join(authDir, `${getUser(who).uid}.json`)
}

/**
 * Log in through the Nextcloud login page.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string|import('./env.mjs').TestUser} who test user key, uid or object
 * @return {Promise<void>}
 */
export async function login(page, who) {
	const user = getUser(who)
	await page.goto(`${env.baseURL}${env.indexPhp}/login`)
	await page.locator('#user').fill(user.uid)
	await page.locator('#password').fill(user.password)
	await Promise.all([
		page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 60_000 }),
		page.locator('form button[type="submit"], form input[type="submit"]').first().click(),
	])
	await dismissFirstRunWizard(page)
}

/**
 * Close the "first run" welcome dialog of the firstrunwizard app if it is installed and shows up.
 *
 * @param {import('@playwright/test').Page} page the page
 * @return {Promise<void>}
 */
export async function dismissFirstRunWizard(page) {
	const wizard = page.locator('#firstrunwizard, .first-run-wizard, [class*="first-run"]').first()
	if (await wizard.isVisible({ timeout: 1500 }).catch(() => false)) {
		await page.keyboard.press('Escape')
	}
}

/**
 * Log a user in with a fresh context and store the browser state for later tests.
 *
 * @param {import('@playwright/test').Browser} browser the browser
 * @param {string|import('./env.mjs').TestUser} who test user key, uid or object
 * @return {Promise<string>} the path of the stored state
 */
export async function saveLogin(browser, who) {
	await mkdir(authDir, { recursive: true })
	const context = await browser.newContext({ baseURL: env.baseURL, locale: 'en-US' })
	const page = await context.newPage()
	try {
		await login(page, who)
		const file = authFile(who)
		await context.storageState({ path: file })
		return file
	} finally {
		await context.close()
	}
}

/**
 * Whether a stored login exists for the user.
 *
 * @param {string|import('./env.mjs').TestUser} who test user key, uid or object
 * @return {boolean}
 */
export function hasSavedLogin(who) {
	return existsSync(authFile(who))
}

/**
 * Open a new, logged-in page for a user in its own browser context. The caller closes the context.
 *
 * @param {import('@playwright/test').Browser} browser the browser
 * @param {string|import('./env.mjs').TestUser} who test user key, uid or object
 * @param {import('@playwright/test').BrowserContextOptions} [options] extra context options (viewport, colorScheme…)
 * @return {Promise<{context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page}>}
 */
export async function newUserPage(browser, who, options = {}) {
	const context = await browser.newContext({
		baseURL: env.baseURL,
		locale: 'en-US',
		...options,
		storageState: hasSavedLogin(who) ? authFile(who) : undefined,
	})
	const page = await context.newPage()
	if (!hasSavedLogin(who)) {
		await login(page, who)
	}
	return { context, page }
}
