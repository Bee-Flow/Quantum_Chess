/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Lesson 2: make a split, read the badges, meet the budget pips. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'L02',
	order: 2,
	group: 'essentials',
	minutes: 2,
	title: () => t('quantumchess', 'Split'),
	goal: () => t('quantumchess', 'Make a split, read the badges and meet the budget pips.'),
	steps: [
		{
			type: 'task',
			setup: { fen: '4k3/3ppp2/8/8/8/8/3PPP2/4K1N1 w - - 0 1' },
			prompt: () => t('quantumchess', 'Split the knight to f3 and h3. Choose Split in the move switcher first.'),
			modes: ['split'],
			success: { moveIs: ['g1-f3|h3'] },
			accepted: ['g1-f3|h3'],
			hints: [
				() => t('quantumchess', 'Choose Split, then tap the knight and both target squares.'),
				{ highlight: 'g1' },
				{ arrow: ['g1', 'f3'] },
			],
			reply: { scripted: 'e7-e6' },
			done: () => t('quantumchess', 'The knight is now 50 % on f3 and 50 % on h3. The badges show each share.'),
			fail: () => t('quantumchess', 'Split the knight to f3 and h3.'),
		},
		{
			type: 'task',
			prompt: () => t('quantumchess', 'Split the f3 part again, to any two squares.'),
			modes: ['split'],
			success: { all: [{ moveType: 'split' }, { fromSquare: 'f3' }] },
			hints: [
				() => t('quantumchess', 'Only the part on f3 moves. Split targets must be certainly empty.'),
				{ highlight: 'f3' },
				{ arrow: ['f3', 'e5'] },
			],
			reply: { scripted: 'd7-d6' },
			done: () => t(
				'quantumchess',
				'The knight is now 50 % on h3 and 25 % on each new square. The budget pips show 3/8.',
			),
			fail: () => t('quantumchess', 'Split the part on f3.'),
		},
		{
			type: 'quiz',
			question: () => t('quantumchess', 'How likely is the knight on h3 now?'),
			answers: [() => '25 %', () => '50 %', () => '100 %'],
			correct: 1,
			explanation: () => t('quantumchess', 'Splitting f3 only divided the f3 share.'),
		},
		{
			type: 'explain',
			text: [
				() => t('quantumchess', 'Split targets must be certainly empty. Kings and pawns never split.'),
				() => t('quantumchess', 'Your budget counts the ways your pieces could be standing: each 50/50 ghost doubles it, and 8 is the limit.'),
			],
		},
	],
}
