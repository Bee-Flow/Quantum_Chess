// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * localGames.js: the roll memo (persisted before applying, same result after undo, promotions share one u, a later ply
 * is a fresh roll), replay and pruning.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { applyMove, rollIdentity, setupPosition } from '../../../src/engine/index.js'
import {
	createLocalGame,
	deleteLocalGame,
	INDEX_KEY,
	listLocalGames,
	loadLocalGame,
	MAX_LOCAL_GAMES,
	RECORD_PREFIX,
	replayLocalGame,
	rollFor,
	saveLocalGame,
} from '../../../src/game/localGames.js'

const players = { w: { kind: 'human' }, b: { kind: 'engine', level: 1 } }

beforeEach(() => {
	localStorage.clear()
})

describe('local games', () => {
	it('creates, lists, loads and deletes records', () => {
		const rec = createLocalGame({ mode: 'computer', players, humanColor: 'w' })
		expect(rec.id).toMatch(/^lg_[0-9a-z]+$/)
		expect(listLocalGames()).toEqual([expect.objectContaining({ id: rec.id, mode: 'computer', result: null })])
		expect(loadLocalGame(rec.id)).toMatchObject({ v: 1, mode: 'computer', humanColor: 'w', moves: [], rolls: {} })
		deleteLocalGame(rec.id)
		expect(loadLocalGame(rec.id)).toBeNull()
		expect(listLocalGames()).toEqual([])
	})

	it('persists a roll before the move is applied and reuses it', () => {
		const rec = createLocalGame({ mode: 'local', players: { w: { kind: 'local' }, b: { kind: 'local' } } })
		const state = setupPosition({ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['e1-d1', 'g8-f6|h6'] })
		let draws = 0
		const u = rollFor(rec, state, 'c1-h6', () => {
			draws++
			return 123456
		})
		expect(u).toBe(123456)
		// saved before anything was applied
		expect(loadLocalGame(rec.id).rolls[rollIdentity(state, 'c1-h6')]).toBe(123456)
		// the same move in the same position: same u, no new draw
		expect(rollFor(rec, state, 'c1-h6', () => draws++ && 1)).toBe(123456)
		expect(draws).toBe(1)
	})

	it('gives promotions one shared roll and a later ply a fresh one', () => {
		const rec = createLocalGame({ mode: 'local', players: {} })
		const state = setupPosition({ fen: '1n2k3/P7/8/8/8/8/8/4K3 w - - 0 1', prelude: ['e1-d1', 'b8-a6|c6'] })
		const u1 = rollFor(rec, state, 'a7-b8=Q', () => 42)
		const u2 = rollFor(rec, state, 'a7-b8=N', () => 43)
		expect(u2).toBe(u1)
		const later = { ...state, ply: state.ply + 2 }
		expect(rollFor(rec, later, 'a7-b8=Q', () => 44)).toBe(44)
	})

	it('replays with the recorded rolls', () => {
		const rec = createLocalGame({ mode: 'local', players: {} })
		const s0 = setupPosition({ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['e1-d1', 'g8-f6|h6'] })
		rec.startState = s0
		const res = applyMove(s0, 'c1-h6', { u: 1 })
		rec.moves.push({ code: 'c1-h6', u: 1, key: res.measurement.key, by: 'human' })
		const replay = replayLocalGame(rec)
		expect(replay.state).toEqual(res.state)
		expect(replay.steps[0].measurement.key).toBe(res.measurement.key)
	})

	it('prunes the oldest finished games first', () => {
		const ids = []
		for (let i = 0; i < MAX_LOCAL_GAMES; i++) {
			const rec = createLocalGame({ mode: 'local', players: {} })
			rec.result = i === 3 ? { result: '1-0', reason: 'resignation' } : null
			saveLocalGame(rec)
			ids.push(rec.id)
		}
		// make ordering deterministic: game 0 is the oldest, game 3 is finished
		const index = JSON.parse(localStorage.getItem(INDEX_KEY)).map((e) => ({ ...e, updatedAt: 1000 + ids.indexOf(e.id) }))
		localStorage.setItem(INDEX_KEY, JSON.stringify(index))
		const extra = createLocalGame({ mode: 'local', players: {} })
		const left = listLocalGames().map((e) => e.id)
		expect(left).toHaveLength(MAX_LOCAL_GAMES)
		expect(left).toContain(extra.id)
		expect(left).not.toContain(ids[3])
		expect(left).toContain(ids[0])
		expect(localStorage.getItem(RECORD_PREFIX + ids[3])).toBeNull()
	})
})
