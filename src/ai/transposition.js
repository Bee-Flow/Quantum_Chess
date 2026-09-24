/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The transposition table of the search: a Map from position hash to `{depth, value, flag, move}`. The Map may be
 * shared between the searches of one game (`options.tt`), so it holds no other state.
 */

/** The stored value is exact. */
export const EXACT = 0
/** The stored value is a lower bound (the node failed high). */
export const LOWER = 1
/** The stored value is an upper bound (the node failed low). */
export const UPPER = 2

/** Maximum number of entries; the oldest quarter is dropped when the table is full. */
const TT_MAX = 200000

/**
 * @typedef {object} TtEntry
 * @property {number} depth remaining depth of the search that stored it (negative in quiescence)
 * @property {number} value value for the side to move
 * @property {number} flag EXACT, LOWER or UPPER
 * @property {string|null} move best move code, if known
 */

/**
 * Store an entry (keeps the deeper entry; trims the oldest quarter when full).
 *
 * @param {Map<string, TtEntry>} tt table
 * @param {string} hash position hash
 * @param {number} depth depth
 * @param {number} value value
 * @param {number} flag EXACT, LOWER or UPPER
 * @param {string|null} move best move code
 */
export function storeEntry(tt, hash, depth, value, flag, move) {
	const old = tt.get(hash)
	if (old !== undefined && old.depth > depth) {
		return
	}
	if (old === undefined && tt.size >= TT_MAX) {
		let n = TT_MAX >> 2
		for (const k of tt.keys()) {
			tt.delete(k)
			if (--n <= 0) {
				break
			}
		}
	}
	tt.set(hash, { depth, value, flag, move: move ?? (old ? old.move : null) })
}
