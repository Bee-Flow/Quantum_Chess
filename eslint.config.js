/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { recommendedJavascript } from '@nextcloud/eslint-config'

export default [
	{
		ignores: ['js/**', 'css/**', 'vendor/**', 'node_modules/**', 'tests/fixtures/**/*.json', 'l10n/**', 'build/**'],
	},
	...recommendedJavascript,
	{
		files: ['src/ai/worker.js'],
		languageOptions: {
			globals: { self: 'readonly', postMessage: 'readonly' },
		},
	},
]
