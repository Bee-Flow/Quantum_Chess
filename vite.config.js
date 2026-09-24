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
	// the computer player's Web Worker is emitted to assets/ under a content hash: clear it like js/, or old workers
	// pile up (and ship)
	emptyOutputDirectory: { additionalDirectories: ['assets'] },
	config: {
		worker: {
			format: 'es',
		},
		build: {
			// the rules engine and the computer player make a big but cache-friendly chunk
			chunkSizeWarningLimit: 2048,
		},
	},
})
