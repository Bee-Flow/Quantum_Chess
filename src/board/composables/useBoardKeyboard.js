/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Keyboard input of the board. The grid has one tab stop (a roving focus square): the arrow keys, Home, End, Page Up
 * and Page Down move it, Enter and Space activate it, Escape cancels, and Tab cycles the parts of a ghost in the
 * what-if view. 1–4 pick the move type, E toggles the what-if view, W the possibilities panel, and D reads the position
 * aloud. With `hotkeys`, the letter keys work anywhere on the page, not only on the board.
 */

import { useHotKey } from '@nextcloud/vue/composables/useHotKey'
import { ref, toRaw } from 'vue'
import { describePosition } from '../../engine/ui/index.js'
import { unlockAudio } from '../../services/sound.js'
import { viewsOf } from '../boardModel.js'
import { squareAt, stepSquare } from '../geometry.js'
import { MODES } from './useBoardInput.js'

const NAVIGATION_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']

/**
 * @param {object} options the board
 * @param {() => object} options.state the live position (for the first focus square)
 * @param {import('vue').ComputedRef<object>} options.shown the displayed position (read aloud with D)
 * @param {() => 'w'|'b'} options.orientation the side at the bottom
 * @param {() => boolean} options.hotkeys the letter keys work on the whole page
 * @param {import('vue').ComputedRef<object>} options.input the input controller
 * @param {object} options.anim the board's animator
 * @param {import('vue').Ref<HTMLElement|null>} options.frame the element that spans the eight squares
 * @param {(square: number) => void} options.focusCell move the DOM focus to a square
 * @param {(square: number) => void} options.activate what Enter does on a square
 * @param {(text: string) => void} options.announce say something in the live region
 * @return {object} {focusSquare, hasFocus, keyboardPreview, onKeydown, onFocusIn, onFocusOut, onCellFocus, moveFocus}
 */
export function useBoardKeyboard({ state, shown, orientation, hotkeys, input, anim, frame, focusCell, activate, announce }) {
	/** The square that holds the tab stop. */
	const focusSquare = ref(defaultFocus())
	/** The focus is inside the board. */
	const hasFocus = ref(false)
	/** The move preview follows the keyboard focus instead of the pointer. */
	const keyboardPreview = ref(false)

	/**
	 * The first focused square: the king of the side at the bottom.
	 *
	 * @return {number}
	 */
	function defaultFocus() {
		const locs = viewsOf(toRaw(state())).locs[orientation() === 'w' ? 0 : 16]
		return locs.length > 0 ? locs[0].square : squareAt(4, 7, orientation())
	}

	/**
	 * A key on the grid.
	 *
	 * @param {KeyboardEvent} e event
	 */
	function onKeydown(e) {
		unlockAudio()
		if (anim.state.busy && !['Tab', 'Shift'].includes(e.key)) {
			anim.finish()
		}
		if (NAVIGATION_KEYS.includes(e.key)) {
			e.preventDefault()
			moveFocus(stepSquare(focusSquare.value, e.key, orientation()))
			return
		}
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault()
			activate(focusSquare.value)
			return
		}
		if (e.key === 'Escape') {
			if (input.value.cancel() !== null) {
				e.preventDefault()
				e.stopPropagation()
			}
			return
		}
		if (e.key === 'Tab' && input.value.whatIf !== null) {
			e.preventDefault()
			const s = input.value.cycleWhatIf(e.shiftKey ? -1 : 1)
			if (s !== null) {
				moveFocus(s)
			}
			return
		}
		if (hotkeys() || e.ctrlKey || e.metaKey || e.altKey) {
			return
		}
		if (handleLetter(e.key)) {
			e.preventDefault()
		}
	}

	/**
	 * The board's letter and number keys (1–4, E, W, D).
	 *
	 * @param {string} key the key
	 * @return {boolean} handled
	 */
	function handleLetter(key) {
		const k = key.toLowerCase()
		if (['1', '2', '3', '4'].includes(k)) {
			input.value.setMode(MODES[Number(k) - 1])
			return true
		}
		if (k === 'e') {
			if (input.value.whatIf !== null) {
				input.value.setWhatIf(null)
			} else {
				const s = [focusSquare.value, input.value.selection].find((x) => x !== null && input.value.isGhostPart(x))
				input.value.setWhatIf(s ?? null)
			}
			return true
		}
		if (k === 'w') {
			input.value.togglePanel()
			return true
		}
		if (k === 'd') {
			announce(describePosition(shown.value, { orientation: orientation() }))
			return true
		}
		return false
	}

	useHotKey(['1', '2', '3', '4', 'e', 'w', 'd'], (e) => {
		if (hotkeys()) {
			handleLetter(e.key)
		}
	})

	/**
	 * Move the roving focus.
	 *
	 * @param {number} square new focus square
	 */
	function moveFocus(square) {
		focusSquare.value = square
		keyboardPreview.value = true
		input.value.hover(square)
		focusCell(square)
	}

	/**
	 * A cell got the focus (Tab into the board, or a click).
	 *
	 * @param {number} square square
	 */
	function onCellFocus(square) {
		focusSquare.value = square
	}

	/** The focus entered the board. */
	function onFocusIn() {
		hasFocus.value = true
	}

	/**
	 * The focus moved; it may have left the board.
	 *
	 * @param {FocusEvent} e event
	 */
	function onFocusOut(e) {
		if (!e.relatedTarget || !frame.value?.contains(e.relatedTarget)) {
			hasFocus.value = false
			keyboardPreview.value = false
		}
	}

	return { focusSquare, hasFocus, keyboardPreview, onKeydown, onFocusIn, onFocusOut, onCellFocus, moveFocus }
}
