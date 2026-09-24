/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The canned lines and the level labels of the computer player's five levels. The level names are proper names and are
 * not translated; the labels and lines are. `useLocalGame` shows a line at most once every five moves, and the user can
 * switch them off (`preferences.engineLines`).
 */

import { t } from '@nextcloud/l10n'

/** Lines per `LEVELS[].cannedLine` key. */
export const ENGINE_LINES = Object.freeze({
	wobbles: [
		() => t('quantumchess', 'Wheee, I’m in two places!'),
		() => t('quantumchess', 'Ooh, what does this button do?'),
		() => t('quantumchess', 'Wobble wobble!'),
	],
	dice: [
		() => t('quantumchess', 'Let’s roll!'),
		() => t('quantumchess', 'Feeling lucky!'),
		() => t('quantumchess', 'Come on, big number!'),
	],
	quark: [
		() => t('quantumchess', 'Solid.'),
		() => t('quantumchess', 'Sound move.'),
		() => t('quantumchess', 'Development first.'),
	],
	tangle: [
		() => t('quantumchess', 'Everything is connected.'),
		() => t('quantumchess', 'Pull one thread…'),
		() => t('quantumchess', 'Linked, as planned.'),
	],
	observer: [
		() => t('quantumchess', 'I see every possibility.'),
		() => t('quantumchess', 'Observed.'),
		() => t('quantumchess', 'All outcomes considered.'),
	],
})

/**
 * The translated level label ("Beginner").
 *
 * @param {string} label beginner | casual | club | strong | expert
 * @return {string}
 */
export function levelLabel(label) {
	switch (label) {
		case 'beginner': return t('quantumchess', 'Beginner')
		case 'casual': return t('quantumchess', 'Casual')
		case 'club': return t('quantumchess', 'Club')
		case 'strong': return t('quantumchess', 'Strong')
		case 'expert': return t('quantumchess', 'Expert')
		default: return label
	}
}

/**
 * A random line of a level.
 *
 * @param {string} key LEVELS[].cannedLine
 * @param {() => number} [rng] random source (flavour only)
 * @return {string}
 */
export function engineLine(key, rng = Math.random) {
	const lines = ENGINE_LINES[key] ?? []
	return lines.length ? lines[Math.floor(rng() * lines.length) % lines.length]() : ''
}
