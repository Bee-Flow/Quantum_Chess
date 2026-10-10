/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The catalogue of chess variants: names, one-line summaries and categories, cheap to import on every page. The rules
 * modules themselves are loaded on demand with `loadVariant()` (index.js). Player-facing rules: docs/variants.md.
 */

import { t } from '@nextcloud/l10n'

/**
 * @typedef {object} CatalogEntry
 * @property {string} id variant id (route and storage key)
 * @property {string} category dimensions, uncertainty, rules, boards or regional
 * @property {number} players number of players
 * @property {() => string} name translated name
 * @property {() => string} summary translated one-line summary
 */

/** @type {CatalogEntry[]} */
export const CATALOG = [
	{
		id: 'raumschach',
		category: 'dimensions',
		players: 2,
		name: () => t('quantumchess', '3D chess (Raumschach)'),
		summary: () => t(
			'quantumchess',
			'Five boards stacked into a 5 × 5 × 5 cube, with the unicorn flying through space.',
		),
	},
	{
		id: 'trid',
		category: 'dimensions',
		players: 2,
		name: () => t('quantumchess', 'Tri-Dimensional chess'),
		summary: () => t(
			'quantumchess',
			'Three main levels and four attack boards, as seen on the starship Enterprise.',
		),
	},
	{
		id: 'hyper4d',
		category: 'dimensions',
		players: 2,
		name: () => t('quantumchess', '4D chess'),
		summary: () => t('quantumchess', 'A 4 × 4 grid of 4 × 4 boards: every piece gains two extra directions.'),
	},
	{
		id: 'multiverse',
		category: 'dimensions',
		players: 2,
		name: () => t('quantumchess', 'Multiverse chess (5D)'),
		summary: () => t(
			'quantumchess',
			'Travel back in time and create new timelines; capture a king on any of them.',
		),
	},
	{
		id: 'kriegspiel',
		category: 'uncertainty',
		players: 2,
		name: () => t('quantumchess', 'Kriegspiel'),
		summary: () => t('quantumchess', 'You never see the enemy pieces; the umpire only says what happened.'),
	},
	{
		id: 'darkchess',
		category: 'uncertainty',
		players: 2,
		name: () => t('quantumchess', 'Fog of war'),
		summary: () => t('quantumchess', 'You only see the squares your pieces can reach.'),
	},
	{
		id: 'chess960',
		category: 'rules',
		players: 2,
		name: () => t('quantumchess', 'Chess960'),
		summary: () => t('quantumchess', 'Fischer Random: the back rank is shuffled into one of 960 start positions.'),
	},
	{
		id: 'atomic',
		category: 'rules',
		players: 2,
		name: () => t('quantumchess', 'Atomic'),
		summary: () => t('quantumchess', 'Every capture explodes and removes the pieces around it.'),
	},
	{
		id: 'crazyhouse',
		category: 'rules',
		players: 2,
		name: () => t('quantumchess', 'Crazyhouse'),
		summary: () => t('quantumchess', 'Captured pieces change sides and can be dropped back onto the board.'),
	},
	{
		id: 'bughouse',
		category: 'rules',
		players: 4,
		name: () => t('quantumchess', 'Bughouse'),
		summary: () => t('quantumchess', 'Two boards, two teams: what you capture, your partner may drop.'),
	},
	{
		id: 'antichess',
		category: 'rules',
		players: 2,
		name: () => t('quantumchess', 'Antichess'),
		summary: () => t('quantumchess', 'Capturing is compulsory and whoever loses all their pieces wins.'),
	},
	{
		id: 'koth',
		category: 'rules',
		players: 2,
		name: () => t('quantumchess', 'King of the Hill'),
		summary: () => t('quantumchess', 'Bring your king to one of the four centre squares to win.'),
	},
	{
		id: 'threecheck',
		category: 'rules',
		players: 2,
		name: () => t('quantumchess', 'Three-check'),
		summary: () => t('quantumchess', 'Put the enemy king in check three times to win.'),
	},
	{
		id: 'horde',
		category: 'rules',
		players: 2,
		name: () => t('quantumchess', 'Horde'),
		summary: () => t('quantumchess', 'White has 36 pawns against the complete black army.'),
	},
	{
		id: 'hexagonal',
		category: 'boards',
		players: 2,
		name: () => t('quantumchess', 'Hexagonal chess'),
		summary: () => t('quantumchess', 'Gliński\'s chess on 91 hexagons, with three bishops each.'),
	},
	{
		id: 'fourplayer',
		category: 'boards',
		players: 4,
		name: () => t('quantumchess', 'Four-player chess'),
		summary: () => t('quantumchess', 'Four armies on a cross-shaped board; the last king standing wins.'),
	},
	{
		id: 'capablanca',
		category: 'boards',
		players: 2,
		name: () => t('quantumchess', 'Capablanca chess'),
		summary: () => t('quantumchess', 'A 10 × 8 board with the archbishop and the chancellor.'),
	},
	{
		id: 'shogi',
		category: 'regional',
		players: 2,
		name: () => t('quantumchess', 'Shogi'),
		summary: () => t(
			'quantumchess',
			'Japanese chess: captured pieces join your army and promote in the enemy camp.',
		),
	},
	{
		id: 'xiangqi',
		category: 'regional',
		players: 2,
		name: () => t('quantumchess', 'Xiangqi'),
		summary: () => t('quantumchess', 'Chinese chess with a river, two palaces and the cannon.'),
	},
	{
		id: 'makruk',
		category: 'regional',
		players: 2,
		name: () => t('quantumchess', 'Makruk'),
		summary: () => t('quantumchess', 'Thai chess, close to the ancient form of the game.'),
	},
]

/**
 * The translated name of a category.
 *
 * @param {string} id category id
 * @return {string}
 */
export function categoryName(id) {
	switch (id) {
		case 'dimensions':
			return t('quantumchess', 'Other dimensions')
		case 'uncertainty':
			return t('quantumchess', 'Hidden information')
		case 'rules':
			return t('quantumchess', 'Different rules')
		case 'boards':
			return t('quantumchess', 'Different boards and more players')
		default:
			return t('quantumchess', 'Regional relatives')
	}
}

/**
 * The catalogue entry of a variant, or null.
 *
 * @param {string} id variant id
 * @return {CatalogEntry|null}
 */
export function catalogEntry(id) {
	return CATALOG.find((e) => e.id === id) ?? null
}
