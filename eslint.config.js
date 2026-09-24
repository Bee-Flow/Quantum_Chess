/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { recommendedJavascript } from '@nextcloud/eslint-config'

export default [
	{
		ignores: [
			'js/**',
			'assets/**',
			'build/**',
			'vendor/**',
			'node_modules/**',
			'l10n/**',
			'coverage/**',
			'playwright-report/**',
			'test-results/**',
			'tests/fixtures/**/*.json',
		],
	},
	...recommendedJavascript,
	{
		files: ['src/ai/worker.js'],
		languageOptions: {
			globals: { self: 'readonly', postMessage: 'readonly' },
		},
	},
	{
		// Outside the rules engine and the computer player, import them through their entry points only
		// (docs/development/architecture.md, "Dependency rules").
		files: ['src/**/*.{js,vue}', 'tests/js/**/*.js'],
		ignores: ['src/engine/**', 'src/ai/**', 'tests/js/engine/**', 'tests/js/ai/**'],
		rules: {
			'no-restricted-imports': ['error', {
				patterns: [
					{
						regex: '^\\.{1,2}/(?:.*/)?engine/(?!index\\.js$|ui/index\\.js$)',
						message: 'Import the rules engine through engine/index.js or engine/ui/index.js.',
					},
					{
						regex: '^\\.{1,2}/(?:.*/)?ai/(?!client\\.js$|levels\\.js$)',
						message: 'Import the computer player through ai/client.js or ai/levels.js.',
					},
				],
			}],
		},
	},
]
