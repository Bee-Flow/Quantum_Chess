/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [vue()],
	test: {
		include: ['tests/js/**/*.spec.js', 'src/**/*.spec.js'],
		environment: 'node',
		environmentMatchGlobs: [['**/*.vue.spec.js', 'happy-dom']],
		testTimeout: 30000,
	},
})
