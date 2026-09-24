/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Puzzle P05. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'P05',
	name: () => t('quantumchess', 'Hit or Miss'),
	stars: 2,
	type: 'forced',
	side: 'w',
	setup: { fen: 'R6k/1n4pp/8/8/8/8/2K5/8 w - - 0 1', prelude: ['b7-c5|d8'] },
	accepted: ['a8-d8'],
	value: null,
	traps: [
		{ code: 'a8-h8', value: 50, text: () => t('quantumchess', 'A 50 % shot: the knight may be on d8, in your rook\'s way.') },
	],
	nudge: () => t('quantumchess', 'Where could the black knight block your rook?'),
	idea: () => t('quantumchess', 'Attack the blocker\'s part. Captured: the knight is gone. Moved: the rook lands on d8 and the knight is certainly on c5, too far to help. Either way Black cannot escape.'),
}
