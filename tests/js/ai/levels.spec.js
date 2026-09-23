/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION, LEAF_K, LEVELS, levelOf, PIECE_VALUES, STRENGTHS } from '../../../src/ai/levels.js'

describe('LEVELS (GAME-DESIGN §6.1, SPEC §4.2)', () => {
	it('has five frozen levels in order with names, labels and canned lines', () => {
		expect(LEVELS).toHaveLength(5)
		expect(Object.isFrozen(LEVELS)).toBe(true)
		expect(LEVELS.map((l) => l.level)).toEqual([1, 2, 3, 4, 5])
		expect(LEVELS.map((l) => l.name)).toEqual(['Wobbles', 'Dice', 'Quark', 'Tangle', 'The Observer'])
		expect(LEVELS.map((l) => l.label)).toEqual(['beginner', 'casual', 'club', 'strong', 'expert'])
		expect(LEVELS.map((l) => l.id)).toEqual(['wobbles', 'dice', 'quark', 'tangle', 'observer'])
		expect(LEVELS.map((l) => l.cannedLine)).toEqual(['wobbles', 'dice', 'quark', 'tangle', 'observer'])
		for (const l of LEVELS) {
			expect(Object.isFrozen(l)).toBe(true)
		}
	})

	it('matches the level 1 object of SPEC §4.2 exactly', () => {
		expect(LEVELS[0]).toMatchObject({
			level: 1,
			id: 'wobbles',
			name: 'Wobbles',
			label: 'beginner',
			depth: 1,
			quiescence: 'captures',
			timeMs: 50,
			displayMs: [700, 1200],
			nodeBudget: 5000,
			softmaxT: 0.25,
			randomRate: 0.30,
			topHalfRate: 0,
			splitRate: 0.20,
			splitTypes: ['n', 'b'],
			merges: false,
			measures: false,
			kingShotMin: 0.5,
			defendRate: 0.5,
			rollBonus: 0,
			useSolver: false,
			cannedLine: 'wobbles',
		})
	})

	it('implements the behaviour table of GD §6.1', () => {
		const [l1, l2, l3, l4, l5] = LEVELS
		expect([l1.depth, l2.depth, l3.depth]).toEqual([1, 2, 3])
		expect(l4.depth).toBe(5) // "depth 4–5"
		expect(l5.depth).toBe(7) // "depth 6–7"
		expect([l1.timeMs, l2.timeMs, l3.timeMs, l4.timeMs, l5.timeMs]).toEqual([50, 250, 1000, 2500, 5000])
		expect(l5.maxMs).toBe(8000)
		expect(l2.displayMs).toEqual([600, 900])
		expect([l1.softmaxT, l2.softmaxT, l3.softmaxT, l4.softmaxT, l5.softmaxT]).toEqual([0.25, 0.08, 0.02, 0.005, 0])
		expect(l2.topHalfRate).toBe(0.10)
		expect(l3.secondRate).toBe(0.03)
		expect(l2.rollBonus).toBe(0.03)
		expect(l2.kingShotMin).toBe(0.25)
		expect([l1.defendRate, l2.defendRate]).toEqual([0.5, 0.85])
		expect(l2.merges).toBe('hanging')
		expect(l3.measures).toBe('useful')
		expect(l3.splitTop).toEqual({ r: 6, q: 6 })
		expect(l4.lmr).toBe(true)
		expect(l5.star2).toBe(true)
		expect(l5.tieWindow).toBe(0.002)
		expect(l5.useSolver).toBe(true)
		expect(LEVELS.filter((l) => l.useSolver)).toHaveLength(1)
		expect(l3.nodeBudget).toBe(30000) // GD: "for example 30 k nodes at level 3"
	})

	it('defines the strengths, piece values and leaf constant', () => {
		expect(STRENGTHS).toEqual({
			relaxed: { level: 3, timeMs: 400, toleranceFactor: 2.5 },
			balanced: { level: 4, timeMs: 800, toleranceFactor: 1 },
			sharp: { level: 5, timeMs: 1500, toleranceFactor: 0.4 },
		})
		expect(PIECE_VALUES).toMatchObject({ p: 100, n: 300, b: 300, r: 500, q: 900 })
		expect(LEAF_K).toBe(250)
		expect(typeof ENGINE_VERSION).toBe('string')
	})

	it('resolves level numbers and objects, and rejects anything else', () => {
		expect(levelOf(3)).toBe(LEVELS[2])
		expect(levelOf('5')).toBe(LEVELS[4])
		expect(levelOf(LEVELS[0])).toBe(LEVELS[0])
		expect(() => levelOf(0)).toThrow(TypeError)
		expect(() => levelOf(6)).toThrow(TypeError)
		expect(() => levelOf('x')).toThrow(TypeError)
	})
})
