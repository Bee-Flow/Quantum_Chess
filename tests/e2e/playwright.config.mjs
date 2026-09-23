/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Playwright configuration of the end-to-end tests (docs/SPEC.md §15.2). They run against a running Nextcloud with
 * the app enabled; see tests/e2e/README.md for the environment variables.
 *
 *   npx playwright test -c tests/e2e/playwright.config.mjs            (npm run test:e2e, make e2e)
 *   npx playwright test -c tests/e2e/playwright.config.mjs --headed game
 */
import { defineConfig, devices } from '@playwright/test'
import { env } from './helpers/env.mjs'

const ci = Boolean(process.env.CI)
const launchOptions = env.chromium ? { executablePath: env.chromium } : {}

export default defineConfig({
	testDir: '.',
	testMatch: '**/*.spec.mjs',
	outputDir: '../../test-results/e2e',
	globalSetup: './global-setup.mjs',

	// One Nextcloud with shared users and games: run the files one after the other.
	fullyParallel: false,
	workers: 1,
	forbidOnly: ci,
	retries: ci ? 1 : 0,
	timeout: 60_000,
	expect: { timeout: 10_000 },

	reporter: [
		[ci ? 'github' : 'list'],
		['html', { outputFolder: '../../playwright-report', open: 'never' }],
	],

	use: {
		baseURL: env.baseURL,
		locale: 'en-US',
		timezoneId: 'Europe/Amsterdam',
		colorScheme: 'light',
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
		launchOptions,
	},

	projects: [
		{
			name: 'desktop',
			use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions },
		},
		{
			// Tests tagged @phone also run at phone size (G1 responsive layout)
			name: 'phone',
			grep: /@phone/,
			use: { ...devices['Pixel 7'], launchOptions },
		},
	],
})
