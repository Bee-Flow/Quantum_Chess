/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Pointer input of the board: click or tap to select and move, drag and drop, the hover that shows targets and the
 * preview card, Alt+hover for the what-if view, and the spring-back of a failed drop. The move rules themselves live in
 * the input controller (`useBoardInput`).
 */

import { ref, shallowRef } from 'vue'
import { unlockAudio } from '../../services/sound.js'

/** Pixels a pointer must travel before a press becomes a drag (mouse, touch). */
const DRAG_THRESHOLD_PX = { mouse: 4, touch: 8 }

/** Duration of the spring-back and shake of a failed drop in ms. */
const SPRING_BACK_MS = 320

/**
 * @param {object} options the board
 * @param {import('vue').Ref<HTMLElement|null>} options.frame the element that spans the eight squares
 * @param {import('vue').ComputedRef<object>} options.input the input controller
 * @param {object} options.anim the board's animator
 * @param {(e: PointerEvent) => number|null} options.squareFromEvent the square under a pointer
 * @param {import('vue').ComputedRef<object[]>} options.items the pieces on the board (`pieceItems()`)
 * @param {() => string} options.inputMode the input preference: both, click or drag
 * @param {import('vue').Ref<boolean>} options.keyboardPreview the preview follows the keyboard focus
 * @param {(square: number, options: {shift: boolean}) => void} options.activate click or tap on a square
 * @return {object} {drag, pointerSquare, returning, shaking, onPointerDown, onPointerMove, onPointerUp,
 *   onPointerCancel, onPointerLeave}
 */
export function useBoardPointer({ frame, input, anim, squareFromEvent, items, inputMode, keyboardPreview, activate }) {
	/** The piece being dragged: {from, key, dragging, touch, x, y, over}. */
	const drag = shallowRef(null)
	/** The square under the pointer. */
	const pointerSquare = ref(null)
	/** Key of the piece springing back after a failed drop. */
	const returning = ref(null)
	/** Square of the piece that shakes after a failed drop. */
	const shaking = ref(null)
	let press = null
	let altWhatIf = false

	/**
	 * Press: remember where; a movable piece may become a drag.
	 *
	 * @param {PointerEvent} e event
	 */
	function onPointerDown(e) {
		unlockAudio()
		if (e.button !== undefined && e.button !== 0) {
			return
		}
		if (anim.state.busy) {
			anim.finish()
			return
		}
		const square = squareFromEvent(e)
		if (square === null) {
			return
		}
		const draggable = inputMode() !== 'click' && input.value.isMovablePiece(square)
		press = { square, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch', draggable, shift: e.shiftKey }
		if (draggable) {
			frame.value.setPointerCapture?.(e.pointerId)
		}
	}

	/**
	 * Move: start or follow a drag, or hover.
	 *
	 * @param {PointerEvent} e event
	 */
	function onPointerMove(e) {
		const square = squareFromEvent(e)
		if (press && press.draggable) {
			const dist = Math.hypot(e.clientX - press.x, e.clientY - press.y)
			if (drag.value === null && dist > (press.touch ? DRAG_THRESHOLD_PX.touch : DRAG_THRESHOLD_PX.mouse)) {
				if (input.value.selection !== press.square) {
					input.value.select(press.square)
				}
				const item = items.value.find((p) => p.square === press.square)
				drag.value = { from: press.square, key: item?.key, dragging: true, touch: press.touch, x: 0, y: 0, over: null }
			}
			if (drag.value) {
				const rect = frame.value.getBoundingClientRect()
				drag.value = { ...drag.value, x: e.clientX - rect.left, y: e.clientY - rect.top, over: square }
				input.value.hover(square)
				keyboardPreview.value = false
				return
			}
		}
		if (pointerSquare.value !== square) {
			pointerSquare.value = square
			if (!press && square !== null) {
				input.value.hover(square)
				keyboardPreview.value = false
			}
		}
		if (e.altKey && square !== null && input.value.isGhostPart(square)) {
			if (input.value.whatIf !== square) {
				input.value.setWhatIf(square)
			}
			altWhatIf = true
		} else if (altWhatIf && !e.altKey) {
			altWhatIf = false
			input.value.setWhatIf(null)
		}
	}

	/**
	 * Release: drop a dragged piece, or activate the square.
	 *
	 * @param {PointerEvent} e event
	 */
	function onPointerUp(e) {
		const p = press
		press = null
		if (!p) {
			return
		}
		const square = squareFromEvent(e)
		if (drag.value) {
			const d = drag.value
			drag.value = null
			const result = square === null ? 'illegal' : input.value.drop(d.from, square)
			if (result === 'illegal' || result === 'none') {
				springBack(d.key, d.from)
			}
			return
		}
		if (square === null || inputMode() === 'drag') {
			if (square !== null && !input.value.isMovablePiece(square) && input.value.selection !== null) {
				input.value.clearSelection()
			}
			return
		}
		activate(square, { shift: p.shift })
	}

	/** The pointer was cancelled: drop the drag. */
	function onPointerCancel() {
		if (drag.value) {
			springBack(drag.value.key, drag.value.from)
		}
		drag.value = null
		press = null
	}

	/** The pointer left the board. */
	function onPointerLeave() {
		if (!press) {
			pointerSquare.value = null
			if (!keyboardPreview.value) {
				input.value.hover(null)
			}
		}
		if (altWhatIf) {
			altWhatIf = false
			input.value.setWhatIf(null)
		}
	}

	/**
	 * Animate a dragged piece back to its square with a small shake.
	 *
	 * @param {string} key piece key
	 * @param {number} square its square
	 */
	function springBack(key, square) {
		returning.value = key
		shaking.value = square
		setTimeout(() => {
			returning.value = null
			shaking.value = null
		}, SPRING_BACK_MS)
	}

	return { drag, pointerSquare, returning, shaking, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave }
}
