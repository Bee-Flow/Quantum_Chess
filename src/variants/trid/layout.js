/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The drawing of Tri-Dimensional chess for a set of occupied pins, White's view (rank 9 at the top).
 *
 * W and B form one column, B above W, with a file running straight up through both (`z` = x 0 … `e` = x 5); N stands
 * to their right (its `z` at x 6). Every pin has a slot of 2 × 2 cells next to the corner it belongs to, in a band of
 * two rows: QL6 and KL6 above B, QL1 and KL1 below W, QL4 and KL4 above N, QL3 and KL3 below N, and between B and W
 * one inner band for the pins at ranks 4 and 5 (QL5 and KL5 at B's corners, QL2 and KL2 at W's). A board in a band
 * keeps its files (QL slots at x 0-2, KL slots at x 4-6 in the left column) and its ranks run down its band, so each
 * attack board abuts the corner it is pinned to, one row further out. QL2 and QL5 share the inner band's QL slot (and
 * KL2 and KL5 its KL slot): they cover the same map squares, at two heights. When boards stand on both, a second
 * inner band opens, B's pins above W's.
 *
 * An empty slot is a dashed outline; its squares do not exist and are not drawn. Every pin also has a tab: a small
 * square with the pin's name in the middle of its band, on the row of the corner (wooden while a board stands on the
 * pin, pale while it is free), which the player taps to move a board from there or to there. N stands with its ranks
 * 4 and 5 level with the inner band, so N's bands are level with the ranks of B (QL4 and KL4: 7 and 6) and W (QL3 and
 * KL3: 3 and 2); with two inner bands N is centred on both, so its bands stand half a band below B's ranks and half a
 * band above W's. With one inner band the drawing is 12 × 16 units: a phone shows it whole at about 28 px per square,
 * a desktop at about 50.
 */

import { t } from '@nextcloud/l10n'
import { COORDS, extentOf, FILES, LEVELS, MAIN, PIN, PINS, TAB } from './geometry.js'

/** Room for the file letters above and below the drawing. */
const LETTERS = 0.6
/** The gap between a band and the board next to it. */
const GAP = 0.2
/** The x of file `z` in the right column (N and its pins). */
const RIGHT = 6
/** The width of the drawing. */
const WIDTH = 12
/**
 * How far below the top of a tab its pin name stands (the middle of the text): high enough that the dot marking a
 * free pin as a target, in the middle of the tab, leaves the name readable.
 */
const NAME_Y = 0.19

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
 * Where everything goes for a set of occupied pins: the top of each main level (`tops`), the top of the band of the
 * pins of each level 1-6 (`bands`), and the height. A second inner band opens when both pins of one side of it are
 * occupied.
 *
 * @param {boolean[]} occupied per pin (by index), whether a board stands there
 * @return {object}
 */
function frame(occupied) {
	const on = (name) => occupied[PINS.indexOf(name)]
	const two = (on('QL2') && on('QL5')) || (on('KL2') && on('KL5'))
	const top6 = LETTERS
	const topB = top6 + 2 + GAP
	const inner5 = topB + 4 + GAP
	const inner2 = two ? inner5 + 2 + GAP : inner5
	const topW = inner2 + 2 + GAP
	const top1 = topW + 4 + GAP
	// N's middle at the middle of the inner band(s): with one band its ranks 5 and 4 are level with the band's
	const topN = (inner5 + inner2 + 2) / 2 - 2
	const tops = { W: topW, N: topN, B: topB }
	const bands = [null, top1, inner2, topN + 4 + GAP, topN - GAP - 2, inner5, top6]
	return { occupied, tops, bands, height: round(top1 + 2 + LETTERS) }
}

/**
 * The x of file `z` for a main level or a pin: N and its pins stand in the right column.
 *
 * @param {string} level `W`, `N`, `B` or a pin name
 * @return {number}
 */
function columnX(level) {
	const main = PIN[PINS.indexOf(level)]?.main ?? level
	return main === 'N' ? RIGHT : 0
}

/**
 * The top-left corner of the cell of file `x`, rank `y` of a level (a main level or a pin's slot).
 *
 * @param {object} f frame
 * @param {string} level level
 * @param {number} x file
 * @param {number} y rank
 * @return {{x: number, y: number}}
 */
function cellAt(f, level, x, y) {
	const pin = PINS.indexOf(level)
	const top = pin >= 0 ? f.bands[PIN[pin].level] : f.tops[level]
	return { x: columnX(level) + x, y: round(top + extentOf(level).ranks[1] - y) }
}

/**
 * The top-left corner of a pin's tab: in the middle of its band (QL at the left, KL at the right), on the row of the
 * corner the pin is at.
 *
 * @param {object} f frame
 * @param {number} pin pin index
 * @return {{x: number, y: number}}
 */
function tabAt(f, pin) {
	const p = PIN[pin]
	return { x: columnX(p.name) + (p.king ? 3 : 2), y: round(f.bands[p.level] + p.ranks[1] - p.corner) }
}

/**
 * The cell of a square or tab: a tab is wooden while a board stands on its pin and pale while the pin is free.
 *
 * @param {object} f frame
 * @param {number[]} c coordinates
 * @return {object}
 */
function cellOf(f, [x, y, h]) {
	if (h === TAB) {
		return { ...tabAt(f, x), w: 1, h: 1, shape: 'rect', shade: f.occupied[x] ? 'wood' : 'camp' }
	}
	return { ...cellAt(f, LEVELS[h], x, y), w: 1, h: 1, shape: 'rect', shade: (x + y) % 2 === 0 ? 'dark' : 'light' }
}

/**
 * The four sides of a rectangle as dashed outline segments (an empty slot).
 *
 * @param {object[]} out outlines
 * @param {number} x left
 * @param {number} y top
 */
function dashed(out, x, y) {
	out.push(
		{ x1: x, y1: y, x2: x + 2, y2: y, kind: 'next' },
		{ x1: x + 2, y1: y, x2: x + 2, y2: y + 2, kind: 'next' },
		{ x1: x + 2, y1: y + 2, x2: x, y2: y + 2, kind: 'next' },
		{ x1: x, y1: y + 2, x2: x, y2: y, kind: 'next' },
	)
}

/**
 * The frames, outlines and labels: a frame per main level and per attack board, a dashed outline per empty slot, the
 * rank numbers left of every row (the main levels' right beside file a, the bands' outside their slots), the file
 * letters above and below the left column and under N's lower band, the names of W, B and N beside them, and each
 * pin's name on its tab.
 *
 * @param {object} f frame
 * @param {boolean[]} occupied per pin, whether a board stands there
 * @return {object} layout extras
 */
function extras(f, occupied) {
	const boards = []
	const outlines = []
	const labels = []
	for (const id of ['W', 'N', 'B']) {
		const { files, ranks } = MAIN[id]
		boards.push({ ...cellAt(f, id, files[0], ranks[1]), w: 4, h: 4 })
		for (let r = ranks[0]; r <= ranks[1]; r++) {
			labels.push({ x: columnX(id) + 0.7, y: round(cellAt(f, id, 0, r).y + 0.5), text: String(r) })
		}
	}
	const drawn = new Set()
	const numbered = new Set()
	PIN.forEach((p, i) => {
		const at = cellAt(f, p.name, p.files[0], p.ranks[1])
		const slot = at.x + ':' + at.y
		if (occupied[i]) {
			boards.push({ ...at, w: 2, h: 2 })
			drawn.add(slot)
		}
		const band = columnX(p.name) + ':' + at.y
		if (!numbered.has(band)) {
			numbered.add(band)
			for (const r of p.ranks) {
				labels.push({ x: columnX(p.name) - 0.3, y: round(cellAt(f, p.name, 0, r).y + 0.5), text: String(r) })
			}
		}
		const tab = tabAt(f, i)
		labels.push({ x: tab.x + 0.5, y: round(tab.y + NAME_Y), text: p.name, kind: 'row' })
	})
	PIN.forEach((p, i) => {
		const at = cellAt(f, p.name, p.files[0], p.ranks[1])
		const slot = at.x + ':' + at.y
		if (!occupied[i] && !drawn.has(slot)) {
			drawn.add(slot)
			dashed(outlines, at.x, at.y)
		}
	})
	const bottom3 = f.bands[3] + 2
	for (let x = 0; x < FILES.length; x++) {
		labels.push(
			{ x: x + 0.5, y: round(LETTERS - 0.3), text: FILES[x] },
			{ x: x + 0.5, y: round(f.height - LETTERS + 0.3), text: FILES[x] },
			{ x: RIGHT + x + 0.5, y: round(bottom3 + 0.3), text: FILES[x] },
		)
	}
	labels.push(
		{ x: 5.45, y: round(f.tops.B + 0.5), text: 'B' },
		{ x: 5.45, y: round(f.tops.W + 3.5), text: 'W' },
		{ x: RIGHT + 5.45, y: round(f.tops.N + 2), text: 'N' },
	)
	return { width: WIDTH, height: f.height, boards, outlines, labels }
}

/**
 * The drawing for a set of occupied pins: `{ cells, layout }`, where `cells` has a cell for every square and tab of
 * the board (also the squares of empty pins, in their slots) and `layout` the frames, outlines and labels.
 *
 * @param {string[]} boards the pin of every attack board
 * @return {{cells: object[], layout: object}}
 */
export function drawing(boards) {
	const occupied = PINS.map((name) => boards.includes(name))
	const f = frame(occupied)
	return { cells: COORDS.map((c, sq) => ({ sq, ...cellOf(f, c) })), layout: extras(f, occupied) }
}

/**
 * The cell of every square and tab for the pins the attack boards start on, for `makeTopology`.
 *
 * @param {string[]} boards the pin of every attack board
 * @return {(c: number[]) => object}
 */
export function cellsFor(boards) {
	const f = frame(PINS.map((name) => boards.includes(name)))
	return (c) => cellOf(f, c)
}

/** The layouts already built, by the set of occupied pins (at most 495 sets of four). */
const memo = new Map()

/**
 * The layout of a position for the board component (`layoutOf`): `{ size, names, cells, layout }`, with a cell for
 * every square that exists (the main levels and the squares of the pins that hold a board) and for every tab. A tab's
 * accessible name says whether a board stands on its pin.
 *
 * @param {object} topology the topology (its size and square names)
 * @param {string[]} boards the pin of every attack board
 * @return {object}
 */
export function layoutFor(topology, boards) {
	const occupied = PINS.map((name) => boards.includes(name))
	const key = occupied.map(Number).join('')
	let made = memo.get(key)
	if (made === undefined) {
		const { cells, layout } = drawing(boards)
		const exists = (sq) => {
			const h = COORDS[sq][2]
			const pin = h === TAB ? -1 : PINS.indexOf(LEVELS[h])
			return pin < 0 || occupied[pin]
		}
		const names = topology.names.map((name, sq) => {
			const [x, , h] = COORDS[sq]
			if (h !== TAB) {
				return name
			}
			return occupied[x]
				// TRANSLATORS: Tri-D chess, read out by screen readers; {pin} is the name of a pin, such as QL1
				? t('quantumchess', 'Attack board on {pin}', { pin: PINS[x] })
				// TRANSLATORS: Tri-D chess, read out by screen readers; {pin} is the name of a pin, such as QL3
				: t('quantumchess', 'Free pin {pin}', { pin: PINS[x] })
		})
		made = { size: topology.size, names, cells: cells.filter((c) => exists(c.sq)), layout }
		memo.set(key, made)
	}
	return made
}
