/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The board's input controller: turns clicks, drags and keys into moves. It combines the selection state
 * (`useBoardSelection`: move type, selected piece, targets), the move flow (`useMoveFlow`: promotion, king safety net,
 * "Confirm moves", commit) and the square activation (`useSquareActivation`: what a click or drop does per move type),
 * and adds cancelling, hovering, the feedback on illegal attempts, the what-if view and the possibilities panel. One
 * controller is shared by `QuantumBoard` and `BoardControls`; the board translates DOM events into calls of this
 * controller.
 */

import { computed, reactive, ref, shallowRef, toRaw, toValue, watch } from 'vue'
import { reasonText } from '../../engine/ui/index.js'
import { boardPrefs } from '../boardPreferences.js'
import { movePreview } from '../preview.js'
import { useBoardSelection } from './useBoardSelection.js'
import { useMoveFlow } from './useMoveFlow.js'
import { useSquareActivation } from './useSquareActivation.js'

export { SAFETY_MARGIN, SAFETY_RISK } from '../input/safetyNet.js'
export { markerKind, MODES } from '../input/targets.js'

/** @typedef {import('../../engine/types.js').EngineState} EngineState */
/** @typedef {import('../../engine/types.js').LegalMove} LegalMove */

/**
 * The board input controller: a reactive object that unwraps the refs of `BoardSelection` and `MoveFlow` and adds the
 * members below.
 *
 * @typedef {import('./useBoardSelection.js').BoardSelection & import('./useMoveFlow.js').MoveFlow & BoardInputActions} BoardInput
 */

/**
 * @typedef {object} BoardInputActions
 * @property {import('vue').ComputedRef<boolean>} canInteract whether input is accepted now
 * @property {import('vue').ComputedRef<object|null>} previewInfo the preview of the hovered, pending or measured move
 * @property {import('vue').ShallowRef<object|null>} feedback the last rejected attempt: `{seq, code, square, text}`
 * @property {import('vue').Ref<number|null>} whatIf the ghost part whose what-if view is open
 * @property {import('vue').Ref<boolean>} panelOpen whether the possibilities panel is open
 * @property {(square: number, opts?: {shift?: boolean}) => string} activate a click, tap or Enter on a square
 * @property {(from: number, to: number) => string} drop the end of a drag
 * @property {(square: number|null) => void} hover hover or keyboard focus on a square
 * @property {(square: number) => boolean} select select a piece, mode-aware
 * @property {() => string|null} cancel cancel the innermost step
 * @property {(code: string, square: number|null) => object} reject report an illegal attempt
 * @property {(square: number) => boolean} isMovablePiece whether a drag may start on a square
 * @property {(square: number|null) => boolean} setWhatIf open or close the what-if view
 * @property {(step?: number) => number|null} cycleWhatIf move the what-if view to the next part
 * @property {(open?: boolean) => void} togglePanel open or close the possibilities panel
 * @property {() => void} reset back to Move with nothing selected
 * @property {() => void} newGame reset, and forget "Don't ask again this game"
 */

/**
 * Create a board input controller.
 *
 * @param {object} options options (refs, getters or plain values)
 * @param {EngineState|import('vue').MaybeRefOrGetter<EngineState>} options.state the displayed state
 * @param {LegalMove[]|import('vue').MaybeRefOrGetter<LegalMove[]>} [options.legalMoves] the moves the local user may
 *   play now
 * @param {'w'|'b'|'both'|null|import('vue').MaybeRefOrGetter<'w'|'b'|'both'|null>} [options.movableColor] whose pieces
 *   may be moved
 * @param {boolean|import('vue').MaybeRefOrGetter<boolean>} [options.interactive] whether input is accepted
 * @param {object} [options.preferences] preference source (default: boardPrefs)
 * @return {BoardInput}
 */
export function useBoardInput({ state, legalMoves = [], movableColor = null, interactive = false, preferences = boardPrefs }) {
	const whatIf = ref(null)
	const feedback = shallowRef(null)
	const panelOpen = ref(false)
	let feedbackSeq = 0

	const st = computed(() => toRaw(toValue(state)))
	const moves = computed(() => (toValue(legalMoves) ?? []).map((m) => toRaw(m)))
	const movable = computed(() => toValue(movableColor))
	const canInteract = computed(() => Boolean(toValue(interactive)) && st.value?.result === null)

	const sel = useBoardSelection({ st, moves, movable, canInteract })
	const flow = useMoveFlow({ st, moves, preferences, selection: sel })
	const { mode, selection, splitFirst, hovered, targetAt, occupant, ownPiece, partsOf, isGhostPart } = sel
	const { pending, promotion, safetyNet } = flow

	const previewMove = computed(() => {
		if (pending.value !== null) {
			return pending.value.move
		}
		if (mode.value === 'measure' && selection.value !== null) {
			return sel.measureMove(selection.value)
		}
		const h = hovered.value === null ? null : targetAt(hovered.value)
		return h?.move ?? null
	})

	const previewInfo = computed(() => {
		const m = previewMove.value
		if (m === null) {
			return null
		}
		try {
			return movePreview(st.value, m, { format: preferences.probabilityFormat, physics: preferences.physicsNames })
		} catch {
			return null
		}
	})

	/**
	 * Report an illegal attempt for the board's feedback (tooltip, shake, sound).
	 *
	 * @param {string} code ReasonCode
	 * @param {number|null} square square
	 * @return {object} the feedback: `{seq, code, square, text}`
	 */
	function reject(code, square) {
		feedbackSeq++
		const v = occupant(selection.value)
		const pawn = v?.type === 'p'
		const pawnPush = pawn && square !== null && (square - selection.value) % 8 === 0
		feedback.value = { seq: feedbackSeq, code, square, text: reasonText(code, { pawn, pawnPush }) }
		return feedback.value
	}

	/**
	 * Switch the move type; keeps the selected piece when it is valid in the new mode.
	 *
	 * @param {string} m move | split | merge | measure
	 * @return {boolean} whether the mode changed
	 */
	function setMode(m) {
		if (!sel.setMode(m)) {
			return false
		}
		pending.value = null
		return true
	}

	const { activate, drop } = useSquareActivation({ st, canInteract, selection: sel, flow, reject })

	/**
	 * Cancel the innermost step: promotion, safety net, pending move, what-if, split target, selection, move type.
	 *
	 * @return {string|null} what was cancelled
	 */
	function cancel() {
		if (promotion.value !== null) {
			promotion.value = null
			return 'promotion'
		}
		if (safetyNet.value !== null) {
			safetyNet.value = null
			return 'safety'
		}
		if (pending.value !== null) {
			pending.value = null
			return 'pending'
		}
		if (whatIf.value !== null) {
			whatIf.value = null
			return 'whatIf'
		}
		if (splitFirst.value !== null) {
			splitFirst.value = null
			return 'splitFirst'
		}
		if (selection.value !== null) {
			sel.clearSelection()
			return 'selection'
		}
		if (mode.value !== 'move') {
			mode.value = 'move'
			return 'mode'
		}
		return null
	}

	/**
	 * Open or close the what-if view on a ghost part.
	 *
	 * @param {number|null} square a part of a superposed piece, or null to close
	 * @return {boolean} whether the view changed
	 */
	function setWhatIf(square) {
		if (square === null) {
			whatIf.value = null
			return true
		}
		if (!isGhostPart(square)) {
			return false
		}
		whatIf.value = square
		return true
	}

	/**
	 * Cycle the what-if view to the next part of the same piece (Tab).
	 *
	 * @param {number} [step] +1 or -1
	 * @return {number|null} the part now shown
	 */
	function cycleWhatIf(step = 1) {
		if (whatIf.value === null) {
			return null
		}
		const parts = partsOf(whatIf.value)
		const i = parts.indexOf(whatIf.value)
		whatIf.value = parts[(i + step + parts.length) % parts.length]
		return whatIf.value
	}

	/**
	 * Hover or keyboard focus on a square (opens the preview of a target there).
	 *
	 * @param {number|null} square square
	 */
	function hover(square) {
		if (pending.value !== null) {
			return
		}
		hovered.value = square !== null && targetAt(square) !== null ? square : null
	}

	/**
	 * Whether the square holds a piece that may be picked up now (drag start).
	 *
	 * @param {number} square square
	 * @return {boolean}
	 */
	function isMovablePiece(square) {
		return canInteract.value && ownPiece(square) !== null
	}

	/**
	 * Open or close the possibilities panel (W).
	 *
	 * @param {boolean} [open] the new state (default: toggle)
	 */
	function togglePanel(open) {
		panelOpen.value = typeof open === 'boolean' ? open : !panelOpen.value
	}

	/** Back to Move with nothing selected (after a commit or a new position). */
	function reset() {
		sel.resetSelection()
		flow.closeFlow()
	}

	/** A new game: forget "Don't ask again this game". */
	function newGame() {
		flow.dontAskSafety.value = false
		reset()
		whatIf.value = null
	}

	// A new position ends every flow that referred to the old one.
	watch(st, (now, before) => {
		if (now !== before) {
			reset()
			whatIf.value = null
		}
	})
	watch(canInteract, (on) => {
		if (!on) {
			reset()
		}
	})

	return reactive({
		...sel,
		...flow,
		setMode,
		select: sel.selectSquare,
		previewInfo,
		whatIf,
		setWhatIf,
		cycleWhatIf,
		panelOpen,
		togglePanel,
		isMovablePiece,
		activate,
		drop,
		cancel,
		hover,
		feedback,
		reject,
		reset,
		newGame,
		canInteract,
	})
}
