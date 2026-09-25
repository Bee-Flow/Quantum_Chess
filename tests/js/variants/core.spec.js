/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The quantum layer of the chess variants (src/variants/core): splits, merges, measurements,
 * "land = roll, pass = link", the budget, the solid roll, the game-end roll and the computer player, on orthodox chess.
 */

import { describe, expect, it } from 'vitest'
import { chooseMove } from '../../../src/variants/core/ai.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import {
	applyOutcome,
	branches,
	BUDGET,
	budget,
	legalMoves,
	newGame,
	outcomes,
	pieceLocations,
	royalDanger,
	splitsFrom,
	squareView,
	T,
} from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { worldFrom } from '../../../src/variants/core/world.js'
import { play, stateOf } from './helpers.js'

const V = defineVariant(Object.assign(orthodoxSpec(), { id: 'test', category: 'rules' }))

describe('orthodox chess in the quantum layer', () => {
	it('starts with the 20 ordinary moves and no ghosts', () => {
		const s = newGame(V)
		expect(legalMoves(V, s).map((m) => m.code).sort()).toHaveLength(20)
		expect(budget(s, 0)).toBe(1)
		expect(squareView(s, V.topology.byName('e1'))).toEqual([expect.objectContaining({ type: 'k', side: 0, p: 1 })])
	})

	it('splits a knight onto two empty squares, half each, and measures it back', () => {
		let s = play(V, newGame(V), 'g1-f3|h3')
		expect(s.worlds).toHaveLength(2)
		expect(s.worlds.map((w) => w.w)).toEqual([T / 2, T / 2])
		expect(budget(s, 0)).toBe(2)
		s = play(V, s, 'e7-e6')
		const knight = s.worlds[0].b.board[V.topology.byName('f3')] >= 0
			? s.worlds[0].b.board[V.topology.byName('f3')]
			: s.worlds[0].b.board[V.topology.byName('h3')]
		expect(pieceLocations(s, knight).map((l) => l.p)).toEqual([0.5, 0.5])
		const o = outcomes(V, s, '?f3')
		expect(o.map((x) => [x.key, x.p])).toEqual([['f3', 0.5], ['h3', 0.5]])
		const after = applyOutcome(V, s, '?f3', 1)
		expect(after.worlds).toHaveLength(1)
		expect(squareView(after, V.topology.byName('h3'))[0].p).toBe(1)
	})

	it('merges the two parts back into one solid piece', () => {
		let s = play(V, newGame(V), 'g1-f3|h3')
		s = play(V, s, 'e7-e6')
		const merges = legalMoves(V, s).filter((m) => m.type === 'merge').map((m) => m.code)
		expect(merges).toContain('f3|h3-g1')
		s = play(V, s, 'f3|h3-g1')
		expect(s.worlds).toHaveLength(1)
	})

	it('rolls when a piece lands on a square that might be occupied (land = roll)', () => {
		// White bishop c4 attacks f7; a black knight is 50 % on f7 and 50 % on d8... use an explicit position
		const s = stateOf(V, [
			[{ e1: '0:k', c4: '0:b', e8: '1:k', f7: '1:n' }, 1],
			[{ e1: '0:k', c4: '0:b', e8: '1:k', h6: '1:n' }, 1],
		])
		const o = outcomes(V, s, 'c4-f7')
		expect(o.map((x) => [x.key, x.p])).toEqual([['move', 0.5], ['capture', 0.5]])
	})

	it('links a slider that passes a maybe-occupied square (pass = link) without a roll', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', a1: '0:r', e8: '1:k', a4: '1:n' }, 1],
			[{ e1: '0:k', a1: '0:r', e8: '1:k', c5: '1:n' }, 1],
		])
		const o = outcomes(V, s, 'a1-a6')
		expect(o).toHaveLength(1)
		expect(o[0].rolled).toBe(false)
		const after = applyOutcome(V, s, 'a1-a6', 0)
		const rook = after.worlds[0].b.board
			.findIndex((id, sq) => id >= 0 && after.worlds[0].b.ty[id] === 'r' && sq >= 0)
		expect(rook).toBeGreaterThanOrEqual(0)
		const rookId = after.worlds[0].b.board[rook]
		expect(pieceLocations(after, rookId).map((l) => V.topology.names[l.sq])).toEqual(['a1', 'a6'])
	})

	it('keeps pawns solid: a pawn capturing on a ghost is rolled', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', e4: '0:p', e8: '1:k', d5: '1:n' }, 1],
			[{ e1: '0:k', e4: '0:p', e8: '1:k', b6: '1:n' }, 1],
		])
		const o = outcomes(V, s, 'e4-d5')
		expect(o.map((x) => x.key)).toEqual(['miss', 'capture'])
		for (let i = 0; i < 2; i++) {
			const after = applyOutcome(V, s, 'e4-d5', i)
			const pawnSquares = new Set(after.worlds.map(({ b }) => b.sq[b.ty.indexOf('p')]))
			expect(pawnSquares.size).toBe(1)
		}
	})

	it('ends the game when a king is captured', () => {
		const s = stateOf(V, [[{ e1: '0:k', e7: '0:q', e8: '1:k' }, 1]])
		const after = play(V, s, 'e7-e8')
		expect(after.result).toEqual({ winner: 0, reason: 'king' })
		expect(legalMoves(V, after)).toEqual([])
	})

	it('reports the danger to a king', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', a1: '0:r', e8: '1:k', e5: '1:r' }, 1],
		], 1)
		expect(royalDanger(V, s, 0)).toBe(1)
		expect(royalDanger(V, s, 1)).toBe(0)
	})

	it('never lets a side exceed the budget of 8 arrangements', () => {
		let s = newGame(V)
		s = play(V, s, 'g1-f3|h3')
		s = play(V, s, 'e7-e6')
		s = play(V, s, 'b1-a3|c3')
		s = play(V, s, 'd7-d6')
		s = play(V, s, 'e2-e3')
		s = play(V, s, 'h7-h6')
		s = play(V, s, 'f1-d3|e2')
		expect(budget(s, 0)).toBe(8)
		s = play(V, s, 'a7-a6')
		expect(budget(s, 0)).toBe(BUDGET)
		expect(splitsFrom(V, s, V.topology.byName('d1'))).toEqual([])
	})

	it('settles a result that holds in only some worlds with a game-end roll', () => {
		const W = defineVariant(Object.assign(orthodoxSpec(), {
			id: 'test-end',
			category: 'rules',
			worldResult(b) {
				const id = b.board[W.topology.byName('e5')]
				return id >= 0 && b.ty[id] === 'n' && b.sd[id] === 0 ? { winner: 0, reason: 'outpost' } : null
			},
		}))
		const s = stateOf(W, [[{ e1: '0:k', f3: '0:n', e8: '1:k' }, 1]])
		const list = branches(W, s, 'f3-e5|h4')
		expect(list).toHaveLength(2)
		expect(list.map((b) => b.weight)).toEqual([T / 2, T / 2])
		const won = list.findIndex((b) => b.notes.some((n) => n.includes('outpost')))
		expect(applyOutcome(W, s, 'f3-e5|h4', won).result).toEqual({ winner: 0, reason: 'outpost' })
		expect(applyOutcome(W, s, 'f3-e5|h4', 1 - won).result).toBeNull()
	})

	it('castles when the squares between king and rook are empty', () => {
		const s = stateOf(V, [[{ e1: '0:k', h1: '0:r', a1: '0:r', e8: '1:k' }, 1]], 0, (w) => {
			w.x = { ep: -1, epVictim: -1, castle: [
				{ flag: 'K', side: 0, king: 4, rook: 7, kingTo: 6, rookTo: 5 },
				{ flag: 'Q', side: 0, king: 4, rook: 0, kingTo: 2, rookTo: 3 },
			] }
		})
		const codes = legalMoves(V, s).map((m) => m.code)
		expect(codes).toContain('O-O')
		expect(codes).toContain('O-O-O')
		const after = play(V, s, 'O-O')
		const b = after.worlds[0].b
		expect(b.ty[b.board[V.topology.byName('g1')]]).toBe('k')
		expect(b.ty[b.board[V.topology.byName('f1')]]).toBe('r')
	})

	it('lets the computer choose a legal move, and take a free queen', async () => {
		const s = stateOf(V, [[{ e1: '0:k', d1: '0:r', e8: '1:k', d7: '1:q' }, 1]])
		const code = await chooseMove(V, s, { level: 'normal', rng: () => 0.5 })
		expect(code).toBe('d1-d7')
	})

	it('makes the same game from the same world list', () => {
		const w = worldFrom(V, { e1: '0:k', e8: '1:k' })
		expect(w.board.filter((id) => id >= 0)).toHaveLength(2)
	})
})
