/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The board of an online chess variant game (docs/development/online-variants.md): the server rolls, the browsers
 * rule. The online controller (`useOnlineGame`) keeps loading and polling the game, its status, chat and draw offers;
 * this composable plays its moves on the variant board (`useVariantGame` with an online host).
 *
 * - **Loading.** The stored moves are replayed from the start position with the rolls the server drew
 *   (`replayOnline`), and every settled claim is checked on the way. The variant chain is checked too.
 * - **Own moves.** A move goes to the server first; it answers with the roll, the move is played with it, and this
 *   browser settles it (the seat to move next, the result code and the position hash).
 * - **Other moves.** Moves that arrive by polling are checked and played. A move that waits for its settlement is
 *   settled here too: the result is the same in every browser, so a game goes on when its mover left.
 * - **Disagreement.** A move or a settled claim that does not agree with the rules disputes the game, which the server
 *   then annuls. A changed chain only warns: the game's history was changed after this browser saw it.
 * - **Another rules version.** A game created with other variant rules (`variantRules`) is not replayed: the player is
 *   asked to update the app.
 * - **Server-ruled variants** (Kriegspiel and Fog of war, src/variants/referee.js): the server holds the real position
 *   and decides every move, so nothing is replayed while the game runs. The board shows the player's view from the
 *   game (`game.view`); a move goes to the server, which refuses it or answers with the new view, and Fog of war asks
 *   the server for the odds of a move first. Once the game has ended, the server reveals the real position and every
 *   move: this browser replays them with the rules it knows and checks the chain, and warns when they do not agree.
 */

import { computed, ref, shallowRef, watch } from 'vue'
import * as realApi from '../../services/api.js'
import { uuid as realUuid } from '../../services/ids.js'
import { useVariantGame } from '../../variantplay/composables/useVariantGame.js'
import { moveSquares, sidePieceType } from '../../variantplay/marks.js'
import {
	isRefereed,
	loadVariant,
	newGame,
	ONLINE_RULES_VERSION,
	optionValues,
	replayOnline,
	settlementOf,
} from '../../variants/index.js'
import { vchainNext, vchainStart } from '../vchain.js'

/** The waits before a move is sent again after a network error (ms). */
const RETRY_DELAYS_MS = [1000, 3000, 9000]

/**
 * Whether a stored move carries a settlement.
 *
 * @param {object} m stored move
 * @return {boolean}
 */
const settled = (m) => m.nextSeat !== null && m.nextSeat !== undefined

/**
 * @param {object} c the online controller of the game (useOnlineGame)
 * @param {object} [deps] dependencies (tests)
 * @param {object} [deps.api] the HTTP API
 * @param {() => string} [deps.uuid] client ids of moves
 * @param {(ms: number) => Promise<void>} [deps.sleep] waits between retries
 * @param {() => number} [deps.now] the clock in ms
 * @return {object} `game` (useVariantGame), `problem` (null, 'rules', 'altered' or 'disputed'), `mySeat`, `stop()`
 */
export function useOnlineVariantGame(c, {
	api = realApi,
	uuid = realUuid,
	sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
	now = () => Date.now(),
} = {}) {
	const id = c.game.value.id
	/** The viewer's seat: White and Black are seats 0 and 1; a game with more than two seats names the seat itself. */
	const mySeat = computed(() => {
		const color = c.game.value?.myColor
		return color === 'w' ? 0 : color === 'b' ? 1 : /^\d$/.test(color ?? '') ? Number(color) : null
	})
	/** What keeps this browser from playing along: another rules version, a changed chain or a dispute. */
	const problem = ref(null)
	/** The settlement this browser computed for every move it played, by ply. */
	const settlements = shallowRef([])
	let V = null
	let turnSince = now()
	let disputed = false
	let stopped = false

	/**
	 * Report a disagreement at `ply` once; the server annuls the game.
	 *
	 * @param {number} ply the ply of the move that does not agree
	 */
	async function dispute(ply) {
		problem.value = 'disputed'
		if (disputed || mySeat.value === null) {
			return
		}
		disputed = true
		try {
			await api.disputeVariantGame(id, ply)
		} finally {
			c.noteActivity()
		}
	}

	/**
	 * Settle a move this browser played (its own, or one whose mover has not settled it).
	 *
	 * @param {number} ply the ply of the move
	 * @param {object} settlement what it led to
	 */
	async function settle(ply, settlement) {
		if (mySeat.value === null) {
			return
		}
		try {
			await api.settleVariantMove(id, ply, settlement)
		} catch {
			// a lost settlement is settled again by the next poll that still sees the move open
		}
		c.noteActivity()
	}

	/**
	 * Remember what a move led to, and check a claim that came with it.
	 *
	 * @param {object} m stored move
	 * @param {object} next the state after it
	 * @return {boolean} whether the claim (if any) agrees
	 */
	function remember(m, next) {
		const mine = settlementOf(next)
		const list = settlements.value.slice()
		list[m.ply] = mine
		settlements.value = list
		if (!settled(m)) {
			return true
		}
		return m.nextSeat === mine.nextSeat && m.result === mine.result && m.stateHash === mine.stateHash
	}

	/**
	 * Check the chain of the stored moves; a difference means the history was changed after it was stored.
	 *
	 * @param {object[]} moves stored moves
	 */
	function checkChain(moves) {
		const g = c.game.value
		const seats = Array.isArray(g.seats)
			? g.seats.map((s) => s.player?.userId ?? null)
			: [g.white?.userId ?? null, g.black?.userId ?? null]
		if (seats.includes(null) || !g.chain) {
			return
		}
		let chain = vchainStart(g.id, g.variant, g.variantOptions ?? {}, seats, g.createdAt)
		for (const m of moves) {
			chain = vchainNext(chain, m.ply, m.seat, m.code, m.u)
			if (chain !== m.chain) {
				problem.value = 'altered'
				return
			}
		}
	}

	const ruled = isRefereed(c.game.value.variant)

	/**
	 * A view of a server-ruled game as the board shows it: the real position of an ended game that has no result on
	 * the board (a resignation, a time-out, an agreed draw) gets the game's result.
	 *
	 * @param {object|null} view the view from the server
	 * @return {object|null}
	 */
	function shown(view) {
		const g = c.game.value
		if (!view || view.visible !== null || view.result || !g.result || g.result === '*') {
			return view
		}
		const winner = g.result === '1-0' ? 0 : g.result === '0-1' ? 1 : null
		const reason = g.resultReason === 'resignation' ? 'resign' : String(g.resultReason ?? '')
		return { ...view, result: { winner, reason } }
	}

	/**
	 * Send a move, again after a network error, with the same client id.
	 *
	 * @param {object} state the state before the move
	 * @param {string} code move code
	 * @return {Promise<object>} the server's answer
	 */
	async function sendMove(state, code) {
		const clientId = uuid()
		const thinkMs = Math.max(0, now() - turnSince)
		for (let attempt = 0; ; attempt++) {
			try {
				return await api.sendVariantMove(id, { code, ply: state.ply, clientId, thinkMs })
			} catch (e) {
				const retry = attempt < RETRY_DELAYS_MS.length && (!e?.status || e.status >= 500)
				if (!retry) {
					c.noteActivity()
					throw e
				}
				await sleep(RETRY_DELAYS_MS[attempt])
			}
		}
	}

	/** The host of a server-ruled game (see the header). */
	const ruledHost = {
		ruled: true,
		async load() {
			const g = c.game.value
			if (g.variantRules !== ONLINE_RULES_VERSION) {
				problem.value = 'rules'
				return null
			}
			V = await loadVariant(g.variant)
			const view = shown(g.view ?? null)
			if (!view) {
				return null
			}
			return {
				v: 2,
				id: 'online-' + id,
				variant: g.variant,
				options: optionValues(V, g.variantOptions ?? {}),
				players: V.sides.map((_, i) => ({ kind: i === mySeat.value ? 'human' : 'remote' })),
				autoFlip: false,
				initial: view,
				moves: (view.history ?? []).map((h) => ({ code: h.code, i: 0 })),
				rolls: {},
				current: view,
			}
		},
		async send(state, code) {
			const res = await sendMove(state, code)
			c.noteActivity()
			if (res.refused) {
				return { refused: true }
			}
			turnSince = now()
			return { view: shown(res.game?.view ?? null) }
		},
		async preview(state, code) {
			const res = await api.previewVariantMove(id, code)
			return res.refused ? null : res.outcomes
		},
		played() {},
		resign() {
			c.resign()
		},
	}

	/**
	 * Replay the moves of an ended server-ruled game, which the server revealed, and check them and the chain: a
	 * difference means the server's rules or history differ from this app's.
	 */
	function checkRevealed() {
		const moves = c.variantMoves.value.filter(Boolean)
		const g = c.game.value
		if (!V || !moves.length || moves.length !== g.ply || problem.value) {
			return
		}
		checkChain(moves)
		const r = replayOnline(V, newGame(V, optionValues(V, g.variantOptions ?? {})), moves)
		if (r.mismatch) {
			problem.value = 'altered'
		}
	}

	const host = ruled
		? ruledHost
		: {
				async load() {
					const g = c.game.value
					if (g.variantRules !== ONLINE_RULES_VERSION) {
						problem.value = 'rules'
						return null
					}
					V = await loadVariant(g.variant)
					const options = optionValues(V, g.variantOptions ?? {})
					const initial = newGame(V, options)
					const stored = c.variantMoves.value.filter(Boolean)
					checkChain(stored)
					const list = []
					const r = replayOnline(V, initial, stored, (m, played, before) => {
						const { from } = moveSquares(V, m.code, [])
						const type = from.length ? sidePieceType(before, from[0], before.turn) : null
						const i = played.outcomes.indexOf(played.branch)
						list.push(type ? { code: m.code, i, t: type } : { code: m.code, i })
						remember(m, played.state)
					})
					if (r.mismatch) {
						dispute(r.mismatch.ply)
					}
					const last = stored[r.state.ply - 1]
					if (last && !settled(last) && r.settlement) {
						settle(last.ply, r.settlement)
					}
					const seats = V.sides.map((_, i) => ({ kind: i === mySeat.value ? 'human' : 'remote' }))
					return {
						v: 2,
						id: 'online-' + id,
						variant: g.variant,
						options,
						players: seats,
						autoFlip: false,
						initial,
						moves: list,
						rolls: {},
						current: r.state,
					}
				},
				async send(state, code) {
					const res = await sendMove(state, code)
					return res.move.u
				},
				played(before, code, next) {
					const m = { ply: before.ply, nextSeat: null }
					remember(m, next)
					turnSince = now()
					settle(before.ply, settlementOf(next))
				},
				resign() {
					c.resign()
				},
			}

	const game = useVariantGame('online-' + id, host)

	/** Play the moves that arrived since the board's position, and check the claims of the moves already played. */
	function sync() {
		const s = game.state.value
		if (stopped || !V || !s || game.sending.value || problem.value) {
			return
		}
		const moves = c.variantMoves.value
		for (const m of moves) {
			if (m && m.ply < s.ply && settled(m) && settlements.value[m.ply]) {
				const mine = settlements.value[m.ply]
				if (m.nextSeat !== mine.nextSeat || m.result !== mine.result || m.stateHash !== mine.stateHash) {
					dispute(m.ply)
					return
				}
			}
		}
		for (let ply = s.ply; ply < moves.length; ply++) {
			const m = moves[ply]
			if (!m) {
				return
			}
			const before = game.state.value
			const r = replayOnline(V, before, [m])
			if (r.mismatch) {
				dispute(r.mismatch.ply)
				return
			}
			if (!game.playRemote(m.code, m.u)) {
				dispute(m.ply)
				return
			}
			remember(m, game.state.value)
			turnSince = now()
			if (!settled(m)) {
				settle(m.ply, settlementOf(game.state.value))
			}
		}
	}

	if (ruled) {
		watch(() => c.game.value?.view, (view) => {
			if (!stopped && V) {
				game.setView(shown(view ?? null))
			}
		})
		watch(() => c.variantMoves.value, checkRevealed)
	} else {
		watch(() => c.variantMoves.value, sync)
	}
	watch(() => c.game.value?.status, (status) => {
		if (status && status !== 'active') {
			game.freeze()
		}
	}, { immediate: true })

	/** Load the board. */
	async function start() {
		await game.load()
		if (ruled) {
			checkRevealed()
		} else {
			sync()
		}
	}

	/** Stop playing along (when leaving the page). */
	function stop() {
		stopped = true
		game.stop()
	}

	return { game, problem, mySeat, start, stop }
}
