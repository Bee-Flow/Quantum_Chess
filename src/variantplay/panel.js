/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Pure helpers behind the side panel of a variant game: the budget pips, the variant's line in a player row, the
 * result of a resignation, whether a move waits for confirmation, which notice a refused attempt gets, which records
 * the last-move box reports, the rows of the move list, the order of the pieces in hand and the groups of hands at
 * the board. They read the optional variant hooks `sideInfo(state, side, viewer)`, `resignResult(state, loser)`,
 * `ownView(state, side)`, `umpire`, `hidden`, `handOrder` and `handBoards`.
 */

import { branches, budgetInfo, parseCode } from '../variants/index.js'

/**
 * The budget pips of a side: `{ known, used, limit }`. The partners of a team budget show the same numbers. While a
 * game with hidden information runs, only the viewer's own budget is known (`known: false` for every other side).
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} side side index
 * @param {number} viewer the side whose view is shown
 * @return {{known: boolean, used: number, limit: number}}
 */
export function budgetPips(V, state, side, viewer) {
	if (V.hidden && !state.result && side !== viewer) {
		return { known: false, used: 0, limit: 0 }
	}
	const info = budgetInfo(V, state, side)
	return { known: true, used: info.used, limit: info.limit }
}

/**
 * The variant's short text in a player row (checks given, pieces left), or null.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} side side index
 * @param {number} viewer the side whose view is shown
 * @return {{text: string, title?: string}|null}
 */
export function sideInfoOf(V, state, side, viewer) {
	if (!V.sideInfo) {
		return null
	}
	const info = V.sideInfo(state, side, viewer)
	return info && info.text ? info : null
}

/**
 * The result when a side resigns: the variant's `resignResult(state, loser)`, by default a win for every enemy of the
 * loser.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} loser the side that resigns
 * @return {{winner: number|null, winners?: number[], reason: string}}
 */
export function resignResult(V, state, loser) {
	if (V.resignResult) {
		return V.resignResult(state, loser)
	}
	const winners = V.sides.map((x, i) => i).filter((i) => V.enemies(loser, i))
	return winners.length === 1
		? { winner: winners[0], reason: 'resign' }
		: { winner: null, winners, reason: 'resign' }
}

/**
 * Whether a legal move waits for confirmation with its odds: when it has several outcomes, except in variants with
 * an umpire (Kriegspiel), where an attempt is binding and the odds would reveal hidden pieces.
 *
 * @param {object} V variant
 * @param {Array<object>} outs the outcomes of the move
 * @return {boolean}
 */
export function needsConfirmation(V, outs) {
	return !V.umpire && outs.length > 1
}

/**
 * The notice for an attempt the real state refuses: `umpire` ("the umpire says no") or `illegal`. With an own view
 * (`V.ownView`), a split, merge or measurement that is legal on the own view gets the umpire's answer, one that is
 * illegal there too gets the normal notice, since the player could know it from their own pieces. An ordinary move
 * gets the umpire's answer in variants with an umpire.
 *
 * @param {object} V variant
 * @param {object} own the state as the player knows it (`V.ownView`), or the real state
 * @param {string} code move code
 * @return {'umpire'|'illegal'}
 */
export function refusalKind(V, own, code) {
	const mv = parseCode(V, code)
	if (V.ownView && mv && mv.type !== 'move') {
		return branches(V, own, code) ? 'umpire' : 'illegal'
	}
	return V.umpire ? 'umpire' : 'illegal'
}

/**
 * The records the last-move box reports to the viewer: the viewer's own last move and every move after it (the
 * opponents' moves since then), or every record when the viewer has not moved yet.
 *
 * @param {object[]} history history records
 * @param {number} viewer the side whose view is shown
 * @return {object[]}
 */
export function recordsSince(history, viewer) {
	let i = history.length - 1
	while (i >= 0 && history[i].side !== viewer) {
		i--
	}
	return history.slice(Math.max(i, 0))
}

/**
 * The pieces in hand in the variant's order (`handOrder`); types missing from it come last, by id.
 *
 * @param {object} V variant
 * @param {Array<{type: string}>} pieces pieces in hand, one entry per type
 * @return {Array<{type: string}>}
 */
export function sortHand(V, pieces) {
	const order = V.handOrder ?? []
	const rank = (type) => {
		const i = order.indexOf(type)
		return i < 0 ? order.length : i
	}
	return [...pieces].sort((a, b) => rank(a.type) - rank(b.type) || a.type.localeCompare(b.type))
}

/**
 * The rows of the move list, oldest first. A turn is every record of one side in a row (one move, or the several
 * moves of a multiverse turn). With two sides a row is numbered like a chess move and holds the first side's turn and
 * the second side's answer (a game that starts with the second side begins with an empty first cell); with more
 * sides every turn is a numbered row of its own.
 *
 * @param {Array<{side: number}>} history history records
 * @param {number} sideCount the number of sides
 * @return {Array<{n: number, cells: Array<{side: number, items: number[]}|null>}>} per row its number and cells, a
 *   cell listing the indices of its records in `history`
 */
export function moveRows(history, sideCount) {
	const turns = []
	history.forEach((h, i) => {
		const last = turns[turns.length - 1]
		if (last && last.side === h.side) {
			last.items.push(i)
		} else {
			turns.push({ side: h.side, items: [i] })
		}
	})
	if (sideCount !== 2) {
		return turns.map((turn, k) => ({ n: k + 1, cells: [turn] }))
	}
	const rows = []
	for (const turn of turns) {
		const last = rows[rows.length - 1]
		if (turn.side === 1 && last && last.cells[1] === null) {
			last.cells[1] = turn
		} else {
			rows.push({ n: rows.length + 1, cells: turn.side === 1 ? [null, turn] : [turn, null] })
		}
	}
	return rows
}

/**
 * The hands at the board, in groups. Normally one group per side, in side order: in a two-player game the hand of
 * the side at the top of the board (its pieces turned half a turn in this view) goes above the board, every other
 * hand below it. A variant of more sides with `handBoards` (per side, the index of its board in `layout.boards`: the
 * bughouse seats) gets one group per board below the drawing, left to right as the boards are drawn (the order of
 * `layout.boards`, reversed in a view turned half a turn), each with the hand of the seat at the top of its board
 * first.
 *
 * @param {object} V variant
 * @param {number} rotation the rotation of the board in degrees
 * @param {(side: number) => boolean} onTop whether a side sits at the top of its board in this view
 * @return {Array<{key: string, place: 'top'|'bottom', board: boolean, sides: number[]}>}
 */
export function handGroups(V, rotation, onTop) {
	const sides = V.sides.map((x, i) => i)
	if (Array.isArray(V.handBoards) && sides.length > 2) {
		const boards = [...new Set(V.handBoards)].sort((a, b) => a - b)
		if (rotation === 180) {
			boards.reverse()
		}
		return boards.map((bd) => ({
			key: 'board' + bd,
			place: 'bottom',
			board: true,
			sides: sides.filter((s) => V.handBoards[s] === bd).sort((a, b) => Number(onTop(b)) - Number(onTop(a))),
		}))
	}
	return sides.map((side) => ({
		key: 'side' + side,
		place: sides.length === 2 && onTop(side) ? 'top' : 'bottom',
		board: false,
		sides: [side],
	}))
}
