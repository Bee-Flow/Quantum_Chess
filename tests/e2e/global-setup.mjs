/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Runs once before the end-to-end tests: waits for Nextcloud, makes sure the test users exist (with occ, when the
 * server is reachable), and logs every test user in once, storing the browser state in test-results/.auth/.
 */
import { chromium } from '@playwright/test'
import { waitForServer } from './helpers/api.mjs'
import { saveLogin } from './helpers/auth.mjs'
import { env } from './helpers/env.mjs'
import { ensureUsers, occ } from './helpers/occ.mjs'

/**
 * @return {Promise<void>}
 */
export default async function globalSetup() {
	await waitForServer()

	if (env.occ && env.setupUsers) {
		await ensureUsers()
		const apps = await occ(['app:list', '--enabled', '--output=json'])
		if (!('quantumchess' in (JSON.parse(apps.stdout).enabled ?? {}))) {
			throw new Error('Quantum Chess is not enabled on the test server: run "occ app:enable quantumchess"')
		}
	}

	const browser = await chromium.launch(env.chromium ? { executablePath: env.chromium } : {})
	try {
		for (const key of Object.keys(env.users)) {
			await saveLogin(browser, key)
		}
	} finally {
		await browser.close()
	}
}
