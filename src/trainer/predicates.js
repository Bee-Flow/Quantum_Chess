/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Success predicates of lesson tasks: pure functions of `(before, move, after)`. Steps name them declaratively
 * (`{kingRisk: 0}`, `{moveIs: ['d1-d5']}`, `{all: [...]}`), so a test can check them.
 */

import { generateMoves, getOutcomes, moveRisk, normaliseCode, pieceLocations, squareIndex, T } from '../engine/index.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */
/** @typedef {import('../engine/types.js').LegalMove} LegalMove */

/**
 * The opponent's best chance (0..1) to capture piece `id` with one move in `state`, where it is the opponent's turn.
 *
 * @param {EngineState} state engine state (opponent to move)
 * @param {number} id piece id
 * @return {number}
 */
export function captureChance(state, id) {
	if (state.result) {
		return 0
	}
	const squares = new Set((pieceLocations(state)[id] ?? []).map((l) => l.square))
	let best = 0
	for (const m of generateMoves(state)) {
		if (!m.capture || !m.to.some((sq) => squares.has(sq))) {
			continue
		}
		let w = 0
		for (const o of getOutcomes(state, m.code)) {
			if (o.captured === id) {
				w += o.weight
			}
		}
		best = Math.max(best, w / T)
	}
	return best
}

/**
 * Whether a code list contains the move (codes normalised).
 *
 * @param {string[]} codes codes
 * @param {LegalMove} move the move
 * @return {boolean}
 */
function codeIn(codes, move) {
	return codes.some((c) => normaliseCode(c) === move.code)
}

const PREDICATES = {
	moveIs: (codes, { move }) => codeIn(codes, move),
	moveType: (type, { move }) => move.type === type,
	fromSquare: (sq, { move }) => move.from.includes(squareIndex(sq)),
	pieceSolid: (id, { after }) => (pieceLocations(after)[id] ?? []).length === 1,
	captureRisk: ({ id, max }, { after }) => captureChance(after, id) <= max + 1e-9,
	kingRisk: (max, { before, move }) => moveRisk(before, move.code) <= max + 1e-9,
	gameWon: (_, { before, after }) => Boolean(after.result) && after.result.result === (before.turn === 'w' ? '1-0' : '0-1'),
	all: (list, ctx) => list.every((p) => check(p, ctx.before, ctx.move, ctx.after)),
	any: (list, ctx) => list.some((p) => check(p, ctx.before, ctx.move, ctx.after)),
}

/**
 * Evaluate a predicate descriptor.
 *
 * @param {object} descriptor e.g. `{moveIs: ['d1-d8']}`; every key must hold
 * @param {EngineState} before state before the move
 * @param {LegalMove} move the move
 * @param {EngineState} after state after the move
 * @return {boolean}
 */
export function check(descriptor, before, move, after) {
	return Object.entries(descriptor).every(([name, arg]) => {
		const fn = PREDICATES[name]
		if (!fn) {
			throw new TypeError('unknown predicate: ' + name)
		}
		return fn(arg, { before, move, after })
	})
}
