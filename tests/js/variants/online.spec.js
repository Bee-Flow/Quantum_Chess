/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Online variant play: the seats, teams and result codes agree with the shared fixture, the recorded games replay to
 * the same claims in every browser, and a replay stops at the first move that does not agree.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
	CATALOG,
	isOnlineVariant,
	loadVariant,
	newGame,
	ONLINE_RULES_VERSION,
	positionHash,
	replayOnline,
	resultCode,
	seatCount,
	teamsOf,
} from '../../../src/variants/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = JSON.parse(readFileSync(join(HERE, '../../fixtures/online-variants.json'), 'utf8'))
const REGENERATE = 'a rule changed: raise ONLINE_RULES_VERSION and run npm run fixtures:online'

/**
 * The first recorded game of a variant, with its rules module and start state.
 *
 * @param {string} variant variant id
 * @return {Promise<{V: object, start: object, moves: object[]}>}
 */
async function recorded(variant) {
	const game = FIXTURE.replays.find((r) => r.variant === variant)
	const V = await loadVariant(variant)
	return { V, start: newGame(V, game.options), moves: game.moves }
}

describe('online variants: catalogue', () => {
	it('matches the fixture for every variant', () => {
		expect(FIXTURE.rulesVersion).toBe(ONLINE_RULES_VERSION)
		expect(FIXTURE.catalog.map((c) => c.id)).toEqual(CATALOG.map((e) => e.id))
		for (const c of FIXTURE.catalog) {
			expect(seatCount(c.id)).toBe(c.seats)
			expect(isOnlineVariant(c.id)).toBe(c.online)
			expect(teamsOf(c.id)).toEqual(c.teams)
			if (c.teamOptions) {
				expect(teamsOf(c.id, c.teamOptions)).toEqual(c.teamsWithOptions)
			}
		}
	})

	it('keeps the hidden-information variants offline and knows no unknown variant', () => {
		expect(isOnlineVariant('kriegspiel')).toBe(false)
		expect(isOnlineVariant('darkchess')).toBe(false)
		expect(isOnlineVariant('bughouse')).toBe(true)
		expect(isOnlineVariant('classic')).toBe(false)
		expect(seatCount('classic')).toBe(0)
	})

	it('gives four seats in two teams to Bughouse and to Four-player chess in teams only', () => {
		expect(seatCount('bughouse')).toBe(4)
		expect(teamsOf('bughouse')).toEqual([[0, 2], [1, 3]])
		expect(teamsOf('fourplayer', { mode: 'ffa' })).toBeNull()
		expect(teamsOf('fourplayer', { mode: 'teams' })).toEqual([[0, 2], [1, 3]])
	})
})

describe('online variants: result codes', () => {
	it('match the fixture', () => {
		for (const { result, code } of FIXTURE.results) {
			expect(resultCode(result)).toBe(code)
		}
	})

	it('sort the winning seats', () => {
		expect(resultCode({ winner: null, winners: [3, 1], reason: 'resign' })).toBe('win:1,3/resign')
	})
})

describe('online variants: replay', () => {
	const games = FIXTURE.replays.map((r, i) => [r.variant + ' #' + i, r])
	it.each(games)('replays %s to the recorded claims', async (_, game) => {
		const V = await loadVariant(game.variant)
		const r = replayOnline(V, newGame(V, game.options), game.moves)
		expect(r.mismatch, REGENERATE).toBeNull()
		const last = game.moves.at(-1)
		expect(r.state.ply).toBe(last.ply + 1)
		expect(r.settlement).toEqual({ nextSeat: last.nextSeat, result: last.result, stateHash: last.stateHash })
		expect(positionHash(r.state)).toBe(last.stateHash)
	})

	it('records finished games', () => {
		const finished = FIXTURE.replays.filter((r) => r.moves.at(-1).result !== '')
		expect(finished.map((r) => r.variant)).toEqual(expect.arrayContaining(['atomic', 'threecheck']))
	})

	it('resumes from a snapshot with the same result as from the start', async () => {
		const { V, start, moves } = await recorded('bughouse')
		const half = replayOnline(V, start, moves.slice(0, 20))
		const resumed = replayOnline(V, half.state, moves)
		const full = replayOnline(V, start, moves)
		expect(resumed.mismatch).toBeNull()
		expect(resumed.state).toEqual(full.state)
	})

	it('accepts an unsettled last move and reports what it leads to', async () => {
		const { V, start, moves } = await recorded('crazyhouse')
		const last = moves.at(-1)
		const unsettled = [...moves.slice(0, -1), { ...last, nextSeat: null, result: null, stateHash: null }]
		const r = replayOnline(V, start, unsettled)
		expect(r.mismatch).toBeNull()
		expect(r.settlement).toEqual({ nextSeat: last.nextSeat, result: last.result, stateHash: last.stateHash })
	})

	it.each([
		['a forged position hash', { stateHash: '0000000000000000' }, 'stateHash'],
		['a forged next seat', { nextSeat: 3 }, 'nextSeat'],
		['a forged result', { result: 'win:0/king' }, 'result'],
		['a move by the wrong seat', { seat: 2 }, 'seat'],
		['the wrong ply', { ply: 99 }, 'ply'],
		['a roll outside [0, T)', { u: 16777216 }, 'roll'],
		['an illegal move', { code: 'a1-a8' }, 'illegal'],
	])('stops at %s', async (_, change, reason) => {
		const { V, start, moves } = await recorded('fourplayer')
		const forged = moves.map((m, i) => (i === 12 ? { ...m, ...change } : m))
		const r = replayOnline(V, start, forged)
		expect(r.mismatch).toEqual({ ply: 12, reason })
		expect(r.state.ply).toBe(12)
	})

	it('refuses a move after the end of the game', async () => {
		const { V, start, moves } = await recorded('atomic')
		const after = { ...moves.at(-1), ply: moves.length, seat: 0 }
		const r = replayOnline(V, start, [...moves, after])
		expect(r.mismatch).toEqual({ ply: moves.length, reason: 'finished' })
	})
})
