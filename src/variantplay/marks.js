/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Pure helpers for the square marks of a variant board: the squares of the last move, the piece a click selects, and
 * what the board may show and let the keyboard reach without revealing hidden information (move targets and focus
 * only while the viewer is the player to move, and on a square the viewer cannot see only when the variant builds the
 * viewer's attempts from what the viewer knows).
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

/**
 * Whether the board takes the viewer's input and may show the viewer's move targets and keyboard focus: the game goes
 * on, a human is to move, neither the first step of the hidden hand-over (the mover still looks) nor the curtain is
 * shown, and in a hidden-information variant the viewer is the side to move. Otherwise the moves on the board could be
 * another side's, and their squares would reveal hidden pieces.
 *
 * @param {object|null} V variant
 * @param {object|null} state state
 * @param {object} view what the screen shows
 * @param {boolean} view.humanTurn whether a human is to move
 * @param {boolean} view.handover whether the first step of the hidden hand-over is shown
 * @param {boolean} view.curtain whether the curtain covers the board
 * @param {number} view.viewer the side whose view is shown
 * @return {boolean}
 */
export function boardInteractive(V, state, { humanTurn, handover, curtain, viewer }) {
	return Boolean(V && state && !state.result && humanTurn && !handover && !curtain
		&& (!V.hidden || viewer === state.turn))
}

/**
 * Whether a move target may be marked on a square the viewer cannot see. Only when the variant builds those attempts
 * from what the viewer knows: the moves a player may try (`candidateMoves`, Kriegspiel: as if the enemy pieces were
 * unknown) for moves and drops, the own view (`ownView`) for the targets of Split and Merge. Otherwise the targets
 * come from the real state, and a target on such a square would reveal what stands there.
 *
 * @param {object} V variant
 * @param {'move'|'drop'|'split'|'merge'} source where the target comes from
 * @return {boolean}
 */
export function blindTargetAllowed(V, source) {
	return source === 'split' || source === 'merge' ? Boolean(V.ownView) : Boolean(V.candidateMoves)
}

/**
 * The squares the keyboard can reach: the from squares of the viewer's moves that the viewer can see, and the marked
 * targets (already limited by `blindTargetAllowed`). Call it only while the board is interactive
 * (`boardInteractive`).
 *
 * @param {Array<{from: number}>} moves the moves of the side to move (the viewer)
 * @param {Record<number, string[]>} marks marks per square
 * @param {Set<number>|null} hidden the squares the viewer cannot see, or null
 * @return {Set<number>}
 */
export function focusSquares(moves, marks, hidden) {
	const out = new Set()
	for (const m of moves) {
		if (m.from >= 0 && !hidden?.has(m.from)) {
			out.add(m.from)
		}
	}
	for (const [sq, list] of Object.entries(marks)) {
		if (list.includes('target')) {
			out.add(Number(sq))
		}
	}
	return out
}
