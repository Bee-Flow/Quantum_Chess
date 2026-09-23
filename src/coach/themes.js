/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Hint themes (GAME-DESIGN §5.3.2), detected deterministically on a move.
 */

import { t } from '@nextcloud/l10n'
import { findMove, getOutcomes, kingDanger, moveRisk, T } from '../engine/index.js'
import { threatsAgainst } from './threats.js'

/**
 * The theme of a move.
 *
 * @param {object} state position before the move
 * @param {string} code move code
 * @return {string} kingCapture | trap | converge | measure | defendKing | saveMaterial | splitDefense | probe | quiet
 */
export function themeOf(state, code) {
	const move = findMove(state, code)
	if (!move) {
		return 'quiet'
	}
	const mover = state.turn
	const win = mover === 'w' ? '1-0' : '0-1'
	const outs = getOutcomes(state, move.code)
	const wins = outs.filter((o) => o.state.result?.result === win)
	if (move.type === 'merge' && move.capture) {
		return 'converge'
	}
	if (wins.some((o) => o.state.result.reason === 'king_captured')) {
		return 'kingCapture'
	}
	if (wins.length) {
		return 'trap'
	}
	if (move.type === 'measure') {
		return 'measure'
	}
	const danger = kingDanger(state, mover)
	if (danger > 0 && moveRisk(state, move.code) < danger / T) {
		return 'defendKing'
	}
	const piece = state.types[move.piece]
	if (piece?.toLowerCase() === 'p' && move.capture && move.resolution === 'rolled') {
		return 'probe'
	}
	const threatened = threatsAgainst(state, mover).filter((x) => x.pCap >= 0.25)
	if (threatened.some((x) => x.id === move.piece)) {
		return move.type === 'split' ? 'splitDefense' : 'saveMaterial'
	}
	return 'quiet'
}

/**
 * The Nudge sentence of a theme.
 *
 * @param {string} theme theme
 * @return {string}
 */
export function themeText(theme) {
	switch (theme) {
		case 'kingCapture': return t('quantumchess', 'The enemy king can be captured. Find the best shot.')
		case 'trap': return t('quantumchess', 'One move can leave the enemy king with nowhere to go.')
		case 'converge': return t('quantumchess', 'Two parts of one piece can strike together.')
		case 'measure': return t('quantumchess', 'Settling a ghost could make a follow-up certain or free your budget.')
		case 'defendKing': return t('quantumchess', 'Your king needs help first.')
		case 'saveMaterial': return t('quantumchess', 'One of your pieces is under attack.')
		case 'splitDefense': return t('quantumchess', 'A split can make a threatened piece harder to hit.')
		case 'probe': return t('quantumchess', 'A cheap piece can find out where a ghost really is.')
		default: return t('quantumchess', 'No tactics right now: improve a piece.')
	}
}
