/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The geometry of one board on screen: its square size and orientation, and the conversions between squares, board
 * units (the SVG layers use viewBox 0 0 8 8) and pixels.
 */

import { computed } from 'vue'
import { squareAt, squareCenter, squareXY } from '../geometry.js'

/**
 * @typedef {object} BoardGeometry
 * @property {number} S square size in px
 * @property {'w'|'b'} orientation the side at the bottom
 * @property {(square: number) => {x: number, y: number}} center center of a square in board units
 * @property {(square: number, inset: number) => {x: number, y: number, width: number, height: number, rx: number}}
 *   rectOf a square inset by `inset` board units, as SVG rect attributes
 * @property {(square: number) => {x: number, y: number}} pixelOf top-left corner of a square in px
 */

/**
 * @param {object} options the board
 * @param {() => 'w'|'b'} options.orientation the side at the bottom
 * @param {() => number} options.squareSize square size in px
 * @param {import('vue').Ref<HTMLElement|null>} options.frame the element that spans the eight squares
 * @return {{geo: import('vue').ComputedRef<BoardGeometry>, squareFromEvent: (e: PointerEvent) => number|null}}
 */
export function useBoardGeometry({ orientation, squareSize, frame }) {
	const geo = computed(() => {
		const S = squareSize()
		const o = orientation()
		return {
			S,
			orientation: o,
			center: (square) => squareCenter(square, o),
			rectOf(square, inset) {
				const { col, row } = squareXY(square, o)
				return { x: col + inset, y: row + inset, width: 1 - 2 * inset, height: 1 - 2 * inset, rx: 0.06 }
			},
			pixelOf(square) {
				const { col, row } = squareXY(square, o)
				return { x: col * S, y: row * S }
			},
		}
	})

	/**
	 * The square under a pointer event, or null outside the board.
	 *
	 * @param {PointerEvent} e pointer event
	 * @return {number|null}
	 */
	function squareFromEvent(e) {
		const rect = frame.value.getBoundingClientRect()
		const x = e.clientX - rect.left
		const y = e.clientY - rect.top
		if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) {
			return null
		}
		const col = Math.min(7, Math.floor(x / (rect.width / 8)))
		const row = Math.min(7, Math.floor(y / (rect.height / 8)))
		return squareAt(col, row, orientation())
	}

	return { geo, squareFromEvent }
}
