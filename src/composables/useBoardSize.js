/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Integer board sizing (GAME-DESIGN §3.1): `S = max(36, floor(min(availW, availH, 880) / 8))`, measured on the game
 * view container (container widths, so 200 % zoom falls back to the stacked layout) in a rAF-throttled
 * ResizeObserver.
 */

import { onBeforeUnmount, onMounted, ref } from 'vue'

/** Nextcloud header height. */
export const HEADER_PX = 50

/**
 * The layout of a game view of this size.
 *
 * @param {number} width container width
 * @param {number} height viewport height
 * @return {'phone'|'phone-landscape'|'tablet'|'desktop'|'wide'}
 */
export function layoutFor(width, height) {
	if (height < 500 && width > height && width >= 560) {
		return 'phone-landscape'
	}
	if (width < 600) {
		return 'phone'
	}
	if (width < 860) {
		return 'tablet'
	}
	return width >= 1300 ? 'wide' : 'desktop'
}

/** Width of the side panel per layout. */
export const PANEL_PX = Object.freeze({ phone: 0, tablet: 0, 'phone-landscape': 240, desktop: 340, wide: 400 })

/** Vertical space taken by cards, controls, gaps and padding per layout (below the header). */
export const RESERVED_PX = Object.freeze({ phone: 200, tablet: 230, 'phone-landscape': 16, desktop: 212, wide: 212 })

/**
 * The square size for a container and viewport.
 *
 * @param {object} size sizes
 * @param {number} size.width container width
 * @param {number} size.height viewport height
 * @param {number} [size.reserved] extra vertical space to keep free
 * @return {{squareSize: number, boardPx: number, layout: string}}
 */
export function boardSizeFor({ width, height, reserved = 0 }) {
	const layout = layoutFor(width, height)
	const panel = PANEL_PX[layout]
	const padding = layout === 'phone' ? 8 : 16
	const availW = width - 2 * padding - (panel ? panel + 24 : 0)
	const availH = height - HEADER_PX - RESERVED_PX[layout] - reserved
	const cap = layout === 'tablet' ? 640 : 880
	const squareSize = Math.max(36, Math.floor(Math.min(availW, layout === 'phone' ? Infinity : availH, cap) / 8))
	return { squareSize, boardPx: 8 * squareSize, layout }
}

/**
 * @param {import('vue').Ref<HTMLElement|null>} containerRef game view container
 * @param {object} [options] {reserved}
 * @param options.reserved
 * @return {{squareSize: import('vue').Ref<number>, boardPx: import('vue').Ref<number>, layout: import('vue').Ref<string>}}
 */
export function useBoardSize(containerRef, { reserved = 0 } = {}) {
	const squareSize = ref(64)
	const boardPx = ref(512)
	const layout = ref('desktop')
	let frame = 0
	let observer = null

	/** Measure now. */
	function measure() {
		frame = 0
		const el = containerRef.value
		if (!el) {
			return
		}
		const r = boardSizeFor({ width: el.clientWidth, height: window.innerHeight, reserved })
		squareSize.value = r.squareSize
		boardPx.value = r.boardPx
		layout.value = r.layout
	}

	/** Measure in the next frame. */
	function schedule() {
		if (!frame) {
			frame = requestAnimationFrame(measure)
		}
	}

	onMounted(() => {
		measure()
		if (typeof ResizeObserver === 'function' && containerRef.value) {
			observer = new ResizeObserver(schedule)
			observer.observe(containerRef.value)
		}
		window.addEventListener('resize', schedule)
	})
	onBeforeUnmount(() => {
		observer?.disconnect()
		window.removeEventListener('resize', schedule)
		if (frame) {
			cancelAnimationFrame(frame)
		}
	})
	return { squareSize, boardPx, layout }
}
