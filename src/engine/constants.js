/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Rules constants (ENGINE-RULES §1). Changing any of them requires a new rules version.
 */

/** Rules version, stored as `v` in every state. */
export const V = 1

/** The fixed sum of all world weights, 2^24. */
export const T = 16777216

/** Maximum number of distinct own arrangements per side (B(c) ≤ BUDGET). */
export const BUDGET = 8

/** Derived bound on the number of worlds (BUDGET²). Exported for the UI, never checked on its own. */
export const MAX_WORLDS = 64

/** Maximum number of squares a piece may occupy after a split. */
export const MAX_LOCATIONS = 4

/** 50-move rule, in plies. */
export const FIFTY_MOVE_PLIES = 100

/** Threefold repetition. */
export const REPETITION_COUNT = 3

/** Technical game-length cap in plies. */
export const MAX_PLY = 1200

/** Link threshold of `links()` (§8): |T·W(a∧b) − W(a)·W(b)| ≥ 2^36. */
export const LINK_THRESHOLD = 68719476736

/** The six piece types. */
export const PIECE_TYPES = Object.freeze(['k', 'q', 'r', 'b', 'n', 'p'])

/** Promotion pieces in tuple order (p = 1..4 in the §4.10 sort tuple). */
export const PROMOTION_TYPES = Object.freeze(['q', 'r', 'b', 'n'])

/** Initial `types` string (§2.2). */
export const INITIAL_TYPES = 'kqrrbbnnppppppppkqrrbbnnpppppppp'

/** Start square of every id (§2.2). */
export const START_SQUARES = Object.freeze([
	4,
	3,
	0,
	7,
	2,
	5,
	1,
	6,
	8,
	9,
	10,
	11,
	12,
	13,
	14,
	15,
	60,
	59,
	56,
	63,
	58,
	61,
	57,
	62,
	48,
	49,
	50,
	51,
	52,
	53,
	54,
	55,
])

/** King ids. */
export const WHITE_KING = 0
export const BLACK_KING = 16

/** Canonical JSON of the start position (§2.5), a parity test vector. */
export const START_JSON = '{"v":1,"types":"kqrrbbnnppppppppkqrrbbnnpppppppp","worlds":[["CGEBAFHDIJKLMNOP................................ijklmnopcgebafhd",16777216]],"turn":"w","castling":"KQkq","ep":"-","halfmove":0,"fullmove":1,"ply":0,"captured":[],"history":["80c209d9560802c2"],"result":null}'

/** Position hash of the start position. */
export const START_HASH = '80c209d9560802c2'

/**
 * Castling table (§4.6): flag → king id, king from/to, rook id, rook from/to, squares that must be empty.
 */
export const CASTLING = Object.freeze({
	K: Object.freeze({ flag: 'K', king: 0, from: 4, to: 6, rook: 3, rookFrom: 7, rookTo: 5, empty: Object.freeze([5, 6]) }),
	Q: Object.freeze({ flag: 'Q', king: 0, from: 4, to: 2, rook: 2, rookFrom: 0, rookTo: 3, empty: Object.freeze([1, 2, 3]) }),
	k: Object.freeze({ flag: 'k', king: 16, from: 60, to: 62, rook: 19, rookFrom: 63, rookTo: 61, empty: Object.freeze([61, 62]) }),
	q: Object.freeze({ flag: 'q', king: 16, from: 60, to: 58, rook: 18, rookFrom: 56, rookTo: 59, empty: Object.freeze([57, 58, 59]) }),
})

/** Castling flags in canonical order. */
export const CASTLING_FLAGS = Object.freeze(['K', 'Q', 'k', 'q'])

/** Result reasons written by the engine (§6). */
export const RESULT_REASONS = Object.freeze([
	'king_captured',
	'king_trapped',
	'bare_kings',
	'repetition',
	'fifty_moves',
	'max_ply',
	'no_moves',
])

/** Reasons that end in a win for the mover. */
export const WIN_REASONS = Object.freeze(['king_captured', 'king_trapped'])

/** `whyIllegal` reason codes in check order (§4.11). */
export const ILLEGAL_REASONS = Object.freeze([
	'game_over',
	'malformed',
	'no_piece',
	'not_your_piece',
	'piece_mismatch',
	'merge_mismatch',
	'cannot_split',
	'cannot_merge',
	'not_superposed',
	'castle_no_right',
	'castle_blocked',
	'unreachable',
	'promotion_required',
	'promotion_invalid',
	'nothing_to_capture',
	'blocked',
	'own_piece',
	'split_target_occupied',
	'split_blocked',
	'location_cap',
	'budget_full',
	'merge_target_own',
	'merge_part_stuck',
])

/** The check number (§4.11 table) of every reason code. */
export const ILLEGAL_REASON_CHECK = Object.freeze({
	game_over: 1,
	malformed: 2,
	no_piece: 3,
	not_your_piece: 4,
	piece_mismatch: 5,
	merge_mismatch: 6,
	cannot_split: 7,
	cannot_merge: 7,
	not_superposed: 8,
	castle_no_right: 9,
	castle_blocked: 10,
	unreachable: 11,
	promotion_required: 12,
	promotion_invalid: 12,
	nothing_to_capture: 13,
	blocked: 14,
	own_piece: 15,
	split_target_occupied: 16,
	split_blocked: 17,
	location_cap: 18,
	budget_full: 19,
	merge_target_own: 20,
	merge_part_stuck: 21,
})

/** Setup error codes (Appendix A). */
export const SETUP_ERRORS = Object.freeze([
	'bad_fen',
	'king_count',
	'too_many_pieces',
	'prelude_bad_code',
	'prelude_illegal',
	'prelude_needs_outcome',
	'prelude_bad_outcome',
	'prelude_outcome_unused',
	'prelude_king_captured',
	'invalid_state',
])

/** Outcome keys of standard moves and merges, in key order. */
export const OUTCOME_KEYS = Object.freeze(['miss', 'move', 'capture'])
