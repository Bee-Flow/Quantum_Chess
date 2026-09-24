/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Piece-square tables of the static evaluation and the passed-pawn bonus, in centipawns for the piece's owner.
 *
 * Each table is written as a board seen from White: eight numbers per row, rank 8 first, file a on the left.
 * `sides()` turns a table into one lookup per colour, indexed by square (a1 = 0); Black's lookup is White's mirrored
 * across the middle of the board.
 */

/* eslint-disable @stylistic/exp-list-style -- 8×8 board tables, one rank per row */

/** Pawns: advance, and keep the pawns in front of a castled king. */
const PAWN_PST = [
	0, 0, 0, 0, 0, 0, 0, 0,
	50, 50, 50, 50, 50, 50, 50, 50,
	10, 10, 20, 30, 30, 20, 10, 10,
	5, 5, 10, 25, 25, 10, 5, 5,
	0, 0, 0, 20, 20, 0, 0, 0,
	5, -5, -10, 0, 0, -10, -5, 5,
	5, 10, 10, -20, -20, 10, 10, 5,
	0, 0, 0, 0, 0, 0, 0, 0,
]

/** Knights: centralise; a knight on the rim is dim. */
const KNIGHT_PST = [
	-50, -40, -30, -30, -30, -30, -40, -50,
	-40, -20, 0, 0, 0, 0, -20, -40,
	-30, 0, 10, 15, 15, 10, 0, -30,
	-30, 5, 15, 20, 20, 15, 5, -30,
	-30, 0, 15, 20, 20, 15, 0, -30,
	-30, 5, 10, 15, 15, 10, 5, -30,
	-40, -20, 0, 5, 5, 0, -20, -40,
	-50, -40, -30, -30, -30, -30, -40, -50,
]

/** Bishops: long diagonals, away from the corners. */
const BISHOP_PST = [
	-20, -10, -10, -10, -10, -10, -10, -20,
	-10, 0, 0, 0, 0, 0, 0, -10,
	-10, 0, 5, 10, 10, 5, 0, -10,
	-10, 5, 5, 10, 10, 5, 5, -10,
	-10, 0, 10, 10, 10, 10, 0, -10,
	-10, 10, 10, 10, 10, 10, 10, -10,
	-10, 5, 0, 0, 0, 0, 5, -10,
	-20, -10, -10, -10, -10, -10, -10, -20,
]

/** Rooks: the seventh rank and the centre files of the back rank. */
const ROOK_PST = [
	0, 0, 0, 0, 0, 0, 0, 0,
	5, 10, 10, 10, 10, 10, 10, 5,
	-5, 0, 0, 0, 0, 0, 0, -5,
	-5, 0, 0, 0, 0, 0, 0, -5,
	-5, 0, 0, 0, 0, 0, 0, -5,
	-5, 0, 0, 0, 0, 0, 0, -5,
	-5, 0, 0, 0, 0, 0, 0, -5,
	0, 0, 0, 5, 5, 0, 0, 0,
]

/** Queens: mildly centralised. */
const QUEEN_PST = [
	-20, -10, -10, -5, -5, -10, -10, -20,
	-10, 0, 0, 0, 0, 0, 0, -10,
	-10, 0, 5, 5, 5, 5, 0, -10,
	-5, 0, 5, 5, 5, 5, 0, -5,
	0, 0, 5, 5, 5, 5, 0, -5,
	-10, 5, 5, 5, 5, 5, 0, -10,
	-10, 0, 5, 0, 0, 0, 0, -10,
	-20, -10, -10, -5, -5, -10, -10, -20,
]

/** Kings in the middlegame: stay castled behind the pawns. */
const KING_MG_PST = [
	-30, -40, -40, -50, -50, -40, -40, -30,
	-30, -40, -40, -50, -50, -40, -40, -30,
	-30, -40, -40, -50, -50, -40, -40, -30,
	-30, -40, -40, -50, -50, -40, -40, -30,
	-20, -30, -30, -40, -40, -30, -30, -20,
	-10, -20, -20, -20, -20, -20, -20, -10,
	20, 20, 0, 0, 0, 0, 20, 20,
	20, 30, 10, 0, 0, 10, 30, 20,
]

/** Kings in the endgame: walk to the centre. */
const KING_EG_PST = [
	-50, -40, -30, -20, -20, -30, -40, -50,
	-30, -20, -10, 0, 0, -10, -20, -30,
	-30, -10, 20, 30, 30, 20, -10, -30,
	-30, -10, 30, 40, 40, 30, -10, -30,
	-30, -10, 30, 40, 40, 30, -10, -30,
	-30, -10, 20, 30, 30, 20, -10, -30,
	-30, -30, 0, 0, 0, 0, -30, -30,
	-50, -30, -30, -30, -30, -30, -30, -50,
]

/**
 * Lookups per colour, indexed by square (a1 = 0).
 *
 * @param {number[]} table rank-8-first table
 * @return {Int16Array[]} [white, black]
 */
function sides(table) {
	const w = new Int16Array(64)
	const b = new Int16Array(64)
	for (let s = 0; s < 64; s++) {
		const f = s & 7
		const r = s >> 3
		w[s] = table[(7 - r) * 8 + f]
		b[s] = table[r * 8 + f]
	}
	return [w, b]
}

/** Piece-square values of p, n, b, r and q: `PST[typeIndex][colour][square]` (type index p 0 … q 4, colour 0 White). */
export const PST = [sides(PAWN_PST), sides(KNIGHT_PST), sides(BISHOP_PST), sides(ROOK_PST), sides(QUEEN_PST)]

/** King values in the middlegame: `KING_MG[colour][square]`. */
export const KING_MG = sides(KING_MG_PST)

/** King values in the endgame: `KING_EG[colour][square]`; the evaluation blends the two by game phase. */
export const KING_EG = sides(KING_EG_PST)

/** Bonus of a passed pawn by its rank counted from its own side (index 1 = second rank … 6 = seventh rank). */
export const PASSED = [0, 5, 10, 20, 35, 60, 100, 0]
