/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The board of Tri-Dimensional chess as a topology: every square any board can ever have (48 on the three main levels
 * and 4 on each of the twelve pins) plus one tab per pin, their names (`b3N`, `z0QL1`, and the pin's name `QL3` for
 * its tab), the pin of every attack-board square, the columns of the flat 6 × 10 map for the pins that hold a board,
 * and the precomputed lines of the flat map. The shape itself is in geometry.js, the drawing in layout.js.
 *
 * A square has the coordinates `[x, y, h]`: `x` the file (`z` = 0 … `e` = 5), `y` the rank (0–9) and `h` the board in
 * height order (`LEVELS`); a tab has `[pin, 0, TAB]`. Square indexes run by board, then rank, then file, so the
 * squares of one column are always written lower level first in split and merge codes (`a1W-b3W|b3N`). Which squares
 * of the pins exist depends on where the attack boards stand (the world's `x.boards`): `columns(boards)`.
 */

import { makeTopology } from '../core/topology.js'
import { COORDS, FILES, LEVELS, MAIN, MAP_H, MAP_W, PIN, PIN_INDEX, PINS, TAB } from './geometry.js'
import { cellsFor, drawing } from './layout.js'

export { FILES, LEVELS }

/** The pins the attack boards start on: White's queen's and king's board, then Black's. */
export const START_BOARDS = Object.freeze(['QL1', 'KL1', 'QL6', 'KL6'])

/** The drawing of the start position, whose cells serve as the topology's cells. */
const START = drawing(START_BOARDS)

/** The topology: the squares named file + rank + board, and the tabs named after their pins. */
export const topology = makeTopology({
	coords: COORDS,
	name: ([x, y, h]) => (h === TAB ? PINS[x] : FILES[x] + y + LEVELS[h]),
	cell: cellsFor(START_BOARDS),
	layout: START.layout,
})

/** The file of every square (-1 for a tab). */
export const FILE = COORDS.map(([x, , h]) => (h === TAB ? -1 : x))
/** The rank of every square (-1 for a tab). */
export const RANK = COORDS.map(([, y, h]) => (h === TAB ? -1 : y))
/** The column (map square `x + 6 y`) of every square (-1 for a tab). */
export const COL_OF = COORDS.map(([x, y, h]) => (h === TAB ? -1 : x + MAP_W * y))
/** The pin of every square: its index in `PINS` for a square of an attack board, -1 on a main level or a tab. */
export const PIN_OF = COORDS.map(([, , h]) => (h === TAB ? -1 : PIN_INDEX[LEVELS[h]] ?? -1))

/** The squares of every pin, in index order (so the same position on two pins has the same place in both lists). */
export const PIN_SQUARES = PINS.map((name, p) => PIN_OF.flatMap((q, sq) => (q === p ? [sq] : [])))
/** The tab of every pin. */
export const TAB_OF = PINS.map((name, p) => COORDS.findIndex(([x, , h]) => h === TAB && x === p))

/**
 * The square of the main level that a board on each pin overhangs (its corner square): `a1W` for QL1, `d8B` for KL6.
 */
export const CORNER_OF = PIN.map((p) => {
	const x = p.king ? MAIN[p.main].files[1] : MAIN[p.main].files[0]
	return COORDS.findIndex(([cx, cy, h]) => h === LEVELS.indexOf(p.main) && cx === x && cy === p.corner)
})

/** The squares of the main levels in every column, lowest level first. */
const MAIN_COLS = Array.from({ length: MAP_W * MAP_H }, () => [])
COORDS.forEach(([x, y, h], sq) => {
	if (h !== TAB && PIN_OF[sq] < 0) {
		MAIN_COLS[x + MAP_W * y].push(sq)
	}
})

/** The column tables already built, by the set of occupied pins (a bit per pin: at most 495 sets of four). */
const columnCache = new Map()

/**
 * The squares of every column of the map for the pins that hold a board, lowest level first (none for a void
 * column). The result is shared and must not be changed.
 *
 * @param {string[]} boards the pin of every attack board
 * @return {number[][]}
 */
export function columns(boards) {
	let mask = 0
	for (const name of boards) {
		mask |= 1 << PIN_INDEX[name]
	}
	let cols = columnCache.get(mask)
	if (cols === undefined) {
		cols = MAIN_COLS.map((c) => c.slice())
		PIN_SQUARES.forEach((list, p) => {
			if (mask & (1 << p)) {
				for (const sq of list) {
					cols[COL_OF[sq]].push(sq)
				}
			}
		})
		for (const c of cols) {
			c.sort((a, b) => a - b)
		}
		columnCache.set(mask, cols)
	}
	return cols
}

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
 * from `c` to the edge of the map (void columns included: riders fly across them, and whether a column is void
 * depends on the attack boards). With `range` 1 only the first column is kept.
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
			if (cols.length) {
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
