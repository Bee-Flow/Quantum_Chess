/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The hash chain of online variant games (docs/development/online-variants.md section 3.3). It is separate from the
 * chain of classic games (src/engine/chain.js), whose start names exactly two players:
 *
 *   chain_0 = sha256hex("qchess-vchain|v1|" + id + "|" + variant + "|" + canonicalOptions + "|" + uid_0 + "|" + …
 *             + "|" + uid_(n-1) + "|" + createdAt)
 *   chain_n = sha256hex(chain_(n-1) + "|" + ply + "|" + seat + "|" + code + "|" + u)
 *
 * A seat without a player adds an empty user id. PHP twin: lib/Service/Game/VariantChain.php; both are checked against
 * tests/fixtures/online-variants.json.
 */

import { sha256hex } from '../engine/index.js'

/**
 * Check a non-negative integer that is printed as plain decimal.
 *
 * @param {unknown} x value
 * @param {string} name field name
 * @return {string}
 */
function decimal(x, name) {
	if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < 0) {
		throw new TypeError(name + ' must be a non-negative integer')
	}
	return String(x)
}

/**
 * The options of a game as canonical JSON: an object with its keys in code-unit order and strings, safe integers and
 * booleans as values.
 *
 * @param {Record<string, string|number|boolean>} options option values
 * @return {string}
 */
export function canonicalOptions(options) {
	const keys = Object.keys(options ?? {}).sort()
	const parts = keys.map((key) => {
		const value = options[key]
		const ok = typeof value === 'string' || typeof value === 'boolean' || Number.isSafeInteger(value)
		if (!ok) {
			throw new TypeError('option ' + key + ' must be a string, a safe integer or a boolean')
		}
		return JSON.stringify(key) + ':' + JSON.stringify(value)
	})
	return '{' + parts.join(',') + '}'
}

/**
 * chain_0 of a variant game.
 *
 * @param {number} gameId game id
 * @param {string} variant variant id
 * @param {Record<string, string|number|boolean>} options option values
 * @param {Array<string|null>} seatUids the user id of every seat, in seat order (null for a seat without a player)
 * @param {number} createdAt creation time in Unix seconds
 * @return {string}
 */
export function vchainStart(gameId, variant, options, seatUids, createdAt) {
	const head = ['qchess-vchain', 'v1', decimal(gameId, 'gameId'), String(variant), canonicalOptions(options)]
	const seats = seatUids.map((uid) => uid ?? '')
	return sha256hex([...head, ...seats, decimal(createdAt, 'createdAt')].join('|'))
}

/**
 * chain_n of a variant game.
 *
 * @param {string} previous chain_(n-1)
 * @param {number} ply plies played before the move
 * @param {number} seat seat that played it
 * @param {string} code move code
 * @param {number} u the roll the server drew
 * @return {string}
 */
export function vchainNext(previous, ply, seat, code, u) {
	return sha256hex([previous, decimal(ply, 'ply'), decimal(seat, 'seat'), String(code), decimal(u, 'u')].join('|'))
}
