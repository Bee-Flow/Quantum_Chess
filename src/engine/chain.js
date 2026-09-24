/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Game record integrity chain (§9.4) and the local roll memo identity (§9.3).
 *
 * PHP twin: the chain functions of lib/Engine/Engine.php (`chainStart`, `chainNext`, `rollIdentity`). Section numbers
 * (§) refer to docs/engine-rules.md.
 */

import { positionHash } from './hash.js'
import { stripPromo } from './parser.js'
import { sha256hex } from './sha256.js'
import { serializeState } from './state.js'

/** @typedef {import('./types.js').EngineState} EngineState */

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
 * chain_0 = sha256hex("qchess-chain|v1|" + gameId + "|" + whiteUid + "|" + blackUid + "|" + createdAt).
 *
 * @param {number} gameId game id
 * @param {string} whiteUid White's user id (verbatim)
 * @param {string} blackUid Black's user id (verbatim)
 * @param {number} createdAt creation time in Unix seconds
 * @return {string}
 */
export function chainStart(gameId, whiteUid, blackUid, createdAt) {
	return sha256hex('qchess-chain|v1|' + decimal(gameId, 'gameId') + '|' + String(whiteUid) + '|' + String(blackUid)
		+ '|' + decimal(createdAt, 'createdAt'))
}

/**
 * chain_n = sha256hex(chain_{n-1} + "|" + ply + "|" + code + "|" + (u ?? "-") + "|" + (key ?? "-") + "|"
 * + sha256hex(canonicalStateJsonAfter)).
 *
 * @param {string} previous chain_{n-1}
 * @param {number} ply state.ply before the move
 * @param {string} code canonical code
 * @param {number|null} u recorded u, or null when the move was not rolled (or forced)
 * @param {string|null} key measurement key, or null without a record
 * @param {EngineState|string} stateAfter state after the move, or its canonical JSON
 * @return {string}
 */
export function chainNext(previous, ply, code, u, key, stateAfter) {
	const json = typeof stateAfter === 'string' ? stateAfter : serializeState(stateAfter)
	return sha256hex(previous + '|' + decimal(ply, 'ply') + '|' + code + '|'
		+ (u === null || u === undefined ? '-' : decimal(u, 'u')) + '|'
		+ (key === null || key === undefined ? '-' : key) + '|' + sha256hex(json))
}

/**
 * Roll memo identity (§9.3): decimal(ply) + "/" + positionHash(stateBefore) + "/" + stripPromo(code).
 *
 * @param {EngineState} stateBefore state before the move
 * @param {string} code canonical code
 * @return {string}
 */
export function rollIdentity(stateBefore, code) {
	return String(stateBefore.ply) + '/' + positionHash(stateBefore) + '/' + stripPromo(code)
}
