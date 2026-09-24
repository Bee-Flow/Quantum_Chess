/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The targets of the selected piece, per move type: where it can go, which marker each square gets, and why a split
 * target is not available. Also which move types can be used at all, with the reason when one cannot. Pure functions of
 * the position and the legal moves; `useBoardInput` keeps the selection state.
 */

import { t } from '@nextcloud/l10n'
import { budget, T } from '../../engine/index.js'
import { memoByHash, reasonText, splitTargets } from '../../engine/ui/index.js'

/** @typedef {import('../../engine/types.js').EngineState} EngineState */
/** @typedef {import('../../engine/types.js').LegalMove} LegalMove */

/** The move types of the move switcher, in the order of its keys 1–4. */
export const MODES = Object.freeze(['move', 'split', 'merge', 'measure'])

/**
 * The split targets of a piece, cached per position.
 *
 * @type {(state: object, from: number) => {reason: string|null, targets: object[], pairs: object[]}}
 */
export const splitTargetsOf = memoByHash((state, from) => splitTargets(state, from), { size: 32 })

/**
 * @typedef {object} Target
 * @property {number} square the target square
 * @property {string} kind marker kind: certain, certain-capture, quantum, roll, roll-capture, roll-budget, merge,
 *   converging, converging-roll, merge-part, split, split-chosen, split-disabled or measure
 * @property {object|null} move the move to this square (the first one when a promotion offers several)
 * @property {object[]} moves every move to this square
 * @property {boolean} [promotion] the move promotes: the player picks the piece
 * @property {number} [pCapture] chance that the move captures (the pie of a rolled capture)
 * @property {number} [probability] chance that the move succeeds, or of the part on this square (Measure)
 * @property {number} [weight] weight of the part on this square (Measure)
 * @property {boolean} disabled the square is shown but cannot be chosen
 * @property {string|null} reason why it cannot be chosen, in words
 * @property {string|null} [code] the reason code
 */

/**
 * Marker kind of a standard or merge move.
 *
 * @param {LegalMove} m the move
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
 * @param {LegalMove} m the move
 * @return {number}
 */
function captureProbability(m) {
	const c = m.outcomes.find((o) => o.key === 'capture')
	return c ? c.weight / T : (m.capture ? 1 : 0)
}

/**
 * The target of a standard or merge move.
 *
 * @param {number} square the target square
 * @param {object[]} list the moves to that square
 * @return {Target}
 */
function moveTarget(square, list) {
	const m = list[0]
	return {
		square,
		kind: markerKind(m),
		move: m,
		moves: list,
		promotion: list.length > 1 || m.promo !== undefined,
		pCapture: captureProbability(m),
		probability: m.successProbability,
		disabled: false,
		reason: null,
	}
}

/**
 * A merge glyph on another part of the selected ghost: choosing it switches to Merge with both parts.
 *
 * @param {number} square the other part
 * @return {Target}
 */
function mergePart(square) {
	return { square, kind: 'merge-part', move: null, moves: [], disabled: false, reason: null }
}

/**
 * The legal moves by type.
 *
 * @param {LegalMove[]} moves the legal moves
 * @return {{standard: object[], split: object[], merge: object[], measure: object[]}}
 */
export function movesByType(moves) {
	const out = { standard: [], split: [], merge: [], measure: [] }
	for (const m of moves) {
		out[m.type].push(m)
	}
	return out
}

/**
 * The merges of a ghost from exactly these two parts.
 *
 * @param {{merge: object[]}} byType legal moves by type
 * @param {number[]} sources two squares, sorted
 * @return {object[]}
 */
export function mergesFrom(byType, sources) {
	return byType.merge.filter((m) => m.from[0] === sources[0] && m.from[1] === sources[1])
}

/**
 * Which move types can be used now, and why not.
 *
 * @param {EngineState} state the position
 * @param {{split: object[], merge: object[], measure: object[]}} byType legal moves by type
 * @param {object[][]} locations the parts of every piece (`pieceLocations()`)
 * @param {boolean} canInteract the board accepts a move now
 * @return {Record<string, {enabled: boolean, reason: string|null}>}
 */
export function modeAvailability(state, byType, locations, canInteract) {
	const off = !canInteract
	const wait = t('quantumchess', 'Wait for your turn.')
	const ownColor = state.turn
	const ghosts = []
	for (let id = ownColor === 'w' ? 0 : 16, end = id + 16; id < end; id++) {
		if (locations[id].length > 1) {
			ghosts.push(id)
		}
	}
	const splitReason = budget(state, ownColor) >= 8
		? reasonText('budget_full')
		: t('quantumchess', 'No piece can split right now.')
	const mergeReason = ghosts.some((id) => 'qrbn'.includes(state.types[id]))
		? t('quantumchess', 'No merge is possible right now.')
		: t('quantumchess', 'You have no ghost of a knight, bishop, rook or queen.')
	return {
		move: { enabled: !off, reason: off ? wait : null },
		split: off
			? { enabled: false, reason: wait }
			: { enabled: byType.split.length > 0, reason: byType.split.length > 0 ? null : splitReason },
		merge: off
			? { enabled: false, reason: wait }
			: { enabled: byType.merge.length > 0, reason: byType.merge.length > 0 ? null : mergeReason },
		measure: off
			? { enabled: false, reason: wait }
			: {
					enabled: byType.measure.length > 0,
					reason: byType.measure.length > 0 ? null : t('quantumchess', 'You have no ghost to measure.'),
				},
	}
}

/**
 * The targets of the selected piece in the current move type.
 *
 * @param {object} input what is selected
 * @param {'move'|'split'|'merge'|'measure'} input.mode the move type
 * @param {number} input.selection the selected square
 * @param {number|null} input.splitFirst the first target of a split, once chosen
 * @param {number[]} input.mergeSources the chosen parts of a merge
 * @param {object} position the position and its moves
 * @param {EngineState} position.state the position
 * @param {{standard: object[], merge: object[]}} position.byType legal moves by type
 * @param {object[][]} position.locations the parts of every piece
 * @param {(square: number) => object|null} position.occupant the piece on a square (`squareView()` entry)
 * @param {(square: number) => number[]} position.partsOf the squares of all parts of the piece on a square
 * @param {(square: number) => object|null} position.measureMove the Measure move of the piece on a square
 * @return {Target[]}
 */
export function moveTargets({ mode, selection: s, splitFirst: first, mergeSources: src }, { state, byType, locations, occupant, partsOf, measureMove }) {
	const out = []
	if (mode === 'move') {
		const bySquare = new Map()
		for (const m of byType.standard) {
			if (m.from[0] !== s) {
				continue
			}
			const list = bySquare.get(m.to[0]) ?? []
			list.push(m)
			bySquare.set(m.to[0], list)
		}
		for (const [square, list] of bySquare) {
			out.push(moveTarget(square, list))
		}
		// Merge glyphs on the other parts of a selected own ghost (an accelerator to Merge)
		const parts = partsOf(s)
		if (parts.length > 1) {
			for (const q of parts) {
				if (q !== s && mergesFrom(byType, [Math.min(s, q), Math.max(s, q)]).length > 0) {
					out.push(mergePart(q))
				}
			}
		}
	} else if (mode === 'split') {
		const info = splitTargetsOf(state, s)
		if (info.reason !== null) {
			return out
		}
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
	} else if (mode === 'merge') {
		if (src.length === 2) {
			for (const m of mergesFrom(byType, src)) {
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
				if (q !== src[0] && mergesFrom(byType, [Math.min(q, src[0]), Math.max(q, src[0])]).length > 0) {
					out.push(mergePart(q))
				}
			}
		}
	} else if (mode === 'measure') {
		const m = measureMove(s)
		if (m !== null) {
			for (const l of locations[occupant(s).piece]) {
				out.push({ square: l.square, kind: 'measure', move: m, moves: [m], probability: l.probability, weight: l.weight, disabled: false, reason: null })
			}
		}
	}
	return out
}
