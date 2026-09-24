/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The public API of the Quantum Chess rules engine. The normative rules are docs/engine-rules.md.
 *
 * Pure and synchronous: no DOM, no network, no clock, no Math.random. States are plain JSON objects that must be
 * treated as immutable; derived data is cached per state object. The rest of the web app imports the engine only
 * through this module (and the presentation helpers through `ui/index.js`, which this module does not re-export).
 *
 * The exports come in two groups:
 * - the **twin API**, mirrored by lib/Engine/Engine.php and checked byte for byte by the parity fixtures
 *   (tests/fixtures/engine);
 * - **JavaScript-only helpers** for the web app, the computer player, the trainer and the tests.
 */

// ---------------------------------------------------------------------------------------------------------------
// Twin API (mirrored by lib/Engine/Engine.php)
// ---------------------------------------------------------------------------------------------------------------

export {
	BUDGET,
	CASTLING_FLAGS,
	FIFTY_MOVE_PLIES,
	ILLEGAL_REASONS,
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
	T,
	V,
	WIN_REASONS,
} from './constants.js'
export { IllegalMoveError, InvalidStateError, SetupError } from './errors.js'
export { squareIndex, squareName } from './squares.js'
export { positionHash } from './hash.js'
export { gameResult, initialState, parseState, serializeState, validateState } from './state.js'
export { budget, worldCount } from './analysis.js'
export { moveCode, parseMoveCode } from './parser.js'
export { findMove, generateMoves, hasAnyLegalMove, isLegal, legalCodes, whyIllegal } from './legality.js'
export { applyMove, getOutcomes } from './apply.js'
export { kingDanger, kingTrapped } from './danger.js'
export { conditionalView, linkGroups, links, moveRisk, pct, pieceLocations, squareView } from './views.js'
export { moveNotation } from './notation.js'
export { rollDisplay, rollIntervals } from './roll.js'
export { chainNext, chainStart, rollIdentity } from './chain.js'
export { certainFen, setupPosition } from './setup.js'
export { supportKey, supportKeyMirror } from './fairplay.js'
// Implemented in both engines, but not a parity pair: see the header of describe.js.
export { describeForLlm } from './describe.js'

// ---------------------------------------------------------------------------------------------------------------
// JavaScript-only helpers
// ---------------------------------------------------------------------------------------------------------------

export {
	BLACK_KING,
	CASTLING,
	ILLEGAL_REASON_CHECK,
	INITIAL_TYPES,
	START_SQUARES,
	WHITE_KING,
} from './constants.js'
export { EngineArgumentError } from './errors.js'
export { colorOf, fileOf, idOfCode, letterOf, otherColor, rankOf, SQUARE_NAMES } from './squares.js'
export { fnv1a64, positionHashInput } from './hash.js'
export { canonicalCopy, makeState } from './state.js'
export { normaliseCode, stripPromo } from './parser.js'
// Search only: outcome states skip E1b and must never be stored, shown or sent to the server.
export { applyForSearch, outcomesForSearch } from './apply.js'
export { rescaleWeights } from './rescale.js'
export { certainDanger } from './danger.js'
export { decimalOfWeight } from './roll.js'
export { sha256hex } from './sha256.js'
export { parseFen } from './setup.js'
export { checkU, keyForU, randomU, seededRng, uFromRandom } from './rng.js'
