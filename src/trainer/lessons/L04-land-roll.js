/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Lesson 4: landing on a square that might hold a piece rolls; the three results. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'L04',
	order: 4,
	group: 'essentials',
	minutes: 2,
	title: () => t('quantumchess', 'Land = roll'),
	goal: () => t(
		'quantumchess',
		'Landing on a square that might hold a piece rolls. Even a miss tells you something.',
	),
	steps: [
		{
			type: 'task',
			setup: { fen: '6k1/4nppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', prelude: ['e7-d5|f5'] },
			prompt: () => t('quantumchess', 'Attack the knight on d5.'),
			success: { moveIs: ['d1-d5'] },
			accepted: ['d1-d5'],
			hints: [
				() => t('quantumchess', 'The rook can reach d5 along the open file.'),
				{ highlight: 'd1' },
				{ arrow: ['d1', 'd5'] },
			],
			roll: ['capture', 'move'],
			branches: {
				capture: () => t('quantumchess', 'Captured: the knight was on d5.'),
				move: () => t('quantumchess', 'Moved: d5 was empty, so your rook still landed there, and the knight is certainly on f5. Your rook\'s path was certainly clear, so it moved either way.'),
			},
			fail: () => t('quantumchess', 'Go for the knight on d5 with your rook.'),
		},
		{
			type: 'task',
			setup: { fen: '4k3/8/2b5/8/4P3/8/8/4K3 w - - 0 1', prelude: ['c6-d5|b7'] },
			prompt: () => t('quantumchess', 'Use your pawn to find out whether the bishop is on d5.'),
			success: { moveIs: ['e4-d5'] },
			accepted: ['e4-d5'],
			hints: [() => t('quantumchess', 'Pawns capture diagonally.'), { highlight: 'e4' }, { arrow: ['e4', 'd5'] }],
			roll: ['miss', 'capture'],
			branches: {
				miss: () => t(
					'quantumchess',
					'Nothing moved, but now you know: the bishop is on b7. Knowledge is worth a move.',
				),
				capture: () => t('quantumchess', 'Captured: the bishop was on d5.'),
			},
			fail: () => t('quantumchess', 'Try a pawn capture on d5.'),
		},
		{
			type: 'quiz',
			question: () => t('quantumchess', 'Your rook lands on a square where the enemy queen is 25 %, and its path is certainly clear. What happens in the other 75 %?'),
			answers: [
				() => t('quantumchess', 'Missed: the rook stays where it was.'),
				() => t('quantumchess', 'Moved: the rook lands there, and the queen is certainly somewhere else.'),
				() => t('quantumchess', 'The rook becomes a ghost.'),
			],
			correct: 1,
			explanation: () => t(
				'quantumchess',
				'A solid piece with a certainly clear path never wastes its move: it captures or it lands.',
			),
		},
	],
}
