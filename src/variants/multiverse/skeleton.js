/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The static geometry of multiverse chess and its skeleton (handoff/research/multiverse-final.md sections 4 and 6.2
 * to 6.5).
 *
 * Time is counted in half turns: `v = 2·T + c` (c 0 White to move ○, 1 Black ●), so T1 ○ is 2 and T0 ● is 1; a
 * piece's step in time changes v by 2. Timelines are lines `l` (single start: L0 = 0, White's new lines +1, +2 …,
 * Black's −1, −2 …; even start: −0 is l −1 and +0 is l 0; three rows: −1, 0, +1). Each line lives in a fixed storage
 * row `u` (`uOf`), so square names never change. A row holds its latest board in slot 0 and its history boards in a
 * ring of `h` slots (board v in slot `1 + v % h`); older boards are sealed.
 *
 * A square is `((u · 9) + slot) · 64 + y · 8 + x` (cells of 8 × 8, smaller boards use the lower-left part), 6,336
 * squares in all. The skeleton (`x.tl`, `x.c`, `x.s`, `x.t`) is the same in every world: which rows exist, their
 * first and latest boards, the created counts, the side to move and its actions this turn. Everything here is a pure
 * function of it.
 */

import { makeTopology } from '../core/topology.js'

/** Storage rows: u 0 … 8 by the zig-zag of the line, 9 and 10 for −0 and +0 of an even start. */
export const ROWS = 11
/** History boards per row at the largest travel reach (4 turns). */
export const HMAX = 8
/** Board slots per row: slot 0 is the latest board, 1 … 8 the history ring. */
export const SLOTS = HMAX + 1
/** Cells per board slot (8 × 8). */
export const CELLS = 64
/** Squares of the static topology. */
export const SQUARES = ROWS * SLOTS * CELLS
/** The minus sign of timeline labels (U+2212, so that an ASCII `-` only ever separates a move). */
export const MINUS = '−'
/** The starting lines `[l0, l1]` per start mode `x.md`: one timeline, an even start (−0, +0), three timelines. */
export const START_LINES = Object.freeze([[0, 0], [-1, 0], [-1, 1]])
/** The storage rows of −0 and +0 in an even start. */
const EVEN_ROW = 9

/** File letters. */
const FILES = 'abcdefgh'
/** The names of the 64 cells, by `y · 8 + x`. */
export const CELL_NAMES = Array.from({ length: CELLS }, (_, c) => FILES[c % 8] + ((c >> 3) + 1))

/**
 * The shown number of a line of a single or three-row start: `0`, `+1`, `−1` …
 *
 * @param {number} l line
 * @return {string}
 */
function lineNumber(l) {
	return l === 0 ? '0' : l > 0 ? '+' + l : MINUS + -l
}

/**
 * The storage row of line `l`, or -1 outside the largest capacity `[l0 − 3, l1 + 3]` of the start mode (a line
 * outside the capacity of a game never exists; checking it before mapping keeps the even-start zig-zag from wrapping
 * onto −0 and +0).
 *
 * @param {number} l line
 * @param {number} md start mode (0 single, 1 even, 2 three rows)
 * @return {number}
 */
export function uOf(l, md) {
	const [l0, l1] = START_LINES[md]
	if (l < l0 - 3 || l > l1 + 3) {
		return -1
	}
	if (md === 1) {
		if (l === -1 || l === 0) {
			return EVEN_ROW + 1 + l
		}
		return l > 0 ? 2 * l : -2 * l - 3
	}
	return l >= 0 ? 2 * l : -2 * l - 1
}

/**
 * The line of storage row `u`.
 *
 * @param {number} u storage row
 * @param {number} md start mode
 * @return {number}
 */
export function lOf(u, md) {
	if (md === 1) {
		if (u === EVEN_ROW || u === EVEN_ROW + 1) {
			return u - EVEN_ROW - 1
		}
		return u % 2 === 0 ? u / 2 : -(u + 3) / 2
	}
	return u % 2 === 0 ? u / 2 : -(u + 1) / 2
}

/**
 * The player-facing label of every storage row: `0`, `−1`, `+1`, `−2`, `+2`, `−3`, `+3`, `−4`, `+4`, `−0`, `+0`. An
 * even start numbers its Black lines −1, −2 … from l −2 on, which the zig-zag puts in the same rows as a single
 * start's −1, −2 …
 */
export const LAB = Object.freeze(Array.from({ length: ROWS }, (_, u) => (u === EVEN_ROW
	? MINUS + '0'
	: u === EVEN_ROW + 1 ? '+0' : lineNumber(lOf(u, 0)))))

/**
 * A square from its row, slot and cell.
 *
 * @param {number} u storage row
 * @param {number} slot board slot (0 latest, 1 … 8 history)
 * @param {number} x file (0 …)
 * @param {number} y rank (0 …)
 * @return {number}
 */
export function sqOf(u, slot, x, y) {
	return (u * SLOTS + slot) * CELLS + y * 8 + x
}

/**
 * The row, slot and cell of a square.
 *
 * @param {number} sq square
 * @return {{u: number, slot: number, x: number, y: number}}
 */
export function decode(sq) {
	const cell = sq % CELLS
	const b = (sq - cell) / CELLS
	return { u: Math.floor(b / SLOTS), slot: b % SLOTS, x: cell % 8, y: cell >> 3 }
}

/**
 * The piece id that belongs to a cell of a row: live pieces get the slot-0 id of their cell when the row is created
 * and keep it; history cells own their ids. Ids follow the rows' creation order (`x.ord`), so they stay compact.
 *
 * @param {object} x the world's extra state
 * @param {number} u storage row
 * @param {number} slot board slot
 * @param {number} cx file
 * @param {number} cy rank
 * @return {number}
 */
export function idOf(x, u, slot, cx, cy) {
	return ((x.ord[u] * (x.h + 1)) + slot) * x.n * x.n + cy * x.n + cx
}

/**
 * The absolute name of a board, as in the move keys: `(0T5)`, `(+1T5)`, `(−1T3)`, `(−0T1)`.
 *
 * @param {number} u storage row
 * @param {number} v half-turn index of the board
 * @return {string}
 */
export function boardText(u, v) {
	return '(' + LAB[u] + 'T' + (v >> 1) + ')'
}

/**
 * The sign of the side to move on a board: ○ White, ● Black.
 *
 * @param {number} v half-turn index
 * @return {string}
 */
export function turnMark(v) {
	return v & 1 ? '●' : '○'
}

/**
 * The line range `[l0 − m, l1 + m]` in which lines can exist in a game (the cap of new timelines).
 *
 * @param {object} x the world's extra state
 * @return {number[]}
 */
export function lineRange(x) {
	const [l0, l1] = START_LINES[x.md]
	return [l0 - x.m, l1 + x.m]
}

/** The skeletons already computed, per extra-state object (never changed once its world is built). */
const skeletonCache = new WeakMap()

/**
 * @typedef {object} Skeleton
 * @property {boolean[]} active per storage row: whether its line is active (whether or not the row exists yet)
 * @property {(u: number) => boolean} act the same as a function
 * @property {number} present the earliest latest board of the existing active rows
 * @property {number[]} must the must-move rows of the side to move (active rows at the present, when the present is
 *   its board), ascending; must not be changed
 */

/**
 * The skeleton of a world: active lines, the present and the must-move rows. Cached per `x` object, so `x` must not
 * change after this is asked.
 *
 * A starting line is always active; White's k-th new line is active while Black has opened at least k − 1, and the
 * other way round.
 *
 * @param {object} x the world's extra state
 * @return {Skeleton}
 */
export function skeleton(x) {
	let k = skeletonCache.get(x)
	if (k !== undefined) {
		return k
	}
	const [l0, l1] = START_LINES[x.md]
	const active = []
	let present = Infinity
	for (let u = 0; u < ROWS; u++) {
		const l = lOf(u, x.md)
		const on = (l >= l0 && l <= l1) || (l > l1 ? l - l1 <= x.c[1] + 1 : l0 - l <= x.c[0] + 1)
		active.push(on)
		if (on && x.tl[u] !== null) {
			present = Math.min(present, x.tl[u][1])
		}
	}
	const must = []
	if ((present & 1) === x.s) {
		for (let u = 0; u < ROWS; u++) {
			if (active[u] && x.tl[u] !== null && x.tl[u][1] === present) {
				must.push(u)
			}
		}
	}
	k = { active, act: (u) => active[u], present, must }
	skeletonCache.set(x, k)
	return k
}

/**
 * Whether a side may play on row `u`: the row exists and its latest board is that side's.
 *
 * @param {object} x the world's extra state
 * @param {number} side side index
 * @param {number} u storage row
 * @return {boolean}
 */
export function playable(x, side, u) {
	return x.tl[u] !== null && (x.tl[u][1] & 1) === side
}

/**
 * The must-move rows of the side to move (its latest boards at the present), ascending. The array must not be
 * changed.
 *
 * @param {object} x the world's extra state
 * @return {number[]}
 */
export function mandatory(x) {
	return skeleton(x).must
}

/**
 * Whether the side to move may submit its turn: the present is not its board.
 *
 * @param {object} x the world's extra state
 * @return {boolean}
 */
export function canSubmit(x) {
	return (skeleton(x).present & 1) !== x.s
}

/**
 * The storage row of the next new timeline of a side: White's below the others (`l1 + cW + 1`), Black's above
 * (`l0 − cB − 1`).
 *
 * @param {object} x the world's extra state
 * @param {number} side side index
 * @return {number}
 */
export function newRowFor(x, side) {
	const [l0, l1] = START_LINES[x.md]
	return uOf(side === 0 ? l1 + x.c[0] + 1 : l0 - x.c[1] - 1, x.md)
}

/**
 * The slot in which board (u, v) is stored, or -1 when it is not (the row does not exist, the board is sealed,
 * later than the latest board or before the row's first board). `pass` marks rows that are passed virtually (the
 * phantom of 5D check): their latest board is then `en + 1`, with the pieces of slot 0, and their oldest stored
 * board is sealed.
 *
 * @param {object} x the world's extra state
 * @param {number} u storage row
 * @param {number} v half-turn index
 * @param {boolean[]|null} [pass] rows passed virtually
 * @return {number}
 */
export function slotAt(x, u, v, pass = null) {
	const e = x.tl[u]
	if (!e) {
		return -1
	}
	const en = pass && pass[u] ? e[1] + 1 : e[1]
	if (v < e[0] || v > en || en - v > x.h) {
		return -1
	}
	return v >= e[1] ? 0 : 1 + (v % x.h)
}

/**
 * The half-turn index of the board stored in a slot of row u, or -1 when that slot holds no board now.
 *
 * @param {object} x the world's extra state
 * @param {number} u storage row
 * @param {number} slot board slot
 * @return {number}
 */
export function vOfSlot(x, u, slot) {
	const [st, en] = x.tl[u]
	if (slot === 0) {
		return en
	}
	for (let v = en - 1; v >= Math.max(st, en - x.h); v--) {
		if (1 + (v % x.h) === slot) {
			return v
		}
	}
	return -1
}

/**
 * The absolute board and cell of a square as the skeleton stands: `{ u, v, x, y }` (v -1 when its slot holds no
 * board).
 *
 * @param {object} x the world's extra state
 * @param {number} sq square
 * @return {{u: number, v: number, x: number, y: number}}
 */
export function boardOf(x, sq) {
	const d = decode(sq)
	return { u: d.u, v: x.tl[d.u] ? vOfSlot(x, d.u, d.slot) : -1, x: d.x, y: d.y }
}

/**
 * The absolute text of a square, `(0T5)c3`, as the skeleton stands.
 *
 * @param {object} x the world's extra state
 * @param {number} sq square
 * @return {string}
 */
export function squareText(x, sq) {
	const b = boardOf(x, sq)
	return boardText(b.u, b.v) + CELL_NAMES[b.y * 8 + b.x]
}

/** The coordinates `[x, y, slot, u]` of every square, in square order. */
const COORDS = []
for (let u = 0; u < ROWS; u++) {
	for (let slot = 0; slot < SLOTS; slot++) {
		for (let y = 0; y < 8; y++) {
			for (let x = 0; x < 8; x++) {
				COORDS.push([x, y, slot, u])
			}
		}
	}
}

/**
 * The static topology: every square has a readable name, `(0)c3` on a latest board and `(0)~3c3` in history slot 3
 * (split, merge and measure codes use them). The plain grid of `cell` is never drawn: the board always comes from
 * `layoutOf`.
 */
export const topology = makeTopology({
	coords: COORDS,
	name: ([x, y, slot, u]) => '(' + LAB[u] + ')' + (slot ? '~' + slot : '') + CELL_NAMES[y * 8 + x],
	cell: ([x, y, slot, u]) => ({ x: slot * 9 + x, y: u * 9 + 7 - y, w: 1, h: 1, shape: 'rect', shade: 'light' }),
})
