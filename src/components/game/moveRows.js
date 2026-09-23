/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Helpers for the move list and roll log.
 */

import { T } from '../../engine/index.js'

/**
 * Group MoveEntries into numbered rows `{number, w: {entry, index}|null, b: {entry, index}|null}`.
 *
 * @param {object[]} moves MoveEntry list
 * @param {number} [firstNumber] number of the first row
 * @return {object[]}
 */
export function moveRows(moves, firstNumber = 1) {
	const rows = []
	let number = firstNumber
	moves.forEach((entry, index) => {
		const last = rows[rows.length - 1]
		if (entry.color === 'b' && last && last.b === null) {
			last.b = { entry, index }
			return
		}
		if (last) {
			number++
		}
		rows.push({ number, w: entry.color === 'w' ? { entry, index } : null, b: entry.color === 'b' ? { entry, index } : null })
	})
	return rows
}

/**
 * The probability of the realised outcome of a measurement.
 *
 * @param {object|null} measurement MeasurementRecord
 * @return {number} 0..1 (1 when not rolled)
 */
export function realisedProbability(measurement) {
	if (!measurement) {
		return 1
	}
	const o = measurement.outcomes.find((x) => x.key === measurement.key)
	return o ? o.weight / T : 1
}

/** Results below this probability count as rare. */
export const RARE_BELOW = 0.25

/**
 * Game summary for the game-over dialog: moves, rolls, rare results, converging captures.
 *
 * @param {object[]} moves MoveEntry list
 * @return {{moves: number, rolls: number, rare: number, converging: number}}
 */
export function gameSummary(moves) {
	let rolls = 0
	let rare = 0
	let converging = 0
	for (const m of moves) {
		if (m.measurement) {
			rolls++
			if (realisedProbability(m.measurement) < RARE_BELOW) {
				rare++
			}
		}
		if (m.code.includes('|') && m.code.indexOf('|') < m.code.indexOf('-') && /x/i.test(m.notation ?? '')) {
			converging++
		}
	}
	return { moves: Math.ceil(moves.length / 2), rolls, rare, converging }
}
