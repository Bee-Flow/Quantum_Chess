/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The moves of an online game as this browser has verified them. Every stored move is replayed with the JavaScript
 * rules engine and its recorded roll `u`, and the hash chain is recomputed (docs/engine-rules.md §9.4). A move whose
 * result or chain differs from what the server stored marks the history as altered; the server's position still wins.
 */

import { ref, shallowRef } from 'vue'
import { initialState, serializeState } from '../../engine/index.js'
import { chainAfter, chainKey, replayMove, sameMeasurement, storeChain, verifyGame } from '../chainCheck.js'

/** @typedef {import('../../services/api.js').GameFull} GameFull */
/** @typedef {import('../../services/api.js').MoveDTO} MoveDTO */

/**
 * @param {object} options the game
 * @param {import('vue').ShallowRef<object|null>} options.game the game record (GameLive)
 * @param {string|null} options.me the viewer's user id
 * @param {(event: object) => Promise<void>} options.animate plays a move event on the board, if one is attached
 * @param {(mover: 'w'|'b') => {mover: string, opponent: string}} options.eventNames names for a move event
 * @return {object} {states, state, startState, moves, lastMove, altered, unverifiable, stateAt, verify, pushConfirmed,
 *   reconcileState, rebuild, rememberChain, ingestMoves, rollBack}
 */
export function useOnlineReplay({ game, me, animate, eventNames }) {
	/** The position after every verified move; `states[0]` is the start. */
	const states = [initialState()]
	/** The displayed position (it runs ahead of `states` while an own move is shown optimistically). */
	const state = shallowRef(states[0])
	const startState = shallowRef(null)
	const moves = ref([])
	const lastMove = shallowRef(null)
	/** The first move that does not match what the server stored: `{ply}`, or null. */
	const altered = ref(null)
	/** The chain cannot be checked, because a player's account (and with it the chain's start) was deleted. */
	const unverifiable = ref(false)
	let chainHead = null
	let confirmedLast = null

	/**
	 * The position after n moves (0 = start).
	 *
	 * @param {number} n number of moves
	 * @return {object}
	 */
	function stateAt(n) {
		return states[Math.max(0, Math.min(n, states.length - 1))]
	}

	/**
	 * A MoveEntry of a stored move.
	 *
	 * @param {MoveDTO} dto the stored move
	 * @param {{move: object, measurement: object|null}} applied replay result
	 * @return {import('../../game/gameController.js').MoveEntry}
	 */
	function toEntry(dto, applied) {
		return {
			ply: dto.ply,
			color: dto.color,
			code: applied.move.code,
			notation: dto.notation,
			measurement: applied.measurement,
			u: applied.measurement?.u ?? null,
			by: dto.userId === me ? 'human' : 'opponent',
			createdAt: dto.createdAt,
			chain: dto.chain,
		}
	}

	/**
	 * Mark the history as altered from this ply on (the first mark wins).
	 *
	 * @param {number} ply first ply that does not match
	 */
	function markAltered(ply) {
		if (altered.value === null) {
			altered.value = { ply }
		}
	}

	/**
	 * Check a replayed move against the server's record: the same result and the next link of the hash chain.
	 *
	 * @param {MoveDTO} dto the stored move
	 * @param {object} applied replay result
	 */
	function verify(dto, applied) {
		if (!sameMeasurement(dto, applied)) {
			markAltered(dto.ply)
		}
		if (chainHead !== null) {
			chainHead = chainAfter(chainHead, dto, applied)
			if (chainHead !== dto.chain) {
				markAltered(dto.ply)
			}
		}
	}

	/**
	 * Show a move the server stored.
	 *
	 * @param {MoveDTO} dto the stored move
	 * @param {object} applied replay result
	 */
	function pushConfirmed(dto, applied) {
		states.push(applied.state)
		moves.value = [...moves.value, toEntry(dto, applied)]
		state.value = applied.state
		confirmedLast = { move: applied.move, key: applied.measurement?.key ?? null }
		lastMove.value = confirmedLast
	}

	/**
	 * Take over the server's position when the replayed one differs: the server wins.
	 *
	 * @param {object|null} serverState the position of a GameLive
	 */
	function reconcileState(serverState) {
		if (!serverState || !game.value || game.value.ply !== moves.value.length) {
			return
		}
		if (serializeState(serverState) !== serializeState(state.value)) {
			states[states.length - 1] = serverState
			state.value = serverState
		}
	}

	/** Store the last verified (ply, chain), to notice when the server later changes an earlier move. */
	function rememberChain() {
		const last = moves.value[moves.value.length - 1]
		if (last && altered.value === null && chainHead !== null && game.value) {
			storeChain(chainKey(game.value), last.ply, last.chain)
		}
	}

	/**
	 * Replay a whole game (GameFull): the positions, the move list and the chain. The caller adopts the game record
	 * and then calls `reconcileState()`.
	 *
	 * @param {GameFull} full the game
	 * @return {{complete: boolean}} whether every stored move could be replayed
	 */
	function rebuild(full) {
		const checked = verifyGame(full)
		states.length = 0
		states.push(...checked.states)
		startState.value = full.startState ?? null
		moves.value = checked.steps.map((step, i) => toEntry(full.moves[i], { move: step.move, measurement: step.measurement }))
		state.value = states[states.length - 1]
		const last = checked.steps[checked.steps.length - 1]
		confirmedLast = last ? { move: last.move, key: last.measurement?.key ?? null } : null
		lastMove.value = confirmedLast
		chainHead = checked.chain
		unverifiable.value = checked.status === 'unverifiable' && !!full.startedAt
		if (checked.status === 'altered') {
			markAltered(checked.alteredPly)
		}
		return { complete: checked.steps.length === full.moves.length }
	}

	/**
	 * Replay and show moves from the server (polled, or after a conflict). Only the last one is animated.
	 *
	 * @param {object[]|undefined} dtos MoveDTO list
	 */
	async function ingestMoves(dtos) {
		const fresh = [...(dtos ?? [])].sort((a, b) => a.ply - b.ply).filter((m) => m.ply >= moves.value.length)
		for (let i = 0; i < fresh.length; i++) {
			const dto = fresh[i]
			if (dto.ply !== moves.value.length) {
				break
			}
			const before = states[states.length - 1]
			let applied
			try {
				applied = replayMove(before, dto)
			} catch {
				markAltered(dto.ply)
				return
			}
			verify(dto, applied)
			if (i === fresh.length - 1) {
				await animate({
					before,
					after: applied.state,
					move: applied.move,
					measurement: applied.measurement,
					actor: 'opponent',
					names: eventNames(before.turn),
				})
			}
			pushConfirmed(dto, applied)
		}
		rememberChain()
	}

	/** Show the last verified position again (after an own move was refused or dropped). */
	function rollBack() {
		state.value = states[states.length - 1]
		lastMove.value = confirmedLast
	}

	return {
		states,
		state,
		startState,
		moves,
		lastMove,
		altered,
		unverifiable,
		stateAt,
		verify,
		pushConfirmed,
		reconcileState,
		rebuild,
		rememberChain,
		ingestMoves,
		rollBack,
	}
}
