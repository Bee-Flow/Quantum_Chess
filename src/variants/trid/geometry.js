/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The shape of the Tri-Dimensional chess board, as plain data: the three 4 × 4 main levels, the twelve pins at their
 * corners on which the four 2 × 2 attack boards stand, which pins are next to each other, and the coordinates of every
 * square that a board can ever have. The topology and the rules build on it (board.js, layout.js, ../trid.js).
 *
 * The pins follow Meder's tournament rules: QL1 to QL6 on the queen's side (files z and a) and KL1 to KL6 on the
 * king's side (files d and e), numbered from White's side. Levels 1 and 2 are the back and front corners of W, 3 and 4
 * of N, 5 and 6 of B. A board on a pin overhangs that corner of its main level outwards, so it covers the corner
 * square's file and the file beyond it, and the corner square's rank and the rank beyond it: QL1 holds z0, a0, z1 and
 * a1, QL2 holds z4, a4, z5 and a5.
 */

/** The file letters, by file index. */
export const FILES = 'zabcde'

/** Width and height of the flat map seen from above. */
export const MAP_W = 6
export const MAP_H = 10

/** The main levels: their files and ranks. */
export const MAIN = Object.freeze({
	W: Object.freeze({ files: [1, 4], ranks: [1, 4] }),
	N: Object.freeze({ files: [1, 4], ranks: [3, 6] }),
	B: Object.freeze({ files: [1, 4], ranks: [5, 8] }),
})

/** The pins, from White's back corners (level 1) to Black's (level 6), the queen's side first on each level. */
export const PINS = Object.freeze(['QL1', 'KL1', 'QL2', 'KL2', 'QL3', 'KL3', 'QL4', 'KL4', 'QL5', 'KL5', 'QL6', 'KL6'])

/** The ranks a board covers on a pin of each level (index 1-6). */
const PIN_RANKS = [null, [0, 1], [4, 5], [2, 3], [6, 7], [4, 5], [8, 9]]
/** The main level whose corner a pin of each level is at. */
const PIN_MAIN = [null, 'W', 'W', 'N', 'N', 'B', 'B']

/**
 * Every pin: its name, its level (1-6), whether it is on the king's side, the files and ranks a board on it covers,
 * the main level it belongs to and the rank of that level's corner square (the square the board overhangs).
 */
export const PIN = Object.freeze(PINS.map((name) => {
	const level = Number(name[2])
	const ranks = PIN_RANKS[level]
	const main = PIN_MAIN[level]
	const corner = ranks.find((r) => r >= MAIN[main].ranks[0] && r <= MAIN[main].ranks[1])
	const king = name[0] === 'K'
	return Object.freeze({ name, level, king, files: king ? [4, 5] : [0, 1], ranks, main, corner })
}))

/** The index of a pin by name. */
export const PIN_INDEX = Object.freeze(Object.fromEntries(PINS.map((name, i) => [name, i])))

/**
 * The pins next to each pin (Meder art. 3.6): on the same side one or two levels up or down (the next pin of the same
 * main level or the next main level), and the pin across on the same level. So a pin of level 1 or 6 has three
 * neighbours, of level 2 or 5 four, and of level 3 or 4 five.
 */
export const ADJACENT = Object.freeze(PIN.map((p) => Object.freeze(PIN.map((q, j) => j).filter((j) => {
	const q = PIN[j]
	return q.king === p.king ? [1, 2].includes(Math.abs(q.level - p.level)) : q.level === p.level
}))))

/**
 * Which way a board goes from one pin to another: 1 towards Black (higher ranks), -1 towards White, 0 to the side.
 *
 * @param {number} from pin index
 * @param {number} to pin index
 * @return {number}
 */
export function direction(from, to) {
	return Math.sign(PIN[to].ranks[0] - PIN[from].ranks[0])
}

/** The boards in height order: W, the pins of its corners, N and its pins, B and its pins. */
export const LEVELS = Object.freeze(['W', ...PINS.slice(0, 4), 'N', ...PINS.slice(4, 8), 'B', ...PINS.slice(8)])

/** The level coordinate of the tabs: one square per pin that a player taps to move a board there or from there. */
export const TAB = LEVELS.length

/**
 * The files and ranks of a main level or of a board on a pin.
 *
 * @param {string} level `W`, `N`, `B` or a pin name
 * @return {{files: number[], ranks: number[]}}
 */
export function extentOf(level) {
	return MAIN[level] ?? PIN[PIN_INDEX[level]]
}

/**
 * The coordinates of every square, in index order: by level in height order, then by rank, then by file; then the
 * tabs `[pin, 0, TAB]`, in the order of `PINS`.
 *
 * @return {number[][]}
 */
function allCoords() {
	const out = []
	LEVELS.forEach((id, h) => {
		const { files, ranks } = extentOf(id)
		for (let y = ranks[0]; y <= ranks[1]; y++) {
			for (let x = files[0]; x <= files[1]; x++) {
				out.push([x, y, h])
			}
		}
	})
	PINS.forEach((name, i) => out.push([i, 0, TAB]))
	return out
}

/** The coordinates of every square and tab. */
export const COORDS = Object.freeze(allCoords())
