/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Re-measuring a layout when an element or the window changes size.
 */

import { onBeforeUnmount, onMounted } from 'vue'

/**
 * Call `measure` once when the component is mounted and again, at most once per animation frame, whenever the
 * observed element or the window is resized. Everything is released when the component unmounts.
 *
 * @param {() => Element|null|undefined} target the element to observe, resolved when the component is mounted
 * @param {() => void} measure reads the sizes and updates the component's state
 */
export function useResizeMeasure(target, measure) {
	let frame = 0
	let observer = null

	/** Measure in the next animation frame, once for any number of calls. */
	function schedule() {
		if (!frame) {
			frame = requestAnimationFrame(() => {
				frame = 0
				measure()
			})
		}
	}

	onMounted(() => {
		measure()
		const el = target()
		if (typeof ResizeObserver === 'function' && el) {
			observer = new ResizeObserver(schedule)
			observer.observe(el)
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
}
