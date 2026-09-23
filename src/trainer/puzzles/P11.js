/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Puzzle P11 (GAME-DESIGN §5.2.2). */

import { t } from '../i18n.js'

export default {
	id: 'P11',
	name: () => t('quantumchess', 'Quantum Back-Rank Defence'),
	stars: 3,
	type: 'survive',
	side: 'b',
	horizon: 1,
	setup: { fen: 'R5k1/4rppp/8/8/8/1K6/8/8 b - - 0 1' },
	accepted: ['e7-e1|e8', 'e7-e2|e8', 'e7-e3|e8', 'e7-e4|e8', 'e7-e5|e8', 'e7-e6|e8', 'e7-b7|e8'],
	value: 50,
	traps: [
		{ code: 'e7-e8', value: 100, text: () => t('quantumchess', 'The classical block loses for certain: a8-e8 captures and your king cannot escape.') },
	],
	nudge: () => t('quantumchess', 'Blocking with the whole rook is not enough.'),
	idea: () => t('quantumchess', 'Split instead, with one part on e8 and the other where it can fight back: on the e-file it can recapture on e8, and on b7 it threatens White\'s king on b3.'),
}
