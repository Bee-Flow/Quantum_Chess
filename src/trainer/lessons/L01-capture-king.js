/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Lesson 1 (GAME-DESIGN §5.1.2): no check; capturing the king wins; the king ring; "cannot escape". */

import { t } from '../i18n.js'

export default {
	id: 'L01',
	slug: 'capture-king',
	order: 1,
	group: 'essentials',
	minutes: 2,
	title: () => t('quantumchess', 'Capture the king'),
	goal: () => t('quantumchess', 'There is no check: capturing the king wins.'),
	steps: [
		{
			type: 'explain',
			setup: { fen: '3k4/pp6/8/8/8/8/5PPP/3R2K1 w - - 0 1' },
			text: [
				() => t('quantumchess', 'Pieces move as in chess. There is no check: take the enemy king and you win.'),
				() => t('quantumchess', 'The ring around a king shows the chance it could be captured right now. It turns red at 100 %.'),
			],
		},
		{
			type: 'task',
			setup: { fen: '3k4/pp6/8/8/8/8/5PPP/3R2K1 w - - 0 1' },
			prompt: () => t('quantumchess', 'Capture the black king.'),
			success: { moveIs: ['d1-d8'] },
			accepted: ['d1-d8'],
			hints: [() => t('quantumchess', 'Which piece can travel the open d-file?'), { highlight: 'd1' }, { arrow: ['d1', 'd8'] }],
			done: () => t('quantumchess', 'The king is captured for certain: you win.'),
			fail: () => t('quantumchess', 'The king is still on the board. Look along the open file.'),
		},
		{
			type: 'task',
			setup: { fen: '4k3/8/8/8/8/8/4BPPP/r5K1 w - - 0 1' },
			prompt: () => t('quantumchess', 'The ring on your king shows 100 %: the black rook can take it. Make your king safe.'),
			success: { kingRisk: 0 },
			accepted: ['e2-d1', 'e2-f1', 'e2-d1|f1'],
			hints: [() => t('quantumchess', 'Something has to stand between the rook and your king.'), { highlight: 'e2' }, { arrow: ['e2', 'f1'] }],
			failReply: { engine: 3 },
			done: () => t('quantumchess', 'Safe: the bishop blocks the rook. (Splitting it to d1 and f1 works too: both parts stand in the rook\'s way. A trick for later.)'),
			fail: () => t('quantumchess', 'The rook captured your king. Put a piece in its way.'),
		},
		{
			type: 'task',
			setup: { fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1' },
			prompt: () => t('quantumchess', 'Win in one move.'),
			success: { gameWon: true },
			accepted: ['a1-a8'],
			hints: [() => t('quantumchess', 'The black king has nowhere to go.'), { highlight: 'a1' }, { arrow: ['a1', 'a8'] }],
			done: () => t('quantumchess', 'Every black move now leaves the king capturable for certain, so the game ends at once: Black\'s king cannot escape.'),
			fail: () => t('quantumchess', 'Black can still defend. Look for a move after which every black move leaves the king capturable.'),
		},
		{
			type: 'explain',
			setup: { fen: '6k1/3n1ppp/8/8/8/8/8/R3K3 w - - 0 1' },
			arrows: [['a1', 'a8'], ['d7', 'b8'], ['d7', 'f8']],
			text: [
				() => t('quantumchess', 'With a black knight on d7 the same move would not win at once: the knight could block on b8 or f8, so the game would go on.'),
			],
		},
	],
}
