/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The opponent in a local game: the computer player or an LLM opponent. It chooses the opponent's moves, keeps the
 * thinking state that the player card shows, and provides the opponent's comments (the computer's canned lines, the
 * persona's reactions). The caller plays the chosen move, so rolls still go through the game's roll memo.
 */

import { computed, reactive } from 'vue'
import { LEVELS } from '../../ai/levels.js'
import { kingDanger, T } from '../../engine/index.js'
import { useLlmOpponent } from '../../llm/composables/useLlmOpponent.js'
import { cannedLine } from '../../llm/personas.js'
import { sleep } from '../../services/async.js'
import { preferences } from '../../services/preferences.js'
import { engineLine } from '../computerLines.js'

/** @typedef {import('../../engine/types.js').EngineState} EngineState */

/** Plies between two canned lines of the computer (five of its own moves). */
const LINE_EVERY_PLIES = 10

/** Chance that the computer says something when it may. */
const LINE_CHANCE = 0.35

/**
 * A move chosen by the opponent.
 *
 * @typedef {object} OpponentChoice
 * @property {string} code move code
 * @property {'engine'|'ai'|'ai-fallback'} by who chose it: the computer player, the LLM, or the computer player
 *   because the LLM gave no usable answer
 * @property {string} [comment] what the opponent says with the move
 * @property {string|null} [mood] mood of the comment
 * @property {unknown} [error] why the LLM gave no usable answer
 */

/**
 * A comment of the opponent.
 *
 * @typedef {object} OpponentLine
 * @property {string} text what the opponent says
 * @property {string} mood happy, surprised, worried or confident
 */

/**
 * @param {object} options the opponent
 * @param {'computer'|'ai'|'local'} options.kind the game mode; `local` (pass & play) has no opponent
 * @param {object} options.record local game record
 * @param {'w'|'b'|null} options.color the opponent's side
 * @param {object|null} options.persona persona of an LLM opponent
 * @param {object} [deps] injected dependencies (tests): bestMove, candidates, requestAiMove, waitForAiTask,
 *   cancelAiTask, rng (flavour only), onError
 * @return {object} {engine, llm, thinking, chooseMove, stop, greeting, reactionTo, farewell}
 */
export function useOpponentTurn({ kind, record, color, persona }, deps = {}) {
	const d = { rng: Math.random, ...deps }
	const engine = reactive({ thinking: false, depth: null, since: 0 })
	const player = record.players?.[color]
	const llm = kind === 'ai'
		? useLlmOpponent({
				record,
				persona,
				source: player.source,
				model: player.model ?? null,
				strength: player.strength ?? 'balanced',
			}, {
				candidates: d.candidates,
				requestAiMove: d.requestAiMove,
				waitForAiTask: d.waitForAiTask,
				cancelAiTask: d.cancelAiTask,
				onError: d.onError,
			})
		: null
	const thinking = computed(() => engine.thinking || (llm?.thinking.value ?? false))
	let abortCtrl = null
	let lastLinePly = -Infinity

	/**
	 * The computer player's move: searched in the Web Worker, shown after the level's thinking time, sometimes with a
	 * canned line.
	 *
	 * @param {EngineState} state position, the computer to move
	 * @param {AbortSignal} signal cancels the search and the wait
	 * @return {Promise<OpponentChoice>}
	 */
	async function computerMove(state, signal) {
		const level = player.level ?? 1
		engine.thinking = true
		engine.depth = null
		engine.since = Date.now()
		const bestMove = d.bestMove ?? (await import('../../ai/client.js')).bestMove
		const r = await bestMove(state, {
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
		await sleep(r.displayMs ?? 0, signal)
		engine.thinking = false
		let line = ''
		if (preferences.engineLines && state.ply - lastLinePly >= LINE_EVERY_PLIES && d.rng() < LINE_CHANCE) {
			line = engineLine(LEVELS[level - 1]?.cannedLine, d.rng)
			lastLinePly = state.ply
		}
		return line ? { code: r.code, by: 'engine', comment: line, mood: 'happy' } : { code: r.code, by: 'engine' }
	}

	/**
	 * Choose the opponent's move. Rejects with an `AbortError` when `stop()` is called meanwhile.
	 *
	 * @param {EngineState} state position, the opponent to move
	 * @param {Array<{ply: number, code: string, key: string|null, weight: number|null}>} history the recent moves,
	 *   sent to the LLM
	 * @return {Promise<OpponentChoice>}
	 */
	async function chooseMove(state, history) {
		abortCtrl = new AbortController()
		const { signal } = abortCtrl
		try {
			return kind === 'computer'
				? await computerMove(state, signal)
				: await llm.chooseMove(state, { history, signal })
		} finally {
			engine.thinking = false
			abortCtrl = null
		}
	}

	/** Stop the computer player or the LLM request. */
	function stop() {
		abortCtrl?.abort()
		abortCtrl = null
		engine.thinking = false
	}

	/**
	 * The LLM opponent's greeting at the start of a game.
	 *
	 * @return {OpponentLine|null}
	 */
	function greeting() {
		return persona ? { text: cannedLine(persona, 'start', d.rng), mood: 'happy' } : null
	}

	/**
	 * The LLM opponent's reaction to a rolled move of the player: a lucky or unlucky roll, or its king in danger.
	 *
	 * @param {{after: object, measurement: object|null}} step the player's move
	 * @return {OpponentLine|null}
	 */
	function reactionTo(step) {
		if (!persona || !step.measurement) {
			return null
		}
		const o = step.measurement.outcomes.find((x) => x.key === step.measurement.key)
		const p = o ? o.weight / T : 1
		if (step.measurement.key === 'capture' && p < 0.5) {
			return { text: cannedLine(persona, 'opponentLucky', d.rng), mood: 'surprised' }
		}
		if (step.measurement.key === 'miss' && p < 0.5) {
			return { text: cannedLine(persona, 'opponentUnlucky', d.rng), mood: 'happy' }
		}
		if (kingDanger(step.after, color) >= T / 2) {
			return { text: cannedLine(persona, 'kingDanger', d.rng), mood: 'worried' }
		}
		return null
	}

	/**
	 * The LLM opponent's last word.
	 *
	 * @param {'win'|'loss'|'draw'} outcome the result from the player's side
	 * @return {OpponentLine|null}
	 */
	function farewell(outcome) {
		if (!persona) {
			return null
		}
		const event = outcome === 'win' ? 'loss' : (outcome === 'loss' ? 'win' : 'start')
		return { text: cannedLine(persona, event, d.rng), mood: outcome === 'loss' ? 'happy' : 'confident' }
	}

	return { engine, llm, thinking, chooseMove, stop, greeting, reactionTo, farewell }
}
