/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The server-ruled variants against a running Nextcloud (docs/development/online-variants.md, section 6): carol
 * invites bob to Kriegspiel. The server keeps the real position and sends each player only their own view, the same
 * view as the JavaScript rules give; the umpire's "no" uses no turn; the moves stay hidden until the game ends, the
 * browsers settle and dispute nothing; and after a resignation the real position and every move are revealed, and
 * the chain replays. Fog of war previews the odds of a move.
 *
 * The tests run in order and share one game.
 */
import { vchainNext, vchainStart } from '../../../src/online/vchain.js'
import {
	applyMove,
	loadVariant,
	newGame,
	positionHash,
	refereePreview,
	settlementOf,
	viewFor,
} from '../../../src/variants/index.js'
import { api, expect, expectApiError, getUser, apiTest as test } from '../helpers/index.mjs'

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

/**
 * Play a certain move (no roll) as `who` and follow it in the JavaScript rules.
 *
 * @param {string} who test user
 * @param {string} code move code
 * @return {Promise<object>} the answer
 */
async function play(who, code) {
	const res = await api(who, 'POST', `api/games/${game.id}/v/moves`, { code, ply: state.ply })
	expect(res.refused, `${code} is accepted`).toBe(false)
	expect(res.move, 'the move comes back without its code and roll').toEqual({ ply: state.ply, seat: state.turn })
	state = applyMove(V, state, code, 0).state
	return res
}

test.beforeAll(async () => {
	for (const who of ['bob', 'carol', 'dave']) {
		const lobby = await api(who, 'GET', 'api/games')
		for (const outgoing of lobby.outgoing) {
			await api(who, 'POST', `api/games/${outgoing.id}/cancel`)
		}
	}
	V = await loadVariant('kriegspiel')
	state = newGame(V, {})
})

test('a Kriegspiel game starts with a view for each player', async () => {
	game = (await api('carol', 'POST', 'api/games', {
		opponent: uid('bob'),
		variant: 'kriegspiel',
		color: 'w',
		timeControl: 'corr:3d',
	})).game
	await api('bob', 'POST', `api/games/${game.id}/accept`)
	const white = (await api('carol', 'GET', `api/games/${game.id}`)).game
	const black = (await api('bob', 'GET', `api/games/${game.id}`)).game
	expect([white.status, white.myColor, black.myColor]).toEqual(['active', 'w', 'b'])
	expect(positionHash(white.view), 'white sees only the white pieces').toBe(positionHash(viewFor(V, state, 0)))
	expect(positionHash(black.view), 'black sees only the black pieces').toBe(positionHash(viewFor(V, state, 1)))
	expect(white.view.visible).toEqual(viewFor(V, state, 0).visible)
	expect(white.view.worlds[0].b.sq.filter((sq, id) => sq >= 0 && white.view.worlds[0].b.sd[id] === 1)).toEqual([])
	expect([white.moves, white.state, white.preview]).toEqual([[], null, []])
})

test('the umpire refuses an impossible try without using the turn', async () => {
	const res = await api('carol', 'POST', `api/games/${game.id}/v/moves`, { code: 'e2-e5', ply: 0 })
	expect([res.refused, res.move, res.game.ply, res.game.turn]).toEqual([true, null, 0, 'w'])
})

test('accepted moves pass the turn and update both views; the moves stay hidden', async () => {
	const first = await play('carol', 'e2-e4')
	expect([first.game.ply, first.game.turn]).toEqual([1, 'b'])
	expect(positionHash(first.game.view)).toBe(positionHash(viewFor(V, state, 0)))
	await play('bob', 'e7-e5')
	await play('carol', 'g1-f3')
	const black = (await api('bob', 'GET', `api/games/${game.id}`)).game
	expect(positionHash(black.view)).toBe(positionHash(viewFor(V, state, 1)))
	const last = black.view.history.at(-1)
	expect([last.code, last.side], 'white\'s move is hidden from black').toEqual(['', 0])
	expect(last.info.announce).toEqual(state.history.at(-1).info.announce)
	expect(black.moves, 'no move list while the game runs').toEqual([])
	const poll = await api('bob', 'GET', `api/games/${game.id}/poll?rev=0&ply=0&chat=0`)
	expect(poll.moves).toEqual([])
	expect(settlementOf(state).nextSeat).toBe(1)
})

test('the browsers settle and dispute nothing in a game the server rules', async () => {
	await expectApiError(
		api('bob', 'POST', `api/games/${game.id}/v/moves/0/settle`, settlementOf(state)),
		409,
		'invalid_status',
		'the server settles its own moves',
	)
	await expectApiError(
		api('bob', 'POST', `api/games/${game.id}/v/dispute`, { ply: 0 }),
		409,
		'invalid_status',
		'a server-ruled game cannot be disputed',
	)
})

test('a resignation reveals the real position and every move', async () => {
	const done = (await api('bob', 'POST', `api/games/${game.id}/resign`)).game
	expect([done.status, done.result]).toEqual(['finished', '1-0'])
	const full = (await api('bob', 'GET', `api/games/${game.id}`)).game
	expect(full.view.visible).toBeNull()
	expect(positionHash(full.view)).toBe(positionHash(state))
	expect(full.moves.map((m) => m.code)).toEqual(['e2-e4', 'e7-e5', 'g1-f3'])
	let chain = vchainStart(game.id, 'kriegspiel', {}, [uid('carol'), uid('bob')], full.createdAt)
	for (const m of full.moves) {
		chain = vchainNext(chain, m.ply, m.seat, m.code, m.u)
		expect(m.stateHash, 'the server settled every move').toMatch(/^[0-9a-f]{16}$/)
	}
	expect(chain).toBe(full.chain)
})

test('Fog of war previews the odds of a move to the player to move', async () => {
	const fog = await loadVariant('darkchess')
	const start = newGame(fog, {})
	let g = (await api('dave', 'POST', 'api/games', {
		opponent: uid('bob'),
		variant: 'darkchess',
		color: 'w',
		timeControl: 'corr:3d',
	})).game
	await api('bob', 'POST', `api/games/${g.id}/accept`)
	g = (await api('dave', 'GET', `api/games/${g.id}`)).game
	expect(g.view.legal).toEqual(viewFor(fog, start, 0).legal)
	const ok = await api('dave', 'POST', `api/games/${g.id}/v/preview`, { code: 'g1-f3|h3' })
	expect(ok).toEqual({ refused: false, outcomes: refereePreview(fog, start, 'g1-f3|h3') })
	const no = await api('dave', 'POST', `api/games/${g.id}/v/preview`, { code: 'e2-e5' })
	expect(no).toEqual({ refused: true, outcomes: [] })
	await expectApiError(
		api('bob', 'POST', `api/games/${g.id}/v/preview`, { code: 'e7-e5' }),
		403,
		'not_your_turn',
		'only the player to move gets the odds',
	)
	await api('dave', 'POST', `api/games/${g.id}/abort`)
})
