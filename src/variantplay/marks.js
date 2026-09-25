/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Pure helpers for the square marks of a variant board: the squares of the last move and the piece a click selects.
 */

import { parseCode } from '../variants/index.js'

/**
 * The squares of a move code as far as the code itself tells them (records saved before the history kept the
 * squares): `n@f3` gives f3, `e7-e8=q` gives e7 and e8, splits, merges and measurements give their squares. Codes
 * that name no squares (`O-O`, the keys of the multiverse) give nothing.
 *
 * @param {object} V variant
 * @param {string} code move code
 * @return {{from: number[], to: number[]}}
 */
function squaresOfCode(V, code) {
	const mv = parseCode(V, code)
	if (!mv) {
		return { from: [], to: [] }
	}
	if (mv.type !== 'move') {
		return { from: mv.from ?? [], to: mv.to ?? [] }
	}
	const topo = V.topology
	const at = code.indexOf('@')
	if (at >= 0) {
		return { from: [], to: [topo.byName(code.slice(at + 1))] }
	}
	const parts = code.split('=')[0].split('-')
	if (parts.length !== 2) {
		return { from: [], to: [] }
	}
	return { from: [topo.byName(parts[0])], to: [topo.byName(parts[1])] }
}

/**
 * The squares to mark for a history record: the record's own `from` and `to` squares when it has them, otherwise
 * what the code tells (older records). Never throws; unknown squares are left out.
 *
 * @param {object} V variant
 * @param {object} record history record `{ code, from?, to? }`
 * @return {number[]} squares, from squares first, without repeats
 */
export function lastMoveSquares(V, record) {
	if (!record) {
		return []
	}
	let squares
	if (Array.isArray(record.from) || Array.isArray(record.to)) {
		squares = { from: record.from ?? [], to: record.to ?? [] }
	} else {
		try {
			squares = squaresOfCode(V, record.code)
		} catch {
			return []
		}
	}
	const out = []
	for (const sq of [...squares.from, ...squares.to]) {
		if (Number.isInteger(sq) && sq >= 0 && !out.includes(sq)) {
			out.push(sq)
		}
	}
	return out
}

/**
 * The id of a piece of `side` on a square, from the first world where one stands there, or -1. Pieces of other sides
 * are ignored, so selecting a square never reveals the parts of an enemy ghost.
 *
 * @param {object} state state
 * @param {number} sq square
 * @param {number} side side index
 * @return {number}
 */
export function sidePieceAt(state, sq, side) {
	for (const { b } of state.worlds) {
		const id = b.board[sq]
		if (id >= 0 && b.sd[id] === side) {
			return id
		}
	}
	return -1
}
