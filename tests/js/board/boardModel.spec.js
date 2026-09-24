/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Board display data: ghosts, the what-if view, king rings, square labels, the reveal arrow, the outcome ring and the
 * move animation plan; plus the board themes.
 */

import { describe, expect, it } from 'vitest'
import {
	kingRings,
	lastMoveSquares,
	pieceItems,
	revealArrow,
	ringSegments,
	squareLabel,
	travelPlan,
} from '../../../src/board/boardModel.js'
import { BOARD_THEMES, resolveBoardTheme } from '../../../src/board/boardThemes.js'
import { E, S, sq, T } from './helpers.js'

const GHOSTS = S('4k3/8/6n1/8/8/8/8/1NBQK2R w - - 0 1', ['b1-a3|c3', 'c1-d2|e3', 'd1-b3|a4', 'g6-f4|h4'])

describe('pieceItems', () => {
	it('draws every part of a ghost with its probability and an identity colour', () => {
		const id = E.squareView(GHOSTS)[sq('a3')].piece
		const items = pieceItems(GHOSTS, { identity: { [id]: 2 } })
		const knight = items.filter((p) => p.piece === id)
		expect(knight.map((p) => p.square).sort()).toEqual([sq('a3'), sq('c3')].sort())
		expect(knight.every((p) => p.ghost && p.probability === 0.5 && p.idColor === 2)).toBe(true)
		const king = items.find((p) => p.square === sq('e1'))
		expect(king.ghost).toBe(false)
		expect(king.idColor).toBe(null)
		expect(items.length).toBeLessThanOrEqual(64)
	})

	it('uses normalised conditional probabilities in the what-if view', () => {
		const items = pieceItems(GHOSTS, { whatIf: sq('a4') })
		const chosen = items.find((p) => p.square === sq('a4'))
		expect(chosen.chosen).toBe(true)
		expect(chosen.probability).toBe(1)
		const other = items.find((p) => p.square === sq('b3'))
		expect(other.impossible).toBe(true)
		expect(other.delta).toEqual({ up: false, percent: 0 })
		// the white king does not depend on the queen: unchanged, no delta chip
		const king = items.find((p) => p.square === sq('e1'))
		expect(king.probability).toBe(1)
		expect(king.delta).toBe(null)
	})
})

describe('kingRings and labels', () => {
	it('shows a certain king danger for a converging capture', () => {
		const s = S('7k/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1-d4|h5'])
		const rings = kingRings(s, ['w', 'b'])
		expect(rings).toEqual([{ color: 'b', square: sq('h8'), weight: T, percent: 100, certain: true }])
	})

	it('describes a ghost square for screen readers', () => {
		const s = S('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3'])
		expect(squareLabel(s, sq('f3'))).toBe('f3, white knight, 50 percent, also on h3')
		expect(squareLabel(s, sq('e1'))).toBe('e1, white king')
		expect(squareLabel(s, sq('a1'))).toBe('a1, empty')
	})

	it('marks a Missed last move as attempted', () => {
		const move = { from: [sq('c1')], to: [sq('h6')] }
		expect(lastMoveSquares({ move, key: 'miss' })).toEqual({ fill: [], dashed: [sq('c1'), sq('h6')] })
		expect(lastMoveSquares({ move, key: 'capture' })).toEqual({ fill: [sq('c1'), sq('h6')], dashed: [] })
		expect(lastMoveSquares(null)).toEqual({ fill: [], dashed: [] })
	})
})

describe('roll display', () => {
	const ROLL = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])

	it('draws the reveal arrow to where the ghost really was', () => {
		const r = E.applyMove(ROLL, 'c1-h6', { outcome: 'move' })
		expect(revealArrow(ROLL, r.move, r.measurement)).toEqual({ from: sq('h6'), to: sq('f6') })
		const c = E.applyMove(ROLL, 'c1-h6', { outcome: 'capture' })
		expect(revealArrow(ROLL, c.move, c.measurement)).toBe(null)
		expect(revealArrow(ROLL, c.move, null)).toBe(null)
	})

	it('splits the outcome ring by weight in key order', () => {
		const m = E.findMove(ROLL, 'c1-h6')
		const segs = ringSegments(m.outcomes)
		expect(segs.map((x) => [x.key, x.start, x.length, x.tone])).toEqual([['move', 0, 0.5, 'move'], ['capture', 0.5, 0.5, 'capture']])
	})
})

describe('travelPlan', () => {
	it('slides both parts of a split from the source square', () => {
		const s = S('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1')
		const r = E.applyMove(s, 'g1-f3|h3')
		const plan = travelPlan(s, r.state, r.move)
		const id = r.move.piece
		expect(plan.origins).toEqual({ [`${id}:${sq('f3')}`]: sq('g1'), [`${id}:${sq('h3')}`]: sq('g1') })
		expect(plan.instantLeave).toEqual([`${id}:${sq('g1')}`])
	})

	it('moves the castling rook too', () => {
		const s = S('4k3/8/8/8/8/8/8/4K2R w K - 0 1')
		const r = E.applyMove(s, 'e1-g1')
		const plan = travelPlan(s, r.state, r.move)
		expect(Object.values(plan.origins).sort()).toEqual([sq('e1'), sq('h1')].sort())
	})
})

describe('themes', () => {
	it('ships three themes and maps older names and aliases onto them', () => {
		expect(BOARD_THEMES).toEqual(['wood', 'slate', 'quantum'])
		expect(resolveBoardTheme('classic')).toBe('wood')
		expect(resolveBoardTheme('blue')).toBe('slate')
		expect(resolveBoardTheme('nextcloud')).toBe('slate')
		expect(resolveBoardTheme(undefined)).toBe('slate')
		expect(resolveBoardTheme('quantum', { highContrast: true })).toBe('contrast')
	})
})
