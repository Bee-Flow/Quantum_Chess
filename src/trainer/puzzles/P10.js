/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Puzzle P10 (GAME-DESIGN §5.2.2). */

import { t } from '../i18n.js'

export default {
	id: 'P10',
	name: () => t('quantumchess', 'Corner Escape'),
	stars: 2,
	type: 'material',
	side: 'w',
	horizon: 1,
	setup: { fen: 'r6N/7p/8/8/2b5/k7/8/3K4 w - - 0 1' },
	accepted: ['h8-g6|f7'],
	value: 50,
	traps: [],
	nudge: () => t('quantumchess', 'Every single escape square is covered, but by different pieces.'),
	idea: () => t('quantumchess', 'The rook attacks h8; g6 is covered by the pawn and f7 by the bishop, but each by a different piece, so Black can hit only one part. Every other move loses the knight.'),
}
