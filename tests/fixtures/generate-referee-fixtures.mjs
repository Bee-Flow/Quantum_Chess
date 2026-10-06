/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Writes tests/fixtures/referee/<variant>.json, the parity fixtures of the server-ruled variants, Kriegspiel and Fog
 * of war (docs/development/online-variants.md, section 6). lib/Variants/ (the PHP referee) replays them in
 * tests/php/Unit/Variants/RefereeParityTest.php and must give the same answer at every step.
 *
 * Every game is a seeded random game from the start position. Every step holds:
 *
 * - `ply`, `turn`: the position before the move;
 * - `refused`: moves the player tries that the referee refuses (in Kriegspiel the umpire's "no", taken from the moves
 *   the player may try; otherwise impossible splits, merges and measurements);
 * - `code`, `u`: the move played and the roll the server drew for it; `preview`: its outcomes before the roll
 *   (`preview` of src/variants/referee.js);
 * - `nextSeat`, `result`, `stateHash`: what the move leads to (`settlementOf`), `record`: its history record;
 * - `views`: per seat, the hash of the view's position (`positionHash`), the visible squares, the legal moves and the
 *   view's last history record (`viewFor`).
 *
 * The full views of both seats after a few plies (`fullViews`) and the final state's history (`history`) are kept as
 * well.
 *
 *   node tests/fixtures/generate-referee-fixtures.mjs        (npm run fixtures:referee)
 *
 * Deterministic: seeded move choice and rolls, no clock, no Math.random.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seededRng } from '../../src/engine/index.js'
import {
	applyMove,
	isLegal,
	legalMoves,
	loadVariant,
	newGame,
	positionHash,
	refereePreview as preview,
	settlementOf,
	T,
	viewFor,
} from '../../src/variants/index.js'

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'referee')

/**
 * The games per variant: seed and most plies. The seeds give games that end by the escape rule (3, 7, 19, 37), by a
 * king capture (38, 53), by the 50-move rule (29), and a long game that goes on (4).
 */
const GAMES = [[3, 400], [7, 400], [19, 400], [37, 400], [38, 400], [53, 400], [29, 400], [4, 120]]

/** Games that play castling, en passant and promotions whenever they can (seed and most plies). */
const SPECIAL_GAMES = [[111, 200], [112, 200]]

/** The plies after which both full views are kept. */
const FULL_VIEW_PLIES = new Set([6, 25])

/**
 * The view of a seat as a step keeps it.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} seat seat
 * @return {object}
 */
function viewDigest(V, state, seat) {
	const view = viewFor(V, state, seat)
	return {
		hash: positionHash(view),
		worlds: view.worlds.length,
		visible: view.visible,
		legal: view.legal,
		last: view.history.at(-1) ?? null,
	}
}

/**
 * Moves that the referee refuses, as a player might try them.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {() => number} rng random numbers
 * @return {string[]}
 */
function refusedTries(V, state, rng) {
	const out = []
	if (V.id === 'beeflow') {
		// Bee Flow Chess: captures of an enemy piece under the privacy shield (next to its Queen Bee) in every world
		const b = state.worlds[0].b
		for (let victim = 0; victim < b.sq.length; victim++) {
			const enemy = b.sq[victim] >= 0 && b.sd[victim] !== state.turn
			if (!enemy || !state.worlds.every(({ b: w }) => V.shielded(w, victim))) {
				continue
			}
			for (let own = 0; own < b.sq.length; own++) {
				const code = b.sq[own] >= 0 && b.sd[own] === state.turn
					? V.topology.names[b.sq[own]] + '-' + V.topology.names[b.sq[victim]]
					: null
				if (code && !isLegal(V, state, code) && !out.includes(code) && out.length < 3) {
					out.push(code)
				}
			}
		}
	}
	if (V.candidateMoves) {
		for (const m of V.candidateMoves(state)) {
			if (!isLegal(V, state, m.code)) {
				out.push(m.code)
			}
		}
	}
	// quantum moves that look possible but are not: a split onto squares that are taken, a merge of two pieces, a
	// measurement of a solid piece, and a code that names no move
	const names = V.topology.names
	const pick = () => names[Math.floor(rng() * names.length)]
	for (let i = 0; i < 6; i++) {
		const code = [`${pick()}-${pick()}|${pick()}`, `${pick()}|${pick()}-${pick()}`, `?${pick()}`, pick()][i % 4]
		if (!isLegal(V, state, code) && !out.includes(code)) {
			out.push(code)
		}
	}
	return out.slice(0, 6)
}

/**
 * Whether a move takes an enemy king for certain: such moves are mostly left out, so that games last.
 *
 * @param {object} state state
 * @param {object} m legal move
 * @return {boolean}
 */
function takesKing(state, m) {
	return m.type === 'move' && state.worlds.every(({ b }) => b.board[m.to] >= 0 && b.ty[b.board[m.to]] === 'k'
		&& b.sd[b.board[m.to]] !== state.turn)
}

/**
 * The moves a game of `SPECIAL_GAMES` picks from: castling and en passant whenever possible, then promotions, else
 * moves that keep the castling rights (no king or rook moves), so that castling and en passant come up.
 *
 * @param {object} state state
 * @param {object[]} list legal moves
 * @return {object[]}
 */
function specialPool(state, list) {
	for (const wanted of [(m) => m.kind === 'castle' || m.kind === 'ep', (m) => Boolean(m.promo)]) {
		const found = list.filter(wanted)
		if (found.length) {
			return found
		}
	}
	const b = state.worlds[0].b
	const keeps = list.filter((m) => m.type === 'move' && b.board[m.from] >= 0 && !'kr'.includes(b.ty[b.board[m.from]]))
	return keeps.length ? keeps : list
}

/**
 * A seeded random game: quantum moves now and then, a certain capture of the king mostly left out, so that the games
 * reach rolled captures, the escape rule and the 50-move rule.
 *
 * @param {object} V variant
 * @param {number} seed seed
 * @param {number} plies most plies
 * @return {object}
 */
function game(V, seed, plies, special = false) {
	const rng = seededRng(seed * 31 + 1)
	const tries = seededRng(seed * 31 + 2)
	// Bee Flow Chess: the two shuffled back ranks, as the server draws them
	const shuffle = seededRng(seed * 31 + 3)
	const options = V.id === 'beeflow'
		? { white: Math.floor(shuffle() * V.arrangements), black: Math.floor(shuffle() * V.arrangements) }
		: {}
	let state = newGame(V, options, rng)
	const steps = []
	const fullViews = []
	while (steps.length < plies && !state.result) {
		const list = legalMoves(V, state, { splits: rng() < 0.3 })
		if (list.length === 0) {
			break
		}
		const lasting = list.filter((m) => !takesKing(state, m))
		const usual = lasting.length ? lasting : list
		const pool = special ? specialPool(state, usual) : rng() < 0.85 && lasting.length ? lasting : list
		const { code } = pool[Math.floor(rng() * pool.length)]
		const u = Math.floor(rng() * T)
		const step = {
			ply: state.ply,
			turn: state.turn,
			refused: refusedTries(V, state, tries),
			code,
			u,
			preview: preview(V, state, code),
		}
		const played = applyMove(V, state, code, u / T)
		state = played.state
		Object.assign(step, settlementOf(state), {
			record: state.history.at(-1),
			views: [0, 1].map((seat) => viewDigest(V, state, seat)),
		})
		steps.push(step)
		if (FULL_VIEW_PLIES.has(state.ply)) {
			fullViews.push({ ply: state.ply, views: [0, 1].map((seat) => viewFor(V, state, seat)) })
		}
	}
	return { seed, special, options, steps, fullViews, result: state.result, history: state.history }
}

mkdirSync(DIR, { recursive: true })
for (const id of ['beeflow', 'kriegspiel', 'darkchess']) {
	const V = await loadVariant(id)
	const games = [
		// Bee Flow Chess's games are capped at 160 plies, which keeps its file under 2 MB
		...GAMES.map(([seed, plies]) => game(V, seed, id === 'beeflow' ? Math.min(plies, 160) : plies)),
		...SPECIAL_GAMES.map(([seed, plies]) => game(V, seed, plies, true)),
	]
	const file = join(DIR, id + '.json')
	writeFileSync(file, JSON.stringify({ variant: id, T, games }) + '\n')
	const ends = games.map((g) => (g.result ? g.result.reason : 'open') + '@' + g.steps.length)
	console.log('wrote ' + file + ': ' + ends.join(', '))
}
