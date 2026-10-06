/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The server-ruled variants, Bee Flow Chess, Kriegspiel and Fog of war (docs/development/online-variants.md, section
 * 6). In an online game of these variants the server holds the real state, decides every move and sends each player
 * only their own view: a state of the variant layer that holds what that player may know, which the board shows as it
 * is.
 *
 * - **Kriegspiel**: the worlds of `ownView` (every enemy piece off the board), and the squares of the own pieces.
 * - **Fog of war**: every enemy piece on a square the player cannot see is taken off the board and shown as a pawn
 *   (so not even a promotion can be read from it), the enemy's castling rights are dropped, and identical worlds are
 *   merged with their weights added, in the order in which they first appear. An enemy piece on a visible square keeps
 *   its chance. The view lists the visible squares (`visible`), since the board cannot work them out without the
 *   hidden pieces (a pawn does not see the square in front of it when a hidden piece stands there), and, to the side to
 *   move, its legal ordinary moves (`legal`).
 * - **Bee Flow Chess**: every square is visible, but the enemy pieces whose type is not public are placeholders
 *   (`V.viewOf`, src/variants/beeflow.js), the shuffled back ranks (`options`) are left out, and the player to move
 *   gets the legal ordinary moves (`legal`): the privacy shield depends on where the hidden Queen Bee stands.
 * - **History**: the player's own records as they are; the opponent's without the move (code, outcome, squares and
 *   captures), with only what the variant announces (`info`: the umpire's announcements, the squares where the
 *   player's pieces were taken).
 * - **The end**: once the game has ended, the view is the real state, and every move is revealed.
 *
 * The quiet counter is 0 in a view: the opponent's pawn moves, which reset it, are not known.
 *
 * PHP twin: lib/Variants/VariantEngine.php (`viewFor`, `preview`), checked against the fixtures in
 * tests/fixtures/referee/ (`npm run fixtures:referee`).
 */

import { legalMoves, outcomes } from './core/quantum.js'
import { cloneWorld, OFF, placePiece, worldKey } from './core/world.js'

/** The variants whose online games the server rules. */
const REFEREED = new Set(['beeflow', 'kriegspiel', 'darkchess'])

/**
 * Whether the server rules the online games of a variant (hidden information).
 *
 * @param {string} id variant id
 * @return {boolean}
 */
export function isRefereed(id) {
	return REFEREED.has(id)
}

/**
 * A world in the fog: every piece of another side on a square outside `visible` is off the board, as a pawn, and only
 * the castling rights of `side` are kept.
 *
 * @param {object} b world
 * @param {number} side side index
 * @param {Set<number>} visible the squares the side sees
 * @return {object}
 */
function fogWorld(b, side, visible) {
	const c = cloneWorld(b)
	for (let id = 0; id < c.sq.length; id++) {
		if (c.sd[id] !== side && !(c.sq[id] >= 0 && visible.has(c.sq[id]))) {
			if (c.sq[id] !== OFF) {
				placePiece(c, id, OFF)
			}
			c.ty[id] = 'p'
		}
	}
	c.x = { ...c.x, castle: (c.x.castle ?? []).filter((r) => r.side === side) }
	return c
}

/**
 * The worlds of the fog view of `side`, identical worlds merged in the order in which they first appear.
 *
 * @param {object} state state
 * @param {number} side side index
 * @param {Set<number>} visible the squares the side sees
 * @return {Array<{b: object, w: number}>}
 */
function fogWorlds(state, side, visible) {
	const byKey = new Map()
	for (const { b, w } of state.worlds) {
		const c = fogWorld(b, side, visible)
		const k = worldKey(c)
		const e = byKey.get(k)
		if (e) {
			e.w += w
		} else {
			byKey.set(k, { b: c, w })
		}
	}
	return [...byKey.values()]
}

/**
 * A history record of another player as a player sees it: the side, and what the variant announces about the move.
 *
 * @param {object} h history record
 * @return {object}
 */
function hiddenRecord(h) {
	const out = { code: '', side: h.side, key: '', notes: [], rolled: false, p: 1, options: 1, captures: [] }
	if (h.info !== undefined) {
		out.info = h.info
	}
	return out
}

/**
 * The view of a seat: the state as that player may know it (see the header).
 *
 * @param {object} V variant (Bee Flow Chess, Kriegspiel or Fog of war)
 * @param {object} state the real state
 * @param {number} seat the player's side
 * @return {object} a state, with `visible` (sorted squares) and `legal` (move codes), both null after the end
 */
export function viewFor(V, state, seat) {
	if (state.result) {
		return { ...state, visible: null, legal: null }
	}
	const visibleSet = V.visibility
		? V.visibility(state, seat)
		: new Set(Array.from({ length: V.topology.size }, (_, sq) => sq))
	const worlds = V.viewOf
		? V.viewOf(state, seat).worlds
		: V.ownView ? V.ownView(state, seat).worlds : fogWorlds(state, seat, visibleSet)
	const legal = !V.umpire && state.turn === seat
		? legalMoves(V, state).filter((m) => m.type === 'move').map((m) => m.code)
		: []
	return {
		...state,
		options: {},
		worlds,
		quiet: 0,
		history: state.history.map((h) => (h.side === seat ? h : hiddenRecord(h))),
		visible: [...visibleSet].sort((a, b) => a - b),
		legal,
	}
}

/**
 * The odds of a move before it is confirmed (Fog of war): its outcomes without the game result, which depends on the
 * hidden pieces, or null for a move that is not legal.
 *
 * @param {object} V variant
 * @param {object} state the real state
 * @param {string} code move code
 * @return {Array<{key: string, notes: string[], p: number, captures: number[], rolled: boolean}>|null}
 */
export function preview(V, state, code) {
	const outs = outcomes(V, state, code)
	return outs ? outs.map(({ key, notes, p, captures, rolled }) => ({ key, notes, p, captures, rolled })) : null
}
