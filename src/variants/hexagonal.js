/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Gliński's hexagonal chess (1936/1949) on 91 flat-topped hexagons in three shades: files a to l (no j) run straight
 * up, ranks bend in a V at the middle file f. Rooks move through the six sides of a cell, bishops along the six
 * diagonals through its corners (three bishops per side, one per shade), king and queen in all twelve directions, the
 * knight to the twelve nearest cells no queen reaches. Pawns move up their file, capture onto the two forward edge
 * neighbours, double-step from any of their side's pawn starting cells, capture en passant and promote at the far end
 * of their file. No castling. The classic end rules of the core apply: capture the king; a king that cannot escape
 * loses at once, so a classical stalemate or mate ends the game in favour of the side that delivered it, as Gliński
 * scores stalemate; only the two kings left is a draw unless the side to move can take the other king. A side with no
 * move at all loses. The player-facing rules are in docs/variants.md.
 *
 * Squares use "doubled" coordinates (q, h): q is the file relative to f (-5 to 5) and h the height of the cell centre
 * in half cells, with f6 at (0, 0). The mirror between White and Black is (q, h) -> (q, -h), which is the core's
 * default `orient`.
 */

import { t } from '@nextcloud/l10n'
import { clearEnPassant, orthodoxAfterMove, orthodoxTypes, pawnExtras } from './core/orthodox.js'
import { whiteBlack } from './core/orthodoxVariant.js'
import { makeTopology } from './core/topology.js'
import { defineVariant } from './core/variant.js'
import { addPiece, emptyWorld } from './core/world.js'

/** The file letters from White's left: there is no j. */
export const FILES = 'abcdefghikl'

/** The six rook directions, through the sides of a cell: up and down the file, and the four branches of the ranks. */
export const ROOK6 = [[0, 2], [0, -2], [1, 1], [1, -1], [-1, 1], [-1, -1]]

/**
 * The six bishop directions, through the corners of a cell: left, right and four steep lines. A step passes between
 * two cells, which never block it. Every vector keeps h modulo 3, so a bishop never leaves its shade.
 */
export const BISHOP6 = [[2, 0], [-2, 0], [1, 3], [1, -3], [-1, 3], [-1, -3]]

/** The king's steps and the queen's lines: the rook and bishop directions together. */
export const KING12 = [...ROOK6, ...BISHOP6]

/**
 * The knight: two cells along a rook line, then one cell turned 60 degrees (the nearest cells no queen reaches):
 * (±1, ±5), (±2, ±4) and (±3, ±1). Not `symmetric()`, which would also swap the coordinates.
 */
export const KNIGHT12 = [[1, 5], [2, 4], [3, 1]].flatMap(([q, h]) => [[q, h], [q, -h], [-q, h], [-q, -h]])

/** A pawn's geometry for White: one cell up the file, captures onto the upper-left and upper-right neighbours. */
const PAWN = { forward: [0, 2], captures: [[1, 1], [-1, 1]] }

/** Piece values in centipawns (the AlphaZero estimate reported by Coskey; a hex rook is relatively strong). */
export const VALUES = Object.freeze({ k: 400, q: 950, r: 560, b: 330, n: 300, p: 100 })

/** The three cell shades by `h mod 3`: the centre f6 is mid, f1 light, f2 dark. */
const SHADES = ['mid', 'dark', 'light']

/** The cells in index order: file a to l, then rank ascending (a1 = 0, f1 = 40, f6 = 45, f11 = 50, l6 = 90). */
const COORDS = []
for (let q = -5; q <= 5; q++) {
	for (let h = Math.abs(q) - 10; h <= 10 - Math.abs(q); h += 2) {
		COORDS.push([q, h])
	}
}

/**
 * The rank number of a cell: 1 at the bottom of every file.
 *
 * @param {number} q file relative to f
 * @param {number} h height in half cells
 * @return {number}
 */
function rankOf(q, h) {
	return (h + 12 - Math.abs(q)) / 2
}

const R3 = Math.sqrt(3)
/** The x of file a's cell centres: a margin of 0.7 for the rank numbers, plus the cell's circumradius. */
const X0 = 0.7 + 1 / R3

/**
 * The drawing's x of a file's cell centres (columns are √3/2 apart).
 *
 * @param {number} q file relative to f
 * @return {number}
 */
function cellX(q) {
	return X0 + (R3 / 2) * (q + 5)
}

/**
 * The drawing's y of a cell centre (cells in a column are 1 apart; White at the bottom). f6 is the centre of the
 * drawing, so Black's view (turned 180 degrees) puts every cell exactly where its mirror cell was.
 *
 * @param {number} h height in half cells
 * @return {number}
 */
function cellY(h) {
	return 1.15 + (10 - h) / 2
}

/**
 * The coordinate labels as in Wikipedia's diagram: file letters under the bottom cell of every file, rank numbers 1 to
 * 6 beside files a and l, 7 to 11 above the top cells of files b to f and f to k.
 *
 * @return {Array<{x: number, y: number, text: string}>}
 */
function boardLabels() {
	const out = []
	for (let q = -5; q <= 5; q++) {
		out.push({ x: cellX(q), y: cellY(Math.abs(q) - 10) + 0.8, text: FILES[q + 5] })
	}
	for (let n = 1; n <= 6; n++) {
		out.push({ x: cellX(-5) - 0.85, y: cellY(2 * n - 7), text: String(n) })
		out.push({ x: cellX(5) + 0.85, y: cellY(2 * n - 7), text: String(n) })
	}
	for (let n = 7; n <= 11; n++) {
		const q = n - 11
		out.push({ x: cellX(q) - 0.6, y: cellY(10 + q) - 0.55, text: String(n) })
		out.push({ x: cellX(-q) + 0.6, y: cellY(10 + q) - 0.55, text: String(n) })
	}
	return out
}

/** The board: flat-topped hexagons of width 2/√3 and height 1, in horizontal bands of three shades. */
export const topology = makeTopology({
	coords: COORDS,
	name: ([q, h]) => FILES[q + 5] + rankOf(q, h),
	cell: ([q, h]) => ({
		x: cellX(q),
		y: cellY(h),
		w: 2 / R3,
		h: 1,
		shape: 'hex',
		shade: SHADES[((h % 3) + 3) % 3],
	}),
	// the cells span 0.7 to width - 0.7 and 0.65 to height - 0.65, with f6 in the middle (about 11.215 × 12.3)
	layout: { width: 2 * X0 + 5 * R3, height: 12.3, labels: boardLabels() },
})

/**
 * The cell indexes of a list of names.
 *
 * @param {string} list names separated by spaces
 * @return {Set<number>}
 */
function cellSet(list) {
	return new Set(list.split(' ').map((n) => topology.byName(n)))
}

/**
 * The pawn starting cells per side. A pawn on any of its side's starting cells may double-step, also one that got
 * there by capturing (Wikipedia's cell rule).
 */
export const PAWN_START = Object.freeze([
	cellSet('b1 c2 d3 e4 f5 g4 h3 i2 k1'),
	cellSet('b7 c7 d7 e7 f7 g7 h7 i7 k7'),
])

/**
 * Whether a cell is a promotion cell for a side: the last cell of its file (White: a6 b7 c8 d9 e10 f11 g10 h9 i8 k7
 * l6; Black: rank 1).
 *
 * @param {number} side side index
 * @param {number} sq cell
 * @return {boolean}
 */
export function promotes(side, sq) {
	const [q, h] = COORDS[sq]
	return side === 0 ? h + Math.abs(q) === 10 : h - Math.abs(q) === -10
}

/**
 * The hexagonal distance between two cells: the number of king steps along the rook lines.
 *
 * @param {number} a cell
 * @param {number} b cell
 * @return {number}
 */
export function distance(a, b) {
	const dq = Math.abs(COORDS[a][0] - COORDS[b][0])
	const dh = Math.abs(COORDS[a][1] - COORDS[b][1])
	return dq + Math.max(0, (dh - dq) / 2)
}

const CENTRE_SQ = topology.byName('f6')
/** Centrality of every cell: 5 on f6 down to 0 on the edge. */
const CENTRE = COORDS.map((c, sq) => 5 - distance(sq, CENTRE_SQ))
/** For each side and cell: the pawn steps left to the promotion cell, at most 5. */
const PUSHES = [0, 1].map((side) => COORDS.map(([q, h]) => {
	const left = side === 0 ? (10 - Math.abs(q) - h) / 2 : (h - Math.abs(q) + 10) / 2
	return Math.min(5, left)
}))

/** Gliński's start position, White then Black (Black's cells are White's mirrored top to bottom). */
const START = [
	'Kg1 Qe1 Rc1 Ri1 Bf1 Bf2 Bf3 Nd1 Nh1 Pb1 Pc2 Pd3 Pe4 Pf5 Pg4 Ph3 Pi2 Pk1',
	'Kg10 Qe10 Rc8 Ri8 Bf11 Bf10 Bf9 Nd9 Nh9 Pb7 Pc7 Pd7 Pe7 Pf7 Pg7 Ph7 Pi7 Pk7',
]

// The orthodox types bring the names, glyphs, flags and the compulsory promotion to Q, R, B or N; the moves and
// values are the hexagonal ones.
const types = orthodoxTypes({ lastRank: promotes })
types.k.moves = [{ leap: KING12 }]
types.q.moves = [{ ride: KING12 }]
types.r.moves = [{ ride: ROOK6 }]
types.b.moves = [{ ride: BISHOP6 }]
types.n.moves = [{ leap: KNIGHT12 }]
types.p.moves = [
	{ leap: [PAWN.forward], oriented: true, mode: 'move' },
	{ leap: PAWN.captures, oriented: true, mode: 'capture' },
]
for (const [id, value] of Object.entries(VALUES)) {
	types[id].value = value
}

const spec = {
	id: 'hexagonal',
	category: 'boards',
	sides: whiteBlack(),
	topology,
	types,
	rules: () => [
		t('quantumchess', 'The board has 91 hexagons in three shades. The files a to l (there is no j) run straight up, and the ranks bend in a V around the middle file f.'),
		t('quantumchess', 'Rooks move in straight lines through the six sides of a cell. Bishops move along the six diagonals through its corners, so each of the three bishops stays on its own shade.'),
		t('quantumchess', 'A diagonal step passes between two cells, and pieces on those two cells never block it. The queen moves like a rook or a bishop, and the king steps one cell in any of these 12 directions.'),
		t('quantumchess', 'The knight jumps two cells in a straight line and then one cell turned 60°. It has up to 12 targets and cannot be blocked.'),
		t('quantumchess', 'Pawns move one cell straight forward and capture one cell forward-left or forward-right, onto the neighbouring cells. A pawn on any starting cell of its side\'s pawns may move two cells straight forward if both are empty, even if it got there by capturing.'),
		t('quantumchess', 'Right after such a double step, an enemy pawn that could capture on the skipped cell may do so on its next move only, removing the pawn (en passant).'),
		t(
			'quantumchess',
			'A pawn promotes at the far end of its file, to a queen, rook, bishop or knight. There is no castling.',
		),
		// the escape rule itself (with its exception for a move that might still capture the enemy king) is on the
		// shared card; this entry only says what it means for stalemate here
		t(
			'quantumchess',
			'Stalemate is not a draw: a king that cannot escape loses even when it is not attacked, so the player who stalemates wins (Gliński\'s own rules give that player ¾ of a point). A player with no move at all loses too. Only the two kings left is a draw, unless the player to move can capture the other king.',
		),
	],
	setup() {
		const w = emptyWorld(spec)
		START.forEach((list, side) => {
			for (const p of list.split(' ')) {
				addPiece(w, p[0].toLowerCase(), side, topology.byName(p.slice(1)))
			}
		})
		// no castling: the only extra state is the en passant cell and its victim
		w.x = { ep: -1, epVictim: -1 }
		return w
	},
	extraMoves(w, side) {
		return pawnExtras(spec, w, side, (s, sq) => PAWN_START[s].has(sq), PAWN)
	},
	afterMove(next, m) {
		orthodoxAfterMove(spec, next, m)
	},
	// A world where the move did not happen (or a Measure turn) still ends the one-ply en passant right.
	applyMiss(b) {
		return clearEnPassant(b)
	},
	// The classic end rules come from the core defaults, with no variant copy: the
	// default `worldResult` (capture the king), `escapeRule` (a king that cannot escape loses at once),
	// `bareKingsDraw` and `drawsWait` (the bare-kings draw waits while the side to move can take the other king).
	// Gliński scores stalemate in favour of the stalemating side, and the escape rule already ends a classical
	// stalemate or mate that way. What is left for `noMoves` is a side with no action at all (not even a Measure):
	// it loses too, where docs/rules.md would call it a draw.
	noMoves(state) {
		return { winner: 1 - state.turn, reason: 'noMoves' }
	},
	// Own minus enemy: knights and bishops near the centre, pawns close to promotion.
	evaluate(w, side) {
		let score = 0
		for (let id = 0; id < w.sq.length; id++) {
			const sq = w.sq[id]
			if (sq < 0) {
				continue
			}
			const ty = w.ty[id]
			let v
			if (ty === 'n' || ty === 'b') {
				v = 6 * CENTRE[sq]
			} else if (ty === 'p') {
				v = 12 * (5 - PUSHES[w.sd[id]][sq])
			} else {
				continue
			}
			score += w.sd[id] === side ? v : -v
		}
		return score
	},
}

export default defineVariant(spec)
