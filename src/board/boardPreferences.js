/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The display preferences as the board reads them: a read-only view over the user's preferences
 * (`services/preferences.js`) with the automatic values resolved. Tests can layer temporary values on top with
 * `overrideBoardPreferences()`; those are never saved.
 */

import { computed, reactive } from 'vue'
import { preferences, resolveAnimationSpeed, resolveConfirmMoves } from '../services/preferences.js'

/** The preference keys the board reads. */
const BOARD_KEYS = Object.freeze([
	'boardTheme',
	'pieceSet',
	'coordinates',
	'highlightLastMove',
	'showLegalMoves',
	'showPercentages',
	'probabilityFormat',
	'ghostStyle',
	'linkThreads',
	'kingDangerBoth',
	'showPossibilities',
	'physicsNames',
	'inputMode',
	'confirmMoves',
	'safetyNet',
	'autoQueen',
	'animationSpeed',
	'sound',
	'volume',
	'moveChime',
	'seenTips',
])

/** Duration factor of the board animations per animation speed; `off` skips them. */
export const SPEED_FACTORS = Object.freeze({ slow: 1.5, normal: 1, fast: 0.5, off: 0 })

const overrides = reactive({})

/**
 * The current value of a preference: the test override, else the user's preference.
 *
 * @param {string} key preference key
 * @return {unknown}
 */
function read(key) {
	return key in overrides ? overrides[key] : preferences[key]
}

/**
 * Reactive, read-only view of the board preferences plus the resolved values: `confirmMovesEffective`,
 * `animationSpeedEffective` and `speedFactor`.
 */
export const boardPrefs = Object.create(null)
for (const key of BOARD_KEYS) {
	Object.defineProperty(boardPrefs, key, { enumerable: true, get: () => read(key) })
}

// An override of `null` means "resolve automatically", exactly like the stored `null`.
const confirmEffective = computed(() => resolveConfirmMoves(read('confirmMoves')))
const speedEffective = computed(() => resolveAnimationSpeed(read('animationSpeed')))

Object.defineProperty(boardPrefs, 'confirmMovesEffective', { enumerable: true, get: () => confirmEffective.value })
Object.defineProperty(boardPrefs, 'animationSpeedEffective', { enumerable: true, get: () => speedEffective.value })
Object.defineProperty(boardPrefs, 'speedFactor', {
	enumerable: true,
	get: () => SPEED_FACTORS[speedEffective.value] ?? 1,
})
Object.freeze(boardPrefs)

/**
 * Layer temporary values over the preferences (tests). They are never saved. `null` for `confirmMoves` or
 * `animationSpeed` means "resolve automatically".
 *
 * @param {object} patch preference key → value
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
