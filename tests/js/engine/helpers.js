/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import * as E from '../../../src/engine/index.js'

export { E }

export const T = E.T

/**
 * Setup shortcut.
 *
 * @param {string} fen FEN
 * @param {string[]} [prelude] prelude codes
 * @return {object}
 */
export function S(fen, prelude = []) {
	return E.setupPosition({ fen, prelude })
}

/**
 * Worlds as [board, weight] pairs.
 *
 * @param {object} state state
 * @return {Array<[string, number]>}
 */
export function W(state) {
	return state.worlds.map((w) => [w[0], w[1]])
}

/**
 * Last history entry.
 *
 * @param {object} state state
 * @return {string}
 */
export function H(state) {
	return state.history[state.history.length - 1]
}

/**
 * Apply and return the new state.
 *
 * @param {object} state state
 * @param {string|object} move move
 * @param {object} [opts] options
 * @return {object}
 */
export function play(state, move, opts) {
	return E.applyMove(state, move, opts).state
}

/**
 * Location map of a piece: { square name: weight }.
 *
 * @param {object} state state
 * @param {number} id piece id
 * @return {Record<string, number>}
 */
export function locOf(state, id) {
	const out = {}
	for (const l of E.pieceLocations(state)[id]) {
		out[E.squareName(l.square)] = l.weight
	}
	return out
}

/**
 * Pick a legal move uniformly with a seeded rng and play it with a seeded u.
 *
 * @param {object} state state
 * @param {function(): number} rng seeded rng
 * @param {function(object[]): object} [choose] custom chooser
 * @return {{state: object, move: object, measurement: object|null, u: number|null}}
 */
export function randomStep(state, rng, choose) {
	const moves = E.generateMoves(state)
	const m = choose ? choose(moves, rng) : moves[Math.floor(rng() * moves.length)]
	const u = m.resolution === 'rolled' ? Math.floor(rng() * T) : null
	const r = E.applyMove(state, m, u === null ? {} : { u })
	return { ...r, u }
}

/**
 * Build and validate a state from explicit worlds, e.g. craft([[{ e1: 'A', e8: 'a', f3: 'H' }, T]]).
 *
 * @param {Array<[Record<string, string>, number]>} worlds piece placements (square name → letter) and weights
 * @param {object} [opts] other fields (turn, castling, ep, types, halfmove, fullmove, ply)
 * @return {object}
 */
export function craft(worlds, opts = {}) {
	const boards = worlds.map(([pieces, w]) => {
		const b = new Array(64).fill('.')
		for (const [sq, letter] of Object.entries(pieces)) {
			b[E.squareIndex(sq)] = letter
		}
		return [b.join(''), w]
	})
	boards.sort((x, y) => (x[0] < y[0] ? -1 : 1))
	const live = new Set()
	for (const ch of boards[0][0]) {
		if (ch !== '.') {
			live.add(E.idOfCode(ch.charCodeAt(0)))
		}
	}
	const captured = []
	for (let id = 0; id < 32; id++) {
		if (!live.has(id)) {
			captured.push(id)
		}
	}
	const state = {
		v: 1,
		types: opts.types ?? E.INITIAL_TYPES,
		worlds: boards,
		turn: opts.turn ?? 'w',
		castling: opts.castling ?? '-',
		ep: opts.ep ?? '-',
		halfmove: opts.halfmove ?? 0,
		fullmove: opts.fullmove ?? 1,
		ply: opts.ply ?? 0,
		captured,
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
 * A valid copy of a state with other bookkeeping numbers (ply is not part of the hash).
 *
 * @param {object} state state
 * @param {object} fields fields to override
 * @return {object}
 */
export function withFields(state, fields) {
	const s = { ...state, ...fields }
	s.history = [E.positionHash(s)]
	const r = E.validateState(s)
	if (!r.ok) {
		throw new Error('withFields: ' + r.error + ' ' + r.message)
	}
	return r.state
}
