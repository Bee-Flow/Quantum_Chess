/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The display preferences the board reads (SPEC §11.3, §14.6.1). The source of truth is `preferences` of
 * `src/services/preferences.js` ‹frontend-app›. It is picked up through `import.meta.glob`, so the board also works
 * (with the SPEC defaults) where that service is not bundled: the dev harness, settings pages and unit tests.
 * `overrideBoardPreferences()` layers non-persistent values on top (the dev playground, tests).
 */

import { computed, reactive, ref } from 'vue'

const services = import.meta.glob('../../services/preferences.js', { eager: true })
const service = Object.values(services)[0] ?? null

/** The board-related keys of PREFERENCE_DEFAULTS (SPEC §11.3). */
export const BOARD_PREFERENCE_DEFAULTS = Object.freeze({
	boardTheme: 'nextcloud',
	pieceSet: 'cburnett',
	coordinates: 'inside',
	highlightLastMove: true,
	showLegalMoves: true,
	showPercentages: true,
	probabilityFormat: 'percent',
	ghostStyle: 'fade',
	linkThreads: 'selection',
	kingDangerBoth: true,
	showPossibilities: true,
	physicsNames: false,
	inputMode: 'both',
	confirmMoves: null,
	safetyNet: true,
	autoQueen: false,
	animationSpeed: null,
	sound: true,
	volume: 40,
	moveChime: true,
	vibration: true,
	tabletop: false,
	seenTips: [],
})

/** Speed factors of GAME-DESIGN §3.2. */
export const SPEED_FACTORS = Object.freeze({ slow: 1.5, normal: 1, fast: 0.5, off: 0 })

const local = reactive({ ...BOARD_PREFERENCE_DEFAULTS, seenTips: [] })
const overrides = reactive({})

/**
 * A media query that follows changes.
 *
 * @param {string} query media query
 * @return {import('vue').Ref<boolean>}
 */
function mediaRef(query) {
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

export const reducedMotion = mediaRef('(prefers-reduced-motion: reduce)')
export const coarsePointer = mediaRef('(pointer: coarse)')

/**
 * The current value of a preference: override, then the service, then the local fallback.
 *
 * @param {string} key preference key
 * @return {any}
 */
function read(key) {
	if (key in overrides) {
		return overrides[key]
	}
	const prefs = service?.preferences
	if (prefs && key in prefs && prefs[key] !== undefined) {
		return prefs[key]
	}
	return local[key]
}

/**
 * Reactive, read-only view of the board preferences plus the resolved values (`confirmMovesEffective`,
 * `animationSpeedEffective`, `speedFactor`).
 */
export const boardPrefs = Object.create(null)
for (const key of Object.keys(BOARD_PREFERENCE_DEFAULTS)) {
	Object.defineProperty(boardPrefs, key, { enumerable: true, get: () => read(key) })
}

const confirmEffective = computed(() => {
	if ('confirmMoves' in overrides && overrides.confirmMoves !== null) {
		return overrides.confirmMoves
	}
	const eff = service?.preferences?.effective?.confirmMoves
	if (eff && !('confirmMoves' in overrides)) {
		return eff
	}
	const v = read('confirmMoves')
	return v ?? (coarsePointer.value ? 'rolled' : 'never')
})

const speedEffective = computed(() => {
	if ('animationSpeed' in overrides && overrides.animationSpeed !== null) {
		return overrides.animationSpeed
	}
	const eff = service?.preferences?.effective?.animationSpeed
	if (eff && !('animationSpeed' in overrides)) {
		return eff
	}
	const v = read('animationSpeed')
	return v ?? (reducedMotion.value ? 'off' : 'normal')
})

Object.defineProperty(boardPrefs, 'confirmMovesEffective', { enumerable: true, get: () => confirmEffective.value })
Object.defineProperty(boardPrefs, 'animationSpeedEffective', { enumerable: true, get: () => speedEffective.value })
Object.defineProperty(boardPrefs, 'speedFactor', { enumerable: true, get: () => SPEED_FACTORS[speedEffective.value] ?? 1 })
Object.freeze(boardPrefs)

/**
 * Whether the preferences service of frontend-app is bundled.
 *
 * @return {boolean}
 */
export function hasPreferenceService() {
	return service !== null && typeof service.preferences === 'object'
}

/**
 * Change a preference: through the service (saved) when it exists, otherwise locally.
 *
 * @param {string} key preference key
 * @param {any} value new value
 */
export function setBoardPreference(key, value) {
	if (key in overrides) {
		overrides[key] = value
		return
	}
	if (typeof service?.setPreference === 'function') {
		service.setPreference(key, value)
	} else {
		local[key] = value
	}
}

/**
 * Layer non-persistent values over the preferences (dev playground, tests). `null` values of `confirmMoves` and
 * `animationSpeed` mean "resolve automatically".
 *
 * @param {object} patch key → value
 */
export function overrideBoardPreferences(patch) {
	Object.assign(overrides, patch)
}

/** Drop every override. */
export function clearBoardPreferenceOverrides() {
	for (const key of Object.keys(overrides)) {
		delete overrides[key]
	}
}

/**
 * Remember that a first-time tip was seen (GAME-DESIGN §10).
 *
 * @param {string} id tip id (ghost | rolled-target | link | king-ring | budget)
 */
export function markTipSeen(id) {
	if ('seenTips' in overrides) {
		overrides.seenTips = [...overrides.seenTips, id]
		return
	}
	if (typeof service?.markTipSeen === 'function') {
		service.markTipSeen(id)
	} else if (!local.seenTips.includes(id)) {
		local.seenTips.push(id)
	}
}
