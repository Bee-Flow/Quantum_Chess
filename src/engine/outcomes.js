/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Per-world move functions (§4.3, §4.6–§4.9, pipeline step A2 and the filter of A3).
 *
 * PHP twin: lib/Engine/Internal/Worlds.php. Section numbers (§) refer to docs/engine-rules.md.
 */

import { T } from './constants.js'
import { CAPTURE, MISS, MOVE } from './moveRecord.js'
import { mergeSourceIn, standardKeyIn } from './moveRules.js'
import { letterOf, SQUARE_NAMES } from './squares.js'

/** @typedef {import('./types.js').Analysis} Analysis */
/** @typedef {import('./moveRecord.js').MoveRecord} MoveRecord */

const KEY_CODE = { miss: MISS, move: MOVE, capture: CAPTURE }

/**
 * Board with the piece letter `ch` moved from f to t (whatever was on t is overwritten).
 *
 * @param {string} b board
 * @param {number} f from
 * @param {number} t to
 * @param {string} ch letter
 * @return {string}
 */
function moveOnBoard(b, f, t, ch) {
	if (f < t) {
		return b.slice(0, f) + '.' + b.slice(f + 1, t) + ch + b.slice(t + 1)
	}
	return b.slice(0, t) + ch + b.slice(t + 1, f) + '.' + b.slice(f + 1)
}

/**
 * Board with square s emptied.
 *
 * @param {string} b board
 * @param {number} s square
 * @return {string}
 */
function clearOnBoard(b, s) {
	return b.slice(0, s) + '.' + b.slice(s + 1)
}

/**
 * The outcome keys of a record, as they appear in getOutcomes: the outcome keys for a rolled move, otherwise the
 * single pseudo-key (`certain`/`quantum`) that stands for "no filter".
 *
 * @param {MoveRecord} rec record
 * @return {string[]}
 */
export function recordKeys(rec) {
	if (rec.resolution === 'rolled') {
		return rec.outcomes.map((o) => o.key)
	}
	return [rec.resolution]
}

/**
 * Does this outcome of the record capture a piece? (A rolled `capture`, or the single outcome of a certain capture.)
 *
 * @param {MoveRecord} rec record
 * @param {string} key outcome key from recordKeys
 * @return {boolean}
 */
export function outcomeCaptures(rec, key) {
	if (key === 'capture') {
		return true
	}
	return key === 'certain' && rec.outcomes.length === 1 && rec.outcomes[0].key === 'capture'
}

/**
 * Apply the per-world function of a record to every world and keep only the worlds of one outcome key (A2, A3).
 * The result is not canonical yet (unsorted, possibly with duplicates, sum ≤ T).
 *
 * @param {Analysis} a analysis of the state before the move
 * @param {MoveRecord} rec legal record
 * @param {string} key outcome key to keep (`certain`/`quantum` keep everything)
 * @return {{boards: string[], weights: number[], total: number}}
 */
export function recordOutcomeBoards(a, rec, key) {
	const boards = []
	const weights = []
	let total = 0
	const ch = letterOf(rec.X)
	const n = a.n
	if (rec.kind === 'standard' && rec.castle !== null) {
		const c = rec.castle
		const rookCh = letterOf(c.rook)
		for (let i = 0; i < n; i++) {
			boards.push(moveOnBoard(moveOnBoard(a.boards[i], c.from, c.to, ch), c.rookFrom, c.rookTo, rookCh))
			weights.push(a.weights[i])
		}
		return { boards, weights, total: T }
	}
	const filter = rec.resolution === 'rolled' && rec.kind !== 'measure' ? KEY_CODE[key] : -1
	switch (rec.kind) {
		case 'standard': {
			const epSquare = rec.ep ? (rec.ci === 0 ? rec.t - 8 : rec.t + 8) : -1
			for (let i = 0; i < n; i++) {
				const b = a.boards[i]
				const k = standardKeyIn(rec, b)
				if (filter >= 0 && k !== filter) {
					continue
				}
				let nb = b
				if (k !== MISS) {
					nb = moveOnBoard(b, rec.f, rec.t, ch)
					if (epSquare >= 0) {
						nb = clearOnBoard(nb, epSquare)
					}
				}
				boards.push(nb)
				weights.push(a.weights[i])
				total += a.weights[i]
			}
			break
		}
		case 'merge': {
			for (let i = 0; i < n; i++) {
				const b = a.boards[i]
				const src = mergeSourceIn(rec, b)
				let k = MISS
				if (src !== 0) {
					const c = b.charCodeAt(rec.t)
					k = c === 46 ? MOVE : CAPTURE
				}
				if (filter >= 0 && k !== filter) {
					continue
				}
				boards.push(src === 0 ? b : moveOnBoard(b, src === 1 ? rec.f : rec.f2, rec.t, ch))
				weights.push(a.weights[i])
				total += a.weights[i]
			}
			break
		}
		case 'split': {
			let j = 0
			for (let i = 0; i < n; i++) {
				const b = a.boards[i]
				const w = a.weights[i]
				if (j < rec.onF.length && rec.onF[j] === i) {
					const c1 = rec.flags1[j] === 1
					const c2 = rec.flags2[j] === 1
					j++
					// child 1 gets ceil(w/2) and goes to t1 (the lower index), child 2 gets floor(w/2) (§4.7)
					boards.push(c1 ? moveOnBoard(b, rec.f, rec.t, ch) : b)
					weights.push(w - (w >> 1))
					if (w >= 2) {
						boards.push(c2 ? moveOnBoard(b, rec.f, rec.t2, ch) : b)
						weights.push(w >> 1)
					}
				} else {
					boards.push(b)
					weights.push(w)
				}
				total += w
			}
			break
		}
		default: {
		// measure: keep the worlds with X on the named square
			const s = SQUARE_NAMES.indexOf(key)
			const code = ch.charCodeAt(0)
			for (let i = 0; i < n; i++) {
				const b = a.boards[i]
				if (b.charCodeAt(s) !== code) {
					continue
				}
				boards.push(b)
				weights.push(a.weights[i])
				total += a.weights[i]
			}
		}
	}
	return { boards, weights, total }
}

/**
 * Sort worlds by board and merge identical boards (A4, A5).
 *
 * @param {string[]} boards boards
 * @param {number[]} weights weights
 * @return {Array<[string, number]>}
 */
export function canonicalWorlds(boards, weights) {
	const n = boards.length
	if (n === 1) {
		return [[boards[0], weights[0]]]
	}
	const idx = new Array(n)
	for (let i = 0; i < n; i++) {
		idx[i] = i
	}
	idx.sort((x, y) => {
		const bx = boards[x]
		const by = boards[y]
		return bx < by ? -1 : (bx > by ? 1 : 0)
	})
	const out = []
	let prev = null
	for (let k = 0; k < n; k++) {
		const i = idx[k]
		if (prev !== null && prev[0] === boards[i]) {
			prev[1] += weights[i]
		} else {
			prev = [boards[i], weights[i]]
			out.push(prev)
		}
	}
	return out
}
