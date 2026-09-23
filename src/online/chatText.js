/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Chat keys (SPEC §7.2 ChatDTO, GAME-DESIGN §7.11): quick phrases and system lines are stored as keys and shown in
 * each reader's language. Text messages are always rendered as plain text by the chat component.
 */

import { t } from '@nextcloud/l10n'

export const PHRASE_KEYS = ['good_luck', 'nice_split', 'well_played', 'oops', 'thanks', 'good_game']

/**
 * The words of a quick phrase.
 *
 * @param {string} key phrase key
 * @return {string}
 */
export function phraseText(key) {
	switch (key) {
		case 'good_luck': return t('quantumchess', 'Good luck!')
		case 'nice_split': return t('quantumchess', 'Nice split!')
		case 'well_played': return t('quantumchess', 'Well played')
		case 'oops': return t('quantumchess', 'Oops')
		case 'thanks': return t('quantumchess', 'Thanks for the game')
		case 'good_game': return t('quantumchess', 'Good game')
		default: return key
	}
}

/**
 * The words of a system line.
 *
 * @param {object} message ChatDTO of kind system
 * @param {{w: string, b: string}} names display names by colour
 * @return {string}
 */
export function systemText(message, names) {
	const color = message.params?.color
	const name = color === 'w' || color === 'b' ? names[color] : ''
	switch (message.message) {
		case 'draw_offered': return t('quantumchess', '{name} offered a draw', { name })
		case 'draw_declined': return t('quantumchess', 'The draw offer was declined')
		case 'draw_accepted': return t('quantumchess', 'Draw agreed')
		case 'rematch_offered': return t('quantumchess', '{name} wants a rematch', { name })
		case 'aborted': return t('quantumchess', '{name} aborted the game', { name })
		case 'resigned': return t('quantumchess', '{name} resigned', { name })
		case 'timeout': return t('quantumchess', 'Time ran out')
		default: return message.message
	}
}
