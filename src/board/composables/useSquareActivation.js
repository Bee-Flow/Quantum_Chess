/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * What a click, a tap, Enter on a focused square or the drop of a drag does, per move type (Move, Split, Merge,
 * Measure): select a piece, pick a split target or merge part, choose a move for the move flow, or explain why an
 * attempt is illegal. Part of the board's input controller (`useBoardInput`).
 */

import { whyIllegal } from '../../engine/index.js'
import { splitTargetsOf } from '../input/targets.js'

/** @typedef {import('../../engine/types.js').EngineState} EngineState */

/**
 * Create the square activation of a board input controller.
 *
 * @param {object} context the controller's state
 * @param {import('vue').ComputedRef<EngineState>} context.st the displayed state
 * @param {import('vue').ComputedRef<boolean>} context.canInteract whether input is accepted
 * @param {import('./useBoardSelection.js').BoardSelection} context.selection the selection state
 * @param {import('./useMoveFlow.js').MoveFlow} context.flow the move flow
 * @param {(code: string, square: number|null) => object} context.reject reports an illegal attempt
 * @return {{activate: (square: number, opts?: {shift?: boolean}) => string,
 *   drop: (from: number, to: number) => string}}
 */
export function useSquareActivation({ st, canInteract, selection: sel, flow, reject }) {
	const { mode, selection, splitFirst, mergeSources, targetAt, ownPiece, partsOf, isGhostPart } = sel
	const { pending, promotion, safetyNet, choose, confirm } = flow

	/**
	 * A click on a square in the Move mode.
	 *
	 * @param {number} square the square
	 * @param {boolean} shift Shift was held (split accelerator)
	 * @return {string} what happened, as `activate()`
	 */
	function activateMove(square, shift) {
		const target = targetAt(square)
		const s = selection.value
		if (target !== null && s !== null) {
			if (target.kind === 'merge-part') {
				mode.value = 'merge'
				mergeSources.value = [Math.min(s, square), Math.max(s, square)]
				return 'merge'
			}
			if (shift && splitTargetsOf(st.value, s).targets.some((x) => x.square === square && x.legal)) {
				mode.value = 'split'
				splitFirst.value = square
				return 'split-first'
			}
			return choose(target)
		}
		if (square === s) {
			sel.clearSelection()
			return 'deselect'
		}
		if (ownPiece(square) !== null) {
			sel.selectSquare(square)
			return 'select'
		}
		if (s !== null) {
			const code = whyIllegal(st.value, { type: 'standard', from: [s], to: [square] })
			sel.clearSelection()
			if (code !== null && code !== 'no_piece' && code !== 'not_your_piece') {
				reject(code, square)
				return 'illegal'
			}
			return 'deselect'
		}
		return 'none'
	}

	/**
	 * A click on a square in the Split mode.
	 *
	 * @param {number} square the square
	 * @return {string} what happened, as `activate()`
	 */
	function activateSplit(square) {
		const target = targetAt(square)
		const s = selection.value
		if (s !== null && target !== null) {
			if (target.kind === 'split-chosen') {
				splitFirst.value = null
				return 'split-first'
			}
			if (target.disabled) {
				reject(target.code ?? 'split_blocked', square)
				return 'illegal'
			}
			if (splitFirst.value === null) {
				splitFirst.value = square
				return 'split-first'
			}
			return choose(target)
		}
		if (square === s) {
			sel.clearSelection()
			return 'deselect'
		}
		if (ownPiece(square) !== null) {
			sel.selectSquare(square)
			const reason = splitTargetsOf(st.value, square).reason
			if (reason !== null) {
				reject(reason, square)
			}
			return 'select'
		}
		sel.clearSelection()
		return 'deselect'
	}

	/**
	 * A click on a square in the Merge mode.
	 *
	 * @param {number} square the square
	 * @return {string} what happened, as `activate()`
	 */
	function activateMerge(square) {
		const target = targetAt(square)
		if (target !== null) {
			if (target.kind === 'merge-part') {
				mergeSources.value = [Math.min(mergeSources.value[0], square), Math.max(mergeSources.value[0], square)]
				return 'merge'
			}
			return choose(target)
		}
		if (square === selection.value || mergeSources.value.includes(square)) {
			sel.clearSelection()
			return 'deselect'
		}
		return selectGhost(square)
	}

	/**
	 * A click on a square in the Measure mode.
	 *
	 * @param {number} square the square
	 * @return {string} what happened, as `activate()`
	 */
	function activateMeasure(square) {
		const target = targetAt(square)
		if (selection.value !== null && target !== null) {
			return choose(target)
		}
		return selectGhost(square)
	}

	/**
	 * Select a ghost part for Merge or Measure; a solid piece of the player is rejected.
	 *
	 * @param {number} square the square
	 * @return {string} select | illegal | deselect
	 */
	function selectGhost(square) {
		if (ownPiece(square) !== null) {
			if (!isGhostPart(square)) {
				sel.clearSelection()
				reject('not_superposed', square)
				return 'illegal'
			}
			sel.selectSquare(square)
			return 'select'
		}
		sel.clearSelection()
		return 'deselect'
	}

	/**
	 * Activate a square: a click, a tap or Enter on the focused square.
	 *
	 * @param {number} square square index
	 * @param {object} [opts] options
	 * @param {boolean} [opts.shift] Shift was held (split accelerator)
	 * @return {string} what happened (select | deselect | target | promotion | safety | pending | committed |
	 *   split-first | merge | illegal | none)
	 */
	function activate(square, { shift = false } = {}) {
		if (!canInteract.value || promotion.value !== null || safetyNet.value !== null) {
			return 'none'
		}
		if (pending.value !== null) {
			const pm = pending.value.move
			if (pm.to.includes(square) || (pm.type === 'measure' && partsOf(square).includes(pm.from[0]))) {
				confirm()
				return 'committed'
			}
			pending.value = null
		}
		switch (mode.value) {
			case 'move':
				return activateMove(square, shift)
			case 'split':
				return activateSplit(square)
			case 'merge':
				return activateMerge(square)
			default:
				return activateMeasure(square)
		}
	}

	/**
	 * A drop at the end of a drag from `from` onto `to`.
	 *
	 * @param {number} from start square
	 * @param {number} to drop square
	 * @return {string} as activate(), or 'illegal'
	 */
	function drop(from, to) {
		if (!canInteract.value) {
			return 'none'
		}
		if (selection.value !== from) {
			sel.selectSquare(from)
		}
		if (from === to) {
			return 'none'
		}
		const target = targetAt(to)
		if (target === null || target.disabled) {
			const code = target?.code
				?? whyIllegal(st.value, { type: 'standard', from: [from], to: [to] })
				?? 'unreachable'
			reject(code, to)
			return 'illegal'
		}
		return activate(to)
	}

	return { activate, drop }
}
