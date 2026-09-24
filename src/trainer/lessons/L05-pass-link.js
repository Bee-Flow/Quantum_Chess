/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Lesson 5: sliding past a maybe-occupied square rolls nothing and links the pieces. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'L05',
	order: 5,
	group: 'essentials',
	minutes: 2,
	title: () => t('quantumchess', 'Pass = link'),
	goal: () => t('quantumchess', 'Sliding past a maybe-occupied square rolls nothing and links the pieces. One roll can settle two.'),
	steps: [
		{
			type: 'task',
			setup: { fen: '4k3/8/1n6/8/8/8/8/R3K3 w - - 0 1', prelude: ['b6-a4|c4'] },
			prompt: () => t('quantumchess', 'Move the rook to a8.'),
			success: { moveIs: ['a1-a8'] },
			accepted: ['a1-a8'],
			hints: [() => t('quantumchess', 'The rook slides up the a-file, past the knight\'s ghost.'), { highlight: 'a1' }, { arrow: ['a1', 'a8'] }],
			done: () => t('quantumchess', 'No roll: the rook is 50 % on a1 and 50 % on a8, linked to the knight. Hover or focus the rook on a8: in that possibility the knight is on c4.'),
			fail: () => t('quantumchess', 'Move the rook from a1 to a8.'),
		},
		{
			type: 'watch',
			code: '?a4',
			roll: ['a4', 'c4'],
			narration: () => t('quantumchess', 'Black measures its knight.'),
			branches: {
				a4: () => t('quantumchess', 'The knight is on a4, so it blocked the rook: the rook is certainly on a1.'),
				c4: () => t('quantumchess', 'The knight is on c4, so the path was clear: the rook is certainly on a8. One roll, two pieces settled.'),
			},
		},
		{
			type: 'quiz',
			question: () => t('quantumchess', 'Your budget went from 1/8 to 2/8 although you didn\'t split. Why?'),
			answers: [
				() => t('quantumchess', 'My rook now has two places, depending on the enemy knight.'),
				() => t('quantumchess', 'Every rook move costs budget.'),
				() => t('quantumchess', 'The enemy knight split again.'),
			],
			correct: 0,
			explanation: () => t('quantumchess', 'A link adds a way your pieces could be standing, just like a split.'),
		},
	],
}
