/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Haptic feedback on touch devices (GAME-DESIGN §3.10, SPEC §14.3.2), when the Vibration setting is on.
 */

/** Vibration patterns in ms. */
export const HAPTIC_PATTERNS = Object.freeze({
	select: 8,
	captured: 15,
	moved: [10, 40, 10],
	missed: [10, 40, 10],
	kingCapture: [20, 60, 20, 60, 40],
	longPress: 10,
})

const config = { enabled: true }

/**
 * Configure haptics (from the preferences).
 *
 * @param {object} options options
 * @param {boolean} [options.enabled] vibration on or off
 */
export function configureHaptics({ enabled } = {}) {
	if (typeof enabled === 'boolean') {
		config.enabled = enabled
	}
}

/**
 * Whether this device vibrates for touch input.
 *
 * @return {boolean}
 */
function supported() {
	return typeof navigator !== 'undefined'
		&& typeof navigator.vibrate === 'function'
		&& typeof window !== 'undefined'
		&& typeof window.matchMedia === 'function'
		&& window.matchMedia('(pointer: coarse)').matches
}

/**
 * Vibrate once with a named pattern.
 *
 * @param {string} name select | captured | moved | missed | kingCapture | longPress
 * @return {boolean} whether a vibration was requested
 */
export function vibrate(name) {
	const pattern = HAPTIC_PATTERNS[name]
	if (!config.enabled || pattern === undefined || !supported()) {
		return false
	}
	try {
		return navigator.vibrate(pattern)
	} catch {
		return false
	}
}
