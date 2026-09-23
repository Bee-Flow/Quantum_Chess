/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Quantum Chess rules engine (JavaScript twin of lib/Engine). Normative rules: docs/ENGINE-RULES.md.
 *
 * Pure and synchronous: no DOM, no network, no clock, no Math.random. States are plain JSON objects that must be
 * treated as immutable; derived data is cached per state object.
 */

export {
	BLACK_KING,
	BUDGET,
	CASTLING,
	CASTLING_FLAGS,
	FIFTY_MOVE_PLIES,
	ILLEGAL_REASON_CHECK,
	ILLEGAL_REASONS,
	INITIAL_TYPES,
	LINK_THRESHOLD,
	MAX_LOCATIONS,
	MAX_PLY,
	MAX_WORLDS,
	OUTCOME_KEYS,
	PIECE_TYPES,
	PROMOTION_TYPES,
	REPETITION_COUNT,
	RESULT_REASONS,
	SETUP_ERRORS,
	START_HASH,
	START_JSON,
	START_SQUARES,
	T,
	V,
	WHITE_KING,
	WIN_REASONS,
} from './constants.js'
export { EngineArgumentError, IllegalMoveError, InvalidStateError, SetupError } from './errors.js'
export {
	colorOf,
	fileOf,
	idOfCode,
	letterOf,
	otherColor,
	rankOf,
	SQUARE_NAMES,
	squareIndex,
	squareName,
} from './squares.js'
export { fnv1a64, positionHash, positionHashInput } from './hash.js'
export {
	canonicalCopy,
	gameResult,
	initialState,
	makeState,
	parseState,
	serializeState,
	validateState,
} from './state.js'
export { budget, worldCount } from './analysis.js'
export { moveCode, normaliseCode, parseMoveCode, stripPromo } from './parser.js'
export { findMove, generateMoves, hasAnyLegalMove, isLegal, legalCodes, whyIllegal } from './legality.js'
export { applyForSearch, applyMove, getOutcomes, outcomesForSearch } from './apply.js'
export { rescaleWeights } from './rescale.js'
export { certainDanger, kingDanger, kingTrapped } from './danger.js'
export { conditionalView, linkGroups, links, moveRisk, pct, pieceLocations, squareView } from './views.js'
export { moveNotation } from './notation.js'
export { decimalOfWeight, rollDisplay, rollIntervals } from './roll.js'
export { sha256hex } from './sha256.js'
export { chainNext, chainStart, rollIdentity } from './chain.js'
export { certainFen, parseFen, setupPosition } from './setup.js'
export { checkU, keyForU, randomU, seededRng, uFromRandom } from './rng.js'
export { describeForLlm } from './describe.js'
export { supportKey, supportKeyMirror } from './fairplay.js'
