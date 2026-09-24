/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	plugins: [vue()],
	test: {
		include: ['tests/js/**/*.spec.js'],
		// DOM tests declare `// @vitest-environment happy-dom` in their header
		environment: 'node',
		testTimeout: 30000,
		// @nextcloud/vue ships CSS imports: let Vite transform it for component tests
		server: {
			deps: {
				inline: [/@nextcloud\/vue/],
			},
		},
		benchmark: {
			include: ['tests/js/**/*.bench.js'],
		},
	},
})
