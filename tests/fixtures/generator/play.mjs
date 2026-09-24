/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Playing the fixture games: seeded random games and scripted examples, one fixture entry per step (the legal list,
 * the move, the roll, the state after it, the measurement record, the notation, the hash and the views). While the
 * random games are played, random move inputs of their positions are recorded as whyIllegal cases.
 */

import * as E from '../../../src/engine/index.js'
import { cover, reasonsSeen, track } from './coverage.mjs'
import { choose, pick } from './policies.mjs'

const T = E.T

/** The whyIllegal cases, in the order they were recorded. */
export const whyCases = []

/**
 * Canonical JSON of a state.
 *
 * @param {object} state state
 * @return {string}
 */
export const json = (state) => E.serializeState(state)

/**
 * The views of the state after a step that every game fixture records.
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

/**
 * Record a whyIllegal case.
 *
 * @param {string} name label
 * @param {object} state state
 * @param {string|object} input move input
 */
export function why(name, state, input) {
	const expect = E.whyIllegal(state, input)
	whyCases.push({ name, state: json(state), input, expect })
	reasonsSeen.add(expect ?? 'legal')
	cover.whyIllegalCases++
}

/**
 * Random move inputs for a state (strings and objects, legal and illegal).
 *
 * @param {object} s state
 * @param {() => number} rng rng
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
			out.push(pick([
				'O-O',
				'O-O-O',
				'measure a1',
				'?' + E.squareName(from()),
				'x',
				E.squareName(from()) + E.squareName(sq()),
			], rng))
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
	const mine = s.turn === 'w'
		? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
		: [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]
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

/**
 * Play one seeded game.
 *
 * @param {object} spec {name, seed, policy, maxPlies, setup?, start?, forcedEvery?}
 * @return {object} game fixture
 */
export function playGame(spec) {
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

/**
 * Play a scripted example. Moves are codes; `code@u=N` rolls with u, `code@key` forces an outcome.
 *
 * @param {string} name label
 * @param {{setup?: object, start?: object}} from setup spec or crafted start
 * @param {string[]} moves scripted moves
 * @return {object}
 */
export function scripted(name, from, moves) {
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
