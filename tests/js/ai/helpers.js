/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Shared helpers of the AI tests.
 */

import * as E from '../../../src/engine/index.js'

export { E }

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

/** Named positions from ENGINE-RULES §10 and GAME-DESIGN §5 used across the tests. */
export const POS = {
	start: () => E.initialState(),
	// W2: a solid bishop attacks a ghost knight (50 %).
	w2: () => S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6']),
	// W6: converging capture of the king (certain).
	w6: () => S('7k/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1-d4|h5']),
	// W9: a pawn probe.
	w9: () => S('4k3/8/8/8/3p2n1/8/4P3/4K3 w - - 0 1', ['g4-e3|h6']),
	// W14: the rook move that leaves Black's king unable to escape.
	w14: () => S('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1'),
	// A quiet middlegame with ghosts on both sides.
	ghosts: () => S('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1', ['f3-g5|h4', 'c6-a5|b4']),
	// A classical middlegame.
	middlegame: () => S('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1'),
}

/**
 * A reproducible set of positions reached by random play (seeded moves and rolls).
 *
 * @param {number} count number of positions
 * @param {number} seed seed
 * @return {object[]} states (game not over)
 */
export function randomPositions(count, seed) {
	const rng = E.seededRng(seed)
	const out = []
	let state = E.initialState()
	while (out.length < count) {
		const moves = E.generateMoves(state)
		if (moves.length === 0 || state.ply > 80) {
			state = E.initialState()
			continue
		}
		const m = moves[Math.floor(rng() * moves.length)]
		state = E.applyMove(state, m.code, { rng }).state
		if (state.result === null) {
			if (rng() < 0.35) {
				out.push(state)
			}
		} else {
			state = E.initialState()
		}
	}
	return out
}
