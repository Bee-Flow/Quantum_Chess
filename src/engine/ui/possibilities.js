/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Possibilities (GAME-DESIGN §3.4.4): the complete chessboards a state could be, most likely first, for the
 * possibilities panel and "View one possibility". Also the forced king capture that the board draws when a king
 * cannot escape (GAME-DESIGN §3.9). JS-only display helpers.
 */

import { generateMoves, idOfCode, kingDanger, positionHash, T, validateState } from '../index.js'
import { colorOfId } from './pieces.js'

/**
 * A board string (ER §2.3) as a list of solid pieces.
 *
 * @param {object} state engine state (for the types)
 * @param {string} board 64-character board
 * @return {Array<null|{piece: number, type: string, color: 'w'|'b', weight: number, probability: number}>}
 */
export function boardView(state, board) {
	const out = new Array(64).fill(null)
	for (let s = 0; s < 64; s++) {
		const c = board.charCodeAt(s)
		if (c !== 46) {
			const id = idOfCode(c)
			out[s] = { piece: id, type: state.types[id], color: colorOfId(id), weight: T, probability: 1 }
		}
	}
	return out
}

/**
 * The possibilities of a state, most likely first (ties: canonical order).
 *
 * Returns `{items, rest, restWeight, total, differing}`: `items` are the first `limit` possibilities
 * `{index, board, weight, probability, view}` (index = position in `state.worlds`), `rest` how many are not listed
 * and `restWeight` their total weight; `differing` the squares whose content is not the same in every possibility.
 *
 * @param {object} state engine state
 * @param {object} [options] options
 * @param {number} [options.limit] how many to list (default 6)
 * @return {{items: object[], rest: number, restWeight: number, total: number, differing: number[]}}
 */
export function possibilities(state, { limit = 6 } = {}) {
	const worlds = state.worlds.map(([board, weight], index) => ({ index, board, weight }))
	worlds.sort((a, b) => b.weight - a.weight || a.index - b.index)
	const differing = []
	for (let s = 0; s < 64; s++) {
		const c = state.worlds[0][0][s]
		if (state.worlds.some(([b]) => b[s] !== c)) {
			differing.push(s)
		}
	}
	const items = worlds.slice(0, limit).map((w) => ({
		...w,
		probability: w.weight / T,
		view: boardView(state, w.board),
	}))
	const restWeight = worlds.slice(limit).reduce((sum, w) => sum + w.weight, 0)
	return { items, rest: Math.max(0, worlds.length - limit), restWeight, total: worlds.length, differing }
}

/**
 * The most likely king capture the side that just moved could play next (for the "cannot escape" arrow and the
 * danger arrow), or null when its king danger against the other side is 0.
 *
 * @param {object} state the state after the move (its `turn` is the side whose king is in danger)
 * @return {null|{from: number[], to: number, weight: number, code: string}}
 */
export function kingCaptureThreat(state) {
	const victim = state.turn
	const danger = kingDanger(state, victim)
	if (danger === 0) {
		return null
	}
	const flipped = {
		...state,
		turn: victim === 'w' ? 'b' : 'w',
		ep: '-',
		result: null,
	}
	flipped.history = [positionHash(flipped)]
	const valid = validateState(flipped)
	if (!valid.ok) {
		return null
	}
	const king = victim === 'w' ? 0 : 16
	let best = null
	for (const m of generateMoves(valid.state)) {
		if (!m.capture || m.type === 'measure') {
			continue
		}
		const kingSquare = m.to[0]
		const letterAt = valid.state.worlds[0][0].charCodeAt(kingSquare)
		if (letterAt === 46 || idOfCode(letterAt) !== king) {
			continue
		}
		const cap = m.outcomes.find((o) => o.key === 'capture')
		const weight = cap ? cap.weight : 0
		if (best === null || weight > best.weight) {
			best = { from: m.from, to: kingSquare, weight, code: m.code }
		}
	}
	return best
}
