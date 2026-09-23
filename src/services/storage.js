/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * `localStorage` wrappers that never throw (SPEC §14.3.2): quota errors, privacy modes and disabled storage are
 * swallowed, and a broken value reads as the fallback.
 */

/**
 * The storage object, or null when it is unavailable.
 *
 * @return {Storage|null}
 */
function store() {
	try {
		return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
	} catch {
		return null
	}
}

/**
 * Read a JSON value.
 *
 * @param {string} key storage key
 * @param {any} fallback value when missing or unreadable
 * @return {any}
 */
export function readJson(key, fallback) {
	try {
		const raw = store()?.getItem(key)
		return raw === null || raw === undefined ? fallback : JSON.parse(raw)
	} catch {
		return fallback
	}
}

/**
 * Write a JSON value.
 *
 * @param {string} key storage key
 * @param {any} value JSON-serialisable value
 * @return {boolean} whether it was stored
 */
export function writeJson(key, value) {
	try {
		const s = store()
		if (s === null) {
			return false
		}
		s.setItem(key, JSON.stringify(value))
		return true
	} catch {
		return false
	}
}

/**
 * Remove a key.
 *
 * @param {string} key storage key
 */
export function removeKey(key) {
	try {
		store()?.removeItem(key)
	} catch {
		// ignore
	}
}
