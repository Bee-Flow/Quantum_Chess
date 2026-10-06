/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Writes online-variants.json, the shared fixture of online variant play (docs/development/online-variants.md):
 *
 * - `catalog`: per variant, its seats, whether it can be played online and its teams (with the default options and
 *   with `teamOptions`), for lib/Service/Game/VariantCatalog.php;
 * - `results`: result codes and what they mean, for lib/Service/Game/VariantResult.php;
 * - `chains`: games with their chain start and the chain after every move, for lib/Service/Game/VariantChain.php
 *   and src/online/vchain.js;
 * - `replays`: seeded random games in several variants with the roll of every move and what it leads to, which
 *   tests/js/variants/online.spec.js replays. They change when a rule changes: then raise `ONLINE_RULES_VERSION`
 *   (src/variants/online.js and VariantCatalog::RULES_VERSION) and regenerate.
 *
 *   node tests/fixtures/generate-online-variant-fixtures.mjs        (npm run fixtures:online)
 *
 * Deterministic: seeded move choice and rolls, no clock, no Math.random.
 */

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seededRng } from '../../src/engine/index.js'
import { vchainNext, vchainStart } from '../../src/online/vchain.js'
import {
	applyMove,
	CATALOG,
	isOnlineVariant,
	legalMoves,
	loadVariant,
	newGame,
	ONLINE_RULES_VERSION,
	optionValues,
	resultCode,
	seatCount,
	settlementOf,
	T,
	teamsOf,
} from '../../src/variants/index.js'

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'online-variants.json')

/** The options that switch on teams, per variant. */
const TEAM_OPTIONS = { fourplayer: { mode: 'teams' } }

/** The replayed games: variant, options, plies and seed. */
const REPLAYS = [
	['atomic', {}, 60, 1],
	['threecheck', {}, 60, 1],
	['crazyhouse', {}, 40, 2],
	['chess960', { position: 518 }, 30, 3],
	['shogi', {}, 30, 4],
	['raumschach', {}, 24, 5],
	['multiverse', {}, 16, 6],
	['fourplayer', { mode: 'ffa' }, 40, 7],
	['fourplayer', { mode: 'teams' }, 40, 8],
	['bughouse', {}, 40, 9],
]

const catalog = CATALOG.map(({ id }) => ({
	id,
	seats: seatCount(id),
	online: isOnlineVariant(id),
	teams: teamsOf(id, {}),
	...(TEAM_OPTIONS[id] ? { teamOptions: TEAM_OPTIONS[id], teamsWithOptions: teamsOf(id, TEAM_OPTIONS[id]) } : {}),
}))

const results = [
	null,
	{ winner: 0, reason: 'king' },
	{ winner: 1, reason: 'resign' },
	{ winner: null, winners: [2, 0], reason: 'king' },
	{ winner: 3, reason: 'king' },
	{ winner: null, reason: 'quiet' },
].map((result) => ({ result, code: resultCode(result) }))

/**
 * A chain fixture: the start and the chain after every move.
 *
 * @param {number} gameId game id
 * @param {string} variant variant id
 * @param {object} options option values
 * @param {Array<string|null>} seats user id per seat
 * @param {number} createdAt creation time
 * @param {Array<[number, string, number]>} moves seat, code and roll per move
 * @return {object}
 */
function chainCase(gameId, variant, options, seats, createdAt, moves) {
	const start = vchainStart(gameId, variant, options, seats, createdAt)
	let chain = start
	const steps = moves.map(([seat, code, u], ply) => {
		chain = vchainNext(chain, ply, seat, code, u)
		return { ply, seat, code, u, chain }
	})
	return { gameId, variant, options, seats, createdAt, start, moves: steps }
}

const chains = [
	chainCase(7, 'atomic', {}, ['alice', 'bob'], 1790000000, [[0, 'e2-e4', 0], [1, 'g8-f6|h6', 16777215]]),
	chainCase(
		42,
		'fourplayer',
		{ mode: 'teams' },
		['ann', 'ben', 'cat', 'dan'],
		1790000123,
		[[0, 'e2-e4', 5], [1, 'b5-d5', 123456], [2, '?k13', 8388608]],
	),
	chainCase(
		9,
		'multiverse',
		{ timelines: '3', setup: 'standard', reach: '1', view: 'auto' },
		['zoë', null],
		1790009999,
		[[0, 'submit', 0]],
	),
	chainCase(1, 'chess960', { position: 518 }, ['x|y', 'ü'], 0, []),
]

/**
 * A seeded random game with the roll of every move and what it leads to.
 *
 * @param {string} variant variant id
 * @param {object} given option values
 * @param {number} plies most moves to play
 * @param {number} seed seed
 * @return {Promise<object>}
 */
async function replayCase(variant, given, plies, seed) {
	const V = await loadVariant(variant)
	const options = optionValues(V, given)
	const rng = seededRng(seed)
	let state = newGame(V, options, rng)
	const moves = []
	while (moves.length < plies && !state.result) {
		const list = legalMoves(V, state, { splits: rng() < 0.3 })
		if (list.length === 0) {
			break
		}
		const { code } = list[Math.floor(rng() * list.length)]
		const u = Math.floor(rng() * T)
		const played = applyMove(V, state, code, u / T)
		moves.push({ ply: state.ply, seat: state.turn, code, u, ...settlementOf(played.state) })
		state = played.state
	}
	return { variant, options, moves }
}

const replays = []
for (const [variant, options, plies, seed] of REPLAYS) {
	replays.push(await replayCase(variant, options, plies, seed))
}

const fixture = { rulesVersion: ONLINE_RULES_VERSION, catalog, results, chains, replays }
writeFileSync(OUT, JSON.stringify(fixture, null, '\t') + '\n')
console.log('wrote ' + OUT + ': ' + replays.map((r) => r.variant + ' ' + r.moves.length).join(', '))
