/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The drawing of multiverse chess (handoff/research/multiverse-final.md section 9, scenarios U1 to U5): every stored
 * square drawn exactly once, the rows and columns, the present band, the must-move and optional halos, the branch
 * connectors, the travel arrows, the placeholders of the next boards, the threat lines of 5D check, the names, the
 * focus and its key, and Black's view.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import {
	applyMove,
	applyOutcome,
	branches,
	legalMoves,
	newGame,
	royalDanger,
	splitsFrom,
	T,
} from '../../../src/variants/core/quantum.js'
import V from '../../../src/variants/multiverse.js'
import { layoutOf, threats } from '../../../src/variants/multiverse/layout.js'
import { buildWorld } from '../../../src/variants/multiverse/setup.js'
import { mandatory, ROWS, skeleton, sqOf, uOf } from '../../../src/variants/multiverse/skeleton.js'

/**
 * A square by its static name.
 *
 * @param {string} name square name, e.g. `(0)c3` or `(0)~3c3`
 * @return {number}
 */
function sq(name) {
	const s = V.topology.byName(name)
	if (s < 0) {
		throw new Error('unknown square ' + name)
	}
	return s
}

/**
 * The static name of a square.
 *
 * @param {number} s square
 * @return {string}
 */
function nameOf(s) {
	return V.topology.names[s]
}

/**
 * A new game.
 *
 * @param {string} [setup] setup id
 * @param {object} [opts] more option values
 * @return {object}
 */
function start(setup = 'small', opts = {}) {
	return newGame(V, { setup, timelines: '3', reach: 'auto', view: 'white', ...opts })
}

/**
 * A one-world state from `buildWorld` options.
 *
 * @param {object} spec the world (see `buildWorld`)
 * @param {object} [options] the game's option values
 * @return {object}
 */
function one(spec, options = {}) {
	const b = buildWorld(spec)
	return {
		v: 1,
		variant: 'multiverse',
		options,
		worlds: [{ b, w: T }],
		turn: b.x.s,
		ply: 0,
		quiet: 0,
		result: null,
		history: [],
	}
}

/**
 * Play codes one after the other (outcome 0).
 *
 * @param {object} s state
 * @param {string[]} codes codes
 * @return {object}
 */
function run(s, codes) {
	for (const code of codes) {
		expect(branches(V, s, code), 'legal: ' + code).not.toBeNull()
		s = applyOutcome(V, s, code, 0)
	}
	return s
}

/**
 * The same state seen from Black's side.
 *
 * @param {object} s state
 * @return {object}
 */
function blackView(s) {
	return { ...s, options: { ...s.options, view: 'black' } }
}

/**
 * The layout of a state.
 *
 * @param {object} s state
 * @return {object}
 */
function L(s) {
	return layoutOf(V, s)
}

/**
 * The squares of every stored board (only the n × n part).
 *
 * @param {object} x the world's extra state
 * @return {number[]}
 */
function storedSquares(x) {
	const out = []
	for (let u = 0; u < ROWS; u++) {
		const e = x.tl[u]
		for (let v = e ? Math.max(e[0], e[1] - x.h) : 0; e && v <= e[1]; v++) {
			const slot = v === e[1] ? 0 : 1 + (v % x.h)
			for (let cy = 0; cy < x.n; cy++) {
				for (let cx = 0; cx < x.n; cx++) {
					out.push(sqOf(u, slot, cx, cy))
				}
			}
		}
	}
	return out
}

/**
 * The drawn cell of a square.
 *
 * @param {object} lay layout
 * @param {number} s square
 * @return {object}
 */
function cellOf(lay, s) {
	return lay.cells.find((c) => c.sq === s)
}

/**
 * The centre of the drawn cell of a square.
 *
 * @param {object} lay layout
 * @param {number} s square
 * @return {number[]}
 */
function centre(lay, s) {
	const c = cellOf(lay, s)
	return [c.x + 0.5, c.y + 0.5]
}

/**
 * The column and row of a drawn cell inside its board, counted from the top left.
 *
 * @param {object} cell drawn cell
 * @param {object} board drawn board
 * @return {number[]}
 */
function inBoard(cell, board) {
	return [Math.round(cell.x - board.x) + 0, Math.round(cell.y - board.y) + 0]
}

/**
 * The board rectangles that hold a point.
 *
 * @param {object} lay layout
 * @param {number} x x
 * @param {number} y y
 * @return {object[]}
 */
function boardsAt(lay, x, y) {
	return lay.layout.boards.filter((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
}

/**
 * Check the drawing of a state: every stored square exactly once, with a name, inside exactly one board frame and
 * inside the drawing; every piece on a drawn square; boards apart; the threat lines as many as the threats.
 *
 * @param {object} s state
 */
function checkLayout(s) {
	const lay = L(s)
	const x = s.worlds[0].b.x
	const drawn = lay.cells.map((c) => c.sq)
	expect(new Set(drawn).size).toBe(drawn.length)
	expect([...drawn].sort((a, b) => a - b)).toEqual(storedSquares(x).sort((a, b) => a - b))
	const set = new Set(drawn)
	for (const { b } of s.worlds) {
		b.board.forEach((id, q) => {
			if (id >= 0) {
				expect(set.has(q), 'a piece on an undrawn square ' + nameOf(q)).toBe(true)
			}
		})
	}
	const { width, height } = lay.layout
	expect(height).toBeGreaterThanOrEqual(0.75 * width - 1e-9)
	expect(lay.size).toBe(s.worlds[0].b.board.length)
	for (const c of lay.cells) {
		expect(lay.names[c.sq]).toMatch(/^Timeline .+, turn \d+, (White|Black) to move: [a-h][1-8]$/)
		expect(c.x >= 0 && c.y >= 0 && c.x + 1 <= width && c.y + 1 <= height).toBe(true)
		expect(boardsAt(lay, c.x + 0.5, c.y + 0.5)).toHaveLength(1)
	}
	expect(lay.layout.boards.length * x.n * x.n).toBe(lay.cells.length)
	const boards = lay.layout.boards
	for (let i = 0; i < boards.length; i++) {
		for (let j = i + 1; j < boards.length; j++) {
			const [a, b] = [boards[i], boards[j]]
			expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true)
		}
	}
	expect(lay.layout.outlines.filter((o) => o.kind === 'threat')).toHaveLength(threats(V, s).length)
	const f = lay.layout.focus
	expect(f.x > 0 && f.x < width && f.y > 0 && f.y < height).toBe(true)
	expect(f.zoom >= 1 && f.zoom <= 4).toBe(true)
}

/**
 * Play a random game (a split every few plies) and hand every state to `visit`.
 *
 * @param {object} s start state
 * @param {number} seed seed
 * @param {number} plies plies at most
 * @param {(s: object) => void} visit called with every state
 */
function randomGame(s, seed, plies, visit) {
	const rng = seededRng(seed)
	visit(s)
	for (let ply = 0; ply < plies && !s.result; ply++) {
		let codes = legalMoves(V, s).map((m) => m.code)
		if (ply % 4 === 1) {
			for (const { b } of s.worlds) {
				const id = b.sq.findIndex((q, i) => q >= 0 && b.sd[i] === s.turn && V.types[b.ty[i]].splittable)
				const splits = id >= 0 ? splitsFrom(V, s, b.sq[id]).map((m) => m.code) : []
				if (splits.length) {
					codes = splits
					break
				}
			}
		}
		s = applyMove(V, s, codes[Math.floor(rng() * codes.length)], rng).state
		visit(s)
	}
}

/** Start: 1. (0T1)d1-c3 (0T1)a4-a3, then White's knight travels back to (0T1)a3 and opens L+1 (scenario S3). */
const BRANCH = ['(0T1)d1-c3', '(0T1)a4-a3', '(0T2)c3>>(0T1)a3']

describe('the drawing of the multiverse', () => {
	it('draws the start: one board to play, the present and the next board (U1)', () => {
		const s = start()
		const lay = L(s)
		expect(lay.cells).toHaveLength(25)
		expect(lay.layout.boards.map((b) => b.label)).toEqual(['L0 T1 ○ · must move'])
		expect(lay.layout.areas.map((a) => a.shade)).toEqual(['frame', 'wood'])
		expect(lay.layout.outlines).toHaveLength(4)
		expect(lay.layout.outlines.every((o) => o.kind === 'next')).toBe(true)
		expect(lay.layout.lines).toEqual([])
		expect(lay.layout.height).toBeGreaterThanOrEqual(0.75 * lay.layout.width)
		expect(lay.layout.zoomable).toBe(true)
		expect(lay.size).toBe(s.worlds[0].b.board.length)
		const texts = lay.layout.labels.map((l) => l.text)
		expect(texts).toEqual(['New timelines: White 0/3 · Black 0/3', 'Now', 'L0', 'T1 ●'])
		// a1 is dark and at the bottom left of its board, e5 light at the top right
		const board = lay.layout.boards[0]
		const a1 = cellOf(lay, sq('(0)a1'))
		const e5 = cellOf(lay, sq('(0)e5'))
		expect([...inBoard(a1, board), a1.shade]).toEqual([0, 4, 'dark'])
		expect([...inBoard(e5, board), e5.shade]).toEqual([4, 0, 'dark'])
		expect(cellOf(lay, sq('(0)b1')).shade).toBe('light')
		checkLayout(s)
	})

	it('draws a branch: the new row, its connector, the travel arrow and 5D check through the past (U2, U5)', () => {
		const s = run(start(), BRANCH)
		const lay = L(s)
		const labels = lay.layout.labels.map((l) => l.text)
		expect(labels.filter((l) => /^L/.test(l) || l === 'new')).toEqual(['L0', 'L+1', 'new'])
		expect(lay.layout.areas.map((a) => a.shade).sort()).toEqual(['frame', 'river', 'wood'])
		expect(lay.layout.boards.map((b) => b.label)).toEqual([
			'T1 ○',
			'T1 ●',
			'T2 ○',
			'L0 T2 ● · optional',
			'L+1 T1 ● · must move',
		])
		// Black is in 5D check: the White knight on L+1 can take the king on (0T2 ○) a5
		expect(royalDanger(V, s, 1)).toBe(1)
		expect(lay.cells.filter((c) => c.shade === 'danger').map((c) => nameOf(c.sq))).toEqual(['(0)~1a5'])
		const threat = lay.layout.outlines.filter((o) => o.kind === 'threat')
		expect(threat).toHaveLength(1)
		expect([threat[0].x1, threat[0].y1, threat[0].x2, threat[0].y2])
			.toEqual([...centre(lay, sq('(+1)a3')), ...centre(lay, sq('(0)~1a5'))])
		// the connector runs from the right edge of the parent board (0T1 ○) to the left edge of (+1T1 ●)
		const parent = lay.layout.boards[0]
		const child = lay.layout.boards[4]
		expect(lay.layout.lines).toEqual([
			{ x1: parent.x + 5, y1: parent.y + 2.5, x2: child.x, y2: child.y + 2.5 },
		])
		expect(child.x).toBeGreaterThan(parent.x)
		expect(child.y).toBeGreaterThan(parent.y)
		// the travel arrow: from the square the knight left, (0T2 ○) c3, to the one it reached, (+1T1 ●) a3
		const travel = lay.layout.outlines.filter((o) => o.kind === 'travel')
		expect(travel).toHaveLength(3)
		const [x1, y1] = centre(lay, sq('(0)~1c3'))
		const [x2, y2] = centre(lay, sq('(+1)a3'))
		expect(travel[0]).toEqual({ x1, y1, x2, y2, kind: 'travel' })
		const shaft = Math.atan2(y1 - y2, x1 - x2)
		for (const head of travel.slice(1)) {
			expect([head.x1, head.y1]).toEqual([x2, y2])
			expect(Math.hypot(head.x2 - x2, head.y2 - y2)).toBeCloseTo(0.4, 9)
			const turn = Math.abs(Math.atan2(head.y2 - y2, head.x2 - x2) - shaft)
			expect(Math.min(turn, 2 * Math.PI - turn)).toBeCloseTo((25 * Math.PI) / 180, 9)
		}
		// placeholders after both boards Black may play, labelled with the board a move there makes
		expect(lay.layout.outlines.filter((o) => o.kind === 'next')).toHaveLength(8)
		expect(labels).toContain('T2 ○')
		expect(labels).toContain('T3 ○')
		expect(lay.names[sq('(+1)a3')]).toBe('Timeline +1, turn 1, Black to move: a3')
		expect(lay.names[sq('(0)~1a5')]).toBe('Timeline 0, turn 2, White to move: a5')
		checkLayout(s)
	})

	it('changes the focus key only when the boards to play change (U3)', () => {
		const s = run(start(), BRANCH)
		const key = L(s).layout.focus.key
		// a move on the optional board keeps the key, one on the must-move board changes it
		expect(L(run(s, ['(0T2)b4-b3'])).layout.focus.key).toBe(key)
		expect(L(run(s, ['(+1T1)e4-e3'])).layout.focus.key).not.toBe(key)
	})

	it('shows the danger inside one board with a threat outline, not a line (U4)', () => {
		const s = one({ s: 1, rows: { 0: { st: 6, en: 11, boards: { 11: '2k2/5/1N3/5/K4' } } } })
		const lay = L(s)
		expect(lay.cells.filter((c) => c.shade === 'danger').map((c) => nameOf(c.sq))).toEqual(['(0)c5'])
		expect(lay.layout.lines).toEqual([])
		const threat = lay.layout.outlines.filter((o) => o.kind === 'threat')
		expect(threat).toHaveLength(1)
		expect([threat[0].x1, threat[0].y1, threat[0].x2, threat[0].y2])
			.toEqual([...centre(lay, sq('(0)b3')), ...centre(lay, sq('(0)c5'))])
		checkLayout(s)
	})

	it('puts Black\'s timelines on top, White\'s below; Black\'s view reverses the rows and turns the boards', () => {
		const s = start('marauders')
		const lay = L(s)
		const rowOf = (lab) => lay.layout.labels.find((l) => l.text === lab).y
		expect(rowOf('L−1')).toBeLessThan(rowOf('L0'))
		expect(rowOf('L0')).toBeLessThan(rowOf('L+1'))
		const black = L(blackView(s))
		const rowOfB = (lab) => black.layout.labels.find((l) => l.text === lab).y
		expect(rowOfB('L+1')).toBeLessThan(rowOfB('L0'))
		expect(rowOfB('L0')).toBeLessThan(rowOfB('L−1'))
		// the same squares, each board turned by 180°: a1 at the top right, e5 at the bottom left
		expect(black.cells.map((c) => c.sq).sort()).toEqual(lay.cells.map((c) => c.sq).sort())
		const board = black.layout.boards.find((b) => b.label.startsWith('L0 '))
		const a1 = cellOf(black, sq('(0)a1'))
		const e5 = cellOf(black, sq('(0)e5'))
		expect(inBoard(a1, board)).toEqual([4, 0])
		expect(inBoard(e5, board)).toEqual([0, 4])
		// time still runs to the right
		const s2 = run(start('small', { view: 'black' }), BRANCH)
		const lay2 = L(s2)
		expect(cellOf(lay2, sq('(0)~1a1')).x).toBeLessThan(cellOf(lay2, sq('(0)a1')).x)
		expect(lay2.layout.focus.key.endsWith('/1')).toBe(true)
		checkLayout(blackView(s))
		checkLayout(s2)
	})

	it('gives every stored time a column and marks a jump in time and sealed boards with "⋯"', () => {
		// White has opened L+1 and L+2; L+2 is inactive and lags behind at T4 ●, L0 and L+1 are at T10 ○
		const s = one({
			s: 0,
			c: [2, 0],
			rows: {
				0: { st: 2, en: 20, boards: { 20: '2k2/5/5/5/K4' } },
				1: { st: 5, en: 20, parent: [0, 4], boards: { 20: '4k/5/5/5/1K3' } },
				2: { st: 7, en: 9, parent: [0, 6], boards: { 9: '4k/5/5/5/2K2' } },
			},
		})
		expect(skeleton(s.worlds[0].b.x).act(uOf(2, 0))).toBe(false)
		const lay = L(s)
		const boards = lay.layout.boards
		// columns T3 ● … T4 ● (L+2), then a gap, then T8 ○ … T10 ○ (L0, L+1) and the placeholders at T10 ●
		const xs = [...new Set(boards.map((b) => b.x))].sort((a, b) => a - b)
		expect(xs).toHaveLength(8)
		expect(xs[0]).toBe(3)
		expect(xs[1] - xs[0]).toBeCloseTo(6.1, 9)
		expect(xs[3] - xs[2]).toBeCloseTo(6.1 + 1.2, 9)
		expect(boards.filter((b) => b.x === xs[3]).map((b) => b.label)).toEqual(['T8 ○', 'T8 ○'])
		const next = lay.layout.outlines.filter((o) => o.kind === 'next')
		expect(Math.min(...next.map((o) => o.x1))).toBeCloseTo(xs[7] + 6.1, 9)
		const labels = lay.layout.labels
		const gap = labels.filter((l) => l.text === '⋯')
		// one for the gap, one left of each of L0 and L+1, whose older boards are sealed
		expect(gap).toHaveLength(3)
		expect(gap[0].x).toBeGreaterThan(xs[2] + 5)
		expect(gap[0].x).toBeLessThan(xs[3])
		expect(labels.map((l) => l.text)).toContain('inactive')
		expect(labels.map((l) => l.text)).toContain('New timelines: White 2/3 · Black 0/3')
		// both parent boards are sealed: the connectors start in the left margin of L0
		const rowY = (lab) => labels.find((l) => l.text === lab).y + 0.3
		expect(lay.layout.lines).toEqual([
			{ x1: 2.7, y1: rowY('L0'), x2: xs[3], y2: rowY('L+1') },
			{ x1: 2.7, y1: rowY('L0'), x2: xs[0], y2: rowY('L+2') },
		])
		checkLayout(s)
	})

	it('draws the present band with "Now" over the present column and every row', () => {
		const s = run(start(), BRANCH)
		const lay = L(s)
		const band = lay.layout.areas.find((a) => a.shade === 'frame')
		// the present is T1 ●: the column of (0T1 ●) and (+1T1 ●)
		const column = lay.layout.boards.filter((b) => b.label.includes('T1 ●'))
		expect(column).toHaveLength(2)
		for (const b of column) {
			expect(band.x < b.x && band.x + band.w > b.x + b.w).toBe(true)
			expect(band.y < b.y && band.y + band.h > b.y + b.h).toBe(true)
		}
		const now = lay.layout.labels.find((l) => l.text === 'Now')
		expect(now.x).toBe(column[0].x + 2.5)
		expect(now.y).toBeLessThan(band.y)
		expect(lay.layout.boards.filter((b) => b.x > band.x && b.x < band.x + band.w)).toHaveLength(2)
	})

	it('frames the must-move boards in gold and the optional ones in blue, and says so in the label', () => {
		let s = run(start(), BRANCH)
		const halo = (lay, label) => {
			const b = lay.layout.boards.find((e) => e.label === label)
			return lay.layout.areas.filter((a) => a.shade !== 'frame' && a.x < b.x && a.x + a.w > b.x + b.w
				&& a.y < b.y && a.y + a.h > b.y + b.h).map((a) => a.shade)
		}
		let lay = L(s)
		expect(halo(lay, 'L+1 T1 ● · must move')).toEqual(['wood'])
		expect(halo(lay, 'L0 T2 ● · optional')).toEqual(['river'])
		expect(halo(lay, 'T2 ○')).toEqual([])
		// after the must-move board is played, L0 is still optional and Submit is legal
		s = run(s, ['(+1T1)e4-e3'])
		lay = L(s)
		expect(mandatory(s.worlds[0].b.x)).toEqual([])
		expect(lay.layout.boards.filter((b) => b.label.includes(' · ')).map((b) => b.label)).toEqual([
			'L0 T2 ● · optional',
		])
		expect(halo(lay, 'L+1 T2 ○')).toEqual([])
		// the focus falls back to the boards Black may play
		const opt = lay.layout.boards.find((b) => b.label === 'L0 T2 ● · optional')
		expect([lay.layout.focus.x, lay.layout.focus.y]).toEqual([opt.x + 2.5, opt.y + 2.5])
		// after Submit White must move on L+1; L0 stays on Black's board T2 ●, which White cannot play
		s = run(s, ['submit'])
		lay = L(s)
		expect(lay.layout.boards.filter((b) => b.label.includes(' · ')).map((b) => b.label)).toEqual([
			'L+1 T2 ○ · must move',
		])
		expect(lay.layout.boards.map((b) => b.label)).toContain('L0 T2 ●')
		expect(halo(lay, 'L0 T2 ●')).toEqual([])
	})

	it('draws the arrow of a jump onto another timeline and keeps it for the opponent\'s turn', () => {
		// White must move on L0 and L+1; its knight jumps from (0T5) e1 to (+1T5) e3
		const s0 = one({
			s: 0,
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/K3N' } },
				1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/5/5/5/K4' } },
			},
		})
		const s = run(s0, ['(0T5)e1>(+1T5)e3'])
		expect(s.turn).toBe(1)
		const lay = L(s)
		const travel = lay.layout.outlines.filter((o) => o.kind === 'travel')
		expect(travel).toHaveLength(3)
		// from the board the knight left, (0T5 ○), now history, to the board it produced, (+1T5 ●)
		expect(nameOf(sq('(0)~3e1'))).toBe('(0)~3e1')
		const [x1, y1] = centre(lay, sq('(0)~3e1'))
		const [x2, y2] = centre(lay, sq('(+1)e3'))
		expect(travel[0]).toEqual({ x1, y1, x2, y2, kind: 'travel' })
		// Black's first move of its turn keeps White's arrow (the opponent's last turn), on the same squares
		const s2 = run(s, ['(0T5)e5-d5'])
		expect(s2.turn).toBe(1)
		const lay2 = L(s2)
		const travel2 = lay2.layout.outlines.filter((o) => o.kind === 'travel')
		expect(travel2).toHaveLength(3)
		expect(travel2[0]).toEqual({
			x1: centre(lay2, sq('(0)~3e1'))[0],
			y1: centre(lay2, sq('(0)~3e1'))[1],
			x2: centre(lay2, sq('(+1)e3'))[0],
			y2: centre(lay2, sq('(+1)e3'))[1],
			kind: 'travel',
		})
		// Black's turn ends on L+1; after White's next move the jump is two turns old and its arrow is gone
		const s3 = run(s2, ['(+1T5)e5-d5', '(0T6)a1-a2'])
		expect(s3.turn).toBe(0)
		expect(L(s3).layout.outlines.filter((o) => o.kind === 'travel')).toEqual([])
		checkLayout(s)
		checkLayout(s2)
	})

	it('shows no halos, placeholders or threats when the game is over, and focuses on the present column', () => {
		const s = run(start(), BRANCH)
		const over = { ...s, result: { winner: 0, reason: 'resign' } }
		const lay = L(over)
		expect(lay.layout.areas.map((a) => a.shade)).toEqual(['frame'])
		expect(lay.layout.outlines.filter((o) => o.kind !== 'travel')).toEqual([])
		expect(lay.cells.some((c) => c.shade === 'danger')).toBe(false)
		expect(lay.layout.boards.every((b) => !b.label.includes(' · '))).toBe(true)
		const column = lay.layout.boards.filter((b) => b.label.includes('T1 ●'))
		expect(lay.layout.focus.x).toBe(column[0].x + 2.5)
		expect(lay.layout.focus.y).toBe((column[0].y + column[1].y + 5) / 2)
		expect(lay.layout.focus.key).not.toBe(L(s).layout.focus.key)
	})

	it('frames the boards to play in the focus with a box for touch screens', () => {
		const s = start()
		const lay = L(s)
		const board = lay.layout.boards[0]
		const f = lay.layout.focus
		expect([f.x, f.y]).toEqual([board.x + 2.5, board.y + 2.5])
		// a single 5 × 5 board: at least 2.2 column pitches wide, the board and a margin of 1 high
		expect(f.box).toEqual({ w: 2.2 * 6.1, h: 7 })
		const zoom = Math.min(lay.layout.width / f.box.w, lay.layout.height / f.box.h)
		expect(f.zoom).toBeCloseTo(Math.min(4, Math.max(1, zoom)), 9)
		expect(f.key).toBe('0/2/1/0/0')
		// Standard: 8 × 8 boards with wider gaps
		const std = L(start('standard'))
		expect(std.layout.focus.box).toEqual({ w: 2.2 * 9.6, h: 10 })
		// two must-move boards: the box holds both
		const two = L(start('marauders'))
		const must = two.layout.boards.filter((b) => b.label.endsWith('must move'))
		expect(must.map((b) => b.label)).toEqual([
			'L−1 T1 ○ · must move',
			'L0 T1 ○ · must move',
			'L+1 T1 ○ · must move',
		])
		expect(two.layout.focus.box.h).toBeCloseTo(must[2].y + 5 - must[0].y + 2, 9)
		expect(two.layout.focus.y).toBeCloseTo((must[0].y + must[2].y + 5) / 2, 9)
	})

	it('keeps a layout for the same drawing and makes a new one when anything drawn changes', () => {
		const s = run(start(), BRANCH)
		const lay = L(s)
		// the same skeleton, records and threats: the same object
		expect(L(JSON.parse(JSON.stringify(s)))).toBe(lay)
		expect(L(blackView(s))).not.toBe(lay)
		// same skeleton string, other board size
		expect(L(start('verysmall')).cells).toHaveLength(16)
		expect(L(start('small')).cells).toHaveLength(25)
		expect(L(start('standard')).cells).toHaveLength(64)
	})

	it('keeps only the last few layouts: a large one is big', () => {
		let s = start('standard')
		const first = L(s)
		const later = []
		for (let i = 0; i < 8; i++) {
			s = applyOutcome(V, s, legalMoves(V, s)[0].code, 0)
			later.push([s, L(s)])
		}
		// the last eight drawings are kept, the one before them is made again
		expect(later.every(([st, lay]) => L(st) === lay)).toBe(true)
		const again = L(start('standard'))
		expect(again).not.toBe(first)
		expect(again).toEqual(first)
	})

	it('draws every stored square exactly once in random games, in both views', () => {
		const setups = [
			['small', {}],
			['verysmallopen', {}],
			['marauders', {}],
			['twotimelines', { reach: '2' }],
			['turnzero', { reach: '2' }],
		]
		let states = 0
		for (const [setup, opts] of setups) {
			for (const view of ['white', 'black']) {
				randomGame(start(setup, { ...opts, view }), setup.length * 31 + view.length, 24, (s) => {
					checkLayout(s)
					states++
				})
			}
		}
		expect(states).toBeGreaterThan(100)
	}, 60000)
})
