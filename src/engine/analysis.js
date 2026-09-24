/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Per-state derived data (§3.1, §3.3), cached in a WeakMap keyed by the state object.
 *
 * States are immutable by contract, so the cache never goes stale. Everything here assumes a valid state
 * (validateState); untrusted input must be validated first.
 *
 * PHP twin: lib/Engine/Internal/Analysis.php. Section numbers (§) refer to docs/engine-rules.md.
 */

import { InvalidStateError } from './errors.js'
import { TYPE_CODE } from './geometry.js'
import { idOfCode, letterCodeOf } from './squares.js'

const CACHE = new WeakMap()

/**
 * @typedef {object} Analysis
 * @property {import('./types.js').EngineState} state the analysed state
 * @property {number} n number of worlds
 * @property {string[]} boards boards in canonical order
 * @property {number[]} weights weights in canonical order
 * @property {Int8Array} occ occupant id per square, -1 for none (§3.1 occ)
 * @property {Float64Array} occW W(occ(s)@s) per square, 0 for none
 * @property {number[][]} locs loc(X) per id, ascending
 * @property {number[][]} locW W(X@s) per id, parallel to locs
 * @property {Int8Array} typeCodes type code per id
 * @property {number} ci colour index of the side to move (0 White, 1 Black)
 * @property {number} ep en-passant square index or -1
 * @property {Array<Int8Array|undefined>} pos cache of `positions()` per id
 * @property {Array<{count: number, cls: Int32Array}|null>} proj cache of `projection()` per colour index
 * @property {Array<{count: number, cls: Int32Array}|undefined>} rest cache of `restClasses()` per id
 * @property {import('./moveRecord.js').MoveRecord[]|null} moves every legal record in canonical order, once generated
 * @property {Map<string, import('./moveRecord.js').MoveRecord>|null} recs legal records by canonical code, as resolved
 * @property {number[]} danger cached kingDanger per colour index, -1 when unknown
 * @property {{trapped: boolean, anyLegal: boolean}|null} trapped cached E1b information
 */

/**
 * Get (or build) the analysis of a state.
 *
 * @param {import('./types.js').EngineState} state valid engine state
 * @return {Analysis}
 */
export function analyze(state) {
	let a = CACHE.get(state)
	if (a === undefined) {
		if (state === null || typeof state !== 'object' || !Array.isArray(state.worlds) || state.worlds.length === 0
			|| typeof state.types !== 'string' || state.types.length !== 32 || (state.turn !== 'w' && state.turn !== 'b')) {
			throw new InvalidStateError('shape', 'not an engine state (check untrusted input with validateState first)')
		}
		a = build(state)
		CACHE.set(state, a)
	}
	return a
}

/**
 * Build the analysis.
 *
 * @param {import('./types.js').EngineState} state valid engine state
 * @return {Analysis}
 */
function build(state) {
	const worlds = state.worlds
	const n = worlds.length
	const boards = new Array(n)
	const weights = new Array(n)
	const occ = new Int8Array(64).fill(-1)
	const occW = new Float64Array(64)
	for (let i = 0; i < n; i++) {
		const b = worlds[i][0]
		const w = worlds[i][1]
		boards[i] = b
		weights[i] = w
		for (let s = 0; s < 64; s++) {
			const c = b.charCodeAt(s)
			if (c !== 46) {
				occW[s] += w
				if (occ[s] < 0) {
					occ[s] = idOfCode(c)
				}
			}
		}
	}
	const locs = new Array(32)
	const locW = new Array(32)
	for (let id = 0; id < 32; id++) {
		locs[id] = []
		locW[id] = []
	}
	for (let s = 0; s < 64; s++) {
		const id = occ[s]
		if (id >= 0) {
			locs[id].push(s)
			locW[id].push(occW[s])
		}
	}
	const typeCodes = new Int8Array(32)
	for (let id = 0; id < 32; id++) {
		typeCodes[id] = TYPE_CODE[state.types[id]]
	}
	let ep = -1
	if (state.ep !== '-') {
		ep = (state.ep.charCodeAt(1) - 49) * 8 + (state.ep.charCodeAt(0) - 97)
	}
	return {
		state,
		n,
		boards,
		weights,
		occ,
		occW,
		locs,
		locW,
		typeCodes,
		ci: state.turn === 'w' ? 0 : 1,
		ep,
		// lazily filled
		pos: new Array(32),
		proj: [null, null],
		rest: new Array(32),
		moves: null,
		recs: null,
		danger: [-1, -1],
		trapped: null,
	}
}

/**
 * X's square in every world (Int8Array of length n). Cached.
 *
 * @param {Analysis} a analysis
 * @param {number} id piece id (live)
 * @return {Int8Array}
 */
export function positions(a, id) {
	let p = a.pos[id]
	if (p !== undefined) {
		return p
	}
	p = new Int8Array(a.n).fill(-1)
	const loc = a.locs[id]
	if (loc.length === 1) {
		p.fill(loc[0])
	} else if (loc.length > 1) {
		const code = letterCodeOf(id)
		for (let i = 0; i < a.n; i++) {
			const b = a.boards[i]
			for (let j = 0; j < loc.length; j++) {
				if (b.charCodeAt(loc[j]) === code) {
					p[i] = loc[j]
					break
				}
			}
		}
	}
	a.pos[id] = p
	return p
}

/**
 * Class the worlds by the squares of a set of pieces. Returns the class count and a class per world.
 *
 * @param {Analysis} a analysis
 * @param {number[]} ids superposed piece ids
 * @return {{count: number, cls: Int32Array}}
 */
function classify(a, ids) {
	const cls = new Int32Array(a.n)
	if (ids.length === 0) {
		return { count: 1, cls }
	}
	const ps = ids.map((id) => positions(a, id))
	const map = new Map()
	for (let i = 0; i < a.n; i++) {
		let key = ''
		for (let j = 0; j < ps.length; j++) {
			key += String.fromCharCode(48 + ps[j][i])
		}
		let c = map.get(key)
		if (c === undefined) {
			c = map.size
			map.set(key, c)
		}
		cls[i] = c
	}
	return { count: map.size, cls }
}

/**
 * Superposed live pieces of a colour, ascending id.
 *
 * @param {Analysis} a analysis
 * @param {number} ci colour index
 * @return {number[]}
 */
export function superposedIds(a, ci) {
	const out = []
	const base = ci * 16
	for (let id = base; id < base + 16; id++) {
		if (a.locs[id].length > 1) {
			out.push(id)
		}
	}
	return out
}

/**
 * Own-projection classes of colour ci (§3.3): B(c) = count. Cached.
 *
 * @param {Analysis} a analysis
 * @param {number} ci colour index
 * @return {{count: number, cls: Int32Array}}
 */
export function projection(a, ci) {
	let p = a.proj[ci]
	if (p === null) {
		p = classify(a, superposedIds(a, ci))
		a.proj[ci] = p
	}
	return p
}

/**
 * Projection classes of X's colour **without X** ("rest classes"), used to count B after a move of X only.
 * Cached per id.
 *
 * @param {Analysis} a analysis
 * @param {number} id piece id
 * @return {{count: number, cls: Int32Array}}
 */
export function restClasses(a, id) {
	let r = a.rest[id]
	if (r === undefined) {
		r = classify(a, superposedIds(a, id < 16 ? 0 : 1).filter((x) => x !== id))
		a.rest[id] = r
	}
	return r
}

/**
 * B(c) for colour 'w' or 'b' (§3.3).
 *
 * @param {import('./types.js').EngineState} state valid engine state
 * @param {'w'|'b'} color colour
 * @return {number}
 */
export function budget(state, color) {
	return projection(analyze(state), color === 'w' ? 0 : 1).count
}

/**
 * Number of worlds (§8).
 *
 * @param {import('./types.js').EngineState} state valid engine state
 * @return {number}
 */
export function worldCount(state) {
	return state.worlds.length
}
