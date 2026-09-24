/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The coach of a game: the analysis for the evaluation bar, threat warnings and opportunities, move-quality badges for
 * the player's moves, and hints. The numbers come from the computer player in the Web Worker (`analyze`,
 * `evaluateMove`); the modules of `coach/` interpret them.
 */

import { t } from '@nextcloud/l10n'
import { computed, onBeforeUnmount, reactive, ref, shallowRef, toRaw, unref, watch } from 'vue'
import { analyze, evaluateMove } from '../../ai/client.js'
import { findMove, moveRisk, otherColor, positionHash } from '../../engine/index.js'
import { formatPercentNumber, pieceTypeName } from '../../engine/ui/index.js'
import { preferences } from '../../services/preferences.js'
import { hintFor, MAX_TIER } from '../hints.js'
import { isQuantumMove, qualityOf } from '../quality.js'
import { kingShot, likeliestSquare, threatsAgainst, visibleThreats } from '../threats.js'

/** @typedef {import('../../engine/types.js').EngineState} EngineState */
/** @typedef {import('../../game/gameController.js').MoveEntry} MoveEntry */

/** Analysis time per position. */
export const ANALYSIS_MS = 600
/** Analysis starts after the position was stable this long. */
export const SETTLE_MS = 150
const CACHE_MAX = 64

/**
 * @param {object} options options
 * @param {import('vue').Ref<object>} options.state displayed position
 * @param {import('vue').Ref<object[]>} options.moves MoveEntry list
 * @param {import('vue').Ref<'w'|'b'|null>} options.myColor the player (null = both, pass & play)
 * @param {import('vue').Ref<boolean>} [options.enabled] false under the fair-play lock
 * @param {function(number): object} [options.stateAt] state after n moves
 * @param {import('vue').Ref<string>|string} [options.level] fixed coach level (default: the preference)
 * @param {object} [options.deps] injected `analyze`, `evaluateMove` (tests)
 * @return {object} the coach
 */
export function useCoach({ state, moves, myColor, enabled = ref(true), stateAt = null, level: fixedLevel = null, deps = {} }) {
	const d = { analyze, evaluateMove, ...deps }
	const level = computed(() => unref(fixedLevel) ?? preferences.effective?.coachLevel ?? preferences.coachLevel ?? 'beginner')
	const active = computed(() => Boolean(unref(enabled)) && level.value !== 'off')
	const analysis = shallowRef(null)
	const analysisKey = ref(null) // position hash of `analysis` (null: an estimate or a stale one)
	const analyzing = ref(false)
	const qualityByPly = ref(new Map())
	const used = ref(false)
	const cache = new Map()
	let ctrl = null
	let timer = null
	let disposed = false

	/**
	 * Whose side the coach looks after in this position.
	 *
	 * @param {EngineState} s position
	 * @return {'w'|'b'}
	 */
	const sideOf = (s) => unref(myColor) ?? s.turn

	/**
	 * Cache an analysis by position.
	 *
	 * @param {string} key position hash
	 * @param {object} a analysis
	 */
	function remember(key, a) {
		cache.set(key, a)
		if (cache.size > CACHE_MAX) {
			cache.delete(cache.keys().next().value)
		}
	}

	/** Analyse the current position (on the player's turn only: on its own turn the computer player needs the worker). */
	function schedule() {
		clearTimeout(timer)
		ctrl?.abort()
		const s = toRaw(unref(state))
		if (!active.value || !s || s.result) {
			analyzing.value = false
			return
		}
		const key = positionHash(s)
		if (cache.has(key)) {
			analysis.value = cache.get(key)
			analysisKey.value = key
			analyzing.value = false
			return
		}
		if (unref(myColor) && s.turn !== unref(myColor)) {
			analyzing.value = false
			return
		}
		analyzing.value = true
		timer = setTimeout(async () => {
			const c = new AbortController()
			ctrl = c
			try {
				const a = await d.analyze(s, { timeMs: ANALYSIS_MS, multiPv: 3, signal: c.signal })
				remember(key, a)
				if (!disposed && toRaw(unref(state)) === s) {
					analysis.value = a
					analysisKey.value = key
				}
			} catch {
				// aborted or the worker failed: keep the last analysis
			} finally {
				if (ctrl === c) {
					analyzing.value = false
				}
			}
		}, SETTLE_MS)
	}

	/**
	 * Grade the player's latest move.
	 *
	 * @param {MoveEntry} entry the move
	 * @param {number} index index in the move list
	 */
	async function grade(entry, index) {
		const before = stateAt ? toRaw(stateAt(index)) : null
		const move = before ? findMove(before, entry.code) : null
		if (!move) {
			return
		}
		const beforeKey = positionHash(before)
		let a = cache.get(beforeKey)
		let played
		let outcomes = null
		try {
			if (!a?.best?.length) {
				// the player moved before the analysis finished
				a = await d.analyze(before, { timeMs: 400, multiPv: 3, include: [move.code] })
				remember(beforeKey, a)
			}
			played = a.best.find((b) => b.code === move.code)?.E ?? a.included?.find((b) => b.code === move.code)?.E
			if (played === undefined || move.resolution === 'rolled') {
				const ev = await d.evaluateMove(before, move.code, { timeMs: 300 })
				played = played ?? ev.E
				outcomes = move.resolution === 'rolled' ? ev.outcomes : null
			}
		} catch {
			return
		}
		const color = before.turn
		const bestCode = a.best[0].code
		const classical = a.best.find((b) => findMove(before, b.code)?.type === 'standard')
		let allowsKingShot = false
		try {
			allowsKingShot = moveRisk(before, move.code) >= 0.25 && moveRisk(before, bestCode) < 0.25
		} catch {
			// best code not legal (should not happen)
		}
		const key = entry.measurement?.key
		const q = qualityOf({
			color,
			bestE: a.best[0].E,
			playedE: played,
			secondBestE: a.best[1]?.E ?? null,
			bestClassicalE: classical && classical.code !== bestCode ? classical.E : null,
			quantum: move.code === bestCode && isQuantumMove(move, before.types[move.piece]),
			allowsKingShot,
			forced: false,
			outcomes,
			realisedE: outcomes?.find((o) => o.key === key)?.E ?? null,
		})
		const map = new Map(qualityByPly.value)
		map.set(entry.ply, { ...q, code: move.code, bestCode, color, playedE: played, bestE: a.best[0].E })
		qualityByPly.value = map
		// While the opponent thinks, the bar shows the value of the move just played.
		const now = toRaw(unref(state))
		if (!disposed && now && !cache.has(positionHash(now))) {
			const realised = outcomes?.find((o) => o.key === key)?.E
			analysis.value = { E: realised ?? played, fog: null, mate: null, best: [], estimate: true }
			analysisKey.value = null
		}
	}

	watch(() => unref(state), schedule, { immediate: true })
	watch(active, schedule)
	watch(() => unref(moves)?.length ?? 0, (n, old) => {
		if (!active.value || n !== (old ?? 0) + 1) {
			return
		}
		const entry = unref(moves)[n - 1]
		const me = unref(myColor)
		if (me === null || entry.color === me) {
			grade(entry, n - 1)
		}
	})

	const threats = computed(() => {
		const s = toRaw(unref(state))
		if (!active.value || !s || s.result) {
			return []
		}
		return visibleThreats(threatsAgainst(s, sideOf(s)), level.value)
	})

	const opportunity = computed(() => {
		const s = toRaw(unref(state))
		if (!active.value || !s || s.result || s.turn !== sideOf(s)) {
			return null
		}
		const chance = kingShot(s, s.turn)
		const min = level.value === 'beginner' ? 0 : 0.5
		if (chance <= min && !(analysis.value?.mate && analysis.value.mate.winner === s.turn)) {
			return null
		}
		const king = s.turn === 'w' ? 16 : 0
		return { chance, square: likeliestSquare(s, king), mate: analysis.value?.mate?.winner === s.turn ? analysis.value.mate : null }
	})

	// Board markers carry their explanation (title, screen readers) and the percentage the board shows next to them.
	const markers = computed(() => {
		const out = threats.value.map((x) => {
			const pct = Math.round(x.pCap * 100)
			return {
				square: x.square,
				kind: 'threat',
				pct,
				text: t('quantumchess', 'Your {piece} is {pct} capturable.', { piece: pieceTypeName(x.type), pct: formatPercentNumber(pct) }),
			}
		})
		const o = opportunity.value
		if (o && o.square !== null && o.chance > 0) {
			const pct = Math.round(o.chance * 100)
			out.push({
				square: o.square,
				kind: 'opportunity',
				pct,
				text: o.chance >= 1
					? t('quantumchess', 'You can capture the king for certain!')
					: t('quantumchess', 'You can capture the king: {pct}!', { pct: formatPercentNumber(pct) }),
			})
		}
		return out
	})

	// --- Hints ---
	/** Whether `analysis` belongs to the displayed position. */
	const ready = computed(() => {
		const s = toRaw(unref(state))
		return Boolean(s && analysisKey.value && analysisKey.value === positionHash(s))
	})
	const hint = reactive({
		tier: 0,
		text: '',
		highlights: [],
		arrows: [],
		/** Reveal the next tier. */
		next() {
			const s = toRaw(unref(state))
			if (!active.value || !preferences.hints || hint.tier >= MAX_TIER || !ready.value) {
				return
			}
			const h = hintFor(s, analysis.value, hint.tier + 1)
			if (!h) {
				return
			}
			hint.tier++
			hint.text = h.text
			hint.highlights = h.highlights
			hint.arrows = h.arrows
			used.value = true
		},
		/** Hide the hint. */
		reset() {
			hint.tier = 0
			hint.text = ''
			hint.highlights = []
			hint.arrows = []
		},
	})
	watch(() => unref(state), () => hint.reset())

	const arrows = computed(() => hint.arrows)
	const highlights = computed(() => hint.highlights)

	onBeforeUnmount(() => {
		disposed = true
		clearTimeout(timer)
		ctrl?.abort()
	})

	return {
		level,
		active,
		analysis,
		analyzing,
		ready,
		threats,
		opportunity,
		markers,
		arrows,
		highlights,
		qualityByPly,
		hint,
		used,
		/** The side the coach looks after. */
		side: computed(() => {
			const s = unref(state)
			return s ? sideOf(s) : 'w'
		}),
		/** The opponent of that side. */
		opponent: computed(() => otherColor(unref(state) ? sideOf(unref(state)) : 'w')),
	}
}
