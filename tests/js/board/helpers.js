/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import * as E from '../../../src/engine/index.js'

export { E }

export const T = E.T

/**
 * Setup shortcut (ENGINE-RULES Appendix A).
 *
 * @param {string} fen FEN
 * @param {string[]} [prelude] prelude codes
 * @return {object}
 */
export function S(fen, prelude = []) {
	return E.setupPosition({ fen, prelude })
}

/**
 * Apply moves (rolled ones need `code@key`).
 *
 * @param {object} state state
 * @param {...string} codes codes, optionally with @key
 * @return {object}
 */
export function play(state, ...codes) {
	let s = state
	for (const c of codes) {
		const [code, key] = c.split('@')
		s = E.applyMove(s, code, key ? { outcome: key } : {}).state
	}
	return s
}

/**
 * Square index from a name.
 *
 * @param {string} name square name
 * @return {number}
 */
export function sq(name) {
	return E.squareIndex(name)
}
