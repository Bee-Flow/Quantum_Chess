/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createAppConfig } from '@nextcloud/vite-config'

export default createAppConfig({
	main: 'src/main.js',
	'settings-admin': 'src/settings-admin.js',
	'settings-personal': 'src/settings-personal.js',
}, {
	inlineCSS: { relativeCSSInjection: true },
	config: {
		worker: {
			format: 'es',
		},
		build: {
			// the quantum engine + AI make a big but cache-friendly chunk
			chunkSizeWarningLimit: 2048,
		},
	},
})
