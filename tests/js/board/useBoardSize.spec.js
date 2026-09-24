/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * useBoardSize: the board size in whole pixels per square, and the layout picked from the container.
 */

import { describe, expect, it } from 'vitest'
import { boardSizeFor, layoutFor } from '../../../src/board/composables/useBoardSize.js'

describe('board size', () => {
	it('uses integer squares of at least 36 px, capped at 880 px', () => {
		const desktop = boardSizeFor({ width: 1140, height: 900 })
		expect(desktop.layout).toBe('desktop')
		expect(Number.isInteger(desktop.squareSize)).toBe(true)
		expect(desktop.boardPx).toBe(8 * desktop.squareSize)
		expect(desktop.boardPx).toBeLessThanOrEqual(900 - 50 - 150)
		const phone = boardSizeFor({ width: 360, height: 740 })
		expect(phone).toMatchObject({ layout: 'phone', squareSize: 43 })
		expect(boardSizeFor({ width: 200, height: 300 }).squareSize).toBe(36)
		expect(boardSizeFor({ width: 4000, height: 3000 }).boardPx).toBeLessThanOrEqual(880)
	})

	it('picks the layout from the container', () => {
		expect(layoutFor(390, 844)).toBe('phone')
		expect(layoutFor(700, 1000)).toBe('tablet')
		expect(layoutFor(800, 400)).toBe('phone-landscape')
		expect(layoutFor(1600, 1000)).toBe('wide')
	})
})
