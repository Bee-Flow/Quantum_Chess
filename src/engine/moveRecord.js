/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The internal move record and the public LegalMove built from it (§4.10). A record keeps everything the pipeline
 * needs about one legal move in one state; its public face is the LegalMove object (`legalOf`).
 *
 * PHP twin: lib/Engine/Internal/MoveRecord.php. Section numbers (§) refer to docs/engine-rules.md.
 */

import { T } from './constants.js'
import { SQUARE_NAMES } from './squares.js'

/** @typedef {import('./types.js').LegalMove} LegalMove */

/** Per-world outcome of a standard move or merge (§4.3): the move did not happen. */
export const MISS = 0
/** Per-world outcome: the piece moved to an empty square. */
export const MOVE = 1
/** Per-world outcome: the piece captured on its target square. */
export const CAPTURE = 2

/** Promotion letter → the promotion index of the §4.10 sort tuple. */
export const PROMO_INDEX = Object.freeze({ q: 1, r: 2, b: 3, n: 4 })

/** Promotion letters in tuple order. */
export const PROMOS = Object.freeze(['q', 'r', 'b', 'n'])

/**
 * The fields of a move record. Squares are indices 0–63; weights are integers on the T scale.
 *
 * @typedef {object} MoveRecordFields
 * @property {'standard'|'split'|'merge'|'measure'} kind move type
 * @property {number} X moving piece id
 * @property {number} ci colour index of the mover (0 White, 1 Black)
 * @property {number} type type code of the mover
 * @property {number} letter board character code of the mover
 * @property {number} f from square (merge: the lower source; Measure: the lowest square of the piece)
 * @property {number} t to square (split: the lower target; Measure: −1)
 * @property {number} f2 merge: the higher source, otherwise −1
 * @property {number} t2 split: the higher target, otherwise −1
 * @property {string|null} promo promotion letter (`q`, `r`, `b`, `n`) or null
 * @property {object|null} castle the castling table entry (`CASTLING[flag]`) of a castling move, or null
 * @property {'push'|'double'|'diagonal'|null} pawn pawn move kind, or null for other pieces
 * @property {boolean} ep the move is an en-passant capture
 * @property {number[]|null} laneOcc lane squares that may be occupied (null: the lane is certainly clear)
 * @property {number[]|null} laneOcc2 merge: the same for the lane from the higher source
 * @property {Uint8Array|null} [flags1] split: lane-clear flag of child 1 per world of `onF`
 * @property {Uint8Array|null} [flags2] split: lane-clear flag of child 2 per world of `onF`
 * @property {number[]|null} [onF] split: indices of the worlds with the piece on `f`
 * @property {boolean} inM the move is in the measured class (§4.5): its outcomes are rolled when there are several
 * @property {number} wMiss total weight of the worlds in which the move misses
 * @property {number} wMove total weight of the worlds in which the piece moves without capturing
 * @property {number} wCap total weight of the worlds in which the piece captures
 * @property {number} captureId the piece a capture outcome takes, or −1
 * @property {boolean} fallback rolled only because the unmeasured result would exceed the budget (§4.5)
 * @property {'certain'|'quantum'|'rolled'} resolution how the move resolves
 * @property {Array<{key: string, weight: number}>} outcomes the outcomes in key order
 * @property {number} happenWeight total weight of the worlds in which the move happens
 * @property {number[]} from the `from` squares of the LegalMove
 * @property {number[]} to the `to` squares of the LegalMove
 * @property {number} sortKey the §4.10 sort tuple as one integer
 */

/**
 * Internal move record: everything applyMove needs about one legal move in one state (see `MoveRecordFields`).
 * Besides those fields a record caches its canonical `code`, its public LegalMove (`legal`) and its `moveRisk`
 * (`risk`, undefined until computed).
 *
 * All instances share one field layout, so property access in the hot loops stays monomorphic.
 */
export class MoveRecord {
	/**
	 * @param {MoveRecordFields} p field values (a plain object, or another record to copy)
	 */
	constructor(p) {
		this.kind = p.kind
		this.X = p.X
		this.ci = p.ci
		this.type = p.type
		this.letter = p.letter
		this.f = p.f
		this.t = p.t
		this.f2 = p.f2
		this.t2 = p.t2
		this.promo = p.promo
		this.castle = p.castle
		this.pawn = p.pawn
		this.ep = p.ep
		this.laneOcc = p.laneOcc
		this.laneOcc2 = p.laneOcc2
		this.flags1 = p.flags1 ?? null
		this.flags2 = p.flags2 ?? null
		this.onF = p.onF ?? null
		this.inM = p.inM
		this.wMiss = p.wMiss
		this.wMove = p.wMove
		this.wCap = p.wCap
		this.captureId = p.captureId
		this.fallback = p.fallback
		this.resolution = p.resolution
		this.outcomes = p.outcomes
		this.happenWeight = p.happenWeight
		this.from = p.from
		this.to = p.to
		this.sortKey = p.sortKey
		this.code = null
		this.legal = null
		this.risk = undefined
	}

	/**
	 * A copy with another promotion piece (the four promotions have identical weights).
	 *
	 * @param {string} promo promotion letter
	 * @return {MoveRecord}
	 */
	withPromo(promo) {
		const r = new MoveRecord(this)
		r.promo = promo
		r.outcomes = this.outcomes.map((o) => ({ key: o.key, weight: o.weight }))
		r.sortKey = ((0 * 64 + this.f) * 64 + this.t) * 64 + PROMO_INDEX[promo]
		return r
	}
}

/**
 * The canonical code of a record (§4.1).
 *
 * @param {MoveRecord} rec record
 * @return {string}
 */
export function recCode(rec) {
	switch (rec.kind) {
		case 'standard':
			return SQUARE_NAMES[rec.f] + '-' + SQUARE_NAMES[rec.t]
				+ (rec.promo === null ? '' : '=' + rec.promo.toUpperCase())
		case 'split':
			return SQUARE_NAMES[rec.f] + '-' + SQUARE_NAMES[rec.t] + '|' + SQUARE_NAMES[rec.t2]
		case 'merge':
			return SQUARE_NAMES[rec.f] + '|' + SQUARE_NAMES[rec.f2] + '-' + SQUARE_NAMES[rec.t]
		default:
			return '?' + SQUARE_NAMES[rec.f]
	}
}

/**
 * The public LegalMove of a record (§4.10), built once.
 *
 * @param {MoveRecord} rec record
 * @return {LegalMove}
 */
export function legalOf(rec) {
	if (rec.legal !== null) {
		return rec.legal
	}
	const m = { type: rec.kind, from: rec.from.slice(), to: rec.to.slice() }
	if (rec.promo !== null) {
		m.promo = rec.promo
	}
	m.code = recCode(rec)
	m.piece = rec.X
	m.resolution = rec.resolution
	m.measured = rec.resolution === 'rolled'
	m.fallback = rec.fallback
	m.capture = rec.wCap > 0
	m.happenWeight = rec.happenWeight
	m.outcomes = rec.outcomes.map((o) => ({ key: o.key, weight: o.weight }))
	m.successProbability = rec.happenWeight / T
	rec.legal = m
	rec.code = m.code
	return m
}
