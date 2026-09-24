/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Random identifiers from `crypto.getRandomValues`. `crypto.randomUUID` is not used: browsers offer it only in secure
 * contexts, and some Nextcloud instances are served over plain HTTP.
 */

/**
 * Random bytes.
 *
 * @param {number} n count
 * @return {Uint8Array}
 */
function randomBytes(n) {
	const bytes = new Uint8Array(n)
	globalThis.crypto.getRandomValues(bytes)
	return bytes
}

/**
 * A version 4 UUID.
 *
 * @return {string}
 */
export function uuid() {
	const b = randomBytes(16)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * A local game id: `lg_<base36 time><8 random base36 characters>`.
 *
 * @return {string}
 */
export function localGameId() {
	const r = Array.from(randomBytes(8), (x) => (x % 36).toString(36)).join('')
	return 'lg_' + Date.now().toString(36) + r
}
