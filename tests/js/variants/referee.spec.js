/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The views of the server-ruled variants (src/variants/referee.js): a player's view never holds an enemy piece that
 * the player cannot see (none at all in Kriegspiel), keeps the weights, hides the other player's moves, lists the legal
 * moves of the real state in Fog of war, and is the real state once the game has ended.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import {
	applyMove,
	isRefereed,
	legalMoves,
	loadVariant,
	newGame,
	refereePreview,
	T,
	viewFor,
} from '../../../src/variants/index.js'

/**
 * The states of a seeded random game.
 *
 * @param {object} V variant
 * @param {number} seed seed
 * @param {number} plies most plies
 * @return {object[]}
 */
function states(V, seed, plies) {
	const rng = seededRng(seed)
	let s = newGame(V, {})
	const out = [s]
	while (out.length <= plies && !s.result) {
		const list = legalMoves(V, s, { splits: rng() < 0.3 })
		s = applyMove(V, s, list[Math.floor(rng() * list.length)].code, Math.floor(rng() * T) / T).state
		out.push(s)
	}
	return out
}

/**
 * The squares of the enemy pieces in a view.
 *
 * @param {object} view state
 * @param {number} seat viewer
 * @return {Set<number>}
 */
function enemySquares(view, seat) {
	const out = new Set()
	for (const { b } of view.worlds) {
		b.sq.forEach((sq, id) => {
			if (b.sd[id] !== seat && sq >= 0) {
				out.add(sq)
			}
		})
	}
	return out
}

describe('referee views', () => {
	it('knows which variants the server rules', () => {
		expect(isRefereed('kriegspiel')).toBe(true)
		expect(isRefereed('darkchess')).toBe(true)
		expect(isRefereed('atomic')).toBe(false)
	})

	it('never shows an enemy piece in Kriegspiel, nor the other player\'s moves', async () => {
		const V = await loadVariant('kriegspiel')
		for (const s of states(V, 3, 60).filter((x) => !x.result)) {
			for (const seat of [0, 1]) {
				const view = viewFor(V, s, seat)
				expect(enemySquares(view, seat).size).toBe(0)
				expect(view.worlds.reduce((sum, w) => sum + w.w, 0)).toBe(T)
				expect(view.quiet).toBe(0)
				for (const h of view.history.filter((r) => r.side !== seat)) {
					expect([h.code, h.key, h.captures]).toEqual(['', '', []])
				}
				expect(view.legal).toEqual([])
			}
		}
	})

	it('shows an enemy piece in Fog of war only on a visible square', async () => {
		const V = await loadVariant('darkchess')
		for (const s of states(V, 5, 60).filter((x) => !x.result)) {
			for (const seat of [0, 1]) {
				const view = viewFor(V, s, seat)
				const visible = new Set(view.visible)
				for (const sq of enemySquares(view, seat)) {
					expect(visible.has(sq)).toBe(true)
				}
				expect(view.worlds.reduce((sum, w) => sum + w.w, 0)).toBe(T)
				for (const { b } of view.worlds) {
					expect((b.x.castle ?? []).every((r) => r.side === seat)).toBe(true)
				}
				const ordinary = legalMoves(V, s).filter((m) => m.type === 'move').map((m) => m.code)
				const legal = seat === s.turn ? ordinary : []
				expect(view.legal).toEqual(legal)
			}
		}
	})

	it('is the real state once the game has ended', async () => {
		const V = await loadVariant('darkchess')
		const end = states(V, 7, 400).at(-1)
		expect(end.result).not.toBeNull()
		expect(viewFor(V, end, 1)).toEqual({ ...end, visible: null, legal: null })
	})

	it('previews a move without its result, and refuses an impossible one', async () => {
		const V = await loadVariant('darkchess')
		const s = newGame(V, {})
		expect(refereePreview(V, s, 'e2-e4')).toEqual([{ key: 'move', notes: [], p: 1, captures: [], rolled: false }])
		expect(refereePreview(V, s, 'e2-e5')).toBeNull()
	})
})
