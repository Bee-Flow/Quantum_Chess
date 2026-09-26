/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Capablanca chess in its final 10 × 8 form (as Fairy-Stockfish and pychess play it): the orthodox pieces plus the
 * archbishop (bishop + knight) and the chancellor (rook + knight), set up R N A B Q K B C N R from file a to j. The
 * king castles three squares, to i1 or c1, with the rook landing next to it; pawns double-step from their start rank,
 * take en passant and promote to any of the six pieces. Capture the king to win. Castling and en passant are certain
 * moves (never rolled), as in every variant. The core's classic end rules apply unchanged (the `escapeRule`,
 * `bareKingsDraw` and `drawsWait` defaults of a two-sided variant): a king that cannot escape loses, bare kings draw,
 * and those draws wait while the king can be taken for certain. The player-facing rules are in docs/variants.md.
 */

import { t } from '@nextcloud/l10n'
import {
	BISHOP_DIRS,
	castlingMoves,
	clearEnPassant,
	KNIGHT_JUMPS,
	orthodoxAfterMove,
	orthodoxTypes,
	pawnExtras,
	ROOK_DIRS,
	standardBoard,
	standardSetup,
	unifyCastling,
} from './core/orthodox.js'
import { whiteBlack } from './core/orthodoxVariant.js'
import { defineVariant } from './core/variant.js'

/** Both back ranks from file a (Black mirrors White file by file). */
export const BACK = 'rnabqkbcnr'

/** The promotion choices, in the order of the promotion box. */
export const PROMOTE_TO = Object.freeze(['q', 'c', 'a', 'r', 'b', 'n'])

/**
 * Piece values in centipawns for the computer player: H. G. Muller's values for Capablanca chess, measured in
 * computer self-play (his bishop-pair bonus is part of `evaluate`). The king's value never matters.
 */
export const VALUES = Object.freeze({ k: 400, q: 950, c: 900, a: 875, r: 500, b: 350, n: 300, p: 100 })

/** The computer's bonus for bishops on both square colours (Muller). */
export const BISHOP_PAIR = 50

// White plays up the board; a1 is dark, so each player has a light square in the right-hand corner.
const board = standardBoard(10, 8)
const topo = board.topology
const { fileOf, rankOf } = board

/** Centrality of every square: 0 in the corners up to 14 on e4, f4, e5 and f5. */
const CENTRE = new Array(topo.size).fill(0)
/** The square colour of every square: 0 dark, 1 light. */
const COLOUR = new Array(topo.size).fill(0)
for (let sq = 0; sq < topo.size; sq++) {
	CENTRE[sq] = 9 - Math.abs(2 * fileOf(sq) - 9) + 7 - Math.abs(2 * rankOf(sq) - 7)
	COLOUR[sq] = (fileOf(sq) + rankOf(sq)) % 2
}

/** The computer's centipawns per centrality point, by type: the knight's jump gains most from the centre. */
const CENTRE_WEIGHT = Object.freeze({ n: 3, a: 2, c: 1, b: 1 })
/** The computer's centipawns for each rank a pawn has advanced from its start rank, by file (a to j). */
const PAWN_STEP = Object.freeze([1, 1, 2, 3, 4, 4, 3, 2, 1, 1])
/** The computer's cost of each rank the king has left beyond its second rank while enemy heavy pieces remain. */
const KING_STEP = 20
/** The types that make an exposed king dangerous. */
const HEAVY = new Set(['q', 'c', 'a', 'r'])

const types = orthodoxTypes({ lastRank: board.lastRank, promoteTo: [...PROMOTE_TO] })
types.a = {
	name: () => t('quantumchess', 'Archbishop'),
	moves: [{ ride: BISHOP_DIRS }, { leap: KNIGHT_JUMPS }],
	// the pieces it combines: a knight's head on a bishop's base, with the bishop's cross on its neck
	glyph: { sprite: 'n', body: 'b' },
}
types.c = {
	name: () => t('quantumchess', 'Chancellor'),
	moves: [{ ride: ROOK_DIRS }, { leap: KNIGHT_JUMPS }],
	// a knight's head rising from a rook's turret
	glyph: { sprite: 'n', body: 'r' },
}
// orthodoxTypes() builds fresh objects, so these values do not reach the other variants
for (const [id, value] of Object.entries(VALUES)) {
	types[id].value = value
}

/**
 * The computer's positional terms in one world for `side`, own minus enemy: centralised knights, archbishops,
 * chancellors and bishops, advanced pawns (centre pawns more than flank pawns), the bishop pair, and a king that stays
 * near its own back rank while the enemy has a rook or a stronger piece. One pass over the pieces, no move
 * generation.
 *
 * @param {object} w world
 * @param {number} side the side the value is for
 * @return {number} centipawns
 */
export function evaluate(w, side) {
	const score = [0, 0]
	const bishops = [0, 0]
	const heavy = [0, 0]
	const king = [-1, -1]
	for (let id = 0; id < w.sq.length; id++) {
		const sq = w.sq[id]
		if (sq < 0) {
			continue
		}
		const sd = w.sd[id]
		const ty = w.ty[id]
		score[sd] += (CENTRE_WEIGHT[ty] ?? 0) * CENTRE[sq]
		if (ty === 'p') {
			score[sd] += PAWN_STEP[fileOf(sq)] * (sd === 0 ? rankOf(sq) - 1 : 6 - rankOf(sq))
		} else if (ty === 'b') {
			bishops[sd] |= 1 << COLOUR[sq]
		} else if (ty === 'k') {
			king[sd] = sq
		} else if (HEAVY.has(ty)) {
			heavy[sd]++
		}
	}
	for (const sd of [0, 1]) {
		if (bishops[sd] === 3) {
			score[sd] += BISHOP_PAIR
		}
		if (king[sd] >= 0 && heavy[1 - sd] > 0) {
			const out = sd === 0 ? rankOf(king[sd]) : 7 - rankOf(king[sd])
			score[sd] -= KING_STEP * Math.max(0, out - 1)
		}
	}
	return score[side] - score[1 - side]
}

const spec = {
	id: 'capablanca',
	category: 'boards',
	sides: whiteBlack(),
	topology: topo,
	board,
	types,
	rules: () => [
		t(
			'quantumchess',
			'The board is 10 squares wide (files a to j), and each side has two extra pawns and two new pieces.',
		),
		t(
			'quantumchess',
			'The archbishop (A) moves like a bishop or like a knight; the chancellor (C) moves like a rook or like a knight.',
		),
		t(
			'quantumchess',
			'From a to j the back rank is rook, knight, archbishop, bishop, queen, king, bishop, chancellor, knight, rook, so the king starts on f1 (f8 for Black).',
		),
		t(
			'quantumchess',
			'To castle, the king moves three squares towards its rook, to i1 or c1 (i8 or c8 for Black), and the rook lands on the square next to it on the other side (h1 or d1, h8 or d8). As in chess, neither the king nor that rook may have moved before, and every square between them must be empty.',
		),
		t(
			'quantumchess',
			'Pawns move as in chess, with the double step and en passant, and promote to a queen, chancellor, archbishop, rook, bishop or knight.',
		),
		t(
			'quantumchess',
			'The archbishop and the chancellor can split and merge like a queen: their knight jump flies over ghosts, but their slides can be blocked.',
		),
		t(
			'quantumchess',
			'Castling never rolls: a ghost on any square between the king and the rook blocks it, and the right is lost for good as soon as the king or that rook is not 100 % on its starting square. There is no check, so you may castle out of, through or into attack.',
		),
	],
	/**
	 * The start position: both back ranks, both pawn ranks and all four castling rights (king to i or c, rook to h
	 * or d).
	 *
	 * @return {object}
	 */
	setup() {
		return standardSetup(spec, BACK)
	},
	/**
	 * Double steps and en passant, then castling (certain moves with the keys `O-O` and `O-O-O`, played by moving the
	 * king to its destination).
	 *
	 * @param {object} w world
	 * @param {number} side side to move
	 * @return {object[]}
	 */
	extraMoves(w, side) {
		return [
			...pawnExtras(spec, w, side, (s, sq) => rankOf(sq) === (s === 0 ? 1 : 6)),
			...castlingMoves(spec, w, side),
		]
	},
	/**
	 * The en passant square and the castling rights after a move that happened in this world.
	 *
	 * @param {object} next the new world (mutable)
	 * @param {object} m the move
	 */
	afterMove(next, m) {
		orthodoxAfterMove(spec, next, m)
	},
	/**
	 * A world where the action did not take effect (a Missed move, a Measure turn) still ends the one-ply en passant
	 * right, as in `orthodoxSpec()`.
	 *
	 * @param {object} b world
	 * @return {object}
	 */
	applyMiss(b) {
		return clearEnPassant(b)
	},
	/**
	 * A castling right is kept only while every world has it (king and rook 100 % on their squares), as in
	 * `orthodoxSpec()`.
	 *
	 * @param {object[]} bs the worlds of the new state
	 * @return {object[]}
	 */
	unifyWorlds(bs) {
		return unifyCastling(bs)
	},
	evaluate,
}

export default defineVariant(spec)
