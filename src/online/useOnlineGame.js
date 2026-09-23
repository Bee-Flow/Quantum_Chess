/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The controller of online games (SPEC §14.4.5, GAME-DESIGN §7.5–7.11). The server is authoritative: certain and
 * quantum moves are shown optimistically, rolled moves start the roll animation and land on the server's result.
 * Every move (own, polled, adopted after a conflict) is replayed with its recorded `u` and the hash chain is
 * recomputed; the server state wins on any difference. Moves are sent with a `clientId` that is reused on retries.
 */

import { showError, showInfo } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'
import { computed, ref, shallowRef } from 'vue'
import { NO_CAPABILITIES } from '../composables/gameController.js'
import { findMove, generateMoves, initialState, serializeState } from '../engine/index.js'
import * as realApi from '../services/api.js'
import { formatDeadline } from '../services/format.js'
import { uuid } from '../services/ids.js'
import { currentUser } from '../services/initialState.js'
import { chainAfter, chainKey, replayMove, sameMeasurement, storeChain, verifyGame } from './chainCheck.js'
import { PHRASE_KEYS } from './chatText.js'
import { usePoller } from './usePoller.js'

export const RETRY_DELAYS_MS = [1000, 3000, 9000]
const FINAL = ['finished', 'aborted', 'declined', 'cancelled', 'expired']

/**
 * Wait.
 *
 * @param {number} ms delay
 * @return {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A game without its move list and chat (GameFull → GameLive shape).
 *
 * @param {object} full GameFull or GameLive
 * @return {object}
 */
function withoutLists(full) {
	const copy = { ...full }
	delete copy.moves
	delete copy.chat
	return copy
}

/**
 * A network failure or server error worth retrying with the same clientId.
 *
 * @param {any} e error
 * @return {boolean}
 */
const transient = (e) => (e?.status ?? 0) === 0 || e.status >= 500

/**
 * @param {number|string} id game id
 * @param {object} [deps] injected dependencies (tests): api, me, notify {error, info}, sleep, now, onRematchStarted,
 *   onLobbyChange, poller options
 * @return {object} GameController plus {game, chat, unread, markChatSeen, sendChat, setMuted, connection, altered,
 *   unverifiable, rematchGame, rematchState, accept, decline, cancel, join, load, start, shareUrl}
 */
export function useOnlineGame(id, deps = {}) {
	const d = {
		api: realApi,
		me: currentUser.uid,
		notify: { error: (text) => showError(text), info: (text) => showInfo(text) },
		sleep,
		now: () => Date.now(),
		onRematchStarted: () => {},
		onLobbyChange: () => {},
		poller: {},
		...deps,
	}
	const api = d.api
	const gameId = Number(id)

	const game = shallowRef(null)
	const chat = ref([])
	const moves = ref([])
	const states = [initialState()]
	const state = shallowRef(states[0])
	const startState = shallowRef(null)
	const lastMove = shallowRef(null)
	const loading = ref(true)
	const error = ref(null)
	const pending = shallowRef(null)
	const animating = ref(false)
	const altered = ref(null)
	const unverifiable = ref(false)
	const orientation = ref('w')
	const rematchGame = shallowRef(null)
	const seenChatId = ref(0)
	const clock = ref(d.now())
	let chainHead = null
	let confirmedLast = null
	let animator = null
	let disposed = false
	let serverOffset = 0
	let fastSince = d.now()
	let slowMs = 2000
	let rematchSince = 0
	let turnSince = d.now()
	let requestedRematch = false
	let poller = null

	const me = d.me
	const myColor = computed(() => game.value?.myColor ?? null)
	const participant = computed(() => {
		const g = game.value
		return !!g && !!me && [g.creator?.userId, g.opponent?.userId, g.white?.userId, g.black?.userId].includes(me)
	})
	const status = computed(() => game.value?.status ?? null)

	// --- Players -----------------------------------------------------------------------------------------------------

	/**
	 * The seat of a colour; before the game starts it is derived from the colour choice.
	 *
	 * @param {'w'|'b'} color colour
	 * @return {object|null} UserRef
	 */
	function seat(color) {
		const g = game.value
		if (!g) {
			return null
		}
		if (g.white || g.black) {
			return color === 'w' ? g.white : g.black
		}
		const creatorColor = g.colorChoice === 'b' ? 'b' : 'w'
		if (g.creator?.userId !== me && g.colorChoice === 'r') {
			// random colours: show the viewer at the bottom as White until the game starts
			return color === 'w' ? g.opponent ?? { userId: me, displayName: currentUser.displayName } : g.creator
		}
		return color === creatorColor ? g.creator : g.opponent
	}

	/**
	 * Display name of a side.
	 *
	 * @param {'w'|'b'} color colour
	 * @return {string}
	 */
	function nameOf(color) {
		const user = seat(color)
		if (user?.displayName) {
			return user.displayName
		}
		if (game.value?.status === 'open') {
			return t('quantumchess', 'Open seat')
		}
		return color === 'w' ? t('quantumchess', 'White') : t('quantumchess', 'Black')
	}

	const names = computed(() => ({ w: nameOf('w'), b: nameOf('b') }))

	/**
	 * Names for an animation event.
	 *
	 * @param {'w'|'b'} mover side
	 * @return {{mover: string, opponent: string}}
	 */
	const eventNames = (mover) => ({ mover: names.value[mover], opponent: names.value[mover === 'w' ? 'b' : 'w'] })

	const players = computed(() => {
		const g = game.value
		const out = {}
		for (const color of ['w', 'b']) {
			const user = seat(color)
			const rating = g?.ratings?.[color] ?? null
			let statusText = ''
			if (g && (g.status === 'pending' || g.status === 'open')) {
				statusText = t('quantumchess', 'Not started yet')
			} else if (g?.status === 'active' && g.turn === color) {
				const left = g.deadlineAt ? formatDeadline(g.deadlineAt, clock.value / 1000 + serverOffset) : ''
				const who = color === myColor.value ? t('quantumchess', 'Your move') : t('quantumchess', '{name} to move', { name: names.value[color] })
				statusText = '● ' + who + (left ? ' · ' + left : '')
			}
			out[color] = {
				color,
				kind: 'user',
				name: names.value[color],
				userId: user?.userId ?? undefined,
				rating: rating?.rating ?? undefined,
				provisional: rating?.provisional ?? false,
				deadlineAt: g?.deadlineAt ?? undefined,
				statusText,
			}
		}
		return out
	})

	// --- Derived game state ------------------------------------------------------------------------------------------

	const interactive = computed(() => !loading.value && !error.value && status.value === 'active' && !pending.value
		&& !animating.value && myColor.value !== null && state.value.turn === myColor.value && game.value.turn === myColor.value
		&& state.value.result === null)
	const legalMoves = computed(() => (interactive.value ? generateMoves(state.value) : []))
	const movableColor = computed(() => myColor.value)

	const result = computed(() => {
		const g = game.value
		if (g?.status === 'finished') {
			return { result: g.result, reason: g.resultReason, winner: g.winner ?? null, source: 'server' }
		}
		if (g?.status === 'aborted') {
			return { result: '*', reason: 'aborted', winner: null, source: 'server' }
		}
		return null
	})

	const fairPlayLock = computed(() => participant.value && status.value === 'active')
	const drawOffer = computed(() => game.value?.drawOffer ?? null)
	const can = computed(() => {
		const g = game.value
		const active = participant.value && g?.status === 'active' && !animating.value
		return {
			...NO_CAPABILITIES,
			resign: active && !!g.canResign && g.ply >= 2,
			abort: active && !!g.canAbort,
			offerDraw: active && !!g.canOfferDraw,
			answerDraw: active && !!drawOffer.value && drawOffer.value.by !== myColor.value,
			rematch: participant.value && !!g?.canRematch,
			chat: participant.value && !!g?.chatOpen,
			coach: !fairPlayLock.value,
			analysis: !fairPlayLock.value,
		}
	})

	const rematchState = computed(() => {
		const r = rematchGame.value
		if (!r || r.status !== 'pending') {
			return null
		}
		return r.creator?.userId === me ? 'pending' : 'offered'
	})

	const unread = computed(() => chat.value.filter((m) => m.kind !== 'system' && m.userId !== me && m.id > seenChatId.value).length)

	/** Everything read. */
	function markChatSeen() {
		seenChatId.value = chat.value.reduce((max, m) => Math.max(max, m.id), seenChatId.value)
	}

	// --- Replay and adoption -----------------------------------------------------------------------------------------

	/**
	 * A MoveEntry of a stored move.
	 *
	 * @param {object} dto MoveDTO
	 * @param {object} applied replay result
	 * @return {object}
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
	 * Show a move the server stored.
	 *
	 * @param {object} dto MoveDTO
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
	 * Mark the history as altered.
	 *
	 * @param {number} ply first ply that does not match
	 */
	function markAltered(ply) {
		if (altered.value === null) {
			altered.value = { ply }
		}
	}

	/**
	 * Take over the server's state when the replayed one differs (the server wins).
	 *
	 * @param {object|null} serverState state of a GameLive
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

	/**
	 * Adopt a GameLive (without moves and chat).
	 *
	 * @param {object} live GameLive or GameFull
	 */
	function adopt(live) {
		if (!live) {
			return
		}
		const rest = withoutLists(live)
		delete rest.startState
		const before = game.value
		game.value = { ...rest, startState: before?.startState ?? live.startState ?? null }
		if (Number.isFinite(live.now)) {
			serverOffset = live.now - d.now() / 1000
		}
		if (live.myColor && (!before || !before.myColor)) {
			orientation.value = live.myColor
		}
		if (live.turn === live.myColor && before?.turn !== live.turn) {
			turnSince = d.now()
		}
		if (live.rematchId && live.rematchId !== before?.rematchId) {
			loadRematch(live.rematchId)
		}
	}

	/**
	 * Merge chat messages (by id).
	 *
	 * @param {object[]} list ChatDTO[]
	 */
	function mergeChat(list) {
		if (!list?.length) {
			return
		}
		const known = new Set(chat.value.map((m) => m.id))
		const fresh = list.filter((m) => !known.has(m.id))
		if (fresh.length) {
			chat.value = [...chat.value, ...fresh].sort((a, b) => a.id - b.id)
		}
	}

	/**
	 * Build everything from a GameFull.
	 *
	 * @param {object} full GameFull
	 */
	function rebuild(full) {
		const checked = verifyGame(full)
		states.length = 0
		states.push(...checked.states)
		startState.value = full.startState ?? null
		const list = []
		checked.steps.forEach((step, i) => list.push(toEntry(full.moves[i], { move: step.move, measurement: step.measurement })))
		moves.value = list
		state.value = states[states.length - 1]
		const last = checked.steps[checked.steps.length - 1]
		confirmedLast = last ? { move: last.move, key: last.measurement?.key ?? null } : null
		lastMove.value = confirmedLast
		chainHead = checked.chain
		unverifiable.value = checked.status === 'unverifiable' && !!full.startedAt
		if (checked.status === 'altered') {
			markAltered(checked.alteredPly)
		}
		adopt(full)
		if (full.state && checked.steps.length === full.moves.length) {
			reconcileState(full.state)
		} else if (full.state) {
			state.value = full.state
		}
		chat.value = [...(full.chat ?? [])]
		if (!seenChatId.value) {
			markChatSeen()
		}
		rememberChain()
	}

	/** Store the last verified (ply, chain). */
	function rememberChain() {
		const last = moves.value[moves.value.length - 1]
		if (last && altered.value === null && chainHead !== null && game.value) {
			storeChain(chainKey(game.value), last.ply, last.chain)
		}
	}

	/**
	 * Replay and show moves from the server (polled, or after a conflict). Only the last one is animated.
	 *
	 * @param {object[]} dtos MoveDTO[]
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
			if (!sameMeasurement(dto, applied)) {
				markAltered(dto.ply)
			}
			if (chainHead !== null) {
				chainHead = chainAfter(chainHead, dto, applied)
				if (chainHead !== dto.chain) {
					markAltered(dto.ply)
				}
			}
			if (i === fresh.length - 1 && animator) {
				animating.value = true
				try {
					const mover = before.turn
					await animator.play({
						before,
						after: applied.state,
						move: applied.move,
						measurement: applied.measurement,
						actor: 'opponent',
						names: eventNames(mover),
					})
				} catch {
					// an animation failure never blocks the game
				} finally {
					animating.value = false
				}
			}
			pushConfirmed(dto, applied)
		}
		rememberChain()
	}

	/**
	 * Take in a changed poll answer (or any {game, moves, chat}).
	 *
	 * @param {object} res {game, moves, chat}
	 */
	async function ingest(res) {
		await ingestMoves(res.moves)
		mergeChat(res.chat)
		adopt(res.game)
		reconcileState(res.game?.state)
		if (res.game && res.game.ply > moves.value.length) {
			await catchUp()
		}
	}

	/** Fetch whatever is missing (moves from our ply, chat after our last id). */
	async function catchUp() {
		const res = await api.pollGame(gameId, { rev: 0, ply: moves.value.length, chat: lastChatId() })
		if (res?.changed) {
			await ingestMoves(res.moves)
			mergeChat(res.chat)
			adopt(res.game)
			reconcileState(res.game?.state)
		}
	}

	/**
	 * The last chat id we have.
	 *
	 * @return {number}
	 */
	function lastChatId() {
		return chat.value.reduce((max, m) => Math.max(max, m.id), 0)
	}

	/** Load (or reload) the whole game. */
	async function load() {
		loading.value = true
		try {
			const full = await api.getGame(gameId)
			rebuild(full)
			error.value = null
		} catch (e) {
			error.value = e
		} finally {
			loading.value = false
		}
	}

	// --- Rematch -----------------------------------------------------------------------------------------------------

	/**
	 * Load the rematch game of a finished game.
	 *
	 * @param {number} rid rematch game id
	 */
	async function loadRematch(rid) {
		try {
			rematchGame.value = withoutLists(await api.getGame(rid))
			rematchSince = d.now()
			poller.pollNow()
		} catch {
			rematchGame.value = null
		}
	}

	/**
	 * React to a change of the rematch game (only changes seen in this session move the player).
	 *
	 * @param {string|null} before previous status
	 */
	function followRematch(before) {
		const r = rematchGame.value
		if (!r || r.status === before) {
			return
		}
		if (r.status === 'active' && (before === 'pending' || requestedRematch)) {
			d.notify.info(t('quantumchess', 'The rematch has started'))
			d.onRematchStarted(r.id)
		} else if (['declined', 'expired', 'cancelled'].includes(r.status) && before === 'pending' && r.creator?.userId === me) {
			requestedRematch = false
			d.notify.info(t('quantumchess', 'The rematch was declined'))
		}
	}

	// --- Polling -----------------------------------------------------------------------------------------------------

	/**
	 * The next poll delay (GAME-DESIGN §7.10).
	 *
	 * @param {{hidden: boolean}} ctx context
	 * @return {number|null}
	 */
	function interval({ hidden }) {
		const g = game.value
		const now = d.now()
		if (!g) {
			return hidden ? 60000 : 15000
		}
		if (g.status === 'active') {
			if (hidden) {
				return 60000
			}
			if (myColor.value && g.turn === myColor.value) {
				return 15000
			}
			if (now - fastSince < 20000) {
				slowMs = 2000
				return 2000
			}
			slowMs = Math.min(30000, Math.round(slowMs * 1.5))
			return slowMs
		}
		if (g.status === 'pending' || g.status === 'open') {
			return hidden ? 60000 : (now - fastSince < 120000 ? 3000 : 15000)
		}
		if (g.status === 'finished' || g.status === 'aborted') {
			if (hidden) {
				return null
			}
			if (rematchGame.value?.status === 'pending') {
				return now - rematchSince < 120000 ? 3000 : 30000
			}
			// right after the end a rematch offer is likely: stay quick for two minutes
			if (now - Math.max(fastSince, (g.finishedAt ?? 0) * 1000 - serverOffset * 1000) < 120000) {
				return 3000
			}
			return g.chatOpen ? 30000 : null
		}
		return null
	}

	/**
	 * One poll of the game (and of a pending rematch).
	 *
	 * @param {{signal: AbortSignal}} options abort signal
	 */
	async function pollOnce({ signal }) {
		if (!game.value || pending.value || animating.value || disposed) {
			return
		}
		const res = await api.pollGame(gameId, { rev: game.value.rev, ply: moves.value.length, chat: lastChatId(), watching: 1 }, { signal })
		if (res?.changed && !pending.value) {
			const hadTurn = game.value.turn
			await ingest(res)
			if (game.value.turn !== hadTurn || res.chat?.length) {
				d.onLobbyChange()
			}
		} else if (Number.isFinite(res?.now)) {
			serverOffset = res.now - d.now() / 1000
		}
		const r = rematchGame.value
		if (r?.status === 'pending') {
			const rr = await api.pollGame(r.id, { rev: r.rev, ply: 0, chat: 0 }, { signal })
			if (rr?.changed && rr.game) {
				rematchGame.value = rr.game
				followRematch('pending')
			}
		}
	}

	poller = usePoller(pollOnce, {
		interval,
		onWake: () => {
			fastSince = d.now()
		},
		...d.poller,
	})

	// --- Own moves ---------------------------------------------------------------------------------------------------

	/**
	 * A committed move of the local user (GAME-DESIGN §7.5).
	 *
	 * @param {object} move LegalMove
	 */
	async function submitMove(move) {
		if (!interactive.value) {
			return
		}
		const before = state.value
		const legal = findMove(before, move.code ?? move)
		if (!legal) {
			return
		}
		fastSince = d.now()
		const p = {
			code: legal.code,
			phase: 'sending',
			attempt: 1,
			clientId: uuid(),
			ply: before.ply,
			thinkMs: Math.max(0, d.now() - turnSince),
			before,
			move: legal,
			handle: null,
			optimistic: false,
		}
		pending.value = p
		if (legal.resolution === 'rolled') {
			p.handle = animator?.startRoll({ before, move: legal, actor: 'self' }) ?? null
		} else {
			const applied = replayMove(before, { code: legal.code, measurement: null })
			p.optimistic = true
			animating.value = true
			try {
				await animator?.play({ before, after: applied.state, move: applied.move, measurement: null, actor: 'self', names: eventNames(before.turn) })
			} catch {
				// never blocks
			} finally {
				animating.value = false
			}
			state.value = applied.state
			lastMove.value = { move: applied.move, key: null }
		}
		await send(p)
	}

	/**
	 * Send (or resend) the pending move.
	 *
	 * @param {object} p pending move
	 */
	async function send(p) {
		for (let attempt = 0; ; attempt++) {
			if (pending.value?.clientId !== p.clientId || disposed) {
				return
			}
			try {
				const res = await api.sendMove(gameId, { code: p.code, ply: p.ply, clientId: p.clientId, thinkMs: p.thinkMs })
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
					await d.sleep(e?.status === 429 && e.retryAfter ? e.retryAfter * 1000 : RETRY_DELAYS_MS[attempt])
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
	 * The server stored the move: replay it with the recorded u, animate the roll, reconcile.
	 *
	 * @param {object} p pending move
	 * @param {object} res move response {game, move, measurement, chain}
	 */
	async function confirm(p, res) {
		const dto = res.move
		const applied = replayMove(p.before, dto)
		if (!sameMeasurement(dto, applied)) {
			markAltered(dto.ply)
		}
		if (chainHead !== null) {
			chainHead = chainAfter(chainHead, dto, applied)
			if (chainHead !== dto.chain) {
				markAltered(dto.ply)
			}
		}
		animating.value = true
		try {
			if (p.handle) {
				await p.handle.resolve({ after: applied.state, measurement: applied.measurement, names: eventNames(p.before.turn) })
			} else if (!p.optimistic && animator) {
				await animator.play({ before: p.before, after: applied.state, move: applied.move, measurement: applied.measurement, actor: 'self', names: eventNames(p.before.turn) })
			}
		} catch {
			// never blocks
		} finally {
			animating.value = false
		}
		pushConfirmed(dto, applied)
		pending.value = null
		adopt(res.game)
		reconcileState(res.game?.state)
		rememberChain()
		d.onLobbyChange()
		poller.pollNow()
	}

	/**
	 * The server refused the move: roll back and catch up.
	 *
	 * @param {object} p pending move
	 * @param {any} e ApiError
	 */
	async function reject(p, e) {
		if (p.handle) {
			await p.handle.fail()
		}
		rollBack(p)
		if (e?.code === 'conflict' || e?.code === 'not_your_turn') {
			d.notify.info(t('quantumchess', 'Your opponent moved first'))
		} else if (e?.code === 'illegal_move') {
			d.notify.error(t('quantumchess', 'That move is no longer possible'))
		} else if (e?.code !== 'game_over') {
			d.notify.error(e?.message || t('quantumchess', 'The move could not be sent'))
		}
		try {
			const full = e?.data?.game
			if (full?.moves) {
				await ingest({ game: full, moves: full.moves, chat: full.chat })
			} else {
				await catchUp()
			}
		} catch {
			await load()
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
		state.value = states[states.length - 1]
		lastMove.value = confirmedLast
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
		poller.pollNow()
	}

	// --- Actions -----------------------------------------------------------------------------------------------------

	/**
	 * Run a game action that answers with a game, adopt it and catch up.
	 *
	 * @param {Function} fn API call
	 * @return {Promise<object|null>} the game
	 */
	async function act(fn) {
		try {
			const live = await fn()
			if (live?.id === gameId) {
				adopt(live)
				if (live.ply > moves.value.length) {
					await catchUp()
				}
			}
			d.onLobbyChange()
			poller.pollNow()
			return live
		} catch (e) {
			d.notify.error(e?.message || t('quantumchess', 'That did not work. Please try again.'))
			poller.pollNow()
			return null
		}
	}

	const resign = () => act(() => api.resignGame(gameId))
	const abort = () => act(() => api.abortGame(gameId))
	const offerDraw = () => act(() => api.drawAction(gameId, 'offer'))
	const answerDraw = (accept) => act(() => api.drawAction(gameId, accept ? 'accept' : 'decline'))

	/** Rematch: accept the other player's offer, or offer one. */
	async function rematch() {
		const r = rematchGame.value
		if (r?.status === 'pending' && r.creator?.userId === me) {
			return
		}
		if (r?.status === 'active') {
			d.onRematchStarted(r.id)
			return
		}
		requestedRematch = true
		const before = r?.status ?? null
		const next = await act(() => api.requestRematch(gameId))
		if (next) {
			rematchGame.value = withoutLists(next)
			rematchSince = d.now()
			followRematch(before)
		}
	}

	/** Withdraw the own rematch offer. */
	async function cancelRematch() {
		const r = rematchGame.value
		if (r?.status === 'pending' && r.creator?.userId === me) {
			requestedRematch = false
			const res = await act(() => api.cancelGame(r.id))
			if (res) {
				rematchGame.value = res
			}
		}
	}

	/** Decline the other player's rematch offer. */
	async function declineRematch() {
		const r = rematchGame.value
		if (r?.status === 'pending') {
			const res = await act(() => api.declineGame(r.id))
			if (res) {
				rematchGame.value = res
			}
		}
	}

	/**
	 * Accept, decline, cancel or join this game, then reload.
	 *
	 * @param {Function} fn API call
	 * @return {Promise<boolean>} success
	 */
	async function answer(fn) {
		try {
			await fn()
			await load()
			fastSince = d.now()
			d.onLobbyChange()
			poller.pollNow()
			return true
		} catch (e) {
			d.notify.error(e?.message || t('quantumchess', 'That did not work. Please try again.'))
			await load()
			return false
		}
	}

	const accept = () => answer(() => api.acceptGame(gameId))
	const decline = () => answer(() => api.declineGame(gameId))
	const cancel = () => answer(() => api.cancelGame(gameId))
	const join = () => answer(() => api.joinGame(gameId))

	// --- Chat --------------------------------------------------------------------------------------------------------

	/**
	 * Send a text message or a quick phrase key.
	 *
	 * @param {string} textOrPhrase text or phrase key
	 * @return {Promise<boolean>} sent
	 */
	async function sendChat(textOrPhrase) {
		const body = PHRASE_KEYS.includes(textOrPhrase) ? { phrase: textOrPhrase } : { message: String(textOrPhrase) }
		try {
			const res = await api.sendChat(gameId, body)
			if (res?.message) {
				mergeChat([res.message])
				markChatSeen()
			}
			return true
		} catch (e) {
			d.notify.error(e?.message || t('quantumchess', 'The message could not be sent'))
			return false
		}
	}

	/**
	 * Mute or unmute the opponent's messages.
	 *
	 * @param {boolean} muted new state
	 */
	async function setMuted(muted) {
		try {
			const res = await api.muteChat(gameId, muted)
			game.value = { ...game.value, muted: !!res?.muted }
		} catch (e) {
			d.notify.error(e?.message || t('quantumchess', 'That did not work. Please try again.'))
		}
	}

	// --- Banners -----------------------------------------------------------------------------------------------------

	const banners = computed(() => {
		const list = []
		if (altered.value) {
			list.push({ id: 'altered', type: 'error', text: t('quantumchess', 'Game history was altered on the server'), actions: [] })
		} else if (unverifiable.value) {
			list.push({ id: 'unverifiable', type: 'info', text: t('quantumchess', 'Can’t be verified: a player’s account was deleted'), actions: [] })
		}
		if (pending.value?.phase === 'failed') {
			list.push({
				id: 'pending',
				type: 'warning',
				text: t('quantumchess', 'Your move hasn’t been sent'),
				actions: [
					{ label: t('quantumchess', 'Retry'), handler: retryPending },
					{ label: t('quantumchess', 'Undo'), handler: discardPending },
				],
			})
		}
		const c = poller.connection.value
		if (c === 'expired') {
			list.push({ id: 'connection', type: 'error', text: t('quantumchess', 'Your session expired. Reload the page.'), actions: [{ label: t('quantumchess', 'Reload'), handler: () => globalThis.location?.reload() }] })
		} else if (c === 'maintenance') {
			list.push({ id: 'connection', type: 'warning', text: t('quantumchess', 'Nextcloud is in maintenance mode'), actions: [] })
		} else if (c === 'retrying' || c === 'offline' || pending.value?.phase === 'retrying') {
			list.push({ id: 'connection', type: 'warning', text: t('quantumchess', 'Connection lost, retrying…'), actions: [] })
		}
		return list
	})

	// --- Lifecycle ---------------------------------------------------------------------------------------------------

	/**
	 * State after n moves (0 = start).
	 *
	 * @param {number} n number of moves
	 * @return {object}
	 */
	function stateAt(n) {
		return states[Math.max(0, Math.min(n, states.length - 1))]
	}

	/**
	 * Attach the board's Animator.
	 *
	 * @param {object} a Animator
	 * @return {() => void} detach
	 */
	function attachAnimator(a) {
		animator = a
		return () => {
			if (animator === a) {
				animator = null
			}
		}
	}

	/** Turn the board. */
	function flip() {
		orientation.value = orientation.value === 'w' ? 'b' : 'w'
	}

	let clockTimer = null

	/** Load and start polling. */
	async function start() {
		await load()
		if (disposed) {
			return
		}
		fastSince = d.now()
		clockTimer = setInterval(() => {
			clock.value = d.now()
		}, 30000)
		if (!error.value || error.value?.status !== 404) {
			poller.start({ immediate: false })
		}
	}

	/** Stop everything. */
	function dispose() {
		disposed = true
		poller.stop()
		clearInterval(clockTimer)
	}

	const noop = async () => {}

	return {
		kind: 'online',
		id: ref(gameId),
		loading,
		error,
		state,
		startState,
		legalMoves,
		moves,
		players,
		names,
		myColor,
		movableColor,
		orientation,
		interactive,
		result,
		pending,
		can,
		fairPlayLock,
		banners,
		lastMove,
		animating,
		submitMove,
		stateAt,
		attachAnimator,
		flip,
		undo: noop,
		resign,
		abort,
		offerDraw,
		answerDraw,
		rematch,
		declineRematch,
		cancelRematch,
		retryPending,
		discardPending,
		dispose,
		// online extras (SPEC §14.4.5)
		game,
		chat,
		unread,
		markChatSeen,
		sendChat,
		setMuted,
		connection: poller.connection,
		altered,
		unverifiable,
		drawOffer,
		participant,
		rematchGame,
		rematchState,
		isFinal: computed(() => FINAL.includes(status.value)),
		accept,
		decline,
		cancel,
		join,
		load,
		start,
		pollNow: () => poller.pollNow(),
		shareUrl: computed(() => (globalThis.location?.origin ?? '') + generateUrl('/apps/quantumchess/g/{id}', { id: gameId })),
	}
}
