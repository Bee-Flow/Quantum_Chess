/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Board palette contrast (GAME-DESIGN §9.1): rings, threads and marker rims keep 3:1 against both square colours of
 * every theme; badge text keeps 7:1 on the badge.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../../src/styles/board-themes.scss', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('../../../src/styles/tokens.scss', import.meta.url), 'utf8')

/**
 * Relative luminance of a hex colour.
 *
 * @param {number[]} rgb 0..255
 * @return {number}
 */
function luminance([r, g, b]) {
	const f = (c) => {
		const x = c / 255
		return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
	}
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
function ratio(a, b) {
	const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
	return (x + 0.05) / (y + 0.05)
}
const over = (rgb, alpha, base) => rgb.map((c, i) => c * alpha + base[i] * (1 - alpha))

/**
 * The variables of one theme block.
 *
 * @param {string} theme theme id
 * @return {Record<string, string>}
 */
function themeVars(theme) {
	const block = new RegExp(`\\[data-board-theme='${theme}'\\] \\{([^}]*)\\}`).exec(css)[1]
	return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

describe('board palette', () => {
	for (const theme of ['wood', 'slate', 'quantum', 'contrast']) {
		it(`keeps 3:1 for rings and marker rims on ${theme}`, () => {
			const v = themeVars(theme)
			const squares = [hex(v['--qc-sq-light']), hex(v['--qc-sq-dark'])]
			const ring = hex(v['--qc-board-ring'])
			const rim = over([11, 22, 34], theme === 'contrast' ? 1 : 0.82, [0, 0, 0])
			for (const sq of squares) {
				expect(ratio(ring, sq)).toBeGreaterThanOrEqual(3)
				expect(ratio(over([11, 22, 34], 0.82, sq), sq)).toBeGreaterThanOrEqual(3)
				expect(ratio(rim, sq)).toBeGreaterThanOrEqual(3)
			}
		})
	}

	it('keeps 7:1 for badge text', () => {
		expect(tokens).toContain('--qc-quantum-board: #3f1ca0')
		const badge = over([255, 255, 255], 0.92, [0x8a, 0x79, 0xc6])
		expect(ratio(hex('#111111'), badge)).toBeGreaterThanOrEqual(7)
	})
})
