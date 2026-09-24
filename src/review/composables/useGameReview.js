/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The post-game review of a local or finished online game: the game replayed with its recorded rolls, the analysis of
 * every move by the computer player (in the Web Worker, 400 ms per move, cached per game and engine version), the key
 * moments, and stepping through the positions.
 */

import { t } from '@nextcloud/l10n'
import { computed, ref, shallowRef } from 'vue'
import { analyzeGame, ENGINE_VERSION } from '../../ai/client.js'
import { isQuantumMove, qualityOfPly } from '../../coach/quality.js'
import { findMove, moveNotation, otherColor } from '../../engine/index.js'
import { resultSentence } from '../../engine/ui/index.js'
import { loadLocalGame } from '../../game/localGames.js'
import { kingCaptureContext, resultText } from '../../game/resultText.js'
import { getGame } from '../../services/api.js'
import { readJson, writeJson } from '../../services/storage.js'
import { keyMoments } from '../keyMoments.js'
import { reviewGame } from '../reviewGame.js'

/** Analysis time per move in ms. */
const MS_PER_PLY = 400

/** Strength of the analysis (a computer level). */
const ANALYSIS_LEVEL = 4

/**
 * @param {object} options the game to review
 * @param {'local'|'online'} options.source where the game is stored
 * @param {string} options.id local or online game id
 * @param {object} [deps] injected dependencies (tests): getGame, loadLocalGame, analyzeGame
 * @return {object} the review state and actions for ReviewView
 */
export function useGameReview({ source, id }, deps = {}) {
	const d = { getGame, loadLocalGame, analyzeGame, ...deps }
	/** The replayed game (`reviewGame()`), once loaded. */
	const game = shallowRef(null)
	/** Why the game cannot be reviewed, in words. */
	const error = ref(null)
	/** Number of moves played in the shown position. */
	const ply = ref(0)
	/** The analysis of each move, as far as it got. */
	const plies = shallowRef([])
	const analysing = ref(false)
	const analysisError = ref(false)
	const activeMoment = ref(null)
	const arrows = shallowRef([])
	let ctrl = null

	const states = computed(() => game.value?.states ?? [])
	const entries = computed(() => {
		const g = game.value
		if (!g) {
			return []
		}
		return g.moves.map((m, i) => ({
			ply: g.states[i].ply,
			color: g.states[i].turn,
			code: m.code,
			notation: moveNotation(g.states[i], g.steps[i].move, g.steps[i].measurement),
			measurement: g.steps[i].measurement,
			u: m.u,
			by: 'human',
		}))
	})
	const lastMove = computed(() => {
		if (!game.value || ply.value === 0) {
			return null
		}
		const s = game.value.steps[ply.value - 1]
		return { move: s.move, key: s.measurement?.key ?? null }
	})
	const rollText = computed(() => {
		if (!game.value || ply.value === 0) {
			return ''
		}
		const g = game.value
		const s = g.steps[ply.value - 1]
		if (!s.measurement) {
			return ''
		}
		// The reviewer's point of view ("Your king was captured" for the loser); pass & play: the mover's.
		const mover = s.before.turn
		const other = otherColor(mover)
		const pov = g.viewer === null || mover === g.viewer ? 'mover' : 'opponent'
		return resultSentence({ before: s.before, move: s.move, measurement: s.measurement, pov, names: { mover: g.names[mover], opponent: g.names[other] } })?.text ?? ''
	})
	const resultLine = computed(() => {
		const r = game.value?.result
		if (!r) {
			return ''
		}
		const g = game.value
		const extra = r.reason === 'king_captured' && g.moves.length
			? kingCaptureContext({ code: g.moves[g.moves.length - 1].code, measurement: g.steps[g.steps.length - 1].measurement })
			: {}
		const text = resultText(r.result, r.reason, g.names, extra)
		return `${text.title} · ${text.reason}`
	})
	const quantumFlags = computed(() => (game.value ? game.value.steps.map((s) => isQuantumMove(s.move, s.before.types[s.move.piece])) : []))
	const moments = computed(() => keyMoments(plies.value))
	const currentQuality = computed(() => {
		const p = plies.value[ply.value - 1]
		return p ? qualityOfPly(p, quantumFlags.value[ply.value - 1]) : null
	})

	/**
	 * Show the position after k moves.
	 *
	 * @param {number} k moves played
	 */
	function go(k) {
		if (!game.value) {
			return
		}
		ply.value = Math.max(0, Math.min(game.value.moves.length, k))
		arrows.value = []
		activeMoment.value = null
	}

	/**
	 * Show a key moment: the position before the move, with the played and the best move.
	 *
	 * @param {object} m moment
	 */
	function showMoment(m) {
		const index = game.value.states.findIndex((s) => s.ply === m.ply)
		go(index < 0 ? 0 : index)
		activeMoment.value = m.ply
		const s = game.value.states[ply.value]
		const list = []
		const best = findMove(s, m.bestCode)
		const playedMove = findMove(s, m.code)
		if (playedMove && m.code !== m.bestCode) {
			list.push({ from: playedMove.from[0], to: playedMove.to[0], kind: 'played' })
		}
		if (best) {
			list.push({ from: best.from[0], to: best.to[0], kind: 'best' })
		}
		arrows.value = list
	}

	/**
	 * Draw a move chip of the coach chat.
	 *
	 * @param {{code: string|null}} e event
	 */
	function chipMove(e) {
		const m = e?.code ? findMove(states.value[ply.value], e.code) : null
		arrows.value = m ? [{ from: m.from[0], to: m.to[0], kind: 'best' }] : []
	}

	/**
	 * Load the game.
	 *
	 * @return {Promise<object|null>} the input of `reviewGame()`, or null with `error` set
	 */
	async function load() {
		if (source === 'local') {
			const rec = d.loadLocalGame(id)
			if (!rec) {
				error.value = t('quantumchess', 'This game is not on this device any more.')
				return null
			}
			return { source, id, local: rec }
		}
		try {
			const g = await d.getGame(id)
			if (!['finished', 'aborted'].includes(g?.status)) {
				error.value = t('quantumchess', 'Available after the game.')
				return null
			}
			return { source, id, online: g }
		} catch {
			error.value = t('quantumchess', 'The game could not be loaded.')
			return null
		}
	}

	/** Run the analysis, or restore it from the cache. */
	async function analyze() {
		const g = game.value
		const key = `quantumchess.review.v1.${g.source}.${g.id}.${ENGINE_VERSION}`
		const cached = readJson(key, null)
		if (cached?.plies?.length === g.moves.length || (cached?.complete && cached.plies)) {
			plies.value = cached.plies
			return
		}
		analysing.value = true
		ctrl = new AbortController()
		const got = []
		try {
			const res = await d.analyzeGame({ startState: g.startState, moves: g.moves }, {
				msPerPly: MS_PER_PLY,
				level: ANALYSIS_LEVEL,
				signal: ctrl.signal,
				onProgress: (p) => {
					got.push(p)
					plies.value = [...got]
				},
			})
			plies.value = res.plies
			writeJson(key, { plies: res.plies, complete: true })
		} catch (e) {
			if (e?.name !== 'AbortError') {
				analysisError.value = true
			}
		} finally {
			analysing.value = false
		}
	}

	/** Load and replay the game, show its final position and start the analysis. */
	async function start() {
		const input = await load()
		if (!input) {
			return
		}
		try {
			game.value = reviewGame(input)
		} catch {
			error.value = t('quantumchess', 'The game could not be replayed.')
			return
		}
		ply.value = game.value.moves.length
		analyze()
	}

	/** Stop a running analysis. */
	function stop() {
		ctrl?.abort()
	}

	return {
		game,
		error,
		ply,
		plies,
		analysing,
		analysisError,
		activeMoment,
		arrows,
		states,
		entries,
		lastMove,
		rollText,
		resultLine,
		quantumFlags,
		moments,
		currentQuality,
		go,
		showMoment,
		chipMove,
		start,
		stop,
	}
}
