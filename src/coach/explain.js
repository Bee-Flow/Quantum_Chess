/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The engine's own answer when the AI coach is unavailable (GAME-DESIGN §5.5 "On failure"): the evaluation, the best
 * moves and the templated theme explanation, as Markdown with move codes in backticks.
 */

import { t } from '@nextcloud/l10n'
import { findMove } from '../engine/index.js'
import { forMover } from './quality.js'
import { themeOf, themeText } from './themes.js'

const RAW = { escape: false }

/**
 * @param {object} state position
 * @param {object|null} analysis Analysis of the position
 * @param {'w'|'b'} color the player's colour
 * @return {string} Markdown
 */
export function engineAnswer(state, analysis, color) {
	if (state.result) {
		return t('quantumchess', 'The game is over.')
	}
	const best = (analysis?.best ?? []).filter((b) => findMove(state, b.code))
	if (!best.length) {
		return t('quantumchess', 'The engine has not finished analysing this position yet. Ask again in a moment.')
	}
	const pct = Math.round(forMover(analysis.E, color) * 100)
	const lines = [t('quantumchess', 'Your winning chances: about {pct} %.', { pct })]
	if (state.turn === color) {
		lines.push(t('quantumchess', 'Best move: {move}. {theme}', { move: '`' + best[0].code + '`', theme: themeText(themeOf(state, best[0].code)) }, undefined, RAW))
		if (best.length > 1) {
			lines.push(t('quantumchess', 'Also good: {moves}.', { moves: best.slice(1).map((b) => '`' + b.code + '`').join(', ') }, undefined, RAW))
		}
	} else {
		lines.push(t('quantumchess', 'Your opponent\'s best move: {move}.', { move: '`' + best[0].code + '`' }, undefined, RAW))
	}
	return lines.join('\n\n')
}
