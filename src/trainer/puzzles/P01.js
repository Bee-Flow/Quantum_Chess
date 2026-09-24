/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Puzzle P01. */

import { t } from '@nextcloud/l10n'

export default {
	id: 'P01',
	name: () => t('quantumchess', 'First Things First'),
	stars: 1,
	type: 'forced',
	side: 'w',
	setup: { fen: '7k/5p1p/6p1/8/8/8/1B3PPP/3q2K1 w - - 0 1' },
	accepted: ['b2-h8'],
	value: null,
	traps: [
		{ code: 'g1-h1', value: null, text: () => t(
			'quantumchess',
			'Any defence lets d1-g1 capture your king. There is no check: capture first.',
		) },
	],
	nudge: () => t('quantumchess', 'Your king is in danger, but whose move is it?'),
	idea: () => t(
		'quantumchess',
		'Black\'s queen could take your king (your ring is red), but there is no check: capture first.',
	),
}
