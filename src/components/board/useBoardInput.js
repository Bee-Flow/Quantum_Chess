/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The board's input controller (SPEC §14.6.1, GAME-DESIGN §3.5): move switcher modes and their tooltips, selection,
 * target markers, click / keyboard / typed flows for Move, Split, Merge and Measure, the promotion step, the king
 * safety net, the "Confirm moves" step, the what-if view and "View one possibility". The same object is shared by
 * `QuantumBoard` and `BoardControls`; DOM events are translated by the board.
 */

import { t } from '@nextcloud/l10n'
import { computed, reactive, ref, shallowRef, toRaw, toValue, watch } from 'vue'
import { budget, findMove, pieceLocations, squareView, T, whyIllegal } from '../../engine/index.js'
import { memoByHash, reasonText, splitTargets } from '../../engine/ui/index.js'
import { boardPrefs } from './boardPreferences.js'
import { movePreview, riskOf } from './preview.js'

/** Safety net thresholds (ENGINE-RULES §8 UI rules, GAME-DESIGN §3.5.6). */
export const SAFETY_RISK = 0.1
export const SAFETY_MARGIN = 0.1

export const MODES = Object.freeze(['move', 'split', 'merge', 'measure'])

const splitTargetsOf = memoByHash((state, from) => splitTargets(state, from), { size: 32 })

/**
 * Marker kind of a standard move (GAME-DESIGN §3.5.2).
 *
 * @param {object} m LegalMove
 * @return {string}
 */
export function markerKind(m) {
	if (m.type === 'merge') {
		if (!m.capture) {
			return 'merge'
		}
		return m.resolution === 'rolled' ? 'converging-roll' : 'converging'
	}
	if (m.resolution === 'certain') {
		return m.capture ? 'certain-capture' : 'certain'
	}
	if (m.resolution === 'quantum') {
		return 'quantum'
	}
	if (m.fallback) {
		return 'roll-budget'
	}
	return m.capture ? 'roll-capture' : 'roll'
}

/**
 * Capture probability of a move (for the pie of a rolled capture marker).
 *
 * @param {object} m LegalMove
 * @return {number}
 */
function captureProbability(m) {
	const c = m.outcomes.find((o) => o.key === 'capture')
	return c ? c.weight / T : (m.capture ? 1 : 0)
}

/**
 * Create a board input controller.
 *
 * @param {object} options options (refs, getters or plain values)
 * @param {object} options.state the displayed state
 * @param {object[]} [options.legalMoves] the moves the local user may play now
 * @param {'w'|'b'|'both'|null} [options.movableColor] whose pieces may be moved
 * @param {boolean} [options.interactive] whether input is accepted
 * @param {object} [options.preferences] preference source (default: boardPrefs)
 * @return {object} BoardInput (reactive)
 */
export function useBoardInput({ state, legalMoves = [], movableColor = null, interactive = false, preferences = boardPrefs }) {
	const mode = ref('move')
	const selection = ref(null)
	const splitFirst = ref(null)
	const mergeSources = ref([])
	const hovered = ref(null)
	const pending = shallowRef(null)
	const promotion = shallowRef(null)
	const safetyNet = shallowRef(null)
	const whatIf = ref(null)
	const possibility = ref(null)
	const feedback = shallowRef(null)
	const panelOpen = ref(false)
	const dontAskSafety = ref(false)
	const listeners = new Set()
	let feedbackSeq = 0

	const st = computed(() => toRaw(toValue(state)))
	const moves = computed(() => (toValue(legalMoves) ?? []).map((m) => toRaw(m)))
	const movable = computed(() => toValue(movableColor))
	const canInteract = computed(() => Boolean(toValue(interactive)) && possibility.value === null && st.value?.result === null)
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

	const byType = computed(() => {
		const out = { standard: [], split: [], merge: [], measure: [] }
		for (const m of moves.value) {
			out[m.type].push(m)
		}
		return out
	})

	const modes = computed(() => {
		const off = !canInteract.value
		const wait = t('quantumchess', 'Wait for your turn.')
		const ownColor = st.value.turn
		const ghosts = []
		for (let id = ownColor === 'w' ? 0 : 16, end = id + 16; id < end; id++) {
			if (locations.value[id].length > 1) {
				ghosts.push(id)
			}
		}
		const splitReason = budget(st.value, ownColor) >= 8
			? reasonText('budget_full')
			: t('quantumchess', 'No piece can split right now.')
		const mergeReason = ghosts.some((id) => 'qrbn'.includes(st.value.types[id]))
			? t('quantumchess', 'No merge is possible right now.')
			: t('quantumchess', 'You have no ghost of a knight, bishop, rook or queen.')
		return {
			move: { enabled: !off, reason: off ? wait : null },
			split: off
				? { enabled: false, reason: wait }
				: { enabled: byType.value.split.length > 0, reason: byType.value.split.length > 0 ? null : splitReason },
			merge: off
				? { enabled: false, reason: wait }
				: { enabled: byType.value.merge.length > 0, reason: byType.value.merge.length > 0 ? null : mergeReason },
			measure: off
				? { enabled: false, reason: wait }
				: {
						enabled: byType.value.measure.length > 0,
						reason: byType.value.measure.length > 0 ? null : t('quantumchess', 'You have no ghost to measure.'),
					},
		}
	})

	/**
	 * Merges of the piece whose part is on `a` with sources exactly `sources` (sorted).
	 *
	 * @param {number[]} sources two squares, sorted
	 * @return {object[]}
	 */
	const mergesFrom = (sources) => byType.value.merge.filter((m) => m.from[0] === sources[0] && m.from[1] === sources[1])

	const targets = computed(() => {
		const s = selection.value
		const out = []
		if (s === null || !canInteract.value) {
			return out
		}
		if (mode.value === 'move') {
			const bySquare = new Map()
			for (const m of byType.value.standard) {
				if (m.from[0] !== s) {
					continue
				}
				const list = bySquare.get(m.to[0]) ?? []
				list.push(m)
				bySquare.set(m.to[0], list)
			}
			for (const [square, list] of bySquare) {
				const m = list[0]
				out.push({
					square,
					kind: markerKind(m),
					move: m,
					moves: list,
					promotion: list.length > 1 || m.promo !== undefined,
					pCapture: captureProbability(m),
					probability: m.successProbability,
					disabled: false,
					reason: null,
				})
			}
			// Merge glyphs on the other parts of a selected own ghost (accelerator to Merge)
			const parts = partsOf(s)
			if (parts.length > 1) {
				for (const q of parts) {
					if (q === s) {
						continue
					}
					const pair = [Math.min(s, q), Math.max(s, q)]
					if (mergesFrom(pair).length > 0) {
						out.push({ square: q, kind: 'merge-part', move: null, moves: [], disabled: false, reason: null })
					}
				}
			}
		} else if (mode.value === 'split') {
			const info = splitTargetsOf(st.value, s)
			if (info.reason !== null) {
				return out
			}
			const first = splitFirst.value
			for (const target of info.targets) {
				if (first !== null && target.square === first) {
					out.push({ square: target.square, kind: 'split-chosen', move: null, moves: [], disabled: false, reason: null })
				} else if (first !== null) {
					const pair = info.pairs.find((p) => p.to[0] === Math.min(first, target.square) && p.to[1] === Math.max(first, target.square))
					const legal = pair && pair.reason === null
					out.push({
						square: target.square,
						kind: legal ? 'split' : 'split-disabled',
						move: legal ? pair.move : null,
						moves: legal ? [pair.move] : [],
						disabled: !legal,
						reason: legal ? null : reasonText(pair ? pair.reason : target.reason),
						code: pair ? pair.reason : target.reason,
					})
				} else {
					out.push({
						square: target.square,
						kind: target.legal ? 'split' : 'split-disabled',
						move: null,
						moves: [],
						disabled: !target.legal,
						reason: target.legal ? null : reasonText(target.reason),
						code: target.reason,
					})
				}
			}
		} else if (mode.value === 'merge') {
			const src = mergeSources.value
			if (src.length === 2) {
				for (const m of mergesFrom(src)) {
					out.push({
						square: m.to[0],
						kind: markerKind(m),
						move: m,
						moves: [m],
						pCapture: captureProbability(m),
						probability: m.successProbability,
						disabled: false,
						reason: null,
					})
				}
			} else if (src.length === 1) {
				for (const q of partsOf(src[0])) {
					if (q !== src[0] && mergesFrom([Math.min(q, src[0]), Math.max(q, src[0])]).length > 0) {
						out.push({ square: q, kind: 'merge-part', move: null, moves: [], disabled: false, reason: null })
					}
				}
			}
		} else if (mode.value === 'measure') {
			const m = measureMove(s)
			if (m !== null) {
				const v = occupant(s)
				for (const l of locations.value[v.piece]) {
					out.push({ square: l.square, kind: 'measure', move: m, moves: [m], probability: l.probability, weight: l.weight, disabled: false, reason: null })
				}
			}
		}
		return out
	})

	const targetAt = (square) => targets.value.find((x) => x.square === square) ?? null

	/**
	 * The Measure move of the piece on `square`, if legal.
	 *
	 * @param {number} square a part of the piece
	 * @return {object|null}
	 */
	function measureMove(square) {
		const parts = partsOf(square)
		if (parts.length < 2) {
			return null
		}
		return byType.value.measure.find((m) => m.from[0] === parts[0]) ?? null
	}

	const previewMove = computed(() => {
		if (pending.value !== null) {
			return pending.value.move
		}
		if (mode.value === 'measure' && selection.value !== null) {
			return measureMove(selection.value)
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

	/** Clear the selection state (not the what-if or possibility views). */
	function clearSelection() {
		selection.value = null
		splitFirst.value = null
		mergeSources.value = []
		hovered.value = null
	}

	/**
	 * Report an illegal attempt for the board's feedback (tooltip, shake, sound).
	 *
	 * @param {string} code ReasonCode
	 * @param {number|null} square square
	 * @return {object}
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
	 * @return {boolean}
	 */
	function setMode(m) {
		if (!MODES.includes(m) || !modes.value[m].enabled) {
			return false
		}
		const keep = selection.value
		mode.value = m
		pending.value = null
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
	 * Go on with a chosen move: promotion, safety net, confirmation, commit.
	 *
	 * @param {object} target a target descriptor or `{moves}`
	 * @return {string} what happened: promotion | safety | pending | committed
	 */
	function choose(target) {
		const list = target.moves && target.moves.length > 0 ? target.moves : [target.move]
		if (list.length > 1 || list[0].promo !== undefined) {
			if (preferences.autoQueen) {
				return proceed(list.find((m) => m.promo === 'q') ?? list[0])
			}
			promotion.value = { square: list[0].to[0], moves: list, color: occupant(list[0].from[0])?.color ?? st.value.turn }
			return 'promotion'
		}
		return proceed(list[0])
	}

	/**
	 * Choose the promotion piece.
	 *
	 * @param {string|null} type q | r | b | n, or null to cancel
	 * @return {string|null}
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
	 * The safety-net check (GAME-DESIGN §3.5.6): risk ≥ 10 % and a move at least 10 points safer exists.
	 *
	 * @param {object} move LegalMove
	 * @return {null|{move: object, risk: number, safer: {move: object, risk: number}}}
	 */
	function safetyCheck(move) {
		if (!preferences.safetyNet || dontAskSafety.value) {
			return null
		}
		const s = st.value
		const risk = riskOf(s, move)
		if (risk < SAFETY_RISK) {
			return null
		}
		let best = null
		for (const m of moves.value) {
			const r = riskOf(s, m)
			if (best === null || r < best.risk) {
				best = { move: m, risk: r }
			}
		}
		if (best === null || best.risk > risk - SAFETY_MARGIN) {
			return null
		}
		return { move, risk, safer: best }
	}

	/**
	 * Confirmation per the "Confirm moves" preference.
	 *
	 * @param {object} move LegalMove
	 * @return {boolean}
	 */
	function needsConfirmation(move) {
		const c = preferences.confirmMovesEffective
		return c === 'always' || (c === 'rolled' && move.resolution === 'rolled')
	}

	/**
	 * @param {object} move LegalMove
	 * @param {object} [opts] options
	 * @param {boolean} [opts.skipSafety] the safety net already answered
	 * @return {string}
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
			hovered.value = move.to.length === 1 ? move.to[0] : hovered.value
			return 'pending'
		}
		commit(move)
		return 'committed'
	}

	/**
	 * Commit a move: listeners are called, then the input resets to Move.
	 *
	 * @param {object} move LegalMove
	 */
	function commit(move) {
		reset()
		for (const cb of [...listeners]) {
			cb(move)
		}
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
		if (!canInteract.value) {
			return 'none'
		}
		if (promotion.value !== null || safetyNet.value !== null) {
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
		const target = targetAt(square)
		const s = selection.value

		if (mode.value === 'move') {
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
				clearSelection()
				return 'deselect'
			}
			if (ownPiece(square) !== null) {
				selectSquare(square)
				return 'select'
			}
			if (s !== null) {
				const code = whyIllegal(st.value, { type: 'standard', from: [s], to: [square] })
				clearSelection()
				if (code !== null && code !== 'no_piece' && code !== 'not_your_piece') {
					reject(code, square)
					return 'illegal'
				}
				return 'deselect'
			}
			return 'none'
		}

		if (mode.value === 'split') {
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
				clearSelection()
				return 'deselect'
			}
			if (ownPiece(square) !== null) {
				selectSquare(square)
				const reason = splitTargetsOf(st.value, square).reason
				if (reason !== null) {
					reject(reason, square)
				}
				return 'select'
			}
			clearSelection()
			return 'deselect'
		}

		if (mode.value === 'merge') {
			if (target !== null) {
				if (target.kind === 'merge-part') {
					mergeSources.value = [Math.min(mergeSources.value[0], square), Math.max(mergeSources.value[0], square)]
					return 'merge'
				}
				return choose(target)
			}
			if (square === s || mergeSources.value.includes(square)) {
				clearSelection()
				return 'deselect'
			}
			if (ownPiece(square) !== null) {
				if (!isGhostPart(square)) {
					clearSelection()
					reject('not_superposed', square)
					return 'illegal'
				}
				selectSquare(square)
				return 'select'
			}
			clearSelection()
			return 'deselect'
		}

		// measure
		if (s !== null && target !== null) {
			return choose(target)
		}
		if (ownPiece(square) !== null) {
			if (!isGhostPart(square)) {
				clearSelection()
				reject('not_superposed', square)
				return 'illegal'
			}
			selectSquare(square)
			return 'select'
		}
		clearSelection()
		return 'deselect'
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
			selectSquare(from)
		}
		if (from === to) {
			return 'none'
		}
		const target = targetAt(to)
		if (target === null || target.disabled) {
			const code = target?.code ?? whyIllegal(st.value, { type: 'standard', from: [from], to: [to] }) ?? 'unreachable'
			reject(code, to)
			return 'illegal'
		}
		return activate(to)
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
	 * Cancel the innermost step: promotion, safety net, pending move, what-if, possibility view, split target,
	 * selection.
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
		if (possibility.value !== null) {
			possibility.value = null
			return 'possibility'
		}
		if (splitFirst.value !== null) {
			splitFirst.value = null
			return 'splitFirst'
		}
		if (selection.value !== null) {
			clearSelection()
			return 'selection'
		}
		if (mode.value !== 'move') {
			mode.value = 'move'
			return 'mode'
		}
		return null
	}

	/**
	 * Answer the safety net.
	 *
	 * @param {'play'|'show'|'cancel'} action the choice
	 * @param {boolean} [dontAskAgain] "Don't ask again this game"
	 * @return {string|null}
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
			const m = net.safer.move
			const m2 = m.type === 'standard' ? 'move' : m.type
			mode.value = modes.value[m2]?.enabled ? m2 : 'move'
			selection.value = m.from[0]
			mergeSources.value = m.type === 'merge' ? m.from.slice() : []
			splitFirst.value = m.type === 'split' ? m.to[0] : null
			hovered.value = m.to.length > 0 ? m.to[m.to.length - 1] : m.from[0]
			return 'show'
		}
		return 'cancel'
	}

	/**
	 * Open or close the what-if view on a ghost part.
	 *
	 * @param {number|null} square a part of a superposed piece, or null to close
	 * @return {boolean}
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
	 * @return {number|null}
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
	 * Show one possibility (index into `state.worlds`) or close the view.
	 *
	 * @param {number|null} index world index
	 */
	function viewPossibility(index) {
		possibility.value = index === null || index < 0 || index >= st.value.worlds.length ? null : index
		if (possibility.value !== null) {
			clearSelection()
			pending.value = null
		}
	}

	/**
	 * Play a typed move ("e2e4", "Ng1-f3|h3", "?a4", "O-O") through the engine's lenient parser.
	 *
	 * @param {string} text the typed move
	 * @return {{ok: boolean, move?: object, reason?: string, text?: string, result?: string}}
	 */
	function typeMove(text) {
		const input = String(text ?? '').trim()
		if (input === '') {
			return { ok: false, reason: 'malformed', text: reasonText('malformed') }
		}
		if (!canInteract.value) {
			return { ok: false, reason: 'game_over', text: t('quantumchess', 'Wait for your turn.') }
		}
		const found = findMove(st.value, input)
		const legal = found === null ? null : moves.value.find((m) => m.code === found.code) ?? null
		if (legal === null) {
			const reason = found !== null ? 'not_your_piece' : (whyIllegal(st.value, input) ?? 'malformed')
			return { ok: false, reason, text: reasonText(reason) }
		}
		clearSelection()
		const result = proceed(legal)
		return { ok: true, move: legal, result }
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

	/**
	 * Register a commit listener.
	 *
	 * @param {(move: object) => void} callback called with the committed LegalMove
	 * @return {() => void} unsubscribe
	 */
	function onCommit(callback) {
		listeners.add(callback)
		return () => listeners.delete(callback)
	}

	/** Back to Move with nothing selected (after a commit or a new position). */
	function reset() {
		mode.value = 'move'
		clearSelection()
		pending.value = null
		promotion.value = null
		safetyNet.value = null
	}

	/** A new game: forget "Don't ask again this game". */
	function newGame() {
		dontAskSafety.value = false
		reset()
		whatIf.value = null
		possibility.value = null
	}

	// A new position ends every flow that referred to the old one.
	watch(st, (now, before) => {
		if (now !== before) {
			reset()
			whatIf.value = null
			possibility.value = null
		}
	})
	watch(canInteract, (on) => {
		if (!on) {
			clearSelection()
			pending.value = null
			promotion.value = null
			safetyNet.value = null
			mode.value = 'move'
		}
	})

	return reactive({
		mode,
		setMode,
		modes,
		selection,
		splitFirst,
		mergeSources,
		targets,
		targetAt,
		hovered,
		hover,
		previewInfo,
		pending,
		confirm,
		cancel,
		promotion,
		choosePromotion,
		safetyNet,
		resolveSafetyNet,
		dontAskSafety,
		whatIf,
		setWhatIf,
		cycleWhatIf,
		possibility,
		viewPossibility,
		panelOpen,
		togglePanel,
		isMovablePiece,
		typeMove,
		activate,
		drop,
		select: selectSquare,
		clearSelection,
		feedback,
		reject,
		onCommit,
		reset,
		newGame,
		canInteract,
		measureMove,
		isGhostPart,
		partsOf,
	})
}
