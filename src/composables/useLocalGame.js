/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The controller of local games: computer, AI opponent and pass & play (SPEC §14.4.4, GAME-DESIGN §4.2–4.4).
 * Rolls go through the roll memo (drawn and persisted before applying); every move is animated through the
 * attached Animator before `state` changes (SPEC §14.4.2).
 */

import { t } from '@nextcloud/l10n'
import { computed, reactive, ref, shallowRef } from 'vue'
import { LEVELS } from '../ai/levels.js'
import {
	applyMove,
	findMove,
	gameResult,
	generateMoves,
	initialState,
	kingDanger,
	moveNotation,
	serializeState,
	T,
} from '../engine/index.js'
import { engineLine } from '../personas/engineLines.js'
import { cannedLine, personaById } from '../personas/index.js'
import { recordLocalResult } from '../services/api.js'
import { currentUser } from '../services/initialState.js'
import { applyRecorded, loadLocalGame, rollFor, saveLocalGame } from '../services/localGames.js'
import { preferences } from '../services/preferences.js'
import { playSound } from '../sound/sound.js'
import { NO_CAPABILITIES, toGameResult } from './gameController.js'
import { useLlmOpponent } from './useLlmOpponent.js'

const trainerEvents = import.meta.glob('../trainer/events.js')

/**
 * Report a game event to the trainer when that module is bundled (fire and forget).
 *
 * @param {object} event game event (SPEC §14.8.3)
 */
function reportGameEvent(event) {
	const load = Object.values(trainerEvents)[0]
	if (load) {
		load().then((m) => m.reportGameEvent?.(event)).catch(() => {})
	}
}

/**
 * Wait, abortable.
 *
 * @param {number} ms delay
 * @param {AbortSignal} signal signal
 * @return {Promise<void>}
 */
function wait(ms, signal) {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new DOMException('Aborted', 'AbortError'))
			return
		}
		const timer = setTimeout(resolve, Math.max(0, ms))
		signal.addEventListener('abort', () => {
			clearTimeout(timer)
			reject(new DOMException('Aborted', 'AbortError'))
		}, { once: true })
	})
}

/** Plies between two canned engine lines (5 own moves). */
const LINE_EVERY_PLIES = 10

/**
 * @param {string} id local game id
 * @param {object} [deps] injected dependencies (tests): bestMove, candidates, recordLocalResult, requestAiMove,
 *   waitForAiTask, draw (roll source), rng (flavour), onError
 * @return {object} GameController plus {record, engine, ai, comments}
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
	const engine = reactive({ thinking: false, depth: null, since: 0 })
	const chat = ref([...(rec.ai?.chat ?? [])])
	let animator = null
	let abortCtrl = null
	let finished = false
	let lastLinePly = -Infinity
	let disposed = false

	/**
	 * A MoveEntry for the move list.
	 *
	 * @param {object} step {before, after, move, measurement}
	 * @param {object} entry record entry
	 * @return {object}
	 */
	function toEntry(step, entry) {
		return {
			ply: step.before.ply,
			color: step.before.turn,
			code: step.move.code,
			notation: moveNotation(step.before, step.move, step.measurement),
			measurement: step.measurement,
			u: entry.u ?? null,
			by: entry.by ?? 'human',
			comment: entry.comment,
			mood: entry.mood,
			createdAt: entry.t,
		}
	}

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
	moves.value = steps.map((s, i) => toEntry(s, rec.moves[i]))
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
	const aiColor = humanColor === null ? null : (humanColor === 'w' ? 'b' : 'w')
	const orientation = ref(humanColor ?? (rec.options?.autoFlip ? state.value.turn : 'w'))
	const persona = kind === 'ai' ? (personaById(rec.players?.[aiColor]?.persona) ?? personaById('professor')) : null
	const llm = kind === 'ai'
		? useLlmOpponent({
				record: rec,
				persona,
				source: rec.players[aiColor].source,
				model: rec.players[aiColor].model ?? null,
				strength: rec.players[aiColor].strength ?? 'balanced',
			}, { candidates: d.candidates, requestAiMove: d.requestAiMove, waitForAiTask: d.waitForAiTask, cancelAiTask: d.cancelAiTask, onError: d.onError })
		: null

	const result = computed(() => toGameResult(recordResult.value ?? gameResult(state.value), 'engine'))
	const thinking = computed(() => engine.thinking || (llm?.thinking.value ?? false))
	const myColor = computed(() => humanColor)
	const movableColor = computed(() => (kind === 'local' ? state.value.turn : humanColor))
	const interactive = computed(() => !error.value && !animating.value && !thinking.value && result.value === null
		&& (kind === 'local' || state.value.turn === humanColor))
	const legalMoves = computed(() => (interactive.value ? generateMoves(state.value) : []))

	const names = computed(() => ({ w: playerName('w'), b: playerName('b') }))

	/**
	 * Display name of a side.
	 *
	 * @param {'w'|'b'} color side
	 * @return {string}
	 */
	function playerName(color) {
		const p = rec.players?.[color] ?? {}
		if (p.kind === 'engine') {
			return LEVELS[(p.level ?? 1) - 1]?.name ?? t('quantumchess', 'Computer')
		}
		if (p.kind === 'ai') {
			return persona?.name ?? t('quantumchess', 'AI opponent')
		}
		if (p.kind === 'human' && kind !== 'local') {
			return currentUser.displayName || t('quantumchess', 'You')
		}
		return p.name || (color === 'w' ? t('quantumchess', 'White') : t('quantumchess', 'Black'))
	}

	const players = computed(() => {
		const out = {}
		for (const color of ['w', 'b']) {
			const p = rec.players?.[color] ?? {}
			const base = { color, name: names.value[color], comment: comments[color] }
			if (p.kind === 'engine') {
				out[color] = { ...base, kind: 'engine', level: p.level, thinking: engine.thinking ? { depth: engine.depth, since: engine.since } : null }
			} else if (p.kind === 'ai') {
				out[color] = {
					...base,
					kind: 'ai',
					persona: persona?.id,
					sourceLabel: p.sourceLabel ?? '',
					thinking: llm?.thinking.value ? { since: Date.now() - llm.elapsedMs.value } : null,
					queued: llm?.queued.value ?? false,
					elapsedMs: llm?.elapsedMs.value ?? 0,
				}
			} else if (kind === 'local') {
				out[color] = { ...base, kind: 'local' }
			} else {
				out[color] = { ...base, kind: 'user', userId: currentUser.uid ?? undefined }
			}
		}
		return out
	})

	const humanMoves = computed(() => moves.value.filter((m) => m.by === 'human').length)
	const can = computed(() => ({
		...NO_CAPABILITIES,
		undo: !animating.value && recordResult.value === null && (kind === 'local' ? moves.value.length > 0 : humanMoves.value > 0),
		resign: result.value === null && !animating.value,
		rematch: result.value !== null,
		chat: kind === 'ai',
		coach: true,
		analysis: true,
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
	 * @param {string} text comment
	 * @param {string|null} mood mood
	 */
	function comment(color, text, mood = null) {
		if (text) {
			comments[color] = { text, mood, at: Date.now() }
		}
	}

	/**
	 * Apply a move with the roll memo, persist it, animate it and show the new state.
	 *
	 * @param {string} code move code
	 * @param {string} by human | engine | ai | ai-fallback
	 * @param {object} [extra] {comment, mood}
	 * @return {Promise<object>} the step
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
					names: { mover: names.value[mover], opponent: names.value[mover === 'w' ? 'b' : 'w'] },
				})
			}
		} catch {
			// an animation failure never blocks the game
		} finally {
			steps.push(step)
			states.push(res.state)
			moves.value = [...moves.value, toEntry(step, entry)]
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
		reportGameEvent({
			type: 'move',
			mode: kind,
			mine: by === 'human',
			move: res.move,
			measurement: res.measurement,
			before,
			after: res.state,
			assisted: rec.assisted,
		})
		return step
	}

	/**
	 * A human move: persona reactions to lucky or unlucky rolls.
	 *
	 * @param {object} step played step
	 */
	function reactToHumanRoll(step) {
		if (!persona || !step.measurement) {
			return
		}
		const o = step.measurement.outcomes.find((x) => x.key === step.measurement.key)
		const p = o ? o.weight / T : 1
		if (step.measurement.key === 'capture' && p < 0.5) {
			comment(aiColor, cannedLine(persona, 'opponentLucky', d.rng), 'surprised')
		} else if (step.measurement.key === 'miss' && p < 0.5) {
			comment(aiColor, cannedLine(persona, 'opponentUnlucky', d.rng), 'happy')
		} else if (kingDanger(step.after, aiColor) >= T / 2) {
			comment(aiColor, cannedLine(persona, 'kingDanger', d.rng), 'worried')
		}
	}

	/**
	 * The recent history for the AI request.
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

	/** The opponent (engine or AI) moves. */
	async function reply() {
		if (disposed || result.value !== null || kind === 'local' || state.value.turn !== aiColor) {
			return
		}
		abortCtrl = new AbortController()
		const { signal } = abortCtrl
		try {
			if (kind === 'computer') {
				const level = rec.players[aiColor].level ?? 1
				engine.thinking = true
				engine.depth = null
				engine.since = Date.now()
				const bestMove = d.bestMove ?? (await import('../ai/client.js')).bestMove
				const r = await bestMove(state.value, {
					level,
					fast: preferences.fastEngine,
					signal,
					onProgress: (p) => {
						if (p && Number.isInteger(p.depth)) {
							engine.depth = p.depth
						}
					},
				})
				engine.depth = r.depth ?? engine.depth
				await wait(r.displayMs ?? 0, signal)
				engine.thinking = false
				let line = ''
				if (preferences.engineLines && state.value.ply - lastLinePly >= LINE_EVERY_PLIES && d.rng() < 0.35) {
					line = engineLine(LEVELS[level - 1]?.cannedLine, d.rng)
					lastLinePly = state.value.ply
				}
				await play(r.code, 'engine', line ? { comment: line, mood: 'happy' } : {})
			} else {
				const choice = await llm.chooseMove(state.value, { history: aiHistory(), signal })
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
				await play(choice.code, choice.by, { comment: choice.comment, mood: choice.mood })
			}
		} catch (e) {
			if (e?.name !== 'AbortError') {
				error.value = e
				d.onError(e)
			}
			return
		} finally {
			engine.thinking = false
			abortCtrl = null
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

	/** The game ended in this session: store, report once, sounds and persona lines. */
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
		if (persona) {
			comment(aiColor, cannedLine(persona, outcome === 'win' ? 'loss' : (outcome === 'loss' ? 'win' : 'start'), d.rng), outcome === 'loss' ? 'happy' : 'confident')
		}
		reportGameEvent({
			type: 'gameOver',
			mode: kind,
			level: kind === 'computer' ? rec.players[aiColor].level : undefined,
			persona: persona?.id,
			myColor: humanColor,
			result: { result: res.result, reason: res.reason },
			won: outcome === 'win',
			assisted: rec.assisted,
		})
	}

	/**
	 * A committed move of the local user.
	 *
	 * @param {object} move LegalMove
	 */
	async function submitMove(move) {
		if (!interactive.value) {
			return
		}
		const step = await play(move.code, 'human')
		if (kind === 'ai') {
			reactToHumanRoll(step)
		}
		afterMove()
	}

	/** Stop the engine or the AI. */
	function stopThinking() {
		abortCtrl?.abort()
		abortCtrl = null
		engine.thinking = false
	}

	/** Take back the last own move (and the reply after it); the roll memo is kept. */
	async function undo() {
		if (!can.value.undo) {
			return
		}
		stopThinking()
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
		stopThinking()
		const loser = humanColor ?? state.value.turn
		recordResult.value = { result: loser === 'w' ? '0-1' : '1-0', reason: 'resignation' }
		finish()
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

	/** Stop everything (leaving the view). */
	function dispose() {
		disposed = true
		stopThinking()
	}

	/** Start the opponent if it is to move (after loading or a new game). */
	function start() {
		if (error.value || disposed) {
			return
		}
		if (persona && rec.moves.length === 0 && !comments[aiColor]) {
			comment(aiColor, cannedLine(persona, 'start', d.rng), 'happy')
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
