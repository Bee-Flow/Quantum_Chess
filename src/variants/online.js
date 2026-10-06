/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * What online play needs to know about the variants (docs/development/online-variants.md): which variants can be
 * played online, their seats and teams, the result of a game as a short code the server stores, the position hash
 * that every browser reports after a move, and the replay of an online game from its stored moves and rolls.
 *
 * PHP twin of the seat, team and result helpers: lib/Service/Game/VariantCatalog.php and VariantResult.php. Both are
 * checked against tests/fixtures/online-variants.json.
 *
 * Online games replay moves with the roll `u` (an integer in [0, T)) that the server drew after the move was sent:
 * `applyMove(V, state, code, u / T)` picks the outcome that contains `u`, the same in every browser.
 */

import { fnv1a64 } from '../engine/index.js'
import { CATALOG } from './catalog.js'
import { applyMove, T } from './core/quantum.js'

/**
 * The version of the variant rules that online games are played with. A game stores the version of the browser that
 * created it, and a browser with another version does not settle or dispute its moves: different rules could give a
 * different result from the same move and roll. Raise it with every change of a rule of a variant.
 */
export const ONLINE_RULES_VERSION = 1

/** Variants whose hidden information would be visible to every player, since every browser replays the full state. */
const OFFLINE_ONLY = new Set(['kriegspiel', 'darkchess'])

/** The teams of a four-seat team game: the sides with the same parity play together. */
const PAIRS = [[0, 2], [1, 3]]

/** The square index of a piece in hand (`HAND` of core/world.js). */
const HAND = -2

/**
 * Whether a variant can be played online.
 *
 * @param {string} id variant id
 * @return {boolean}
 */
export function isOnlineVariant(id) {
	return CATALOG.some((e) => e.id === id) && !OFFLINE_ONLY.has(id)
}

/**
 * The number of seats of a variant, or 0 for an unknown variant. Seat `i` plays side `i`.
 *
 * @param {string} id variant id
 * @return {number}
 */
export function seatCount(id) {
	return CATALOG.find((e) => e.id === id)?.players ?? 0
}

/**
 * The teams of a game, as lists of seats, or null when every seat plays for itself.
 *
 * @param {string} id variant id
 * @param {object} [options] option values of the game
 * @return {number[][]|null}
 */
export function teamsOf(id, options = {}) {
	if (id === 'bughouse' || (id === 'fourplayer' && options?.mode === 'teams')) {
		return PAIRS.map((team) => team.slice())
	}
	return null
}

/**
 * The result of a game as the short code the server stores: `win:<seats>/<reason>` with the winning seats in
 * ascending order, `draw/<reason>`, or the empty string while the game goes on.
 *
 * @param {null|{winner: number|null, winners?: number[], reason: string}} result result of a state
 * @return {string}
 */
export function resultCode(result) {
	if (!result) {
		return ''
	}
	const winners = result.winners?.length ? result.winners : result.winner === null ? [] : [result.winner]
	const reason = String(result.reason ?? '')
	if (winners.length === 0) {
		return 'draw/' + reason
	}
	return 'win:' + [...winners].sort((a, b) => a - b).join(',') + '/' + reason
}

/**
 * The text of a world: the board with side, type and id per square, the hands by side and type, and the world's extra
 * data. Two worlds with the same text are the same position (as with `worldKey` of core/world.js).
 *
 * @param {object} b world
 * @return {string}
 */
function worldText(b) {
	const hands = []
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sq[id] === HAND) {
			hands.push(b.sd[id] + b.ty[id])
		}
	}
	hands.sort()
	const board = b.board.map((id) => (id < 0 ? '.' : b.sd[id] + b.ty[id] + id)).join(',')
	return board + '|' + hands.join('') + '|' + JSON.stringify(b.x)
}

/**
 * A hash of a position: the side to move and every world as its text and weight, in the stored order (16 hex digits,
 * FNV-1a-64). Local games key their roll memo with it; online games report it after every move.
 *
 * @param {object} state state
 * @return {string}
 */
export function positionHash(state) {
	const parts = [String(state.turn)]
	for (const { b, w } of state.worlds) {
		parts.push(worldText(b) + '@' + w)
	}
	return fnv1a64(parts.join(';'))
}

/**
 * @typedef {object} OnlineMove a stored move of an online variant game
 * @property {number} ply plies played before the move
 * @property {number} seat seat that played it
 * @property {string} code move code
 * @property {number} u the roll the server drew, an integer in [0, T)
 * @property {number|null} [nextSeat] claimed seat to move after it, null while the move is not settled
 * @property {string|null} [result] claimed result code after it (see `resultCode`)
 * @property {string|null} [stateHash] claimed position hash after it
 */

/**
 * @typedef {object} OnlineSettlement what a move leads to, as every browser computes it
 * @property {number} nextSeat seat to move after it
 * @property {string} result result code after it
 * @property {string} stateHash position hash after it
 */

/**
 * What a move leads to.
 *
 * @param {object} state state after the move
 * @return {OnlineSettlement}
 */
export function settlementOf(state) {
	return { nextSeat: state.turn, result: resultCode(state.result), stateHash: positionHash(state) }
}

/**
 * Replay the stored moves of an online game, from its start or from a snapshot, and compare every settled claim with
 * what the rules give. Stops at the first move that does not agree: the wrong ply, the wrong seat, an illegal move, a
 * roll outside [0, T), a move after the end of the game, or a claim (next seat, result, position hash) that differs.
 *
 * @param {object} V variant
 * @param {object} start the state to replay from: the start of the game, or a snapshot taken after `start.ply` plies
 * @param {OnlineMove[]} moves the stored moves; those before `start.ply` are skipped
 * @param {(move: OnlineMove, played: {state: object, branch: object, outcomes: object[]}, before: object) => void}
 *   [onStep] called after each move that agrees, with the result of `applyMove` and the state before the move
 * @return {{state: object, settlement: OnlineSettlement|null, mismatch: null|{ply: number, reason: string}}} the
 *   state after the last move that agrees, what that move leads to, and the first disagreement with the ply where
 *   the replay stopped
 */
export function replayOnline(V, start, moves, onStep = null) {
	let state = start
	let settlement = null
	for (const m of moves) {
		if (m.ply < start.ply) {
			continue
		}
		const fail = (reason) => ({ state, settlement, mismatch: { ply: state.ply, reason } })
		if (m.ply !== state.ply) {
			return fail('ply')
		}
		if (state.result) {
			return fail('finished')
		}
		if (m.seat !== state.turn) {
			return fail('seat')
		}
		if (!Number.isSafeInteger(m.u) || m.u < 0 || m.u >= T) {
			return fail('roll')
		}
		const played = applyMove(V, state, m.code, m.u / T)
		if (!played) {
			return fail('illegal')
		}
		const next = settlementOf(played.state)
		for (const field of ['nextSeat', 'result', 'stateHash']) {
			if (m[field] !== null && m[field] !== undefined && m[field] !== next[field]) {
				return fail(field)
			}
		}
		onStep?.(m, played, state)
		state = played.state
		settlement = next
	}
	return { state, settlement, mismatch: null }
}
