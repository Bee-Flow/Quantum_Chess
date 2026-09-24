/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Lesson 10: a defensive split when every classical escape is covered. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'L10',
	order: 10,
	group: 'deeper',
	minutes: 2,
	title: () => t('quantumchess', 'Split to survive'),
	goal: () => t('quantumchess', 'Split a piece when every classical escape is covered. Splits cost budget.'),
	steps: [
		{
			type: 'task',
			setup: { fen: '7k/K7/8/8/p3b3/8/8/N6r w - - 0 1' },
			prompt: () => t('quantumchess', 'The rook attacks your knight and both escape squares are covered. Save it as often as you can.'),
			success: { moveIs: ['a1-c2|b3'] },
			accepted: ['a1-c2|b3'],
			hints: [() => t('quantumchess', 'Black can capture only one square per move.'), { highlight: 'a1' }, { arrow: ['a1', 'c2'] }],
			reply: { engine: 4 },
			failReply: { engine: 4 },
			done: () => t('quantumchess', 'Black can hit only one part, so its best capture chance is 50 %, against 100 % for every other move.'),
			fail: () => t('quantumchess', 'The knight was lost for certain. Split it so that Black can hit only one part.'),
		},
		{
			type: 'explain',
			text: [
				() => t('quantumchess', 'Each 50/50 ghost doubles your budget. A board full of ghosts is hard to read for you too, and strong engines exploit that.'),
			],
		},
	],
}
