/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The shared JSDoc types of the rules engine. This module has no runtime code; other modules refer to its types with
 * `@typedef {import('./types.js').EngineState} EngineState`.
 *
 * PHP twin: the psalm-type aliases of lib/Engine/Engine.php. Section numbers (§) refer to docs/engine-rules.md.
 */

/**
 * One world (§2.4): a board of 64 characters (`.` for empty, `A`–`P` White ids 0–15, `a`–`p` Black ids 16–31) and its
 * integer weight. The weights of a state sum to T.
 *
 * @typedef {[string, number]} World
 */

/**
 * The result of a finished game (§6).
 *
 * @typedef {object} GameResult
 * @property {'1-0'|'0-1'|'1/2-1/2'} result the score
 * @property {string} reason one of `RESULT_REASONS`
 */

/**
 * An engine state (§2.5), a plain JSON object. States are never mutated: every move creates a new one.
 *
 * @typedef {object} EngineState
 * @property {number} v rules version
 * @property {string} types piece type of every id, 32 letters of `kqrbnp`
 * @property {World[]} worlds the possible boards, in canonical order
 * @property {'w'|'b'} turn side to move
 * @property {string} castling the castling flags (a subset of `KQkq` in that order) or `-`
 * @property {string} ep the en-passant target square or `-`
 * @property {number} halfmove plies since the last capture or pawn move
 * @property {number} fullmove move number
 * @property {number} ply plies played since the start
 * @property {number[]} captured captured piece ids, in capture order
 * @property {string[]} history position hashes since the last capture or pawn move, the current one last
 * @property {GameResult|null} result the result, or null while the game runs
 */

/**
 * The result of `validateState`.
 *
 * @typedef {{ok: true, state: EngineState}|{ok: false, error: string, message: string}} ValidationResult
 */

/**
 * A move object (§4.1). Squares are indices 0–63 (a1 = 0, h8 = 63).
 *
 * @typedef {object} MoveObject
 * @property {'standard'|'split'|'merge'|'measure'} type move type
 * @property {number[]} from source square(s): two for a merge
 * @property {number[]} to target square(s): two for a split, none for a Measure
 * @property {'q'|'r'|'b'|'n'|null} [promo] promotion piece of a pawn reaching its last rank
 */

/**
 * One outcome of a move and its integer weight.
 *
 * @typedef {object} Outcome
 * @property {string} key `miss`, `move` or `capture`, or the square name of a Measure outcome
 * @property {number} weight weight on the T scale
 */

/**
 * A legal move (§4.10), as `generateMoves` and `findMove` return it. The objects are shared per state: treat them as
 * read-only.
 *
 * @typedef {object} LegalMove
 * @property {'standard'|'split'|'merge'|'measure'} type move type
 * @property {number[]} from source square(s)
 * @property {number[]} to target square(s)
 * @property {'q'|'r'|'b'|'n'} [promo] promotion piece
 * @property {string} code canonical code
 * @property {number} piece moving piece id
 * @property {'certain'|'quantum'|'rolled'} resolution how the move resolves
 * @property {boolean} measured the move is rolled
 * @property {boolean} fallback rolled only because the mover's budget would overflow
 * @property {boolean} capture some outcome captures
 * @property {number} happenWeight total weight of the worlds in which the move happens
 * @property {Outcome[]} outcomes the outcomes in key order
 * @property {number} successProbability `happenWeight / T`
 */

/**
 * Any accepted move input: a code string (parsed leniently), a move object or a LegalMove.
 *
 * @typedef {string|MoveObject|LegalMove} MoveInput
 */

/**
 * The measurement record of a rolled move (§5.5).
 *
 * @typedef {object} Measurement
 * @property {string} key the outcome that happened
 * @property {number|null} u the roll, or null when the outcome was forced
 * @property {number|null} captured the captured piece id, or null
 * @property {Outcome[]} outcomes every outcome of the move
 * @property {boolean} fallback rolled only because the mover's budget would overflow
 */

/**
 * The result of `applyMove`.
 *
 * @typedef {object} ApplyResult
 * @property {EngineState} state the state after the move
 * @property {LegalMove} move the move that was played
 * @property {Measurement|null} measurement the measurement record of a rolled move, otherwise null
 */

/**
 * One possible result of a move (§5.6), as `getOutcomes` returns it.
 *
 * @typedef {object} OutcomeState
 * @property {string} key the outcome key, or `certain` / `quantum` for a move that is not rolled
 * @property {number} weight weight of the outcome (T for a move that is not rolled)
 * @property {number} probability `weight / T`
 * @property {boolean} happened the move happened (the key is not `miss`)
 * @property {number|null} captured the captured piece id, or null
 * @property {EngineState} state the state after the move with this outcome
 */

/**
 * @typedef {import('./analysis.js').Analysis} Analysis
 */

export {}
