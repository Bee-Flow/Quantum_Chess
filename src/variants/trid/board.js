/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The board of Tri-Dimensional chess with fixed attack boards: 64 squares on seven boards (three 4 × 4 main levels
 * and four 2 × 2 attack boards), their names (`b3N`, `z0QL1`), the columns of the flat 6 × 10 map seen from above,
 * the precomputed lines of the flat map, and the drawing.
 *
 * A square has the coordinates `[x, y, h]`: `x` the file (`z` = 0 … `e` = 5), `y` the rank (0–9) and `h` the board in
 * height order (`LEVELS`). Square indexes run by board, then rank, then file, so the two squares of one column are
 * always written lower level first in split and merge codes (`a1W-b3W|b3N`).
 */

import { makeTopology } from '../core/topology.js'

/** The file letters, by file index. */
export const FILES = 'zabcde'

/** The boards in height order (coordinate 2 of a square). */
export const LEVELS = ['W', 'QL1', 'KL1', 'N', 'B', 'QL6', 'KL6']

/** Width and height of the flat map. */
const MAP_W = 6
const MAP_H = 10

/*
 * The drawing, White's view (rank 9 at the top): W and B form one column on a shared rank axis, W (ranks 1-4) below B
 * (ranks 5-8) with a thin gap, so a file runs straight up through both. N (ranks 3-6) stands to their right, level
 * with the ranks it shares with them (half the gap off, as it lies across it). Each attack board abuts the corner it
 * is pinned to, one row further out: QL1 under W's a1, its a file under W's a file, KL1 under W's d1, QL6 and KL6
 * over B's a8 and d8. One map column is one x in the left column (`z` = 0 … `e` = 5); N's files a-d are at 7-10.
 * The drawing is 11 × 13.9 units, so a phone shows it whole at about 30 px per square and a desktop at about 54.
 */

/** Gap between an attack board and the main board it is pinned to. */
const PIN_GAP = 0.2
/** Gap between W and B. */
const LEVEL_GAP = 0.3
/** Room for the file letters above and below the left column. */
const LETTERS = 0.6
/** The y of the highest rank of QL6 and KL6, of B, of W, and of QL1 and KL1. */
const TOP6 = LETTERS
const TOP_B = TOP6 + 2 + PIN_GAP
const TOP_W = TOP_B + 4 + LEVEL_GAP
const TOP1 = TOP_W + 4 + PIN_GAP
/** The top of N: its rank 6 half the gap below B's, its rank 3 half the gap above W's. */
const TOP_N = TOP_B + 2 + LEVEL_GAP / 2
/** The x of N's file a. */
const N_LEFT = 7
/** Width and height of the drawing. */
const WIDTH = N_LEFT + 4
const HEIGHT = round(TOP1 + 2 + LETTERS)

/**
 * A layout coordinate without floating-point noise.
 *
 * @param {number} v value
 * @return {number}
 */
function round(v) {
	return Math.round(v * 1000) / 1000
}

/**
 * Every board: its first and last file, its lowest and highest rank, the x of file index 0 (`z`) and the y of the
 * top of its highest rank in the drawing.
 */
const BOARDS = {
	W: { files: [1, 4], ranks: [1, 4], x0: 0, top: TOP_W },
	QL1: { files: [0, 1], ranks: [0, 1], x0: 0, top: TOP1 },
	KL1: { files: [4, 5], ranks: [0, 1], x0: 0, top: TOP1 },
	N: { files: [1, 4], ranks: [3, 6], x0: N_LEFT - 1, top: TOP_N },
	B: { files: [1, 4], ranks: [5, 8], x0: 0, top: TOP_B },
	QL6: { files: [0, 1], ranks: [8, 9], x0: 0, top: TOP6 },
	KL6: { files: [4, 5], ranks: [8, 9], x0: 0, top: TOP6 },
}

/**
 * The top-left corner of the cell of a file and rank on a board.
 *
 * @param {string} id board
 * @param {number} x file index
 * @param {number} y rank
 * @return {{x: number, y: number}}
 */
function cellAt(id, x, y) {
	const b = BOARDS[id]
	return { x: b.x0 + x, y: round(b.top + b.ranks[1] - y) }
}

/**
 * The drawing of the boards: a frame per board, the rank numbers left of every row (the attack boards' outside the
 * column, the main boards' in the void `z` column), the file letters above and below the left column and under N,
 * the names of W and B in the void `e` column beside them, N's above it, and those of the attack boards in the gap
 * between the two attack boards of a side, on their outer row.
 *
 * @return {object} layout extras for `makeTopology`
 */
function drawing() {
	const boards = []
	const labels = []
	for (const [id, b] of Object.entries(BOARDS)) {
		const { x, y } = cellAt(id, b.files[0], b.ranks[1])
		const w = b.files[1] - b.files[0] + 1
		const h = b.ranks[1] - b.ranks[0] + 1
		boards.push({ x, y, w, h })
		// a main board's numbers sit right beside its file a (N's in the gap left of it); the two attack boards of a
		// side share their rows, numbered once, outside the column
		if (w === 4 || b.files[0] === 0) {
			for (let r = b.ranks[0]; r <= b.ranks[1]; r++) {
				labels.push({ x: w === 4 ? b.x0 + 0.7 : -0.3, y: round(cellAt(id, 0, r).y + 0.5), text: String(r) })
			}
		}
	}
	for (let f = 0; f < MAP_W; f++) {
		labels.push({ x: f + 0.5, y: round(TOP6 - 0.3), text: FILES[f] })
		labels.push({ x: f + 0.5, y: round(HEIGHT - LETTERS + 0.3), text: FILES[f] })
	}
	for (let f = 1; f <= 4; f++) {
		labels.push({ x: N_LEFT + f - 0.5, y: round(TOP_N + 4.3), text: FILES[f] })
	}
	labels.push(
		{ x: 5.45, y: round(TOP_W + 2), text: 'W' },
		{ x: 5.45, y: round(TOP_B + 2), text: 'B' },
		{ x: N_LEFT + 2, y: round(TOP_N - 0.35), text: 'N' },
		{ x: 2.45, y: round(TOP1 + 1.5), text: 'QL1' },
		{ x: 3.55, y: round(TOP1 + 1.5), text: 'KL1' },
		{ x: 2.45, y: round(TOP6 + 0.5), text: 'QL6' },
		{ x: 3.55, y: round(TOP6 + 0.5), text: 'KL6' },
	)
	return { width: WIDTH, height: HEIGHT, boards, labels }
}

/**
 * The squares of the board, in index order.
 *
 * @return {number[][]} coordinates `[x, y, h]`
 */
function squareCoords() {
	const coords = []
	LEVELS.forEach((id, h) => {
		const b = BOARDS[id]
		for (let y = b.ranks[0]; y <= b.ranks[1]; y++) {
			for (let x = b.files[0]; x <= b.files[1]; x++) {
				coords.push([x, y, h])
			}
		}
	})
	return coords
}

/** The topology: 64 squares named file + rank + board. */
export const topology = makeTopology({
	coords: squareCoords(),
	name: ([x, y, h]) => FILES[x] + y + LEVELS[h],
	cell: ([x, y, h]) => ({
		...cellAt(LEVELS[h], x, y),
		w: 1,
		h: 1,
		shape: 'rect',
		shade: (x + y) % 2 === 0 ? 'dark' : 'light',
	}),
	layout: drawing(),
})

/** The file of every square. */
export const FILE = topology.coords.map((c) => c[0])
/** The rank of every square. */
export const RANK = topology.coords.map((c) => c[1])
/** The column (map square `x + 6 y`) of every square. */
export const COL_OF = topology.coords.map((c) => c[0] + MAP_W * c[1])

/** The squares of every column of the map, lowest level first (none for a void column). */
export const COLS = Array.from({ length: MAP_W * MAP_H }, () => [])
COL_OF.forEach((c, sq) => COLS[c].push(sq))

/**
 * The column a flat step away from a column, or -1 off the map.
 *
 * @param {number} c column
 * @param {number} dx file step
 * @param {number} dy rank step
 * @return {number}
 */
export function colStep(c, dx, dy) {
	const x = (c % MAP_W) + dx
	const y = Math.floor(c / MAP_W) + dy
	return x < 0 || x >= MAP_W || y < 0 || y >= MAP_H ? -1 : x + MAP_W * y
}

const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]

/**
 * The lines of a set of directions from every column: `lines[c]` is one array of columns per direction, in order
 * from `c` to the edge of the map (void columns included: riders fly across them). With `range` 1 only the first
 * column is kept, and lines that start on a void column are dropped (leapers cannot stop there).
 *
 * @param {number[][]} dirs flat directions
 * @param {number} range maximum number of steps
 * @return {number[][][]}
 */
function linesFrom(dirs, range) {
	const out = []
	for (let c = 0; c < MAP_W * MAP_H; c++) {
		const list = []
		for (const [dx, dy] of dirs) {
			const cols = []
			let t = colStep(c, dx, dy)
			while (t >= 0 && cols.length < range) {
				cols.push(t)
				t = colStep(t, dx, dy)
			}
			if (cols.length && (range > 1 || COLS[cols[0]].length)) {
				list.push(cols)
			}
		}
		out.push(list)
	}
	return out
}

/** Rook, bishop and queen lines, king steps and knight jumps from every column. */
export const LINES = {
	r: linesFrom(ORTHOGONAL, MAP_H),
	b: linesFrom(DIAGONAL, MAP_H),
	q: linesFrom([...ORTHOGONAL, ...DIAGONAL], MAP_H),
	k: linesFrom([...ORTHOGONAL, ...DIAGONAL], 1),
	n: linesFrom(KNIGHT, 1),
}

/** Riders are blocked by a piece on any level of a column in between; leapers are never blocked. */
export const RIDERS = new Set(['q', 'r', 'b'])

/**
 * The square with this name (the names are fixed, so an unknown name is a programming error).
 *
 * @param {string} name square name such as `d0KL1`
 * @return {number}
 */
export function sqOf(name) {
	const s = topology.byName(name)
	if (s < 0) {
		throw new Error('unknown square ' + name)
	}
	return s
}
