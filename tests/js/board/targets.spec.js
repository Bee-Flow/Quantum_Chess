/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The targets of a selected piece per move type, and which move types are available.
 */

import { describe, expect, it } from 'vitest'
import { markerKind, modeAvailability, movesByType, moveTargets } from '../../../src/board/input/targets.js'
import { E, S, sq } from './helpers.js'

/**
 * The position data `moveTargets()` needs.
 *
 * @param {object} state engine state
 * @return {object}
 */
function position(state) {
	const view = E.squareView(state)
	const locations = E.pieceLocations(state)
	const byType = movesByType(E.generateMoves(state))
	const partsOf = (square) => (view[square] === null ? [] : locations[view[square].piece].map((l) => l.square))
	return {
		state,
		byType,
		locations,
		occupant: (square) => view[square],
		partsOf,
		measureMove: (square) => byType.measure.find((m) => m.from[0] === partsOf(square)[0]) ?? null,
	}
}

describe('move types', () => {
	it('explains why Merge and Measure are not available in the start position', () => {
		const state = E.initialState()
		const modes = modeAvailability(state, movesByType(E.generateMoves(state)), E.pieceLocations(state), true)
		expect(modes.move).toEqual({ enabled: true, reason: null })
		expect(modes.split.enabled).toBe(true)
		expect(modes.merge).toEqual({ enabled: false, reason: 'You have no ghost of a knight, bishop, rook or queen.' })
		expect(modes.measure).toEqual({ enabled: false, reason: 'You have no ghost to measure.' })
	})

	it('disables every type while the board does not accept moves', () => {
		const state = E.initialState()
		const modes = modeAvailability(state, movesByType(E.generateMoves(state)), E.pieceLocations(state), false)
		expect(Object.values(modes).every((m) => !m.enabled && m.reason === 'Wait for your turn.')).toBe(true)
	})
})

describe('targets', () => {
	it('marks the standard moves of the selected piece by their resolution', () => {
		const state = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['e1-d1', 'g8-f6|h6'])
		const targets = moveTargets(
			{ mode: 'move', selection: sq('c1'), splitFirst: null, mergeSources: [] },
			position(state),
		)
		const h6 = targets.find((tg) => tg.square === sq('h6'))
		expect(h6).toMatchObject({ kind: 'roll-capture', disabled: false, promotion: false })
		expect(h6.pCapture).toBe(0.5)
		expect(targets.find((tg) => tg.square === sq('d2')).kind).toBe('certain')
		expect(markerKind({ type: 'merge', capture: true, resolution: 'rolled' })).toBe('converging-roll')
	})

	it('offers the other part of a ghost as a merge accelerator', () => {
		const state = S('4k3/8/8/8/8/8/8/1N2K3 w - - 0 1', ['b1-a3|c3', 'e8-d8'])
		const targets = moveTargets(
			{ mode: 'move', selection: sq('a3'), splitFirst: null, mergeSources: [] },
			position(state),
		)
		expect(targets.find((tg) => tg.square === sq('c3'))).toMatchObject({ kind: 'merge-part', move: null })
	})

	it('pairs split targets once the first one is chosen', () => {
		const state = S('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1')
		const first = moveTargets(
			{ mode: 'split', selection: sq('g1'), splitFirst: null, mergeSources: [] },
			position(state),
		)
		expect(first.map((tg) => tg.kind)).toEqual(['split', 'split', 'split'])
		const second = moveTargets(
			{ mode: 'split', selection: sq('g1'), splitFirst: sq('f3'), mergeSources: [] },
			position(state),
		)
		expect(second.find((tg) => tg.square === sq('f3')).kind).toBe('split-chosen')
		expect(second.find((tg) => tg.square === sq('h3'))).toMatchObject({ kind: 'split', disabled: false })
		expect(second.find((tg) => tg.square === sq('h3')).move.code).toBe('g1-f3|h3')
	})

	it('marks every part of a ghost for Measure', () => {
		const state = S('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3', 'e8-d8'])
		const targets = moveTargets(
			{ mode: 'measure', selection: sq('f3'), splitFirst: null, mergeSources: [] },
			position(state),
		)
		expect(targets.map((tg) => [tg.square, tg.kind, tg.probability]))
			.toEqual([[sq('f3'), 'measure', 0.5], [sq('h3'), 'measure', 0.5]])
	})
})
