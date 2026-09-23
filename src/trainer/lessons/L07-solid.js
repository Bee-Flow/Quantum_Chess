/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Lesson 7 (GAME-DESIGN §5.1.2): pawns and kings are solid; promotion is certain when the capture is. */

import { t } from '../i18n.js'

export default {
	id: 'L07',
	slug: 'solid',
	order: 7,
	group: 'deeper',
	minutes: 3,
	title: () => t('quantumchess', 'Pawns and kings are solid'),
	goal: () => t('quantumchess', 'Pawns and kings never split. A promotion is certain when the capture is.'),
	steps: [
		{
			type: 'task',
			setup: { fen: '6k1/8/2n5/8/4P3/8/8/6K1 w - - 0 1', prelude: ['c6-b4|e5'] },
			prompt: () => t('quantumchess', 'Push the pawn to e5.'),
			success: { moveIs: ['e4-e5'] },
			accepted: ['e4-e5'],
			hints: [() => t('quantumchess', 'Part of the knight is on e5.'), { highlight: 'e4' }, { arrow: ['e4', 'e5'] }],
			roll: ['miss', 'move'],
			branches: {
				miss: () => t('quantumchess', 'Missed: a pawn never captures straight ahead, so the knight was on e5 and your pawn stayed.'),
				move: () => t('quantumchess', 'Moved: e5 was empty, and the knight is certainly on b4.'),
			},
			fail: () => t('quantumchess', 'Push the e-pawn one square.'),
		},
		{
			type: 'task',
			setup: { fen: 'n1r3k1/1P6/8/8/8/8/8/R5K1 w - - 0 1', prelude: ['c8-b8|d8'] },
			prompt: () => t('quantumchess', 'Promote with 100 % certainty.'),
			success: { moveIs: ['b7-a8=Q', 'b7-a8=R', 'b7-a8=B', 'b7-a8=N'] },
			accepted: ['b7-a8=Q', 'b7-a8=R', 'b7-a8=B', 'b7-a8=N'],
			hints: [() => t('quantumchess', 'Pushing to b8 is a roll.'), () => t('quantumchess', 'Capturing a solid piece is certain.'), { arrow: ['b7', 'a8'] }],
			done: () => t('quantumchess', 'The knight on a8 was solid, so the capture and the promotion were certain.'),
			fail: () => t('quantumchess', 'That was a roll: part of the rook might stand on b8. Capture the solid knight instead.'),
		},
		{
			type: 'explain',
			text: [
				() => t('quantumchess', 'Kings never split either. A king step onto a square that might hold a piece is a roll: it captures or it lands.'),
				() => t('quantumchess', 'Castling needs king and rook solid on their home squares and every square between certainly empty. You may castle through attack.'),
			],
		},
		{
			type: 'quiz',
			question: () => t('quantumchess', 'Your h1 rook split and merged back home. Can you castle short?'),
			answers: [
				() => t('quantumchess', 'Yes, the rook is solid on h1 again.'),
				() => t('quantumchess', 'No: the right was lost when the rook left h1.'),
			],
			correct: 1,
			explanation: () => t('quantumchess', 'As in chess, a rook that moved loses its castling right, even if it comes back.'),
		},
	],
}
