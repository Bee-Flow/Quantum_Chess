/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Four-seat variant games through the API against a running Nextcloud (docs/development/online-variants.md, phase
 * 3): bob creates a game of Four-player chess with a player per seat, each invited player answers on their own and
 * the game starts once every seat is taken; the turn passes seat by seat with moves the JavaScript rules choose and
 * settle; a draw needs every seat. A Bughouse game ends with a resignation, which loses for the resigner's team.
 *
 * The tests run in order and share their games.
 */
import { vchainStart } from '../../../src/online/vchain.js'
import {
	applyMove,
	legalMoves,
	loadVariant,
	newGame,
	optionValues,
	settlementOf,
	T,
} from '../../../src/variants/index.js'
import { api, expect, expectApiError, getUser, apiTest as test } from '../helpers/index.mjs'

test.describe.configure({ mode: 'serial' })

const PLAYERS = ['bob', 'carol', 'dave', 'admin']

/**
 * @param {string} who test user
 * @return {string} the user id
 */
function uid(who) {
	return getUser(who).uid
}

let V
let game
let state

test.beforeAll(async () => {
	for (const who of PLAYERS) {
		const lobby = await api(who, 'GET', 'api/games')
		for (const outgoing of lobby.outgoing) {
			await api(who, 'POST', `api/games/${outgoing.id}/cancel`)
		}
	}
	V = await loadVariant('fourplayer')
})

test('a game of four starts when every invited player has taken their seat', async () => {
	await expectApiError(
		api('bob', 'POST', 'api/games', { variant: 'fourplayer', players: [uid('carol'), uid('dave'), uid('admin')] }),
		400,
		'invalid_argument',
		'the creator takes a seat too',
	)
	game = (await api('bob', 'POST', 'api/games', {
		variant: 'fourplayer',
		options: { mode: 'ffa' },
		players: PLAYERS.map(uid),
		color: 'w',
		timeControl: 'corr:3d',
	})).game
	expect([game.status, game.seatCount, game.seats.map((s) => s.accepted)])
		.toEqual(['pending', 4, [true, false, false, false]])
	const invited = (await api('carol', 'GET', 'api/games')).invitations.find((g) => g.id === game.id)
	expect(invited?.invited, 'carol finds the invitation in her lobby').toBe(true)

	await api('carol', 'POST', `api/games/${game.id}/accept`)
	await api('dave', 'POST', `api/games/${game.id}/accept`)
	expect((await api('bob', 'GET', `api/games/${game.id}`)).game.status, 'admin has not answered').toBe('pending')
	const started = (await api('admin', 'POST', `api/games/${game.id}/accept`)).game
	expect([started.status, started.turn, started.myColor]).toEqual(['active', '0', '3'])
	game = (await api('bob', 'GET', `api/games/${game.id}`)).game
	expect(game.chain).toBe(vchainStart(game.id, 'fourplayer', { mode: 'ffa' }, PLAYERS.map(uid), game.createdAt))
	state = newGame(V, optionValues(V, game.variantOptions))
})

test('the turn passes seat by seat', async () => {
	for (const [seat, who] of PLAYERS.entries()) {
		expect(state.turn, `seat ${seat} is to move`).toBe(seat)
		const code = legalMoves(V, state)[0].code
		const ply = state.ply
		const res = await api(who, 'POST', `api/games/${game.id}/v/moves`, { code, ply })
		state = applyMove(V, state, code, res.move.u / T).state
		const live = (await api(who, 'POST', `api/games/${game.id}/v/moves/${ply}/settle`, settlementOf(state))).game
		expect(live.turn, `after ${who}'s move`).toBe(String(state.turn))
	}
	await expectApiError(
		api('carol', 'POST', `api/games/${game.id}/abort`),
		409,
		'abort_not_allowed',
		'every seat has played: no abort any more',
	)
})

test('a draw needs every seat', async () => {
	await api('bob', 'POST', `api/games/${game.id}/draw`, { action: 'offer' })
	await api('carol', 'POST', `api/games/${game.id}/draw`, { action: 'accept' })
	let live = (await api('dave', 'POST', `api/games/${game.id}/draw`, { action: 'accept' })).game
	expect([live.status, live.drawVotes]).toEqual(['active', [0, 1, 2]])
	live = (await api('admin', 'POST', `api/games/${game.id}/draw`, { action: 'accept' })).game
	expect([live.status, live.resultReason, live.variantResult]).toEqual(['finished', 'agreement', 'draw/agreement'])
})

test('a resignation in Bughouse loses for the team', async () => {
	let bughouse = (await api('bob', 'POST', 'api/games', {
		variant: 'bughouse',
		players: PLAYERS.map(uid),
		color: 'w',
	})).game
	for (const who of ['carol', 'dave', 'admin']) {
		bughouse = (await api(who, 'POST', `api/games/${bughouse.id}/accept`)).game
	}
	expect(bughouse.seats.map((s) => s.team)).toEqual([0, 1, 0, 1])
	const ended = (await api('carol', 'POST', `api/games/${bughouse.id}/resign`)).game
	expect([ended.status, ended.result, ended.variantResult]).toEqual(['finished', '*', 'win:0,2/resign'])
})
