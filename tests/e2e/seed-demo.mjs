/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Seeds the online part of the App Store demo (screenshots/README.md) through the API, as the test users of
 * tests/e2e/README.md: a running game in which bob is to move, an invitation from carol to bob and an open challenge
 * by admin. Pending invitations, challenges and running games of the three users are ended first, so the script can
 * run again.
 *
 *   node tests/e2e/seed-demo.mjs
 */
import { fileURLToPath } from 'node:url'
import { api } from './helpers/api.mjs'
import { getUser } from './helpers/env.mjs'
import { occ } from './helpers/occ.mjs'

const uid = (who) => getUser(who).uid

/**
 * Cancel every pending invitation and open challenge the user created, and end the user's running games (abort
 * before both sides moved, else resign), so that a new run starts from a tidy lobby.
 *
 * @param {string} who test user
 */
async function tidy(who) {
	const lobby = await api(who, 'GET', 'api/games')
	for (const g of lobby.outgoing ?? []) {
		await api(who, 'POST', `api/games/${g.id}/cancel`).catch(() => {})
	}
	for (const g of [...(lobby.yourTurn ?? []), ...(lobby.waiting ?? [])]) {
		await api(who, 'POST', `api/games/${g.id}/${g.ply < 2 ? 'abort' : 'resign'}`).catch(() => {})
	}
}

/**
 * Play a move as a user.
 *
 * @param {string} who test user
 * @param {object} game game (id, ply)
 * @param {string} code move code
 * @return {Promise<object>} the game after the move
 */
async function move(who, game, code) {
	const res = await api(who, 'POST', `api/games/${game.id}/moves`, { code, ply: game.ply, clientId: `demo-${game.id}-${game.ply}`, thinkMs: 4000 })
	return res.game ?? res
}

/**
 * @return {Promise<{running: number, invitation: number, challenge: number}>} ids of the seeded games
 */
export async function seedDemo() {
	for (const who of ['admin', 'bob', 'carol']) {
		await tidy(who)
	}
	// admin (White) against bob: a split and a pawn move each, then bob is to move
	let game = (await api('admin', 'POST', 'api/games', { opponent: uid('bob'), rated: false, timeControl: 'corr:3d', color: 'w', message: 'Fancy a quantum game?' })).game
	game = (await api('bob', 'POST', `api/games/${game.id}/accept`)).game ?? game
	game = await move('admin', game, 'g1-f3|h3')
	game = await move('bob', game, 'e7-e5')
	game = await move('admin', game, 'e2-e4')
	const running = game.id

	// carol invites bob; admin posts an open challenge
	const invitation = (await api('carol', 'POST', 'api/games', { opponent: uid('bob'), rated: true, timeControl: 'corr:1d', message: 'Rematch of our lunch game?' })).game.id
	const challenge = (await api('admin', 'POST', 'api/games', { opponent: null, rated: false, timeControl: 'corr:7d' })).game.id

	// the Quantum Chess widget first on bob's dashboard
	await occ(['user:setting', uid('bob'), 'dashboard', 'layout', 'quantumchess,recommendations'], { allowFailure: true })
	return { running, invitation, challenge }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	console.info(await seedDemo())
}
