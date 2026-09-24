/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The selection half of the board's input controller: the move type (Move, Split, Merge, Measure) with the reason
 * when one is unavailable, the selected piece, the chosen split target and merge sources, the hovered square, and the
 * targets that follow from them. The targets themselves are computed by the pure module `board/input/targets.js`.
 */

import { computed, ref } from 'vue'
import { pieceLocations, squareView } from '../../engine/index.js'
import { modeAvailability, MODES, movesByType, moveTargets, splitTargetsOf } from '../input/targets.js'

/** @typedef {import('../../engine/types.js').EngineState} EngineState */
/** @typedef {import('../../engine/types.js').LegalMove} LegalMove */
/** @typedef {import('../input/targets.js').Target} Target */

/**
 * @typedef {object} BoardSelection
 * @property {import('vue').Ref<string>} mode move | split | merge | measure
 * @property {import('vue').Ref<number|null>} selection the selected square
 * @property {import('vue').Ref<number|null>} splitFirst the first target of a split, once chosen
 * @property {import('vue').Ref<number[]>} mergeSources the two parts of a merge, once chosen
 * @property {import('vue').Ref<number|null>} hovered the hovered or focused target square
 * @property {import('vue').ComputedRef<object>} modes per move type: `{enabled, reason}`
 * @property {import('vue').ComputedRef<Target[]>} targets the targets of the current selection
 * @property {(square: number) => Target|null} targetAt the target on a square
 * @property {(square: number|null) => object|null} occupant the square view of a square
 * @property {(square: number|null) => object|null} ownPiece the occupant, when it may be moved now
 * @property {(square: number) => number[]} partsOf the squares of the piece on a square
 * @property {(square: number) => boolean} isGhostPart whether the square holds a part of a superposed piece
 * @property {(square: number) => LegalMove|null} measureMove the legal Measure move of a piece
 * @property {() => void} clearSelection clear the selection (not the mode)
 * @property {(square: number) => boolean} selectSquare select a piece, mode-aware
 * @property {(m: string) => boolean} setMode switch the move type
 * @property {(move: LegalMove) => void} showMove select a move's piece and targets without playing it
 * @property {() => void} resetSelection back to Move with nothing selected
 */

/**
 * Create the selection state of a board input controller.
 *
 * @param {object} context reactive inputs of the controller
 * @param {import('vue').ComputedRef<EngineState>} context.st the displayed state
 * @param {import('vue').ComputedRef<LegalMove[]>} context.moves the moves the local user may play now
 * @param {import('vue').ComputedRef<'w'|'b'|'both'|null>} context.movable whose pieces may be moved
 * @param {import('vue').ComputedRef<boolean>} context.canInteract whether input is accepted
 * @return {BoardSelection}
 */
export function useBoardSelection({ st, moves, movable, canInteract }) {
	const mode = ref('move')
	const selection = ref(null)
	const splitFirst = ref(null)
	const mergeSources = ref([])
	const hovered = ref(null)

	const view = computed(() => squareView(st.value))
	const locations = computed(() => pieceLocations(st.value))

	const isMovableColor = (color) => movable.value === 'both' || movable.value === color
	const occupant = (square) => (square === null || square < 0 ? null : view.value[square])
	const ownPiece = (square) => {
		const v = occupant(square)
		return v !== null && isMovableColor(v.color) && v.color === st.value.turn ? v : null
	}
	const partsOf = (square) => {
		const v = occupant(square)
		return v === null ? [] : locations.value[v.piece].map((l) => l.square)
	}
	const isGhostPart = (square) => partsOf(square).length > 1

	const byType = computed(() => movesByType(moves.value))
	const modes = computed(() => modeAvailability(st.value, byType.value, locations.value, canInteract.value))

	const targets = computed(() => {
		if (selection.value === null || !canInteract.value) {
			return []
		}
		return moveTargets(
			{
				mode: mode.value,
				selection: selection.value,
				splitFirst: splitFirst.value,
				mergeSources: mergeSources.value,
			},
			{ state: st.value, byType: byType.value, locations: locations.value, occupant, partsOf, measureMove },
		)
	})

	const targetAt = (square) => targets.value.find((x) => x.square === square) ?? null

	/**
	 * The Measure move of the piece on `square`, if legal.
	 *
	 * @param {number} square a part of the piece
	 * @return {LegalMove|null}
	 */
	function measureMove(square) {
		const parts = partsOf(square)
		if (parts.length < 2) {
			return null
		}
		return byType.value.measure.find((m) => m.from[0] === parts[0]) ?? null
	}

	/** Clear the selection state (not the mode, the what-if view or a move in progress). */
	function clearSelection() {
		selection.value = null
		splitFirst.value = null
		mergeSources.value = []
		hovered.value = null
	}

	/**
	 * Select a square (a piece of the side to move), mode-aware.
	 *
	 * @param {number} square square
	 * @return {boolean} whether something was selected
	 */
	function selectSquare(square) {
		const v = ownPiece(square)
		if (v === null) {
			clearSelection()
			return false
		}
		splitFirst.value = null
		hovered.value = null
		if (mode.value === 'merge') {
			const parts = partsOf(square)
			if (parts.length < 2) {
				clearSelection()
				return false
			}
			selection.value = square
			mergeSources.value = parts.length === 2 ? parts.slice() : [square]
			return true
		}
		if (mode.value === 'measure' && partsOf(square).length < 2) {
			clearSelection()
			return false
		}
		selection.value = square
		mergeSources.value = []
		return true
	}

	/**
	 * Switch the move type; keeps the selected piece when it is valid in the new mode.
	 *
	 * @param {string} m move | split | merge | measure
	 * @return {boolean} whether the mode changed
	 */
	function setMode(m) {
		if (!MODES.includes(m) || !modes.value[m].enabled) {
			return false
		}
		const keep = selection.value
		mode.value = m
		splitFirst.value = null
		mergeSources.value = []
		hovered.value = null
		if (keep !== null) {
			let valid = ownPiece(keep) !== null
			if (m === 'split') {
				valid = valid && splitTargetsOf(st.value, keep).reason === null
			} else if (m === 'merge' || m === 'measure') {
				valid = valid && isGhostPart(keep)
			}
			if (valid) {
				selectSquare(keep)
			} else {
				selection.value = null
			}
		}
		return true
	}

	/**
	 * Select a move's piece, mode and targets without playing it (the safety net's "Show").
	 *
	 * @param {LegalMove} move the move to show
	 */
	function showMove(move) {
		const m = move.type === 'standard' ? 'move' : move.type
		mode.value = modes.value[m]?.enabled ? m : 'move'
		selection.value = move.from[0]
		mergeSources.value = move.type === 'merge' ? move.from.slice() : []
		splitFirst.value = move.type === 'split' ? move.to[0] : null
		hovered.value = move.to.length > 0 ? move.to[move.to.length - 1] : move.from[0]
	}

	/** Back to Move with nothing selected. */
	function resetSelection() {
		mode.value = 'move'
		clearSelection()
	}

	return {
		mode,
		selection,
		splitFirst,
		mergeSources,
		hovered,
		modes,
		targets,
		targetAt,
		occupant,
		ownPiece,
		partsOf,
		isGhostPart,
		measureMove,
		clearSelection,
		selectSquare,
		setMode,
		showMove,
		resetSelection,
	}
}
