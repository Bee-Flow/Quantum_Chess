/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Puzzle P02. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'P02',
	name: () => t('quantumchess', 'Heal and Strike'),
	stars: 1,
	type: 'forced',
	side: 'w',
	setup: { fen: '7k/6pp/8/8/8/3Q4/8/1K6 w - - 0 1', prelude: ['d3-d1|d5'] },
	accepted: ['d1|d5-d8'],
	value: null,
	traps: [
		{ code: 'd1-d8', value: null, text: () => t('quantumchess', 'Only half of the queen moves: a 50 % shot.') },
		{ code: 'd5-d8', value: null, text: () => t('quantumchess', 'Only half of the queen moves: a 50 % shot.') },
	],
	nudge: () => t('quantumchess', 'Both parts of your queen can reach the back rank.'),
	idea: () => t('quantumchess', 'The merge makes the queen solid on d8. Every black move then leaves the king capturable for certain, so Black\'s king cannot escape.'),
}
