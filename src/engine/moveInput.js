/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Resolving a move input (a code string, a move object or a LegalMove) against a state: the full check pipeline of
 * §4.11, which `findMove`, `whyIllegal`, `applyMove` and every other function that takes a move share.
 *
 * PHP twin: lib/Engine/Internal/MoveInput.php. Section numbers (§) refer to docs/engine-rules.md.
 */

import { TYPE_B, TYPE_K, TYPE_N, TYPE_P, TYPE_Q, TYPE_R } from './geometry.js'
import { PROMOS } from './moveRecord.js'
import { evalStandard } from './moveRules.js'
import { parseMoveCode } from './parser.js'
import { evalMeasure, evalMerge, evalSplit } from './quantumMoves.js'
import { SQUARE_NAMES } from './squares.js'

/** @typedef {import('./analysis.js').Analysis} Analysis */
/** @typedef {import('./moveRecord.js').MoveRecord} MoveRecord */

/** Piece letter of a code → type code (a letter only has to match for these pieces). */
const LETTER_TYPE = Object.freeze({ K: TYPE_K, Q: TYPE_Q, R: TYPE_R, B: TYPE_B, N: TYPE_N })

/**
 * Normalise a move object (§4.11 check 2). Returns a clean move `{type, from, to, promo}` (promo null when absent)
 * or null when malformed. Split targets and merge sources are sorted by index.
 *
 * @param {unknown} input move object
 * @return {{type: string, from: number[], to: number[], promo: string|null}|null}
 */
function normalizeMoveObject(input) {
	if (input === null || typeof input !== 'object' || Array.isArray(input)) {
		return null
	}
	const type = input.type
	const from = input.from
	const to = input.to
	const promoIn = input.promo
	let nf
	let nt
	switch (type) {
		case 'standard':
			nf = 1
			nt = 1
			break
		case 'split':
			nf = 1
			nt = 2
			break
		case 'merge':
			nf = 2
			nt = 1
			break
		case 'measure':
			nf = 1
			nt = 0
			break
		default:
			return null
	}
	if (!Array.isArray(from) || !Array.isArray(to) || from.length !== nf || to.length !== nt) {
		return null
	}
	const f = []
	const t = []
	for (let i = 0; i < nf; i++) {
		const s = from[i]
		if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 63) {
			return null
		}
		f.push(s)
	}
	for (let i = 0; i < nt; i++) {
		const s = to[i]
		if (typeof s !== 'number' || !Number.isInteger(s) || s < 0 || s > 63) {
			return null
		}
		t.push(s)
	}
	let promo = null
	if (promoIn !== undefined && promoIn !== null) {
		if (type !== 'standard' || !PROMOS.includes(promoIn)) {
			return null
		}
		promo = promoIn
	}
	if (type === 'split') {
		if (t[0] === t[1]) {
			return null
		}
		t.sort((x, y) => x - y)
	}
	if (type === 'merge') {
		if (f[0] === f[1]) {
			return null
		}
		f.sort((x, y) => x - y)
	}
	return { type, from: f, to: t, promo }
}

/**
 * Resolve a move input against a state: the full §4.11 pipeline.
 *
 * Returns `{rec}` for a legal move (with the Measure `from` normalised) or `{reason}`.
 *
 * @param {Analysis} a analysis
 * @param {unknown} input move object, LegalMove or code string
 * @return {{rec: MoveRecord}|{reason: string}}
 */
export function resolveMove(a, input) {
	const state = a.state
	let obj = input
	let letter = null
	if (typeof input === 'string') {
		// An unparsable string is malformed before anything else; the parsed move then runs checks 1–21.
		const p = parseMoveCode(input)
		if (p === null) {
			return { reason: 'malformed' }
		}
		if (p.castle !== undefined) {
			const home = state.turn === 'w' ? 4 : 60
			obj = { type: 'standard', from: [home], to: [p.castle === 'O-O' ? home + 2 : home - 2] }
		} else {
			obj = { type: p.type, from: p.from, to: p.to, promo: p.promo }
			letter = p.letter === undefined ? null : p.letter
		}
	}
	if (state.result !== null) {
		return { reason: 'game_over' }
	}
	let mv
	try {
		mv = normalizeMoveObject(obj)
	} catch {
		mv = null
	}
	if (mv === null) {
		return { reason: 'malformed' }
	}
	const f0 = mv.from[0]
	const X = a.occ[f0]
	if (X < 0) {
		return { reason: 'no_piece' }
	}
	if ((X < 16) !== (a.ci === 0)) {
		return { reason: 'not_your_piece' }
	}
	if (letter !== null && LETTER_TYPE[letter] !== a.typeCodes[X]) {
		return { reason: 'piece_mismatch' }
	}
	const code = codeOfNormalized(a, mv, X)
	if (a.recs !== null) {
		const cached = a.recs.get(code)
		if (cached !== undefined) {
			return { rec: cached }
		}
	}
	const r = checkMove(a, mv, X)
	if (typeof r === 'string') {
		return { reason: r }
	}
	r.code = code
	if (a.recs === null) {
		a.recs = new Map()
	}
	a.recs.set(code, r)
	return { rec: r }
}

/**
 * Canonical code of a normalised move (Measure squares already mapped to min loc(X)).
 *
 * @param {Analysis} a analysis
 * @param {{type: string, from: number[], to: number[], promo: string|null}} mv normalised move
 * @param {number} X piece on from[0]
 * @return {string}
 */
function codeOfNormalized(a, mv, X) {
	switch (mv.type) {
		case 'standard':
			return SQUARE_NAMES[mv.from[0]] + '-' + SQUARE_NAMES[mv.to[0]] + (mv.promo === null ? '' : '=' + mv.promo.toUpperCase())
		case 'split':
			return SQUARE_NAMES[mv.from[0]] + '-' + SQUARE_NAMES[mv.to[0]] + '|' + SQUARE_NAMES[mv.to[1]]
		case 'merge':
			return SQUARE_NAMES[mv.from[0]] + '|' + SQUARE_NAMES[mv.from[1]] + '-' + SQUARE_NAMES[mv.to[0]]
		default:
			return '?' + SQUARE_NAMES[a.locs[X][0]]
	}
}

/**
 * Checks 6 onwards for a normalised move whose piece passed checks 3–5.
 *
 * @param {Analysis} a analysis
 * @param {{type: string, from: number[], to: number[], promo: string|null}} mv normalised move
 * @param {number} X piece id
 * @return {MoveRecord|string} record or reason
 */
function checkMove(a, mv, X) {
	const type = a.typeCodes[X]
	switch (mv.type) {
		case 'merge': {
			if (a.occ[mv.from[1]] !== X) {
				return 'merge_mismatch'
			}
			if (type === TYPE_K || type === TYPE_P) {
				return 'cannot_merge'
			}
			return evalMerge(a, X, mv.from[0], mv.from[1], mv.to[0])
		}
		case 'split':
			if (type === TYPE_K || type === TYPE_P) {
				return 'cannot_split'
			}
			return evalSplit(a, X, mv.from[0], mv.to[0], mv.to[1])
		case 'measure':
			return evalMeasure(a, X)
		default:
			return evalStandard(a, X, mv.from[0], mv.to[0], mv.promo)
	}
}
