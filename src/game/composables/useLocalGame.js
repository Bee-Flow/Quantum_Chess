/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The GameController of local games: against the computer player, against an LLM opponent, and pass & play. The game
 * lives in `localStorage` (`game/localGames.js`). Rolls go through the roll memo: they are drawn and saved before the
 * move is applied. Every move is animated through the attached Animator before `state` changes. The opponent's moves
 * come from `useOpponentTurn`.
 */

import { t } from '@nextcloud/l10n'
import { computed, reactive, ref, shallowRef } from 'vue'
import { applyMove, findMove, gameResult, generateMoves, initialState, otherColor, serializeState } from '../../engine/index.js'
import { personaById } from '../../llm/personas.js'
import { recordLocalResult } from '../../services/api.js'
import { preferences } from '../../services/preferences.js'
import { playSound } from '../../services/sound.js'
import { reportTrainerEvent } from '../../trainer/report.js'
import { NO_CAPABILITIES, toGameResult } from '../gameController.js'
import { applyRecorded, loadLocalGame, rollFor, saveLocalGame, toMoveEntry } from '../localGames.js'
import { localPlayerInfo, localPlayerName } from '../localPlayers.js'
import { useOpponentTurn } from './useOpponentTurn.js'

/** @typedef {import('../../engine/types.js').LegalMove} LegalMove */
/** @typedef {import('../gameController.js').GameController} GameController */
/** @typedef {import('../gameController.js').Animator} Animator */

/**
 * The GameController of a local game, plus what the local game host shows next to the board.
 *
 * @typedef {GameController & LocalGameExtras} LocalGameController
 */

/**
 * @typedef {object} LocalGameExtras
 * @property {import('vue').ShallowRef<object|null>} record the stored game record (`game/localGames.js`)
 * @property {{thinking: boolean, depth: number|null, since: number}} engine the computer player's progress
 * @property {object|null} ai the LLM opponent's state (`thinking`, `queued`, `elapsedMs`, …), null in other games
 * @property {import('vue').Ref<object[]>} chat the chat with the LLM opponent
 * @property {{w: object|null, b: object|null}} comments the opponent's speech bubble per side
 * @property {import('vue').Ref<boolean>} thinking the opponent is choosing a move
 * @property {() => void} start let the opponent greet and move when it is its turn
 */

/**
 * @param {string} id local game id
 * @param {object} [deps] injected dependencies (tests): bestMove, candidates, recordLocalResult, requestAiMove,
 *   waitForAiTask, cancelAiTask, draw (roll source), rng (flavour only), onError
 * @return {LocalGameController}
 */
export function useLocalGame(id, deps = {}) {
	const d = { recordLocalResult, rng: Math.random, onError: () => {}, ...deps }
	const record = shallowRef(loadLocalGame(id))
	const loading = ref(false)
	const error = ref(record.value ? null : new Error(t('quantumchess', 'This game is not on this device any more.')))
	const rec = record.value ?? { mode: 'local', moves: [], players: { w: {}, b: {} }, humanColor: null, options: {}, ai: {}, rolls: {} }
	const kind = rec.mode
	const startState = shallowRef(rec.startState ?? null)
	const states = [rec.startState ?? initialState()]
	const steps = []
	const moves = ref([])
	const lastMove = shallowRef(null)
	const animating = ref(false)
	const recordResult = ref(rec.result?.reason === 'resignation' ? rec.result : null)
	const banners = ref([])
	const comments = reactive({ w: null, b: null })
	const chat = ref([...(rec.ai?.chat ?? [])])
	let animator = null
	let finished = false
	let disposed = false

	// Replay the record with the recorded rolls.
	try {
		for (const entry of rec.moves) {
			const before = states[states.length - 1]
			const res = applyRecorded(before, entry)
			const step = { before, after: res.state, move: res.move, measurement: res.measurement }
			steps.push(step)
			states.push(res.state)
		}
	} catch (e) {
		error.value = e
	}
	moves.value = steps.map((s, i) => toMoveEntry(s, rec.moves[i]))
	const state = shallowRef(states[states.length - 1])
	if (steps.length) {
		const last = steps[steps.length - 1]
		lastMove.value = { move: last.move, key: last.measurement?.key ?? null }
	}
	if (record.value && (!rec.state || serializeState(rec.state) !== serializeState(state.value))) {
		rec.state = state.value
		saveLocalGame(rec)
	}
	finished = rec.result !== null && rec.result !== undefined

	const humanColor = kind === 'local' ? null : (rec.humanColor ?? 'w')
	const aiColor = humanColor === null ? null : otherColor(humanColor)
	const orientation = ref(humanColor ?? (rec.options?.autoFlip ? state.value.turn : 'w'))
	const persona = kind === 'ai' ? (personaById(rec.players?.[aiColor]?.persona) ?? personaById('professor')) : null
	const opponent = useOpponentTurn({ kind, record: rec, color: aiColor, persona }, d)
	const { engine, llm, thinking } = opponent

	const result = computed(() => toGameResult(recordResult.value ?? gameResult(state.value), 'engine'))
	const myColor = computed(() => humanColor)
	const movableColor = computed(() => (kind === 'local' ? state.value.turn : humanColor))
	const interactive = computed(() => !error.value && !animating.value && !thinking.value && result.value === null
		&& (kind === 'local' || state.value.turn === humanColor))
	const legalMoves = computed(() => (interactive.value ? generateMoves(state.value) : []))

	const names = computed(() => ({ w: localPlayerName(rec, 'w', persona), b: localPlayerName(rec, 'b', persona) }))

	const players = computed(() => {
		const info = (color) => localPlayerInfo(rec, color, { name: names.value[color], comment: comments[color], persona, engine, llm })
		return { w: info('w'), b: info('b') }
	})

	const humanMoves = computed(() => moves.value.filter((m) => m.by === 'human').length)
	const can = computed(() => ({
		...NO_CAPABILITIES,
		undo: !animating.value && recordResult.value === null && (kind === 'local' ? moves.value.length > 0 : humanMoves.value > 0),
		resign: result.value === null && !animating.value,
		rematch: result.value !== null,
		chat: kind === 'ai',
	}))

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
	 * Show a comment bubble for a side.
	 *
	 * @param {'w'|'b'} color side
	 * @param {string} text comment; nothing is shown when it is empty
	 * @param {string|null} mood mood
	 */
	function comment(color, text, mood = null) {
		if (text) {
			comments[color] = { text, mood, at: Date.now() }
		}
	}

	/**
	 * Show a comment of the opponent.
	 *
	 * @param {{text: string, mood: string}|null} line the comment, or null for none
	 */
	function opponentSays(line) {
		if (line) {
			comment(aiColor, line.text, line.mood)
		}
	}

	/**
	 * Apply a move with the roll memo, persist it, animate it and show the new state.
	 *
	 * @param {string} code move code
	 * @param {string} by human | engine | ai | ai-fallback
	 * @param {{comment?: string, mood?: string|null}} [extra] what the mover says with the move
	 * @return {Promise<object>} the step {before, after, move, measurement}
	 */
	async function play(code, by, extra = {}) {
		const before = state.value
		const legal = findMove(before, code)
		if (!legal) {
			throw new Error('illegal move ' + code)
		}
		const u = legal.resolution === 'rolled' ? rollFor(rec, before, legal.code, d.draw) : null
		const res = applyMove(before, legal.code, u !== null ? { u } : {})
		const entry = { code: legal.code, u, key: res.measurement?.key ?? null, by, t: Math.floor(Date.now() / 1000) }
		if (extra.comment) {
			entry.comment = extra.comment
			entry.mood = extra.mood ?? null
		}
		if (by === 'ai-fallback') {
			entry.fallback = true
		}
		rec.moves.push(entry)
		rec.state = res.state
		saveLocalGame(rec)
		const step = { before, after: res.state, move: res.move, measurement: res.measurement }
		const mover = before.turn
		const actor = kind === 'local' || by === 'human' ? 'self' : 'opponent'
		animating.value = true
		try {
			if (animator) {
				await animator.play({
					before,
					after: res.state,
					move: res.move,
					measurement: res.measurement,
					actor,
					names: { mover: names.value[mover], opponent: names.value[otherColor(mover)] },
				})
			}
		} catch {
			// an animation failure never blocks the game
		} finally {
			steps.push(step)
			states.push(res.state)
			moves.value = [...moves.value, toMoveEntry(step, entry)]
			state.value = res.state
			lastMove.value = { move: res.move, key: res.measurement?.key ?? null }
			animating.value = false
		}
		if (extra.comment) {
			comment(mover, extra.comment, extra.mood ?? null)
			if (kind === 'ai') {
				rec.ai.chat = [...(rec.ai.chat ?? []), { from: 'ai', text: extra.comment, ply: before.ply }]
				chat.value = rec.ai.chat
				saveLocalGame(rec)
			}
		}
		return step
	}

	/**
	 * The recent moves for the LLM request.
	 *
	 * @return {Array<{ply: number, code: string, key: string|null, weight: number|null}>}
	 */
	function aiHistory() {
		return steps.slice(-20).map((s) => {
			const key = s.measurement?.key ?? null
			const o = key ? s.measurement.outcomes.find((x) => x.key === key) : null
			return { ply: s.before.ply, code: s.move.code, key, weight: o ? o.weight : null }
		})
	}

	/** The opponent's turn: it chooses a move, which is then played like any other. */
	async function reply() {
		if (disposed || result.value !== null || kind === 'local' || state.value.turn !== aiColor) {
			return
		}
		try {
			const choice = await opponent.chooseMove(state.value, kind === 'ai' ? aiHistory() : [])
			if (kind === 'ai') {
				if (choice.error) {
					banners.value = [{
						id: 'ai-error',
						type: 'warning',
						text: t('quantumchess', 'The AI could not answer, so the built-in engine chose this move.'),
						actions: [],
					}]
				} else {
					banners.value = banners.value.filter((b) => b.id !== 'ai-error')
				}
				saveLocalGame(rec)
			}
			await play(choice.code, choice.by, { comment: choice.comment, mood: choice.mood })
		} catch (e) {
			if (e?.name !== 'AbortError') {
				error.value = e
				d.onError(e)
			}
			return
		}
		afterMove()
	}

	/** Whatever follows a move: the end of the game, the auto-flip or the reply. */
	function afterMove() {
		if (result.value !== null) {
			finish()
			return
		}
		if (kind === 'local') {
			if (rec.options?.autoFlip) {
				orientation.value = state.value.turn
			}
			return
		}
		if (state.value.turn === aiColor) {
			reply()
		}
	}

	/**
	 * The game ended in this session: store the result, report it once to the statistics (never an assisted game),
	 * play the sound and let the opponent have the last word.
	 */
	function finish() {
		if (finished) {
			return
		}
		finished = true
		const res = result.value
		rec.result = { result: res.result, reason: res.reason }
		saveLocalGame(rec)
		const pov = humanColor ?? 'w'
		const outcome = res.winner === null ? 'draw' : (res.winner === pov ? 'win' : 'loss')
		if (!rec.assisted && !rec.reported) {
			const body = kind === 'computer'
				? { opponent: 'engine', level: rec.players[aiColor].level, result: outcome, color: humanColor }
				: kind === 'ai'
					? { opponent: 'llm', persona: persona.id, result: outcome, color: humanColor }
					: { opponent: 'hotseat', result: outcome, color: 'w' }
			rec.reported = true
			saveLocalGame(rec)
			Promise.resolve(d.recordLocalResult(body)).catch(() => {
				rec.reported = false
				saveLocalGame(rec)
			})
		}
		if (kind !== 'local') {
			playSound(outcome === 'loss' ? 'loss' : 'win', { speed: preferences.effective?.animationSpeed ?? 'normal' })
		} else {
			playSound('win', { speed: preferences.effective?.animationSpeed ?? 'normal' })
		}
		opponentSays(opponent.farewell(outcome))
		reportTrainerEvent({ type: 'gameOver', mode: kind, won: outcome === 'win', assisted: rec.assisted })
	}

	/**
	 * A committed move of the local user.
	 *
	 * @param {LegalMove} move the move
	 */
	async function submitMove(move) {
		if (!interactive.value) {
			return
		}
		const step = await play(move.code, 'human')
		if (kind === 'ai') {
			opponentSays(opponent.reactionTo(step))
		}
		afterMove()
	}

	/** Take back the last own move (and the reply after it); the roll memo is kept. */
	async function undo() {
		if (!can.value.undo) {
			return
		}
		opponent.stop()
		let n = rec.moves.length
		if (kind === 'local') {
			n -= 1
		} else {
			let i = n - 1
			while (i >= 0 && rec.moves[i].by !== 'human') {
				i--
			}
			if (i < 0) {
				return
			}
			n = i
		}
		rec.moves = rec.moves.slice(0, n)
		rec.assisted = true
		rec.undoCount = (rec.undoCount ?? 0) + 1
		rec.result = null
		finished = false
		steps.length = n
		states.length = n + 1
		moves.value = moves.value.slice(0, n)
		state.value = states[n]
		rec.state = state.value
		const last = steps[n - 1]
		lastMove.value = last ? { move: last.move, key: last.measurement?.key ?? null } : null
		comments.w = null
		comments.b = null
		saveLocalGame(rec)
		if (kind === 'local' && rec.options?.autoFlip) {
			orientation.value = state.value.turn
		}
		if (kind !== 'local' && state.value.turn === aiColor) {
			reply()
		}
	}

	/** Resign: the human side (in pass & play the side to move) loses. */
	async function resign() {
		if (result.value !== null) {
			return
		}
		opponent.stop()
		const loser = humanColor ?? state.value.turn
		recordResult.value = { result: loser === 'w' ? '0-1' : '1-0', reason: 'resignation' }
		finish()
	}

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

	/** Stop everything (leaving the view). */
	function dispose() {
		disposed = true
		opponent.stop()
	}

	/** Start the opponent if it is to move (after loading or a new game). */
	function start() {
		if (error.value || disposed) {
			return
		}
		if (rec.moves.length === 0 && !comments[aiColor]) {
			opponentSays(opponent.greeting())
		}
		if (result.value === null && kind !== 'local' && state.value.turn === aiColor) {
			reply()
		}
	}

	const noop = async () => {}

	const ai = llm
		? reactive({
				thinking: llm.thinking,
				queued: llm.queued,
				elapsedMs: llm.elapsedMs,
				canLetEngineMove: llm.canLetEngineMove,
				letEngineMove: llm.letEngineMove,
				cancel: llm.cancel,
				answerMode: llm.answerMode,
				say: (text) => {
					llm.say(text, state.value.ply)
					chat.value = [...(rec.ai.chat ?? [])]
					saveLocalGame(rec)
				},
			})
		: null

	return {
		kind,
		id: ref(id),
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
		pending: ref(null),
		can,
		fairPlayLock: computed(() => false),
		banners,
		lastMove,
		animating,
		thinking,
		submitMove,
		stateAt,
		attachAnimator,
		flip,
		undo,
		resign,
		abort: noop,
		offerDraw: noop,
		answerDraw: noop,
		rematch: noop,
		retryPending: noop,
		discardPending: noop,
		dispose,
		start,
		record,
		engine,
		ai,
		chat,
		comments,
	}
}
