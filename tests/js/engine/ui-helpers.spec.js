/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * GAME-DESIGN §12.1 JS-only UI helpers: explainOutcome, diffViews, splitTargets, identityColours.
 */

import { describe, expect, it } from 'vitest'
import * as UI from '../../../src/engine/ui/index.js'
import { craft, E, play, S, T } from './helpers.js'

const W3 = S('4k3/8/3b4/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3', 'd6-c7|e5'])

describe('explainOutcome', () => {
	it('is not re-exported by the engine index (SPEC §3.2)', () => {
		expect(E.explainOutcome).toBe(undefined)
		expect(E.splitTargets).toBe(undefined)
	})

	it('Missed, absent: the knight was not on f3', () => {
		const x = UI.explainOutcome(W3, 'f3-e5', 'miss')
		expect(x.weight).toBe(8388608)
		expect(x.causes).toEqual({ absent: 8388608, blocked: 0, own_piece: 0, occupied: 0, no_enemy: 0 })
		expect(x.cause).toBe('absent')
		expect(x.pieceAfter).toEqual([{ square: 23, weight: T, probability: 1 }])
		expect(x.targetPiece).toBe(20)
	})

	it('Moved: the bishop was elsewhere; it settled with the roll', () => {
		const x = UI.explainOutcome(W3, 'f3-e5', 'move')
		expect(x.cause).toBe(null)
		expect(x.targetPieceAfter).toEqual([{ square: 50, weight: T, probability: 1 }])
		expect(x.settled).toEqual([{ piece: 20, square: 50 }])
	})

	it('Captured', () => {
		const x = UI.explainOutcome(W3, 'f3-e5', 'capture')
		expect(x.captured).toBe(20)
		expect(x.state.captured).toContain(20)
	})

	it('Missed, blocked: names the piece in the way', () => {
		const s = S('r3k3/8/1n6/8/8/8/8/R3K3 w - - 0 1', ['b6-a4|c4'])
		const x = UI.explainOutcome(s, 'a1-a8', 'miss')
		expect(x.cause).toBe('blocked')
		expect(x.blockers).toEqual([{ piece: 22, square: 24, weight: 8388608 }])
	})

	it('Missed, own piece on the target', () => {
		const s = S('4k3/8/8/8/8/8/8/RN2K3 w - - 0 1', ['b1-a3|c3'])
		const x = UI.explainOutcome(s, 'a1-a3', 'miss')
		expect(x.cause).toBe('own_piece')
		expect(x.occupant).toEqual({ piece: 6, weight: 8388608 })
	})

	it('pawn push Missed: occupied; pawn capture Missed: no enemy', () => {
		const s = S('4k3/8/8/8/6n1/8/4P3/4K3 w - - 0 1', ['g4-e3|h6'])
		expect(UI.explainOutcome(s, 'e2-e3', 'miss').cause).toBe('occupied')
		expect(UI.explainOutcome(s, 'e2-e4', 'miss').cause).toBe('blocked')
		const w7 = ['g8-f6|h6', 'e1-e2', 'f6-d5|e4'].reduce((st, c) => play(st, c), S('4k1n1/8/8/8/8/3P4/8/4K3 b - - 0 1'))
		const x = UI.explainOutcome(w7, 'd3-e4', 'miss')
		expect(x.cause).toBe('no_enemy')
		expect(x.causes.no_enemy).toBe(12582912)
	})

	it('merge that misses because of a third part; Measure; quantum and certain moves', () => {
		const w7 = play(['g8-f6|h6', 'e1-e2', 'f6-d5|e4'].reduce((st, c) => play(st, c), S('4k1n1/8/8/8/8/3P4/8/4K3 b - - 0 1')), 'e2-e1')
		expect(UI.explainOutcome(w7, 'd5|e4-f6', 'quantum').key).toBe('quantum')
		const w4 = play(play(S('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), 'b6-a4|c4'), 'a1-a8')
		const m = UI.explainOutcome(w4, '?a4', 'c4')
		expect(m.pieceAfter).toEqual([{ square: 26, weight: T, probability: 1 }])
		expect(m.settled).toEqual([{ piece: 2, square: 56 }])
		expect(UI.explainOutcome(E.initialState(), 'e2-e4', 'certain').probability).toBe(1)
		expect(() => UI.explainOutcome(W3, 'f3-e5', 'certain')).toThrow(RangeError)
		expect(() => UI.explainOutcome(W3, 'f3-e4', 'miss')).toThrowError(expect.objectContaining({ code: 'unreachable' }))
	})
})

describe('diffViews', () => {
	it('a roll: the knight moves, the bishop settles', () => {
		const after = play(W3, 'f3-e5', { outcome: 'move' })
		const d = UI.diffViews(W3, after)
		expect(d.settled).toEqual([20])
		expect(d.captured).toEqual([])
		expect(d.pieces.find((p) => p.piece === 7)).toMatchObject({ kind: 'moved', from: [21, 23], to: [36] })
		expect(d.squares[21].kind).toBe('vanish')
		expect(d.squares[50].kind).toBe('solidify')
		expect(d.squares[36]).toMatchObject({ kind: 'replace', beforePiece: 20, afterPiece: 7 })
		expect(d.squares[4]).toBe(null)
	})

	it('a capture and a new ghost', () => {
		const cap = play(W3, 'f3-e5', { outcome: 'capture' })
		const d = UI.diffViews(W3, cap)
		expect(d.captured).toEqual([20])
		expect(d.squares[50].kind).toBe('captured')
		expect(d.pieces.find((p) => p.piece === 20).kind).toBe('captured')
		const g = UI.diffViews(E.initialState(), play(E.initialState(), 'g1-f3|h3'))
		expect(g.ghosts).toEqual([7])
		expect(g.squares[21]).toMatchObject({ kind: 'appear', after: 8388608 })
	})

	it('reweighting only', () => {
		const s = S('4k1n1/8/8/8/7R/3P4/8/4K3 w - - 0 1', ['g8-f6|h6', 'f6-d5|e4'])
		const after = play(s, 'd3-e4', { outcome: 'miss' })
		const d = UI.diffViews(s, after)
		expect(d.pieces.find((p) => p.piece === 23)).toMatchObject({ kind: 'moved', from: [28], to: [] })
		expect(d.squares[47].kind).toBe('grow')
	})
})

describe('splitTargets', () => {
	it('start position knights', () => {
		const r = UI.splitTargets(E.initialState(), 6)
		expect(r.reason).toBe(null)
		expect(r.targets).toEqual([
			{ square: 12, legal: false, reason: 'split_target_occupied', partners: [] },
			{ square: 21, legal: true, reason: null, partners: [23] },
			{ square: 23, legal: true, reason: null, partners: [21] },
		])
		expect(r.pairs.map((p) => [p.code, p.reason])).toEqual([
			['g1-e2|f3', 'split_target_occupied'],
			['g1-e2|h3', 'split_target_occupied'],
			['g1-f3|h3', null],
		])
		expect(r.pairs[2].move.code).toBe('g1-f3|h3')
	})

	it('pieces that cannot split', () => {
		expect(UI.splitTargets(E.initialState(), 4).reason).toBe('cannot_split')
		expect(UI.splitTargets(E.initialState(), 28).reason).toBe('no_piece')
		expect(UI.splitTargets(E.initialState(), 62).reason).toBe('not_your_piece')
	})

	it('budget_full and split_blocked targets (W13)', () => {
		const s = S('4k3/8/8/8/8/6n1/8/KNBR4 w - - 0 1', ['g3-f1|h5', 'b1-a3|c3', 'c1-b2|e3'])
		const r = UI.splitTargets(s, 3)
		const by = Object.fromEntries(r.targets.map((t) => [E.squareName(t.square), t.reason]))
		expect(by.f1).toBe('split_target_occupied')
		expect(by.h1).toBe('budget_full')
		expect(by.d5).toBe(null)
		expect(r.pairs.find((p) => p.code === 'd1-h1|d5').reason).toBe('budget_full')
	})
})

describe('identityColours', () => {
	it('assigns in order, keeps, and recycles', () => {
		const states = [E.initialState()]
		for (const c of ['g1-f3|h3', 'b8-a6|c6', 'b1-a3|c3', 'g8-f6|h6', 'f3|h3-g1', 'a6|c6-b8', 'g1-f3|h3']) {
			states.push(play(states[states.length - 1], c))
		}
		expect(UI.identityColours(states.slice(0, 2))).toEqual({ 7: 1 })
		expect(UI.identityColours(states.slice(0, 4))).toEqual({ 6: 3, 7: 1, 22: 2 })
		expect(UI.identityColours(states.slice(0, 7))).toEqual({ 6: 3, 23: 4 })
		expect(UI.identityColours(states)).toEqual({ 6: 3, 7: 1, 23: 4 })
		expect(UI.identityColours(states[7], { 6: 3, 23: 4 })).toEqual({ 6: 3, 7: 1, 23: 4 })
		expect(UI.identityColours(E.initialState())).toEqual({})
	})

	it('shares the least used colour when all six are taken', () => {
		const s = craft([
			[{ e1: 'A', e8: 'a', b1: 'G', g1: 'H', c1: 'E', f1: 'F', b8: 'g', g8: 'h', c8: 'e' }, T / 2],
			[{ e1: 'A', e8: 'a', a3: 'G', h3: 'H', d2: 'E', e2: 'F', a6: 'g', h6: 'h', d7: 'e' }, T / 2],
		])
		const colours = UI.identityColours(s)
		expect(Object.keys(colours).map(Number)).toEqual([4, 5, 6, 7, 20, 22, 23])
		expect(colours).toEqual({ 4: 1, 5: 2, 6: 3, 7: 4, 20: 5, 22: 6, 23: 1 })
	})
})
