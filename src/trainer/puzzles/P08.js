/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Puzzle P08. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'P08',
	name: () => t('quantumchess', 'Three Ghosts, One Shot'),
	stars: 2,
	type: 'max',
	side: 'w',
	setup: { fen: '7k/7p/6p1/8/8/8/8/Q3K3 w - - 0 1', prelude: ['a1-c3|a8', 'c3-b2|d4'] },
	accepted: ['b2|a8-h8', 'd4|a8-h8'],
	value: 75,
	traps: [
		{ code: 'a8-h8', value: 50, text: () => t('quantumchess', '50 %: only one part of the queen.') },
		{ code: 'b2|d4-h8', value: 50, text: () => t(
			'quantumchess',
			'50 %: these two parts add up to half the queen.',
		) },
		{ code: 'd4-h8', value: 25, text: () => t('quantumchess', '25 %.') },
		{ code: 'b2-h8', value: 25, text: () => t('quantumchess', '25 %.') },
	],
	nudge: () => t('quantumchess', 'A merge adds the chances of the parts it uses.'),
	idea: () => t('quantumchess', 'The queen is 50 % on a8, 25 % on d4 and 25 % on b2, and every part attacks h8. A converging capture adds the chances of the two parts it uses.'),
}
