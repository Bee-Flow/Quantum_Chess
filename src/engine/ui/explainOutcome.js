/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * explainOutcome: replays the per-world function of a move to say *why* an outcome happened, by weight, so that every
 * roll can be explained after the fact. Display only: never parity-tested, never used by the rules.
 */

import { analyze } from '../analysis.js'
import { applyRecord } from '../apply.js'
import { T } from '../constants.js'
import { IllegalMoveError } from '../errors.js'
import { TYPE_P } from '../geometry.js'
import { resolveMove } from '../moveInput.js'
import { legalOf } from '../moveRecord.js'
import { recordKeys } from '../outcomes.js'
import { idOfCode } from '../squares.js'
import { pieceLocations } from '../views.js'

/** Causes of a Missed, in the order used to break ties. */
const MISS_CAUSES = Object.freeze(['absent', 'blocked', 'own_piece', 'occupied', 'no_enemy'])

/**
 * Why did this world miss? Returns [cause, blocker square or -1, occupant id or -1].
 *
 * @param {object} rec record
 * @param {string} b board
 * @return {[string, number, number]}
 */
function missCause(rec, b) {
	const sources = rec.kind === 'merge' ? [[rec.f, rec.laneOcc], [rec.f2, rec.laneOcc2]] : [[rec.f, rec.laneOcc]]
	for (const [f, laneOcc] of sources) {
		if (b.charCodeAt(f) !== rec.letter) {
			continue
		}
		if (laneOcc !== null) {
			// The first occupied lane square seen from f.
			const ordered = laneOcc.slice().sort((x, y) => Math.abs(x - f) - Math.abs(y - f))
			for (const s of ordered) {
				if (b.charCodeAt(s) !== 46) {
					return ['blocked', s, idOfCode(b.charCodeAt(s))]
				}
			}
		}
		const c = b.charCodeAt(rec.t)
		const id = idOfCode(c)
		if (rec.pawn === 'push' || rec.pawn === 'double') {
			if (rec.pawn === 'double') {
				const skipped = (rec.f + rec.t) >> 1
				if (b.charCodeAt(skipped) !== 46) {
					return ['blocked', skipped, idOfCode(b.charCodeAt(skipped))]
				}
			}
			return ['occupied', -1, id]
		}
		if (rec.pawn === 'diagonal') {
			return ['no_enemy', -1, id]
		}
		return ['own_piece', -1, id]
	}
	return ['absent', -1, -1]
}

/**
 * Explain one outcome of a move.
 *
 * Returns
 * `{move, key, weight, probability, piece, captured, causes, cause, blockers, occupant, target, pieceAfter,
 *   targetPiece, targetPieceAfter, settled, fallback, state}`:
 * - `causes`: for `miss`, the weight of each cause (`absent`: the piece was not on the square it left; `blocked`:
 *   its path was blocked; `own_piece`: a friendly piece stood on the target; `occupied`: a pawn push found the
 *   target occupied; `no_enemy`: a pawn capture found nothing to take). `cause` is the most likely one.
 * - `blockers`: for `blocked`, the first piece in the way, `[{piece, square, weight}]`, most likely first.
 * - `occupant`: for `own_piece`/`occupied`/`no_enemy`, the piece that stood on the target, `{piece, weight}`.
 * - `targetPiece`: the piece that might have stood on the target before the move (occ(t)), with its locations in
 *   the outcome state (`targetPieceAfter`), for "c5 was empty, the ♝ is on f8".
 * - `settled`: other pieces that were ghosts and are certain in the outcome state, `[{piece, square}]` (linked
 *   pieces that collapsed with the roll).
 *
 * @param {object} state valid engine state
 * @param {object|string} move move input
 * @param {string} key outcome key (`miss`, `move`, `capture`, a Measure square, or `certain`/`quantum`)
 * @return {object}
 */
export function explainOutcome(state, move, key) {
	const a = analyze(state)
	const r = resolveMove(a, move)
	if (r.reason !== undefined) {
		throw new IllegalMoveError(r.reason, move)
	}
	const rec = r.rec
	const keys = recordKeys(rec)
	if (!keys.includes(key)) {
		throw new RangeError('not an outcome of this move: ' + key)
	}
	const weight = rec.resolution === 'rolled' ? rec.outcomes[keys.indexOf(key)].weight : T
	const applied = applyRecord(a, rec, key, true, true)
	const after = applied.state
	const out = {
		move: legalOf(rec),
		key,
		weight,
		probability: weight / T,
		piece: rec.X,
		captured: applied.captured >= 0 ? applied.captured : null,
		causes: null,
		cause: null,
		blockers: [],
		occupant: null,
		target: rec.t >= 0 ? rec.t : null,
		pieceAfter: pieceLocations(after)[rec.X],
		targetPiece: null,
		targetPieceAfter: [],
		settled: [],
		fallback: rec.fallback,
		state: after,
	}
	if (key === 'miss') {
		const causes = { absent: 0, blocked: 0, own_piece: 0, occupied: 0, no_enemy: 0 }
		const blockers = new Map()
		const occupants = new Map()
		const missed = rec.kind === 'merge' ? missedMerge : missedStandard
		for (let i = 0; i < a.n; i++) {
			const b = a.boards[i]
			if (!missed(rec, b)) {
				continue
			}
			const w = a.weights[i]
			const [cause, sq, id] = missCause(rec, b)
			causes[cause] += w
			if (cause === 'blocked') {
				const k = sq * 32 + id
				blockers.set(k, (blockers.get(k) ?? 0) + w)
			} else if (id >= 0) {
				occupants.set(id, (occupants.get(id) ?? 0) + w)
			}
		}
		out.causes = causes
		let best = null
		for (const c of MISS_CAUSES) {
			if (causes[c] > 0 && (best === null || causes[c] > causes[best])) {
				best = c
			}
		}
		out.cause = best
		out.blockers = [...blockers].map(([k, w]) => ({ piece: k % 32, square: Math.floor(k / 32), weight: w }))
			.sort((x, y) => y.weight - x.weight || x.square - y.square)
		if (occupants.size > 0) {
			const [piece, w] = [...occupants].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]
			out.occupant = { piece, weight: w }
		}
	}
	if (rec.t >= 0 && a.occ[rec.t] >= 0 && a.occ[rec.t] !== rec.X) {
		out.targetPiece = a.occ[rec.t]
		out.targetPieceAfter = pieceLocations(after)[out.targetPiece]
	}
	const locsAfter = pieceLocations(after)
	for (let id = 0; id < 32; id++) {
		if (id !== rec.X && a.locs[id].length > 1 && locsAfter[id].length === 1) {
			out.settled.push({ piece: id, square: locsAfter[id][0].square })
		}
	}
	return out
}

/**
 * Did a standard move miss in this board?
 *
 * @param {object} rec record
 * @param {string} b board
 * @return {boolean}
 */
function missedStandard(rec, b) {
	if (b.charCodeAt(rec.f) !== rec.letter) {
		return true
	}
	if (rec.laneOcc !== null) {
		for (const s of rec.laneOcc) {
			if (b.charCodeAt(s) !== 46) {
				return true
			}
		}
	}
	const c = b.charCodeAt(rec.t)
	if (rec.type === TYPE_P) {
		if (rec.pawn === 'diagonal') {
			return !(rec.ep || (c !== 46 && (idOfCode(c) < 16) !== (rec.ci === 0)))
		}
		return c !== 46
	}
	return c !== 46 && (idOfCode(c) < 16) === (rec.ci === 0)
}

/**
 * Did a merge miss in this board?
 *
 * @param {object} rec record
 * @param {string} b board
 * @return {boolean}
 */
function missedMerge(rec, b) {
	for (const [f, laneOcc] of [[rec.f, rec.laneOcc], [rec.f2, rec.laneOcc2]]) {
		if (b.charCodeAt(f) === rec.letter) {
			if (laneOcc === null) {
				return false
			}
			return laneOcc.some((s) => b.charCodeAt(s) !== 46)
		}
	}
	return true
}
