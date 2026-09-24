/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The online game API against a running Nextcloud: admin invites bob, bob accepts through the OCS action of his
 * notification, both play (a split and a rolled capture), an idempotent retry and a stale ply, polling, chat, a draw
 * offer declined through the notification action and its cool-down, resignation with Elo, a rematch through the OCS
 * action, the notifications and the dashboard widget, an open challenge joined concurrently, and the stored hash chain
 * replayed with the JavaScript rules engine.
 *
 * The tests run in order and share one game.
 */
import { applyMove, chainNext, chainStart, findMove, initialState, positionHash, serializeState } from '../../../src/engine/index.js'
import { api, authHeaders, env, expect, expectApiError, getUser, ocs, apiTest as test } from '../helpers/index.mjs'

test.describe.configure({ mode: 'serial' })

/**
 * @param {string} who test user
 * @return {string} the user id
 */
function uid(who) {
	return getUser(who).uid
}

/**
 * @param {string} who test user
 * @return {Promise<any[]>} the user's notifications of this app
 */
async function notifications(who) {
	const response = await fetch(`${env.baseURL}/ocs/v2.php/apps/notifications/api/v2/notifications?format=json`, {
		headers: authHeaders(who),
	})
	const json = await response.json()
	return (json.ocs?.data ?? []).filter((n) => n.app === 'quantumchess')
}

/**
 * The notification of a game whose rich subject contains `text`.
 *
 * @param {string} who test user
 * @param {number} gameId game id
 * @param {string} text part of the rich subject
 * @return {Promise<any|undefined>}
 */
async function findNotification(who, gameId, text) {
	return (await notifications(who)).find((n) => n.object_id === String(gameId) && n.subjectRich.includes(text))
}

/**
 * Run a notification action as `who` and return its `ocs.data`.
 *
 * @param {string} who test user
 * @param {{link: string, type: string}} action notification action
 * @return {Promise<any>}
 */
async function runAction(who, action) {
	const response = await fetch(action.link + '?format=json', { method: action.type, headers: authHeaders(who) })
	const json = await response.json()
	expect(response.ok, `action ${action.link} → ${response.status} ${JSON.stringify(json)}`).toBe(true)
	return json.ocs.data
}

/**
 * @param {string} who test user
 * @return {Promise<any>} the items of the app's dashboard widget
 */
async function dashboard(who) {
	const response = await fetch(`${env.baseURL}/ocs/v2.php/apps/dashboard/api/v2/widget-items?widgets[]=quantumchess&format=json`, {
		headers: authHeaders(who),
	})
	return (await response.json()).ocs.data.quantumchess
}

/**
 * Make a move as `who`.
 *
 * @param {string} who test user
 * @param {{id: number, ply: number}} game the game before the move
 * @param {string} code move code
 * @param {string} [clientId] the idempotency key (a fresh one by default)
 * @return {Promise<any>} the move response
 */
async function play(who, game, code, clientId = 'qc-' + Math.random().toString(36).slice(2, 12)) {
	return api(who, 'POST', `api/games/${game.id}/moves`, { code, ply: game.ply, clientId, thinkMs: 1200 })
}

let game
let white
let black
let roll
let gameOver

test.beforeAll(async () => {
	// leftover invitations of earlier runs between the test users
	for (const who of ['admin', 'bob', 'carol']) {
		const lobby = await api(who, 'GET', 'api/games')
		for (const outgoing of lobby.outgoing) {
			await api(who, 'POST', `api/games/${outgoing.id}/cancel`)
		}
	}
})

test('an invitation is accepted through the notification action', async () => {
	const upper = (await api('admin', 'POST', 'api/games', { opponent: uid('bob').toUpperCase(), rated: false })).game
	expect(upper.opponent.userId, 'an invitation typed in another letter case stores the canonical user id').toBe(uid('bob'))
	expect((await api('bob', 'GET', 'api/games')).invitations.some((g) => g.id === upper.id), 'bob sees that invitation').toBe(true)
	await api('admin', 'POST', `api/games/${upper.id}/cancel`)

	game = (await api('admin', 'POST', 'api/games', { opponent: uid('bob'), rated: true, timeControl: 'corr:3d', message: 'Fancy a quantum game?' })).game
	expect(game.status === 'pending' && game.ratedRequested && game.colorChoice === 'r', 'admin invites bob (rated, corr:3d, pending)').toBe(true)
	await expectApiError(api('admin', 'POST', 'api/games', { opponent: uid('bob') }), 429, 'too_many_invitations')
	await expectApiError(api('admin', 'POST', 'api/games', { opponent: 'no-such-user-42' }), 404, 'user_not_found')
	await expectApiError(api('admin', 'POST', 'api/games', { opponent: uid('bob'), rated: true, timeControl: 'corr:none' }), 400, 'rated_needs_deadline')

	const invite = await findNotification('bob', game.id, 'invited you')
	expect(invite?.subjectRichParameters.user.id, 'bob has the invite notification with {user}').toBe(uid('admin'))
	expect(invite.message.includes('3 days per move') && invite.message.includes('Fancy a quantum game?'), 'invite message: time control and text').toBe(true)
	const acceptAction = invite.actions.find((a) => a.primary)
	expect(acceptAction && acceptAction.type === 'POST' && acceptAction.link.includes(`/ocs/v2.php/apps/quantumchess/api/v1/games/${game.id}/accept`), 'Accept action points to the OCS route').toBe(true)
	const accepted = await runAction('bob', acceptAction)
	expect(accepted.game.status, 'POST Accept action starts the game').toBe('active')
	expect(await findNotification('bob', game.id, 'invited you'), 'invite notification is gone after accepting').toBeUndefined()
	expect(await findNotification('admin', game.id, 'accepted your invitation'), 'admin is told that bob accepted').toBeTruthy()

	game = (await api('admin', 'GET', `api/games/${game.id}`)).game
	expect(game.rated && game.white && game.black && game.chain?.length === 64 && game.deadlineAt > game.now, 'colours, chain_0, deadline and rated flag set').toBeTruthy()
	expect(game.chain, 'chain_0 equals the JS engine chainStart').toBe(chainStart(game.id, game.white.userId, game.black.userId, game.createdAt))
	white = game.white.userId === uid('admin') ? 'admin' : 'bob'
	black = white === 'admin' ? 'bob' : 'admin'
	const probe = await expectApiError(api('carol', 'POST', `api/games/${game.id}/join`), 404, 'not_found')
	const missing = await expectApiError(api('carol', 'POST', 'api/games/999999999/join'), 404, 'not_found')
	expect(JSON.stringify(probe), 'joining someone else\'s active game answers like a missing game (no probing)').toBe(JSON.stringify(missing))
})

test('moves: a split, a rolled capture and an idempotent retry', async () => {
	await expectApiError(play(black, game, 'e7-e5'), 403, 'not_your_turn')
	let r = await play(white, game, 'g1-f3|h3')
	expect(r.move.code === 'g1-f3|h3' && r.measurement === null && r.game.ply === 1, 'white splits the knight g1 → f3|h3').toBe(true)
	expect((await findNotification(black, game.id, 'Your move against'))?.message, 'black gets your_turn: "They split their knight…"').toContain('split their knight')
	const items = await dashboard(black)
	expect(items.items.some((i) => i.link.endsWith(`#/game/${game.id}`) && i.title.startsWith('Your move against') && i.subtitle.startsWith('Move 1') && i.overlayIconUrl.includes('overlay-king-b')), 'dashboard widget lists the your-move game for black').toBe(true)
	expect(items.emptyContentMessage, 'dashboard widget has the empty text').toBe('No games waiting for your move')
	game = r.game

	r = await play(black, game, 'e7-e5')
	expect(r.measurement === null && r.game.ply === 2, 'black plays e7-e5').toBe(true)
	game = r.game
	await expectApiError(api(white, 'POST', `api/games/${game.id}/moves`, { code: 'f3-e5', ply: 1, clientId: 'stale-ply-1' }), 409, 'conflict')
	await expectApiError(play(white, game, 'e1-e3'), 400, 'illegal_move')
	const legal = findMove(JSON.parse(serializeState(game.state)), 'f3-e5')
	expect(legal?.resolution, 'f3xe5 is a rolled capture for the JS engine').toBe('rolled')

	const clientId = 'roll-' + Date.now()
	r = await play(white, game, 'f3-e5', clientId)
	expect(Number.isInteger(r.measurement?.u) && ['capture', 'miss'].includes(r.measurement.key) && r.replayed === false, `rolled capture stored with integer u (${r.measurement?.key}, u=${r.measurement?.u})`).toBe(true)
	const retry = await play(white, game, 'f3-e5', clientId)
	expect(retry.replayed === true && retry.measurement.u === r.measurement.u && retry.move.chain === r.move.chain, 'retry with the same clientId is replayed and never rolls again').toBe(true)
	roll = r
	game = r.game
	const yourTurn = await findNotification(black, game.id, 'Your move against')
	const inWords = r.measurement.key === 'capture' ? /captured your pawn on e5 \(50\u00a0% chance\)/ : /missed/
	expect(yourTurn?.message, 'your_turn replaced with the roll in words').toMatch(inWords)
	expect((await notifications(black)).filter((n) => n.object_id === String(game.id) && n.subjectRich.includes('Your move')), 'one your_turn notification per game').toHaveLength(1)
})

test('polling returns only what changed', async () => {
	let poll = await api(black, 'GET', `api/games/${game.id}/poll?rev=${game.rev}&ply=${game.ply}&chat=0`)
	expect(poll.changed === false && poll.rev === game.rev, 'poll with the current rev: unchanged').toBe(true)
	poll = await api(black, 'GET', `api/games/${game.id}/poll?rev=${game.rev - 1}&ply=2&chat=0`)
	expect(poll.changed === true && poll.moves.length === 1 && poll.moves[0].ply === 2 && poll.game.rev === game.rev, 'poll with an old rev returns the new move').toBe(true)
	await expectApiError(api('carol', 'GET', `api/games/${game.id}`), 404, 'not_found')
})

test('chat: text, quick phrases and mute', async () => {
	let chat = await api(white, 'POST', `api/games/${game.id}/chat`, { message: '  Nice   roll!\u0007 ' })
	expect(chat.message.kind === 'text' && chat.message.message === 'Nice   roll!' && chat.rev === game.rev + 1, 'text message trimmed and control characters removed').toBe(true)
	expect((await findNotification(black, game.id, 'sent a message'))?.message, 'chat notification with excerpt').toBe('Nice roll!')
	chat = await api(black, 'POST', `api/games/${game.id}/chat`, { phrase: 'good_luck' })
	expect(chat.message.kind === 'phrase' && chat.message.message === 'good_luck', 'quick phrase stored as key').toBe(true)
	await expectApiError(api(black, 'POST', `api/games/${game.id}/chat`, { message: 'x'.repeat(501) }), 400, 'invalid_argument')
	expect((await api(black, 'PUT', `api/games/${game.id}/mute`, { muted: true })).muted, 'black mutes the chat').toBe(true)
	await api(white, 'POST', `api/games/${game.id}/chat`, { message: 'muted?' })
	expect((await findNotification(black, game.id, 'sent a message'))?.message, 'no chat notification while muted').not.toBe('muted?')
	await api(black, 'PUT', `api/games/${game.id}/mute`, { muted: false })
})

test('a draw offer is declined through the notification action, with a cool-down', async () => {
	game = (await api(black, 'GET', `api/games/${game.id}`)).game
	expect(await findNotification(black, game.id, 'Your move against'), 'opening the game clears your_turn').toBeUndefined()
	game = (await api(white, 'POST', `api/games/${game.id}/draw`, { action: 'offer' })).game
	expect(game.drawOffer?.by === 'w' && game.myColor === 'w', 'white offers a draw').toBe(true)
	const drawNote = await findNotification(black, game.id, 'offers a draw')
	expect(drawNote && drawNote.message === 'Move 2' && drawNote.actions.length === 2, 'black has the draw_offer notification with Accept/Decline').toBe(true)
	const declined = await runAction(black, drawNote.actions.find((a) => !a.primary))
	expect(declined.game.status, 'Decline action declines the draw').toBe('active')
	game = (await api(white, 'GET', `api/games/${game.id}`)).game
	expect(game.drawOffer === null && game.canOfferDraw === false && game.drawAvailableAtPly === game.ply + 6, 'cool-down: next offer after 3 own moves').toBe(true)
	const cooldown = await expectApiError(api(white, 'POST', `api/games/${game.id}/draw`, { action: 'offer' }), 409, 'draw_not_allowed')
	expect(cooldown.availableAtPly, 'draw_not_allowed carries availableAtPly').toBe(game.ply + 6)
	expect(game.chat.map((c) => c.message).join(','), 'system lines draw_offered and draw_declined').toContain('draw_offered,draw_declined')
	await expectApiError(api(black, 'POST', `api/games/${game.id}/draw`, { action: 'accept' }), 409, 'no_draw_offer')
})

test('resignation ends the game and updates both ratings', async () => {
	const before = { [white]: (await api(white, 'GET', 'api/stats')).online, [black]: (await api(black, 'GET', 'api/stats')).online }
	const next = roll.measurement.key === 'capture' ? 'd7-d6' : 'b8-c6'
	const r = await play(black, game, next)
	expect(r.game.ply, `black plays ${next}`).toBe(4)
	game = (await api(white, 'POST', `api/games/${game.id}/resign`)).game
	expect(game.status === 'finished' && game.resultReason === 'resignation' && game.winner === (game.myColor === 'w' ? 'b' : 'w'), 'white resigns: black wins').toBe(true)
	expect(game.ratingChange && game.ratingChange.w + game.ratingChange.b === 0, `rating change ${JSON.stringify(game.ratingChange)}`).toBe(true)
	const after = { [white]: (await api(white, 'GET', 'api/stats')).online, [black]: (await api(black, 'GET', 'api/stats')).online }
	const kw = before[white].ratedGames < 10 ? 40 : 20
	expect(after[black].rating > before[black].rating && after[white].rating < before[white].rating && after[black].ratedGames === before[black].ratedGames + 1, 'both rating rows updated').toBe(true)
	if (before[white].rating === before[black].rating && before[white].ratedGames < 10 && before[black].ratedGames < 10) {
		expect(after[black].rating - before[black].rating, 'K = 40 for provisional players (+20 at equal ratings)').toBe(kw / 2)
	}
	gameOver = await findNotification(black, game.id, 'You won against')
	expect(gameOver && gameOver.message.startsWith('Resignation') && gameOver.message.includes('Rating'), `winner's game_over: "${gameOver?.message}"`).toBe(true)
	expect(await findNotification(white, game.id, 'You lost'), 'the resigning player is not notified').toBeUndefined()
	await expectApiError(play(black, game, 'a7-a6'), 409, 'game_over')
})

test('the stored hash chain replays with the JavaScript rules engine', async () => {
	const full = (await api(black, 'GET', `api/games/${game.id}`)).game
	let state = initialState()
	let chain = chainStart(full.id, full.white.userId, full.black.userId, full.createdAt)
	for (const move of full.moves) {
		const applied = applyMove(state, move.code, move.measurement ? { u: move.measurement.u } : {})
		expect(JSON.stringify(applied.measurement), `ply ${move.ply}: measurement record replays identically`).toBe(JSON.stringify(move.measurement))
		chain = chainNext(chain, move.ply, move.code, move.measurement?.u ?? null, move.measurement?.key ?? null, applied.state)
		expect(chain === move.chain && positionHash(applied.state) === move.stateHash, `ply ${move.ply}: chain and state hash match the JS engine`).toBe(true)
		state = applied.state
	}
	expect(chain === full.chain && serializeState(state) === serializeState(full.state), 'head of the chain and final state match').toBe(true)
})

test('a rematch through the notification action swaps the colours', async () => {
	const rematchAction = gameOver.actions.find((a) => a.link.endsWith('/rematch'))
	expect(rematchAction, 'game_over has a Rematch action').toBeTruthy()
	const rematch = (await runAction(black, rematchAction)).game
	expect(rematch.status === 'pending' && rematch.rematchOf === game.id && rematch.colorChoice === (game.myColor === 'w' ? 'w' : 'b'), 'OCS rematch creates the swapped-colour invitation').toBe(true)
	expect((await runAction(black, rematchAction)).game.id, 'repeated rematch is idempotent').toBe(rematch.id)
	expect(await findNotification(white, rematch.id, 'wants a rematch'), 'opponent gets the rematch notification').toBeTruthy()
	expect((await dashboard(white)).items[0]?.title, 'dashboard lists the rematch offer first').toMatch(/wants a rematch$/)
	const started = (await api(white, 'POST', `api/games/${game.id}/rematch`)).game
	expect(started.id === rematch.id && started.status === 'active' && started.white.userId === uid(black), 'the other player\'s rematch accepts it with swapped colours').toBe(true)
	const aborted = await api(started.black.userId === uid('admin') ? 'admin' : 'bob', 'POST', `api/games/${started.id}/abort`)
	expect(aborted.game.status, 'abort before both sides moved').toBe('aborted')
})

test('an invitation accepted on the web, and the abort window', async () => {
	let g2 = (await api('bob', 'POST', 'api/games', { opponent: uid('admin'), rated: false, color: 'w', timeControl: 'corr:none' })).game
	expect(g2.colorChoice === 'w' && !g2.ratedRequested, 'casual invitation with a fixed colour').toBe(true)
	g2 = (await api('admin', 'POST', `api/games/${g2.id}/accept`)).game
	expect(g2.status === 'active' && g2.white.userId === uid('bob') && g2.deadlineAt === null && !g2.rated, 'web accept: bob is White, no deadline').toBe(true)
	g2 = (await play('bob', g2, 'e2-e4')).game
	g2 = (await play('admin', g2, 'e7-e5')).game
	await expectApiError(api('bob', 'POST', `api/games/${g2.id}/abort`), 409, 'abort_not_allowed')
	expect((await api('bob', 'POST', `api/games/${g2.id}/draw`, { action: 'offer' })).game.drawOffer.by, 'draw offer by white').toBe('w')
	expect((await ocs('admin', 'POST', `api/v1/games/${g2.id}/draw-accept`)).game.resultReason, 'draw accepted through the OCS route').toBe('agreement')
})

test('an open challenge joined by two players at once has one winner', async () => {
	const open = (await api('carol', 'POST', 'api/games', { opponent: null, rated: false, timeControl: 'corr:1d' })).game
	expect(open.status === 'open' && open.opponent === null, 'carol posts an open challenge').toBe(true)
	expect((await api('bob', 'GET', 'api/games')).open.some((g) => g.id === open.id), 'bob sees it in his lobby').toBe(true)
	await expectApiError(api('carol', 'POST', `api/games/${open.id}/join`), 400, 'own_challenge')
	const joins = await Promise.allSettled([api('bob', 'POST', `api/games/${open.id}/join`), api('admin', 'POST', `api/games/${open.id}/join`)])
	const winners = joins.filter((j) => j.status === 'fulfilled')
	const losers = joins.filter((j) => j.status === 'rejected').map((j) => j.reason)
	expect(winners.length === 1 && losers.length === 1 && [409, 404].includes(losers[0].status), `one join wins, the other gets ${losers[0]?.status} ${losers[0]?.body?.error}`).toBe(true)
	const joined = winners[0].value.game
	expect(await findNotification('carol', open.id, 'joined your open challenge'), 'carol gets open_joined').toBeTruthy()
	await api(joined.white.userId === uid('carol') ? 'carol' : (joined.white.userId === uid('bob') ? 'bob' : 'admin'), 'POST', `api/games/${open.id}/abort`)
})

test('the lobby summary, the history and recent opponents', async () => {
	const summary = await api('bob', 'GET', 'api/games/summary')
	expect(typeof summary.rev === 'string' && Number.isInteger(summary.yourTurn) && Number.isInteger(summary.invitations), `summary ${JSON.stringify(summary)}`).toBe(true)
	const history = await api('bob', 'GET', 'api/games/history?limit=1')
	expect(history.games.length === 1 && typeof history.next === 'string', 'history pages with a cursor').toBe(true)
	const page2 = await api('bob', 'GET', `api/games/history?limit=1&cursor=${encodeURIComponent(history.next)}`)
	expect(page2.games.length === 1 && page2.games[0].id !== history.games[0].id, 'second history page').toBe(true)
	expect((await api('bob', 'GET', 'api/users/recent')).users.some((u) => u.userId === uid('admin')), 'recent opponents').toBe(true)
})
