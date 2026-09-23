/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Parity fixture generator (ENGINE-RULES §12, SPEC §3.5). `npm run fixtures` writes tests/fixtures/engine/:
 *
 *   vectors.json   hand-written vectors: start, rescale, r → u, pct, W1–W17 and §11 edge cases as scripted games,
 *                  whyIllegal cases (inputs → reason codes), setup vectors and setup errors
 *   parser.json    §4.12 parser fixtures and notation round trips: [{input, expect}]
 *   views.json     derived views per state
 *   records.json   chain, roll display, roll memo, support keys, certainFen, sha256
 *   games-NNN.json seeded random games (arrays of up to 20 games)
 *
 * Deterministic: the same code gives the same bytes (seeded PRNG for move choice and u, no clock, no Math.random).
 * The generator asserts that every feature ER §12 lists occurs, prints the coverage counts, and refuses to write
 * more than 8 MB (2 MB per file).
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as E from '../../src/engine/index.js'

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'engine')
const T = E.T
const MAX_TOTAL = 8 * 1024 * 1024
const MAX_FILE = 2 * 1024 * 1024
const FILE_TARGET = 1800 * 1024

// ---------------------------------------------------------------------------------------------------------------
// Coverage counters
// ---------------------------------------------------------------------------------------------------------------

const cover = {
	steps: 0,
	split: 0,
	merge: 0,
	measure: 0,
	castling: 0,
	promotion: 0,
	enPassant: 0,
	rolled: 0,
	forced: 0,
	quantum: 0,
	certainCapture: 0,
	rolledCaptureOfGhost: 0,
	convergingCapture: 0,
	certainConvergingCapture: 0,
	fallback: 0,
	budgetFullState: 0,
	locationCap: 0,
	weightOneWorld: 0,
	suspendedDraw: 0,
	threeOutcomes: 0,
	result_king_captured: 0,
	result_king_trapped: 0,
	result_bare_kings: 0,
	result_repetition: 0,
	result_fifty_moves: 0,
	result_max_ply: 0,
	result_no_moves: 0,
	whyIllegalCases: 0,
}
const reasonsSeen = new Set()

const MINIMUM = {
	steps: 1500,
	split: 150,
	merge: 60,
	measure: 30,
	castling: 3,
	promotion: 3,
	enPassant: 2,
	rolled: 150,
	forced: 5,
	quantum: 100,
	certainCapture: 20,
	rolledCaptureOfGhost: 10,
	convergingCapture: 3,
	certainConvergingCapture: 1,
	fallback: 3,
	budgetFullState: 3,
	locationCap: 2,
	weightOneWorld: 1,
	suspendedDraw: 2,
	threeOutcomes: 3,
	result_king_captured: 5,
	result_king_trapped: 2,
	result_bare_kings: 1,
	result_repetition: 1,
	result_fifty_moves: 1,
	result_max_ply: 1,
	result_no_moves: 1,
	whyIllegalCases: 300,
}

// ---------------------------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------------------------

const json = (state) => E.serializeState(state)

/**
 * Build and validate a crafted state from explicit worlds (square name → letter).
 *
 * @param {Array<[Record<string, string>, number]>} worlds placements and weights
 * @param {object} [opts] other fields
 * @return {object}
 */
function craft(worlds, opts = {}) {
	const boards = worlds.map(([pieces, w]) => {
		const b = new Array(64).fill('.')
		for (const [sq, letter] of Object.entries(pieces)) {
			b[E.squareIndex(sq)] = letter
		}
		return [b.join(''), w]
	})
	boards.sort((x, y) => (x[0] < y[0] ? -1 : 1))
	const live = new Set([...boards[0][0]].filter((c) => c !== '.').map((c) => E.idOfCode(c.charCodeAt(0))))
	const state = {
		v: 1,
		types: opts.types ?? E.INITIAL_TYPES,
		worlds: boards,
		turn: opts.turn ?? 'w',
		castling: opts.castling ?? '-',
		ep: '-',
		halfmove: opts.halfmove ?? 0,
		fullmove: opts.fullmove ?? 1,
		ply: opts.ply ?? 0,
		captured: Array.from({ length: 32 }, (_, i) => i).filter((i) => !live.has(i)),
		history: [],
		result: null,
	}
	state.history = [E.positionHash(state)]
	const r = E.validateState(state)
	if (!r.ok) {
		throw new Error('craft: ' + r.error + ' ' + r.message)
	}
	return r.state
}

/**
 * A valid copy of a state with other bookkeeping numbers.
 *
 * @param {object} state state
 * @param {object} fields overrides
 * @return {object}
 */
function withFields(state, fields) {
	const s = { ...state, ...fields }
	s.history = [E.positionHash(s)]
	const r = E.validateState(s)
	if (!r.ok) {
		throw new Error('withFields: ' + r.error + ' ' + r.message)
	}
	return r.state
}

/**
 * Per-step views (SPEC §3.5).
 *
 * @param {object} s state after the step
 * @return {object}
 */
function stepViews(s) {
	return {
		kd: [E.kingDanger(s, 'w'), E.kingDanger(s, 'b')],
		budget: [E.budget(s, 'w'), E.budget(s, 'b')],
		worlds: E.worldCount(s),
		links: E.links(s),
		trapped: E.kingTrapped(s),
	}
}

/**
 * Track coverage of one applied step.
 *
 * @param {object} before state before
 * @param {object} m LegalMove
 * @param {object} r applyMove result
 * @param {boolean} forced forced outcome
 */
function track(before, m, r, forced) {
	cover.steps++
	if (m.type !== 'standard') {
		cover[m.type]++
	}
	const key = m.resolution === 'rolled' ? r.measurement.key : (m.outcomes.length === 1 ? m.outcomes[0].key : m.resolution)
	const types = before.types
	if (m.type === 'standard' && types[m.piece] === 'k' && Math.abs(m.to[0] - m.from[0]) === 2) {
		cover.castling++
	}
	if (m.promo && key !== 'miss') {
		cover.promotion++
	}
	if (m.type === 'standard' && types[m.piece] === 'p' && before.ep === E.squareName(m.to[0])) {
		cover.enPassant++
	}
	if (m.resolution === 'rolled') {
		cover.rolled++
	}
	if (m.outcomes.length === 3) {
		cover.threeOutcomes++
	}
	if (forced) {
		cover.forced++
	}
	if (m.resolution === 'quantum') {
		cover.quantum++
	}
	if (m.fallback) {
		cover.fallback++
	}
	if (m.resolution === 'certain' && key === 'capture') {
		cover.certainCapture++
	}
	const capturedId = r.state.captured.length > before.captured.length ? r.state.captured[r.state.captured.length - 1] : -1
	if (m.resolution === 'rolled' && key === 'capture' && capturedId >= 0 && E.pieceLocations(before)[capturedId].length > 1) {
		cover.rolledCaptureOfGhost++
	}
	if (m.type === 'merge' && key === 'capture') {
		cover.convergingCapture++
		if (m.resolution === 'certain') {
			cover.certainConvergingCapture++
		}
	}
	const s = r.state
	if (s.worlds.some((w) => w[1] === 1)) {
		cover.weightOneWorld++
	}
	const mover = before.turn
	if (E.budget(before, mover) >= 8 && E.generateMoves(before).every((x) => x.type !== 'split')) {
		cover.budgetFullState++
	}
	if (s.result === null) {
		const h = s.history[s.history.length - 1]
		const reps = s.history.filter((x) => x === h).length
		if (s.captured.length === 30 || s.halfmove >= 100 || reps >= 3) {
			cover.suspendedDraw++
		}
	} else {
		cover['result_' + s.result.reason]++
	}
}

/**
 * Apply one step and build its fixture entry.
 *
 * @param {object} s state before
 * @param {object} m LegalMove of s
 * @param {{u?: number, outcome?: string}} choice roll or forced outcome (ignored for unrolled moves)
 * @return {{entry: object, state: object}}
 */
function step(s, m, choice) {
	const rolled = m.resolution === 'rolled'
	const opts = rolled ? (choice.outcome !== undefined ? { outcome: choice.outcome } : { u: choice.u }) : {}
	const r = E.applyMove(s, m.code, opts)
	const forced = rolled && choice.outcome !== undefined
	track(s, m, r, forced)
	const entry = {
		legal: E.legalCodes(s),
		code: m.code,
		u: rolled && !forced ? choice.u : null,
		outcome: forced ? choice.outcome : null,
		after: json(r.state),
		measurement: r.measurement,
		notation: E.moveNotation(s, m.code, r.measurement),
		hash: E.positionHash(r.state),
		views: stepViews(r.state),
	}
	return { entry, state: r.state }
}

// ---------------------------------------------------------------------------------------------------------------
// Move-choice policies
// ---------------------------------------------------------------------------------------------------------------

/**
 * Pick one element with the rng.
 *
 * @param {Array} list list
 * @param {function(): number} rng rng
 * @return {*}
 */
function pick(list, rng) {
	return list[Math.floor(rng() * list.length)]
}

/**
 * Greedy one-ply hunter: wins at once when it can, otherwise raises the enemy king danger (endgames only).
 *
 * @param {object} s state
 * @param {object[]} moves legal moves
 * @param {function(): number} rng rng
 * @return {object}
 */
function hunter(s, moves, rng) {
	const me = s.turn
	const them = me === 'w' ? 'b' : 'w'
	let best = null
	let bestScore = -Infinity
	for (const m of moves) {
		let score = rng() * 0.5
		for (const o of E.getOutcomes(s, m)) {
			const p = o.weight / T
			const res = o.state.result
			if (res !== null && res.result !== '1/2-1/2') {
				score += p * 100
			} else if (res !== null) {
				score -= p * 5
			} else {
				score += p * (E.kingDanger(o.state, them) / T * 10 - E.kingDanger(o.state, me) / T * 8)
				score += p * (s.captured.length < o.state.captured.length ? 3 : 0)
			}
		}
		if (score > bestScore) {
			bestScore = score
			best = m
		}
	}
	return best
}

/**
 * Choose a move by policy.
 *
 * @param {string} policy policy name
 * @param {object} s state
 * @param {object[]} moves legal moves
 * @param {function(): number} rng rng
 * @return {object}
 */
function choose(policy, s, moves, rng) {
	const r = rng()
	switch (policy) {
		case 'quantum': {
			const q = moves.filter((m) => m.resolution !== 'certain')
			return r < 0.65 && q.length > 0 ? pick(q, rng) : pick(moves, rng)
		}
		case 'aggressive': {
			const c = moves.filter((m) => m.capture)
			return r < 0.75 && c.length > 0 ? pick(c, rng) : pick(moves, rng)
		}
		case 'merge': {
			const c = moves.filter((m) => m.type === 'merge' || m.type === 'measure')
			const q = moves.filter((m) => m.type === 'split')
			if (r < 0.45 && c.length > 0) {
				return pick(c, rng)
			}
			return r < 0.75 && q.length > 0 ? pick(q, rng) : pick(moves, rng)
		}
		case 'pawns': {
			const p = moves.filter((m) => m.type === 'standard' && s.types[m.piece] === 'p')
			return r < 0.7 && p.length > 0 ? pick(p, rng) : pick(moves, rng)
		}
		case 'hunter':
			return r < 0.9 ? hunter(s, moves, rng) : pick(moves, rng)
		case 'shuffle': {
		// Reversible moves only, preferring ones that recreate a position already seen.
			const rev = moves.filter((m) => m.resolution === 'certain' && !m.capture && m.type === 'standard' && s.types[m.piece] !== 'p')
			const seen = new Set(s.history)
			const back = rev.filter((m) => seen.has(E.positionHash(E.applyForSearch(s, m))))
			if (back.length > 0 && r < 0.8) {
				return pick(back, rng)
			}
			return rev.length > 0 ? pick(rev, rng) : pick(moves, rng)
		}
		case 'fifty': {
		// No captures, no pawn moves, never a repeated position: the 50-move rule ends the game.
			const seen = new Set(s.history)
			const ok = moves.filter((m) => m.resolution === 'certain' && !m.capture && s.types[m.piece] !== 'p' && m.type === 'standard'
				&& !seen.has(E.positionHash(E.applyForSearch(s, m))))
			return ok.length > 0 ? pick(ok, rng) : pick(moves, rng)
		}
		default:
			return pick(moves, rng)
	}
}

// ---------------------------------------------------------------------------------------------------------------
// whyIllegal cases
// ---------------------------------------------------------------------------------------------------------------

const whyCases = []

/**
 * Record a whyIllegal case.
 *
 * @param {string} name label
 * @param {object} state state
 * @param {string|object} input move input
 */
function why(name, state, input) {
	const expect = E.whyIllegal(state, input)
	whyCases.push({ name, state: json(state), input, expect })
	reasonsSeen.add(expect ?? 'legal')
	cover.whyIllegalCases++
}

/**
 * Random move inputs for a state (strings and objects, legal and illegal).
 *
 * @param {object} s state
 * @param {function(): number} rng rng
 * @param {number} n how many
 * @return {Array<string|object>}
 */
function randomInputs(s, rng, n) {
	const out = []
	const own = E.squareView(s).map((x, i) => (x !== null && x.color === s.turn ? i : -1)).filter((i) => i >= 0)
	const legal = E.generateMoves(s)
	const sq = () => Math.floor(rng() * 64)
	const from = () => (own.length > 0 && rng() < 0.8 ? pick(own, rng) : sq())
	for (let i = 0; i < n; i++) {
		const k = Math.floor(rng() * 8)
		if (k === 0 && legal.length > 0) {
			out.push(pick(legal, rng).code)
		} else if (k === 1) {
			out.push({ type: 'standard', from: [from()], to: [sq()] })
		} else if (k === 2) {
			out.push({ type: 'split', from: [from()], to: [sq(), sq()] })
		} else if (k === 3) {
			out.push({ type: 'merge', from: [from(), from()], to: [sq()] })
		} else if (k === 4) {
			out.push({ type: 'measure', from: [from()], to: [] })
		} else if (k === 5) {
			const f = from()
			out.push(pick(['K', 'Q', 'R', 'B', 'N', ''], rng) + E.squareName(f) + '-' + E.squareName(sq()))
		} else if (k === 6) {
			out.push({ type: 'standard', from: [from()], to: [sq()], promo: pick(['q', 'r', 'b', 'n', 'k'], rng) })
		} else {
			out.push(pick(['O-O', 'O-O-O', 'measure a1', '?' + E.squareName(from()), 'x', E.squareName(from()) + E.squareName(sq())], rng))
		}
	}
	return out
}

/**
 * Look for split candidates that fail with location_cap or budget_full (targeted, only when plausible).
 *
 * @param {object} s state
 */
function probeCaps(s) {
	const locs = E.pieceLocations(s)
	const mine = s.turn === 'w' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] : [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]
	for (const id of mine) {
		if (locs[id].length === 0 || !'qrbn'.includes(s.types[id])) {
			continue
		}
		const wantCap = locs[id].length >= 3
		const wantBudget = E.budget(s, s.turn) >= 5
		if (!wantCap && !wantBudget) {
			continue
		}
		const f = locs[id][0].square
		for (let a = 0; a < 64; a++) {
			for (let b = a + 1; b < 64; b++) {
				const input = { type: 'split', from: [f], to: [a, b] }
				const r = E.whyIllegal(s, input)
				if ((r === 'location_cap' && wantCap) || (r === 'budget_full' && wantBudget)) {
					if (r === 'location_cap') {
						cover.locationCap++
					}
					why('probe ' + r, s, input)
					return
				}
			}
		}
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Random games
// ---------------------------------------------------------------------------------------------------------------

/**
 * Play one seeded game.
 *
 * @param {object} spec {name, seed, policy, maxPlies, setup?, start?, forcedEvery?}
 * @return {object} game fixture
 */
function playGame(spec) {
	const rng = E.seededRng(spec.seed)
	let s = spec.start ?? (spec.setup ? E.setupPosition(spec.setup) : E.initialState())
	const game = { v: 1, name: spec.name, seed: spec.seed, setup: spec.setup ?? null, start: json(s), steps: [] }
	for (let p = 0; p < spec.maxPlies && s.result === null; p++) {
		const moves = E.generateMoves(s)
		const m = choose(spec.policy, s, moves, rng)
		const u = Math.floor(rng() * T)
		const forced = m.resolution === 'rolled' && spec.forcedEvery && rng() < spec.forcedEvery
		const choice = forced ? { outcome: m.outcomes[Math.floor(rng() * m.outcomes.length)].key } : { u }
		if (p % 7 === 3) {
			for (const input of randomInputs(s, rng, 2)) {
				why(spec.name + ' ply ' + p, s, input)
			}
			probeCaps(s)
		}
		const r = step(s, m, choice)
		game.steps.push(r.entry)
		s = r.state
	}
	return game
}

const RANDOM_GAMES = []
const policies = ['uniform', 'quantum', 'aggressive', 'merge', 'pawns']
for (let i = 0; i < 25; i++) {
	RANDOM_GAMES.push({ name: 'start-' + policies[i % 5] + '-' + i, seed: 1000 + i, policy: policies[i % 5], maxPlies: 70, forcedEvery: 0.05 })
}
const MIDGAMES = [
	['r3k2r/pppq1ppp/2n2n2/3pp3/3PP3/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 1', []],
	['r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1', ['f3-g5|h4']],
	['4k3/1P3pp1/8/3pP3/8/8/5PP1/4K3 w - d6 0 1', []],
	['r3k3/1P6/8/8/8/8/6p1/4K2R w Kq - 0 1', []],
	['3qk3/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1-d4|h5', 'd8-a5|d5']],
	['2r1k3/pp3ppp/8/8/8/8/PP3PPP/2R1K3 w - - 0 1', []],
]
MIDGAMES.forEach(([fen, prelude], i) => {
	for (let k = 0; k < 2; k++) {
		RANDOM_GAMES.push({ name: 'setup-' + i + '-' + k, seed: 2000 + i * 10 + k, policy: k === 0 ? 'quantum' : 'aggressive', maxPlies: 60, setup: { fen, prelude }, forcedEvery: 0.05 })
	}
})
const ENDGAMES = [
	'6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1',
	'7k/8/5K2/8/8/8/8/1R6 w - - 0 1',
	'k7/8/1K6/8/8/8/8/7Q w - - 0 1',
	'4k3/8/8/3n4/4K3/8/8/8 w - - 0 1',
	'8/8/4k3/8/2N5/4K3/8/8 w - - 0 1',
	'3k4/8/3K4/8/8/8/8/6R1 w - - 0 1',
	'6rk/6pp/8/8/8/8/6PP/5RK1 w - - 0 1',
	'4k3/4p3/8/8/8/8/4P3/R3K2R w KQ - 0 1',
]
ENDGAMES.forEach((fen, i) => {
	RANDOM_GAMES.push({ name: 'endgame-hunter-' + i, seed: 3000 + i, policy: 'hunter', maxPlies: 60, setup: { fen, prelude: [] } })
	RANDOM_GAMES.push({ name: 'endgame-quantum-' + i, seed: 3100 + i, policy: 'quantum', maxPlies: 40, setup: { fen, prelude: [] }, forcedEvery: 0.1 })
})
RANDOM_GAMES.push({ name: 'shuffle-repetition', seed: 4001, policy: 'shuffle', maxPlies: 60, setup: { fen: '4k3/8/8/8/8/8/8/1N2K3 w - - 0 1', prelude: [] } })
RANDOM_GAMES.push({ name: 'shuffle-repetition-quantum', seed: 4002, policy: 'shuffle', maxPlies: 60, setup: { fen: '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', prelude: ['g1-f3|h3'] } })
RANDOM_GAMES.push({ name: 'fifty-moves', seed: 4003, policy: 'fifty', maxPlies: 150, setup: { fen: '4k3/8/8/8/8/8/8/1N2K1N1 w - - 0 1', prelude: [] } })
RANDOM_GAMES.push({ name: 'bare-kings', seed: 4004, policy: 'aggressive', maxPlies: 40, setup: { fen: '8/8/8/8/3k4/8/2n5/4K3 w - - 0 1', prelude: [] } })
RANDOM_GAMES.push({ name: 'max-ply', seed: 4005, policy: 'shuffle', maxPlies: 30, start: withFields(E.setupPosition({ fen: '4k3/8/8/8/8/8/8/1N2K3 w - - 0 1' }), { ply: 1190 }) })
RANDOM_GAMES.push({
	name: 'weight-one-worlds',
	seed: 4006,
	policy: 'quantum',
	maxPlies: 40,
	start: craft([
		[{ e1: 'A', a1: 'C', g1: 'H', e8: 'a', a2: 'g', b8: 'h' }, T - 1],
		[{ e1: 'A', a1: 'C', g1: 'H', e8: 'a', h5: 'g', b8: 'h' }, 1],
	]),
	forcedEvery: 0.1,
})

// ---------------------------------------------------------------------------------------------------------------
// Scripted examples (W1–W17, §11 edge cases)
// ---------------------------------------------------------------------------------------------------------------

/**
 * Play a scripted example. Moves are codes; `code@u=N` rolls with u, `code@key` forces an outcome.
 *
 * @param {string} name label
 * @param {{setup?: object, start?: object}} from setup spec or crafted start
 * @param {string[]} moves scripted moves
 * @return {object}
 */
function scripted(name, from, moves) {
	let s = from.start ?? E.setupPosition(from.setup)
	const game = { v: 1, name, seed: null, setup: from.setup ?? null, start: json(s), steps: [] }
	for (const item of moves) {
		const [code, arg] = item.split('@')
		const m = E.findMove(s, code)
		if (m === null) {
			throw new Error(name + ': illegal scripted move ' + code + ' (' + E.whyIllegal(s, code) + ')')
		}
		let choice = {}
		if (m.resolution === 'rolled') {
			if (arg === undefined) {
				throw new Error(name + ': rolled move ' + code + ' needs @u=… or @key')
			}
			choice = arg.startsWith('u=') ? { u: Number(arg.slice(2)) } : { outcome: arg }
		}
		const r = step(s, m, choice)
		game.steps.push(r.entry)
		s = r.state
	}
	return game
}

const setup = (fen, prelude = []) => ({ setup: { fen, prelude } })

const EXAMPLES = [
	scripted('W1 split, pawn, merge', { start: E.initialState() }, ['g1-f3|h3', 'e7-e5', 'f3|h3-g1']),
	scripted('W2 capture branch', setup('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6']), ['c1-h6@u=8388608']),
	scripted('W2 move branch', setup('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6']), ['c1-h6@u=5033164']),
	scripted('W2 boundary u = 8388607', setup('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6']), ['c1-h6@u=8388607']),
	scripted('W2 blocked lane variant', setup('4k3/8/8/8/6n1/8/8/2B1K3 w - - 0 1', ['g4-e3|h6']), ['c1-h6@u=100']),
	scripted('W3 miss', setup('4k3/8/3b4/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3', 'd6-c7|e5']), ['f3-e5@u=8388607']),
	scripted('W3 move', setup('4k3/8/3b4/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3', 'd6-c7|e5']), ['f3-e5@u=12582911']),
	scripted('W3 capture', setup('4k3/8/3b4/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3', 'd6-c7|e5']), ['f3-e5@u=12582912']),
	scripted('W4 link and measure a4', setup('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), ['b6-a4|c4', 'a1-a8', '?c4@u=3']),
	scripted('W4 measure c4', setup('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), ['b6-a4|c4', 'a1-a8', '?a4@u=9000000']),
	scripted('W5 partly blocked split', setup('4k3/8/8/8/8/6n1/8/1K1R4 b - - 0 1'), ['g3-f1|h5', 'd1-h1|d5']),
	scripted('W6 converging capture', setup('7k/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1-d4|h5']), ['d4|h5-h8']),
	scripted('W6 half shot misses', setup('7k/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1-d4|h5']), ['h5-h8@u=100']),
	scripted('W7 rescale after a miss', setup('4k1n1/8/8/8/8/3P4/8/4K3 b - - 0 1'), ['g8-f6|h6', 'e1-e2', 'f6-d5|e4', 'd3-e4@u=3000000']),
	scripted('W7 capture', setup('4k1n1/8/8/8/8/3P4/8/4K3 b - - 0 1'), ['g8-f6|h6', 'e1-e2', 'f6-d5|e4', 'd3-e4@u=13000000']),
	scripted('W8 budget fallback', setup('4k3/8/6n1/8/8/8/8/1NBQK2R w - - 0 1', ['b1-a3|c3', 'c1-d2|e3', 'd1-b3|a4', 'g6-f4|h4']), ['h1-h8@u=9000000']),
	scripted('W9 probe misses', setup('4k3/8/8/8/3p2n1/8/4P3/4K3 w - - 0 1', ['g4-e3|h6']), ['e2-e4@u=1']),
	scripted('W9 double push and en passant', setup('4k3/8/8/8/3p2n1/8/4P3/4K3 w - - 0 1', ['g4-e3|h6']), ['e2-e4@u=16000000', 'd4-e3']),
	scripted('W10 castling rights follow the state', setup('4k3/8/8/8/8/8/8/4K2R w K - 0 1'), ['h1-h3|h5', 'e8-d8', 'h3|h5-h1']),
	scripted('W10 missed king step keeps the right', setup('4k3/8/8/8/8/8/8/4K1NR w K - 0 1', ['g1-e2|f3']), ['e1-e2@miss', 'e8-d8', 'e1-g1']),
	scripted('W12 index order', setup('4k1n1/8/8/8/7R/3P4/8/4K3 w - - 0 1', ['g8-f6|h6', 'f6-d5|e4', 'd3-e4@miss']), ['h4-a4|h3', 'e8-d8', '?h3@u=0']),
	scripted('W12 u = 8388608', setup('4k1n1/8/8/8/7R/3P4/8/4K3 w - - 0 1', ['g8-f6|h6', 'f6-d5|e4', 'd3-e4@miss']), ['h4-h3|a4', 'e8-d8', '?a4@u=8388608']),
	scripted('W12 u = 8388609', setup('4k1n1/8/8/8/7R/3P4/8/4K3 w - - 0 1', ['g8-f6|h6', 'f6-d5|e4', 'd3-e4@miss']), ['h4-h3|a4', 'e8-d8', '?h3@u=8388609']),
	scripted('W13 budget_full position', setup('4k3/8/8/8/8/6n1/8/KNBR4 w - - 0 1', ['g3-f1|h5', 'b1-a3|c3', 'c1-b2|e3']), ['d1-d2']),
	scripted('W14 trapped king', setup('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1'), ['a1-a8']),
	scripted('W14 knight blocks', setup('6k1/3n1ppp/8/8/8/8/8/R3K3 w - - 0 1'), ['a1-a8', 'd7-b8']),
	scripted('W15 no ep wrap', setup('4k3/8/8/p7/8/8/7P/4K3 w - - 0 1'), ['h2-h4']),
	scripted('W15 mirror', setup('4k3/p7/8/8/7P/8/8/4K3 b - - 0 1'), ['a7-a5']),
	scripted('W16 bare kings adjacent', setup('8/8/4k3/3n4/4K3/8/8/8 w - - 0 1'), ['e4-d5', 'e6-d5']),
	scripted('W17 two queens', setup('4k3/8/8/8/8/8/8/2QQK3 w - - 0 1'), ['c1-c8']),
	scripted('W17 ghost and ep', setup('4k3/8/8/8/3pP3/8/8/4K1N1 b - e3 0 1', ['g1-f3|h3']), ['d4-e3']),
	scripted('E2 certain capture', setup('4k3/8/8/7n/8/8/8/4K2R w - - 0 1'), ['h1-h5']),
	scripted('E5 capture through a ghost blocker', setup('r3k3/8/1n6/8/8/8/8/R3K3 w - - 0 1', ['b6-a4|c4']), ['a1-a8@capture']),
	scripted('E5 miss', setup('r3k3/8/1n6/8/8/8/8/R3K3 w - - 0 1', ['b6-a4|c4']), ['a1-a8@miss']),
	scripted('E9 own ghost on target', setup('4k3/8/8/8/8/8/8/RN2K3 w - - 0 1', ['b1-a3|c3']), ['a1-a3@u=1', 'e8-e7', 'a1-a2']),
	scripted('E11 part onto part', setup('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', ['a1-a3|a5']), ['a3-a5']),
	scripted('E12 enemy only where X is absent', setup('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), ['b6-a4|c4', 'a1-a8', 'e8-d8', 'a8-a4@u=12000000']),
	scripted('E15 a piece never blocks itself', setup('4k3/8/8/8/8/R7/8/4K3 w - - 0 1', ['a3-a1|a4']), ['a1-a8']),
	scripted('E20 location cap reached', setup('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1'), ['g1-f3|h3', 'e8-d8', 'f3-e5|g5', 'd8-e8', 'h3-f2|f4', 'e8-d8']),
	scripted('E22 weight-1 branching world', {
		start: craft([
			[{ e1: 'A', a1: 'C', e8: 'a', a2: 'g' }, T - 1],
			[{ e1: 'A', a1: 'C', e8: 'a', h5: 'g' }, 1],
		]),
	}, ['a1-b1|a3', 'h5-f6', 'b1-b8@capture']),
	scripted('E24 split along the lane', setup('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'), ['a1-a3|a5']),
	scripted('E27 merge with a third part', setup('4k1n1/8/8/8/8/3P4/8/4K3 b - - 0 1'), ['g8-f6|h6', 'e1-e2', 'f6-d5|e4', 'e2-e1', 'd5|e4-f6']),
	scripted('E32 converging capture that may miss', {
		start: craft([
			[{ e1: 'A', h8: 'a', d4: 'B' }, T / 4],
			[{ e1: 'A', h8: 'a', h5: 'B' }, T / 4],
			[{ e1: 'A', h8: 'a', a1: 'B' }, T / 2],
		]),
	}, ['d4|h5-h8@u=8388607', 'h8-g8', 'a1-h8']),
	scripted('E33 weight gathers on the third part', {
		start: craft([
			[{ e1: 'A', e8: 'a', a1: 'C' }, T / 4],
			[{ e1: 'A', e8: 'a', a3: 'C' }, T / 2],
			[{ e1: 'A', e8: 'a', a5: 'C' }, T / 4],
		]),
	}, ['a1|a5-a3']),
	scripted('E34 merge lane passes the other part', setup('4k3/8/8/8/8/8/R7/4K3 w - - 0 1', ['a2-a1|a3']), ['a1|a3-a5']),
	scripted('E37 pawn probe', setup('4k3/8/8/8/6n1/8/4P3/4K3 w - - 0 1', ['g4-e3|h6']), ['e2-e3@miss', 'e3-g4', 'e2-e3']),
	scripted('E44 promotion probe', setup('7k/4P1n1/8/8/8/8/8/K7 w - - 0 1', ['g7-e8|f5']), ['e7-e8=N@miss', 'e8-d6', 'e7-e8=Q']),
	scripted('E45 promotion captures the king', setup('3k4/4P3/8/8/8/8/8/K7 w - - 0 1'), ['e7-d8=R']),
	scripted('E46 king bumps into its own ghost', setup('4k3/8/8/8/8/8/8/4K1NR w K - 0 1', ['g1-e2|f3']), ['e1-e2@u=16000000']),
	scripted('E47 king onto an enemy ghost', setup('4k3/8/8/8/8/5n2/8/4K3 w - - 0 1', ['f3-d2|h2']), ['e1-d2@capture']),
	scripted('E51 castling through attack', setup('4kr2/8/8/8/8/8/8/R3K2R w KQ - 0 1'), ['e1-g1', 'e8-d8']),
	scripted('E51 long castling', setup('r3k3/8/8/8/8/8/8/R3K3 b Qq - 0 1'), ['e8-c8', 'e1-c1']),
	scripted('E53 castling rook captured', setup('4k3/8/8/8/8/8/1b6/R3K3 b Q - 0 1'), ['b2-a1']),
	scripted('E56 move only in a weight-1 world', {
		start: craft([
			[{ e1: 'A', e8: 'a', f3: 'H' }, 1],
			[{ e1: 'A', e8: 'a', h3: 'H' }, T - 1],
		]),
	}, ['f3-e5', 'e8-d8', '?e5@u=0']),
	scripted('E57 bare kings', setup('4k3/8/8/8/8/8/3n4/4K3 w - - 0 1'), ['e1-d2']),
	scripted('E58 king capture on ply 1200', { start: withFields(E.setupPosition({ fen: '8/8/8/8/8/8/3k4/4K3 w - - 0 1' }), { ply: 1199 }) }, ['e1-d2']),
	scripted('E59 split/merge repetition', { start: E.initialState() }, ['g1-f3|h3', 'b8-a6|c6', 'f3|h3-g1', 'a6|c6-b8', 'g1-f3|h3', 'b8-a6|c6', 'f3|h3-g1', 'a6|c6-b8']),
	scripted('E60 no legal move', setup('8/8/8/8/8/8/pp1p4/krb1K3 w - - 0 1'), ['e1-d1']),
	scripted('E80 25% king shot', setup('k7/8/8/8/8/8/8/R3K3 w - - 0 1', ['a1-a3|b1', 'a3-a4|c3']), ['a4-a8@u=100', 'a8-b8', 'e1-f1']),
	scripted('E83 fifty moves suspended', setup('8/8/8/8/8/8/3k4/4K2R w - - 99 1'), ['h1-h2', 'd2-e1']),
	scripted('E83 fifty moves', setup('8/8/8/8/k7/8/8/4K2R w - - 99 1'), ['h1-h2']),
	scripted('E83 repetition suspended', setup('4r2k/8/8/8/8/8/8/1N2K3 b - - 0 1'), ['h8-g8', 'b1-c3', 'g8-h8', 'c3-b1', 'h8-g8', 'b1-c3', 'g8-h8', 'c3-b1', 'h8-g8']),
	scripted('E85 a possible king capture escapes', setup('6k1/5ppp/8/6n1/8/8/8/R3K3 w - - 0 1', ['g5-f3|h3']), ['a1-a8', 'f3-e1@u=16000000']),
	scripted('E85 a certain king capture escapes', setup('rr6/7k/8/8/8/8/8/K6R b - - 0 1'), ['h7-h8', 'h1-h8']),
	scripted('E86 trapping move at ply 1199', { start: withFields(E.setupPosition({ fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1' }), { ply: 1198 }) }, ['a1-a8', 'g8-f8']),
]

// ---------------------------------------------------------------------------------------------------------------
// whyIllegal: every code, hand-picked
// ---------------------------------------------------------------------------------------------------------------

const START = E.initialState()
const W2 = E.setupPosition({ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['g8-f6|h6'] })
const DONE = E.applyMove(E.setupPosition({ fen: '8/8/8/8/8/8/3k4/4K3 w - - 0 1' }), 'e1-d2').state
const handWhy = [
	['game_over', DONE, 'e8-e7'],
	['game_over beats malformed objects', DONE, { type: 'bogus' }],
	['unparsable string is malformed even when the game is over', DONE, 'zz'],
	['malformed type', START, { type: 'castle', from: [4], to: [6] }],
	['malformed lengths', START, { type: 'standard', from: [12], to: [] }],
	['malformed square', START, { type: 'standard', from: [12], to: [64] }],
	['malformed float', START, { type: 'standard', from: [12.5], to: [28] }],
	['malformed pair', START, { type: 'split', from: [6], to: [21, 21] }],
	['malformed pair string', START, 'g1-f3|f3'],
	['malformed promo', START, { type: 'standard', from: [12], to: [28], promo: 'k' }],
	['malformed upper-case promo', START, { type: 'standard', from: [12], to: [28], promo: 'Q' }],
	['promo on a split', START, { type: 'split', from: [6], to: [21, 23], promo: 'q' }],
	['promo on a merge', START, { type: 'merge', from: [21, 23], to: [6], promo: 'q' }],
	['promo on a measure', START, { type: 'measure', from: [6], to: [], promo: 'q' }],
	['null promo is absent', START, { type: 'standard', from: [12], to: [28], promo: null }],
	['no_piece', START, 'e4-e5'],
	['measure of an empty square', START, '?e4'],
	['not_your_piece', START, 'e7-e5'],
	['castling by the side not to move', START, { type: 'standard', from: [60], to: [62] }],
	['piece_mismatch', W2, 'Nc1-h6'],
	['piece letter matches', W2, 'Bc1xh6 {capture 50%}'],
	['pawn with a letter', START, 'Ke2-e4'],
	['merge_mismatch', START, 'b1|g1-e2'],
	['merge of a king', START, 'e1|e2-e3'],
	['cannot_split king', START, 'e1-d1|f1'],
	['cannot_split pawn', START, 'e2-e3|e4'],
	['not_superposed', START, '?e1'],
	['castle_no_right', E.setupPosition({ fen: '4k3/8/8/8/8/8/8/R3K2R w Q - 0 1' }), 'O-O'],
	['castle_blocked', E.setupPosition({ fen: '4k3/8/8/8/8/6n1/8/4K2R w K - 0 1', prelude: ['g3-f1|h5'] }), 'e1-g1'],
	['castling with promo', E.setupPosition({ fen: '4k3/8/8/8/8/8/8/R3K3 w Q - 0 1' }), { type: 'standard', from: [4], to: [2], promo: 'q' }],
	['castling marker with a rook on e1', E.setupPosition({ fen: '4k3/8/8/8/8/8/8/K3R3 w - - 0 1' }), 'O-O'],
	['black king on e1 is not castling', E.setupPosition({ fen: '8/8/8/8/8/8/8/4k2K b - - 0 1' }), 'e1-g1'],
	['unreachable knight', START, 'g1-g3'],
	['unreachable pawn', START, 'e2-e5'],
	['unreachable pawn backwards', START, 'e2-e1'],
	['unreachable split', START, 'b1-a3|b3'],
	['unreachable merge', E.setupPosition({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', prelude: ['a1-a3|c1'] }), 'a3|c1-a3'],
	['promotion_required', E.setupPosition({ fen: '7k/4P3/8/8/8/8/8/K7 w - - 0 1' }), 'e7-e8'],
	['promotion_invalid', START, 'e2-e4=Q'],
	['nothing_to_capture', START, 'e2-f3'],
	['nothing_to_capture own piece', E.setupPosition({ fen: '4k3/8/8/8/8/3N4/4P3/4K3 w - - 0 1' }), 'e2-d3'],
	['blocked slider', START, 'c1-e3'],
	['blocked pawn push', E.setupPosition({ fen: '4k3/8/8/8/8/4n3/4P3/4K3 w - - 0 1' }), 'e2-e4'],
	['own_piece', START, 'g1-e2'],
	['own_piece king', START, 'e1-e2'],
	['split_target_occupied', START, 'g1-e2|f3'],
	['split_target_occupied by itself', E.setupPosition({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', prelude: ['a1-a3|a5'] }), 'a3-b3|a5'],
	['split_blocked', E.setupPosition({ fen: '4k3/8/8/8/8/8/P7/R3K3 w - - 0 1' }), 'a1-b1|a3'],
	['split_blocked alternating', E.setupPosition({ fen: '4k3/8/8/8/8/2n5/8/R3K3 w - - 0 1', prelude: ['c3-a4|b1'] }), 'a1-a5|c1'],
	['location_cap', E.setupPosition({ fen: '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', prelude: ['g1-f3|h3', 'e8-d8', 'f3-e5|g5', 'd8-e8', 'h3-f2|f4', 'e8-d8'] }), 'e5-c4|c6'],
	['budget_full W13', E.setupPosition({ fen: '4k3/8/8/8/8/6n1/8/KNBR4 w - - 0 1', prelude: ['g3-f1|h5', 'b1-a3|c3', 'c1-b2|e3'] }), 'd1-h1|d5'],
	['merge_target_own', E.setupPosition({ fen: '4k3/8/8/8/8/2P5/8/R3K3 w - - 0 1', prelude: ['a1-a3|c1'] }), 'a3|c1-c3'],
	['merge_part_stuck', E.setupPosition({ fen: '4k3/8/8/8/8/1P6/8/R3K3 w - - 0 1', prelude: ['a1-a3|c1'] }), 'a3|c1-c3'],
	['legal rolled', W2, 'c1-h6'],
	['legal measure by any part', E.setupPosition({ fen: '4k3/8/8/8/8/8/8/R3K3 w - - 0 1', prelude: ['a1-a3|a5'] }), '?a5'],
	['legal lenient', START, '  G1-F3,H3 '],
]
for (const [name, state, input] of handWhy) {
	why(name, state, input)
}

// ---------------------------------------------------------------------------------------------------------------
// Parser fixtures
// ---------------------------------------------------------------------------------------------------------------

const PARSER_INPUTS = [
	'Qd4|h5xh8 #',
	'?Na4 {c4 50%}',
	'Nf3xe5 {capture 25%} #',
	'Bc1xh6 {capture 50%}',
	'g1-h3|f3',
	'g1f3/h3',
	'G1-F3,H3',
	'h3/f3g1',
	'E2E4',
	'e2:e4',
	'  e2-e4+ \t',
	'\r\ne2-e4+\n',
	'e7e8q',
	'e7-e8=Q',
	'e7-e8=q!?',
	'measure A4',
	'?a4',
	'o-o-o',
	'0-0-0',
	'O-O',
	'O-o-0+',
	'B1-c3',
	'Bb1-c3',
	'e2xe4',
	'e2Xe4',
	'Ke1-g1',
	'MeAsUrE\t \ta4',
	'e2-e4 {anything',
	'g1-f3|f3',
	'N?a4',
	'e2 e4',
	'e2-e4-e5',
	'Pe2-e4',
	'e9-e4',
	'',
	'   ',
	'{e2-e4}',
	'e2-',
	'e2-e4=',
	'e2-e4=K',
	'measure',
	'measurea4',
	'?',
	'??a4',
	'O-O-O-O',
	'O--O',
	'K?a4',
	'ke1-e2',
	'e2|e4',
	'e2-e4|e5|e6',
	'g1-f3|h3=Q',
	'e2–e4',
	'e2 e4',
	'i2-i4',
	'Bc1-h6 {move 50%}',
	'd3-e4 {miss 75%}',
	'Ng1-f3|h3',
	'Ra1-a8 #',
	'O-O #',
	'e7xd8=Q #',
	'Nf3|h3-g1',
	'?Nh3 {h3 50%}',
]
const parserSet = new Set()
const parserCases = []
/**
 * Add a parser case once.
 *
 * @param {string} input text
 */
function parserCase(input) {
	if (!parserSet.has(input)) {
		parserSet.add(input)
		parserCases.push({ input, expect: E.parseMoveCode(input) })
	}
}
PARSER_INPUTS.forEach(parserCase)

// ---------------------------------------------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------------------------------------------

const games = RANDOM_GAMES.map(playGame)

// Every notation string of the scripted examples and a sample of the games must parse back.
for (const g of [...EXAMPLES, ...games]) {
	g.steps.forEach((st, i) => {
		if (i % 5 === 0 || g.seed === null) {
			parserCase(st.notation)
		}
	})
}

// Views: interesting states from the examples and a sample of game states.
const viewStates = []
for (const g of EXAMPLES) {
	viewStates.push(g.start, g.steps[g.steps.length - 1].after)
}
games.forEach((g, i) => {
	if (i % 3 === 0 && g.steps.length > 10) {
		viewStates.push(g.steps[Math.floor(g.steps.length / 2)].after)
	}
})
const views = [...new Set(viewStates)].slice(0, 110).map((text) => {
	const s = JSON.parse(text)
	const moveRisk = {}
	for (const m of E.generateMoves(s)) {
		moveRisk[m.code] = E.moveRisk(s, m.code)
	}
	return {
		state: text,
		kingDanger: { w: E.kingDanger(s, 'w'), b: E.kingDanger(s, 'b') },
		budget: { w: E.budget(s, 'w'), b: E.budget(s, 'b') },
		worlds: E.worldCount(s),
		links: E.links(s),
		linkGroups: E.linkGroups(s),
		kingTrapped: E.kingTrapped(s),
		squareView: E.squareView(s),
		moveRisk,
	}
})

// Records: chain, roll display, roll memo, support keys, certainFen, sha256.
const chains = []
{
	const w2 = E.setupPosition({ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['g8-f6|h6'] })
	const chain0 = E.chainStart(42, 'alice', 'bob', 1790000000)
	const r = E.applyMove(w2, 'c1-h6', { u: 8388608 })
	const after = json(r.state)
	chains.push({
		gameId: 42,
		whiteUid: 'alice',
		blackUid: 'bob',
		createdAt: 1790000000,
		start: json(w2),
		chain0,
		moves: [{ ply: 0, code: 'c1-h6', u: 8388608, key: 'capture', after, afterSha256: E.sha256hex(after), chain: E.chainNext(chain0, 0, 'c1-h6', 8388608, 'capture', after) }],
	})
	for (const [gi, g] of games.slice(0, 3).entries()) {
		const gameId = 1000 + gi
		const whiteUid = gi === 1 ? 'Élodie Dupont' : 'user' + gi
		const blackUid = gi === 2 ? 'ユーザー' : 'opponent@example.com'
		const createdAt = 1790000000 + gi * 86400
		let prev = E.chainStart(gameId, whiteUid, blackUid, createdAt)
		const entry = { gameId, whiteUid, blackUid, createdAt, start: g.start, chain0: prev, moves: [] }
		g.steps.slice(0, 12).forEach((st, i) => {
			const u = st.measurement === null ? null : st.measurement.u
			const key = st.measurement === null ? null : st.measurement.key
			const chain = E.chainNext(prev, JSON.parse(g.start).ply + i, st.code, u, key, st.after)
			entry.moves.push({ ply: JSON.parse(g.start).ply + i, code: st.code, u, key, after: st.after, afterSha256: E.sha256hex(st.after), chain })
			prev = chain
		})
		chains.push(entry)
	}
}
const rollRecords = [
	{ key: 'move', u: 6227703, outcomes: [{ key: 'move', weight: 8388608 }, { key: 'capture', weight: 8388608 }] },
	{ key: 'move', u: 8388607, outcomes: [{ key: 'move', weight: 8388608 }, { key: 'capture', weight: 8388608 }] },
	{ key: 'move', u: 10368000, outcomes: [{ key: 'miss', weight: 8388608 }, { key: 'move', weight: 4194304 }, { key: 'capture', weight: 4194304 }] },
	{ key: 'miss', u: 11184810, outcomes: [{ key: 'miss', weight: 11184811 }, { key: 'capture', weight: 5592405 }] },
	{ key: 'capture', u: 11184811, outcomes: [{ key: 'miss', weight: 11184811 }, { key: 'capture', weight: 5592405 }] },
	{ key: 'capture', u: null, outcomes: [{ key: 'move', weight: 8388608 }, { key: 'capture', weight: 8388608 }] },
	{ key: 'c4', u: 9000000, outcomes: [{ key: 'a4', weight: 8388608 }, { key: 'c4', weight: 8388608 }] },
	{ key: 'move', u: 1, outcomes: [{ key: 'miss', weight: 1 }, { key: 'move', weight: T - 1 }] },
]
for (const g of games) {
	for (const st of g.steps) {
		if (st.measurement !== null && rollRecords.length < 60 && (st.measurement.outcomes.length === 3 || rollRecords.length % 4 === 0)) {
			rollRecords.push(st.measurement)
		}
	}
}
const labelsNl = { miss: 'Gemist', move: 'Verzet', capture: 'Geslagen', rolled: 'geworpen', forced: 'geforceerd' }
const recordStates = [START, W2, ...EXAMPLES.map((g) => JSON.parse(g.steps[0].after)), ...games.slice(0, 15).map((g) => JSON.parse(g.steps[Math.min(9, g.steps.length - 1)].after))]
const records = {
	v: 1,
	chain: chains,
	rollDisplay: rollRecords.map((record, i) => ({
		record,
		labels: i % 3 === 2 ? labelsNl : null,
		text: E.rollDisplay(record, i % 3 === 2 ? labelsNl : undefined),
		intervals: E.rollIntervals(record),
	})),
	rollIdentity: [
		{ state: json(W2), code: 'c1-h6', expect: E.rollIdentity(W2, 'c1-h6') },
		...EXAMPLES.slice(0, 20).map((g) => ({ state: g.start, code: g.steps[0].code, expect: E.rollIdentity(JSON.parse(g.start), g.steps[0].code) })),
		{ state: json(E.setupPosition({ fen: '7k/4P1n1/8/8/8/8/8/K7 w - - 0 1', prelude: ['g7-e8|f5'] })), code: 'e7-e8=N', expect: E.rollIdentity(E.setupPosition({ fen: '7k/4P1n1/8/8/8/8/8/K7 w - - 0 1', prelude: ['g7-e8|f5'] }), 'e7-e8=N') },
	],
	supportKey: recordStates.map((s) => ({ state: json(s), key: E.supportKey(s), mirror: E.supportKeyMirror(s) })),
	certainFen: recordStates.map((s) => ({ state: json(s), fen: E.certainFen(s) })),
	sha256: ['', 'abc', 'qchess-chain|v1|42|alice|bob|1790000000', 'Élodie|ユーザー|😀'].map((text) => ({ text, hex: E.sha256hex(text) })),
}

// Setup vectors and errors.
const SETUP_SPECS = [
	{ fen: '4k3/8/8/8/8/8/8/2QQK3 w - - 0 1', prelude: [] },
	{ fen: '4k3/8/8/8/3pP3/8/8/4K1N1 b - e3 0 1', prelude: ['g1-f3|h3'] },
	{ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['g8-f6|h6', 'c1-h6@capture'] },
	{ fen: '4k1n1/8/8/8/7R/3P4/8/4K3 w - - 0 1', prelude: ['g8-f6|h6', 'f6-d5|e4', 'd3-e4@miss'] },
	{ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', prelude: [] },
	{ fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 5 20', prelude: ['h1-h3|h5', 'h3|h5-h1'] },
	{ fen: '8/PPPPPPPP/8/8/8/8/pppppppp/K6k w - - 0 1', prelude: [] },
	{ fen: 'RNBQKBNR/8/8/8/8/8/8/rnbqkbnr w - - 0 1', prelude: [] },
	{ fen: '4k3/8/8/8/8/8/4P3/4K3 w - -', prelude: ['e2-e4'] },
]
const SETUP_ERROR_SPECS = [
	{ fen: '8/8/8/8/8/8/8/4K3 w - - 0 1', prelude: [] },
	{ fen: '4k3/8/8/8/8/8/8/3KK3 w - - 0 1', prelude: [] },
	{ fen: '4k3/8/8/8/8/NNNNNNNN/NNNN4/4K3 w - - 0 1', prelude: [] },
	{ fen: '4k3/8/8/8/8/8/8/4K3 w - - 100 1', prelude: [] },
	{ fen: '4k3/8/8/8/8/8/8/4K2 w - - 0 1', prelude: [] },
	{ fen: '4k3/8/8/8/8/8/8/P3K3 w - - 0 1', prelude: [] },
	{ fen: '4k3/8/8/8/8/8/8/4K3 w - e6 0 1', prelude: [] },
	{ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['nonsense'] },
	{ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['a1-a2'] },
	{ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['c1-c2'] },
	{ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['g8-f6|h6', 'c1-h6'] },
	{ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['g8-f6|h6', 'c1-h6@miss'] },
	{ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['g8-f6|h6@move'] },
	{ fen: '8/8/8/8/8/8/3k4/4K3 w - - 0 1', prelude: ['e1-d2'] },
]
const setupErrors = SETUP_ERROR_SPECS.map((spec) => {
	try {
		E.setupPosition(spec)
	} catch (e) {
		return { spec, expect: e.code, detail: e.code === 'prelude_illegal' ? e.detail : null }
	}
	throw new Error('setup spec did not fail: ' + JSON.stringify(spec))
})

const vectors = {
	v: 1,
	start: { json: E.START_JSON, hash: E.START_HASH },
	rescale: [
		{ weights: [8388608, 4194304], expect: E.rescaleWeights([8388608, 4194304]) },
		{ weights: [1, 1, 1], expect: E.rescaleWeights([1, 1, 1]) },
		{ weights: [5, 3, 7, 1], expect: E.rescaleWeights([5, 3, 7, 1]) },
		{ weights: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], expect: E.rescaleWeights([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) },
		{ weights: [16777215], expect: E.rescaleWeights([16777215]) },
	],
	rToU: [0, 0.3, 0.5, 0.999999999, 0.1, 0.75, 1 / 3].map((r) => ({ r, u: E.uFromRandom(r) })),
	pct: [0, 1, 83886, 83887, 167772, 8388608, 11184811, 5592405, 16609443, 16609444, 16777215, 16777216].map((w) => ({ weight: w, expect: E.pct(w) })),
	moveOrder: { state: json(E.setupPosition({ fen: '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1' })), legal: E.legalCodes(E.setupPosition({ fen: '4k3/8/8/8/8/8/8/4K1N1 w - - 0 1' })) },
	examples: EXAMPLES,
	whyIllegal: whyCases,
	setup: SETUP_SPECS.map((spec) => ({ spec, expect: json(E.setupPosition(spec)) })),
	setupErrors,
}

// ---------------------------------------------------------------------------------------------------------------
// Coverage check
// ---------------------------------------------------------------------------------------------------------------

const missingReasons = E.ILLEGAL_REASONS.filter((r) => r !== 'cannot_merge' && !reasonsSeen.has(r))
const failures = Object.entries(MINIMUM).filter(([k, min]) => (cover[k] ?? 0) < min)
console.log('Coverage over ' + (games.length + EXAMPLES.length) + ' games (' + cover.steps + ' steps):')
for (const [k, v] of Object.entries(cover)) {
	console.log('  ' + k.padEnd(26) + String(v).padStart(6) + (MINIMUM[k] !== undefined ? '   (min ' + MINIMUM[k] + ')' : ''))
}
console.log('  whyIllegal reason codes covered: ' + [...reasonsSeen].filter((r) => r !== 'legal').length + ' of 23 (cannot_merge is always pre-empted by check 6)')
if (failures.length > 0 || missingReasons.length > 0) {
	console.error('Coverage too low: ' + failures.map(([k]) => k).concat(missingReasons).join(', '))
	process.exit(1)
}

// ---------------------------------------------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------------------------------------------

mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) {
	if (f.endsWith('.json')) {
		rmSync(join(OUT, f))
	}
}
const files = { 'vectors.json': vectors, 'parser.json': parserCases, 'views.json': views, 'records.json': records }
let index = 1
let batch = []
let batchSize = 2
function flush() {
	if (batch.length > 0) {
		files['games-' + String(index).padStart(3, '0') + '.json'] = batch
		index++
		batch = []
		batchSize = 2
	}
}
for (const g of games) {
	const size = JSON.stringify(g).length + 2
	if (batch.length === 20 || (batch.length > 0 && batchSize + size > FILE_TARGET)) {
		flush()
	}
	batch.push(g)
	batchSize += size
}
flush()

let total = 0
for (const [name, data] of Object.entries(files)) {
	const text = JSON.stringify(data) + '\n'
	const bytes = Buffer.byteLength(text)
	if (bytes > MAX_FILE) {
		console.error(name + ' is ' + bytes + ' bytes, more than 2 MB')
		process.exit(1)
	}
	total += bytes
	writeFileSync(join(OUT, name), text)
	console.log('wrote ' + name.padEnd(16) + String(bytes).padStart(9) + ' bytes')
}
if (total > MAX_TOTAL) {
	console.error('fixtures total ' + total + ' bytes, more than 8 MB')
	process.exit(1)
}
console.log('total ' + total + ' bytes')
