/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Move-quality labels (GAME-DESIGN §5.3.4). ΔE is the drop in the mover's expected score against the best move,
 * computed before the roll, so bad luck never makes a move a blunder. Rolls get Lucky / Unlucky tags.
 */

import { t } from '@nextcloud/l10n'

/** Label order from best to worst (the special labels rank with `best`). */
export const LABELS = Object.freeze(['brilliant', 'only', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'])

/** Labels that are shown as warnings. */
export const BAD_LABELS = Object.freeze(['inaccuracy', 'mistake', 'blunder'])

/**
 * White's E seen from the mover.
 *
 * @param {number} E White's expected score
 * @param {'w'|'b'} color mover
 * @return {number}
 */
export const forMover = (E, color) => (color === 'w' ? E : 1 - E)

/**
 * Whether a move is a quantum move for the brilliancy rule: a split, merge (incl. converging capture), Measure or a
 * pawn probe (a rolled pawn capture).
 *
 * @param {object} move LegalMove
 * @param {string} [pieceType] type letter of the moving piece
 * @return {boolean}
 */
export function isQuantumMove(move, pieceType = '') {
	return move.type !== 'standard' || (pieceType.toLowerCase() === 'p' && move.capture && move.resolution === 'rolled')
}

/**
 * The quality of one move.
 *
 * @param {object} p `{color, bestE, playedE, secondBestE?, bestClassicalE?, quantum?, allowsKingShot?, forced?,
 *   outcomes?, realisedE?}` (E values are White's, as in PlyAnalysis)
 * @return {{label: string, deltaPp: number, luck: 'lucky'|'unlucky'|null, luckPp: number}}
 */
export function qualityOf(p) {
	const best = forMover(p.bestE, p.color)
	const played = forMover(p.playedE, p.color)
	const deltaPp = Math.max(0, (best - played) * 100)
	let label
	if (deltaPp <= 0.5) {
		label = 'best'
	} else if (deltaPp <= 2) {
		label = 'excellent'
	} else if (deltaPp <= 5) {
		label = 'good'
	} else if (deltaPp <= 10) {
		label = 'inaccuracy'
	} else if (deltaPp <= 20) {
		label = 'mistake'
	} else {
		label = 'blunder'
	}
	if (p.allowsKingShot && deltaPp > 0.5) {
		label = 'blunder'
	}
	if (label === 'best' && !p.forced) {
		if (p.quantum && typeof p.bestClassicalE === 'number' && best - forMover(p.bestClassicalE, p.color) >= 0.1 && best >= 0.2 && best <= 0.9) {
			label = 'brilliant'
		} else if (typeof p.secondBestE === 'number' && best - forMover(p.secondBestE, p.color) >= 0.15) {
			label = 'only'
		}
	}
	if ((best < 0.03 || best > 0.97) && LABELS.indexOf(label) > LABELS.indexOf('inaccuracy')) {
		label = 'inaccuracy'
	}
	let luck = null
	let luckPp = 0
	if (p.outcomes && typeof p.realisedE === 'number') {
		luckPp = (forMover(p.realisedE, p.color) - played) * 100
		luck = luckPp >= 15 ? 'lucky' : (luckPp <= -15 ? 'unlucky' : null)
	}
	return { label, deltaPp, luck, luckPp }
}

/**
 * The quality of a PlyAnalysis (SPEC §4.3).
 *
 * @param {object} ply PlyAnalysis
 * @param {boolean} quantum whether the played move is a quantum move
 * @return {object} qualityOf result
 */
export function qualityOfPly(ply, quantum = false) {
	return qualityOf({
		color: ply.color,
		bestE: ply.bestE ?? ply.EBefore,
		playedE: ply.playedE,
		secondBestE: ply.secondBestE,
		bestClassicalE: ply.bestClassicalE,
		quantum: quantum && ply.code === ply.bestCode,
		allowsKingShot: ply.allowsKingShot,
		forced: ply.forced,
		outcomes: ply.outcomes,
		realisedE: ply.realisedE,
	})
}

/**
 * Display text of a label.
 *
 * @param {string} label label
 * @return {string}
 */
export function labelText(label) {
	switch (label) {
		case 'brilliant': return t('quantumchess', 'Quantum brilliancy ✦')
		case 'only': return t('quantumchess', 'Only move !')
		case 'best': return t('quantumchess', 'Best')
		case 'excellent': return t('quantumchess', 'Excellent')
		case 'good': return t('quantumchess', 'Good')
		case 'inaccuracy': return t('quantumchess', 'Inaccuracy ?!')
		case 'mistake': return t('quantumchess', 'Mistake ?')
		case 'blunder': return t('quantumchess', 'Blunder ??')
		default: return ''
	}
}

/**
 * Display text of a luck tag.
 *
 * @param {'lucky'|'unlucky'|null} luck tag
 * @return {string}
 */
export function luckText(luck) {
	if (luck === 'lucky') {
		return t('quantumchess', 'Lucky 🍀')
	}
	return luck === 'unlucky' ? t('quantumchess', 'Unlucky 🌧') : ''
}
