// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The hash-chain check: a correct game verifies, an edited roll or chain is found, a deleted player is not an alarm,
 * and the stored (ply, chain) of this browser must still be there.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { CHAIN_STORAGE_KEY, chainKey, loadStoredChain, storeChain, verifyGame } from '../../../src/online/chainCheck.js'
import { makeGame } from './fixtures.js'

// g1-f3|h3, e7-e5, then the rolled capture f3xe5 (u = 1 → the first outcome; u = 2^24 − 1 → the last)
const LINE = ['g1-f3|h3', 'e7-e5', { code: 'f3-e5', u: 16777215 }]

beforeEach(() => {
	localStorage.clear()
})

describe('chain check', () => {
	it('replays a correct game and reaches the server head', () => {
		const game = makeGame(LINE)
		const r = verifyGame(game)
		expect(r.status).toBe('ok')
		expect(r.alteredPly).toBeNull()
		expect(r.chain).toBe(game.chain)
		expect(r.states).toHaveLength(4)
		expect(r.steps[2].measurement.u).toBe(16777215)
	})

	it('finds an edited roll', () => {
		const game = makeGame(LINE)
		const edited = {
			...game,
			moves: game.moves.map((m, i) => (i === 2 ? { ...m, measurement: { ...m.measurement, u: 1 } } : m)),
		}
		const r = verifyGame(edited)
		expect(r.status).toBe('altered')
		expect(r.alteredPly).toBe(2)
	})

	it('finds a rewritten chain', () => {
		const game = makeGame(LINE)
		const edited = { ...game, moves: game.moves.map((m, i) => (i === 0 ? { ...m, chain: 'f'.repeat(64) } : m)) }
		expect(verifyGame(edited)).toMatchObject({ status: 'altered', alteredPly: 0 })
	})

	it('cannot verify a game with a deleted player and raises no alarm', () => {
		const game = makeGame(LINE, {})
		const r = verifyGame({ ...game, black: { userId: null, displayName: 'Deleted user' } })
		expect(r.status).toBe('unverifiable')
		expect(r.alteredPly).toBeNull()
	})

	it('checks the (ply, chain) this browser saw before', () => {
		const game = makeGame(LINE)
		storeChain(chainKey(game), 1, game.moves[1].chain)
		expect(loadStoredChain(chainKey(game))).toEqual({ ply: 1, chain: game.moves[1].chain })
		expect(verifyGame(game).status).toBe('ok')
		// a server that rewrote the whole history consistently still differs from what we saw
		storeChain(chainKey(game), 1, 'a'.repeat(64))
		expect(verifyGame(game)).toMatchObject({ status: 'altered', alteredPly: 1 })
		// a reused id with another creation time is a different game
		expect(verifyGame({ ...game, createdAt: game.createdAt + 1, chain: null, moves: [] }).alteredPly).toBeNull()
		expect(JSON.parse(localStorage.getItem(CHAIN_STORAGE_KEY))).toHaveProperty(chainKey(game))
	})
})
