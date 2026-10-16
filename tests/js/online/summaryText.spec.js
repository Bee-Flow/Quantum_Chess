/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * summaryText: the result of a finished game from the viewer's side (a game of more than two seats reads its winners
 * from the variant result code), the reason without colour names for a game of four, the other players as a list and
 * the player to move.
 */

import { describe, expect, it } from 'vitest'
import {
	endReasonText,
	nameList,
	outcomeText,
	playersText,
	seatedWinners,
	seatsJoinedText,
	toMoveName,
	turnText,
} from '../../../src/online/summaryText.js'

const user = (userId, displayName) => ({ userId, displayName })
const alice = user('alice', 'Alice')
const bob = user('bob', 'Bob')
const carol = user('carol', 'Carol')
const dave = user('dave', 'Dave')

/**
 * A game of four with Alice, Bob, Carol and Dave on seats 0 to 3.
 *
 * @param {object} [extra] fields to override
 * @return {object}
 */
function seated(extra = {}) {
	return {
		status: 'finished',
		result: '*',
		winner: null,
		creator: alice,
		seats: [alice, bob, carol, dave].map((player, seat) => ({ seat, player, accepted: true, team: null })),
		...extra,
	}
}

/**
 * A finished game of two: Alice White, Bob Black.
 *
 * @param {object} [extra] fields to override
 * @return {object}
 */
function classic(extra = {}) {
	return { status: 'finished', white: alice, black: bob, creator: alice, opponent: bob, ...extra }
}

describe('outcomeText', () => {
	it('reads a game of two from its winner, with the rating change', () => {
		const won = outcomeText(classic({ result: '1-0', winner: 'w', myColor: 'w', ratingChange: { w: 12, b: -12 } }))
		expect(won).toEqual({ text: 'Won', outcome: 'win', delta: '+12' })
		const lost = outcomeText(classic({ result: '1-0', winner: 'w', myColor: 'b', ratingChange: { w: 12, b: -12 } }))
		expect(lost).toEqual({ text: 'Lost', outcome: 'loss', delta: '-12' })
		expect(outcomeText(classic({ result: '1/2-1/2', winner: null, myColor: 'w' })).outcome).toBe('draw')
		expect(outcomeText(classic({ status: 'aborted', myColor: 'w' })).outcome).toBe('aborted')
	})

	it('reads a game of four from the variant result code', () => {
		const result = { variantResult: 'win:0,2/king', resultReason: 'king' }
		expect(outcomeText(seated({ ...result, myColor: '0' }))).toMatchObject({ text: 'Won', outcome: 'win' })
		expect(outcomeText(seated({ ...result, myColor: '2' })).outcome).toBe('win')
		expect(outcomeText(seated({ ...result, myColor: '1' }))).toMatchObject({ text: 'Lost', outcome: 'loss' })
		expect(outcomeText(seated({ ...result, myColor: '3' })).outcome).toBe('loss')
	})

	it('reads a drawn game of four as a draw', () => {
		const draw = seated({ variantResult: 'draw/agreement', resultReason: 'agreement', myColor: '1' })
		expect(outcomeText(draw)).toMatchObject({ text: 'Draw', outcome: 'draw' })
		expect(outcomeText(seated({ status: 'aborted', myColor: '1' })).outcome).toBe('aborted')
	})

	it('parses the winning seats', () => {
		expect(seatedWinners({ variantResult: 'win:1/resignation' })).toEqual([1])
		expect(seatedWinners({ variantResult: 'win:0,2/king' })).toEqual([0, 2])
		expect(seatedWinners({ variantResult: 'draw/agreement' })).toEqual([])
		expect(seatedWinners({ variantResult: null })).toEqual([])
	})
})

describe('endReasonText', () => {
	it('names the players of a game of two', () => {
		expect(endReasonText(classic({ winner: 'w', resultReason: 'resignation' }))).toBe('Bob resigned')
	})

	it('names no colour in a game of four', () => {
		const resigned = endReasonText(seated({ variantResult: 'win:0/resignation', resultReason: 'resignation' }))
		expect(resigned).toBe('A player resigned')
		expect(endReasonText(seated({ resultReason: 'timeout' }))).toBe('A player ran out of time')
		expect(endReasonText(seated({ resultReason: 'agreement' }))).toBe('Draw by agreement')
		expect(endReasonText(seated({ resultReason: 'king' }))).toBe('A king was captured')
		expect(endReasonText(seated({ resultReason: 'something_new' }))).toBe('')
		expect(endReasonText(seated({ status: 'aborted', resultReason: 'aborted' }))).toBe('')
	})
})

describe('playersText', () => {
	it('joins names as a list', () => {
		expect(nameList([])).toBe('')
		expect(nameList(['Alice'])).toBe('Alice')
		expect(nameList(['Alice', 'Bob'])).toBe('Alice and Bob')
		expect(nameList(['Alice', 'Bob', 'Carol'])).toBe('Alice, Bob and Carol')
	})

	it('names every other player of a game of four', () => {
		expect(playersText(seated(), 'alice')).toBe('Bob, Carol and Dave')
		expect(playersText(seated(), 'carol')).toBe('Alice, Bob and Dave')
	})

	it('leaves out open seats', () => {
		const g = seated()
		g.seats[3] = { seat: 3, player: null, accepted: false, team: null }
		expect(playersText(g, 'alice')).toBe('Bob and Carol')
	})

	it('names the opponent of a game of two', () => {
		expect(playersText(classic(), 'alice')).toBe('Bob')
		expect(playersText(classic(), 'bob')).toBe('Alice')
	})
})

describe('toMoveName', () => {
	it('names the seat to move in a game of four', () => {
		expect(toMoveName(seated({ status: 'active', turn: '2' }))).toBe('Carol')
		expect(turnText(seated({ status: 'active', turn: '2', yourTurn: false }))).toBe('Waiting for Carol')
		expect(turnText(seated({ status: 'active', turn: '0', yourTurn: true }))).toBe('Your move')
	})

	it('names the colour to move in a game of two', () => {
		expect(toMoveName(classic({ status: 'active', turn: 'b' }))).toBe('Bob')
		expect(toMoveName(classic({ status: 'active', turn: 'w' }))).toBe('Alice')
	})
})

describe('seatsJoinedText', () => {
	it('counts the seats taken', () => {
		const g = seated({ status: 'open' })
		g.seats[2] = { seat: 2, player: carol, accepted: false, team: null }
		g.seats[3] = { seat: 3, player: null, accepted: false, team: null }
		expect(seatsJoinedText(g)).toBe('Waiting for players (2 of 4)')
	})
})
