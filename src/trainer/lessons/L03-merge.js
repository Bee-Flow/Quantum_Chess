/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Lesson 3 (GAME-DESIGN §5.1.2): merge onto a square both parts reach; merge to safety; the converging capture. */

import { t } from '../i18n.js'

export default {
	id: 'L03',
	slug: 'merge',
	order: 3,
	group: 'essentials',
	minutes: 2,
	title: () => t('quantumchess', 'Merge and converging capture'),
	goal: () => t('quantumchess', 'Bring a piece together, merge to safety and capture for certain with a merge.'),
	steps: [
		{
			type: 'task',
			setup: { fen: '4k3/8/8/8/8/8/PPP5/1N2K3 w - - 0 1', prelude: ['b1-a3|c3'] },
			prompt: () => t('quantumchess', 'Bring the knight together. Choose Merge in the move switcher.'),
			modes: ['merge'],
			success: { moveIs: ['a3|c3-b1', 'a3|c3-b5'] },
			accepted: ['a3|c3-b1', 'a3|c3-b5'],
			hints: [() => t('quantumchess', 'A merge needs a square that both parts can reach.'), { highlight: 'a3' }, { arrow: ['c3', 'b5'] }],
			done: () => t('quantumchess', 'Both parts met on one square: the knight is solid again.'),
			fail: () => t('quantumchess', 'Merge both parts onto one square.'),
		},
		{
			type: 'task',
			setup: { fen: '7k/8/8/5b2/8/8/8/1N5K w - - 0 1', prelude: ['b1-a3|c3'] },
			prompt: () => t('quantumchess', 'Merge where Black can\'t capture it.'),
			modes: ['merge'],
			success: { moveIs: ['a3|c3-b5'] },
			accepted: ['a3|c3-b5'],
			hints: [() => t('quantumchess', 'Which squares does the bishop attack?'), { highlight: 'f5' }, { arrow: ['c3', 'b5'] }],
			reply: { engine: 3 },
			failReply: { scripted: 'f5-b1' },
			done: () => t('quantumchess', 'On b5 the knight is safe: Black\'s best chance to capture it is 0 %.'),
			fail: () => t('quantumchess', 'The bishop captured your knight. Find the square the bishop cannot reach.'),
		},
		{
			type: 'quiz',
			setup: { fen: '7k/8/8/8/8/8/8/3QK3 w - - 0 1', prelude: ['d1-d4|h5'] },
			question: () => t('quantumchess', 'Which move captures the king for certain?'),
			answers: [() => 'h5-h8', () => 'd4-h8', () => 'd4|h5-h8'],
			correct: 2,
			explanation: () => t('quantumchess', 'Both parts attack h8. Each part alone hits only half the time; together they capture for certain.'),
		},
		{
			type: 'task',
			prompt: () => t('quantumchess', 'Now play it: capture the king with both parts of the queen.'),
			modes: ['merge'],
			success: { moveIs: ['d4|h5-h8'] },
			accepted: ['d4|h5-h8'],
			hints: [() => t('quantumchess', 'Choose Merge and use both parts of the queen.'), { highlight: 'd4' }, { arrow: ['d4', 'h8'] }],
			done: () => t('quantumchess', 'A converging capture: no dice at all. Preparation beats dice.'),
			fail: () => t('quantumchess', 'That was only half the queen. Merge both parts onto h8.'),
		},
	],
}
