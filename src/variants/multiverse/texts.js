/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The records and texts of multiverse chess (handoff/research/multiverse-final.md sections 6.12 to 6.14 and 11.3):
 * what a history record stores about a move (new timelines, travel arrows, the absolute code of a split, merge or
 * measurement, the present moving back, which-path memory, the move's squares on the boards it produced), the
 * last-move marks of a whole turn, and the player-facing texts (move codes, record lines, the player rows, the Submit
 * button, the reasons a game ended).
 *
 * Records hold data only (numbers and codes in the move notation), never words: the texts are made when they are
 * shown, in the reader's language.
 */

import { n, t } from '@nextcloud/l10n'
import { parseCode, royalDanger } from '../core/quantum.js'
import { generate as cachedGenerate } from '../core/world.js'
import { SUBMIT } from './moves.js'
import { baseType } from './pieces.js'
import {
	boardOf,
	boardText,
	canSubmit,
	CELL_NAMES,
	decode,
	LAB,
	lOf,
	mandatory,
	playable,
	ROWS,
	skeleton,
	slotAt,
	sqOf,
	squareText,
	topology,
	turnMark,
	vOfSlot,
} from './skeleton.js'

/** A no-break space: keeps a time and its mark (`T1 ●`) and a board and its mark together when a line wraps. */
const NBSP = '\u00a0'

/**
 * The squares a move names: the start and target squares of an ordinary move (as generated before it), the parts
 * and targets of a split or merge, the measured part.
 *
 * @param {object} V variant
 * @param {object} prev state before the move
 * @param {object} mv the parsed code
 * @return {{from: number[], to: number[]}}
 */
function squaresOf(V, prev, mv) {
	if (mv.type !== 'move') {
		return { from: mv.from.slice(), to: mv.to.slice() }
	}
	for (const { b } of prev.worlds) {
		const m = cachedGenerate(V, b, prev.turn).get(mv.code)
		if (m) {
			return m.from >= 0 ? { from: [m.from], to: [m.to] } : { from: [], to: [] }
		}
	}
	return { from: [], to: [] }
}

/**
 * The absolute code of a split, merge or measurement: the core's code with the squares written as boards and cells
 * (`(0T2)c3-(0T1)a3|(0T1)e3`, `(0T5)a3|(0T5)e3-(0T5)c4`, `?(+1T5)c3`), so that the move list shows the turn of a
 * past board.
 *
 * @param {object} x the extra state before the move
 * @param {object} mv the parsed code
 * @return {string}
 */
function absoluteCode(x, mv) {
	const s = (q) => squareText(x, q)
	if (mv.type === 'measure') {
		return '?' + s(mv.from[0])
	}
	if (mv.type === 'split') {
		return s(mv.from[0]) + '-' + s(mv.to[0]) + '|' + s(mv.to[1])
	}
	return s(mv.from[0]) + '|' + s(mv.from[1]) + '-' + s(mv.to[0])
}

/**
 * After a merge whose worlds still differ: the past board on which they differ that is sealed last (`[u, v]`), or
 * null.
 *
 * @param {object} next the state after the merge
 * @return {number[]|null}
 */
function pathMemory(next) {
	if (next.worlds.length < 2) {
		return null
	}
	const b0 = next.worlds[0].b
	const x = b0.x
	const face = (w, q) => (w.board[q] >= 0 ? w.sd[w.board[q]] + w.ty[w.board[q]] : '')
	let best = null
	for (let u = 0; u < ROWS; u++) {
		const e = x.tl[u]
		for (let v = e ? Math.max(e[0], e[1] - x.h) : 0; e && v < e[1]; v++) {
			const slot = 1 + (v % x.h)
			let differs = false
			for (let c = 0; c < 64 && !differs; c++) {
				const q = sqOf(u, slot, c % 8, c >> 3)
				const f0 = face(b0, q)
				differs = next.worlds.some(({ b }) => face(b, q) !== f0)
			}
			if (differs && (!best || v - e[1] > best[1] - x.tl[best[0]][1])) {
				best = [u, v]
			}
		}
	}
	return best
}

/**
 * The variant's `recordInfo` (null for Submit): `rows` (the new rows), `arrows` (`[u1, v1, x1, y1, u2, v2, x2, y2]`
 * per travel, from the board the piece left to the one it arrived on; none when the outcome is Missed), `text` (the
 * absolute code of a split, merge or measurement), `back` (the new present when it moved back), `memory` (`[u, v]`,
 * see `pathMemory`), `cells` (`[u, v, x, y]`: the action's squares on the boards it produced, the arrival of a
 * branch on its new row; the same in every outcome) and `at` (for an outcome named by a square, a measurement: that
 * square as the boards stood before the move, `(+2T1)d3`).
 *
 * @param {object} V variant
 * @param {object} prev state before the move
 * @param {string} code move code
 * @param {object} branch the chosen outcome
 * @param {object} next state after the move
 * @return {object|null}
 */
export function recordInfo(V, prev, code, branch, next) {
	const mv = parseCode(V, code)
	if (!mv || code === SUBMIT) {
		return null
	}
	const a = prev.worlds[0].b.x
	const b = next.worlds[0].b.x
	const rows = []
	for (let u = 0; u < ROWS; u++) {
		if (!a.tl[u] && b.tl[u]) {
			rows.push(u)
		}
	}
	const { from, to } = squaresOf(V, prev, mv)
	// a square as `[u, v, x, y]` on the board the action produced
	const produced = (q) => {
		const d = decode(q)
		if (d.slot === 0) {
			return [d.u, a.tl[d.u][1] + 1, d.x, d.y]
		}
		const v = vOfSlot(a, d.u, d.slot)
		return rows.length ? [rows[0], v + 1, d.x, d.y] : [d.u, v, d.x, d.y]
	}
	const arrows = []
	if (branch.key !== 'miss') {
		for (const f of from) {
			const df = decode(f)
			for (const q of to) {
				const dt = decode(q)
				if (dt.u !== df.u || dt.slot !== 0) {
					arrows.push([df.u, a.tl[df.u][1], df.x, df.y, ...produced(q)])
				}
			}
		}
	}
	const cells = []
	for (const q of mv.type === 'measure' ? from : [...from, ...to]) {
		const c = produced(q)
		if (!cells.some((e) => e.join() === c.join())) {
			cells.push(c)
		}
	}
	const present = skeleton(b).present
	const memory = mv.type === 'merge' ? pathMemory(next) : null
	const where = topology.byName(branch.key)
	return {
		rows,
		arrows,
		...(mv.type !== 'move' ? { text: absoluteCode(a, mv) } : {}),
		...(present < skeleton(a).present ? { back: present } : {}),
		...(memory ? { memory } : {}),
		cells,
		...(where >= 0 ? { at: squareText(a, where) } : {}),
	}
}

/**
 * The records of the turn in progress (when the side to move has already acted) and of the opponent's last turn,
 * oldest first.
 *
 * @param {object} state state
 * @return {object[]}
 */
export function lastTurnRecords(state) {
	const h = state.history
	const runs = []
	let i = h.length
	while (i > 0) {
		const side = h[i - 1].side
		if (runs[runs.length - 1] !== side) {
			if (runs.length === 2 || (runs.length === 1 && runs[0] !== state.turn)) {
				break
			}
			runs.push(side)
		}
		i--
	}
	return h.slice(i)
}

/**
 * The squares of the actions of some records (`info.cells`), each on the square that shows that board now (sealed
 * boards left out), so marks follow their boards into the past.
 *
 * @param {object} state state
 * @param {object[]} records history records
 * @return {number[]}
 */
function cellsOf(state, records) {
	const x = state.worlds[0].b.x
	const out = []
	for (const r of records) {
		for (const [u, v, cx, cy] of r.info?.cells ?? []) {
			const slot = slotAt(x, u, v)
			const q = slot < 0 ? -1 : sqOf(u, slot, cx, cy)
			if (q >= 0 && !out.includes(q)) {
				out.push(q)
			}
		}
	}
	return out
}

/**
 * The variant's `lastMoveMarks`: the squares of every action of the opponent's last turn (see `cellsOf`). The turn in
 * progress has its own marks (`turnMarks`), so the two can be told apart.
 *
 * @param {object} state state
 * @return {number[]}
 */
export function lastMoveMarks(state) {
	return cellsOf(state, lastTurnRecords(state).filter((r) => r.side !== state.turn))
}

/**
 * The variant's `turnMarks`: the squares of the actions the side to move has already made this turn.
 *
 * @param {object} state state
 * @return {number[]}
 */
export function turnMarks(state) {
	return cellsOf(state, lastTurnRecords(state).filter((r) => r.side === state.turn))
}

/**
 * A board for the texts: `(0T2) ○`.
 *
 * @param {number} u storage row
 * @param {number} v half-turn index
 * @return {string}
 */
function boardLabel(u, v) {
	return boardText(u, v) + NBSP + turnMark(v)
}

/**
 * The time of a board for the texts: `T1 ●`.
 *
 * @param {number} v half-turn index
 * @return {string}
 */
function timeLabel(v) {
	return 'T' + (v >> 1) + NBSP + turnMark(v)
}

/**
 * The letter of a piece type in the move list: none for a pawn (nor when the type is not known), `W` for a brawn,
 * else the capital of its base type (`N`, `Q`, `U`, `D`, `S`, `Y`, `C`).
 *
 * @param {string|null|undefined} type piece type (live or unmoved: `n`, `k0`, `w0`)
 * @return {string}
 */
function letterOf(type) {
	if (typeof type !== 'string' || !type) {
		return ''
	}
	const b = baseType(type)
	return b === 'p' ? '' : b.toUpperCase()
}

/** An ordinary key: source board, source cell, `-` / `>` / `>>`, target board (not for `-`), target cell, `=Q`. */
const KEY = /^(\([^)]+\))([a-h][1-8])(-|>>|>)(\([^)]+\))?([a-h][1-8])(=[A-Z])?$/
/** A square of an absolute code: its board and its cell. */
const ABS = /\(([^)]+)\)([a-h][1-8])/g

/**
 * The squares of an absolute code (`(0T2)c3-(0T1)a3|(0T1)e3`), each as `{ board, cell }`.
 *
 * @param {string} text absolute code
 * @return {Array<{board: string, cell: string}>}
 */
function absoluteSquares(text) {
	return [...text.matchAll(ABS)].map((m) => ({ board: '(' + m[1] + ')', cell: m[2] }))
}

/**
 * The sign between a square and the board a piece goes to: `-` on the same board, `>` onto another timeline's latest
 * board (a jump), `>>` when a new timeline opens (a branch).
 *
 * @param {string} from the board left
 * @param {string} to the board reached
 * @param {boolean} branch whether the action opened a timeline
 * @return {string}
 */
function travelSign(from, to, branch) {
	if (from === to) {
		return '-'
	}
	return branch ? '>>' : '>'
}

/**
 * A split, merge or measurement in the notation of the move list (5dpgn style, the board written once where the
 * squares share it): `(0T1)Nd1-c3|e3`, `(0T2)Nc3>>(0T1)a3|e3`, `(0T5)Na3|e3-c4`, `?(+1T5)c3`.
 *
 * @param {string} type split, merge or measure
 * @param {Array<{board: string, cell: string}>} sq the squares: split from, to, to; merge from, from, to; measure
 * @param {string} letter the piece letter
 * @param {boolean} branch whether the action opened a timeline
 * @return {string}
 */
function quantumText(type, sq, letter, branch) {
	if (type === 'measure') {
		return '?' + sq[0].board + sq[0].cell
	}
	const at = (s, board) => (s.board === board ? s.cell : s.board + s.cell)
	if (type === 'split') {
		const [f, a, b] = sq
		const sign = travelSign(f.board, a.board, branch)
		return f.board + letter + f.cell + sign + at(a, sign === '-' ? f.board : '') + '|' + at(b, a.board)
	}
	const [a, b, to] = sq
	const sign = travelSign(a.board, to.board, branch)
	return a.board + letter + a.cell + '|' + at(b, a.board) + sign + at(to, sign === '-' ? a.board : '')
}

/**
 * The variant's `codeText(code, record, { type, capture, state })`: the move in the notation of the move list, in the
 * manner of 5dpgn. An ordinary move gets the piece letter after its board (none for a pawn, `W` for a brawn) and `x`
 * when it captured: `(0T2)Ng1-f3`, `(0T1)b4xc3`, `(0T3)Qd1>>(0T1)f3`, `(0T2)Na5>x(+1T2)a5`. A split, merge or
 * measurement is written with boards and turns, from its record (`info.text`) or, for a move not yet played, from the
 * state: `(0T2)Nc3>>(0T1)a3|e3`. Submit is "Submit turn". Null when the code is none of these.
 *
 * @param {string} code move code
 * @param {object} [record] its history record
 * @param {object} [opts] options
 * @param {string|null} [opts.type] the type of the piece that moves
 * @param {boolean} [opts.capture] without a record: whether the move captures
 * @param {object|null} [opts.state] without a record: the state before the move
 * @return {string|null}
 */
export function codeText(code, record = null, { type = null, capture = false, state = null } = {}) {
	if (code === SUBMIT) {
		return t('quantumchess', 'Submit turn')
	}
	const letter = letterOf(type)
	const key = KEY.exec(code)
	if (key) {
		const [, board, cell, sign, target, to, promo] = key
		const took = record ? (record.captures?.length ?? 0) > 0 : capture
		const mark = took ? (sign === '-' ? 'x' : sign + 'x') : sign
		return board + letter + cell + mark + (target ?? '') + to + (promo ?? '')
	}
	const mv = parseCode({ topology }, code)
	if (!mv || mv.type === 'move') {
		return record?.info?.text ?? null
	}
	let squares = null
	let branch = false
	if (record?.info?.text) {
		squares = absoluteSquares(record.info.text)
		branch = (record.info.rows?.length ?? 0) > 0
	} else if (state) {
		const x = state.worlds[0].b.x
		const all = [...mv.from, ...mv.to]
		squares = all.map((q) => {
			const b = boardOf(x, q)
			return { board: boardText(b.u, b.v), cell: CELL_NAMES[b.y * 8 + b.x] }
		})
		branch = mv.to.some((q) => decode(q).slot > 0)
	}
	if (!squares || squares.length !== (mv.type === 'measure' ? 1 : 3)) {
		return record?.info?.text ?? null
	}
	return quantumText(mv.type, squares, letter, branch)
}

/**
 * The variant's `outcomeSquare(key, { record, state })`: a square named by an outcome (where a measured ghost was
 * found) with its board and turn, `(+2T1)d3`, from the record of the move or, for a move not yet played, the state.
 *
 * @param {string} key outcome key (a static square name)
 * @param {object} [where] where the move is
 * @param {object|null} [where.record] the history record of the move
 * @param {object|null} [where.state] the state before the move
 * @return {string|null}
 */
export function outcomeSquare(key, { record = null, state = null } = {}) {
	if (record) {
		return record.info?.at ?? null
	}
	const sq = topology.byName(key)
	return state && sq >= 0 ? squareText(state.worlds[0].b.x, sq) : null
}

/**
 * The variant's `infoText`: one line per new timeline, the present moving back, and which-path memory.
 *
 * @param {object} record history record
 * @return {string[]|null}
 */
export function infoText(record) {
	const info = record.info
	if (!info) {
		return null
	}
	const out = []
	for (const u of info.rows ?? []) {
		const line = LAB[u]
		if (record.key === 'miss') {
			out.push(t('quantumchess', 'Missed: timeline {line} opened anyway, nobody arrived', { line }))
			continue
		}
		// the copied board: the past target of the action, one half turn before the new row's first board
		const arrival = info.cells?.find((c) => c[0] === u)
		const target = record.to?.map(decode).find((d) => d.slot > 0)
		out.push(arrival && target
			? t('quantumchess', 'Opened timeline {line} (a copy of {board})', {
					line,
					board: boardLabel(target.u, arrival[1] - 1),
				})
			: t('quantumchess', 'Opened timeline {line}', { line }))
	}
	if (info.back !== undefined) {
		// TRANSLATORS: a line of the move list of the multiverse: this move moved the present back to an earlier time
		out.push(t('quantumchess', 'The present moved back to {time}', { time: timeLabel(info.back) }))
	}
	if (info.memory) {
		out.push(t('quantumchess', 'The past still remembers both paths until {board} is sealed', {
			board: boardLabel(info.memory[0], info.memory[1]),
		}))
	}
	return out.length ? out : null
}

/**
 * The variant's `sideInfo`: the new timelines a side opened, and for the side to move its must-move boards.
 *
 * @param {object} state state
 * @param {number} side side index
 * @return {{text: string, title: string}}
 */
export function sideInfo(state, side) {
	const x = state.worlds[0].b.x
	// TRANSLATORS: in a player's row of the multiverse: the new timelines this player opened, of the most allowed
	let text = t('quantumchess', 'New timelines {count}/{max}', { count: x.c[side], max: x.m })
	// in the order of the timelines, Black's first (as they are drawn)
	const must = side === state.turn && !state.result
		? [...mandatory(x)].sort((a, b) => lOf(a, x.md) - lOf(b, x.md))
		: []
	if (must.length > 3) {
		text = n(
			'quantumchess',
			'{timelines} · Must move: {count} board',
			'{timelines} · Must move: {count} boards',
			must.length,
			{ timelines: text, count: must.length },
		)
	} else if (must.length) {
		text = t('quantumchess', '{timelines} · Must move: {boards}', {
			timelines: text,
			boards: must.map((u) => 'L' + LAB[u] + ' ' + timeLabel(x.tl[u][1])).join(', '),
		})
	}
	return {
		text,
		title: t(
			'quantumchess',
			'New timelines opened by this side, of {max}. Its next one counts for the present (is active) while the other side has opened at least as many.',
			{ max: x.m },
		),
	}
}

/**
 * The header above the drawing: how many new timelines each player has opened, of the most allowed, and how far back
 * pieces can travel.
 *
 * @param {object} x the world's extra state
 * @return {string}
 */
export function captionOf(x) {
	// TRANSLATORS: above the multiverse: how many new timelines each player has opened, of the most allowed
	const lines = t('quantumchess', 'New timelines: White {white}/{max} · Black {black}/{max}', {
		white: x.c[0],
		black: x.c[1],
		max: x.m,
	})
	const turns = x.h >> 1
	// TRANSLATORS: above the multiverse, after the new timelines: how many turns back pieces can travel
	const reach = n('quantumchess', 'Travel back: {turns} turn', 'Travel back: {turns} turns', turns, { turns })
	return lines + ' · ' + reach
}

/** The king danger of the side to move, per state. */
const dangerCache = new WeakMap()

/**
 * The chance that the opponent could capture a royal piece of the side to move if it ended its turn now (5D check),
 * computed once per state.
 *
 * @param {object} V variant
 * @param {object} state state
 * @return {number}
 */
export function dangerOf(V, state) {
	let d = dangerCache.get(state)
	if (d === undefined) {
		d = royalDanger(V, state, state.turn)
		dangerCache.set(state, d)
	}
	return d
}

/**
 * Which royal pieces a side has (in any world, on its latest boards or in the past): kings, royal queens or both.
 *
 * @param {object} state state
 * @param {number} side side index
 * @return {'king'|'queen'|'both'}
 */
function royalKinds(state, side) {
	let king = false
	let queen = false
	for (const { b } of state.worlds) {
		for (let id = 0; id < b.ty.length; id++) {
			if (b.sq[id] >= 0 && b.sd[id] === side) {
				const base = baseType(b.ty[id])
				king ||= base === 'k'
				queen ||= base === 'y'
			}
		}
	}
	return queen ? (king ? 'both' : 'queen') : 'king'
}

/**
 * The label of the Submit button: with the danger that submitting leaves, or how many must-move boards are left.
 *
 * @param {object} V variant
 * @param {object} state state
 * @return {string}
 */
export function submitLabel(V, state) {
	const x = state.worlds[0].b.x
	if (state.result || canSubmit(x)) {
		const d = state.result ? 0 : dangerOf(V, state)
		if (d > 0) {
			const p = d < 1 ? Math.min(99, Math.max(1, Math.round(d * 100))) : 100
			const percent = t('quantumchess', '{percent} %', { percent: p })
			switch (royalKinds(state, state.turn)) {
				case 'queen':
					return t('quantumchess', 'Submit turn (your royal queen can be taken: {percent})', { percent })
				case 'both':
					return t('quantumchess', 'Submit turn (a king or royal queen of yours can be taken: {percent})', {
						percent,
					})
				default:
					return t('quantumchess', 'Submit turn (a king of yours can be taken: {percent})', { percent })
			}
		}
		return t('quantumchess', 'Submit turn')
	}
	const count = mandatory(x).length
	// TRANSLATORS: the Submit button of the multiverse while must-move boards are left; keep it short (phones)
	return n(
		'quantumchess',
		'Submit turn ({count} more board first)',
		'Submit turn ({count} more boards first)',
		count,
		{ count },
	)
}

/**
 * The boards of some squares for the texts, without repeats: `(0T2) ○, (+1T1) ●`.
 *
 * @param {object} x the world's extra state
 * @param {number[]} squares squares
 * @return {string}
 */
function boardsOf(x, squares) {
	const out = []
	for (const q of squares) {
		const b = boardOf(x, q)
		const text = b.v >= 0 ? boardLabel(b.u, b.v) : null
		if (text && !out.includes(text)) {
			out.push(text)
		}
	}
	return out.join(', ')
}

/**
 * The variant's `dangerText(state, side, percent)`: the danger line of the side to move, naming the boards on which its
 * royal pieces can be taken (the threat lines, `threats` of the layout) and whether they are kings or royal queens.
 * Null for another side (the generic line), or when no threat is known.
 *
 * @param {object} state state
 * @param {number} side the side whose danger it is
 * @param {string} percent the chance, as text (`100 %`)
 * @param {number[][]} danger the threats `[attacker, royal]` of the side to move
 * @return {string|null}
 */
export function dangerText(state, side, percent, danger) {
	if (side !== state.turn || !danger.length) {
		return null
	}
	const x = state.worlds[0].b.x
	const royals = [...new Set(danger.map(([, royal]) => royal))]
	const boards = boardsOf(x, royals)
	let king = false
	let queen = false
	for (const q of royals) {
		for (const { b } of state.worlds) {
			const id = b.board[q]
			if (id >= 0) {
				king ||= baseType(b.ty[id]) === 'k'
				queen ||= baseType(b.ty[id]) === 'y'
			}
		}
	}
	if (queen && king) {
		return t('quantumchess', 'Your king or royal queen is in danger on {boards}: {percent}', { boards, percent })
	}
	if (queen) {
		return t('quantumchess', 'Your royal queen is in danger on {boards}: {percent}', { boards, percent })
	}
	// TRANSLATORS: the danger line of the multiverse (5D check), "Your king is in danger on (0T2) ○: 100 %"
	return t('quantumchess', 'Your king is in danger on {boards}: {percent}', { boards, percent })
}

/**
 * The variant's `endNote(state)`: where the game was decided. After a capture of a royal piece, the square of the
 * capture (`(+1T7)b4`); after checkmate, the boards on which a royal piece of the loser could be taken for certain.
 *
 * @param {object} state state
 * @param {number[][]} danger the threats `[attacker, royal]` of the side to move
 * @return {string|null}
 */
export function endNote(state, danger) {
	const result = state.result
	if (!result) {
		return null
	}
	if (result.reason === 'king') {
		const last = state.history[state.history.length - 1]
		const key = last ? KEY.exec(last.code) : null
		if (key) {
			const square = (key[4] ?? key[1]) + key[5]
			// TRANSLATORS: under the result of a multiverse game won by capturing a king or royal queen
			return t('quantumchess', 'The royal piece on {square} was captured.', { square })
		}
		return null
	}
	if (result.reason === 'checkmate' && danger.length) {
		const boards = boardsOf(state.worlds[0].b.x, danger.map(([, royal]) => royal))
		// TRANSLATORS: under the result of a multiverse game lost by checkmate: where the royal piece could be taken
		return t('quantumchess', 'A royal piece could be taken for certain on {boards}.', { boards })
	}
	return null
}

/**
 * The variant's `turnHint(state)`: what the side to move can still do once its must-move boards are played.
 *
 * @param {object} state state
 * @return {string|null}
 */
export function turnHint(state) {
	const x = state.worlds[0].b.x
	if (state.result || !canSubmit(x)) {
		return null
	}
	// TRANSLATORS: the hint of the multiverse once every must-move board of the turn is played
	return t('quantumchess', 'Required boards done: move on an optional board (blue), or press Submit turn.')
}

/**
 * The variant's `refusalText(state, kind, sq)`: the notices of the multiverse where the generic one would blame the
 * piece while the board is the reason, and the notice for a tap on an own piece without a move (`noMove`).
 *
 * @param {object} state state
 * @param {string} kind notice kind
 * @param {number} [sq] the square tapped
 * @return {string|null}
 */
export function refusalText(state, kind, sq = -1) {
	switch (kind) {
		case 'measureHere':
			return t('quantumchess', 'Measure through a part on a board you may play now (gold or blue).')
		case 'mergeHere':
			return t('quantumchess', 'Both parts must stand on one board you may play now (gold or blue).')
		case 'noMove': {
			const x = state.worlds[0].b.x
			const d = sq >= 0 ? decode(sq) : null
			if (d && d.slot === 0 && playable(x, x.s, d.u)) {
				return t('quantumchess', 'This piece has no move now.')
			}
			return t('quantumchess', 'You can move only on the boards marked must move or optional (gold or blue).')
		}
		default:
			return null
	}
}

/**
 * The variant's `reasonText`: why a game ended, for the reasons of the multiverse.
 *
 * @param {string} reason reason code
 * @return {string|null}
 */
export function reasonText(reason) {
	switch (reason) {
		case 'king':
			// TRANSLATORS: why a multiverse game ended: a royal piece (a king or a royal queen) was captured
			return t('quantumchess', 'a king or royal queen was captured')
		case 'checkmate':
			// TRANSLATORS: why a multiverse game ended: the loser could not finish its turn, a royal piece would fall
			return t(
				'quantumchess',
				'checkmate: the turn could not be finished and a king or royal queen would certainly be captured',
			)
		case 'stalemate':
			// TRANSLATORS: why a multiverse game was drawn: the player to move could not finish its turn
			return t('quantumchess', 'stalemate: the turn could not be finished')
		case 'stranded':
			// TRANSLATORS: why a multiverse game ended: the loser's own move left its turn impossible to finish
			return t('quantumchess', 'stranded: the loser\'s own move left its turn impossible to finish')
		case 'quiet':
			// TRANSLATORS: why a multiverse game was drawn; a brawn is a kind of pawn
			return t(
				'quantumchess',
				'300 moves in a row (Submit turn counts) without a capture or a pawn or brawn move',
			)
		case 'moveLimit':
			// TRANSLATORS: why a multiverse game was drawn: the game reached its move limit
			return t('quantumchess', '1,200 moves in the game (Submit turn counts)')
		default:
			return null
	}
}
