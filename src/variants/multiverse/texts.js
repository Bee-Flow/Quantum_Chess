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
import {
	boardText,
	canSubmit,
	decode,
	LAB,
	mandatory,
	ROWS,
	skeleton,
	slotAt,
	sqOf,
	squareText,
	turnMark,
	vOfSlot,
} from './skeleton.js'

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
 * see `pathMemory`) and `cells` (`[u, v, x, y]`: the action's squares on the boards it produced, the arrival of a
 * branch on its new row; the same in every outcome).
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
	return {
		rows,
		arrows,
		...(mv.type !== 'move' ? { text: absoluteCode(a, mv) } : {}),
		...(present < skeleton(a).present ? { back: present } : {}),
		...(memory ? { memory } : {}),
		cells,
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
 * The variant's `lastMoveMarks`: the squares of every action of the opponent's last turn and of the turn in progress
 * (`info.cells`), each on the square that shows that board now (sealed boards left out), so marks follow their boards
 * into the past.
 *
 * @param {object} state state
 * @return {number[]}
 */
export function lastMoveMarks(state) {
	const x = state.worlds[0].b.x
	const out = []
	for (const r of lastTurnRecords(state)) {
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
 * A board for the texts: `(0T2) ○`.
 *
 * @param {number} u storage row
 * @param {number} v half-turn index
 * @return {string}
 */
function boardLabel(u, v) {
	return boardText(u, v) + ' ' + turnMark(v)
}

/**
 * The variant's `codeText(code, record)`: "Submit turn", the absolute code of a split, merge or measurement from its
 * record, else null (ordinary keys are already absolute).
 *
 * @param {string} code move code
 * @param {object} [record] its history record
 * @return {string|null}
 */
export function codeText(code, record) {
	if (code === SUBMIT) {
		return t('quantumchess', 'Submit turn')
	}
	return record?.info?.text ?? null
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
		out.push(t('quantumchess', 'The present moves back to {time}', {
			time: 'T' + (info.back >> 1) + ' ' + turnMark(info.back),
		}))
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
	let text = t('quantumchess', 'Timelines {count}/{max}', { count: x.c[side], max: x.m })
	const must = side === state.turn && !state.result ? mandatory(x) : []
	if (must.length) {
		text = t('quantumchess', '{timelines} · Must move: {boards}', {
			timelines: text,
			boards: must.map((u) => boardText(u, x.tl[u][1])).join(', '),
		})
	}
	return {
		text,
		title: t(
			'quantumchess',
			'New timelines opened by this side, of {max}. Your next one is active while your opponent has opened at least as many.',
			{ max: x.m },
		),
	}
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
			return t('quantumchess', 'Submit turn (a king of yours can be taken: {percent})', {
				percent: t('quantumchess', '{percent} %', { percent: p }),
			})
		}
		return t('quantumchess', 'Submit turn')
	}
	const count = mandatory(x).length
	return n(
		'quantumchess',
		'Submit turn (move on {count} more board first)',
		'Submit turn (move on {count} more boards first)',
		count,
		{ count },
	)
}

/**
 * The variant's `reasonText`: why a game ended, for the reasons of the multiverse.
 *
 * @param {string} reason reason code
 * @return {string|null}
 */
export function reasonText(reason) {
	switch (reason) {
		case 'checkmate':
			// TRANSLATORS: why a multiverse game ended: the loser could not finish its turn, a king would surely fall
			return t('quantumchess', 'checkmate: the turn could not be finished and a king would certainly be captured')
		case 'stalemate':
			// TRANSLATORS: why a multiverse game was drawn: the player to move could not finish its turn
			return t('quantumchess', 'stalemate: the turn could not be finished')
		case 'stranded':
			// TRANSLATORS: why a multiverse game ended: the loser's own move left its turn impossible to finish
			return t('quantumchess', 'stranded: a move left the turn impossible to finish')
		case 'quiet':
			// TRANSLATORS: why a multiverse game was drawn (Submit turn counts as a move); a brawn is a kind of pawn
			return t('quantumchess', '300 moves in a row without a capture or a pawn or brawn move')
		default:
			return null
	}
}
