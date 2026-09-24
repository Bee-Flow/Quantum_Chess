/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The seats, names, player cards and results of an online game, derived from the server's game record.
 */

import { describe, expect, it } from 'vitest'
import { isParticipant, onlinePlayerInfo, onlineResult, seatName, seatOf } from '../../../src/online/onlinePlayers.js'

const ALICE = { userId: 'alice', displayName: 'Alice' }
const BOB = { userId: 'bob', displayName: 'Bob' }
const viewer = { uid: 'alice', displayName: 'Alice' }

describe('seats', () => {
	it('uses the seated players once the game started', () => {
		const g = { status: 'active', white: BOB, black: ALICE, creator: ALICE, opponent: BOB }
		expect(seatOf(g, 'w', viewer)).toBe(BOB)
		expect(isParticipant(g, 'alice')).toBe(true)
		expect(isParticipant(g, 'carol')).toBe(false)
	})

	it('follows the colour choice before the start', () => {
		const g = { status: 'pending', creator: ALICE, opponent: BOB, colorChoice: 'b' }
		expect(seatOf(g, 'b', viewer)).toBe(ALICE)
		expect(seatOf(g, 'w', viewer)).toBe(BOB)
	})

	it('shows the invited viewer as White while random colours are not drawn yet', () => {
		const g = { status: 'pending', creator: BOB, opponent: null, colorChoice: 'r' }
		expect(seatOf(g, 'w', viewer)).toEqual({ userId: 'alice', displayName: 'Alice' })
		expect(seatOf(g, 'b', viewer)).toBe(BOB)
	})

	it('names an empty seat of an open challenge', () => {
		const g = { status: 'open', creator: ALICE, opponent: null, colorChoice: 'w' }
		expect(seatName(g, 'b', viewer)).toBe('Open seat')
		expect(seatName(null, 'w', viewer)).toBe('White')
	})
})

describe('player cards and result', () => {
	it('tells whose move it is and how much time is left', () => {
		const g = { status: 'active', white: ALICE, black: BOB, turn: 'w', deadlineAt: 1000 + 18 * 3600, ratings: { w: { rating: 1500, provisional: true } } }
		const names = { w: 'Alice', b: 'Bob' }
		const white = onlinePlayerInfo(g, 'w', { viewer, names, myColor: 'w', now: 1000 })
		expect(white).toMatchObject({ kind: 'user', userId: 'alice', rating: 1500, provisional: true, statusText: '● Your move · 18 h left' })
		expect(onlinePlayerInfo(g, 'b', { viewer, names, myColor: 'w', now: 1000 }).statusText).toBe('')
		expect(onlinePlayerInfo({ ...g, turn: 'b' }, 'b', { viewer, names, myColor: 'w', now: 1000 }).statusText).toBe('● Bob to move · 18 h left')
		expect(onlinePlayerInfo({ ...g, status: 'pending' }, 'w', { viewer, names, myColor: 'w', now: 1000 }).statusText).toBe('Not started yet')
	})

	it('takes the result from the server', () => {
		expect(onlineResult({ status: 'finished', result: '0-1', resultReason: 'resignation', winner: 'b' })).toEqual({ result: '0-1', reason: 'resignation', winner: 'b', source: 'server' })
		expect(onlineResult({ status: 'aborted' })).toEqual({ result: '*', reason: 'aborted', winner: null, source: 'server' })
		expect(onlineResult({ status: 'active' })).toBeNull()
	})
})
