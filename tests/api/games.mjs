/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { applyMove, chainNext, chainStart, findMove, initialState, positionHash, serializeState } from '../../src/engine/index.js'
/**
 * End-to-end check of the online game backend against a running Nextcloud (docs/SPEC.md §15.2):
 * admin invites bob, bob accepts through the OCS action of his notification, both play (a split and a rolled
 * capture), idempotent retry, stale ply, polling, chat, draw offer declined through the notification action and the
 * cool-down, resignation with Elo, rematch through the OCS action, notifications, the dashboard widget, an open
 * challenge joined concurrently, and the stored hash chain replayed with the JS engine.
 *
 * Usage: node tests/api/games.mjs   (QC_BASE_URL defaults to http://127.0.0.1:8080)
 */
import { api, ApiError, ocs } from '../e2e/helpers/api.mjs'
import { env, getUser } from '../e2e/helpers/env.mjs'

let passed = 0

/**
 * @param {any} condition must be truthy
 * @param {string} message what was checked
 */
function check(condition, message) {
	if (!condition) {
		throw new Error('FAILED: ' + message)
	}
	passed++
	process.stdout.write(`  ✓ ${message}\n`)
}

/**
 * Expect an API error.
 *
 * @param {Promise<any>} promise the call
 * @param {number} status expected HTTP status
 * @param {string} [code] expected error code
 * @return {Promise<any>} the error body
 */
async function expectError(promise, status, code) {
	try {
		await promise
	} catch (error) {
		if (!(error instanceof ApiError)) {
			throw error
		}
		check(error.status === status && (code === undefined || error.body?.error === code), `answers ${status} ${code ?? ''}`.trim())
		return error.body
	}
	throw new Error(`FAILED: expected ${status} ${code ?? ''}`)
}

/**
 * @param {string} who test user
 * @return {Promise<any[]>} the user's notifications of this app
 */
async function notifications(who) {
	const user = getUser(who)
	const response = await fetch(`${env.baseURL}/ocs/v2.php/apps/notifications/api/v2/notifications?format=json`, {
		headers: { Authorization: basic(user), 'OCS-APIRequest': 'true', Accept: 'application/json' },
	})
	const json = await response.json()
	return (json.ocs?.data ?? []).filter((n) => n.app === 'quantumchess')
}

/**
 * @param {object} user test user
 * @return {string} basic auth header
 */
function basic(user) {
	return 'Basic ' + Buffer.from(`${user.uid}:${user.password}`).toString('base64')
}

/**
 * Find the notification of a game whose rich subject contains `text`.
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
 * POST a notification action link as `who` and return `ocs.data`.
 *
 * @param {string} who test user
 * @param {object} action notification action
 * @return {Promise<any>}
 */
async function runAction(who, action) {
	const response = await fetch(action.link + '?format=json', {
		method: action.type,
		headers: { Authorization: basic(getUser(who)), 'OCS-APIRequest': 'true', Accept: 'application/json' },
	})
	const json = await response.json()
	if (!response.ok) {
		throw new Error(`action ${action.link} → ${response.status} ${JSON.stringify(json)}`)
	}
	return json.ocs.data
}

/**
 * @param {string} who user key
 * @return {string}
 */
function uid(who) {
	return getUser(who).uid
}

/**
 * Cancel leftover invitations of earlier runs between the test users.
 */
async function cleanup() {
	for (const who of ['admin', 'bob', 'carol']) {
		const lobby = await api(who, 'GET', 'api/games')
		for (const game of lobby.outgoing) {
			await api(who, 'POST', `api/games/${game.id}/cancel`)
		}
	}
}

/**
 * Make a move as `who` with a fresh client id.
 *
 * @param {string} who user key
 * @param {object} game GameLive
 * @param {string} code move code
 * @return {Promise<any>} the move response
 */
async function play(who, game, code, clientId = 'qc-' + Math.random().toString(36).slice(2, 12)) {
	return api(who, 'POST', `api/games/${game.id}/moves`, { code, ply: game.ply, clientId, thinkMs: 1200 })
}

console.log(`Quantum Chess API check against ${env.baseURL}`)
await cleanup()

// ---------------------------------------------------------------- invitation, OCS accept
console.log('Invitation and acceptance')
const upper = (await api('admin', 'POST', 'api/games', { opponent: uid('bob').toUpperCase(), rated: false })).game
check(upper.opponent.userId === uid('bob'), 'an invitation typed in another letter case stores the canonical user id')
check((await api('bob', 'GET', 'api/games')).invitations.some((g) => g.id === upper.id), 'bob sees that invitation')
await api('admin', 'POST', `api/games/${upper.id}/cancel`)
let { game } = await api('admin', 'POST', 'api/games', { opponent: uid('bob'), rated: true, timeControl: 'corr:3d', message: 'Fancy a quantum game?' })
check(game.status === 'pending' && game.ratedRequested && game.colorChoice === 'r', 'admin invites bob (rated, corr:3d, pending)')
await expectError(api('admin', 'POST', 'api/games', { opponent: uid('bob') }), 429, 'too_many_invitations')
await expectError(api('admin', 'POST', 'api/games', { opponent: 'no-such-user-42' }), 404, 'user_not_found')
await expectError(api('admin', 'POST', 'api/games', { opponent: uid('bob'), rated: true, timeControl: 'corr:none' }), 400, 'rated_needs_deadline')
const invite = await findNotification('bob', game.id, 'invited you')
check(invite && invite.subjectRichParameters.user.id === uid('admin'), 'bob has the invite notification with {user}')
check(invite.message.includes('3 days per move') && invite.message.includes('Fancy a quantum game?'), 'invite message: time control and text')
const acceptAction = invite.actions.find((a) => a.primary)
check(acceptAction && acceptAction.type === 'POST' && acceptAction.link.includes(`/ocs/v2.php/apps/quantumchess/api/v1/games/${game.id}/accept`), 'Accept action points to the OCS route')
const accepted = await runAction('bob', acceptAction)
check(accepted.game.status === 'active', 'POST Accept action starts the game')
check(!(await findNotification('bob', game.id, 'invited you')), 'invite notification is gone after accepting')
check(await findNotification('admin', game.id, 'accepted your invitation'), 'admin is told that bob accepted')
game = (await api('admin', 'GET', `api/games/${game.id}`)).game
check(game.rated && game.white && game.black && game.chain?.length === 64 && game.deadlineAt > game.now, 'colours, chain_0, deadline and rated flag set')
check(game.chain === chainStart(game.id, game.white.userId, game.black.userId, game.createdAt), 'chain_0 equals the JS engine chainStart')
const white = game.white.userId === uid('admin') ? 'admin' : 'bob'
const black = white === 'admin' ? 'bob' : 'admin'
const probe = await expectError(api('carol', 'POST', `api/games/${game.id}/join`), 404, 'not_found')
const missing = await expectError(api('carol', 'POST', 'api/games/999999999/join'), 404, 'not_found')
check(JSON.stringify(probe) === JSON.stringify(missing), 'joining someone else\'s active game answers like a missing game (no probing)')

// ---------------------------------------------------------------- moves
console.log('Moves')
await expectError(play(black, game, 'e7-e5'), 403, 'not_your_turn')
let r = await play(white, game, 'g1-f3|h3')
check(r.move.code === 'g1-f3|h3' && r.measurement === null && r.game.ply === 1, 'white splits the knight g1 → f3|h3')
check((await findNotification(black, game.id, 'Your move against'))?.message.includes('split their knight'), 'black gets your_turn: "They split their knight…"')
const dash = await fetch(`${env.baseURL}/ocs/v2.php/apps/dashboard/api/v2/widget-items?widgets[]=quantumchess&format=json`, {
	headers: { Authorization: basic(getUser(black)), 'OCS-APIRequest': 'true', Accept: 'application/json' },
}).then((res) => res.json())
const items = dash.ocs.data.quantumchess
check(items.items.some((i) => i.link.endsWith(`#/game/${game.id}`) && i.title.startsWith('Your move against') && i.subtitle.startsWith('Move 1') && i.overlayIconUrl.includes('overlay-king-b')), 'dashboard widget lists the your-move game for black')
check(items.emptyContentMessage === 'No games waiting for your move', 'dashboard widget has the empty text')
game = r.game
r = await play(black, game, 'e7-e5')
check(r.measurement === null && r.game.ply === 2, 'black plays e7-e5')
game = r.game
await expectError(api(white, 'POST', `api/games/${game.id}/moves`, { code: 'f3-e5', ply: 1, clientId: 'stale-ply-1' }), 409, 'conflict')
await expectError(play(white, game, 'e1-e3'), 400, 'illegal_move')
const legal = findMove(JSON.parse(serializeState(game.state)), 'f3-e5')
check(legal && legal.resolution === 'rolled', 'f3xe5 is a rolled capture for the JS engine')
const clientId = 'roll-' + Date.now()
r = await play(white, game, 'f3-e5', clientId)
check(Number.isInteger(r.measurement?.u) && ['capture', 'miss'].includes(r.measurement.key) && r.replayed === false, `rolled capture stored with integer u (${r.measurement.key}, u=${r.measurement.u})`)
const retry = await play(white, game, 'f3-e5', clientId)
check(retry.replayed === true && retry.measurement.u === r.measurement.u && retry.move.chain === r.move.chain, 'retry with the same clientId is replayed and never rolls again')
game = r.game
const yourTurn = await findNotification(black, game.id, 'Your move against')
check(yourTurn && (r.measurement.key === 'capture' ? /captured your pawn on e5 \(50\u00a0% chance\)/.test(yourTurn.message) : /missed/.test(yourTurn.message)), `your_turn replaced with the roll in words: "${yourTurn?.message}"`)
check((await notifications(black)).filter((n) => n.object_id === String(game.id) && n.subjectRich.includes('Your move')).length === 1, 'one your_turn notification per game')

// ---------------------------------------------------------------- polling
console.log('Polling')
let poll = await api(black, 'GET', `api/games/${game.id}/poll?rev=${game.rev}&ply=${game.ply}&chat=0`)
check(poll.changed === false && poll.rev === game.rev, 'poll with the current rev: unchanged')
poll = await api(black, 'GET', `api/games/${game.id}/poll?rev=${game.rev - 1}&ply=2&chat=0`)
check(poll.changed === true && poll.moves.length === 1 && poll.moves[0].ply === 2 && poll.game.rev === game.rev, 'poll with an old rev returns the new move')
await expectError(api('carol', 'GET', `api/games/${game.id}`), 404, 'not_found')

// ---------------------------------------------------------------- chat
console.log('Chat')
let chat = await api(white, 'POST', `api/games/${game.id}/chat`, { message: '  Nice   roll!\u0007 ' })
check(chat.message.kind === 'text' && chat.message.message === 'Nice   roll!' && chat.rev === game.rev + 1, 'text message trimmed and control characters removed')
check((await findNotification(black, game.id, 'sent a message'))?.message === 'Nice roll!', 'chat notification with excerpt')
chat = await api(black, 'POST', `api/games/${game.id}/chat`, { phrase: 'good_luck' })
check(chat.message.kind === 'phrase' && chat.message.message === 'good_luck', 'quick phrase stored as key')
await expectError(api(black, 'POST', `api/games/${game.id}/chat`, { message: 'x'.repeat(501) }), 400, 'invalid_argument')
check((await api(black, 'PUT', `api/games/${game.id}/mute`, { muted: true })).muted === true, 'black mutes the chat')
await api(white, 'POST', `api/games/${game.id}/chat`, { message: 'muted?' })
check((await findNotification(black, game.id, 'sent a message'))?.message !== 'muted?', 'no chat notification while muted')
await api(black, 'PUT', `api/games/${game.id}/mute`, { muted: false })

// ---------------------------------------------------------------- draw offer
console.log('Draw offer')
game = (await api(black, 'GET', `api/games/${game.id}`)).game
check(!(await findNotification(black, game.id, 'Your move against')), 'opening the game clears your_turn')
game = (await api(white, 'POST', `api/games/${game.id}/draw`, { action: 'offer' })).game
check(game.drawOffer?.by === 'w' && game.myColor === 'w', 'white offers a draw')
const drawNote = await findNotification(black, game.id, 'offers a draw')
check(drawNote && drawNote.message === 'Move 2' && drawNote.actions.length === 2, 'black has the draw_offer notification with Accept/Decline')
const declined = await runAction(black, drawNote.actions.find((a) => !a.primary))
check(declined.game.status === 'active', 'Decline action declines the draw')
game = (await api(white, 'GET', `api/games/${game.id}`)).game
check(game.drawOffer === null && game.canOfferDraw === false && game.drawAvailableAtPly === game.ply + 6, 'cool-down: next offer after 3 own moves')
const cooldown = await expectError(api(white, 'POST', `api/games/${game.id}/draw`, { action: 'offer' }), 409, 'draw_not_allowed')
check(cooldown.availableAtPly === game.ply + 6, 'draw_not_allowed carries availableAtPly')
check(game.chat.map((c) => c.message).join(',').includes('draw_offered,draw_declined'), 'system lines draw_offered and draw_declined')
await expectError(api(black, 'POST', `api/games/${game.id}/draw`, { action: 'accept' }), 409, 'no_draw_offer')

// ---------------------------------------------------------------- one more move, resign, ratings
console.log('Resignation and ratings')
const before = { [white]: (await api(white, 'GET', 'api/stats')).online, [black]: (await api(black, 'GET', 'api/stats')).online }
const next = r.measurement.key === 'capture' ? 'd7-d6' : 'b8-c6'
r = await play(black, game, next)
check(r.game.ply === 4, `black plays ${next}`)
game = (await api(white, 'POST', `api/games/${game.id}/resign`)).game
check(game.status === 'finished' && game.resultReason === 'resignation' && game.winner === (game.myColor === 'w' ? 'b' : 'w'), 'white resigns: black wins')
check(game.ratingChange && game.ratingChange.w + game.ratingChange.b === 0, `rating change ${JSON.stringify(game.ratingChange)}`)
const after = { [white]: (await api(white, 'GET', 'api/stats')).online, [black]: (await api(black, 'GET', 'api/stats')).online }
const kw = before[white].ratedGames < 10 ? 40 : 20
check(after[black].rating > before[black].rating && after[white].rating < before[white].rating && after[black].ratedGames === before[black].ratedGames + 1, 'both rating rows updated')
if (before[white].rating === before[black].rating && before[white].ratedGames < 10 && before[black].ratedGames < 10) {
	check(after[black].rating - before[black].rating === kw / 2, 'K = 40 for provisional players (+20 at equal ratings)')
}
const over = await findNotification(black, game.id, 'You won against')
check(over && over.message.startsWith('Resignation') && over.message.includes('Rating'), `winner's game_over: "${over?.message}"`)
check(!(await findNotification(white, game.id, 'You lost')), 'the resigning player is not notified')
await expectError(play(black, game, 'a7-a6'), 409, 'game_over')

// ---------------------------------------------------------------- chain replay with the JS engine
console.log('Hash chain')
const full = (await api(black, 'GET', `api/games/${game.id}`)).game
let state = initialState()
let chain = chainStart(full.id, full.white.userId, full.black.userId, full.createdAt)
for (const move of full.moves) {
	const applied = applyMove(state, move.code, move.measurement ? { u: move.measurement.u } : {})
	check(JSON.stringify(applied.measurement) === JSON.stringify(move.measurement), `ply ${move.ply}: measurement record replays identically`)
	chain = chainNext(chain, move.ply, move.code, move.measurement?.u ?? null, move.measurement?.key ?? null, applied.state)
	check(chain === move.chain && positionHash(applied.state) === move.stateHash, `ply ${move.ply}: chain and state hash match the JS engine`)
	state = applied.state
}
check(chain === full.chain && serializeState(state) === serializeState(full.state), 'head of the chain and final state match')

// ---------------------------------------------------------------- rematch through the notification action
console.log('Rematch')
const rematchAction = over.actions.find((a) => a.link.endsWith('/rematch'))
check(rematchAction, 'game_over has a Rematch action')
const rematch = (await runAction(black, rematchAction)).game
check(rematch.status === 'pending' && rematch.rematchOf === game.id && rematch.colorChoice === (game.myColor === 'w' ? 'w' : 'b'), 'OCS rematch creates the swapped-colour invitation')
check((await runAction(black, rematchAction)).game.id === rematch.id, 'repeated rematch is idempotent')
check(await findNotification(white, rematch.id, 'wants a rematch'), 'opponent gets the rematch notification')
const dash2 = await fetch(`${env.baseURL}/ocs/v2.php/apps/dashboard/api/v2/widget-items?widgets[]=quantumchess&format=json`, {
	headers: { Authorization: basic(getUser(white)), 'OCS-APIRequest': 'true', Accept: 'application/json' },
}).then((res) => res.json())
check(dash2.ocs.data.quantumchess.items[0]?.title.endsWith('wants a rematch'), 'dashboard lists the rematch offer first')
const started = (await api(white, 'POST', `api/games/${game.id}/rematch`)).game
check(started.id === rematch.id && started.status === 'active' && started.white.userId === uid(black), 'the other player\'s rematch accepts it with swapped colours')
check((await api(started.black.userId === uid('admin') ? 'admin' : 'bob', 'POST', `api/games/${started.id}/abort`)).game.status === 'aborted', 'abort before both sides moved')

// ---------------------------------------------------------------- web accept, abort window
console.log('Web accept and abort window')
let g2 = (await api('bob', 'POST', 'api/games', { opponent: uid('admin'), rated: false, color: 'w', timeControl: 'corr:none' })).game
check(g2.colorChoice === 'w' && !g2.ratedRequested, 'casual invitation with a fixed colour')
g2 = (await api('admin', 'POST', `api/games/${g2.id}/accept`)).game
check(g2.status === 'active' && g2.white.userId === uid('bob') && g2.deadlineAt === null && !g2.rated, 'web accept: bob is White, no deadline')
g2 = (await play('bob', g2, 'e2-e4')).game
g2 = (await play('admin', g2, 'e7-e5')).game
await expectError(api('bob', 'POST', `api/games/${g2.id}/abort`), 409, 'abort_not_allowed')
check((await api('bob', 'POST', `api/games/${g2.id}/draw`, { action: 'offer' })).game.drawOffer.by === 'w', 'draw offer by white')
check((await ocs('admin', 'POST', `api/v1/games/${g2.id}/draw-accept`)).game.resultReason === 'agreement', 'draw accepted through the OCS route')

// ---------------------------------------------------------------- open challenge, concurrent join
console.log('Open challenge')
const open = (await api('carol', 'POST', 'api/games', { opponent: null, rated: false, timeControl: 'corr:1d' })).game
check(open.status === 'open' && open.opponent === null, 'carol posts an open challenge')
check((await api('bob', 'GET', 'api/games')).open.some((g) => g.id === open.id), 'bob sees it in his lobby')
await expectError(api('carol', 'POST', `api/games/${open.id}/join`), 400, 'own_challenge')
const joins = await Promise.allSettled([api('bob', 'POST', `api/games/${open.id}/join`), api('admin', 'POST', `api/games/${open.id}/join`)])
const winners = joins.filter((j) => j.status === 'fulfilled')
const losers = joins.filter((j) => j.status === 'rejected').map((j) => j.reason)
check(winners.length === 1 && losers.length === 1 && [409, 404].includes(losers[0].status), `one join wins, the other gets ${losers[0]?.status} ${losers[0]?.body?.error}`)
const joined = winners[0].value.game
check(await findNotification('carol', open.id, 'joined your open challenge'), 'carol gets open_joined')
await api(joined.white.userId === uid('carol') ? 'carol' : (joined.white.userId === uid('bob') ? 'bob' : 'admin'), 'POST', `api/games/${open.id}/abort`)

// ---------------------------------------------------------------- lobby, summary, history
console.log('Lobby and lists')
const summary = await api('bob', 'GET', 'api/games/summary')
check(typeof summary.rev === 'string' && Number.isInteger(summary.yourTurn) && Number.isInteger(summary.invitations), `summary ${JSON.stringify(summary)}`)
const history = await api('bob', 'GET', 'api/games/history?limit=1')
check(history.games.length === 1 && typeof history.next === 'string', 'history pages with a cursor')
const page2 = await api('bob', 'GET', `api/games/history?limit=1&cursor=${encodeURIComponent(history.next)}`)
check(page2.games.length === 1 && page2.games[0].id !== history.games[0].id, 'second history page')
check((await api('bob', 'GET', 'api/users/recent')).users.some((u) => u.userId === uid('admin')), 'recent opponents')

console.log(`\nAll ${passed} checks passed.`)
