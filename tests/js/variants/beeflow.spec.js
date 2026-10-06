/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Bee Flow Chess: the shuffled back ranks, no castling, the privacy shield next to the Queen Bee (per world), the
 * pieces revealed by moving, the view with placeholders, the computer's guess, and the catalogue place at the top.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import V, { ARRANGEMENTS, backRank, HIDDEN, shielded, viewOf } from '../../../src/variants/beeflow.js'
import { applyMove, legalMoves, newGame, outcomes, T } from '../../../src/variants/core/quantum.js'
import { CATALOG, CATEGORIES } from '../../../src/variants/index.js'
import { play, stateOf } from './helpers.js'

/**
 * A state with an empty `seen` list and no castling.
 *
 * @param {Array<[object, number]>} worlds placements and relative weights
 * @param {number} [turn] side to move
 * @return {object}
 */
function start(worlds, turn = 0) {
	return stateOf(V, worlds, turn, (b) => {
		b.x = { ep: -1, epVictim: -1, castle: [], seen: [] }
	})
}

/**
 * The ordinary legal move codes.
 *
 * @param {object} s state
 * @return {string[]}
 */
function codes(s) {
	return legalMoves(V, s).filter((m) => m.type === 'move').map((m) => m.code)
}

describe('Bee Flow Chess', () => {
	it('is the first variant of the catalogue, in its own first category', () => {
		expect(CATALOG[0].id).toBe('beeflow')
		expect(CATEGORIES[0]).toBe('featured')
		expect(V.category).toBe('featured')
	})

	it('numbers the 5040 back ranks, each with one Queen Bee', () => {
		expect([backRank(0), backRank(ARRANGEMENTS - 1)]).toEqual(['bbknnqrr', 'rrqnnkbb'])
		const all = new Set(Array.from({ length: ARRANGEMENTS }, (_, i) => backRank(i)))
		expect(all.size).toBe(ARRANGEMENTS)
		for (const rank of all) {
			expect([...rank].sort().join('')).toBe('bbknnqrr')
		}
	})

	it('shuffles each side on its own and gives no castling rights', () => {
		const s = newGame(V, { white: 0, black: ARRANGEMENTS - 1 })
		const b = s.worlds[0].b
		const rank = (r) => [0, 1, 2, 3, 4, 5, 6, 7].map((f) => b.ty[b.board[V.topology.at([f, r])]]).join('')
		expect([rank(0), rank(7)]).toEqual(['bbknnqrr', 'rrqnnkbb'])
		expect(b.x).toEqual({ ep: -1, epVictim: -1, castle: [], seen: [] })
		expect(s.options).toEqual({ white: 0, black: ARRANGEMENTS - 1 })
		const random = newGame(V, {}, seededRng(3)).worlds[0].b
		expect(random.ty.filter((t) => t === 'k')).toHaveLength(2)
		expect(codes(newGame(V, { white: 0, black: 0 }))).not.toContain('O-O')
	})

	it('shields a piece next to its own Queen Bee, but not the Queen Bee herself', () => {
		const s = start([[{ a1: '0:k', e8: '1:k', d7: '1:n', d1: '0:q' }, 1]], 0)
		// the knight on d7 stands next to the Queen Bee on e8: the queen cannot take it
		expect(codes(s)).not.toContain('d1-d7')
		expect(shielded(s.worlds[0].b, s.worlds[0].b.board[V.topology.byName('d7')])).toBe(true)
		const away = start([[{ a1: '0:k', h8: '1:k', d7: '1:n', d1: '0:q' }, 1]], 0)
		expect(codes(away)).toContain('d1-d7')
		const queen = start([[{ a1: '0:k', e1: '0:r', e8: '1:k', d7: '1:n' }, 1]], 0)
		expect(codes(queen)).toContain('e1-e8')
	})

	it('decides the shield in each possibility on its own', () => {
		// the Queen Bee is a ghost on e8 or h5: next to the knight on d7 in one possibility only
		const s = start([
			[{ a1: '0:k', d1: '0:q', e8: '1:k', d7: '1:n' }, 1],
			[{ a1: '0:k', d1: '0:q', h5: '1:k', d7: '1:n' }, 1],
		], 0)
		const outs = outcomes(V, s, 'd1-d7')
		expect(outs.map((o) => [o.key, o.p])).toEqual([['miss', 0.5], ['capture', 0.5]])
		// the miss is the world in which the Queen Bee stood next to the knight
		const missed = play(V, s, 'd1-d7', 0).worlds
		expect(missed.map(({ b }) => b.sq[b.board[V.topology.byName('e8')]] >= 0)).toEqual([true])
	})

	it('reveals a piece once it has moved, in every possibility', () => {
		let s = newGame(V, { white: 0, black: 0 })
		const knight = s.worlds[0].b.board[V.topology.byName('d1')]
		expect(s.worlds[0].b.ty[knight]).toBe('n')
		s = applyMove(V, s, 'd1-c3|e3', 0).state
		for (const { b } of s.worlds) {
			expect(b.x.seen).toEqual([knight])
		}
	})

	it('shows the enemy pieces that have not moved as placeholders, pawns and moved pieces as they are', () => {
		let s = newGame(V, { white: 0, black: 1234 })
		s = applyMove(V, s, 'd1-c3', 0).state
		const black = viewOf(s, 1).worlds[0].b
		const white = viewOf(s, 0).worlds[0].b
		const at = (b, name) => b.ty[b.board[V.topology.byName(name)]]
		expect([at(black, 'c3'), at(black, 'a1'), at(black, 'e1'), at(black, 'a2')]).toEqual(['n', HIDDEN, HIDDEN, 'p'])
		expect(at(white, 'a8')).toBe(HIDDEN)
		expect(at(white, 'a1')).toBe('b')
		expect(viewOf(s, 1).options).toEqual({})
	})

	it('never shows a hidden type in a random game, and lets the computer guess', () => {
		const rng = seededRng(11)
		let s = newGame(V, {}, rng)
		for (let i = 0; i < 80 && !s.result; i++) {
			const list = legalMoves(V, s, { splits: rng() < 0.3 })
			s = applyMove(V, s, list[Math.floor(rng() * list.length)].code, Math.floor(rng() * T) / T).state
			for (const side of [0, 1]) {
				for (const { b } of viewOf(s, side).worlds) {
					b.ty.forEach((ty, id) => {
						if (b.sd[id] !== side && ty !== 'p' && ty !== HIDDEN) {
							expect(b.x.seen).toContain(id)
						}
					})
				}
				const guess = V.aiView(s, side)
				expect(guess.worlds.every(({ b }) => b.ty.every((ty) => ty !== HIDDEN))).toBe(true)
				expect(guess.worlds.reduce((sum, { w }) => sum + w, 0)).toBe(T)
			}
		}
	})
})
