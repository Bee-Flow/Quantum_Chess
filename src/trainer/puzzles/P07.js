/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Puzzle P07. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'P07',
	name: () => t('quantumchess', 'Linked Twins'),
	stars: 3,
	type: 'forced',
	side: 'w',
	setup: { fen: 'r5k1/5ppp/3n4/8/8/8/8/1K2R3 w - - 0 1', prelude: ['d6-b5|c8', 'a8-e8'] },
	accepted: ['e1-e8'],
	value: null,
	traps: [],
	nudge: () => t('quantumchess', 'The black rook and knight are linked.'),
	idea: () => t('quantumchess', 'Black\'s rook slid past its own maybe-knight, so rook and knight are linked: rook on e8 exactly when the knight is on b5. Captured: your rook sits on e8. Moved: e8 was empty, the black rook is on a8, and its own knight on c8 blocks its way back. Either way Black cannot escape.'),
}
