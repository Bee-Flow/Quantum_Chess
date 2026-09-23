/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Puzzle P03 (GAME-DESIGN §5.2.2). */

import { t } from '../i18n.js'

export default {
	id: 'P03',
	name: () => t('quantumchess', 'Which Knight?'),
	stars: 2,
	type: 'forced',
	side: 'w',
	horizon: 1,
	setup: { fen: '7k/6pr/8/4N3/2B5/8/8/2K5 w - - 0 1', prelude: ['e5-g6|f7'] },
	accepted: ['g6|f7-h8', 'f7-h8'],
	value: null,
	traps: [
		{ code: 'g6-h8', value: 50, text: () => t('quantumchess', '50 %: a miss leaves the f7 knight blocking your bishop.') },
		{ code: 'c4-f7', value: 50, text: () => t('quantumchess', 'A 50 % shot.') },
		{ code: '?g6', value: 50, text: () => t('quantumchess', 'A 50 % measurement.') },
	],
	nudge: () => t('quantumchess', 'Both knight parts attack the same square.'),
	idea: () => t('quantumchess', 'Both parts attack h8, so the merge captures for certain. f7-h8 is also certain: if it misses, the knight is revealed on g6, still attacking h8, and your bishop\'s diagonal to g8 opens.'),
}
