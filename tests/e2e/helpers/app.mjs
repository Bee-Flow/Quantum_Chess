/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Navigation inside the app. Client-side routes live in the URL hash (docs/SPEC.md §13–14.1), e.g. '/game/42',
 * '/trainer', '/rules'.
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
 * The Quantum Chess icon in the Nextcloud header: an `<img>` in the app menu up to Nextcloud 34, a CSS mask on the
 * "current app" button from Nextcloud 35.
 *
 * @param {import('@playwright/test').Page} page the page
 * @return {import('@playwright/test').Locator}
 */
export function appMenuIcon(page) {
	return page.locator('header img[src*="quantumchess/img/app.svg"], header [style*="quantumchess/img/app.svg"]').first()
}
