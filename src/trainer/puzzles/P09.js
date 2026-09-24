/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Puzzle P09. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'P09',
	name: () => t('quantumchess', 'Don\'t Get Greedy'),
	stars: 2,
	type: 'survive',
	side: 'w',
	setup: { fen: '3r3k/6pp/8/6B1/4q3/8/8/4K3 w - - 0 1', prelude: ['e4-b4|h4'] },
	accepted: ['e1-e2', 'e1-f1'],
	value: 0,
	traps: [
		{ code: 'g5-d8', value: 100, text: () => t('quantumchess', 'You win a rook and lose the king: 100 %.') },
		{ code: 'e1-d1', value: 100, text: () => t('quantumchess', 'The king walks onto the rook\'s file: 100 %.') },
		{ code: 'g5-d2', value: 50, text: () => t('quantumchess', 'Leaves 50 %.') },
		{ code: 'e1-f2', value: 50, text: () => t('quantumchess', 'Leaves 50 %.') },
		{ code: 'g5-h4', value: 50, text: () => t('quantumchess', 'Leaves 50 %.') },
	],
	nudge: () => t('quantumchess', 'Your king ring is red. Deal with it first.'),
	idea: () => t('quantumchess', 'Your ring is red: both queen parts attack e1, so b4|h4-e1 would be a certain converging capture. Step out of both lines.'),
}
