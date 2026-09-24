/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Move notation (§5.7): head + suffix + mark.
 *
 * PHP twin: lib/Engine/Internal/Notation.php. Section numbers (§) refer to docs/engine-rules.md.
 */

import { analyze } from './analysis.js'
import { applyRecord } from './apply.js'
import { EngineArgumentError, IllegalMoveError } from './errors.js'
import { TYPE_CHAR } from './geometry.js'
import { resolveMove } from './moveInput.js'
import { SQUARE_NAMES } from './squares.js'
import { pct } from './views.js'

/** @typedef {import('./types.js').EngineState} EngineState */
/** @typedef {import('./types.js').Measurement} Measurement */
/** @typedef {import('./types.js').MoveInput} MoveInput */

/**
 * Notation of a move played in `stateBefore` (§5.7), e.g. `Bc1xh6 {capture 50%}`, `?Na4 {c4 50%}`,
 * `Qd4|h5xh8 #`, `Ng1-f3|h3`, `O-O`, `e7-e8=Q`.
 *
 * A rolled move needs its measurement record. The win mark ` #` is taken from `stateAfter.result` when given,
 * otherwise the move is replayed with the recorded outcome.
 *
 * @param {EngineState} stateBefore state before the move
 * @param {MoveInput} move move input
 * @param {Measurement|null} [measurement] measurement record (required for rolled moves)
 * @param {EngineState} [stateAfter] state after the move (optional, saves a replay)
 * @return {string}
 */
export function moveNotation(stateBefore, move, measurement = null, stateAfter = undefined) {
	const a = analyze(stateBefore)
	const r = resolveMove(a, move)
	if (r.reason !== undefined) {
		throw new IllegalMoveError(r.reason, move)
	}
	const rec = r.rec
	let key
	if (rec.resolution === 'rolled') {
		if (!measurement || !rec.outcomes.some((o) => o.key === measurement.key)) {
			throw new EngineArgumentError('a rolled move needs its measurement record')
		}
		key = measurement.key
	} else {
		key = rec.resolution === 'certain' && rec.outcomes.length === 1 ? rec.outcomes[0].key : 'move'
	}
	const typeChar = TYPE_CHAR[rec.type]
	const letter = typeChar === 'p' ? '' : typeChar.toUpperCase()
	const sep = key === 'capture' ? 'x' : '-'
	let head
	switch (rec.kind) {
		case 'standard':
			if (rec.castle !== null) {
				head = rec.t > rec.f ? 'O-O' : 'O-O-O'
			} else {
				head = letter + SQUARE_NAMES[rec.f] + sep + SQUARE_NAMES[rec.t] + (rec.promo === null ? '' : '=' + rec.promo.toUpperCase())
			}
			break
		case 'split':
			head = letter + SQUARE_NAMES[rec.f] + '-' + SQUARE_NAMES[rec.t] + '|' + SQUARE_NAMES[rec.t2]
			break
		case 'merge':
			head = letter + SQUARE_NAMES[rec.f] + '|' + SQUARE_NAMES[rec.f2] + sep + SQUARE_NAMES[rec.t]
			break
		default:
			head = '?' + letter + SQUARE_NAMES[rec.f]
	}
	let suffix = ''
	if (rec.resolution === 'rolled') {
		const o = rec.outcomes.find((x) => x.key === key)
		suffix = ' {' + key + ' ' + pct(o.weight) + '%}'
	}
	let after = stateAfter
	if (after === undefined || after === null) {
		after = applyRecord(a, rec, rec.resolution === 'rolled' ? key : rec.resolution, true, true).state
	}
	const won = after.result !== null && (after.result.reason === 'king_captured' || after.result.reason === 'king_trapped')
	return head + suffix + (won ? ' #' : '')
}
