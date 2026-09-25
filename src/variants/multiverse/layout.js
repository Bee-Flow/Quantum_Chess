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
 * out, the royal squares of the side to move that the opponent threatens in the danger shade), a frame and a label
 * per board (timeline, time and whose move; "must move" or "optional" on the boards the side to move may play), the
 * present band with "Now", gold halos around the must-move boards and blue ones around the optional boards, the
 * branch connectors (lines, under the cells), and above the cells the placeholders of the next boards (outlines of
 * kind `next`), the travel arrows of the turn in progress and of the opponent's last turn (kind `travel`) and the
 * threat lines of 5D check (kind `threat`). The focus frames the boards to play; its key changes only when those
 * boards change, so the view recentres after a must-move board is played, a timeline opens or the turn passes.
 *
 * One square is one unit. A layout depends only on the skeleton, the view, the records of the last two turns and the
 * threats, so the last few are kept: the same drawing comes back when the board is drawn again or a move is undone,
 * not many moves later, and a large layout is big (8 × 8 with 4,000 cells: about 0.7 MB).
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
import { lastTurnRecords } from './texts.js'

/** The margin left of the boards, where the row labels stand (cell units). */
const LEFT = 3
/** The margin above the boards: the header, "Now" and the board labels. */
const TOP = 2.6
/** The width of a gap column, where time jumps. */
const GAP = 1.2
/** The margin right of the last column. */
const RIGHT = 0.4
/** How far the present band reaches beyond its column and below the last row. */
const BAND = 0.4
/** How far the present band reaches above the first row (over the board labels). */
const BAND_TOP = 1.2
/** The height of the "Now" label above the first row. */
const NOW = 1.5
/** How far the gold and blue halos reach beyond their board. */
const HALO = 0.3
/** The length of an arrow head. */
const HEAD = 0.4
/** The angle between an arrow head and its shaft. */
const HEAD_ANGLE = (25 * Math.PI) / 180
/** The largest zoom the focus asks for (the fine-pointer zoom). */
const FOCUS_ZOOM = 4
/** How many layouts are kept (64 held about 45 MB in a long 8 × 8 game). */
const MEMO_SIZE = 8

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
	return 'T' + (v >> 1) + ' ' + turnMark(v)
}

/**
 * The 5D check of the side to move: every `[attacker, royal]` pair of squares from which the waiting side could
 * capture a royal piece of the side to move, in some world, if the side to move passed its must-move boards. These
 * are the phantom moves of `generate`, which the danger line has already made and the core keeps per world. Empty
 * when the game is over.
 *
 * @param {object} V variant
 * @param {object} state state
 * @return {number[][]}
 */
export function threats(V, state) {
	if (state.result) {
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
	const contentH = TOP + rows.length * pitchY
	// at least three quarters of the width, so that a zoomed window on a phone in portrait shows whole boards
	const height = Math.max(contentH, 0.75 * width)
	const top = TOP + (height - contentH) / 2
	const rowY = new Array(ROWS).fill(-1)
	rows.forEach((u, i) => {
		rowY[u] = top + i * pitchY
	})
	return { n, view, rows, rowY, cols, colX, gaps, gx, pitchX: n + gx, top, width, height }
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
 * An arrow as three outlines: the shaft from `from` to `to` and two heads at `to`.
 *
 * @param {object[]} outlines where they go
 * @param {number[]} from start `[x, y]`
 * @param {number[]} to end `[x, y]`
 * @param {string} kind the kind of outline
 */
function arrow(outlines, [x1, y1], [x2, y2], kind) {
	outlines.push({ x1, y1, x2, y2, kind })
	const angle = Math.atan2(y2 - y1, x2 - x1)
	for (const d of [HEAD_ANGLE, -HEAD_ANGLE]) {
		outlines.push({
			x1: x2,
			y1: y2,
			x2: x2 - HEAD * Math.cos(angle + d),
			y2: y2 - HEAD * Math.sin(angle + d),
			kind,
		})
	}
}

/**
 * The label of a board: `L+1 T5 ●` on a latest board, `T4 ○` on a history board, and on a board the side to move may
 * play whether it must or may.
 *
 * @param {number} u storage row
 * @param {number} v half-turn index
 * @param {boolean} latest whether it is the row's latest board
 * @param {string|null} role 'must', 'optional' or null
 * @return {string}
 */
function boardLabel(u, v, latest, role) {
	const board = latest ? 'L' + LAB[u] + ' ' + timeText(v) : timeText(v)
	if (role === 'must') {
		// TRANSLATORS: a board label of the multiverse, "L+1 T5 ● · must move": you have to move on it this turn
		return t('quantumchess', '{board} · must move', { board })
	}
	if (role === 'optional') {
		// TRANSLATORS: a board label of the multiverse, "L+1 T5 ● · optional": you may move on it this turn
		return t('quantumchess', '{board} · optional', { board })
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
 * @param {Set<number>} hot the threatened royal squares
 */
function drawBoard(x, grid, out, u, v, role, hot) {
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
			shade: role === 'must' ? 'wood' : 'river',
		})
	}
	out.boards.push({ x: bx, y: by, w: n, h: n, label: boardLabel(u, v, latest, role) })
	const name = boardName(u, v) + ': '
	for (let cy = 0; cy < n; cy++) {
		for (let cx = 0; cx < n; cx++) {
			const sq = sqOf(u, slot, cx, cy)
			const [px, py] = cellAt(grid, u, v, cx, cy)
			const dark = (cx + cy) % 2 === 0
			const shade = hot.has(sq) ? 'danger' : dark ? (latest ? 'dark' : 'mid') : 'light'
			out.cells.push({ sq, x: px, y: py, w: 1, h: 1, shape: 'rect', shade })
			out.names[sq] = name + CELL_NAMES[cy * 8 + cx]
		}
	}
}

/**
 * Draw row u: its labels, its stored boards, the placeholder of its next board when the side to move may play it,
 * and the connector from its parent board.
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
 */
function drawRow(x, grid, out, u, { sk, must, open, fresh, hot }) {
	const n = grid.n
	const [st, en, pu, pv] = x.tl[u]
	const by = grid.rowY[u]
	const mid = by + n / 2
	const first = firstShown(x, u)
	out.labels.push({ x: LEFT / 2, y: mid - 0.3, text: 'L' + LAB[u] })
	let note = null
	if (!sk.act(u)) {
		// TRANSLATORS: under the name of an inactive timeline of the multiverse (it does not hold back the present)
		note = t('quantumchess', 'inactive')
	} else if (fresh.has(u)) {
		// TRANSLATORS: under the name of a timeline of the multiverse that was opened in the last two turns
		note = t('quantumchess', 'new')
	}
	if (note) {
		out.labels.push({ x: LEFT / 2, y: mid + 0.5, text: note })
	}
	if (first > st) {
		// the row's older boards are sealed
		out.labels.push({ x: grid.colX.get(first) - grid.gx / 2, y: mid, text: '⋯' })
	}
	for (let v = first; v <= en; v++) {
		const role = v === en && open[u] ? (must.has(u) ? 'must' : 'optional') : null
		drawBoard(x, grid, out, u, v, role, hot)
	}
	if (open[u]) {
		const bx = grid.colX.get(en + 1)
		rectangle(out.outlines, bx, by, n, n, 'next')
		out.labels.push({ x: bx + n / 2, y: mid, text: timeText(en + 1) })
	}
	if (pu !== null && pu !== undefined && x.tl[pu]) {
		// from the right edge of the parent board, or from the left margin of its row when it is sealed
		const from = shown(x, pu, pv)
			? [grid.colX.get(pv) + n, grid.rowY[pu] + n / 2]
			: [LEFT - 0.3, grid.rowY[pu] + n / 2]
		out.lines.push({ x1: from[0], y1: from[1], x2: grid.colX.get(first), y2: mid })
	}
}

/**
 * The focus: the must-move boards of the side to move, else the boards it may play, else the present column. Its
 * `box` is the size the component fits on a touch screen, its `zoom` the fine-pointer zoom, and its `key` changes only
 * when the boards to play change.
 *
 * @param {object} x the world's extra state
 * @param {Grid} grid grid
 * @param {object} sk the skeleton
 * @param {Set<number>} must the must-move rows
 * @param {boolean[]} open the rows the side to move may play
 * @return {object}
 */
function focusOf(x, grid, sk, must, open) {
	const n = grid.n
	let box = null
	const grow = (u, v) => {
		const bx = grid.colX.get(v)
		const by = grid.rowY[u]
		box = box
			? {
					x1: Math.min(box.x1, bx),
					y1: Math.min(box.y1, by),
					x2: Math.max(box.x2, bx + n),
					y2: Math.max(box.y2, by + n),
				}
			: { x1: bx, y1: by, x2: bx + n, y2: by + n }
	}
	for (const u of grid.rows) {
		if (must.size ? must.has(u) : open[u]) {
			grow(u, x.tl[u][1])
		}
	}
	if (!box) {
		const v = grid.colX.has(sk.present) ? sk.present : grid.cols[grid.cols.length - 1]
		for (const u of grid.rows) {
			if (shown(x, u, v)) {
				grow(u, v)
			}
		}
	}
	const w = Math.max(box.x2 - box.x1 + 2, 2.2 * grid.pitchX)
	const h = box.y2 - box.y1 + 2
	return {
		x: (box.x1 + box.x2) / 2,
		y: (box.y1 + box.y2) / 2,
		zoom: Math.min(FOCUS_ZOOM, Math.max(1, Math.min(grid.width / w, grid.height / h))),
		key: [x.s, sk.present, grid.rows.length, [...must].join('.'), grid.view].join('/'),
		box: { w, h },
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
	out.labels.push({
		x: grid.width / 2,
		y: grid.top - TOP + 0.5,
		// TRANSLATORS: above the multiverse: how many new timelines each player has opened, of the most allowed
		text: t('quantumchess', 'New timelines: White {white}/{max} · Black {black}/{max}', {
			white: x.c[0],
			black: x.c[1],
			max: x.m,
		}),
	})
	const now = grid.colX.get(sk.present)
	if (now !== undefined) {
		const y = grid.top - BAND_TOP
		const bottom = grid.rowY[grid.rows[grid.rows.length - 1]] + n + BAND
		out.areas.push({ x: now - BAND, y, w: n + 2 * BAND, h: bottom - y, shade: 'frame' })
		// TRANSLATORS: above the column of the multiverse that is the present
		out.labels.push({ x: now + n / 2, y: grid.top - NOW, text: t('quantumchess', 'Now') })
	}
	for (const g of grid.gaps) {
		out.labels.push({ x: g, y: grid.top - 0.5, text: '⋯' })
	}
	const ctx = {
		sk,
		must,
		open,
		fresh: new Set(recent.flatMap((r) => r.info.rows ?? [])),
		hot: new Set(danger.map(([, royal]) => royal)),
	}
	for (const u of grid.rows) {
		drawRow(x, grid, out, u, ctx)
	}
	for (const r of recent) {
		for (const [u1, v1, x1, y1, u2, v2, x2, y2] of r.info.arrows ?? []) {
			if (shown(x, u1, v1) && shown(x, u2, v2)) {
				arrow(out.outlines, centreOf(grid, u1, v1, x1, y1), centreOf(grid, u2, v2, x2, y2), 'travel')
			}
		}
	}
	for (const [from, royal] of danger) {
		const a = squareCentre(x, grid, from)
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
			focus: focusOf(x, grid, sk, must, open),
			zoomable: true,
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
		state.result ? 1 : 0,
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
