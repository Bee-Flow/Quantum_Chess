/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Puzzle P04. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'P04',
	name: () => t('quantumchess', 'Patience'),
	stars: 2,
	type: 'forced',
	side: 'w',
	setup: { fen: 'R6k/6pp/3N4/8/8/8/8/2K5 w - - 0 1', prelude: ['d6-f7|e8'] },
	accepted: ['e8-c7', 'e8-d6', 'e8-f6', 'e8-d6|c7', 'e8-f6|c7', 'e8-d6|f6', 'f7|e8-d6'],
	value: null,
	traps: [
		{ code: 'a8-h8', value: 50, text: () => t('quantumchess', 'The knight may stand on e8 and block your rook: 50 %.') },
		{ code: 'f7-h8', value: 50, text: () => t('quantumchess', 'A 50 % shot.') },
		{ code: 'a8-e8', value: 50, text: () => t('quantumchess', 'A 50 % shot.') },
		{ code: 'e8-g7', value: 50, text: () => t('quantumchess', 'A 50 % shot.') },
		{ code: '?f7', value: 50, text: () => t('quantumchess', 'A 50 % measurement.') },
	],
	nudge: () => t('quantumchess', 'What stops your rook from reaching h8?'),
	idea: () => t('quantumchess', 'Where the knight is on e8 it blocks your own rook. Move that part to an empty square off the eighth rank (or merge both parts on d6) and Black cannot escape.'),
}
