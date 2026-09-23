/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * memoByHash (SPEC §3.3): memoise a display computation per position hash (ER §5.4), so that equal positions reached
 * through different state objects (a poll result, a replay, a history preview) share one result.
 */

import { positionHash } from '../index.js'

/**
 * A stable text key of the extra arguments.
 *
 * @param {Array} args arguments after the state
 * @return {string}
 */
function argsKey(args) {
	return args.map((a) => {
		if (a === null || a === undefined || typeof a !== 'object') {
			return String(a)
		}
		if (typeof a.code === 'string') {
			return a.code
		}
		return JSON.stringify(a)
	}).join('\u0001')
}

/**
 * Memoise `fn(state, ...args)` per `positionHash(state)` and arguments, least-recently used first out.
 *
 * Move objects are keyed by their `code`. The position hash covers the side to move, castling, en passant, types and
 * worlds, but not the ply or the result; do not use it for functions that depend on those.
 *
 * @template R
 * @param {(state: object, ...args: any[]) => R} fn the function to memoise
 * @param {object} [options] options
 * @param {number} [options.size] maximum number of cached results (default 64)
 * @return {((state: object, ...args: any[]) => R) & {clear: () => void, size: () => number}}
 */
export function memoByHash(fn, { size = 64 } = {}) {
	const cache = new Map()
	const hashes = new WeakMap()
	const hashOf = (state) => {
		let h = hashes.get(state)
		if (h === undefined) {
			h = positionHash(state)
			hashes.set(state, h)
		}
		return h
	}
	const memo = (state, ...args) => {
		const key = hashOf(state) + '\u0000' + argsKey(args)
		if (cache.has(key)) {
			const value = cache.get(key)
			cache.delete(key)
			cache.set(key, value)
			return value
		}
		const value = fn(state, ...args)
		cache.set(key, value)
		if (cache.size > size) {
			cache.delete(cache.keys().next().value)
		}
		return value
	}
	memo.clear = () => cache.clear()
	memo.size = () => cache.size
	return memo
}
