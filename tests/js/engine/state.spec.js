/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Canonical serialisation and the derived views of a state.
 */

import { describe, expect, it } from 'vitest'
import { E, play, S } from './helpers.js'

describe('serialisation and views', () => {
	it('serializeState rebuilds the canonical key order', () => {
		const s = E.initialState()
		const odd = { result: null, v: 1, ...s }
		expect(E.serializeState(odd)).toBe(E.START_JSON)
		expect(E.positionHashInput(s)).toBe('w|KQkq|-|' + s.types + '|' + s.worlds[0][0] + ':16777216')
		expect(E.gameResult(s)).toBe(null)
	})

	it('squareView, pieceLocations and conditionalView agree', () => {
		const s = play(play(S('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), 'b6-a4|c4'), 'a1-a8')
		const sv = E.squareView(s)
		expect(sv[24]).toEqual({ piece: 22, type: 'n', color: 'b', weight: 8388608, probability: 0.5 })
		expect(sv[28]).toBe(null)
		const locs = E.pieceLocations(s)
		expect(locs[2].map((l) => l.square)).toEqual([0, 56])
		expect(locs[1]).toEqual([])
		expect(E.conditionalView(s, 28)).toBe(null)
		const cv = E.conditionalView(s, 0)
		expect(cv[0]).toEqual({ piece: 2, weight: 8388608, probability: 1 })
		expect(cv[26]).toBe(null)
		expect(cv[4]).toEqual({ piece: 0, weight: 8388608, probability: 1 })
		expect(E.worldCount(s)).toBe(2)
	})

	it('links need a real correlation', () => {
		const s = S('4k3/8/3b4/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3', 'd6-c7|e5'])
		expect(E.links(s)).toEqual([])
		expect(E.linkGroups(s)).toEqual([])
	})
})
