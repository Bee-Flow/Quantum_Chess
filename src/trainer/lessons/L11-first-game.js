/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Lesson 11 (GAME-DESIGN §5.1.2): the graduation game against Wobbles with the Beginner coach. */

import { t } from '../i18n.js'

export default {
	id: 'L11',
	slug: 'first-game',
	order: 11,
	group: 'graduation',
	minutes: 10,
	title: () => t('quantumchess', 'Your first quantum game'),
	goal: () => t('quantumchess', 'Win a full game against Wobbles, with the Beginner coach at your side.'),
	steps: [
		{
			type: 'game',
			level: 1,
			text: [
				() => t('quantumchess', 'Time for a real game from the start position. Wobbles, the friendliest engine, plays Black.'),
				() => t('quantumchess', 'The Beginner coach warns you about threats, grades every move and gives hints on request. Win the game to graduate.'),
			],
		},
	],
}
