/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The online API of the chess variants against a running Nextcloud (docs/development/online-variants.md): carol
 * invites bob to a game of Atomic, bob accepts; the server draws the roll of each move after it arrives, the browser
 * settles it with the JavaScript variant rules and the turn passes; polling returns the moves; the classic move route
 * refuses the game; the variant chain replays; bob gets a "Your move in Atomic" notification; and a settlement that
 * does not agree annuls the game, which counts nowhere in the ratings.
 *
 * The tests run in order and share one game.
 */
import { vchainNext, vchainStart } from '../../../src/online/vchain.js'
import {
	applyMove,
	loadVariant,
	newGame,
	ONLINE_RULES_VERSION,
	optionValues,
	settlementOf,
	T,
} from '../../../src/variants/index.js'
import { api, authHeaders, env, expect, expectApiError, getUser, apiTest as test } from '../helpers/index.mjs'

test.describe.configure({ mode: 'serial' })

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
const sent = []

/**
 * Send a move as `who`, play it with the roll the server drew, and settle it.
 *
 * @param {string} who test user
 * @param {string} code move code
 * @return {Promise<object>} the stored move
 */
async function play(who, code) {
	const ply = state.ply
	const res = await api(who, 'POST', `api/games/${game.id}/v/moves`, {
		code,
		ply,
		clientId: 'qc-v-' + Math.random().toString(36).slice(2, 12),
	})
	const stored = res.move.ply === ply && Number.isInteger(res.move.u) && res.move.nextSeat === null
	expect(stored, `${code}: stored with a roll and not settled yet`).toBe(true)
	const played = applyMove(V, state, code, res.move.u / T)
	expect(played, `${code} is legal`).toBeTruthy()
	state = played.state
	const settled = await api(who, 'POST', `api/games/${game.id}/v/moves/${ply}/settle`, settlementOf(state))
	sent.push(res.move)
	return settled.game
}

test.beforeAll(async () => {
	for (const who of ['admin', 'bob', 'carol']) {
		const lobby = await api(who, 'GET', 'api/games')
		for (const outgoing of lobby.outgoing) {
			await api(who, 'POST', `api/games/${outgoing.id}/cancel`)
		}
	}
	V = await loadVariant('atomic')
})

test('an invitation to a variant game starts it with seats and its own chain', async () => {
	await expectApiError(
		api('carol', 'POST', 'api/games', { opponent: uid('bob'), variant: 'kriegspiel' }),
		400,
		'invalid_argument',
		'Kriegspiel cannot be played online (hidden information)',
	)
	await expectApiError(
		api('carol', 'POST', 'api/games', { opponent: uid('bob'), variant: 'atomic', options: [1, 2] }),
		400,
		'invalid_argument',
		'options must be an object',
	)
	game = (await api('carol', 'POST', 'api/games', {
		opponent: uid('bob'),
		variant: 'atomic',
		options: {},
		color: 'w',
		rated: true,
		timeControl: 'corr:3d',
	})).game
	expect(
		[game.status, game.variant, game.variantRules, game.ratedRequested],
		'a pending, unrated Atomic invitation',
	).toEqual(['pending', 'atomic', ONLINE_RULES_VERSION, false])
	const accepted = (await api('bob', 'POST', `api/games/${game.id}/accept`)).game
	expect([accepted.status, accepted.white.userId, accepted.seatToMove]).toEqual(['active', uid('carol'), 0])
	game = (await api('carol', 'GET', `api/games/${game.id}`)).game
	const start = vchainStart(game.id, 'atomic', {}, [uid('carol'), uid('bob')], game.createdAt)
	expect(game.chain, 'chain_0 of the variant chain').toBe(start)
	expect([game.state, game.preview, game.moves]).toEqual([null, [], []])
	state = newGame(V, optionValues(V, game.variantOptions))
})

test('moves are rolled by the server and settled by the browser', async () => {
	await expectApiError(
		api('bob', 'POST', `api/games/${game.id}/v/moves`, { code: 'e7-e5', ply: 0 }),
		403,
		'not_your_turn',
	)
	await expectApiError(
		api('carol', 'POST', `api/games/${game.id}/moves`, { code: 'e2-e4', ply: 0 }),
		409,
		'invalid_status',
		'the classic move route refuses a variant game',
	)
	let live = await play('carol', 'e2-e4')
	expect([live.turn, live.seatToMove, live.pendingPly], 'the turn passed to bob').toEqual(['b', 1, null])
	live = await play('bob', 'e7-e5')
	expect(live.turn).toBe('w')
	live = await play('carol', 'g1-f3')
	expect([live.turn, live.ply]).toEqual(['b', 3])

	const poll = await api('bob', 'GET', `api/games/${game.id}/poll?rev=0&ply=2`)
	expect(poll.moves.map((m) => m.code), 'a poll returns the moves from the asked ply').toEqual(['g1-f3'])
	const full = (await api('bob', 'GET', `api/games/${game.id}`)).game
	expect(full.moves.map((m) => [m.ply, m.seat, m.code, m.nextSeat])).toEqual([
		[0, 0, 'e2-e4', 1],
		[1, 1, 'e7-e5', 0],
		[2, 0, 'g1-f3', 1],
	])
	let chain = vchainStart(game.id, 'atomic', {}, [uid('carol'), uid('bob')], game.createdAt)
	for (const m of full.moves) {
		chain = vchainNext(chain, m.ply, m.seat, m.code, m.u)
		expect(m.chain, `chain after ply ${m.ply}`).toBe(chain)
		expect(m.stateHash).toMatch(/^[0-9a-f]{16}$/)
	}
	expect(full.chain).toBe(chain)
})

test('bob is told that it is his move in Atomic', async () => {
	const response = await fetch(`${env.baseURL}/ocs/v2.php/apps/notifications/api/v2/notifications?format=json`, {
		headers: authHeaders('bob'),
	})
	const list = ((await response.json()).ocs?.data ?? [])
		.filter((n) => n.app === 'quantumchess' && n.object_id === String(game.id))
	expect(list.some((n) => n.subject.includes('Your move in Atomic')), 'the turn notification names Atomic').toBe(true)
})

test('a settlement that does not agree annuls the game', async () => {
	const ply = state.ply
	const res = await api('bob', 'POST', `api/games/${game.id}/v/moves`, { code: 'b8-c6', ply })
	const played = applyMove(V, state, 'b8-c6', res.move.u / T)
	const honest = settlementOf(played.state)
	await api('bob', 'POST', `api/games/${game.id}/v/moves/${ply}/settle`, honest)
	const again = (await api('carol', 'POST', `api/games/${game.id}/v/moves/${ply}/settle`, honest)).game
	expect(again.status, 'the same settlement again changes nothing').toBe('active')
	const forged = (await api('carol', 'POST', `api/games/${game.id}/v/moves/${ply}/settle`, {
		...honest,
		stateHash: '0000000000000000',
	})).game
	expect([forged.status, forged.resultReason, forged.result]).toEqual(['aborted', 'disputed', null])
})
