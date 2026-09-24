/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Navigation inside the app. Client-side routes live in the URL hash, e.g. '/game/42', '/trainer', '/rules'.
 */
import { appUrl } from './env.mjs'

/** The element the app renders into once it has mounted (NcContent with app-name="quantumchess"). */
export const APP_ROOT = '#content-vue'

/**
 * Open the app, optionally at a client-side route, and wait until it has mounted.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} [route] client-side route, e.g. '/game/42' (with or without a leading '#')
 * @param {object} [options] options
 * @param {string} [options.ready] selector that signals the view is ready (default: the app root)
 * @return {Promise<void>}
 */
export async function openApp(page, route = '', { ready = APP_ROOT } = {}) {
	const hash = route === '' ? '' : `#/${route.replace(/^#?\/?/, '')}`
	await page.goto(appUrl(hash))
	await page.locator(ready).first().waitFor({ state: 'visible', timeout: 30_000 })
}

/**
 * Wait until the app has saved a document with a PUT request, for example the debounced save of the preferences or
 * the trainer progress. Start waiting before the action that triggers the save.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} route the route below the app's API, e.g. '/settings/preferences'
 * @param {(body: object) => boolean} [matches] accept only a request whose JSON body matches
 * @return {Promise<import('@playwright/test').Response>}
 */
export function waitForSave(page, route, matches = () => true) {
	return page.waitForResponse((response) => {
		const request = response.request()
		if (request.method() !== 'PUT' || !new URL(response.url()).pathname.endsWith(`/apps/quantumchess/api${route}`)) {
			return false
		}
		try {
			return response.ok() && matches(request.postDataJSON() ?? {})
		} catch {
			return false
		}
	})
}

/**
 * The Quantum Chess icon in the Nextcloud header: an `<img>` in the app menu up to Nextcloud 34, a CSS mask on the
 * "current app" button from Nextcloud 35.
 *
 * @param {import('@playwright/test').Page} page the page
 * @return {import('@playwright/test').Locator}
 */
export function appMenuIcon(page) {
	return page.locator('header img[src*="quantumchess/img/app.svg"], header [style*="quantumchess/img/app.svg"]').first()
}
