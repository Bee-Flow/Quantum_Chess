/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Pure helpers of the lesson and puzzle screens: setups, lesson rolls (forced outcome order), mode filters, replies,
 * grading and the punishing roll of a refutation.
 */

import {
	applyMove,
	findMove,
	getOutcomes,
	normaliseCode,
	otherColor,
	setupPosition,
	squareIndex,
	T,
} from '../engine/index.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */
/** @typedef {import('../engine/types.js').LegalMove} LegalMove */

const MODE_TYPES = { move: 'standard', split: 'split', merge: 'merge', measure: 'measure' }

/**
 * The position a step starts from: its own setup, or the current position when it continues.
 *
 * @param {object} step lesson step
 * @param {EngineState|null} current current state
 * @return {object|null}
 */
export function stepState(step, current) {
	return step.setup ? setupPosition(step.setup) : current
}

/**
 * The moves a task allows (its `modes`, default all).
 *
 * @param {object[]} moves legal moves
 * @param {string[]|undefined} modes subset of move / split / merge / measure
 * @return {object[]}
 */
export function movesForModes(moves, modes) {
	if (!modes?.length) {
		return moves
	}
	const types = new Set(modes.map((m) => MODE_TYPES[m]))
	return moves.filter((m) => types.has(m.type))
}

/**
 * The forced outcome of a lesson roll: the first key of `order` the move can have, else its likeliest outcome.
 *
 * @param {LegalMove} move the move
 * @param {string[]} [order] preferred outcome keys
 * @return {string|null} null for a move that does not roll
 */
export function lessonOutcome(move, order = []) {
	if (move.resolution !== 'rolled') {
		return null
	}
	const keys = move.outcomes.map((o) => o.key)
	const forced = order.find((k) => keys.includes(k))
	if (forced) {
		return forced
	}
	return move.outcomes.reduce((a, b) => (b.weight > a.weight ? b : a)).key
}

/**
 * Apply a move with an optional forced outcome.
 *
 * @param {EngineState} state position
 * @param {string} code move code
 * @param {string|null} outcome outcome key for a rolled move, null for a real roll (or a move that does not roll)
 * @return {{state: object, move: object, measurement: object|null}}
 */
export function playMove(state, code, outcome = null) {
	return applyMove(state, code, outcome ? { outcome } : {})
}

/**
 * The other outcome keys of a rolled move.
 *
 * @param {LegalMove} move the move
 * @param {string} key the outcome that happened
 * @return {string[]}
 */
export function otherOutcomes(move, key) {
	return move.resolution === 'rolled' ? move.outcomes.map((o) => o.key).filter((k) => k !== key) : []
}

/**
 * A scripted reply code when it is legal in the position.
 *
 * @param {object|undefined} reply `{scripted: code}` or `{engine: level}`
 * @param {EngineState} state position
 * @return {string|null}
 */
export function scriptedReply(reply, state) {
	if (!reply?.scripted || state.result) {
		return null
	}
	return findMove(state, reply.scripted)?.code ?? null
}

/**
 * Whether the side won in this state.
 *
 * @param {EngineState} state position
 * @param {'w'|'b'} side colour
 * @return {boolean}
 */
export function wonBy(state, side) {
	return state.result?.result === (side === 'w' ? '1-0' : '0-1')
}

/**
 * The probability (0..1) that a move wins at once for the side to move (king capture or "cannot escape").
 *
 * @param {EngineState} state position
 * @param {string} code move code
 * @return {number}
 */
export function winChance(state, code) {
	let w = 0
	for (const o of getOutcomes(state, code)) {
		if (wonBy(o.state, state.turn)) {
			w += o.weight
		}
	}
	return w / T
}

/**
 * Whether a puzzle accepts the move.
 *
 * @param {object} puzzle puzzle data
 * @param {LegalMove} move the move
 * @return {boolean}
 */
export function isAccepted(puzzle, move) {
	return puzzle.accepted.some((c) => normaliseCode(c) === move.code)
}

/**
 * The trap entry of a wrong move, if the puzzle explains it.
 *
 * @param {object} puzzle puzzle data
 * @param {LegalMove} move the move
 * @return {object|null}
 */
export function trapFor(puzzle, move) {
	return puzzle.traps.find((tr) => normaliseCode(tr.code) === move.code) ?? null
}

/**
 * The outcome that punishes a move for `victim`: one where `victim` does not win, or where the other side wins, or
 * where the most material is captured; null for a move that does not roll.
 *
 * @param {EngineState} state position
 * @param {string} code move code
 * @param {'w'|'b'} victim the puzzle solver's colour
 * @return {string|null}
 */
export function punishingOutcome(state, code, victim) {
	const move = findMove(state, code)
	if (!move || move.resolution !== 'rolled') {
		return null
	}
	const outs = getOutcomes(state, code)
	const other = otherColor(victim)
	const score = (o) => (wonBy(o.state, other) ? 3 : 0) + (wonBy(o.state, victim) ? -3 : 0)
		+ (state.turn === victim ? (o.captured === null ? 1 : 0) : (o.captured !== null ? 1 : 0))
	return outs.reduce((a, b) => (score(b) > score(a) ? b : a)).key
}

/**
 * Board arrows from `[from, to]` square-name pairs.
 *
 * @param {Array<string[]>} pairs pairs
 * @param {string} [kind] arrow kind
 * @return {object[]}
 */
export function arrowsOf(pairs = [], kind = 'best') {
	return pairs.map(([from, to]) => ({ from: squareIndex(from), to: squareIndex(to), kind }))
}
