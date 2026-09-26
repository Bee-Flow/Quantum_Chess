/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Raumschach (Ferdinand Maack, 1907; his "Normalspiel" of 1919 with the 10-pawn array of Dickins and the IRF): chess
 * in a 5 × 5 × 5 cube of five levels, A at the bottom (White's home) to E at the top (Black's home). Rooks move
 * through the faces of a cell, bishops through its edges, unicorns through its corners and the queen all three ways;
 * the knight leaps 2 + 1 across levels too. Pawns step one cell forward or one level up and capture in five
 * directions; there is no castling, no double step and no en passant. The game ends by the core's classic rules
 * (handoff/LEAD-DECISIONS.md L1): capturing the king wins, a king that cannot escape loses at once, and only the two
 * kings left is the core's bare-kings draw, which waits while a king can be captured for certain (so while the kings
 * touch). The research spec is handoff/research/raumschach.md; player-facing rules are in docs/variants.md.
 */

import { t } from '@nextcloud/l10n'
import { whiteBlack } from './core/orthodoxVariant.js'
import { allDirections, directions, makeTopology, symmetric } from './core/topology.js'
import { defineVariant } from './core/variant.js'
import { worldFrom } from './core/world.js'

/** Board size along each axis. */
const N = 5
const LEVEL_LETTERS = 'ABCDE'
const FILE_LETTERS = 'abcde'

/** Rook: the 6 directions through the faces of a cell. */
const FACE6 = directions(3, 1)
/** Bishop: the 12 directions through the edges (a flat diagonal in any of the three plane orientations). */
const EDGE12 = directions(3, 2)
/** Unicorn: the 8 directions through the corners (all three coordinates change at once). */
const CORNER8 = directions(3, 3)
/** King and queen: all 26 directions. */
const ALL26 = allDirections(3)
/** Knight: the 24 permutations of (0, ±1, ±2). */
const KNIGHT24 = symmetric([1, 2], 3)

// Cells are [x, y, z] = [file, rank - 1, level], z outermost: Aa1 is square 0, Cc3 square 62 and Ee5 square 124.
const coords = []
for (let z = 0; z < N; z++) {
	for (let y = 0; y < N; y++) {
		for (let x = 0; x < N; x++) {
			coords.push([x, y, z])
		}
	}
}

// The drawing: the five levels in a grid read bottom-up, A (left) and B (right) at the bottom, C and D in the middle,
// E centred at the top, so side 0 (White, level A) is at the bottom. The top-left corner of each level's cells:
const COLUMN = 5.6
const ROW = 6.3
const ORIGIN = [[0, 2 * ROW], [COLUMN, 2 * ROW], [0, ROW], [COLUMN, ROW], [COLUMN / 2, 0]]
// Each board frame also holds the strip of file letters under its cells, so that its level label (drawn above the
// frame in both views) never meets the file letters, which the 180 degree turn of Black's view puts above the cells.
const STRIP = 0.6
const boards = ORIGIN.map(([ox, oy], z) => ({ x: ox, y: oy, w: N, h: N + STRIP, label: LEVEL_LETTERS[z] }))
const labels = []
ORIGIN.forEach(([ox, oy]) => {
	for (let x = 0; x < N; x++) {
		labels.push({ x: ox + x + 0.5, y: oy + N + 0.3, text: FILE_LETTERS[x] })
	}
	for (let y = 0; y < N; y++) {
		labels.push({ x: ox - 0.3, y: oy + N - 1 - y + 0.5, text: String(y + 1) })
	}
})

const topology = makeTopology({
	coords,
	name: ([x, y, z]) => LEVEL_LETTERS[z] + FILE_LETTERS[x] + (y + 1),
	cell: ([x, y, z]) => ({
		x: ORIGIN[z][0] + x,
		y: ORIGIN[z][1] + N - 1 - y,
		w: 1,
		h: 1,
		shape: 'rect',
		shade: (x + y + z) % 2 === 0 ? 'dark' : 'light',
	}),
	// width and height include the strip under the bottom boards, so the drawing turns about its middle
	layout: { width: COLUMN + N, height: 2 * ROW + N + STRIP, boards, labels, zoomable: true },
})

/** The promotion cells per side: rank 5 of level E for White, rank 1 of level A for Black. */
const PROMOTION = [0, 1].map((side) => coords.map(([, y, z]) => (side === 0
	? y === N - 1 && z === N - 1
	: y === 0 && z === 0)))

/** The computer's pull of the minor pieces and the queen towards the centre Cc3: 6 × (6 − Manhattan distance). */
const CENTRE = coords.map(([x, y, z]) => 6 * (6 - Math.abs(x - 2) - Math.abs(y - 2) - Math.abs(z - 2)))
/** The computer's pull of the pawns towards their promotion cells: 3 per step forward or up. */
const ADVANCE = [0, 1].map((side) => coords.map(([, y, z]) => 3 * (side === 0 ? y + z : 2 * (N - 1) - y - z)))
/** The types that the centre term rewards. */
const CENTRAL = new Set(['q', 'b', 'u', 'n'])

/**
 * The start position (section 2.3 of the spec): White's officers on rank 1 of level A (R N K N R) and of level B
 * (B U Q B U), its pawns on rank 2 of both; Black's array is White's turned through the centre of the cube.
 */
const START = {}
const BACK = ['rnknr', 'buqbu']
for (let z = 0; z < BACK.length; z++) {
	for (let x = 0; x < N; x++) {
		for (const [y, type] of [[0, BACK[z][x]], [1, 'p']]) {
			START[topology.names[topology.at([x, y, z])]] = '0:' + type
			START[topology.names[topology.at([N - 1 - x, N - 1 - y, N - 1 - z])]] = '1:' + type
		}
	}
}

const spec = {
	id: 'raumschach',
	category: 'dimensions',
	// no castling and no en passant: the shared rules card leaves out its sentence about them (LEAD-DECISIONS L2)
	specialMoves: false,
	sides: whiteBlack(),
	topology,
	/**
	 * Black's pawns go towards rank 1 and towards level A: the file is kept, rank and level are mirrored.
	 *
	 * @param {number} side side index
	 * @param {number[]} vec vector written for White
	 * @return {number[]}
	 */
	orient(side, vec) {
		return side === 0 ? vec : [vec[0], -vec[1], -vec[2]]
	},
	// Values for the computer: the IRF's theory volume I (P 1, U 3, R 4.5, N 5, B 5.5, Q 15). A lower unicorn value
	// makes the two-ply search give a unicorn for a pawn on the first move.
	types: {
		k: {
			name: () => t('quantumchess', 'King'),
			moves: [{ leap: ALL26 }],
			royal: true,
			value: 0,
			glyph: { sprite: 'k' },
		},
		q: { name: () => t('quantumchess', 'Queen'), moves: [{ ride: ALL26 }], value: 1500, glyph: { sprite: 'q' } },
		r: { name: () => t('quantumchess', 'Rook'), moves: [{ ride: FACE6 }], value: 450, glyph: { sprite: 'r' } },
		b: { name: () => t('quantumchess', 'Bishop'), moves: [{ ride: EDGE12 }], value: 550, glyph: { sprite: 'b' } },
		u: {
			name: () => t('quantumchess', 'Unicorn'),
			moves: [{ ride: CORNER8 }],
			value: 300,
			// a knight with a horn
			glyph: { sprite: 'n', horn: true },
		},
		n: { name: () => t('quantumchess', 'Knight'), moves: [{ leap: KNIGHT24 }], value: 500, glyph: { sprite: 'n' } },
		p: {
			name: () => t('quantumchess', 'Pawn'),
			moves: [
				// one step forward or one level up, onto an empty cell
				{ leap: [[0, 1, 0], [0, 0, 1]], oriented: true, mode: 'move' },
				// captures: forward and sideways, up and sideways, forward and up
				{ leap: [[1, 1, 0], [-1, 1, 0], [1, 0, 1], [-1, 0, 1], [0, 1, 1]], oriented: true, mode: 'capture' },
			],
			solid: true,
			value: 100,
			glyph: { sprite: 'p' },
			// compulsory (no plain key on a promotion cell); the unicorn is a choice too, the king never
			promote: { zone: (side, to) => PROMOTION[side][to], to: ['q', 'r', 'b', 'n', 'u'] },
		},
	},
	/**
	 * The start world (no options, no randomness).
	 *
	 * @return {object}
	 */
	setup() {
		return worldFrom(spec, START)
	},
	// No `worldResult` and the classic end-rule flags at their defaults (handoff/LEAD-DECISIONS.md L1): capturing the
	// king wins (the core's default `worldResult`), a king that cannot escape loses at once (`escapeRule`), and only
	// the two kings left is a draw (`bareKingsDraw`) that waits while the side to move can take the other king for
	// certain (`drawsWait`). Kings are solid, so with only kings on the board that is exactly while they touch: the
	// core's rule is the "two kings that do not touch" draw of the rules card. A capture is always measured (a move
	// that might capture is split into outcomes by its per-possibility result), so every possibility of one outcome
	// has the same number of pieces and the core's "in every possibility" never differs from a check per possibility.
	/**
	 * The computer's positional terms: queen, bishops, unicorns and knights towards the centre, pawns towards their
	 * promotion cells (it also ranks the computer's split targets, which a quiet move changes only through this).
	 *
	 * @param {object} b world
	 * @param {number} side the side to evaluate for
	 * @return {number} centipawns
	 */
	evaluate(b, side) {
		let score = 0
		for (let id = 0; id < b.sq.length; id++) {
			const s = b.sq[id]
			if (s < 0) {
				continue
			}
			const type = b.ty[id]
			const v = CENTRAL.has(type) ? CENTRE[s] : type === 'p' ? ADVANCE[b.sd[id]][s] : 0
			score += b.sd[id] === side ? v : -v
		}
		return score
	},
	rules: () => [
		t(
			'quantumchess',
			'The board is a cube of five levels, from A at the bottom (White\'s home) to E at the top (Black\'s home); a cell is named level, file, rank, so Cc3 is the centre.',
		),
		t(
			'quantumchess',
			'Rooks move straight, also up and down; bishops move diagonally within any flat slice of the cube; unicorns move through the corners, changing level, file and rank at once.',
		),
		t(
			'quantumchess',
			'The queen moves like a rook, bishop or unicorn, the king steps to any of the 26 touching cells, and the knight jumps 2 cells one way and 1 another, also across levels.',
		),
		t(
			'quantumchess',
			'Pawns step one cell forward or one level up, and capture one cell forward and sideways, up and sideways, or forward and up, never straight ahead or straight up. For Black, forward is towards rank 1 and up is towards level A.',
		),
		t(
			'quantumchess',
			'A pawn that reaches the far rank of the opponent\'s home level (White: rank 5 of E; Black: rank 1 of A) must become a queen, rook, bishop, knight or unicorn.',
		),
		t('quantumchess', 'There is no castling, no double step and no en passant.'),
		// how a game is won (capture the king, a king that cannot escape) is on the shared card (LEAD-DECISIONS L1)
		t('quantumchess', 'If only the two kings are left and they do not touch, the game is drawn.'),
	],
}

export default defineVariant(spec)
