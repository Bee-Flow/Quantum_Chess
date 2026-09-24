/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Lesson 6: use the preview; a ghost attacking a ghost has three results. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'L06',
	order: 6,
	group: 'deeper',
	minutes: 3,
	title: () => t('quantumchess', 'Reading the odds'),
	goal: () => t('quantumchess', 'Use the preview. A ghost attacking a ghost has three results, and landing on your own maybe-piece rolls too.'),
	steps: [
		{
			type: 'quiz',
			setup: { fen: '4k3/8/3b4/8/8/8/8/4K1N1 w - - 0 1', prelude: ['g1-f3|h3', 'd6-e5|c7'] },
			question: () => t('quantumchess', 'The preview of f3-e5 shows Missed 50 %, Moved 25 %, Captured 25 %. Why is Missed 50 %?'),
			answers: [
				() => t('quantumchess', 'My knight is only on f3 half the time.'),
				() => t('quantumchess', 'The bishop is on e5 half the time.'),
				() => t('quantumchess', 'Knights always miss half the time.'),
			],
			correct: 0,
			explanation: () => t('quantumchess', 'Where your knight is on h3, the move from f3 cannot happen: that half is Missed. The other half splits between Moved and Captured.'),
		},
		{
			type: 'task',
			prompt: () => t('quantumchess', 'Play f3-e5 and watch the three results.'),
			success: { moveIs: ['f3-e5'] },
			accepted: ['f3-e5'],
			hints: [() => t('quantumchess', 'Move the f3 part of the knight to e5.'), { highlight: 'f3' }, { arrow: ['f3', 'e5'] }],
			roll: ['move', 'capture', 'miss'],
			branches: {
				move: () => t('quantumchess', 'Moved: your knight was on f3 and e5 was empty. The bishop is certainly on c7.'),
				capture: () => t('quantumchess', 'Captured: your knight was on f3 and the bishop was on e5.'),
				miss: () => t('quantumchess', 'Missed: your knight was on h3, so nothing happened on e5.'),
			},
			fail: () => t('quantumchess', 'Play the knight from f3 to e5.'),
		},
		{
			type: 'task',
			setup: { fen: '6k1/3q1ppp/8/8/7N/1B6/8/K1R5 w - - 0 1', prelude: ['d7-f5|c6', 'f5-e6|g6'] },
			prompt: () => t('quantumchess', 'The queen is 50 % on c6, 25 % on e6 and 25 % on g6. Find the move with the best chance to capture it.'),
			success: { moveIs: ['c1-c6'] },
			accepted: ['c1-c6'],
			hints: [() => t('quantumchess', 'Aim at the biggest share of the queen.'), { highlight: 'c1' }, { arrow: ['c1', 'c6'] }],
			roll: ['move', 'capture'],
			branches: {
				move: () => t('quantumchess', 'Moved: the queen is now 50 % on e6 and 50 % on g6. The remaining possibilities are rescaled.'),
				capture: () => t('quantumchess', 'Captured: the queen was on c6.'),
			},
			fail: () => t('quantumchess', 'That shot had only 25 %. Which square holds the biggest share of the queen?'),
		},
		{
			type: 'task',
			setup: { fen: '4k3/8/8/8/8/5N2/8/2B1K3 w - - 0 1', prelude: ['f3-e5|g5'] },
			prompt: () => t('quantumchess', 'Move the bishop to g5.'),
			success: { moveIs: ['c1-g5'] },
			accepted: ['c1-g5'],
			hints: [() => t('quantumchess', 'Part of your own knight is on g5.'), { highlight: 'c1' }, { arrow: ['c1', 'g5'] }],
			roll: ['miss', 'move'],
			branches: {
				miss: () => t('quantumchess', 'Missed: your own knight was on g5, so the bishop stayed home. Landing on your own maybe-piece is a roll too.'),
				move: () => t('quantumchess', 'Moved: g5 was empty, and your knight is certainly on e5.'),
			},
			fail: () => t('quantumchess', 'Move the bishop from c1 to g5.'),
		},
	],
}
