/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The steps between choosing a move on the board and playing it: the promotion picker, the king safety net and the
 * "Confirm moves" step, then the commit to the registered listeners. Part of the board's input controller
 * (`useBoardInput`); the safety net's thresholds live in the pure module `board/input/safetyNet.js`.
 */

import { ref, shallowRef } from 'vue'
import { safetyWarning } from '../input/safetyNet.js'

/** @typedef {import('../../engine/types.js').EngineState} EngineState */
/** @typedef {import('../../engine/types.js').LegalMove} LegalMove */
/** @typedef {import('../input/safetyNet.js').SafetyWarning} SafetyWarning */
/** @typedef {import('./useBoardSelection.js').BoardSelection} BoardSelection */

/**
 * @typedef {object} MoveFlow
 * @property {import('vue').ShallowRef<{move: LegalMove}|null>} pending a move waiting for confirmation
 * @property {import('vue').ShallowRef<{square: number, moves: LegalMove[], color: string}|null>} promotion an open
 *   promotion picker
 * @property {import('vue').ShallowRef<SafetyWarning|null>} safetyNet an open safety net question
 * @property {import('vue').Ref<boolean>} dontAskSafety "Don't ask again this game" was chosen
 * @property {(target: {move?: LegalMove|null, moves?: LegalMove[]}) => string} choose go on with a chosen move
 * @property {(type: string|null) => string|null} choosePromotion choose the promotion piece, or cancel
 * @property {(action: 'play'|'show'|'cancel', dontAskAgain?: boolean) => string|null} resolveSafetyNet answer the
 *   safety net
 * @property {() => void} confirm play the pending move
 * @property {(callback: (move: LegalMove) => void) => () => void} onCommit register a commit listener
 * @property {() => void} closeFlow close the promotion picker, the safety net and the pending move
 */

/**
 * Create the move flow of a board input controller.
 *
 * @param {object} context the controller's state
 * @param {import('vue').ComputedRef<EngineState>} context.st the displayed state
 * @param {import('vue').ComputedRef<LegalMove[]>} context.moves the moves the local user may play now
 * @param {object} context.preferences preference source (`autoQueen`, `safetyNet`, `confirmMovesEffective`)
 * @param {BoardSelection} context.selection the controller's selection state
 * @return {MoveFlow}
 */
export function useMoveFlow({ st, moves, preferences, selection }) {
	const pending = shallowRef(null)
	const promotion = shallowRef(null)
	const safetyNet = shallowRef(null)
	const dontAskSafety = ref(false)
	const listeners = new Set()

	/**
	 * Go on with a chosen move: promotion, safety net, confirmation, commit.
	 *
	 * @param {{move?: LegalMove|null, moves?: LegalMove[]}} target a target descriptor or `{moves}`
	 * @return {string} what happened: promotion | safety | pending | committed
	 */
	function choose(target) {
		const list = target.moves && target.moves.length > 0 ? target.moves : [target.move]
		if (list.length > 1 || list[0].promo !== undefined) {
			if (preferences.autoQueen) {
				return proceed(list.find((m) => m.promo === 'q') ?? list[0])
			}
			const color = selection.occupant(list[0].from[0])?.color ?? st.value.turn
			promotion.value = { square: list[0].to[0], moves: list, color }
			return 'promotion'
		}
		return proceed(list[0])
	}

	/**
	 * Choose the promotion piece.
	 *
	 * @param {string|null} type q | r | b | n, or null to cancel
	 * @return {string|null} what happened, as `choose()`, or null when nothing was played
	 */
	function choosePromotion(type) {
		const p = promotion.value
		promotion.value = null
		if (p === null || type === null) {
			return null
		}
		const m = p.moves.find((x) => x.promo === type)
		return m ? proceed(m) : null
	}

	/**
	 * The safety net's question before a risky move, unless the player switched it off.
	 *
	 * @param {LegalMove} move the chosen move
	 * @return {SafetyWarning|null}
	 */
	function safetyCheck(move) {
		if (!preferences.safetyNet || dontAskSafety.value) {
			return null
		}
		return safetyWarning(st.value, move, moves.value)
	}

	/**
	 * Confirmation per the "Confirm moves" preference.
	 *
	 * @param {LegalMove} move the chosen move
	 * @return {boolean}
	 */
	function needsConfirmation(move) {
		const c = preferences.confirmMovesEffective
		return c === 'always' || (c === 'rolled' && move.resolution === 'rolled')
	}

	/**
	 * The last steps before a chosen move is played: the safety net, then the confirmation, then the commit.
	 *
	 * @param {LegalMove} move the chosen move
	 * @param {object} [opts] options
	 * @param {boolean} [opts.skipSafety] the safety net already answered
	 * @return {string} safety | pending | committed
	 */
	function proceed(move, { skipSafety = false } = {}) {
		if (!skipSafety) {
			const net = safetyCheck(move)
			if (net !== null) {
				safetyNet.value = net
				return 'safety'
			}
		}
		if (needsConfirmation(move)) {
			pending.value = { move }
			const hovered = selection.hovered
			hovered.value = move.to.length === 1 ? move.to[0] : hovered.value
			return 'pending'
		}
		commit(move)
		return 'committed'
	}

	/**
	 * Commit a move: the input resets to Move, then the listeners are called.
	 *
	 * @param {LegalMove} move the move to play
	 */
	function commit(move) {
		selection.resetSelection()
		closeFlow()
		for (const cb of [...listeners]) {
			cb(move)
		}
	}

	/** Confirm the pending move. */
	function confirm() {
		const p = pending.value
		if (p !== null) {
			pending.value = null
			commit(p.move)
		}
	}

	/**
	 * Answer the safety net.
	 *
	 * @param {'play'|'show'|'cancel'} action the choice
	 * @param {boolean} [dontAskAgain] "Don't ask again this game"
	 * @return {string|null} what happened: as `choose()` for Play, show, cancel; null when no question was open
	 */
	function resolveSafetyNet(action, dontAskAgain = false) {
		const net = safetyNet.value
		safetyNet.value = null
		if (dontAskAgain) {
			dontAskSafety.value = true
		}
		if (net === null) {
			return null
		}
		if (action === 'play') {
			return proceed(net.move, { skipSafety: true })
		}
		if (action === 'show') {
			selection.showMove(net.safer.move)
			return 'show'
		}
		return 'cancel'
	}

	/**
	 * Register a commit listener.
	 *
	 * @param {(move: LegalMove) => void} callback called with the committed move
	 * @return {() => void} unsubscribe
	 */
	function onCommit(callback) {
		listeners.add(callback)
		return () => listeners.delete(callback)
	}

	/** Close the promotion picker, the safety net and the pending move. */
	function closeFlow() {
		pending.value = null
		promotion.value = null
		safetyNet.value = null
	}

	return {
		pending,
		promotion,
		safetyNet,
		dontAskSafety,
		choose,
		choosePromotion,
		resolveSafetyNet,
		confirm,
		onCommit,
		closeFlow,
	}
}
