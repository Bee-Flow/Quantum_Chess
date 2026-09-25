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

/**
 * Every board: its first and last file, its lowest and highest rank, and the x of its left edge in the drawing (the
 * boards share one rank axis, rank 9 at the top, so a map square's rank reads the same on every board).
 */
const BOARDS = {
	W: { files: [1, 4], ranks: [1, 4], left: 2.5 },
	QL1: { files: [0, 1], ranks: [0, 1], left: 0 },
	KL1: { files: [4, 5], ranks: [0, 1], left: 7 },
	N: { files: [1, 4], ranks: [3, 6], left: 7 },
	B: { files: [1, 4], ranks: [5, 8], left: 12 },
	QL6: { files: [0, 1], ranks: [8, 9], left: 9.5 },
	KL6: { files: [4, 5], ranks: [8, 9], left: 16.5 },
}

/**
 * Rank numbers beside the boards: `[x, ranks]`. Every rank of a main board is numbered next to that board, except
 * the rows it shares with an attack board (numbered at the outer ends of the row).
 */
const RANK_LABELS = [
	[-0.3, [0, 1]],
	[2.2, [2, 3, 4]],
	[6.75, [2, 3, 4, 5, 6]],
	[9.3, [0, 1]],
	[9.2, [8, 9]],
	[11.5, [3, 4, 5, 6]],
	[16.3, [5, 6, 7]],
	[18.8, [8, 9]],
]

/**
 * The drawing of the boards: a frame per board, its name above it, the file letters under it, the rank numbers
 * beside it, and a short line from each attack board to the corner of the main level it hangs over.
 *
 * @return {object} layout extras for `makeTopology`
 */
function drawing() {
	const boards = []
	const labels = []
	for (const [id, b] of Object.entries(BOARDS)) {
		const w = b.files[1] - b.files[0] + 1
		const h = b.ranks[1] - b.ranks[0] + 1
		const top = MAP_H - 1 - b.ranks[1]
		boards.push({ x: b.left, y: top, w, h })
		labels.push({ x: b.left + w / 2, y: top - 0.32, text: id })
		for (let f = b.files[0]; f <= b.files[1]; f++) {
			labels.push({ x: b.left + f - b.files[0] + 0.5, y: top + h + 0.32, text: FILES[f] })
		}
	}
	for (const [x, ranks] of RANK_LABELS) {
		for (const r of ranks) {
			labels.push({ x, y: MAP_H - 0.5 - r, text: String(r) })
		}
	}
	// the pins: QL1 a1 to W a1, W d1 to KL1 d1, QL6 a8 to B a8, B d8 to KL6 d8
	const lines = [
		{ x1: 2, y1: 8.5, x2: 2.5, y2: 8.5 },
		{ x1: 6.5, y1: 8.5, x2: 7, y2: 8.5 },
		{ x1: 11.5, y1: 1.5, x2: 12, y2: 1.5 },
		{ x1: 16, y1: 1.5, x2: 16.5, y2: 1.5 },
	]
	return { width: 18.5, height: MAP_H, boards, labels, lines, zoomable: true }
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
		x: BOARDS[LEVELS[h]].left + x - BOARDS[LEVELS[h]].files[0],
		y: MAP_H - 1 - y,
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
