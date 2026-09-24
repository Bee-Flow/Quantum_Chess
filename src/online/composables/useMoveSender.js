/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Sending the user's own moves in an online game. Certain and quantum moves are shown at once (optimistically); rolled
 * moves start the roll animation, which lands on the server's result. A move keeps its `clientId` across retries, so
 * the server never plays it twice. Network failures and server errors are retried with a backoff; after the last try
 * the move waits in a banner (Retry, Undo). A refused move is rolled back and the game catches up.
 */

import { t } from '@nextcloud/l10n'
import { findMove } from '../../engine/index.js'
import { uuid } from '../../services/ids.js'
import { replayMove } from '../chainCheck.js'

/** @typedef {import('../../engine/types.js').LegalMove} LegalMove */

/** Delays before the retries of a move that could not be sent. */
export const RETRY_DELAYS_MS = [1000, 3000, 9000]

/**
 * A network failure or server error worth retrying with the same clientId.
 *
 * @param {unknown} e error
 * @return {boolean}
 */
const transient = (e) => (e?.status ?? 0) === 0 || e.status >= 500

/**
 * @param {object} game the game's controller state
 * @param {number} game.gameId the game id
 * @param {object} game.api the HTTP client (`services/api.js`)
 * @param {object} game.replay the verified moves (`useOnlineReplay()`)
 * @param {import('vue').ShallowRef<object|null>} game.pending the move on its way
 * @param {import('vue').ComputedRef<boolean>} game.interactive the board accepts a move now
 * @param {() => object|null} game.animator the board's animator, if attached
 * @param {(run: () => unknown) => Promise<void>} game.animate runs an animation while `animating` is set
 * @param {(mover: 'w'|'b') => {mover: string, opponent: string}} game.eventNames names for a move event
 * @param {{fastSince: number, turnSince: number}} game.timing when the game got busy, and when the user's turn began
 * @param {(live: object) => void} game.adopt take over a game record from the server
 * @param {(res: object) => Promise<void>} game.ingest take in moves, chat and a game record from the server
 * @param {() => Promise<void>} game.catchUp fetch the moves and chat this browser is missing
 * @param {() => Promise<void>} game.load reload the whole game
 * @param {() => void} game.pollNow poll the server now
 * @param {() => boolean} game.disposed the view was left
 * @param {object} deps injected dependencies: notify {error, info}, sleep, now, onLobbyChange
 * @return {{submitMove: (move: object) => Promise<void>, retryPending: () => Promise<void>,
 *   discardPending: () => Promise<void>}}
 */
export function useMoveSender(game, deps) {
	const { gameId, api, replay, pending, interactive, animator, animate, eventNames, timing } = game

	/**
	 * A committed move of the local user.
	 *
	 * @param {LegalMove} move the move
	 */
	async function submitMove(move) {
		if (!interactive.value) {
			return
		}
		const before = replay.state.value
		const legal = findMove(before, move.code ?? move)
		if (!legal) {
			return
		}
		timing.fastSince = deps.now()
		const p = {
			code: legal.code,
			phase: 'sending',
			attempt: 1,
			clientId: uuid(),
			ply: before.ply,
			thinkMs: Math.max(0, deps.now() - timing.turnSince),
			before,
			move: legal,
			handle: null,
			optimistic: false,
		}
		pending.value = p
		if (legal.resolution === 'rolled') {
			p.handle = animator()?.startRoll({ before, move: legal, actor: 'self' }) ?? null
		} else {
			const applied = replayMove(before, { code: legal.code, measurement: null })
			p.optimistic = true
			await animate(() => animator()?.play({
				before,
				after: applied.state,
				move: applied.move,
				measurement: null,
				actor: 'self',
				names: eventNames(before.turn),
			}))
			replay.state.value = applied.state
			replay.lastMove.value = { move: applied.move, key: null }
		}
		await send(p)
	}

	/**
	 * Send (or resend) the pending move, retrying transient failures.
	 *
	 * @param {object} p pending move
	 */
	async function send(p) {
		for (let attempt = 0; ; attempt++) {
			if (pending.value?.clientId !== p.clientId || game.disposed()) {
				return
			}
			try {
				const res = await api.sendMove(gameId, {
					code: p.code,
					ply: p.ply,
					clientId: p.clientId,
					thinkMs: p.thinkMs,
				})
				await confirm(p, res)
				return
			} catch (e) {
				if (pending.value?.clientId !== p.clientId) {
					return
				}
				const retryable = e?.status === 429 || transient(e)
				if (retryable && attempt < RETRY_DELAYS_MS.length) {
					pending.value = { ...p, phase: 'retrying', attempt: attempt + 2 }
					p = pending.value
					await deps.sleep(e?.status === 429 && e.retryAfter ? e.retryAfter * 1000 : RETRY_DELAYS_MS[attempt])
					continue
				}
				if (retryable) {
					if (p.handle) {
						await p.handle.fail()
						p.handle = null
					}
					pending.value = { ...p, phase: 'failed', handle: null }
					return
				}
				await reject(p, e)
				return
			}
		}
	}

	/**
	 * The server stored the move: replay it with the recorded roll, animate the roll, reconcile.
	 *
	 * @param {object} p pending move
	 * @param {object} res move response {game, move, measurement, chain}
	 */
	async function confirm(p, res) {
		const dto = res.move
		const applied = replayMove(p.before, dto)
		replay.verify(dto, applied)
		await animate(async () => {
			if (p.handle) {
				await p.handle.resolve({
					after: applied.state,
					measurement: applied.measurement,
					names: eventNames(p.before.turn),
				})
			} else if (!p.optimistic && animator()) {
				await animator().play({
					before: p.before,
					after: applied.state,
					move: applied.move,
					measurement: applied.measurement,
					actor: 'self',
					names: eventNames(p.before.turn),
				})
			}
		})
		replay.pushConfirmed(dto, applied)
		pending.value = null
		game.adopt(res.game)
		replay.reconcileState(res.game?.state)
		replay.rememberChain()
		deps.onLobbyChange()
		game.pollNow()
	}

	/**
	 * The server refused the move: roll back and catch up.
	 *
	 * @param {object} p pending move
	 * @param {object} e ApiError
	 */
	async function reject(p, e) {
		if (p.handle) {
			await p.handle.fail()
		}
		rollBack(p)
		if (e?.code === 'conflict' || e?.code === 'not_your_turn') {
			deps.notify.info(t('quantumchess', 'Your opponent moved first'))
		} else if (e?.code === 'illegal_move') {
			deps.notify.error(t('quantumchess', 'That move is no longer possible'))
		} else if (e?.code !== 'game_over') {
			deps.notify.error(e?.message || t('quantumchess', 'The move could not be sent'))
		}
		try {
			const full = e?.data?.game
			if (full?.moves) {
				await game.ingest({ game: full, moves: full.moves, chat: full.chat })
			} else {
				await game.catchUp()
			}
		} catch {
			await game.load()
		}
	}

	/**
	 * Undo the optimistic display of a pending move.
	 *
	 * @param {object} p pending move
	 */
	function rollBack(p) {
		if (pending.value?.clientId === p.clientId) {
			pending.value = null
		}
		replay.rollBack()
	}

	/** Send the failed move again (same clientId). */
	async function retryPending() {
		const p = pending.value
		if (!p || p.phase !== 'failed') {
			return
		}
		const again = { ...p, phase: 'sending', attempt: 1 }
		pending.value = again
		await send(again)
	}

	/** Give up on the failed move (it may still arrive through polling if the server stored it). */
	async function discardPending() {
		const p = pending.value
		if (!p || p.phase !== 'failed') {
			return
		}
		rollBack(p)
		game.pollNow()
	}

	return { submitMove, retryPending, discardPending }
}
