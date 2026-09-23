/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * `localStorage` wrappers that never throw (SPEC §14.3.2): quota errors, privacy modes and disabled storage are
 * swallowed, and a broken value reads as the fallback.
 *
 * Every key belongs to the logged-in user: `quantumchess.trainer.v1` is stored as `quantumchess/<uid>/trainer.v1`
 * (a user id never contains `/`). The browser storage outlives a session that simply expires, so without the user
 * id the next account on the same browser would see, and sync, the previous account's data.
 */

const PREFIX = 'quantumchess.'

/**
 * The logged-in user's id: the `data-user` attribute Nextcloud puts on `<head>` (what `@nextcloud/auth` reads; that
 * module is not imported here because it touches `window` at import time, and this file also runs without a DOM).
 *
 * @return {string|null}
 */
function currentUid() {
	try {
		return globalThis.document?.head?.getAttribute('data-user') || globalThis.OC?.getCurrentUser?.()?.uid || null
	} catch {
		return null
	}
}

/**
 * The storage key of a logical key for the logged-in user (unchanged when no user is known, as in unit tests).
 *
 * @param {string} key logical key, starting with `quantumchess.`
 * @return {string}
 */
export function userKey(key) {
	const uid = currentUid()
	if (!uid || !key.startsWith(PREFIX)) {
		return key
	}
	return `quantumchess/${uid}/${key.slice(PREFIX.length)}`
}

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
		const raw = store()?.getItem(userKey(key))
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
		s.setItem(userKey(key), JSON.stringify(value))
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
		store()?.removeItem(userKey(key))
	} catch {
		// ignore
	}
}
