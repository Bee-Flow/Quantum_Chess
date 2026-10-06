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
	const rated = (await api('carol', 'POST', 'api/games', {
		opponent: uid('bob'),
		variant: 'kriegspiel',
		timeControl: 'corr:3d',
	})).game
	expect(rated.ratedRequested, 'a game the server rules is rated unless asked otherwise').toBe(true)
	await api('carol', 'POST', `api/games/${rated.id}/cancel`)
	game = (await api('carol', 'POST', 'api/games', {
		opponent: uid('bob'),
		variant: 'kriegspiel',
		color: 'w',
		rated: false,
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
		rated: false,
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

test('a rated Kriegspiel game counts in the Kriegspiel ratings only', async () => {
	let g = (await api('dave', 'POST', 'api/games', {
		opponent: uid('carol'),
		variant: 'kriegspiel',
		rated: true,
		timeControl: 'corr:3d',
	})).game
	g = (await api('carol', 'POST', `api/games/${g.id}/accept`)).game
	expect(g.rated, 'started as a rated game').toBe(true)
	const white = g.white.userId === uid('dave') ? 'dave' : 'carol'
	const black = white === 'dave' ? 'carol' : 'dave'
	await api(white, 'POST', `api/games/${g.id}/v/moves`, { code: 'e2-e4', ply: 0 })
	await api(black, 'POST', `api/games/${g.id}/v/moves`, { code: 'e7-e5', ply: 1 })
	const classic = (await api(black, 'GET', 'api/stats')).online.ratedGames
	const done = (await api(black, 'POST', `api/games/${g.id}/resign`)).game
	expect([done.status, done.rated, done.ratingChange?.w > 0]).toEqual(['finished', true, true])
	const stats = await api(black, 'GET', 'api/stats')
	expect(stats.online.ratedGames, 'the classic rating stays as it is').toBe(classic)
	const kriegspiel = stats.variants.find((v) => v.variant === 'kriegspiel')
	expect(kriegspiel?.ratedGames ?? 0, 'the Kriegspiel rating counts the game').toBeGreaterThanOrEqual(1)
	const board = await api(black, 'GET', 'api/leaderboard?variant=kriegspiel')
	expect(board.variant).toBe('kriegspiel')
})

test('Bee Flow Chess hides the shuffled back ranks until the end', async () => {
	const bee = await loadVariant('beeflow')
	let g = (await api('dave', 'POST', 'api/games', {
		opponent: uid('carol'),
		variant: 'beeflow',
		color: 'w',
		rated: false,
		timeControl: 'corr:3d',
	})).game
	expect([g.ratedRequested, g.variantOptions]).toEqual([false, {}])
	await api('carol', 'POST', `api/games/${g.id}/accept`)
	g = (await api('dave', 'GET', `api/games/${g.id}`)).game
	const view = g.view
	const b = view.worlds[0].b
	const enemy = b.ty.filter((ty, id) => b.sd[id] === 1)
	expect(view.options, 'the shuffles stay on the server').toEqual({})
	expect(enemy.filter((ty) => ty === 'x'), 'the enemy back rank is hidden').toHaveLength(8)
	expect(enemy.filter((ty) => ty === 'p')).toHaveLength(8)
	expect(b.ty.filter((ty, id) => b.sd[id] === 0 && ty === 'k'), 'the own Queen Bee is known').toHaveLength(1)
	expect(view.legal.length, 'the legal moves of the real position').toBeGreaterThan(0)
	expect(view.visible).toHaveLength(64)
	expect(g.moves).toEqual([])

	const moved = await api('dave', 'POST', `api/games/${g.id}/v/moves`, { code: 'a2-a4', ply: 0 })
	expect([moved.refused, moved.game.turn]).toEqual([false, 'b'])
	await api('carol', 'POST', `api/games/${g.id}/v/moves`, { code: 'a7-a5', ply: 1 })
	const done = (await api('carol', 'POST', `api/games/${g.id}/resign`)).game
	expect(done.status).toBe('finished')
	const full = (await api('carol', 'GET', `api/games/${g.id}`)).game
	expect(full.view.visible).toBeNull()
	const { white, black } = full.view.options
	expect([Number.isInteger(white), Number.isInteger(black)]).toEqual([true, true])
	const start = newGame(bee, { white, black })
	const replayed = applyMove(bee, applyMove(bee, start, 'a2-a4', 0).state, 'a7-a5', 0).state
	expect(positionHash(replayed), 'the revealed shuffles replay to the real position').toBe(positionHash(full.view))
})
