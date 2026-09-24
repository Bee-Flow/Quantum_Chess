/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The words for the end of a game: the headline ("White won") and the reason in plain words ("King captured on e8 by a
 * 63% roll"). Used by the result bar, the game-over dialog, the review and the lobby's recent games.
 */

import { t } from '@nextcloud/l10n'
import { T } from '../engine/index.js'
import { formatProbability } from '../engine/ui/index.js'
import { toGameResult } from './gameController.js'

/**
 * Context of the reason sentence.
 *
 * @typedef {object} ReasonContext
 * @property {'w'|'b'|null} [winner] the winning side, null for a draw
 * @property {{w?: string, b?: string}} [names] display names; "White" and "Black" when missing
 * @property {number|null} [captureProbability] chance (0…1) of the roll that captured the king; null when the final
 *   move is not known
 * @property {string|null} [square] square on which the king was captured
 */

/**
 * The reason of a finished game in plain words.
 *
 * @param {string} reason reason code of the rules engine or the server
 * @param {ReasonContext} [context] winner, names and details of the final move
 * @return {string} the sentence, or '' for an unknown reason
 */
export function reasonCopy(reason, { winner = null, names = {}, captureProbability = null, square = null } = {}) {
	const w = names.w ?? t('quantumchess', 'White')
	const b = names.b ?? t('quantumchess', 'Black')
	const winnerName = winner === 'w' ? w : b
	const loserName = winner === 'w' ? b : w
	switch (reason) {
		case 'king_captured':
			if (captureProbability === null) {
				// the final move is not known here (lobby lists): claim nothing about the roll
				return t('quantumchess', 'King captured')
			}
			if (captureProbability < 1) {
				const percent = formatProbability(captureProbability, { format: 'percent', weight: false })
				return square
					? t('quantumchess', 'King captured on {square} by a {percent} roll', { square, percent })
					: t('quantumchess', 'King captured by a {percent} roll', { percent })
			}
			return t('quantumchess', 'King captured for certain')
		case 'king_trapped':
			return t('quantumchess', '{loser}’s king cannot escape: every move would let {winner} capture it', { loser: loserName, winner: winnerName })
		case 'bare_kings':
			return t('quantumchess', 'Only the kings are left')
		case 'repetition':
			return t('quantumchess', 'The same position appeared three times')
		case 'fifty_moves':
			return t('quantumchess', '50 moves without a capture or pawn move')
		case 'no_moves':
			return t('quantumchess', 'No legal moves')
		case 'max_ply':
			return t('quantumchess', 'The game reached its length limit')
		case 'resignation':
			return t('quantumchess', '{loser} resigned', { loser: loserName })
		case 'agreement':
			return t('quantumchess', 'Draw by agreement')
		case 'timeout':
			return t('quantumchess', '{loser} ran out of time', { loser: loserName })
		case 'timeout_draw':
			return t('quantumchess', 'Time ran out, but only a king was left to win with')
		case 'aborted':
			return t('quantumchess', 'The game was aborted')
		case 'abandoned':
			return t('quantumchess', 'The game was abandoned')
		case 'player_deleted':
			return t('quantumchess', 'A player’s account was deleted')
		default:
			return ''
	}
}

/**
 * The reasonCopy() context of a game won by capturing the king: the chance of the final move's capture and its target
 * square (a quiet capture of a solid king is certain).
 *
 * @param {{code: string, measurement?: object|null}|null|undefined} last the final move (code and measurement record)
 * @return {{captureProbability: number, square: string|null}|{}}
 */
export function kingCaptureContext(last) {
	if (!last?.code) {
		return {}
	}
	const m = last.measurement
	const outcome = m?.outcomes?.find((o) => o.key === m.key)
	const square = last.code.includes('-') ? last.code.split('-').pop().replace(/[=@].*/, '') : null
	return { captureProbability: outcome ? outcome.weight / T : 1, square }
}

/**
 * The result headline and reason ("White won", "King captured for certain").
 *
 * @param {string} result '1-0' | '0-1' | '1/2-1/2' | '*'
 * @param {string} reason reason code
 * @param {{w?: string, b?: string}} [names] display names
 * @param {ReasonContext} [extra] details of the final move, passed to reasonCopy()
 * @return {{title: string, reason: string, winner: 'w'|'b'|null}}
 */
export function resultText(result, reason, names = {}, extra = {}) {
	const winner = toGameResult({ result, reason }).winner
	const w = names.w ?? t('quantumchess', 'White')
	const b = names.b ?? t('quantumchess', 'Black')
	let title
	if (reason === 'aborted' || reason === 'abandoned') {
		title = t('quantumchess', 'Game aborted')
	} else if (winner === null) {
		title = t('quantumchess', 'Draw')
	} else {
		title = t('quantumchess', '{name} won', { name: winner === 'w' ? w : b })
	}
	return { title, reason: reasonCopy(reason, { winner, names: { w, b }, ...extra }), winner }
}
