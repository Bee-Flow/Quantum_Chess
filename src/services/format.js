/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Display formatting shared by the app views (SPEC §14.3.2, GAME-DESIGN §3.9 reason copy).
 */

import { n, t } from '@nextcloud/l10n'
import { T } from '../engine/constants.js'
import { formatProbability } from '../engine/ui/index.js'

/**
 * A weight (0…T) or probability (0…1) as a locale percentage.
 *
 * @param {number} weightOrProbability value
 * @return {string}
 */
export function formatPercent(weightOrProbability) {
	return formatProbability(weightOrProbability, { format: 'percent', weight: weightOrProbability > 1 })
}

/**
 * Time left until a deadline ("18 h left", "3 days left", "less than a minute left").
 *
 * @param {number|null} deadlineAt Unix seconds
 * @param {number} now Unix seconds
 * @return {string}
 */
export function formatDeadline(deadlineAt, now = Date.now() / 1000) {
	if (!deadlineAt) {
		return ''
	}
	const s = Math.max(0, deadlineAt - now)
	if (s < 60) {
		return t('quantumchess', 'less than a minute left')
	}
	if (s < 3600) {
		const m = Math.floor(s / 60)
		return n('quantumchess', '%n min left', '%n min left', m)
	}
	if (s < 2 * 86400) {
		const h = Math.floor(s / 3600)
		return n('quantumchess', '%n h left', '%n h left', h)
	}
	const d = Math.floor(s / 86400)
	return n('quantumchess', '%n day left', '%n days left', d)
}

/**
 * A relative time ("2 min ago").
 *
 * @param {number} ts Unix seconds
 * @param {number} [now] Unix seconds
 * @return {string}
 */
export function formatRelative(ts, now = Date.now() / 1000) {
	const s = Math.max(0, Math.round(now - ts))
	if (s < 45) {
		return t('quantumchess', 'just now')
	}
	if (s < 3600) {
		return n('quantumchess', '%n min ago', '%n min ago', Math.max(1, Math.round(s / 60)))
	}
	if (s < 86400) {
		return n('quantumchess', '%n h ago', '%n h ago', Math.round(s / 3600))
	}
	return n('quantumchess', '%n day ago', '%n days ago', Math.round(s / 86400))
}

/**
 * A rating with the provisional marker.
 *
 * @param {number|null} rating rating
 * @param {boolean} provisional provisional flag
 * @return {string}
 */
export function formatRating(rating, provisional = false) {
	if (rating === null || rating === undefined) {
		return ''
	}
	return String(Math.round(rating)) + (provisional ? '?' : '')
}

/**
 * The winner colour of a result string.
 *
 * @param {string|null} result '1-0' | '0-1' | '1/2-1/2'
 * @return {'w'|'b'|null}
 */
export function winnerOf(result) {
	return result === '1-0' ? 'w' : (result === '0-1' ? 'b' : null)
}

/**
 * The reason of a finished game in plain words (GAME-DESIGN §3.9).
 *
 * @param {string} reason engine or server reason
 * @param {object} context {winner: 'w'|'b'|null, names: {w, b}, captureProbability?: number|null, square?: string}
 * @param context.winner
 * @param context.names
 * @param context.captureProbability
 * @param context.square
 * @return {string}
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
				return square
					? t('quantumchess', 'King captured on {square} by a {percent} roll', { square, percent: formatPercent(captureProbability) })
					: t('quantumchess', 'King captured by a {percent} roll', { percent: formatPercent(captureProbability) })
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
 * @param {{w: string, b: string}} names display names
 * @param {object} [extra] passed to reasonCopy
 * @return {{title: string, reason: string, winner: 'w'|'b'|null}}
 */
export function resultText(result, reason, names = {}, extra = {}) {
	const winner = winnerOf(result)
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
