/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * How an LLM opponent chooses a move. The computer player ranks candidate moves in the Web Worker; one request asks the
 * LLM source to pick one (Nextcloud Assistant tasks are polled); the answer is validated with `findMove`, retried once
 * with feedback, and otherwise replaced by the best ✓ candidate (marked `ai-fallback`) with a canned line of the
 * persona. After 3 fallbacks within 5 LLM moves, the game asks for a candidate number instead of a move code ("index
 * mode"). *Let the engine move* appears after 20 s; the computer player moves by itself after 120 s. The caller makes
 * the rolls of the chosen move (roll memo).
 */

import { getLanguage } from '@nextcloud/l10n'
import { computed, ref } from 'vue'
import { findMove, whyIllegal } from '../../engine/index.js'
import { cancelAiTask, requestAiMove } from '../../services/api.js'
import { waitForAiTask } from '../aiTasks.js'
import { cannedLine } from '../personas.js'

/** @typedef {import('../../engine/types.js').EngineState} EngineState */
/** @typedef {import('../../engine/types.js').LegalMove} LegalMove */

/** Show *Let the engine move* after this many ms. */
export const LET_ENGINE_AFTER_MS = 20000
/** The engine moves by itself after this many ms. */
export const ENGINE_TAKES_OVER_MS = 120000
/** Timeout of a direct provider request. */
export const DIRECT_TIMEOUT_MS = 60000
/** Fallbacks within the window that switch to index mode … */
export const INDEX_MODE_FALLBACKS = 3
/** … window in AI moves. */
export const INDEX_MODE_WINDOW = 5

/**
 * The kind of a move for the persona style bonus.
 *
 * @param {LegalMove|null} legal the move
 * @return {'split'|'merge'|'measure'|'roll'|'standard'}
 */
export function moveKind(legal) {
	if (!legal) {
		return 'standard'
	}
	if (legal.type === 'split' || legal.type === 'merge' || legal.type === 'measure') {
		return legal.type
	}
	return legal.resolution === 'rolled' ? 'roll' : 'standard'
}

/**
 * The fallback candidate: the ✓ candidate with the highest E + style bonus (any candidate when none is ✓).
 *
 * @param {EngineState} state position
 * @param {object[]} cands candidates
 * @param {object} persona persona
 * @return {object|null}
 */
export function fallbackCandidate(state, cands, persona) {
	const pool = cands.some((c) => c.ok) ? cands.filter((c) => c.ok) : cands
	let best = null
	let bestScore = -Infinity
	for (const c of pool) {
		const score = c.E + (persona?.styleBonus?.[moveKind(findMove(state, c.code))] ?? 0)
		if (score > bestScore) {
			best = c
			bestScore = score
		}
	}
	return best
}

/**
 * @param {object} options options
 * @param {object} options.record local game record (`record.ai` is updated)
 * @param {import('../personas.js').Persona} options.persona the persona
 * @param {string} options.source LLM source id
 * @param {string|null} [options.model] model id
 * @param {'relaxed'|'balanced'|'sharp'} [options.strength] strength
 * @param {object} [deps] injected dependencies (tests): candidates, requestAiMove, waitForAiTask, cancelAiTask, onError
 * @return {object}
 */
export function useLlmOpponent({ record, persona, source, model = null, strength = 'balanced' }, deps = {}) {
	const d = {
		candidates: null,
		requestAiMove,
		waitForAiTask,
		cancelAiTask,
		onError: () => {},
		now: () => Date.now(),
		// useLocalGame passes every dependency, undefined when not injected: keep the defaults for those
		...Object.fromEntries(Object.entries(deps).filter(([, v]) => v !== undefined)),
	}
	const thinking = ref(false)
	const elapsedMs = ref(0)
	const answerMode = ref(record.ai?.answerMode === 'index' ? 'index' : 'code')
	const queued = ref(false)
	const canLetEngineMove = computed(() => thinking.value && elapsedMs.value >= LET_ENGINE_AFTER_MS)
	let current = null
	let message = null

	/**
	 * The candidates function of the computer player, loaded lazily so the worker client stays out of the main chunk.
	 *
	 * @return {Promise<(state: object, options: object) => Promise<object[]>>}
	 */
	async function candidatesFn() {
		if (d.candidates) {
			return d.candidates
		}
		const client = await import('../../ai/client.js')
		return client.candidates
	}

	/**
	 * Ask the source once and validate the answer.
	 *
	 * @param {EngineState} state position
	 * @param {object[]} cands candidates
	 * @param {object} body request body without feedback
	 * @param {object|null} feedback {answer, reason}
	 * @param {AbortSignal} signal abort signal
	 * @return {Promise<object>} {ok, code?, comment?, mood?, answer?, reason?}
	 */
	async function attempt(state, cands, body, feedback, signal) {
		let res = await d.requestAiMove({ ...body, feedback, answerMode: answerMode.value }, { signal, timeout: DIRECT_TIMEOUT_MS })
		if (res?.status === 'pending' && res.taskId) {
			queued.value = true
			current.taskId = res.taskId
			res = await d.waitForAiTask(res.taskId, { signal })
			current.taskId = null
		}
		const pick = Number.isInteger(res?.pick) ? res.pick : null
		const text = typeof res?.move === 'string' ? res.move.trim() : ''
		let legal = null
		let answer = text
		if (pick !== null && cands[pick - 1]) {
			legal = findMove(state, cands[pick - 1].code)
			answer = String(pick)
		} else if (text !== '') {
			legal = findMove(state, text)
		}
		if (!legal) {
			const reason = text === '' ? 'malformed' : (whyIllegal(state, text) ?? 'malformed')
			return { ok: false, answer: answer || '-', reason }
		}
		if (strength !== 'relaxed') {
			const c = cands.find((x) => x.code === legal.code)
			if (!c || !c.ok) {
				return { ok: false, answer: legal.code, reason: 'not_recommended' }
			}
		}
		return { ok: true, code: legal.code, comment: typeof res.comment === 'string' ? res.comment.slice(0, 200) : '', mood: res.mood ?? null }
	}

	/**
	 * Record a fallback and switch to index mode when needed.
	 *
	 * @param {number} ply ply of the LLM opponent's move
	 */
	function noteFallback(ply) {
		const ai = record.ai
		ai.fallbackPlies = [...(ai.fallbackPlies ?? []), ply]
		const recent = ai.fallbackPlies.filter((p) => p > ply - 2 * INDEX_MODE_WINDOW)
		if (recent.length >= INDEX_MODE_FALLBACKS && answerMode.value !== 'index') {
			answerMode.value = 'index'
			ai.answerMode = 'index'
		}
	}

	/**
	 * Choose the LLM opponent's move.
	 *
	 * @param {EngineState} state position (the LLM opponent is to move)
	 * @param {object} [options] options
	 * @param {Array} [options.history] last moves [{ply, code, key, weight}]
	 * @param {AbortSignal} [options.signal] outer abort (undo, leaving the game)
	 * @return {Promise<{code: string, by: 'ai'|'ai-fallback', comment: string, mood: string|null, error?: string}>}
	 */
	async function chooseMove(state, { history = [], signal } = {}) {
		const inner = new AbortController()
		const onOuter = () => inner.abort()
		signal?.addEventListener('abort', onOuter, { once: true })
		current = { inner, forced: false, taskId: null }
		const started = d.now()
		thinking.value = true
		queued.value = false
		elapsedMs.value = 0
		const ticker = setInterval(() => {
			elapsedMs.value = d.now() - started
			if (elapsedMs.value >= ENGINE_TAKES_OVER_MS) {
				letEngineMove()
			}
		}, 250)
		try {
			const cands = await (await candidatesFn())(state, { strength, tolerance: persona.tolerance, signal: inner.signal })
			if (cands.length === 0) {
				throw new Error('no candidates')
			}
			const body = {
				source,
				model,
				persona: persona.id,
				color: state.turn,
				language: getLanguage(),
				state,
				history: history.slice(-20),
				candidates: cands.slice(0, 6).map((c) => ({ code: c.code, E: c.E, tags: c.tags, ok: c.ok })),
				message,
			}
			message = null
			let error = null
			try {
				const first = await attempt(state, cands, body, null, inner.signal)
				if (first.ok) {
					return { code: first.code, by: 'ai', comment: first.comment, mood: first.mood }
				}
				const second = await attempt(state, cands, body, { answer: first.answer, reason: first.reason }, inner.signal)
				if (second.ok) {
					return { code: second.code, by: 'ai', comment: second.comment, mood: second.mood }
				}
			} catch (e) {
				if (e?.name === 'AbortError' && !current.forced) {
					throw e
				}
				if (e?.name !== 'AbortError') {
					error = e?.code ?? 'error'
					d.onError(e)
				}
			}
			const fb = fallbackCandidate(state, cands, persona)
			noteFallback(state.ply)
			return { code: fb.code, by: 'ai-fallback', comment: cannedLine(persona, 'fallback'), mood: 'thinking', ...(error ? { error } : {}) }
		} finally {
			clearInterval(ticker)
			signal?.removeEventListener('abort', onOuter)
			if (current?.taskId) {
				d.cancelAiTask(current.taskId).catch(() => {})
			}
			current = null
			thinking.value = false
			queued.value = false
		}
	}

	/** Stop waiting for the LLM source and let the computer player choose. */
	function letEngineMove() {
		if (current && !current.forced) {
			current.forced = true
			current.inner.abort()
		}
	}

	/**
	 * Something to say to the LLM opponent, sent with the next request (at most 200 characters).
	 *
	 * @param {string} text message
	 * @param {number} ply current ply
	 */
	function say(text, ply = 0) {
		const clean = String(text ?? '').replace(/[\p{Cc}]/gu, ' ').trim().slice(0, 200)
		if (clean === '') {
			return
		}
		message = clean
		record.ai.chat = [...(record.ai.chat ?? []), { from: 'me', text: clean, ply }]
	}

	return { thinking, queued, elapsedMs, canLetEngineMove, letEngineMove, cancel: letEngineMove, answerMode, say, chooseMove }
}
