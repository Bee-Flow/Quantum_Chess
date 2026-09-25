/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The public API of the chess variants: the catalogue, the lazy loader of the rules modules, the quantum layer and the
 * computer player. The rest of the web app imports the variants only through this module.
 *
 * Every variant plugs into one quantum layer (core/quantum.js), so all of them share the rules of Quantum Chess:
 * split, merge, measure, "land = roll, pass = link" and the budget. docs/variants.md describes them for players.
 */

export { CATALOG, catalogEntry, categoryName } from './catalog.js'
export { CATEGORIES, optionValues, sideName } from './core/variant.js'
export {
	applyMove,
	applyOutcome,
	boardView,
	branches,
	BUDGET,
	budget,
	certainlyEmpty,
	handView,
	hasLegalMove,
	isLegal,
	legalMoves,
	MAX_LOCATIONS,
	MAX_WORLDS,
	mergesFrom,
	newGame,
	ordinaryMoves,
	outcomes,
	ownPieceAt,
	parseCode,
	pieceLocations,
	reachable,
	royalDanger,
	splitCode,
	splitsFrom,
	splitTargets,
	squareView,
	T,
} from './core/quantum.js'
export { chooseMove, LEVELS } from './core/ai.js'

/** Loaders of the rules modules, one chunk per variant. */
const LOADERS = {
	raumschach: () => import('./raumschach.js'),
	trid: () => import('./trid.js'),
	hyper4d: () => import('./hyper4d.js'),
	multiverse: () => import('./multiverse.js'),
	kriegspiel: () => import('./kriegspiel.js'),
	darkchess: () => import('./darkchess.js'),
	chess960: () => import('./chess960.js'),
	atomic: () => import('./atomic.js'),
	crazyhouse: () => import('./crazyhouse.js'),
	bughouse: () => import('./bughouse.js'),
	antichess: () => import('./antichess.js'),
	koth: () => import('./koth.js'),
	threecheck: () => import('./threecheck.js'),
	horde: () => import('./horde.js'),
	hexagonal: () => import('./hexagonal.js'),
	fourplayer: () => import('./fourplayer.js'),
	capablanca: () => import('./capablanca.js'),
	shogi: () => import('./shogi.js'),
	xiangqi: () => import('./xiangqi.js'),
	makruk: () => import('./makruk.js'),
}

/** The ids of every variant. */
export const VARIANT_IDS = Object.freeze(Object.keys(LOADERS))

/**
 * Load the rules module of a variant.
 *
 * @param {string} id variant id
 * @return {Promise<object>} the variant
 */
export async function loadVariant(id) {
	const load = LOADERS[id]
	if (!load) {
		throw new Error('unknown variant ' + id)
	}
	return (await load()).default
}
