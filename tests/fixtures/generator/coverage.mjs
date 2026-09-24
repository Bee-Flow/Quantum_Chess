/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Coverage of the parity fixtures: counters of every rules feature the generated steps exercise, the minimum each
 * must reach (the features docs/engine-rules.md §12 lists), and the whyIllegal reason codes the cases produce.
 */

import * as E from '../../../src/engine/index.js'

/** Counters, filled while the steps are generated. */
export const cover = {
	steps: 0,
	split: 0,
	merge: 0,
	measure: 0,
	castling: 0,
	promotion: 0,
	enPassant: 0,
	rolled: 0,
	forced: 0,
	quantum: 0,
	certainCapture: 0,
	rolledCaptureOfGhost: 0,
	convergingCapture: 0,
	certainConvergingCapture: 0,
	fallback: 0,
	budgetFullState: 0,
	locationCap: 0,
	weightOneWorld: 0,
	suspendedDraw: 0,
	threeOutcomes: 0,
	result_king_captured: 0,
	result_king_trapped: 0,
	result_bare_kings: 0,
	result_repetition: 0,
	result_fifty_moves: 0,
	result_max_ply: 0,
	result_no_moves: 0,
	whyIllegalCases: 0,
}
/** The whyIllegal reason codes (and `legal`) the cases produced. */
export const reasonsSeen = new Set()

/** The minimum count of every counter. */
const MINIMUM = {
	steps: 1500,
	split: 150,
	merge: 60,
	measure: 30,
	castling: 3,
	promotion: 3,
	enPassant: 2,
	rolled: 150,
	forced: 5,
	quantum: 100,
	certainCapture: 20,
	rolledCaptureOfGhost: 10,
	convergingCapture: 3,
	certainConvergingCapture: 1,
	fallback: 3,
	budgetFullState: 3,
	locationCap: 2,
	weightOneWorld: 1,
	suspendedDraw: 2,
	threeOutcomes: 3,
	result_king_captured: 5,
	result_king_trapped: 2,
	result_bare_kings: 1,
	result_repetition: 1,
	result_fifty_moves: 1,
	result_max_ply: 1,
	result_no_moves: 1,
	whyIllegalCases: 300,
}

/**
 * Track coverage of one applied step.
 *
 * @param {object} before state before
 * @param {object} m LegalMove
 * @param {object} r applyMove result
 * @param {boolean} forced forced outcome
 */
export function track(before, m, r, forced) {
	cover.steps++
	if (m.type !== 'standard') {
		cover[m.type]++
	}
	const key = m.resolution === 'rolled'
		? r.measurement.key
		: (m.outcomes.length === 1 ? m.outcomes[0].key : m.resolution)
	const types = before.types
	if (m.type === 'standard' && types[m.piece] === 'k' && Math.abs(m.to[0] - m.from[0]) === 2) {
		cover.castling++
	}
	if (m.promo && key !== 'miss') {
		cover.promotion++
	}
	if (m.type === 'standard' && types[m.piece] === 'p' && before.ep === E.squareName(m.to[0])) {
		cover.enPassant++
	}
	if (m.resolution === 'rolled') {
		cover.rolled++
	}
	if (m.outcomes.length === 3) {
		cover.threeOutcomes++
	}
	if (forced) {
		cover.forced++
	}
	if (m.resolution === 'quantum') {
		cover.quantum++
	}
	if (m.fallback) {
		cover.fallback++
	}
	if (m.resolution === 'certain' && key === 'capture') {
		cover.certainCapture++
	}
	const capturedId = r.state.captured.length > before.captured.length
		? r.state.captured[r.state.captured.length - 1]
		: -1
	if (m.resolution === 'rolled' && key === 'capture' && capturedId >= 0
		&& E.pieceLocations(before)[capturedId].length > 1) {
		cover.rolledCaptureOfGhost++
	}
	if (m.type === 'merge' && key === 'capture') {
		cover.convergingCapture++
		if (m.resolution === 'certain') {
			cover.certainConvergingCapture++
		}
	}
	const s = r.state
	if (s.worlds.some((w) => w[1] === 1)) {
		cover.weightOneWorld++
	}
	const mover = before.turn
	if (E.budget(before, mover) >= 8 && E.generateMoves(before).every((x) => x.type !== 'split')) {
		cover.budgetFullState++
	}
	if (s.result === null) {
		const h = s.history[s.history.length - 1]
		const reps = s.history.filter((x) => x === h).length
		if (s.captured.length === 30 || s.halfmove >= 100 || reps >= 3) {
			cover.suspendedDraw++
		}
	} else {
		cover['result_' + s.result.reason]++
	}
}

/**
 * Print the coverage counts and check them against the minimums.
 *
 * @param {number} gameCount number of game fixtures (random games and scripted examples)
 * @return {boolean} whether every minimum is reached and every reachable reason code occurs
 */
export function reportCoverage(gameCount) {
	const missingReasons = E.ILLEGAL_REASONS.filter((r) => r !== 'cannot_merge' && !reasonsSeen.has(r))
	const failures = Object.entries(MINIMUM).filter(([k, min]) => (cover[k] ?? 0) < min)
	console.log('Coverage over ' + gameCount + ' games (' + cover.steps + ' steps):')
	for (const [k, v] of Object.entries(cover)) {
		console.log('  '
			+ k.padEnd(26)
			+ String(v).padStart(6)
			+ (MINIMUM[k] !== undefined ? '   (min ' + MINIMUM[k] + ')' : ''))
	}
	console.log('  whyIllegal reason codes covered: '
		+ [...reasonsSeen].filter((r) => r !== 'legal').length
		+ ' of 23 (cannot_merge is always pre-empted by check 6)')
	if (failures.length > 0 || missingReasons.length > 0) {
		console.error('Coverage too low: ' + failures.map(([k]) => k).concat(missingReasons).join(', '))
		return false
	}
	return true
}
