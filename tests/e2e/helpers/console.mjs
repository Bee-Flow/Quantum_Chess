/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Collects browser console errors, uncaught exceptions and failed app requests of a page, so a test can assert
 * that a flow ran cleanly.
 */

/**
 * Messages that come from Nextcloud itself or the browser, not from Quantum Chess. Keep this list short and
 * specific: an entry hides real problems if it is too broad.
 */
export const DEFAULT_IGNORED = [
	// the browser asks for a favicon the dev server does not have
	/favicon\.ico/,
	// Nextcloud core polls these; they fail harmlessly while the server restarts or without the apps
	/\/ocs\/v2\.php\/apps\/(notifications|user_status)\/.* (404|503)/,
	// Chromium blocks third-party cookies in tests
	/third-party cookie/i,
]

/**
 * @typedef {object} ConsoleCollector
 * @property {string[]} errors collected messages, prefixed with their kind
 * @property {() => void} clear forget what was collected so far
 * @property {() => string[]} take return the messages and clear them
 */

/**
 * Start collecting on a page.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {object} [options] options
 * @param {RegExp[]} [options.ignore] extra patterns to ignore (added to DEFAULT_IGNORED)
 * @param {boolean} [options.warnings] also collect console warnings
 * @return {ConsoleCollector}
 */
export function collectConsoleErrors(page, { ignore = [], warnings = false } = {}) {
	const patterns = [...DEFAULT_IGNORED, ...ignore]
	const errors = []
	const push = (message) => {
		if (!patterns.some((pattern) => pattern.test(message))) {
			errors.push(message)
		}
	}

	page.on('console', (message) => {
		const type = message.type()
		if (type === 'error' || (warnings && type === 'warning')) {
			const location = message.location()
			const where = location?.url ? ` (${location.url}:${location.lineNumber})` : ''
			push(`[console.${type}] ${message.text()}${where}`)
		}
	})
	page.on('pageerror', (error) => push(`[pageerror] ${error.message}`))
	page.on('response', (response) => {
		const url = response.url()
		if (response.status() >= 500 && url.includes('/apps/quantumchess/')) {
			push(`[http ${response.status()}] ${response.request().method()} ${url}`)
		}
	})

	return {
		errors,
		clear: () => errors.splice(0),
		take: () => errors.splice(0),
	}
}
