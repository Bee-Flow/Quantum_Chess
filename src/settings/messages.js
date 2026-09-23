/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Translated texts for the settings pages: upstream codes (SPEC §10.8), source availability reasons (§7.4.7) and
 * the list of data sent to an AI provider (GAME-DESIGN §8.5).
 */
import { t } from '@nextcloud/l10n'

/**
 * @param {string|null} code upstream code or url_not_allowed
 * @return {string}
 */
export function connectionError(code) {
	switch (code) {
		case 'invalid_key':
			return t('quantumchess', 'The API key was not accepted.')
		case 'model_not_found':
			return t('quantumchess', 'The server does not know this model or has no model list.')
		case 'rate_limited':
			return t('quantumchess', 'The provider is rate limiting requests. Try again in a moment.')
		case 'quota_exceeded':
			return t('quantumchess', 'The quota of this account is used up.')
		case 'timeout':
			return t('quantumchess', 'The server took too long to answer.')
		case 'unreachable':
			return t('quantumchess', 'The server could not be reached.')
		case 'refused':
			return t('quantumchess', 'The provider refused the request.')
		case 'url_not_allowed':
			return t('quantumchess', 'This address is not allowed. Local servers need an entry in the administrator\'s allow-list, other servers need https://.')
		default:
			return t('quantumchess', 'The server sent an answer that could not be read.')
	}
}

/**
 * @param {string|null} reason availability reason of a source
 * @return {string}
 */
export function sourceReason(reason) {
	switch (reason) {
		case 'disabled':
			return t('quantumchess', 'Turned off by your administrator')
		case 'not_allowed':
			return t('quantumchess', 'Not available for your account')
		case 'no_provider':
			return t('quantumchess', 'No text generation provider is installed')
		case 'not_configured':
			return t('quantumchess', 'Not set up yet')
		case 'no_key':
			return t('quantumchess', 'An API key is needed')
		case 'cap_reached':
			return t('quantumchess', 'Daily limit reached')
		default:
			return ''
	}
}

/**
 * What is and is not sent to an AI provider.
 *
 * @return {{sent: string[], notSent: string}}
 */
export function privacyList() {
	return {
		sent: [
			t('quantumchess', 'the position as text and the moves played so far'),
			t('quantumchess', 'the legal moves and the built-in engine\'s suggestions'),
			t('quantumchess', 'the chosen AI personality and your language'),
			t('quantumchess', 'what you type to the AI opponent or the coach'),
		],
		notSent: t('quantumchess', 'Never sent: your user name, display name, e-mail address, your opponent\'s identity, chat messages with other players or the address of this Nextcloud.'),
	}
}

/**
 * The message of an API error.
 *
 * @param {Error|object} error ApiError or other error
 * @return {string}
 */
export function errorText(error) {
	if (error?.code === 'url_not_allowed') {
		return error.message || connectionError('url_not_allowed')
	}
	if (error?.code === 'upstream') {
		return connectionError(error.data?.upstream ?? null)
	}
	return error?.message || t('quantumchess', 'The settings could not be saved.')
}
