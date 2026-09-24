/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Lesson 8: the budget limit, the budget-full roll, and Measure as a deliberate move. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'L08',
	order: 8,
	group: 'deeper',
	minutes: 3,
	title: () => t('quantumchess', 'Measure and the budget'),
	goal: () => t('quantumchess', 'When your budget is full, moves roll instead. Measure frees it.'),
	steps: [
		{
			type: 'explain',
			text: [
				() => t('quantumchess', 'Your budget counts the different ways your own pieces could be standing. Three 50/50 ghosts make 2 × 2 × 2 = 8: full.'),
				() => t('quantumchess', 'Your opponent can never fill your budget.'),
			],
		},
		{
			type: 'quiz',
			setup: {
				fen: '4k3/8/6n1/8/8/8/8/1NBQK2R w - - 0 1',
				prelude: ['b1-a3|c3', 'c1-d2|e3', 'd1-b3|a4', 'g6-f4|h4'],
			},
			question: () => t('quantumchess', 'Split is greyed out, and h1-h8 says "Roll (budget full)". Why?'),
			answers: [
				() => t(
					'quantumchess',
					'My budget is 8/8, so anything that would add a way to stand is rolled instead.',
				),
				() => t('quantumchess', 'The black knight blocks the h-file.'),
				() => t('quantumchess', 'Rooks cannot split.'),
			],
			correct: 0,
			explanation: () => t(
				'quantumchess',
				'Three ghosts fill the budget. A move that would create a fourth one is rolled instead.',
			),
		},
		{
			type: 'task',
			prompt: () => t('quantumchess', 'Free up budget: measure one of your ghosts.'),
			modes: ['measure'],
			success: { moveType: 'measure' },
			accepted: ['?a3', '?d2', '?b3'],
			hints: [() => t('quantumchess', 'Choose Measure in the move switcher.'), { highlight: 'a3' }],
			done: () => t('quantumchess', 'The ghost is settled and the pips dropped to 4/8.'),
			fail: () => t('quantumchess', 'Measure one of your own ghosts.'),
		},
	],
}
