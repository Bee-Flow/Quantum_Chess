/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The computer player's hooks for multiverse chess (docs/variants.md, "Multiverse chess (5D)"). The core's search
 * (core/ai.js) does the work; these hooks teach it the multi-move turn and 5D check.
 *
 * - `evaluate(w, side)` adds the 5D terms to the core's material (history pieces are worth nothing): check, a threat
 *   on an enemy royal piece, a hanging-piece term for the boards the side to move has already played this turn, the
 *   timeline advantage and a small contempt for draws.
 * - `aiView(state, me)` searches the must-move boards first: in a copy whose worlds carry `x.ai`, `generate` asks
 *   `viewFilter` and keeps every move of the must-move boards and, from the other boards, only royal captures, jumps
 *   onto a must-move board and the branches that move the present back. Each of these depends only on the skeleton
 *   and the solid royal pieces, so a key is kept in every world or in none: every candidate of the view is legal on
 *   the real state with the same outcomes (`aiViewExact`). A piece on a must-move board keeps all of its splits, those
 *   across boards and in time included; the splits of the other boards come once the must-move boards are played.
 * - `replySide(s, me)`: no answer inside the computer's own turn (the evaluation judges), the opponent after it.
 * - `aiTimeShare(state)`: one turn of several boards shares one level time.
 * - `aiThreats(w, side, id)` (`pieceThreats`): what a piece would attack on its next turn, anywhere in the multiverse;
 *   the core's quantum terms rank the computer's splits with it (a part that threatens a king in the past, a fork
 *   across two boards).
 *
 * The stuck test (`stateResult`) runs on every outcome the search looks at, so a move that strands the computer's own
 * turn is a lost game for it and is never chosen while another move is left.
 */

import { hasLegalMove } from '../core/quantum.js'
import { phantomPass, walkMoves } from './moves.js'
import { TYPES } from './pieces.js'
import { canSubmit, mandatory, newRowFor, playable, ROWS } from './skeleton.js'

/**
 * The weights of the 5D terms of `evaluate`, in centipawns: check (a royal piece of the side to move can be taken
 * after it passes its must-move boards), threat (the side to move can take an enemy royal piece now), the share of
 * the most valuable hanging piece, the contempt for a draw and the value of one timeline of advantage.
 */
export const WEIGHTS = Object.freeze({ check: 3000, threat: 6000, hang: 0.8, contempt: 200, timeline: 100 })

/**
 * @typedef {object} Scans
 * @property {boolean} check the waiting side could capture a royal piece of the side to move after the phantom pass
 * @property {boolean} threat the side to move can capture an enemy royal piece now
 * @property {number} hang the value of the most valuable non-royal piece of the side to move that the waiting side
 *   could capture after the phantom pass, on a latest board the side to move can no longer play this turn
 */

/** The scans already made, per world object (worlds never change once built). */
const scanCache = new WeakMap()

/**
 * The two fast scans of a world, made without building move keys: the phantom scan of the waiting side (the official
 * check test, with the side to move's must-move boards passed) gives `check` and `hang`; the threat scan of the side
 * to move stops at its first royal capture.
 *
 * @param {object} w world
 * @return {Scans}
 */
export function scans(w) {
	let found = scanCache.get(w)
	if (found !== undefined) {
		return found
	}
	const x = w.x
	found = { check: false, threat: false, hang: 0 }
	walkMoves(w, 1 - x.s, phantomPass(x), (m) => {
		if (m.capture < 0) {
			return
		}
		if (m.royal) {
			found.check = true
			return
		}
		// only a piece on a latest board whose row the side to move has already played (or cannot play) this turn:
		// pieces on boards it still plays can still move away
		const value = TYPES[w.ty[m.capture]].value
		if (value > found.hang && m.slot === 0 && (x.tl[m.tu][1] & 1) !== x.s) {
			found.hang = value
		}
	})
	found.threat = walkMoves(w, x.s, null, (m) => m.royal)
	scanCache.set(w, found)
	return found
}

/**
 * Extra evaluation terms in centipawns for `side` in one world (added to the core's material): for the side to move
 * −3000 in check, +6000 with a threat and −0.8 × its hanging piece, the opposite for the other side; +200 contempt
 * (at equal material playing on is better than a draw); +100 per timeline the enemy created more (at most 2).
 *
 * @param {object} w world
 * @param {number} side side index
 * @return {number}
 */
export function evaluate(w, side) {
	const x = w.x
	const { check, threat, hang } = scans(w)
	const terms = (threat ? WEIGHTS.threat : 0) - (check ? WEIGHTS.check : 0) - WEIGHTS.hang * hang
	const lead = Math.max(-2, Math.min(2, x.c[1 - side] - x.c[side]))
	return WEIGHTS.contempt + (x.s === side ? terms : -terms) + WEIGHTS.timeline * lead
}

/**
 * The captures that piece `id` of `side` could make with its next move in world `w` (the core's `aiThreats`, which
 * tells the computer what a part of a split would attack): the rows whose latest board the other side plays next are
 * passed virtually, so the piece moves from wherever it stands as it will on its next turn, onto its own board, other
 * timelines and the past. Castling and en passant are left out.
 *
 * @param {object} w world
 * @param {number} side side index
 * @param {number} id the piece
 * @return {Array<{id: number, capture: number}>}
 */
export function pieceThreats(w, side, id) {
	const x = w.x
	const pass = x.tl.map((e) => e !== null && (e[1] & 1) !== side)
	const out = []
	walkMoves(w, side, pass, (m) => {
		if (m.id === id && m.capture >= 0) {
			out.push({ id, capture: m.capture })
		}
	})
	return out
}

/**
 * Whether a branch from row `u` onto board (tu, tv) moves the present back for the side to move: afterwards Submit is
 * legal or a board that was must-move no longer is (the skeleton test of the stuck search, engine.js `stuck`).
 *
 * @param {object} x the world's extra state
 * @param {number} side the side to move
 * @param {number[]} must its must-move rows
 * @param {number} u source row
 * @param {number} tu target row
 * @param {number} tv half-turn index of the target board
 * @return {boolean}
 */
function movesPresent(x, side, must, u, tu, tv) {
	const y = { ...x, c: x.c.slice(), tl: x.tl.map((e) => (e ? e.slice() : null)) }
	y.tl[newRowFor(y, side)] = [tv + 1, tv + 1, tu, tv]
	y.c[side] += 1
	y.tl[u][1] += 1
	if (canSubmit(y)) {
		return true
	}
	const now = mandatory(y)
	return must.some((r) => !now.includes(r))
}

/**
 * The filter of the computer's view, asked by `generate` for the side to move in a world marked `x.ai`: a function of
 * the move cursor (moves.js `walkMoves`) that keeps every move from a must-move board and, from the other boards,
 * royal captures, jumps onto a must-move board and the branches that move the present back. Null (keep every move)
 * when the world is not the viewer's turn or has no must-move board.
 *
 * @param {object} w world
 * @param {number} side the side to move
 * @return {((m: object) => boolean)|null}
 */
export function viewFilter(w, side) {
	const x = w.x
	// x.ai is the viewer's side + 1: the opponent's answers after the viewer's turn are searched in full
	if (x.ai !== side + 1) {
		return null
	}
	const must = mandatory(x)
	if (!must.length) {
		return null
	}
	const isMust = new Array(ROWS).fill(false)
	for (const u of must) {
		isMust[u] = true
	}
	const memo = new Map()
	return (m) => {
		if (isMust[m.u] || m.royal || (m.tr === 1 && isMust[m.tu])) {
			return true
		}
		if (m.tr !== 2) {
			return false
		}
		const key = (m.u * ROWS + m.tu) * 4096 + m.tv
		let keep = memo.get(key)
		if (keep === undefined) {
			keep = movesPresent(x, side, must, m.u, m.tu, m.tv)
			memo.set(key, keep)
		}
		return keep
	}
}

/**
 * The position as the computer searches it (the core's `aiView`): when the side to move has must-move boards and other
 * boards it may play, a copy whose worlds carry `x.ai` (see `viewFilter`); the state itself otherwise, and also when
 * the view has no legal move (so the core never falls back to trying moves at random).
 *
 * @param {object} V the declaration
 * @param {object} state state
 * @param {number} me the computer's side
 * @return {object}
 */
export function aiView(V, state, me) {
	if (state.result || state.turn !== me) {
		return state
	}
	const x = state.worlds[0].b.x
	const must = mandatory(x)
	if (!must.length) {
		return state
	}
	let optional = false
	for (let u = 0; u < ROWS && !optional; u++) {
		optional = playable(x, me, u) && !must.includes(u)
	}
	if (!optional) {
		return state
	}
	const worlds = state.worlds.map(({ b, w }) => ({ b: { ...b, x: { ...b.x, ai: me + 1 } }, w }))
	const view = { ...state, worlds }
	return hasLegalMove(V, view) ? view : state
}

/**
 * Whose answer the search looks at after a move of `me`: none inside its own turn (the evaluation with its check and
 * hang terms judges the position), the opponent once the turn has passed.
 *
 * @param {object} s state after the move
 * @param {number} me the computer's side
 * @return {number|null}
 */
export function replySide(s, me) {
	return s.turn === me ? null : s.turn
}

/**
 * The share of the level's time for this move: a turn of k boards shares one level time, so the share is one over the
 * boards the side to move may still play plus the actions it already made this turn.
 *
 * @param {object} state state
 * @return {number} in (0, 1]
 */
export function aiTimeShare(state) {
	const x = state.worlds[0].b.x
	let boards = x.t
	for (let u = 0; u < ROWS; u++) {
		if (playable(x, x.s, u)) {
			boards++
		}
	}
	return 1 / Math.max(1, boards)
}

/**
 * The computer's hooks of the declaration.
 *
 * @param {object} V the declaration (completed by `defineVariant`)
 * @return {object}
 */
export function computerHooks(V) {
	return {
		evaluate,
		aiView: (state, me) => aiView(V, state, me),
		replySide,
		aiTimeShare,
		aiThreats: pieceThreats,
		// every candidate of the view is legal on the real state with the same outcomes
		aiViewExact: true,
	}
}
