/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Roll display (§9.4): the half-open interval of every outcome and the roll, printed by truncation.
 *
 * PHP twin: lib/Engine/Internal/RollDisplay.php. Section numbers (§) refer to docs/engine-rules.md.
 */

import { T } from './constants.js'

const DEFAULT_LABELS = Object.freeze({
	miss: 'Missed',
	move: 'Moved',
	capture: 'Captured',
	rolled: 'rolled',
	forced: 'forced',
})

/**
 * dec_d(x): floor(x · 10^d / 2^24) printed with d decimals (truncation, never rounding).
 *
 * @param {number} x integer 0..T
 * @param {number} d 4 or 8
 * @return {string}
 */
export function decimalOfWeight(x, d) {
	const scale = 10 ** d
	const v = Math.floor(x * scale / T)
	const ip = Math.floor(v / scale)
	const fp = String(v - ip * scale).padStart(d, '0')
	return String(ip) + '.' + fp
}

/**
 * Integer value of dec_d(x) (for comparisons).
 *
 * @param {number} x integer 0..T
 * @param {number} d decimals
 * @return {number}
 */
function decValue(x, d) {
	return Math.floor(x * 10 ** d / T)
}

/**
 * Structured roll display for a measurement record: the decimals, every interval and the roll.
 *
 * @param {{key: string, u: number|null, outcomes: Array<{key: string, weight: number}>}} record measurement record
 * @return {{decimals: number, intervals: Array<{key: string, start: number, end: number, startText: string,
 *   endText: string, chosen: boolean}>, u: number|null, uText: string|null, chosen: string}}
 */
export function rollIntervals(record) {
	const outcomes = record.outcomes
	const bounds = [0]
	for (let i = 0; i < outcomes.length; i++) {
		bounds.push(bounds[i] + outcomes[i].weight)
	}
	const j = outcomes.findIndex((o) => o.key === record.key)
	let d = 4
	for (let i = 1; i < bounds.length; i++) {
		if (!(decValue(bounds[i - 1], 4) < decValue(bounds[i], 4))) {
			d = 8
		}
	}
	if (record.u !== null && record.u !== undefined && j >= 0
		&& !(decValue(record.u, 4) < decValue(bounds[j + 1], 4))) {
		d = 8
	}
	return {
		decimals: d,
		intervals: outcomes.map((o, i) => ({
			key: o.key,
			start: bounds[i],
			end: bounds[i + 1],
			startText: decimalOfWeight(bounds[i], d),
			endText: decimalOfWeight(bounds[i + 1], d),
			chosen: i === j,
		})),
		u: record.u ?? null,
		uText: record.u === null || record.u === undefined ? null : decimalOfWeight(record.u, d),
		chosen: record.key,
	}
}

/**
 * The text form of a roll (§9.4), e.g.
 * `Moved [0.0000, 0.5000) · Captured [0.5000, 1.0000) · rolled 0.3712 → Moved`.
 *
 * Labels default to the English words of the rules (Missed, Moved, Captured; square names for a Measure); pass
 * translated `labels` (`{miss, move, capture, rolled, forced}`) for the UI.
 *
 * @param {{key: string, u: number|null, outcomes: Array<{key: string, weight: number}>}} record measurement record
 * @param {{miss?: string, move?: string, capture?: string, rolled?: string, forced?: string}} [labels] label overrides
 * @return {string}
 */
export function rollDisplay(record, labels) {
	const L = { ...DEFAULT_LABELS, ...labels || {} }
	const label = (k) => (Object.hasOwn(L, k) && ['miss', 'move', 'capture'].includes(k) ? L[k] : k)
	const r = rollIntervals(record)
	const parts = r.intervals.map((x) => label(x.key) + ' [' + x.startText + ', ' + x.endText + ')')
	const tail = r.uText === null ? ' · ' + L.forced + ' → ' : ' · ' + L.rolled + ' ' + r.uText + ' → '
	return parts.join(' · ') + tail + label(record.key)
}
