/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The review: key moments of an analysed game, and the replay of a local record with its recorded rolls.
 */

import { describe, expect, it } from 'vitest'
import { applyMove, initialState } from '../../../src/engine/index.js'
import { keyMoments } from '../../../src/review/keyMoments.js'
import { reviewGame } from '../../../src/review/reviewGame.js'

describe('key moments', () => {
	it('picks the largest errors per player and the largest luck swings', () => {
		const plies = [
			{
				ply: 0,
				color: 'w',
				code: 'a',
				bestCode: 'b',
				EBefore: 0.5,
				bestE: 0.5,
				playedE: 0.3,
				realisedE: 0.3,
				outcomes: null,
			},
			{
				ply: 1,
				color: 'b',
				code: 'c',
				bestCode: 'c',
				EBefore: 0.3,
				bestE: 0.3,
				playedE: 0.3,
				realisedE: 0.6,
				outcomes: [{}],
			},
			{
				ply: 2,
				color: 'w',
				code: 'd',
				bestCode: 'd',
				EBefore: 0.6,
				bestE: 0.6,
				playedE: 0.59,
				realisedE: 0.59,
				outcomes: null,
			},
		]
		const m = keyMoments(plies)
		expect(m.map((x) => [x.ply, x.kind])).toEqual([[0, 'error'], [1, 'luck']])
		expect(m[1].luckPp).toBeCloseTo(-30)
	})
})

describe('review replay', () => {
	it('replays a local record with its recorded rolls', () => {
		const s0 = initialState()
		const a = applyMove(s0, 'g1-f3|h3')
		const b = applyMove(a.state, 'e7-e5')
		const rec = {
			mode: 'computer',
			humanColor: 'w',
			players: { w: { kind: 'human' }, b: { kind: 'engine', level: 2 } },
			startState: null,
			moves: [{ code: 'g1-f3|h3', u: null }, { code: 'e7-e5', u: null }, { code: 'f3-e5', u: 5 }],
			result: null,
		}
		const g = reviewGame({ source: 'local', id: 'x', local: rec })
		expect(g.states).toHaveLength(4)
		expect(g.states[2]).toEqual(b.state)
		expect(g.steps[2].measurement.u).toBe(5)
		expect(g.moves[2]).toEqual({ code: 'f3-e5', u: 5 })
		expect(g.viewer).toBe('w')
		expect(
			reviewGame({ source: 'local', id: 'y', local: { ...rec, mode: 'local', humanColor: null } }).viewer,
			'pass & play has no single viewer',
		).toBeNull()
	})
})
