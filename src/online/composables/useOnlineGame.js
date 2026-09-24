/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The GameController of online games. The server is authoritative: this controller loads the game, polls it for
 * changes, sends the user's moves and actions, and shows what the server stored. Every move is replayed and checked
 * against the hash chain (`useOnlineReplay.js`); own moves are sent by `useMoveSender.js`; rematches are followed by
 * `useRematch.js`.
 */

import { showError, showInfo } from '@nextcloud/dialogs'
import { t } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'
import { computed, ref, shallowRef } from 'vue'
import { generateMoves, otherColor } from '../../engine/index.js'
import { NO_CAPABILITIES } from '../../game/gameController.js'
import * as realApi from '../../services/api.js'
import { sleep } from '../../services/async.js'
import { currentUser } from '../../services/initialState.js'
import { onlineBanners } from '../onlineBanners.js'
import { isParticipant, onlinePlayerInfo, onlineResult, seatName } from '../onlinePlayers.js'
import { useMoveSender } from './useMoveSender.js'
import { useOnlineChat } from './useOnlineChat.js'
import { useOnlineReplay } from './useOnlineReplay.js'
import { usePoller } from './usePoller.js'
import { useRematch, withoutLists } from './useRematch.js'

export { RETRY_DELAYS_MS } from './useMoveSender.js'

/** @typedef {import('../../game/gameController.js').Animator} Animator */
/** @typedef {import('../../game/gameController.js').GameController} GameController */
/** @typedef {import('../../services/api.js').ChatDTO} ChatDTO */
/** @typedef {import('../../services/api.js').GameFull} GameFull */
/** @typedef {import('../../services/api.js').GameLive} GameLive */

/**
 * The GameController of an online game, plus what the online host shows around it: the game record, the chat, the
 * connection, the chain check, invitations and rematches.
 *
 * @typedef {GameController & OnlineGameExtras} OnlineGameController
 */

/**
 * @typedef {object} OnlineGameExtras
 * @property {import('vue').ShallowRef<GameLive|null>} game the game as the server sent it last
 * @property {import('vue').Ref<ChatDTO[]>} chat the chat messages, oldest first
 * @property {import('vue').ComputedRef<number>} unread messages of the opponent the user has not seen
 * @property {() => void} markChatSeen mark every message as read
 * @property {(textOrPhrase: string) => Promise<boolean>} sendChat send a message or a quick phrase key
 * @property {(muted: boolean) => Promise<void>} setMuted mute or unmute the opponent
 * @property {import('vue').Ref<string>} connection the polling state, for the connection banners
 * @property {import('vue').Ref<{ply: number}|null>} altered the first move that differs from what the server stored
 * @property {import('vue').Ref<boolean>} unverifiable the chain cannot be checked
 * @property {import('vue').ComputedRef<{by: 'w'|'b', ply: number}|null>} drawOffer the open draw offer
 * @property {import('vue').ComputedRef<boolean>} participant the user plays in this game
 * @property {import('vue').ShallowRef<GameLive|null>} rematchGame the rematch, once there is one
 * @property {import('vue').ComputedRef<string|null>} rematchState the state of the rematch offer
 * @property {import('vue').ComputedRef<boolean>} isFinal the game never changes again
 * @property {() => Promise<void>} declineRematch decline the opponent's rematch offer
 * @property {() => Promise<void>} cancelRematch withdraw the user's rematch offer
 * @property {() => Promise<void>} accept accept the invitation
 * @property {() => Promise<void>} decline decline the invitation
 * @property {() => Promise<void>} cancel withdraw the user's invitation or open challenge
 * @property {() => Promise<void>} join join the open challenge
 * @property {() => Promise<void>} load load the game
 * @property {() => Promise<void>} start load the game and start polling
 * @property {() => void} pollNow poll the server now
 * @property {import('vue').ComputedRef<string>} shareUrl the link to the game
 */

/** Statuses after which the game never changes again. */
const FINAL = ['finished', 'aborted', 'declined', 'cancelled', 'expired']

/**
 * @param {number|string} id game id
 * @param {object} [deps] injected dependencies (tests): api, me, notify {error, info}, sleep, now, onRematchStarted,
 *   onLobbyChange, poller options
 * @return {OnlineGameController}
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
	const me = d.me
	const viewer = { uid: me, displayName: currentUser.displayName }

	const game = shallowRef(null)
	const loading = ref(true)
	const error = ref(null)
	const pending = shallowRef(null)
	const animating = ref(false)
	const orientation = ref('w')
	const clock = ref(d.now())
	/** When the game got busy (the poller is quick for a while after), and when the user's turn began. */
	const timing = { fastSince: d.now(), turnSince: d.now() }
	let animator = null
	let disposed = false
	let serverOffset = 0
	let slowMs = 2000
	let poller = null

	const myColor = computed(() => game.value?.myColor ?? null)
	const participant = computed(() => isParticipant(game.value, me))
	const status = computed(() => game.value?.status ?? null)
	const names = computed(() => ({ w: seatName(game.value, 'w', viewer), b: seatName(game.value, 'b', viewer) }))

	/**
	 * Names for a move event.
	 *
	 * @param {'w'|'b'} mover side
	 * @return {{mover: string, opponent: string}}
	 */
	const eventNames = (mover) => ({ mover: names.value[mover], opponent: names.value[otherColor(mover)] })

	/**
	 * Run an animation while `animating` is set. An animation failure never blocks the game.
	 *
	 * @param {() => unknown} run starts the animation
	 */
	async function animate(run) {
		animating.value = true
		try {
			await run()
		} catch {
			// an animation failure never blocks the game
		} finally {
			animating.value = false
		}
	}

	const replay = useOnlineReplay({
		game,
		me,
		animate: (event) => (animator ? animate(() => animator.play(event)) : undefined),
		eventNames,
	})
	const { state, moves } = replay

	const players = computed(() => {
		const context = { viewer, names: names.value, myColor: myColor.value, now: clock.value / 1000 + serverOffset }
		return { w: onlinePlayerInfo(game.value, 'w', context), b: onlinePlayerInfo(game.value, 'b', context) }
	})

	// --- Derived game state ------------------------------------------------------------------------------------------

	const interactive = computed(() => !loading.value && !error.value && status.value === 'active' && !pending.value
		&& !animating.value && myColor.value !== null
		&& state.value.turn === myColor.value && game.value.turn === myColor.value
		&& state.value.result === null)
	const legalMoves = computed(() => (interactive.value ? generateMoves(state.value) : []))
	const movableColor = computed(() => myColor.value)
	const result = computed(() => onlineResult(game.value))
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
		}
	})

	const chat = useOnlineChat({ gameId, api, me, game, notify: d.notify })
	const { mergeChat, lastChatId } = chat

	// --- Taking in what the server sent ------------------------------------------------------------------------------

	const rematch = useRematch({ gameId, api, me, act, pollNow: () => poller.pollNow() }, d)

	/**
	 * Adopt a game record (GameLive; the moves and chat of a GameFull are ignored).
	 *
	 * @param {GameLive|GameFull} live the game
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
			timing.turnSince = d.now()
		}
		if (live.rematchId && live.rematchId !== before?.rematchId) {
			rematch.load(live.rematchId)
		}
	}

	/**
	 * Build everything from a GameFull.
	 *
	 * @param {GameFull} full the game
	 */
	function rebuild(full) {
		const { complete } = replay.rebuild(full)
		adopt(full)
		if (full.state && complete) {
			replay.reconcileState(full.state)
		} else if (full.state) {
			state.value = full.state
		}
		chat.replaceChat(full.chat)
		replay.rememberChain()
	}

	/**
	 * Take in a changed poll answer (or any {game, moves, chat}).
	 *
	 * @param {object} res {game, moves, chat}
	 */
	async function ingest(res) {
		await replay.ingestMoves(res.moves)
		mergeChat(res.chat)
		adopt(res.game)
		replay.reconcileState(res.game?.state)
		if (res.game && res.game.ply > moves.value.length) {
			await catchUp()
		}
	}

	/** Fetch whatever is missing (moves from our ply, chat after our last id). */
	async function catchUp() {
		const res = await api.pollGame(gameId, { rev: 0, ply: moves.value.length, chat: lastChatId() })
		if (res?.changed) {
			await replay.ingestMoves(res.moves)
			mergeChat(res.chat)
			adopt(res.game)
			replay.reconcileState(res.game?.state)
		}
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

	// --- Polling -----------------------------------------------------------------------------------------------------

	/**
	 * The next poll delay: quick while something is likely to happen, slower while the user waits for the opponent,
	 * rare in a hidden tab, and none once nothing can change any more.
	 *
	 * @param {{hidden: boolean}} ctx whether the tab is hidden
	 * @return {number|null} ms, or null to stop
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
			if (now - timing.fastSince < 20000) {
				slowMs = 2000
				return 2000
			}
			slowMs = Math.min(30000, Math.round(slowMs * 1.5))
			return slowMs
		}
		if (g.status === 'pending' || g.status === 'open') {
			return hidden ? 60000 : (now - timing.fastSince < 120000 ? 3000 : 15000)
		}
		if (g.status === 'finished' || g.status === 'aborted') {
			if (hidden) {
				return null
			}
			if (rematch.rematchGame.value?.status === 'pending') {
				return now - rematch.offeredAt() < 120000 ? 3000 : 30000
			}
			// right after the end a rematch offer is likely: stay quick for two minutes
			if (now - Math.max(timing.fastSince, (g.finishedAt ?? 0) * 1000 - serverOffset * 1000) < 120000) {
				return 3000
			}
			return g.chatOpen ? 30000 : null
		}
		return null
	}

	/**
	 * One poll of the game (and of a pending rematch).
	 *
	 * @param {{signal: AbortSignal}} options cancellation
	 */
	async function pollOnce({ signal }) {
		if (!game.value || pending.value || animating.value || disposed) {
			return
		}
		const res = await api.pollGame(
			gameId,
			{ rev: game.value.rev, ply: moves.value.length, chat: lastChatId(), watching: 1 },
			{ signal },
		)
		if (res?.changed && !pending.value) {
			const hadTurn = game.value.turn
			await ingest(res)
			if (game.value.turn !== hadTurn || res.chat?.length) {
				d.onLobbyChange()
			}
		} else if (Number.isFinite(res?.now)) {
			serverOffset = res.now - d.now() / 1000
		}
		const r = rematch.rematchGame.value
		if (r?.status === 'pending') {
			const rr = await api.pollGame(r.id, { rev: r.rev, ply: 0, chat: 0 }, { signal })
			if (rr?.changed && rr.game) {
				rematch.rematchGame.value = rr.game
				rematch.follow('pending')
			}
		}
	}

	poller = usePoller(pollOnce, {
		interval,
		onWake: () => {
			timing.fastSince = d.now()
		},
		...d.poller,
	})

	// --- Moves, actions and rematches --------------------------------------------------------------------------------

	const sender = useMoveSender({
		gameId,
		api,
		replay,
		pending,
		interactive,
		animator: () => animator,
		animate,
		eventNames,
		timing,
		adopt,
		ingest,
		catchUp,
		load,
		pollNow: () => poller.pollNow(),
		disposed: () => disposed,
	}, d)

	/**
	 * Run a game action that answers with a game, adopt it and catch up.
	 *
	 * @param {() => Promise<object>} fn API call
	 * @return {Promise<object|null>} the game, or null when the action failed
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

	/**
	 * Accept, decline, cancel or join this game, then reload.
	 *
	 * @param {() => Promise<object>} fn API call
	 * @return {Promise<boolean>} success
	 */
	async function answer(fn) {
		try {
			await fn()
			await load()
			timing.fastSince = d.now()
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

	const banners = computed(() => onlineBanners({
		altered: replay.altered.value,
		unverifiable: replay.unverifiable.value,
		pendingPhase: pending.value?.phase ?? null,
		connection: poller.connection.value,
	}, {
		retry: sender.retryPending,
		undo: sender.discardPending,
		reload: () => globalThis.location?.reload(),
	}))

	// --- Lifecycle ---------------------------------------------------------------------------------------------------

	/**
	 * Attach the board's Animator.
	 *
	 * @param {Animator} a the board's animator
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
		orientation.value = otherColor(orientation.value)
	}

	let clockTimer = null

	/** Load and start polling. */
	async function start() {
		await load()
		if (disposed) {
			return
		}
		timing.fastSince = d.now()
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
		startState: replay.startState,
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
		lastMove: replay.lastMove,
		animating,
		submitMove: sender.submitMove,
		stateAt: replay.stateAt,
		attachAnimator,
		flip,
		undo: noop,
		resign,
		abort,
		offerDraw,
		answerDraw,
		rematch: rematch.rematch,
		declineRematch: rematch.declineRematch,
		cancelRematch: rematch.cancelRematch,
		retryPending: sender.retryPending,
		discardPending: sender.discardPending,
		dispose,
		// online extras
		game,
		chat: chat.chat,
		unread: chat.unread,
		markChatSeen: chat.markChatSeen,
		sendChat: chat.sendChat,
		setMuted: chat.setMuted,
		connection: poller.connection,
		altered: replay.altered,
		unverifiable: replay.unverifiable,
		drawOffer,
		participant,
		rematchGame: rematch.rematchGame,
		rematchState: rematch.rematchState,
		isFinal: computed(() => FINAL.includes(status.value)),
		accept,
		decline,
		cancel,
		join,
		load,
		start,
		pollNow: () => poller.pollNow(),
		shareUrl: computed(() => (globalThis.location?.origin ?? '')
			+ generateUrl('/apps/quantumchess/g/{id}', { id: gameId })),
	}
}
