/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The drawing of the multiverse (handoff/research/multiverse-final.md section 9). Every timeline is a row, Black's
 * above White's (the other way round with the `view` option `black`, which also turns every board by 180°), and time
 * runs to the right: one column per half-turn index that some row stores, plus the column of the next board of every
 * row the side to move may play. Where time jumps by more than one column, a narrow gap marked "⋯" stands in for the
 * boards that no row stores.
 *
 * Drawn are every square of every stored board, exactly once (latest boards in full colour, history boards washed
 * out, the royal squares of the side to move that the opponent threatens in the danger shade), a frame per board in
 * the colour of the side to move there (light for ○ White, dark for ● Black, so time reads along a row), a label per
 * board (timeline, time and whose move; "must move" or "optional" on the boards the side to move may play, lifted
 * above their halo; `pin` is the name a zoomed view pins to its top edge, always with the timeline), the present band
 * with "Now", gold halos around the must-move boards and blue ones around the optional boards, a hatched band behind
 * an inactive timeline, the branch connectors (lines, under the cells, in the colour of the side that opened the
 * timeline), and above the cells the dashed placeholders of the next boards (outlines of kind `next`), the travel
 * arrows of the turn in progress and of the opponent's last turn (kind `travel`, one outline each: from the square
 * left on the source row's new board to the square reached, bowed through the rows when it crosses timelines and
 * time, with a head drawn by the board) and the threat lines of 5D check (kind `threat`: from the attacker's square on
 * the board the capture would be made from, the placeholder of a must-move board, to the royal square). The header
 * ("New timelines …, travel back …") is `caption`, shown above the drawing as text. Labels carry `fit`, the room they
 * have, so the board may keep them readable at any zoom.
 *
 * The focus frames the boards to play (`box`: all of them with their placeholders; `alt`: only the must-move ones, for
 * a screen too small for the first at `minPx` pixels per unit; `stops`: each board to play, for "next board"). At the
 * end of a game it frames the boards that decided it (the capture, or the loser's must-move boards with the royal
 * pieces that could be taken). Its key changes only when those boards change, so the view recentres after a
 * must-move board is played, a timeline opens, the turn passes or the game ends.
 *
 * One square is one unit. A layout depends only on the skeleton, the view, the records of the last two turns, the
 * threats and the result, so the last few are kept: the same drawing comes back when the board is drawn again or a
 * move is undone, not many moves later, and a large layout is big (8 × 8 with 4,000 cells: about 0.7 MB).
 */

import { t } from '@nextcloud/l10n'
import { generate } from '../core/world.js'
import { ROYAL } from './pieces.js'
import {
	CELL_NAMES,
	decode,
	LAB,
	lOf,
	mandatory,
	playable,
	ROWS,
	skeleton,
	sqOf,
	topology,
	turnMark,
	vOfSlot,
} from './skeleton.js'
import { captionOf, lastTurnRecords } from './texts.js'

/** The margin left of the boards, where the row labels stand (cell units). */
const LEFT = 3
/** The margin above the boards: "Now" and the board labels. */
const TOP = 2.2
/** The width of a gap column, where time jumps. */
const GAP = 1.2
/** The margin right of the last column. */
const RIGHT = 0.4
/** How far the present band reaches beyond its column and below the last row. */
const BAND = 0.4
/** How far the present band reaches above the first row (over the board labels). */
const BAND_TOP = 1.2
/** The height of the "Now" label above the first row. */
const NOW = 1.6
/** How far the gold and blue halos reach beyond their board (the frame takes the inner 0.16). */
const HALO = 0.4
/** How far a lifted board label stands above its board: clear of the halo. */
const LIFT = HALO + 0.02
/** How far the room of a board's label reaches above the board, for the focus. */
const LABEL_ROOM = 1
/** The fewest pixels per unit the focus asks for (a 5 × 5 board of 160 px; the ghost badges show from there). */
const FOCUS_PX = 32
/** The most pixels per unit the focus asks for (a single board is not blown up on a large screen). */
const FOCUS_MAX_PX = 64
/** With a mouse, every board to play is framed down to this many pixels per unit (the ghost badges still show). */
const FOCUS_FINE_PX = 26
/** How many layouts are kept (64 held about 45 MB in a long 8 × 8 game). */
const MEMO_SIZE = 8
/** The colours of the branch connectors, by the side that opened the timeline (White's a warm grey, Black's dark). */
const SIDE_LINE = ['#b3a58c', '#6b7075']

/** The layouts already made, by key, least recently used first. */
const memo = new Map()

/**
 * @typedef {object} Grid
 * @property {number} n board size
 * @property {number} view 0 White at the bottom, 1 Black at the bottom (rows reversed, boards turned)
 * @property {number[]} rows the storage rows from top to bottom
 * @property {number[]} rowY per storage row: the top edge of its boards (−1 when the row does not exist)
 * @property {number[]} cols the half-turn indices of the columns, ascending
 * @property {Map<number, number>} colX per half-turn index: the left edge of its column
 * @property {number[]} gaps the centres of the gap columns
 * @property {number} gx the space between two columns
 * @property {number} pitchX the distance between two neighbouring columns
 * @property {number} pitchY the distance between two neighbouring rows
 * @property {number} top the top edge of the first row
 * @property {number} width the width of the drawing
 * @property {number} height the height of the drawing
 */

/**
 * The oldest board of row u that is still stored (older ones are sealed).
 *
 * @param {object} x the world's extra state
 * @param {number} u storage row
 * @return {number}
 */
function firstShown(x, u) {
	const [st, en] = x.tl[u]
	return Math.max(st, en - x.h)
}

/**
 * Whether board (u, v) is drawn: its row exists and the board is stored.
 *
 * @param {object} x the world's extra state
 * @param {number} u storage row
 * @param {number} v half-turn index
 * @return {boolean}
 */
function shown(x, u, v) {
	const e = x.tl[u] ?? null
	return e !== null && v >= firstShown(x, u) && v <= e[1]
}

/**
 * The time of a board as it is written on it: `T5 ●`.
 *
 * @param {number} v half-turn index
 * @return {string}
 */
function timeText(v) {
	return 'T' + (v >> 1) + '\u00a0' + turnMark(v)
}

/**
 * The 5D check of the side to move: every `[attacker, royal]` pair of squares from which the waiting side could
 * capture a royal piece of the side to move, in some world, if the side to move passed its must-move boards. These
 * are the phantom moves of `generate`, which the danger line has already made and the core keeps per world. When the
 * game is over they are kept only after checkmate, where they are the reason (the loser is the side to move).
 *
 * @param {object} V variant
 * @param {object} state state
 * @return {number[][]}
 */
export function threats(V, state) {
	if (state.result && state.result.reason !== 'checkmate') {
		return []
	}
	const side = state.turn
	const out = new Map()
	for (const { b } of state.worlds) {
		for (const m of generate(V, b, 1 - side).values()) {
			const victim = m.capture
			if (victim >= 0 && b.sd[victim] === side && ROYAL.has(b.ty[victim])) {
				const royal = b.sq[victim]
				out.set(m.from + ':' + royal, [m.from, royal])
			}
		}
	}
	return [...out.values()]
}

/**
 * The columns and rows of the drawing.
 *
 * @param {object} x the world's extra state
 * @param {number} view 0 White at the bottom, 1 Black
 * @param {boolean[]} open per storage row: whether the side to move may play it (it gets a placeholder column)
 * @return {Grid}
 */
function gridOf(x, view, open) {
	const n = x.n
	const gx = n >= 7 ? 1.6 : 1.1
	const pitchY = n + (n >= 7 ? 2 : 1.6)
	const rows = []
	for (let u = 0; u < ROWS; u++) {
		if (x.tl[u]) {
			rows.push(u)
		}
	}
	// Black's timelines on top and White's below, so White's way forward across timelines is up, like its pawns
	rows.sort((a, b) => lOf(a, x.md) - lOf(b, x.md))
	if (view) {
		rows.reverse()
	}
	const times = new Set()
	for (const u of rows) {
		for (let v = firstShown(x, u); v <= x.tl[u][1]; v++) {
			times.add(v)
		}
		if (open[u]) {
			times.add(x.tl[u][1] + 1)
		}
	}
	const cols = [...times].sort((a, b) => a - b)
	const colX = new Map()
	const gaps = []
	let right = LEFT
	for (let i = 0; i < cols.length; i++) {
		if (i > 0 && cols[i] - cols[i - 1] > 1) {
			// the gap runs from the right edge of the boards before it to the left edge of those after it
			gaps.push(right - gx + (gx + GAP) / 2)
			right += GAP
		}
		colX.set(cols[i], right)
		right += n + gx
	}
	const width = right + RIGHT
	// the content only: the board fills the height of the screen itself (`fill`), and a view never shows empty space
	// past the first or last row
	const height = TOP + rows.length * pitchY
	const top = TOP
	const rowY = new Array(ROWS).fill(-1)
	rows.forEach((u, i) => {
		rowY[u] = top + i * pitchY
	})
	return { n, view, rows, rowY, cols, colX, gaps, gx, pitchX: n + gx, pitchY, top, width, height }
}

/**
 * The top-left corner of cell (cx, cy) of the drawn board (u, v): White's view has rank 1 at the bottom and file a on
 * the left, Black's view turns the board.
 *
 * @param {Grid} grid grid
 * @param {number} u storage row
 * @param {number} v half-turn index
 * @param {number} cx file
 * @param {number} cy rank
 * @return {number[]} `[x, y]`
 */
function cellAt(grid, u, v, cx, cy) {
	const bx = grid.colX.get(v)
	const by = grid.rowY[u]
	return grid.view ? [bx + grid.n - 1 - cx, by + cy] : [bx + cx, by + grid.n - 1 - cy]
}

/**
 * The centre of cell (cx, cy) of the drawn board (u, v).
 *
 * @param {Grid} grid grid
 * @param {number} u storage row
 * @param {number} v half-turn index
 * @param {number} cx file
 * @param {number} cy rank
 * @return {number[]} `[x, y]`
 */
function centreOf(grid, u, v, cx, cy) {
	const [px, py] = cellAt(grid, u, v, cx, cy)
	return [px + 0.5, py + 0.5]
}

/**
 * The centre of the drawn square `sq`, or null when its board is not drawn.
 *
 * @param {object} x the world's extra state
 * @param {Grid} grid grid
 * @param {number} sq square
 * @return {number[]|null}
 */
function squareCentre(x, grid, sq) {
	const d = decode(sq)
	if (!x.tl[d.u]) {
		return null
	}
	const v = vOfSlot(x, d.u, d.slot)
	return v >= 0 && shown(x, d.u, v) ? centreOf(grid, d.u, v, d.x, d.y) : null
}

/**
 * Four outlines around a rectangle.
 *
 * @param {object[]} outlines where they go
 * @param {number} x left edge
 * @param {number} y top edge
 * @param {number} w width
 * @param {number} h height
 * @param {string} kind the kind of outline
 */
function rectangle(outlines, x, y, w, h, kind) {
	outlines.push(
		{ x1: x, y1: y, x2: x + w, y2: y, kind },
		{ x1: x + w, y1: y, x2: x + w, y2: y + h, kind },
		{ x1: x + w, y1: y + h, x2: x, y2: y + h, kind },
		{ x1: x, y1: y + h, x2: x, y2: y, kind },
	)
}

/**
 * A travel arrow as one outline (the board draws its head): from the square the piece left, on the source row's new
 * board (a jump to another timeline at the same time is then vertical), to the square it reached. An arrow that
 * crosses both timelines and time is bowed: it leaves along the source column and reaches its square along the target
 * row, so it does not cut straight across unrelated boards; a vertical one that passes other rows bows out into the
 * gap right of its column.
 *
 * @param {object[]} outlines where it goes
 * @param {number[]} from start `[x, y]`
 * @param {number[]} to end `[x, y]`
 * @param {number} gapX the middle of the gap right of the source column
 * @param {Grid} grid grid
 */
function travelArrow(outlines, [x1, y1], [x2, y2], gapX, grid) {
	const arrow = { x1, y1, x2, y2, kind: 'travel' }
	const dx = Math.abs(x2 - x1)
	const dy = Math.abs(y2 - y1)
	// the left edge of the gap left of the source column: both ends right of it are in that column
	const column = gapX - grid.pitchX
	if (dy > grid.pitchY + 0.5 && x1 > column && x2 > column) {
		// within one column across other rows: the curve's middle (halfway to its control point) in the gap
		arrow.cx = 2 * gapX - (x1 + x2) / 2
		arrow.cy = (y1 + y2) / 2
	} else if (dx > 0.5 && dy > 0.5) {
		arrow.cx = x1
		arrow.cy = y2
	}
	outlines.push(arrow)
}

/**
 * The label of a board: `L+1 T5 ●` on a latest board, `T4 ○` on a history board, and on a board the side to move may
 * play whether it must or may; a latest board of an inactive timeline says so.
 *
 * @param {number} u storage row
 * @param {number} v half-turn index
 * @param {boolean} latest whether it is the row's latest board
 * @param {string|null} role 'must', 'optional' or null
 * @param {boolean} inactive whether the row's timeline is inactive
 * @return {string}
 */
function boardLabel(u, v, latest, role, inactive) {
	const board = latest ? 'L' + LAB[u] + ' ' + timeText(v) : timeText(v)
	if (role === 'must') {
		// TRANSLATORS: a board label of the multiverse, "L+1 T5 ● · must move": you have to move on it this turn
		return t('quantumchess', '{board} · must move', { board })
	}
	if (role === 'optional') {
		if (latest && inactive) {
			// TRANSLATORS: a board label of the multiverse: you may move on it; its timeline does not hold the present
			return t('quantumchess', '{board} · optional, inactive', { board })
		}
		// TRANSLATORS: a board label of the multiverse, "L+1 T5 ● · optional": you may move on it this turn
		return t('quantumchess', '{board} · optional', { board })
	}
	if (latest && inactive) {
		// TRANSLATORS: a board label of the multiverse: its timeline is inactive (it does not hold back the present)
		return t('quantumchess', '{board} · inactive', { board })
	}
	return board
}

/**
 * The accessible name of a board, which its squares' names continue with ": c3".
 *
 * @param {number} u storage row
 * @param {number} v half-turn index
 * @return {string}
 */
function boardName(u, v) {
	const vars = { line: LAB[u], turn: v >> 1 }
	if (v & 1) {
		// TRANSLATORS: read out for a board of the multiverse, then ": c3" (its timeline, its turn, whose move)
		return t('quantumchess', 'Timeline {line}, turn {turn}, Black to move', vars)
	}
	// TRANSLATORS: read out for a board of the multiverse, then ": c3" (its timeline, its turn, whose move)
	return t('quantumchess', 'Timeline {line}, turn {turn}, White to move', vars)
}

/**
 * Draw board (u, v): its cells and their names, its frame and label, and the halo of a board to play.
 *
 * @param {object} x the world's extra state
 * @param {Grid} grid grid
 * @param {object} out the drawing so far
 * @param {number} u storage row
 * @param {number} v half-turn index
 * @param {string|null} role 'must', 'optional' or null
 * @param {object} ctx what the rows share (see `drawRow`)
 */
function drawBoard(x, grid, out, u, v, role, ctx) {
	const n = grid.n
	const latest = v === x.tl[u][1]
	const slot = latest ? 0 : 1 + (v % x.h)
	const bx = grid.colX.get(v)
	const by = grid.rowY[u]
	if (role) {
		out.areas.push({
			x: bx - HALO,
			y: by - HALO,
			w: n + 2 * HALO,
			h: n + 2 * HALO,
			shade: role === 'must' ? 'must' : 'optional',
		})
	}
	const inactive = !ctx.sk.act(u)
	const label = boardLabel(u, v, latest, role, inactive)
	out.boards.push({
		x: bx,
		y: by,
		w: n,
		h: n,
		label,
		// a zoomed view pins the name to its top edge, where the row labels are out of sight: with the timeline
		pin: latest ? label : 'L' + LAB[u] + ' ' + timeText(v),
		frame: v & 1 ? 'dark' : 'light',
		...(role ? { lift: LIFT } : {}),
	})
	const name = boardName(u, v) + ': '
	for (let cy = 0; cy < n; cy++) {
		for (let cx = 0; cx < n; cx++) {
			const sq = sqOf(u, slot, cx, cy)
			const [px, py] = cellAt(grid, u, v, cx, cy)
			const dark = (cx + cy) % 2 === 0
			const shade = ctx.hot.has(sq) ? 'danger' : dark ? (latest ? 'dark' : 'mid') : 'light'
			out.cells.push({ sq, x: px, y: py, w: 1, h: 1, shape: 'rect', shade })
			out.names[sq] = name + CELL_NAMES[cy * 8 + cx]
		}
	}
}

/**
 * Draw row u: its labels, its stored boards, the placeholder of its next board when the side to move may play it,
 * the hatched band of an inactive timeline, and the connector from its parent board.
 *
 * @param {object} x the world's extra state
 * @param {Grid} grid grid
 * @param {object} out the drawing so far
 * @param {number} u storage row
 * @param {object} ctx what the rows share
 * @param {object} ctx.sk the skeleton
 * @param {Set<number>} ctx.must the must-move rows
 * @param {boolean[]} ctx.open the rows the side to move may play
 * @param {Set<number>} ctx.fresh the rows opened in the last two turns
 * @param {Set<number>} ctx.hot the threatened royal squares
 * @param {Map<number, number>} ctx.links per parent row, how many connectors leave its left margin so far
 */
function drawRow(x, grid, out, u, ctx) {
	const { sk, must, open, fresh } = ctx
	const n = grid.n
	const [st, en, pu, pv] = x.tl[u]
	const by = grid.rowY[u]
	const mid = by + n / 2
	const first = firstShown(x, u)
	out.labels.push({ x: LEFT / 2, y: mid - 0.3, text: 'L' + LAB[u], fit: LEFT - 0.4, kind: 'row' })
	let note = null
	if (!sk.act(u)) {
		// TRANSLATORS: under the name of an inactive timeline of the multiverse (it does not hold back the present)
		note = t('quantumchess', 'inactive')
		const x1 = grid.colX.get(first) - 0.5
		const x2 = grid.colX.get(open[u] ? en + 1 : en) + n + 0.5
		out.areas.push({ x: x1, y: by - 0.5, w: x2 - x1, h: n + 1, shade: 'inactive' })
	} else if (fresh.has(u)) {
		// TRANSLATORS: under the name of a timeline of the multiverse that was opened in the last two turns
		note = t('quantumchess', 'new')
	}
	if (note) {
		out.labels.push({ x: LEFT / 2, y: mid + 0.5, text: note, fit: LEFT - 0.4, kind: 'note' })
	}
	if (first > st) {
		// the row's older boards are sealed
		out.labels.push({ x: grid.colX.get(first) - grid.gx / 2, y: mid, text: '⋯', fit: grid.gx, kind: 'gap' })
	}
	for (let v = first; v <= en; v++) {
		const role = v === en && open[u] ? (must.has(u) ? 'must' : 'optional') : null
		drawBoard(x, grid, out, u, v, role, ctx)
	}
	if (open[u]) {
		const bx = grid.colX.get(en + 1)
		rectangle(out.outlines, bx, by, n, n, 'next')
		out.labels.push({ x: bx + n / 2, y: mid, text: timeText(en + 1), fit: n - 0.4, kind: 'next' })
	}
	if (pu !== null && pu !== undefined && x.tl[pu]) {
		// in the colour of the side that opened the timeline: White's rows are below the start, Black's above
		const color = SIDE_LINE[lOf(u, x.md) > 0 ? 0 : 1]
		const tx = grid.colX.get(first)
		if (shown(x, pu, pv)) {
			// from the right edge of the parent board to the left edge of the row's first board
			out.lines.push({ x1: grid.colX.get(pv) + n, y1: grid.rowY[pu] + n / 2, x2: tx, y2: mid, color })
		} else {
			// the parent board is sealed: from just below the parent row's middle (its "⋯" and name stay clear), down
			// the margin right of the names (a lane per child, so connectors do not merge), then into the left edge of
			// the row's first board
			const k = ctx.links.get(pu) ?? 0
			ctx.links.set(pu, k + 1)
			const lane = LEFT - 0.8 + 0.25 * (k % 3)
			const py = grid.rowY[pu] + n / 2 + Math.sign(mid - grid.rowY[pu] - n / 2) * 0.45
			out.lines.push({ x1: lane, y1: py, x2: lane, y2: mid, color })
			out.lines.push({ x1: lane, y1: mid, x2: tx, y2: mid, color })
		}
	}
}

/**
 * A rectangle that grows to hold boards and their labels.
 *
 * @return {{grow: (x1: number, y1: number, x2: number, y2: number) => void, box: () => object|null}}
 */
function bounds() {
	let r = null
	return {
		grow(x1, y1, x2, y2) {
			r = r
				? { x1: Math.min(r.x1, x1), y1: Math.min(r.y1, y1), x2: Math.max(r.x2, x2), y2: Math.max(r.y2, y2) }
				: { x1, y1, x2, y2 }
		},
		box: () => r,
	}
}

/**
 * The focus frame of a rectangle: its centre and its size with a margin.
 *
 * @param {object} r rectangle `{ x1, y1, x2, y2 }`
 * @return {{x: number, y: number, box: {w: number, h: number}}}
 */
function frameOf(r) {
	return { x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2, box: { w: r.x2 - r.x1 + 0.6, h: r.y2 - r.y1 + 0.6 } }
}

/**
 * The focus. While the game runs: `box` holds every board the side to move may play with its placeholder, `alt` only
 * the must-move ones (for a screen on which the first would give fewer than `minPx` pixels per unit, `fineMinPx` with
 * a mouse), and the royal
 * squares the opponent threatens when their board is within a column or a row; `stops` are the boards to play one by
 * one (must-move first). At the end: the boards of the deciding capture, or the loser's must-move boards and the
 * boards of the royal pieces that could be taken (these alone in `alt`). Without any of these, the present column. At
 * most `maxPx` pixels per unit. Its `key` changes only when these boards change.
 *
 * @param {object} x the world's extra state
 * @param {Grid} grid grid
 * @param {object} ctx what decides the focus
 * @param {object} ctx.sk the skeleton
 * @param {Set<number>} ctx.must the must-move rows
 * @param {boolean[]} ctx.open the rows the side to move may play
 * @param {number[]} ctx.royal the threatened royal squares
 * @param {object|null} ctx.result the result of the game
 * @param {object[]} ctx.recent the records of the last two turns
 * @return {object}
 */
function focusOf(x, grid, { sk, must, open, royal, result, recent }) {
	const n = grid.n
	const board = (acc, u, v) => {
		const bx = grid.colX.get(v)
		const by = grid.rowY[u]
		acc.grow(bx - 0.4, by - LABEL_ROOM, bx + n + 0.4, by + n + 0.4)
	}
	const all = bounds()
	const needed = bounds()
	const stops = []
	let tag = ''
	if (!result) {
		for (const want of [true, false]) {
			for (const u of grid.rows) {
				if (!open[u] || must.has(u) !== want) {
					continue
				}
				const en = x.tl[u][1]
				for (const acc of want ? [all, needed] : [all]) {
					board(acc, u, en)
					board(acc, u, en + 1)
				}
				stops.push({ x: grid.colX.get(en) + n / 2, y: grid.rowY[u] + n / 2 })
			}
		}
	} else {
		// the boards of the deciding capture (where the piece came from and where it took), else the boards the loser
		// had to move on, with the royal pieces that could be taken first (`alt`)
		const last = recent[recent.length - 1]
		const cells = result.reason === 'king' ? (last?.info?.cells ?? []).filter(([u, v]) => shown(x, u, v)) : []
		for (const [u, v] of cells) {
			board(all, u, v)
		}
		tag = cells.map((c) => c.slice(0, 2).join('.')).join(',')
		if (!cells.length) {
			for (const u of mandatory(x)) {
				if (x.tl[u]) {
					board(all, u, x.tl[u][1])
				}
			}
		}
	}
	// the threatened royal pieces: at the end all of them (the reason), during the game those close to the boards to
	// play (the danger line names their boards)
	const near = all.box()
	for (const q of royal) {
		const d = decode(q)
		const v = x.tl[d.u] ? vOfSlot(x, d.u, d.slot) : -1
		if (v < 0 || !shown(x, d.u, v)) {
			continue
		}
		const bx = grid.colX.get(v)
		const by = grid.rowY[d.u]
		if (result) {
			board(all, d.u, v)
			board(needed, d.u, v)
			stops.push({ x: bx + n / 2, y: by + n / 2 })
		} else if (near && bx + n > near.x1 - grid.pitchX && bx < near.x2 + grid.pitchX
			&& by + n > near.y1 - grid.pitchY && by < near.y2 + grid.pitchY) {
			board(all, d.u, v)
		}
	}
	if (!all.box()) {
		const v = grid.colX.has(sk.present) ? sk.present : grid.cols[grid.cols.length - 1]
		for (const u of grid.rows) {
			if (shown(x, u, v)) {
				board(all, u, v)
			}
		}
	}
	const main = frameOf(all.box())
	const small = needed.box()
	const big = all.box()
	const alt = small && (small.x2 - small.x1 < big.x2 - big.x1 || small.y2 - small.y1 < big.y2 - big.y1)
		? frameOf(small)
		: null
	return {
		...main,
		...(alt ? { alt } : {}),
		minPx: FOCUS_PX,
		fineMinPx: FOCUS_FINE_PX,
		maxPx: FOCUS_MAX_PX,
		stops: result ? [] : stops,
		key: [x.s, sk.present, grid.rows.length, [...must].join('.'), grid.view, result?.reason ?? '', tag].join('/'),
	}
}

/**
 * Make the layout of a state.
 *
 * @param {object} state state
 * @param {number} view 0 White at the bottom, 1 Black
 * @param {object[]} recent the records of the last two turns that have an `info`
 * @param {number[][]} danger the threats (see `threats`)
 * @param {number} size the number of squares of the worlds
 * @return {object}
 */
function build(state, view, recent, danger, size) {
	const x = state.worlds[0].b.x
	const over = Boolean(state.result)
	const sk = skeleton(x)
	const must = new Set(over ? [] : mandatory(x))
	const open = x.tl.map((e, u) => !over && playable(x, x.s, u))
	const grid = gridOf(x, view, open)
	const n = grid.n
	const out = {
		cells: [],
		names: topology.names.slice(0, size),
		boards: [],
		areas: [],
		lines: [],
		outlines: [],
		labels: [],
	}
	const now = grid.colX.get(sk.present)
	if (now !== undefined) {
		const y = grid.top - BAND_TOP
		const bottom = grid.rowY[grid.rows[grid.rows.length - 1]] + n + BAND
		out.areas.push({ x: now - BAND, y, w: n + 2 * BAND, h: bottom - y, shade: 'frame' })
		// TRANSLATORS: above the column of the multiverse that is the present
		out.labels.push({ x: now + n / 2, y: grid.top - NOW, text: t('quantumchess', 'Now'), fit: n, kind: 'now' })
	}
	for (const g of grid.gaps) {
		out.labels.push({ x: g, y: grid.top - 0.5, text: '⋯', fit: GAP, kind: 'gap' })
	}
	const ctx = {
		sk,
		must,
		open,
		fresh: new Set(recent.flatMap((r) => r.info.rows ?? [])),
		hot: new Set(danger.map(([, royal]) => royal)),
		links: new Map(),
	}
	for (const u of grid.rows) {
		drawRow(x, grid, out, u, ctx)
	}
	for (const r of recent) {
		for (const [u1, v1, x1, y1, u2, v2, x2, y2] of r.info.arrows ?? []) {
			// from the source row's new board when it is still stored (the square the piece left), else the old one
			const from = shown(x, u1, v1 + 1) ? v1 + 1 : v1
			if (shown(x, u1, from) && shown(x, u2, v2)) {
				const gapX = grid.colX.get(from) + n + grid.gx / 2
				travelArrow(
					out.outlines,
					centreOf(grid, u1, from, x1, y1),
					centreOf(grid, u2, v2, x2, y2),
					gapX,
					grid,
				)
			}
		}
	}
	for (const [from, royal] of danger) {
		// the attacker as it stands on the board the capture would be made from: a must-move board is passed, so its
		// capture starts from the placeholder of the next board
		const d = decode(from)
		const a = d.slot === 0 && must.has(d.u)
			? centreOf(grid, d.u, x.tl[d.u][1] + 1, d.x, d.y)
			: squareCentre(x, grid, from)
		const b = squareCentre(x, grid, royal)
		if (a && b) {
			out.outlines.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], kind: 'threat' })
		}
	}
	return {
		size,
		names: out.names,
		cells: out.cells,
		layout: {
			width: grid.width,
			height: grid.height,
			boards: out.boards,
			areas: out.areas,
			lines: out.lines,
			outlines: out.outlines,
			labels: out.labels,
			caption: captionOf(x),
			focus: focusOf(x, grid, {
				sk,
				must,
				open,
				royal: [...ctx.hot],
				result: state.result,
				recent,
			}),
			zoomable: true,
			fill: true,
		},
	}
}

/**
 * The layout of a state for the board component: `{ size, names, cells, layout }` (see the header). `size` is the
 * worlds' number of squares; `names` gives every drawn square its accessible name ("Timeline +1, turn 4, Black to
 * move: c3") and every other square its static name.
 *
 * @param {object} V variant
 * @param {object} state state
 * @return {object}
 */
export function layoutOf(V, state) {
	const x = state.worlds[0].b.x
	const view = state.options?.view === 'black' ? 1 : 0
	const recent = lastTurnRecords(state).filter((r) => r.info)
	const danger = threats(V, state)
	let size = 0
	for (const { b } of state.worlds) {
		size = Math.max(size, b.board.length)
	}
	const key = [
		x.n,
		x.h,
		x.m,
		x.md,
		x.s,
		x.t,
		x.c.join(),
		x.tl.map((e) => (e ? e.join('.') : '')).join(';'),
		size,
		view,
		state.result ? state.result.reason : '',
		recent.map((r) => JSON.stringify(r.info)).join(';'),
		danger.join(';'),
	].join('|')
	let made = memo.get(key)
	if (made) {
		memo.delete(key)
	} else {
		made = build(state, view, recent, danger, size)
		if (memo.size >= MEMO_SIZE) {
			memo.delete(memo.keys().next().value)
		}
	}
	memo.set(key, made)
	return made
}

/**
 * The variant's `boardLegend(state)`: what the colours and lines of the drawing mean, for those drawn now (the gold
 * and blue halos, the hatched inactive timelines, the threat lines of 5D check and the travel arrows).
 *
 * @param {object} V variant
 * @param {object} state state
 * @return {Array<{kind: string, text: string}>}
 */
export function legendOf(V, state) {
	const { layout } = layoutOf(V, state)
	const shades = new Set(layout.areas.map((a) => a.shade))
	const kinds = new Set(layout.outlines.map((o) => o.kind))
	const out = []
	if (shades.has('must')) {
		// TRANSLATORS: the legend of the multiverse: the gold halo marks the boards you must move on this turn
		out.push({ kind: 'must', text: t('quantumchess', 'Must move') })
	}
	if (shades.has('optional')) {
		// TRANSLATORS: the legend of the multiverse: the blue halo marks the boards you may move on this turn
		out.push({ kind: 'optional', text: t('quantumchess', 'Optional') })
	}
	if (shades.has('inactive')) {
		// TRANSLATORS: the legend of the multiverse: a hatched row is a timeline that does not hold back the present
		out.push({ kind: 'inactive', text: t('quantumchess', 'Inactive timeline') })
	}
	if (kinds.has('threat')) {
		// TRANSLATORS: the legend of the multiverse: a red line joins a piece to a royal piece it could take (5D check)
		out.push({
			kind: 'threat',
			text: t('quantumchess', 'Could take a royal piece if its owner passed now (5D check)'),
		})
	}
	if (kinds.has('travel')) {
		// TRANSLATORS: the legend of the multiverse: a blue arrow shows a piece's travel through time or timelines
		out.push({ kind: 'travel', text: t('quantumchess', 'Travel in the last turns') })
	}
	return out
}
