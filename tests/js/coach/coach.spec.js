/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'
import { moveChips, truncateAnswer } from '../../../src/coach/chips.js'
import { engineAnswer } from '../../../src/coach/explain.js'
import { hintFor } from '../../../src/coach/hints.js'
import { keyMoments } from '../../../src/coach/keyMoments.js'
import { qualityOf, qualityOfPly } from '../../../src/coach/quality.js'
import { reviewGame } from '../../../src/coach/reviewGame.js'
import { themeOf } from '../../../src/coach/themes.js'
import { kingShot, threatsAgainst, visibleThreats } from '../../../src/coach/threats.js'
import { applyMove, initialState, setupPosition } from '../../../src/engine/index.js'

const q = (bestE, playedE, extra = {}) => qualityOf({ color: 'w', bestE, playedE, ...extra })

describe('quality labels (GAME-DESIGN §5.3.4)', () => {
	it('grades by ΔE in percentage points before the roll', () => {
		expect(q(0.6, 0.6).label).toBe('best')
		expect(q(0.6, 0.596).label).toBe('best')
		expect(q(0.6, 0.585).label).toBe('excellent')
		expect(q(0.6, 0.56).label).toBe('good')
		expect(q(0.6, 0.51).label).toBe('inaccuracy')
		expect(q(0.6, 0.41).label).toBe('mistake')
		expect(q(0.6, 0.3).label).toBe('blunder')
	})

	it('reads E from the mover\'s side', () => {
		expect(qualityOf({ color: 'b', bestE: 0.4, playedE: 0.7 }).label).toBe('blunder')
		expect(qualityOf({ color: 'b', bestE: 0.4, playedE: 0.4 }).label).toBe('best')
	})

	it('makes an avoidable king shot a blunder', () => {
		expect(q(0.6, 0.58, { allowsKingShot: true }).label).toBe('blunder')
	})

	it('caps labels at Inaccuracy in decided positions', () => {
		expect(q(0.99, 0.5).label).toBe('inaccuracy')
		expect(q(0.02, 0).label).toBe('excellent')
	})

	it('finds brilliancies and only moves', () => {
		expect(q(0.6, 0.6, { quantum: true, bestClassicalE: 0.45 }).label).toBe('brilliant')
		expect(q(0.95, 0.95, { quantum: true, bestClassicalE: 0.5 }).label).not.toBe('brilliant')
		expect(q(0.6, 0.6, { secondBestE: 0.4 }).label).toBe('only')
		expect(q(0.6, 0.6, { secondBestE: 0.5 }).label).toBe('best')
	})

	it('tags lucky and unlucky rolls from the realised E', () => {
		expect(q(0.5, 0.5, { outcomes: [], realisedE: 0.7 }).luck).toBe('lucky')
		expect(q(0.5, 0.5, { outcomes: [], realisedE: 0.3 }).luck).toBe('unlucky')
		expect(q(0.5, 0.5, { outcomes: [], realisedE: 0.55 }).luck).toBeNull()
		expect(q(0.5, 0.5).luck).toBeNull()
	})

	it('grades a PlyAnalysis', () => {
		const ply = { ply: 3, color: 'b', code: 'e7-e5', forced: false, EBefore: 0.5, bestCode: 'd7-d5', bestE: 0.5, secondBestE: 0.52, bestClassicalE: 0.5, playedE: 0.66, outcomes: null, realisedE: 0.66, allowsKingShot: false }
		expect(qualityOfPly(ply).label).toBe('mistake')
	})
})

describe('key moments', () => {
	it('picks the largest errors per player and the largest luck swings', () => {
		const plies = [
			{ ply: 0, color: 'w', code: 'a', bestCode: 'b', EBefore: 0.5, bestE: 0.5, playedE: 0.3, realisedE: 0.3, outcomes: null },
			{ ply: 1, color: 'b', code: 'c', bestCode: 'c', EBefore: 0.3, bestE: 0.3, playedE: 0.3, realisedE: 0.6, outcomes: [{}] },
			{ ply: 2, color: 'w', code: 'd', bestCode: 'd', EBefore: 0.6, bestE: 0.6, playedE: 0.59, realisedE: 0.59, outcomes: null },
		]
		const m = keyMoments(plies)
		expect(m.map((x) => [x.ply, x.kind])).toEqual([[0, 'error'], [1, 'luck']])
		expect(m[1].luckPp).toBeCloseTo(-30)
	})
})

describe('move chips', () => {
	it('validates codes with findMove; illegal ones stay plain', () => {
		const chips = moveChips('Play `e2-e4` or g1-f3|h3, not e2-e5. Also `g1-f3|h3`.', initialState())
		expect(chips.map((c) => [c.text, c.legal])).toEqual([['e2-e4', true], ['g1-f3|h3', true], ['e2-e5', false]])
	})

	it('cuts answers at 2000 characters', () => {
		expect(truncateAnswer('x'.repeat(2500))).toHaveLength(2000)
	})
})

describe('threats and themes', () => {
	it('W2-style threat: a rook facing a 50 % knight ghost', () => {
		// white knight 50/50 on d5/f5, black rook attacks d5 along the file
		const s = setupPosition({ fen: '3r2k1/8/8/8/8/8/4N3/6K1 w - - 0 1', prelude: ['e2-d4|f4'] })
		const threats = threatsAgainst(s, 'w')
		expect(threats[0].type).toBe('n')
		expect(threats[0].pCap).toBeCloseTo(0.5)
		expect(visibleThreats(threats, 'beginner')).toHaveLength(1)
		expect(visibleThreats(threats, 'standard')).toHaveLength(0)
	})

	it('detects converge (P03), shootThrough-like king shots (P05) and defendKing (P09)', () => {
		const p03 = setupPosition({ fen: '7k/6pr/8/4N3/2B5/8/8/2K5 w - - 0 1', prelude: ['e5-g6|f7'] })
		expect(themeOf(p03, 'g6|f7-h8')).toBe('converge')
		const p05 = setupPosition({ fen: 'R6k/1n4pp/8/8/8/8/2K5/8 w - - 0 1', prelude: ['b7-c5|d8'] })
		expect(themeOf(p05, 'a8-d8')).toBe('trap')
		const p09 = setupPosition({ fen: '3r3k/6pp/8/6B1/4q3/8/8/4K3 w - - 0 1', prelude: ['e4-b4|h4'] })
		expect(themeOf(p09, 'e1-e2')).toBe('defendKing')
		expect(kingShot(p09, 'b')).toBe(1)
		const l42 = setupPosition({ fen: '4k3/8/2b5/8/4P3/8/8/4K3 w - - 0 1', prelude: ['c6-d5|b7'] })
		expect(themeOf(l42, 'e4-d5')).toBe('probe')
	})

	it('hint tiers: Nudge highlights the piece, Idea draws the arrow', () => {
		const s = setupPosition({ fen: '3k4/pp6/8/8/8/8/5PPP/3R2K1 w - - 0 1' })
		const analysis = { E: 1, best: [{ code: 'd1-d8', E: 1, pv: ['d1-d8'] }] }
		const h1 = hintFor(s, analysis, 1)
		expect(h1.highlights).toEqual([{ square: 3, kind: 'hint' }])
		expect(h1.arrows).toEqual([])
		const h2 = hintFor(s, analysis, 2)
		expect(h2.arrows).toEqual([{ from: 3, to: 59, kind: 'best' }])
		expect(h2.text).toContain('d8')
		expect(engineAnswer(s, analysis, 'w')).toContain('`d1-d8`')
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
		expect(reviewGame({ source: 'local', id: 'y', local: { ...rec, mode: 'local', humanColor: null } }).viewer, 'pass & play has no single viewer').toBeNull()
	})
})
