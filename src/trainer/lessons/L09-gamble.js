/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Lesson 9: the chance of success is not everything; probe with your cheapest piece. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'L09',
	order: 9,
	group: 'deeper',
	minutes: 2,
	title: () => t('quantumchess', 'Choose your gamble'),
	goal: () => t('quantumchess', 'Ask what happens if the roll goes against you, and probe with your cheapest piece.'),
	steps: [
		{
			type: 'task',
			setup: { fen: '6k1/5ppp/8/2q5/4PN2/7P/5PP1/6K1 w - - 0 1', prelude: ['c5-d5|h5'] },
			prompt: () => t('quantumchess', 'The queen is 50 % on d5 and 50 % on h5. Go for it, and think about what happens if the roll goes against you.'),
			success: { moveIs: ['e4-d5', 'f4-d5'] },
			accepted: ['e4-d5', 'f4-d5'],
			hints: [
				() => t('quantumchess', 'All shots at the queen are 50 %. Which one is safe when it fails?'),
				{ highlight: 'e4' },
				{ arrow: ['e4', 'd5'] },
			],
			roll: ['miss', 'move', 'capture'],
			failReply: { engine: 3 },
			branches: {
				miss: () => t(
					'quantumchess',
					'Missed: the pawn stays safe on e4, and the queen is certainly on h5. A good gamble: nothing lost.',
				),
				move: () => t(
					'quantumchess',
					'Moved: your knight lands on d5, protected by your pawn, and the queen is certainly on h5.',
				),
				capture: () => t('quantumchess', 'Captured: the queen is gone.'),
			},
			fail: () => t('quantumchess', 'All three are 50 % shots. The difference is what happens when the roll goes against you: a knight that moves to h5 is lost to the queen, which is then certainly on d5.'),
		},
	],
}
