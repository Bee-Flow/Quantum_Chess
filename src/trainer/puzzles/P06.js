/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Puzzle P06. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'P06',
	name: () => t('quantumchess', 'Promote with Certainty'),
	stars: 2,
	type: 'forced',
	side: 'w',
	setup: { fen: '5b1k/4P1pp/3n4/8/8/8/2K5/8 w - - 0 1', prelude: ['d6-b5|e8'] },
	accepted: ['e7-f8=Q', 'e7-f8=R'],
	value: null,
	traps: [
		{ code: 'e7-e8=Q', value: null, text: () => t(
			'quantumchess',
			'The knight may be on e8, so the push rolls. Even when it moves, the bishop on f8 shields the king.',
		) },
	],
	nudge: () => t('quantumchess', 'Which promotion square holds a solid piece?'),
	idea: () => t(
		'quantumchess',
		'Capturing the solid bishop promotes for certain, and the new piece covers g8 and h8.',
	),
}
