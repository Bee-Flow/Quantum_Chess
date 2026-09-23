/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * In-app preferences (SPEC §11.3): one JSON document per user, loaded from the `preferences` initial state, merged
 * over PREFERENCE_DEFAULTS, changed live and saved debounced (500 ms) through `PUT /api/settings/preferences`.
 * Unknown keys are preserved. `preferences.effective` resolves the automatic values.
 */

import { computed, reactive, ref, toRaw } from 'vue'
import { initial } from './initialState.js'

export const PREFERENCE_DEFAULTS = Object.freeze({
	v: 1,
	// Board
	boardTheme: 'slate', // wood (Classic) | slate (Blue) | quantum; contrast is automatic (LEAN-1.0: three themes)
	pieceSet: 'cburnett',
	coordinates: 'inside', // inside | outside | all | off
	highlightLastMove: true,
	showLegalMoves: true,
	// Quantum display
	showPercentages: true,
	probabilityFormat: 'percent', // percent | fraction
	ghostStyle: 'fade', // fade | solid
	linkThreads: 'selection', // off | selection | always
	kingDangerBoth: true,
	showPossibilities: true,
	physicsNames: false,
	// Moves
	inputMode: 'both', // both | click | drag
	confirmMoves: null, // null = by pointer | never | rolled | always
	safetyNet: true,
	autoQueen: false,
	confirmResign: true,
	// Animation and sound
	animationSpeed: null, // null = normal (off under reduced motion) | slow | normal | fast | off
	sound: true,
	volume: 40,
	moveChime: true,
	vibration: true,
	// Coach
	coachLevel: null, // null = beginner until 6 lessons are done, then standard | beginner | standard | off
	evalBar: true,
	evalFormat: 'percent',
	hints: true,
	engineLines: true,
	fastEngine: false,
	// Pass & play
	autoFlip: false,
	tabletop: false,
	// Remembered UI state
	seenTips: [],
	lastNewGame: {},
	navCollapsed: {},
})

/** Debounce of the save request in ms. */
export const SAVE_DELAY_MS = 500

/**
 * Merge a stored document over the defaults (unknown keys kept, wrong types replaced by the default).
 *
 * @param {object} stored stored document
 * @return {object}
 */
export function mergePreferences(stored) {
	const out = {}
	for (const [key, value] of Object.entries(PREFERENCE_DEFAULTS)) {
		out[key] = Array.isArray(value) ? [...value] : (value !== null && typeof value === 'object' ? { ...value } : value)
	}
	if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
		for (const [key, value] of Object.entries(stored)) {
			if (key === 'effective') {
				continue
			}
			const def = PREFERENCE_DEFAULTS[key]
			if (def === undefined || def === null || value === null || typeof def === typeof value) {
				if (Array.isArray(def) && !Array.isArray(value)) {
					continue
				}
				out[key] = value
			}
		}
	}
	return out
}

/**
 *
 * @param query
 */
function media(query) {
	const r = ref(false)
	if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
		const mq = window.matchMedia(query)
		r.value = mq.matches
		mq.addEventListener?.('change', (e) => {
			r.value = e.matches
		})
	}
	return r
}
const coarse = media('(pointer: coarse)')
const reduced = media('(prefers-reduced-motion: reduce)')

const progress = initial('trainerProgress', {})

/**
 * Lessons completed in the trainer progress document.
 *
 * @return {number}
 */
function lessonsDone() {
	const lessons = progress?.lessons
	return lessons && typeof lessons === 'object' ? Object.values(lessons).filter((l) => l?.done).length : 0
}

/** The reactive preferences (defaults merged). */
export const preferences = reactive(mergePreferences(initial('preferences', {})))

const effectiveConfirm = computed(() => preferences.confirmMoves ?? (coarse.value ? 'rolled' : 'never'))
const effectiveSpeed = computed(() => preferences.animationSpeed ?? (reduced.value ? 'off' : 'normal'))
const effectiveCoach = computed(() => preferences.coachLevel ?? (lessonsDone() >= 6 ? 'standard' : 'beginner'))

// `effective` is not enumerable: it is never saved.
Object.defineProperty(toRaw(preferences), 'effective', {
	enumerable: false,
	value: Object.freeze({
		get confirmMoves() {
			return effectiveConfirm.value
		},
		get animationSpeed() {
			return effectiveSpeed.value
		},
		get coachLevel() {
			return effectiveCoach.value
		},
	}),
})

let timer = null
let saving = Promise.resolve()

/**
 * The document as stored (without `effective`).
 *
 * @return {object}
 */
export function preferencesDocument() {
	return JSON.parse(JSON.stringify(toRaw(preferences)))
}

/** Save now (cancels a pending debounce). */
export function flushPreferences() {
	if (timer !== null) {
		clearTimeout(timer)
		timer = null
	}
	const doc = preferencesDocument()
	// api.js is loaded lazily: the board reads this module in environments without a browser (unit tests, tools)
	saving = saving.then(async () => (await import('./api.js')).savePreferences(doc)).catch(() => {
		// Offline or rejected: the value stays live in this tab and is saved with the next change.
	})
	return saving
}

/** Schedule a save. */
function scheduleSave() {
	if (timer !== null) {
		clearTimeout(timer)
	}
	timer = setTimeout(() => {
		timer = null
		flushPreferences()
	}, SAVE_DELAY_MS)
}

/**
 * Change one preference (live, saved debounced).
 *
 * @param {string} key preference key
 * @param {any} value new value
 */
export function setPreference(key, value) {
	preferences[key] = value
	scheduleSave()
}

/**
 * Change several preferences.
 *
 * @param {object} patch key → value
 */
export function updatePreferences(patch) {
	Object.assign(preferences, patch)
	scheduleSave()
}

/**
 * Remember that a first-time tip was seen.
 *
 * @param {string} id tip id
 */
export function markTipSeen(id) {
	if (!preferences.seenTips.includes(id)) {
		setPreference('seenTips', [...preferences.seenTips, id])
	}
}

/**
 * Remember the options of a new game per mode.
 *
 * @param {string} mode online | computer | ai | local
 * @param {object} options options
 */
export function rememberNewGame(mode, options) {
	setPreference('lastNewGame', { ...preferences.lastNewGame, [mode]: { ...options } })
}
