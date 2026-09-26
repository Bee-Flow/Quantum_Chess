/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * 4D chess: TessChess (Ben Reiniger, The Chess Variant Pages, 2013) on a 4 × 4 × 4 × 4 hypercube, drawn as a 4 × 4
 * grid of 4 × 4 boards. A cell is named board, then square (`B2c3`); its coordinates are `[x, y, z, w]` = small file,
 * small rank, board column, board row. The rook slides along orthogonals and triagonals (1 or 3 coordinates change),
 * the bishop along diagonals and quadragonals (2 or 4), the queen and the king in all 80 directions, the knight leaps
 * 2 + 1 on any two axes, and a pawn steps forward on its board or to the next board, capturing one forward and one
 * sideways step. No castling, no double step, no en passant. The game ends by the core's classic rules: capturing the
 * king wins, a king that cannot escape loses at once, and only the two kings left (not touching) is a draw.
 * Player-facing rules are in docs/variants.md.
 */

import { t } from '@nextcloud/l10n'
import { whiteBlack } from './core/orthodoxVariant.js'
import { allDirections, directions, makeTopology, symmetric } from './core/topology.js'
import { defineVariant } from './core/variant.js'
import { worldFrom } from './core/world.js'

/** Cells per axis. */
const N = 4
/** The gap between two boards of the drawing, in cell units. */
const GAP = 0.8
/** The distance from one board to the next in the drawing. */
const PITCH = N + GAP
/** Width and height of the drawing. */
const SIZE = round(N * PITCH - GAP)

/**
 * A layout coordinate without floating-point noise.
 *
 * @param {number} v value
 * @return {number}
 */
function round(v) {
	return Math.round(v * 100) / 100
}

/** The coordinates `[x, y, z, w]` of every cell, in square-index order `x + 4y + 16z + 64w`. */
const COORDS = []
for (let w = 0; w < N; w++) {
	for (let z = 0; z < N; z++) {
		for (let y = 0; y < N; y++) {
			for (let x = 0; x < N; x++) {
				COORDS.push([x, y, z, w])
			}
		}
	}
}

/**
 * One frame with its label ("B2") per board, the rank numbers left of every board (in the gap before it, so a phone
 * zoomed in on a few boards still shows them) and the file letters a-d under every board of the bottom row. Black's
 * view turns the drawing round, so the file letters end up above the top row, where the board labels are drawn just
 * above the frames (in every view): the letters keep 0.8 units from the frames, a line above the labels there
 * ("d c b a" over "B1"). Every cell's full name is in its aria-label (screen readers), and the board draws no
 * tooltip.
 */
const boards = []
const labels = []
for (let w = 0; w < N; w++) {
	for (let z = 0; z < N; z++) {
		boards.push({ x: round(z * PITCH), y: round((N - 1 - w) * PITCH), w: N, h: N, label: 'ABCD'[z] + (w + 1) })
	}
}
for (let z = 0; z < N; z++) {
	for (let x = 0; x < N; x++) {
		labels.push({ x: round(z * PITCH + x + 0.5), y: round(SIZE + 0.8), text: 'abcd'[x] })
	}
}
for (let w = 0; w < N; w++) {
	for (let z = 0; z < N; z++) {
		for (let y = 0; y < N; y++) {
			const y0 = (N - 1 - w) * PITCH + (N - 1 - y) + 0.5
			labels.push({ x: round(z * PITCH - 0.3), y: round(y0), text: String(y + 1) })
		}
	}
}

/** The hypercube: cell `(x, y)` of board `(z, w)` is drawn at `(z · 4.8 + x, (3 - w) · 4.8 + (3 - y))`. */
const topology = makeTopology({
	coords: COORDS,
	name: ([x, y, z, w]) => 'ABCD'[z] + (w + 1) + 'abcd'[x] + (y + 1),
	cell: ([x, y, z, w]) => ({
		x: round(z * PITCH + x),
		y: round((N - 1 - w) * PITCH + (N - 1 - y)),
		w: 1,
		h: 1,
		shape: 'rect',
		// the true 4D colouring: every rook step and knight leap changes the colour, every bishop step keeps it
		shade: (x + y + z + w) % 2 === 0 ? 'dark' : 'light',
	}),
	layout: { width: SIZE, height: SIZE, boards, labels },
})

/** The centres of the 2 × 2 blocks of boards: between the first and second board column (or row), and so on. */
const BLOCKS = [0, 1, 2].map((i) => round(i * PITCH + N + GAP / 2))
/** The layouts with a focus, by key (built on first use). */
const FOCUSED = new Map()

/**
 * The block whose centre is nearest to a coordinate.
 *
 * @param {number} v layout coordinate
 * @return {number} 0, 1 or 2
 */
function nearestBlock(v) {
	let best = 0
	for (let i = 1; i < BLOCKS.length; i++) {
		if (Math.abs(v - BLOCKS[i]) < Math.abs(v - BLOCKS[best])) {
			best = i
		}
	}
	return best
}

/**
 * The drawing with a focus on the 2 × 2 block of boards around the pieces of the side to move (their mean position in
 * the first possibility): the home boards at the start, following the army as it advances. With a mouse the whole
 * hypercube stays in view (`zoom: 1`); on a touch screen the board opens on the block at 28 px per cell (about 19
 * for the whole drawing on a phone), and the player pans, pinches or taps "Whole board". The key names the side
 * to move, so the view recentres on every move (the view turns with it when the board follows the player to move),
 * as the bughouse board does.
 *
 * @param {object} state state
 * @return {object} a topology
 */
function focusedLayout(state) {
	const b = state.worlds[0].b
	let x = 0
	let y = 0
	let n = 0
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sq[id] >= 0 && b.sd[id] === state.turn) {
			const c = topology.cells[b.sq[id]]
			x += c.x + 0.5
			y += c.y + 0.5
			n++
		}
	}
	const i = n ? nearestBlock(x / n) : 1
	const j = n ? nearestBlock(y / n) : 1
	const key = state.turn + ':' + i + ':' + j
	let out = FOCUSED.get(key)
	if (!out) {
		const box = { w: 2 * N + GAP + 1, h: 2 * N + GAP + 1 }
		out = { ...topology, layout: { ...topology.layout, focus: { x: BLOCKS[i], y: BLOCKS[j], zoom: 1, box, key } } }
		FOCUSED.set(key, out)
	}
	return out
}

/** Orthogonal (8), diagonal (24), triagonal (32) and quadragonal (16) directions. */
const ORTHOGONAL = directions(4, 1)
const DIAGONAL = directions(4, 2)
const TRIAGONAL = directions(4, 3)
const QUADRAGONAL = directions(4, 4)
/** Every direction in which a coordinate changes by at most 1 (80): the king's steps and the queen's lines. */
const ALL = allDirections(4)
/** The 48 knight leaps: 2 along one axis and 1 along another. */
const KNIGHT = symmetric([1, 2], 4)
/** White's pawn pushes: one square up its board, or the same square one board up. */
const PAWN_PUSHES = [[0, 1, 0, 0], [0, 0, 0, 1]]
/** White's pawn captures: one forward step (square or board) plus one sideways step (square or board). */
const PAWN_CAPTURES = [
	[1, 1, 0, 0],
	[-1, 1, 0, 0],
	[0, 1, 1, 0],
	[0, 1, -1, 0],
	[1, 0, 0, 1],
	[-1, 0, 0, 1],
	[0, 0, 1, 1],
	[0, 0, -1, 1],
]

/**
 * Whether a cell is a promotion cell of a side: rank 4 of board row 4 for White, rank 1 of board row 1 for Black.
 *
 * @param {number} side side index
 * @param {number} sq cell
 * @return {boolean}
 */
function lastRow(side, sq) {
	const c = COORDS[sq]
	return side === 0 ? c[1] === N - 1 && c[3] === N - 1 : c[1] === 0 && c[3] === 0
}

/** White's pieces (rank 1 of boards A1-D1) and pawns (rank 2 of boards A2-D2); Black mirrors both forward axes. */
const WHITE_PIECES = { A1b1: 'r', A1c1: 'n', B1a1: 'b', B1d1: 'q', C1a1: 'b', C1d1: 'k', D1b1: 'r', D1c1: 'n' }
const WHITE_PAWNS = ['A2b2', 'A2c2', 'B2a2', 'B2b2', 'B2c2', 'B2d2', 'C2a2', 'C2b2', 'C2c2', 'C2d2', 'D2b2', 'D2c2']

/**
 * The name of the cell that mirrors a cell for the other side: board row and rank turned round.
 *
 * @param {string} name cell name
 * @return {string}
 */
function mirror(name) {
	return name[0] + (N + 1 - Number(name[1])) + name[2] + (N + 1 - Number(name[3]))
}

/** The start position: cell → `side:type`. */
const START = {}
for (const [cell, type] of Object.entries(WHITE_PIECES)) {
	START[cell] = '0:' + type
}
for (const cell of WHITE_PAWNS) {
	START[cell] = '0:p'
}
for (const [cell, type] of Object.entries(WHITE_PIECES)) {
	START[mirror(cell)] = '1:' + type
}
for (const cell of WHITE_PAWNS) {
	START[mirror(cell)] = '1:p'
}

/** The computer's pawn term per side and cell: 8 per step made, 40 more one push before promotion. */
const ADVANCE = [0, 1].map((side) => COORDS.map(([, y, , w]) => {
	const steps = side === 0 ? y + w : 2 * (N - 1) - y - w
	return 8 * (steps - 2) + (steps === 2 * (N - 1) - 1 ? 40 : 0)
}))
/** The computer's centre term per cell for knights, bishops and queens: 5 per coordinate in the middle two rows. */
const CENTRE = COORDS.map((c) => 5 * c.filter((v) => v === 1 || v === 2).length)
/** The types that like the centre. */
const CENTRAL_TYPES = new Set(['n', 'b', 'q'])

const spec = {
	id: 'hyper4d',
	category: 'dimensions',
	// no castling and no en passant: the shared rules card leaves out its sentence about them
	specialMoves: false,
	sides: whiteBlack(),
	/**
	 * Black mirrors both forward axes (small rank and board row); the sideways axes stay.
	 *
	 * @param {number} side side index
	 * @param {number[]} v vector written for White
	 * @return {number[]}
	 */
	orient(side, v) {
		return side === 0 ? v : [v[0], -v[1], v[2], -v[3]]
	},
	topology,
	/**
	 * The drawing, opened on the side to move's boards on a touch screen (see `focusedLayout`); the plain drawing once
	 * the game is over.
	 *
	 * @param {object} state state
	 * @return {object} a topology
	 */
	layoutOf(state) {
		return state.result ? topology : focusedLayout(state)
	},
	types: {
		k: {
			name: () => t('quantumchess', 'King'),
			moves: [{ leap: ALL }],
			royal: true,
			solid: true,
			value: 400,
			glyph: { sprite: 'k' },
		},
		q: {
			name: () => t('quantumchess', 'Queen'),
			moves: [{ ride: ALL }],
			value: 1400,
			glyph: { sprite: 'q' },
		},
		r: {
			name: () => t('quantumchess', 'Rook'),
			moves: [{ ride: ORTHOGONAL }, { ride: TRIAGONAL }],
			value: 740,
			glyph: { sprite: 'r' },
		},
		b: {
			name: () => t('quantumchess', 'Bishop'),
			moves: [{ ride: DIAGONAL }, { ride: QUADRAGONAL }],
			value: 560,
			glyph: { sprite: 'b' },
		},
		n: {
			name: () => t('quantumchess', 'Knight'),
			moves: [{ leap: KNIGHT }],
			value: 340,
			glyph: { sprite: 'n' },
		},
		p: {
			name: () => t('quantumchess', 'Pawn'),
			moves: [
				{ leap: PAWN_PUSHES, oriented: true, mode: 'move' },
				{ leap: PAWN_CAPTURES, oriented: true, mode: 'capture' },
			],
			solid: true,
			value: 100,
			glyph: { sprite: 'p' },
			// compulsory: a pawn on its last row would have no move left
			promote: { zone: (side, to) => lastRow(side, to), to: ['q', 'r', 'b', 'n'] },
		},
	},
	/**
	 * The start world (the diagram of the TessChess page); no options, no extra state.
	 *
	 * @return {object}
	 */
	setup() {
		return worldFrom(spec, START, {})
	},
	rules: () => [
		t(
			'quantumchess',
			'The board is a 4 × 4 grid of small 4 × 4 boards, and a cell is named board, then square: B2c3 is square c3 on board B2. Stepping to the same square on the next board (left, right, up or down) counts as one step, just like stepping to the next square.',
		),
		t(
			'quantumchess',
			'A rook moves straight along a rank or file of its board, or to the same square on the other boards of its row or column of boards. It may also move one square diagonally and one board straight at once, or one square straight and one board diagonally, step after step.',
		),
		t(
			'quantumchess',
			'A bishop moves diagonally on its board, to the same square on a diagonal line of boards, or one square and one board straight at once. It may also move one square diagonally and one board diagonally at once. It never leaves its colour.',
		),
		t(
			'quantumchess',
			'The queen moves like a rook or a bishop: in any direction a king can step, as far as the way is free.',
		),
		t(
			'quantumchess',
			'The king steps to any touching cell (up to 80): the squares around it, and the same square and the squares around it on each board next to its board, diagonal neighbours included. The knight jumps 2 steps one way and 1 step another, also between boards.',
		),
		t(
			'quantumchess',
			'A pawn moves one square up its board, or to the same square one board up (Black: down). It captures one step forward plus one step sideways (a square or a board to the left or right), never straight ahead. There is no double step, no en passant and no castling.',
		),
		t(
			'quantumchess',
			'A pawn must promote on rank 4 of the top boards A4–D4 (Black: rank 1 of A1–D1), to a queen, rook, bishop or knight.',
		),
		t('quantumchess', 'The game is drawn when only the two kings are left and they do not touch.'),
	],
	// No `worldResult` and the classic end-rule flags at their defaults: capturing the
	// king wins (the core's default `worldResult`), a king that cannot escape loses at once (`escapeRule`), and only
	// the two kings left is a draw (`bareKingsDraw`) that waits while the side to move can take the other king for
	// certain (`drawsWait`). With only kings on the board that is exactly while they touch, so the core's rule is the
	// "two kings that do not touch" draw of the rules card (TessChess itself states no draw rule). A move captures at
	// most one piece in each possibility and a capture never happens in only some possibilities of one outcome, so
	// every possibility always has the same number of pieces, and the core's "in every possibility" never differs from
	// a check per possibility.
	/**
	 * The computer's own terms: pawns that advance (most of all one push before promotion) and knights, bishops and
	 * queens in the middle of the hypercube, own minus enemy.
	 *
	 * @param {object} b world
	 * @param {number} side the side the value is for
	 * @return {number}
	 */
	evaluate(b, side) {
		let v = 0
		for (let id = 0; id < b.sq.length; id++) {
			const s = b.sq[id]
			if (s < 0) {
				continue
			}
			const ty = b.ty[id]
			const term = ty === 'p' ? ADVANCE[b.sd[id]][s] : CENTRAL_TYPES.has(ty) ? CENTRE[s] : 0
			v += b.sd[id] === side ? term : -term
		}
		return v
	},
}

export default defineVariant(spec)
