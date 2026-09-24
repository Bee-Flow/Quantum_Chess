/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Hints in two tiers: Nudge (highlight the piece, plus a sentence about the theme) and Idea (the move type and the
 * area, the gain, and an arrow).
 */

import { t } from '@nextcloud/l10n'
import { findMove, squareName } from '../engine/index.js'
import { themeOf, themeText } from './hintThemes.js'
import { forMover } from './quality.js'

/** @typedef {import('../engine/types.js').EngineState} EngineState */
/** @typedef {import('../engine/types.js').LegalMove} LegalMove */

export const MAX_TIER = 2

/**
 * The move kind in words.
 *
 * @param {LegalMove} move the move
 * @return {string}
 */
function kindText(move) {
	switch (move.type) {
		case 'split': return t('quantumchess', 'a split')
		case 'merge': return move.capture ? t('quantumchess', 'a converging capture') : t('quantumchess', 'a merge')
		case 'measure': return t('quantumchess', 'a Measure')
		default: return move.capture ? t('quantumchess', 'a capture') : t('quantumchess', 'a move')
	}
}

/**
 * The hint of a tier for the best move of an analysis.
 *
 * @param {EngineState} state position
 * @param {object|null} analysis Analysis of the position
 * @param {number} tier 1 or 2
 * @return {{text: string, highlights: object[], arrows: object[]}|null}
 */
export function hintFor(state, analysis, tier) {
	const best = analysis?.best?.[0]
	const move = best ? findMove(state, best.code) : null
	if (!move || tier < 1) {
		return null
	}
	const theme = themeOf(state, move.code)
	const highlights = move.from.map((square) => ({ square, kind: 'hint' }))
	if (tier === 1) {
		return { text: themeText(theme), highlights, arrows: [], theme }
	}
	const pct = Math.round(forMover(best.E, state.turn) * 100)
	const text = t('quantumchess', 'Idea: {kind} to {square}. Your winning chances after it: about {pct} %.', {
		kind: kindText(move),
		square: move.to.map((s) => squareName(s)).join(' / '),
		pct,
	})
	return { text, highlights, arrows: [{ from: move.from[0], to: move.to[0], kind: 'best' }], theme }
}
