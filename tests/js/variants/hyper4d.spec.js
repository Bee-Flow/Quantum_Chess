/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * 4D chess (src/variants/hyper4d.js, TessChess on a 4 × 4 × 4 × 4 hypercube): the board and its drawing, the start
 * position, the movement of every piece across the boards, promotion, the end of the game, the computer player and
 * the quantum cases of the research spec (handoff/research/hyper4d.md, section 7: H1-H12, HQ1-HQ14).
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { sharedRules } from '../../../src/variantplay/texts.js'
import { chooseMove, LEVELS } from '../../../src/variants/core/ai.js'
import {
	applyMove,
	branches,
	budget,
	budgetInfo,
	legalMoves,
	newGame,
	outcomes,
	royalDanger,
	splitsFrom,
	splitTargets,
	T,
	worldResult,
} from '../../../src/variants/core/quantum.js'
import { applyClassical, attacks, generate, royalSquares, worldFrom } from '../../../src/variants/core/world.js'
import V from '../../../src/variants/hyper4d.js'
import { play, stateOf } from './helpers.js'

const topo = V.topology

/**
 * The cell with this name.
 *
 * @param {string} name cell name
 * @return {number}
 */
function S(name) {
	const s = topo.byName(name)
	expect(s, name).toBeGreaterThanOrEqual(0)
	return s
}

/**
 * A single classical world from a placement.
 *
 * @param {Record<string, string>} placement cells and pieces
 * @return {object}
 */
function world(placement) {
	return worldFrom(V, placement, {})
}

/**
 * The classical move keys of one world for a side, optionally only those from one cell, sorted.
 *
 * @param {object} w world
 * @param {number} side side index
 * @param {string} [from] cell name
 * @return {string[]}
 */
function keys(w, side, from) {
	return [...generate(V, w, side).values()]
		.filter((m) => from === undefined || topo.names[m.from] === from)
		.map((m) => m.key)
		.sort()
}

/**
 * The target cells of the classical moves from a cell, without promotion suffixes, sorted.
 *
 * @param {object} w world
 * @param {number} side side index
 * @param {string} from cell name
 * @return {string[]}
 */
function targets(w, side, from) {
	return [...new Set(keys(w, side, from).map((k) => k.split('-')[1].split('=')[0]))].sort()
}

/**
 * The number of targets of a piece alone on the hypercube.
 *
 * @param {string} type piece type
 * @param {string} cell cell name
 * @return {number}
 */
function lone(type, cell) {
	return targets(world({ [cell]: '0:' + type }), 0, cell).length
}

/**
 * A state from placements (plain, or with a relative weight); the pieces must be listed in the same order in every
 * placement, so that a piece has the same id in every world.
 *
 * @param {Array<object|[object, number]>} worlds placements
 * @param {number} [turn] side to move
 * @return {object}
 */
function pos(worlds, turn = 0) {
	return stateOf(V, worlds.map((w) => (Array.isArray(w) ? w : [w, 1])), turn)
}

/**
 * Equally likely worlds: a fixed placement, then every combination of the given ghost pieces, each on one of its two
 * cells.
 *
 * @param {Record<string, string>} base fixed pieces
 * @param {Array<[string, string[]]>} parts `[piece, [cell1, cell2]]`, independent of each other
 * @return {object}
 */
function ghosts(base, parts) {
	let list = [{ ...base }]
	for (const [piece, squares] of parts) {
		list = list.flatMap((pl) => squares.map((c) => ({ ...pl, [c]: piece })))
	}
	return pos(list)
}

/**
 * Where the pieces of a side and type may be: cell name (or `off`, captured) → percentage, summed over the pieces.
 *
 * @param {object} s state
 * @param {number} side side index
 * @param {string} type piece type
 * @return {Record<string, number>}
 */
function where(s, side, type) {
	const acc = {}
	for (const { b, w } of s.worlds) {
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sd[id] === side && b.ty[id] === type) {
				const name = b.sq[id] >= 0 ? topo.names[b.sq[id]] : 'off'
				acc[name] = (acc[name] ?? 0) + w
			}
		}
	}
	const out = {}
	for (const [name, w] of Object.entries(acc)) {
		out[name] = Math.round((w / T) * 10000) / 100
	}
	return out
}

/**
 * The outcomes of a move in short form: `[key, percentage, rolled]`.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {Array<[string, number, boolean]>|null}
 */
function outs(s, code) {
	const list = outcomes(V, s, code)
	return list ? list.map((o) => [o.key, Math.round(o.p * 10000) / 100, o.rolled]) : null
}

/**
 * Whether, in every world, piece `a` stands on `sa` exactly when piece `b` stands on `sb` (a link).
 *
 * @param {object} s state
 * @param {[number, string]} a side and type of the first piece
 * @param {[number, string]} b side and type of the second piece
 * @param {string} sa cell of the first piece
 * @param {string} sb cell of the second piece
 * @return {boolean}
 */
function linked(s, a, b, sa, sb) {
	return s.worlds.every(({ b: w }) => at(w, a, sa) === at(w, b, sb))
}

/**
 * Whether, in every world where piece `a` stands on `sa`, piece `b` stands on `sb`.
 *
 * @param {object} s state
 * @param {[number, string]} a side and type of the first piece
 * @param {[number, string]} b side and type of the second piece
 * @param {string} sa cell of the first piece
 * @param {string} sb cell of the second piece
 * @return {boolean}
 */
function implies(s, a, b, sa, sb) {
	return s.worlds.every(({ b: w }) => !at(w, a, sa) || at(w, b, sb))
}

/**
 * Whether a piece of a side and type stands on a cell in a world.
 *
 * @param {object} w world
 * @param {[number, string]} piece side and type
 * @param {string} cell cell name
 * @return {boolean}
 */
function at(w, [side, type], cell) {
	const id = w.board[S(cell)]
	return id >= 0 && w.sd[id] === side && w.ty[id] === type
}

/**
 * A sorted list of cell names.
 *
 * @param {...string} groups cell names separated by spaces
 * @return {string[]}
 */
function cells(...groups) {
	return groups.join(' ').split(' ').filter(Boolean).sort()
}

/** The start position as the spec lists it (section 2.3). */
const START = {
	A1b1: '0:r',
	A1c1: '0:n',
	B1a1: '0:b',
	B1d1: '0:q',
	C1a1: '0:b',
	C1d1: '0:k',
	D1b1: '0:r',
	D1c1: '0:n',
	A4b4: '1:r',
	A4c4: '1:n',
	B4a4: '1:b',
	B4d4: '1:q',
	C4a4: '1:b',
	C4d4: '1:k',
	D4b4: '1:r',
	D4c4: '1:n',
}
for (const c of ['A2b2', 'A2c2', 'B2a2', 'B2b2', 'B2c2', 'B2d2', 'C2a2', 'C2b2', 'C2c2', 'C2d2', 'D2b2', 'D2c2']) {
	START[c] = '0:p'
}
for (const c of ['A3b3', 'A3c3', 'B3a3', 'B3b3', 'B3c3', 'B3d3', 'C3a3', 'C3b3', 'C3c3', 'C3d3', 'D3b3', 'D3c3']) {
	START[c] = '1:p'
}

/**
 * The number of move sequences of a given length from a world (a king capture ends a line).
 *
 * @param {object} w world
 * @param {number} side side to move
 * @param {number} depth plies
 * @return {number}
 */
function perft(w, side, depth) {
	let n = 0
	for (const m of generate(V, w, side).values()) {
		const next = applyClassical(V, w, m)
		n += depth === 1 || royalSquares(V, next, 1 - side).length === 0 ? 1 : perft(next, 1 - side, depth - 1)
	}
	return n
}

describe('4D chess: board and setup', () => {
	it('has 256 named cells with 4D coordinates and the true 4D colouring', () => {
		expect(V.id).toBe('hyper4d')
		expect(V.category).toBe('dimensions')
		expect(topo.size).toBe(256)
		expect(topo.dims).toBe(4)
		expect(topo.coords[S('A1a1')]).toEqual([0, 0, 0, 0])
		expect(topo.coords[S('B2b2')]).toEqual([1, 1, 1, 1])
		expect(topo.coords[S('C3c2')]).toEqual([2, 1, 2, 2])
		expect(topo.coords[S('D4d4')]).toEqual([3, 3, 3, 3])
		topo.coords.forEach(([x, y, z, w], sq) => {
			expect(sq).toBe(x + 4 * y + 16 * z + 64 * w)
			expect(topo.names[sq]).toMatch(/^[A-D][1-4][a-d][1-4]$/)
		})
		const shade = (n) => topo.cells[S(n)].shade
		expect([shade('A1a1'), shade('B1a1'), shade('C1a1'), shade('A2a1'), shade('A1b1')])
			.toEqual(['dark', 'light', 'dark', 'light', 'light'])
		expect(topo.cells.filter((c) => c.shade === 'dark')).toHaveLength(128)
	})

	it('draws a 4 × 4 grid of labelled 4 × 4 boards, White at the bottom', () => {
		const L = topo.layout
		expect([L.width, L.height]).toEqual([18.4, 18.4])
		expect(L.width * L.height).toBeGreaterThan(200)
		expect(L.boards).toHaveLength(16)
		const labels = [...'ABCD'].flatMap((c) => [1, 2, 3, 4].map((r) => c + r))
		expect(L.boards.map((b) => b.label).sort()).toEqual(labels)
		const board = (label) => L.boards.find((b) => b.label === label)
		expect(board('A1')).toMatchObject({ x: 0, y: 14.4, w: 4, h: 4 })
		expect(board('D4')).toMatchObject({ x: 14.4, y: 0, w: 4, h: 4 })
		// every cell lies on its board: B2c3 is square c3 of board B2
		for (const c of topo.cells) {
			const n = topo.names[c.sq]
			const b = board(n.slice(0, 2))
			expect(c.x - b.x).toBeCloseTo('abcd'.indexOf(n[2]), 9)
			expect(c.y - b.y).toBeCloseTo(4 - Number(n[3]), 9)
			expect(c).toMatchObject({ w: 1, h: 1, shape: 'rect' })
		}
		// the rank numbers left of every board, in the gap before it
		const ranks = L.labels.filter((l) => /^[1-4]$/.test(l.text))
		expect(ranks).toHaveLength(64)
		for (const l of ranks) {
			const board = L.boards.find((b) => l.y > b.y && l.y < b.y + b.h && l.x < b.x && l.x > b.x - 0.8)
			expect(board, l.x + ' ' + l.y).toBeDefined()
			expect(board.x - l.x).toBeCloseTo(0.3, 9)
		}
		// every file letter under every board of the bottom row, far enough below it that Black's view (the drawing
		// turned round) puts them a line above the board labels, which are drawn just above the frames
		const files = L.labels.filter((l) => /^[a-d]$/.test(l.text))
		expect(files.map((l) => l.text).join('')).toBe('abcdabcdabcdabcd')
		for (const l of files) {
			expect(l.y - L.height).toBeGreaterThanOrEqual(0.8)
			expect(L.height - l.y).toBeLessThan(-0.6)
		}
		for (const l of L.labels) {
			expect(l.x).toBeGreaterThan(-0.7)
			expect(l.y).toBeLessThan(L.height + 0.9)
		}
	})

	it('opens on the 2 × 2 boards around the pieces of the side to move on a touch screen, whole with a mouse', () => {
		const start = newGame(V)
		const white = V.layoutOf(start)
		expect(white.cells).toBe(topo.cells)
		// White's pieces and pawns stand on the two lowest board rows: the block of B1, C1, B2 and C2
		expect(white.layout.focus).toEqual({ x: 9.2, y: 14, zoom: 1, box: { w: 9.8, h: 9.8 }, key: '0:1:2' })
		const s = play(V, start, 'B2b2-B2b3')
		expect(V.layoutOf(s).layout.focus).toMatchObject({ x: 9.2, y: 4.4, key: '1:1:0' })
		// the same layout object for the same focus (the view recentres only when the key changes)
		expect(V.layoutOf(s)).toBe(V.layoutOf(play(V, start, 'B2c2-B2c3')))
		// an army that moved over to the queen's side of the hypercube: the focus follows it
		const west = stateOf(V, [[{ A1a1: '0:k', A2b2: '0:p', B1a1: '0:q', D4d4: '1:k' }, 1]])
		expect(V.layoutOf(west).layout.focus).toMatchObject({ x: 4.4, y: 14 })
		const over = { ...s, result: { winner: 0, reason: 'king' } }
		expect(V.layoutOf(over)).toBe(topo)
	})

	it('starts with every piece on its TessChess square (H1)', () => {
		const s = newGame(V)
		const b = s.worlds[0].b
		const seen = {}
		b.sq.forEach((sq, id) => {
			seen[topo.names[sq]] = b.sd[id] + ':' + b.ty[id]
		})
		expect(seen).toEqual(START)
		expect(b.sq).toHaveLength(40)
		expect(b.x).toEqual({})
		expect(s.turn).toBe(0)
		// a fresh world per game
		expect(newGame(V).worlds[0].b).not.toBe(b)
	})

	it('names, draws and values every piece type and explains the variant in 3 to 8 sentences', () => {
		for (const [id, T] of Object.entries(V.types)) {
			expect(typeof T.name(), id).toBe('string')
			expect(T.glyph.sprite).toBe(id)
			expect(T.value).toBeGreaterThan(0)
		}
		expect(Object.keys(V.types).sort()).toEqual(['b', 'k', 'n', 'p', 'q', 'r'])
		expect([...V.solidTypes].sort()).toEqual(['k', 'p'])
		const rules = V.rules()
		expect(rules.length).toBeGreaterThanOrEqual(3)
		expect(rules.length).toBeLessThanOrEqual(8)
		rules.forEach((r) => expect(r.length).toBeGreaterThan(10))
		// no castling and no en passant, so the shared card leaves out its sentence about them (LEAD-DECISIONS L2)
		expect(V.specialMoves).toBe(false)
		expect(sharedRules(V).some((r) => r.includes('Castling') || r.includes('en passant'))).toBe(false)
		// the classic end rules come from the core (L1), and the shared card explains the escape rule
		expect([V.escapeRule, V.bareKingsDraw, V.drawsWait]).toEqual([true, true, true])
		expect(sharedRules(V).some((r) => r.includes('cannot escape'))).toBe(true)
		expect(rules.some((r) => /no checkmate|only by capturing/i.test(r))).toBe(false)
	})

	it('has 153 moves per side at the start, perft 2 = 23,453 and perft 3 = 3,788,850 (H1)', () => {
		const b = newGame(V).worlds[0].b
		for (const side of [0, 1]) {
			const count = {}
			for (const m of generate(V, b, side).values()) {
				count[b.ty[m.id]] = (count[b.ty[m.id]] ?? 0) + 1
			}
			expect(count).toEqual({ p: 24, n: 26, b: 26, k: 16, q: 29, r: 32 })
		}
		expect(perft(b, 0, 2)).toBe(23453)
		expect(perft(b, 0, 3)).toBe(3788850)
	}, 20000)

	it('attacks nothing at the start and no first move attacks a king (H1)', () => {
		const b = newGame(V).worlds[0].b
		for (let id = 0; id < b.sq.length; id++) {
			expect(attacks(V, b, 1 - b.sd[id], b.sq[id]), topo.names[b.sq[id]]).toBe(false)
		}
		for (const side of [0, 1]) {
			for (const m of generate(V, b, side).values()) {
				const next = applyClassical(V, b, m)
				expect(attacks(V, next, side, royalSquares(V, next, 1 - side)[0]), m.key).toBe(false)
				expect(attacks(V, next, 1 - side, royalSquares(V, next, side)[0]), m.key).toBe(false)
			}
		}
	})

	it('gives the start pieces exactly the moves of the spec (H2)', () => {
		const b = newGame(V).worlds[0].b
		expect(targets(b, 0, 'B1d1')).toEqual(cells(
			'A1c2 A1d1 A1d2 A2c1 A2d1 A2d2 B1a4 B1b1 B1b3 B1c1 B1c2 B1d2 B1d3 B1d4 B2c1 B2d1',
			'B3b1 B3d1 B4a1 B4d1 C1c1 C1c2 C1d2 C2c1 C2d1 D1b3 D1d3 D3b1 D3d1',
		))
		const rook = cells('A1a1 A1b2 A1b3 A1b4 A2a2 A2b1 A3b1 A4b1 B1a2 B1b1 B1c2 B2a1 B2c1 C1b1 C1d3 C3d1')
		expect(targets(b, 0, 'A1b1')).toEqual(rook)
		expect(targets(b, 0, 'A1c1')).toEqual(cells('A1a2 A1b3 A1d3 A2a1 A2c3 A3b1 A3c2 A3d1 B1c3 B3c1 C1b1 C1c2 C2c1'))
		expect(targets(b, 0, 'B1a1')).toEqual(cells('A1a2 A2a1 B1b2 B1c3 B1d4 B2b1 B3c1 B4d1 C1a2 C1b1 C2a1 D1a3 D3a1'))
		expect(targets(b, 0, 'A2b2')).toEqual(['A2b3', 'A3b2'])
		expect(targets(b, 1, 'A3b3')).toEqual(['A2b3', 'A3b2'])
	})
})

describe('4D chess: movement', () => {
	it('moves the rook along orthogonals and triagonals (H3)', () => {
		expect(targets(world({ B2b2: '0:r' }), 0, 'B2b2')).toEqual(cells(
			'A1a2 A1b1 A1b3 A1c2 A2a1 A2a3 A2b2 A2c1 A2c3 A3a2 A3b1 A3b3 A3c2 B1a1 B1a3 B1b2',
			'B1c1 B1c3 B2a2 B2b1 B2b3 B2b4 B2c2 B2d2 B3a1 B3a3 B3b2 B3c1 B3c3 B4b2 B4d4 C1a2',
			'C1b1 C1b3 C1c2 C2a1 C2a3 C2b2 C2c1 C2c3 C3a2 C3b1 C3b3 C3c2 D2b2 D2d4 D4b4 D4d2',
		))
		expect(lone('r', 'A1a1')).toBe(24)
		expect(topo.names.reduce((a, n) => a + lone('r', n), 0) / 256).toBe(30)
		const w = world({ A1a1: '0:r' })
		expect(keys(w, 0, 'A1a1')).toContain('A1a1-A2b2')
		expect(keys(w, 0, 'A1a1')).not.toContain('A1a1-A1b2')
		expect(keys(w, 0, 'A1a1')).not.toContain('A1a1-B2b2')
	})

	it('moves the bishop along diagonals and quadragonals, always on its colour (H4)', () => {
		expect(targets(world({ A1a1: '0:b' }), 0, 'A1a1')).toEqual(cells(
			'A1b2 A1c3 A1d4 A2a2 A2b1 A3a3 A3c1 A4a4 A4d1 B1a2 B1b1 B2a1 B2b2 C1a3 C1c1 C3a1',
			'C3c3 D1a4 D1d1 D4a1 D4d4',
		))
		expect(lone('b', 'B2b2')).toBe(47)
		for (const [from, shade] of [['B1a1', 'light'], ['C1a1', 'dark']]) {
			const list = targets(world({ [from]: '0:b' }), 0, from)
			expect(list.length).toBeGreaterThan(0)
			list.forEach((n) => expect(topo.cells[S(n)].shade).toBe(shade))
		}
		expect(keys(world({ A1a1: '0:b' }), 0, 'A1a1')).not.toContain('A1a1-A2b2')
	})

	it('moves the queen in all 80 directions and captures a king along the long diagonal (H5)', () => {
		expect(lone('q', 'A1a1')).toBe(45)
		expect(lone('q', 'B2b2')).toBe(95)
		const q = new Set(targets(world({ A1a1: '0:q' }), 0, 'A1a1'))
		const rb = [...targets(world({ A1a1: '0:r' }), 0, 'A1a1'), ...targets(world({ A1a1: '0:b' }), 0, 'A1a1')]
		expect(new Set(rb)).toEqual(q)
		expect(q.has('B2b2') && q.has('A2b2')).toBe(true)
		const s = pos([{ A1a1: '0:q', D1d1: '0:k', D4d4: '1:k' }])
		expect(outs(s, 'A1a1-D4d4')).toEqual([['capture', 100, false]])
		expect(royalDanger(V, s, 1)).toBe(1)
		expect(play(V, s, 'A1a1-D4d4').result).toEqual({ winner: 0, reason: 'king' })
	})

	it('steps the king onto every touching cell (H6)', () => {
		const corner = cells('A1a2 A1b1 A1b2 A2a1 A2a2 A2b1 A2b2 B1a1 B1a2 B1b1 B1b2 B2a1 B2a2 B2b1 B2b2')
		expect(targets(world({ A1a1: '0:k' }), 0, 'A1a1')).toEqual(corner)
		const king = targets(world({ B2b2: '0:k' }), 0, 'B2b2')
		expect(king).toHaveLength(80)
		expect(king).toContain('C3c2')
		expect(king).toContain('C3c3')
	})

	it('jumps the knight 2 + 1 on any two axes, over anything (H7)', () => {
		const list = cells('A1b3 A1c2 A2a3 A2c1 A3a2 A3b1 B1a3 B1c1 B3a1 C1a2 C1b1 C2a1')
		expect(targets(world({ A1a1: '0:n' }), 0, 'A1a1')).toEqual(list)
		expect(lone('n', 'B2b2')).toBe(24)
		expect(lone('n', 'D4d4')).toBe(12)
		const boxed = world({
			A1a1: '0:n',
			A1b1: '0:r',
			A1a2: '0:r',
			B1a1: '0:r',
			A2a1: '0:r',
			D1d1: '0:k',
			D4d4: '1:k',
		})
		expect(targets(boxed, 0, 'A1a1')).toEqual(list)
	})

	it('pushes a pawn along both forward axes and captures one forward plus one sideways step (H8)', () => {
		expect(targets(world({ B2b2: '0:p' }), 0, 'B2b2')).toEqual(['B2b3', 'B3b2'])
		const around = ['B2a3', 'B2c3', 'A2b3', 'C2b3', 'B3a2', 'B3c2', 'A3b2', 'C3b2']
		const white = { B2b2: '0:p' }
		around.forEach((c) => {
			white[c] = '1:n'
		})
		expect(targets(world(white), 0, 'B2b2')).toEqual(['B2b3', 'B3b2', ...around].sort())
		expect(targets(world({ B3b3: '1:p' }), 1, 'B3b3')).toEqual(['B2b3', 'B3b2'])
		// Black mirrors both forward axes: its captures from B3b3 go to rank 2 or board row 2
		const mirrored = ['B3a2', 'B3c2', 'A3b2', 'C3b2', 'B2a3', 'B2c3', 'A2b3', 'C2b3']
		const black = { B3b3: '1:p' }
		mirrored.forEach((c) => {
			black[c] = '0:n'
		})
		expect(targets(world(black), 1, 'B3b3')).toEqual(['B2b3', 'B3b2', ...mirrored].sort())
	})

	it('never lets a pawn capture straight ahead, step twice, sideways or backwards (H9)', () => {
		expect(keys(world({ B2b2: '0:p', B2b3: '1:n', B3b2: '1:n', B3b3: '1:n' }), 0, 'B2b2')).toEqual([])
		expect(targets(world({ B2b2: '0:p', B2c2: '1:n', C2b2: '1:n', B2a1: '1:n', B1c2: '1:n' }), 0, 'B2b2'))
			.toEqual(['B2b3', 'B3b2'])
		const s = pos([{ B2b2: '0:p', D1d1: '0:k', D4d4: '1:k' }])
		expect(branches(V, s, 'B2b2-B2b4')).toBeNull()
		expect(branches(V, s, 'B2b2-B4b2')).toBeNull()
		expect(keys(world({ B2b4: '0:p' }), 0, 'B2b4')).toEqual(['B2b4-B3b4'])
	})

	it('promotes a pawn on the last rank of the last board row, by either push or a capture (H10)', () => {
		const promos = (from, to) => ['q', 'r', 'b', 'n'].map((p) => from + '-' + to + '=' + p).sort()
		expect(keys(world({ B4b3: '0:p' }), 0)).toEqual(promos('B4b3', 'B4b4'))
		expect(keys(world({ B3b4: '0:p' }), 0)).toEqual(promos('B3b4', 'B4b4'))
		expect(keys(world({ B3b3: '0:p' }), 0)).toEqual(['B3b3-B3b4', 'B3b3-B4b3'])
		const three = ['A4b4', 'B4b4', 'B4c4'].flatMap((to) => promos('B4b3', to)).sort()
		expect(keys(world({ B4b3: '0:p', A4b4: '1:n', B4c4: '1:n' }), 0)).toEqual(three)
		expect(keys(world({ C1c2: '1:p' }), 1)).toEqual(promos('C1c2', 'C1c1'))
		expect(keys(world({ C2c1: '1:p' }), 1)).toEqual(promos('C2c1', 'C1c1'))
		expect(keys(world({ C2c2: '1:p' }), 1)).toEqual(['C2c2-C1c2', 'C2c2-C2c1'])
		const s = pos([{ B4b3: '0:p', D1d1: '0:k', D4d4: '1:k' }])
		expect(branches(V, s, 'B4b3-B4b4')).toBeNull()
		expect(branches(V, s, 'B4b3-B4b4=k')).toBeNull()
		expect(where(play(V, s, 'B4b3-B4b4=n'), 0, 'n')).toEqual({ B4b4: 100 })
	})

	it('has no castling: the king only steps to touching cells (H11)', () => {
		const w = world({ C1d1: '0:k', A1b1: '0:r', D1b1: '0:r', D4d4: '1:k' })
		const list = keys(w, 0, 'C1d1')
		expect(list).toHaveLength(23)
		for (const k of list) {
			const t = topo.coords[S(k.split('-')[1])]
			expect([2, 3]).toContain(t[0])
			expect([0, 1]).toContain(t[1])
			expect([1, 2, 3]).toContain(t[2])
			expect([0, 1]).toContain(t[3])
		}
		expect(keys(w, 0).every((k) => /^[A-D][1-4][a-d][1-4]-[A-D][1-4][a-d][1-4]$/.test(k))).toBe(true)
	})
})

describe('4D chess: end of the game', () => {
	it('draws when only the two kings are left and they do not touch (H12)', () => {
		const s = pos([{ B2b2: '0:k', D4d4: '1:k', C2b2: '1:n' }])
		expect(outs(s, 'B2b2-C2b2')).toEqual([['capture', 100, false]])
		const after = play(V, s, 'B2b2-C2b2')
		expect(after.result).toEqual({ winner: null, reason: 'bareKings' })
		expect(legalMoves(V, after)).toEqual([])
	})

	it('plays on while the two kings touch, and capturing a king wins (H12)', () => {
		const s = pos([{ B2b2: '0:k', C3c3: '1:k', C2b2: '1:n' }])
		const after = play(V, s, 'B2b2-C2b2')
		expect(after.result).toBeNull()
		expect(royalDanger(V, after, 0)).toBe(1)
		expect(play(V, after, 'C3c3-C2b2').result).toEqual({ winner: 1, reason: 'king' })
		// the draw only waited: a king that steps away instead leaves two kings that do not touch
		expect(play(V, after, 'C3c3-D4d4').result).toEqual({ winner: null, reason: 'bareKings' })
		// the bare-kings draw is the core's (bareKingsDraw, drawsWait), not a second copy in the variant (L1)
		expect(V.worldResult).toBeUndefined()
		expect(worldResult(V, world({ B2b2: '0:k', D4d4: '1:k' }), 0)).toBeNull()
		expect(worldResult(V, world({ B2b2: '0:k', D4d4: '1:k', A1a1: '0:p' }), 0)).toBeNull()
		expect(worldResult(V, world({ B2b2: '0:k', A1a1: '1:q' }), 1)).toEqual({ winner: 0, reason: 'king' })
		expect(worldResult(V, world({ D4d4: '1:k', A1a1: '0:q' }), 0)).toEqual({ winner: 1, reason: 'king' })
	})

	it('counts the 50-move rule only where a pawn really moved (HQ2b)', () => {
		const s = { ...pos([
			{ B2b2: '0:p', D1d1: '0:k', D4d4: '1:k', B2b3: '1:n' },
			{ B2b2: '0:p', D1d1: '0:k', D4d4: '1:k', B3b2: '1:n' },
		]), quiet: 7 }
		expect(outs(s, 'B2b2-B2b3')).toEqual([['miss', 50, true], ['move', 50, true]])
		expect(play(V, s, 'B2b2-B2b3', 0).quiet).toBe(8)
		expect(play(V, s, 'B2b2-B2b3', 1).quiet).toBe(0)
		const quiet = { ...pos([{ A1a1: '0:r', D1d1: '0:k', D4d4: '1:k', D4a3: '1:r' }]), quiet: 99 }
		expect(play(V, quiet, 'A1a1-A2a1').result).toEqual({ winner: null, reason: 'quiet' })
		// the draw waits while the side to move can take the king for certain: the rook on D4a4 reaches D1d1 along
		// the triagonal D3b3, D2c2 (drawsWait, docs/rules.md 6)
		const threat = { ...pos([{ A1a1: '0:r', D1d1: '0:k', D4d4: '1:k', D4a4: '1:r' }]), quiet: 99 }
		const waiting = play(V, threat, 'A1a1-A2a1')
		expect(waiting.result).toBeNull()
		expect(outs(waiting, 'D4a4-D1d1')).toEqual([['capture', 100, false]])
		expect(play(V, waiting, 'D4a4-D4a3').result).toEqual({ winner: null, reason: 'quiet' })
	})

	it('wins at once when the enemy king cannot escape, also against ghosts (L1)', () => {
		// a queen next to the king in the corner, guarded by its own king: every cell the king could go to is taken
		const mate = { B2b2: '0:k', C1c1: '0:q', D4d4: '1:k' }
		const cornered = { winner: 0, reason: 'cannotEscape' }
		expect(play(V, pos([mate]), 'C1c1-C3c3').result).toEqual(cornered)
		// Black's far pieces (a knight split over two cells) and White's ghost rook change nothing: no move, split,
		// merge or measurement saves the king
		const far = ghosts({ ...mate, A1d4: '1:r' }, [['1:n', ['A4a1', 'A1a4']], ['0:r', ['A1a1', 'B1a1']]])
		expect(far.worlds).toHaveLength(4)
		expect(play(V, far, 'C1c1-C3c3').result).toEqual(cornered)
		// a knight that can take the queen, even in only one of its two possible cells, is an escape
		expect(play(V, pos([{ ...mate, C3a2: '1:n' }]), 'C1c1-C3c3').result).toBeNull()
		expect(play(V, ghosts(mate, [['1:n', ['C3a2', 'A4a1']]]), 'C1c1-C3c3').result).toBeNull()
	})

	it('counts a split whose two halves block two lines to the king as an escape (L1)', () => {
		// the queens on D4b4 and D4d2 take the cornered king through D4c4 and D4d3, and the rook and the knight guard
		// the three flight cells the queens miss: no single move blocks both lines
		const base = { A1a1: '0:k', D4b4: '0:q', A4d2: '0:q', C1d4: '0:r', B2d4: '0:n', D4d4: '1:k' }
		const after = play(V, pos([{ ...base, B4d4: '1:n' }]), 'A4d2-D4d2')
		expect(after.result).toBeNull()
		expect(royalDanger(V, after, 1)).toBe(1)
		expect(royalDanger(V, play(V, after, 'B4d4-D4c4'), 1)).toBe(1)
		expect(royalDanger(V, play(V, after, 'B4d4-D4d3'), 1)).toBe(1)
		// the knight on B4d4 reaches both cells: split, it blocks each line in half of the possibilities, and no
		// capture of the king is certain any more
		expect(outs(after, 'B4d4-D4c4|D4d3')).toEqual([['split', 100, false]])
		expect(royalDanger(V, play(V, after, 'B4d4-D4c4|D4d3'), 1)).toBe(0.5)
		// a knight that reaches only D4c4, or neither cell, cannot save the king
		const lost = { winner: 0, reason: 'cannotEscape' }
		expect(play(V, pos([{ ...base, D4a3: '1:n' }]), 'A4d2-D4d2').result).toEqual(lost)
		expect(play(V, pos([{ ...base, A4a1: '1:n' }]), 'A4d2-D4d2').result).toEqual(lost)
	})

	it('finds a mate against a large ghost army without trying thousands of splits in full', () => {
		// 32 worlds, Black's budget not full: its queen, rooks, bishops and knights have about 4,000 split pairs, and
		// before the core pruned them (a key that takes the king after both one-sided moves takes it after the split)
		// the mating move took about 10 s
		const base = {
			B2b2: '0:k',
			C1c1: '0:q',
			D4d4: '1:k',
			D3c1: '1:q',
			A2c4: '1:r',
			D1a1: '1:r',
			C3a4: '1:b',
			C2c3: '1:b',
			D1d4: '1:n',
			C3d2: '1:n',
		}
		const s = ghosts(base, [
			['1:n', ['B1a1', 'B4d4']],
			['1:b', ['C1c4', 'B4c4']],
			['0:n', ['A1a1', 'A2c1']],
			['0:b', ['A4b4', 'C1b4']],
			['0:r', ['D3a4', 'D2a3']],
		])
		expect(s.worlds).toHaveLength(32)
		expect([budget(s, 0), budget(s, 1)]).toEqual([8, 4])
		const started = Date.now()
		expect(play(V, s, 'C1c1-C3c3').result).toEqual({ winner: 0, reason: 'cannotEscape' })
		expect(Date.now() - started).toBeLessThan(4000)
	}, 30000)
})

describe('4D chess: the computer player', () => {
	it('values advanced pawns and central pieces', () => {
		const b = newGame(V).worlds[0].b
		expect(V.evaluate(b, 0)).toBe(0)
		expect(V.evaluate(b, 1)).toBe(0)
		// a White pawn one push before promotion: 3 steps made (24) plus 40
		const w = world({ D1d1: '0:k', D4d4: '1:k', B3b4: '0:p' })
		expect(V.evaluate(w, 0)).toBe(64)
		expect(V.evaluate(w, 1)).toBe(-64)
		// a Black knight in the middle of the hypercube: all four coordinates in the middle rows
		expect(V.evaluate(world({ D1d1: '0:k', D4d4: '1:k', B2c3: '1:n' }), 1)).toBe(20)
	})

	it('plays a legal move from the start at every level within its time', async () => {
		const s = newGame(V)
		for (const L of LEVELS) {
			const started = Date.now()
			const code = await chooseMove(V, s, { level: L.id, rng: seededRng(5) })
			expect(Date.now() - started).toBeLessThan(L.timeMs + 1000)
			expect(branches(V, s, code), L.id + ': ' + code).not.toBeNull()
		}
	}, 20000)

	it('takes a free queen', async () => {
		const s = pos([{ A1a1: '0:r', D1d1: '0:k', D4d4: '1:k', A4a1: '1:q' }])
		expect(await chooseMove(V, s, { level: 'normal', rng: seededRng(1) })).toBe('A1a1-A4a1')
	})
})

describe('4D chess: quantum', () => {
	const kings = { D1d1: '0:k', D4d4: '1:k' }

	it('links a slide across boards to the ghost that blocks it (HQ1, HQ1b)', () => {
		const s = pos([{ A1a1: '0:r', ...kings, A2a1: '1:n' }, { A1a1: '0:r', ...kings, C3c3: '1:n' }])
		expect(outs(s, 'A1a1-A4a1')).toEqual([['move', 100, false]])
		const after = play(V, s, 'A1a1-A4a1')
		expect(where(after, 0, 'r')).toEqual({ A1a1: 50, A4a1: 50 })
		expect(linked(after, [0, 'r'], [1, 'n'], 'A1a1', 'A2a1')).toBe(true)
		expect([budget(after, 0), budget(after, 1)]).toEqual([2, 2])
		const t = pos([{ A1a1: '0:r', ...kings, C1c3: '1:n' }, { A1a1: '0:r', ...kings, A4a4: '1:n' }])
		expect(outs(t, 'A1a1-D1d4')).toEqual([['move', 100, false]])
		const tri = play(V, t, 'A1a1-D1d4')
		expect(where(tri, 0, 'r')).toEqual({ A1a1: 50, D1d4: 50 })
		expect(linked(tri, [0, 'r'], [1, 'n'], 'A1a1', 'C1c3')).toBe(true)
		expect([budget(tri, 0), budget(tri, 1)]).toEqual([2, 2])
	})

	it('probes with a pawn push: Moved or Missed (HQ2)', () => {
		const s = pos([
			{ B2b2: '0:p', ...kings, B2b3: '1:n' },
			{ B2b2: '0:p', ...kings, B3b2: '1:n' },
		])
		const moved = play(V, s, 'B2b2-B2b3', 1)
		expect(where(moved, 0, 'p')).toEqual({ B2b3: 100 })
		expect(where(moved, 1, 'n')).toEqual({ B3b2: 100 })
		const missed = play(V, s, 'B2b2-B2b3', 0)
		expect(where(missed, 0, 'p')).toEqual({ B2b2: 100 })
		expect(where(missed, 1, 'n')).toEqual({ B2b3: 100 })
		expect(outs(s, 'B2b2-B3b2')).toEqual([['miss', 50, true], ['move', 50, true]])
		expect(where(play(V, s, 'B2b2-B3b2', 1), 1, 'n')).toEqual({ B2b3: 100 })
	})

	it('splits across boards, and a split needs a world where both paths are clear (HQ3)', () => {
		let s = newGame(V)
		expect(outs(s, 'D1c1-B1c2|B2c1')).toEqual([['split', 100, false]])
		s = play(V, s, 'D1c1-B1c2|B2c1')
		expect(where(s, 0, 'n')).toEqual({ A1c1: 100, B1c2: 50, B2c1: 50 })
		expect(budget(s, 0)).toBe(2)
		expect(outs(s, 'A3b3-A3b2')).toEqual([['move', 100, false]])
		s = play(V, s, 'A3b3-A3b2')
		expect(branches(V, s, 'B1d1-B1a4|B4a1')).toBeNull()
		expect(outs(s, 'B1d1-B1a4|B1d4')).toEqual([['split', 100, false]])
		s = play(V, s, 'B1d1-B1a4|B1d4')
		expect(where(s, 0, 'q')).toEqual({ B1a4: 25, B1d1: 25, B1d4: 50 })
		// the B1d1 part is linked to the knight: the queen stayed home only where the knight blocked its path
		expect(implies(s, [0, 'q'], [0, 'n'], 'B1d1', 'B1c2')).toBe(true)
		expect(implies(s, [0, 'q'], [0, 'n'], 'B1a4', 'B2c1')).toBe(true)
		expect(budget(s, 0)).toBe(4)
	})

	it('captures for certain with a converging merge along two 4D lines (HQ4)', () => {
		const base = { D1d1: '0:k', D4a4: '1:k', C2c2: '1:r' }
		const s = pos([{ ...base, A2a2: '0:q' }, { ...base, C4c4: '0:q' }])
		expect(outs(s, 'A2a2|C4c4-C2c2')).toEqual([['capture', 100, false]])
		const after = play(V, s, 'A2a2|C4c4-C2c2')
		expect(where(after, 0, 'q')).toEqual({ C2c2: 100 })
		expect(where(after, 1, 'r')).toEqual({ off: 100 })
		const g = ghosts(base, [['0:q', ['A2a2', 'C4c4']], ['1:n', ['B2b2', 'D1a1']]])
		expect(outs(g, 'A2a2|C4c4-C2c2')).toEqual([['miss', 25, true], ['capture', 75, true]])
		const caught = play(V, g, 'A2a2|C4c4-C2c2', 1)
		expect(where(caught, 1, 'n').D1a1).toBeCloseTo(66.67, 1)
		expect(where(caught, 1, 'n').B2b2).toBeCloseTo(33.33, 1)
		const missed = play(V, g, 'A2a2|C4c4-C2c2', 0)
		expect(where(missed, 0, 'q')).toEqual({ A2a2: 100 })
		expect(where(missed, 1, 'n')).toEqual({ B2b2: 100 })
	})

	it('links a merge onto an empty cell past a ghost instead of rolling (HQ4b)', () => {
		const g = ghosts({ D1d1: '0:k', D4a4: '1:k' }, [['0:q', ['A2a2', 'C4c4']], ['1:n', ['B2b2', 'D1a1']]])
		expect(outs(g, 'A2a2|C4c4-C2c2')).toEqual([['move', 100, false]])
		const after = play(V, g, 'A2a2|C4c4-C2c2')
		expect(where(after, 0, 'q')).toEqual({ A2a2: 25, C2c2: 75 })
		expect(after.worlds).toHaveLength(3)
		expect(implies(after, [0, 'q'], [1, 'n'], 'A2a2', 'B2b2')).toBe(true)
		expect([budget(after, 0), budget(after, 1)]).toEqual([2, 2])
	})

	it('promotes only where the pawn arrives, with the same roll for every promotion piece (HQ5)', () => {
		const s = pos([{ B4b3: '0:p', ...kings, B4b4: '1:n' }, { B4b3: '0:p', ...kings, D2d2: '1:n' }])
		expect(outs(s, 'B4b3-B4b4=n')).toEqual([['miss', 50, true], ['move', 50, true]])
		expect(outs(s, 'B4b3-B4b4=q')).toEqual(outs(s, 'B4b3-B4b4=n'))
		for (const r of [0.1, 0.49, 0.51, 0.9]) {
			expect(applyMove(V, s, 'B4b3-B4b4=q', r).branch.key).toBe(applyMove(V, s, 'B4b3-B4b4=n', r).branch.key)
		}
		const moved = play(V, s, 'B4b3-B4b4=n', 1)
		expect(where(moved, 0, 'n')).toEqual({ B4b4: 100 })
		expect(where(moved, 0, 'p')).toEqual({})
		expect(where(moved, 1, 'n')).toEqual({ D2d2: 100 })
		const missed = play(V, s, 'B4b3-B4b4=n', 0)
		expect(where(missed, 0, 'p')).toEqual({ B4b3: 100 })
		expect(where(missed, 1, 'n')).toEqual({ B4b4: 100 })
		// HQ5b: a promoted piece can split
		let t = pos([{ B4b3: '0:p', ...kings }])
		expect(outs(t, 'B4b3-B4b4=q')).toEqual([['move', 100, false]])
		t = play(V, play(V, t, 'B4b3-B4b4=q'), 'D4d4-D3d4')
		expect(outs(t, 'B4b4-A4a4|B4a4')).toEqual([['split', 100, false]])
		expect(where(play(V, t, 'B4b4-A4a4|B4a4'), 0, 'q')).toEqual({ A4a4: 50, B4a4: 50 })
	})

	it('rolls a solid king step onto a ghost, and a rook triagonal onto a ghost (HQ6, HQ6b)', () => {
		const base = { B2b2: '0:k', A1a1: '0:n', D4d4: '1:k' }
		const s = pos([{ ...base, C3c2: '1:b' }, { ...base, D4a4: '1:b' }])
		expect(outs(s, 'B2b2-C3c2')).toEqual([['move', 50, true], ['capture', 50, true]])
		const moved = play(V, s, 'B2b2-C3c2', 0)
		expect(where(moved, 0, 'k')).toEqual({ C3c2: 100 })
		expect(where(moved, 1, 'b')).toEqual({ D4a4: 100 })
		const caught = play(V, s, 'B2b2-C3c2', 1)
		expect(caught.result).toBeNull()
		expect(where(caught, 1, 'b')).toEqual({ off: 100 })
		const rook = pos([
			{ B2b2: '0:r', ...kings, C3c2: '1:b' },
			{ B2b2: '0:r', ...kings, D4a4: '1:b' },
		])
		expect(outs(rook, 'B2b2-C3c2')).toEqual([['move', 50, true], ['capture', 50, true]])
		const bishop = pos([
			{ B2b2: '0:b', ...kings, C3c2: '1:b' },
			{ B2b2: '0:b', ...kings, D4a4: '1:b' },
		])
		expect(branches(V, bishop, 'B2b2-C3c2')).toBeNull()
		const own = pos([{ B2b2: '0:k', D4d4: '1:k', C3c2: '0:n' }, { B2b2: '0:k', D4d4: '1:k', A1a1: '0:n' }])
		expect(outs(own, 'B2b2-C3c2')).toEqual([['miss', 50, true], ['move', 50, true]])
		const blocked = play(V, own, 'B2b2-C3c2', 0)
		expect([where(blocked, 0, 'k'), where(blocked, 0, 'n')]).toEqual([{ B2b2: 100 }, { C3c2: 100 }])
		const stepped = play(V, own, 'B2b2-C3c2', 1)
		expect([where(stepped, 0, 'k'), where(stepped, 0, 'n')]).toEqual([{ C3c2: 100 }, { A1a1: 100 }])
	})

	it('lets a ghost capture the king: a roll decides the game (HQ7)', () => {
		const s = pos([
			{ B1b1: '0:k', D4d4: '1:k', D1d4: '0:r' },
			{ B1b1: '0:k', D4d4: '1:k', A1a1: '0:r' },
		])
		expect(royalDanger(V, s, 1)).toBe(0.5)
		expect(outs(s, 'D1d4-D4d4')).toEqual([['miss', 50, true], ['capture', 50, true]])
		expect(play(V, s, 'D1d4-D4d4', 1).result).toEqual({ winner: 0, reason: 'king' })
		const missed = play(V, s, 'D1d4-D4d4', 0)
		expect(missed.result).toBeNull()
		expect(missed.turn).toBe(1)
		expect(where(missed, 0, 'r')).toEqual({ A1a1: 100 })
		expect(outcomes(V, missed, 'A1a1-D4d4')).toBeNull()
	})

	it('joins a part to another part of the same piece without a roll (HQ8)', () => {
		let s = play(V, play(V, newGame(V), 'B1d1-B2d1|B4d1'), 'A3b3-A3b2')
		expect(outs(s, 'B2d1-B4d1')).toEqual([['move', 100, false]])
		s = play(V, s, 'B2d1-B4d1')
		expect(where(s, 0, 'q')).toEqual({ B4d1: 100 })
		expect(s.worlds).toHaveLength(1)
		expect(budget(s, 0)).toBe(1)
		const k = { D1a1: '0:k', D4d4: '1:k' }
		const three = pos([[{ ...k, B2d1: '0:q' }, 1], [{ ...k, B4d1: '0:q' }, 1], [{ ...k, A1a1: '0:q' }, 2]])
		expect(outs(three, 'B2d1-B4d1')).toEqual([['move', 100, false]])
		const joined = play(V, three, 'B2d1-B4d1')
		expect(where(joined, 0, 'q')).toEqual({ A1a1: 50, B4d1: 50 })
		expect(budget(joined, 0)).toBe(2)
		// HQ8c: another piece might be on the target, so the move is rolled
		const other = pos([{ ...k, B2d1: '0:q', A4a4: '1:n' }, { ...k, A1a1: '0:q', B4d1: '1:n' }])
		expect(outs(other, 'B2d1-B4d1')).toEqual([['miss', 50, true], ['move', 50, true]])
	})

	it('draws with bare kings only in the Captured result of a rolled capture (HQ9)', () => {
		const s = pos([{ B2b2: '0:k', D4d4: '1:k', C2b2: '1:n' }, { B2b2: '0:k', D4d4: '1:k', A4a4: '1:n' }])
		const list = branches(V, s, 'B2b2-C2b2')
		expect(list.map((b) => [b.key, b.weight / T, b.notes])).toEqual([
			['move', 0.5, []],
			['capture', 0.5, []],
		])
		const moved = play(V, s, 'B2b2-C2b2', 0)
		expect(moved.result).toBeNull()
		expect(where(moved, 1, 'n')).toEqual({ A4a4: 100 })
		expect(play(V, s, 'B2b2-C2b2', 1).result).toEqual({ winner: null, reason: 'bareKings' })
		const touch = pos([{ B2b2: '0:k', C3c3: '1:k', C2b2: '1:n' }, { B2b2: '0:k', C3c3: '1:k', A4a4: '1:n' }])
		expect(play(V, touch, 'B2b2-C2b2', 1).result).toBeNull()
	})

	it('rolls a 4-axis capture of the king past a ghost, and links the same line to an empty cell (HQ10)', () => {
		const s = pos([{ A1a1: '0:q', ...kings, B2b2: '1:n' }, { A1a1: '0:q', ...kings, A4a4: '1:n' }])
		expect(royalDanger(V, s, 1)).toBe(0.5)
		expect(outs(s, 'A1a1-D4d4')).toEqual([['miss', 50, true], ['capture', 50, true]])
		expect(play(V, s, 'A1a1-D4d4', 1).result).toEqual({ winner: 0, reason: 'king' })
		const missed = play(V, s, 'A1a1-D4d4', 0)
		expect([where(missed, 0, 'q'), where(missed, 1, 'n')]).toEqual([{ A1a1: 100 }, { B2b2: 100 }])
		expect(outs(s, 'A1a1-C3c3')).toEqual([['move', 100, false]])
		const linkedState = play(V, s, 'A1a1-C3c3')
		expect(where(linkedState, 0, 'q')).toEqual({ A1a1: 50, C3c3: 50 })
		expect(linked(linkedState, [0, 'q'], [1, 'n'], 'A1a1', 'B2b2')).toBe(true)
		expect([budget(linkedState, 0), budget(linkedState, 1)]).toEqual([2, 2])
	})

	it('rolls a pawn capture along the board axes onto a ghost, for both sides (HQ11)', () => {
		const s = pos([{ B2b2: '0:p', ...kings, C3b2: '1:n' }, { B2b2: '0:p', ...kings, A4a4: '1:n' }])
		expect(outs(s, 'B2b2-C3b2')).toEqual([['miss', 50, true], ['capture', 50, true]])
		expect(where(play(V, s, 'B2b2-C3b2', 0), 0, 'p')).toEqual({ B2b2: 100 })
		const caught = play(V, s, 'B2b2-C3b2', 1)
		expect([where(caught, 0, 'p'), where(caught, 1, 'n')]).toEqual([{ C3b2: 100 }, { off: 100 }])
		const b = pos([{ B3b3: '1:p', ...kings, C2b3: '0:n' }, { B3b3: '1:p', ...kings, A1a1: '0:n' }], 1)
		expect(outs(b, 'B3b3-C2b3')).toEqual([['miss', 50, true], ['capture', 50, true]])
	})

	it('counts a converging capture of the king in the danger ring and in the waiting draws (HQ12)', () => {
		const base = { A4d4: '0:k', C2c2: '1:k' }
		const s = pos([{ ...base, A2a2: '0:q' }, { ...base, C4c4: '0:q' }])
		expect(outs(s, 'A2a2|C4c4-C2c2')).toEqual([['capture', 100, false]])
		expect(play(V, s, 'A2a2|C4c4-C2c2').result).toEqual({ winner: 0, reason: 'king' })
		expect(outs(s, 'A2a2-C2c2')).toEqual([['miss', 50, true], ['capture', 50, true]])
		expect(royalDanger(V, s, 1)).toBe(1)
		expect(royalDanger(V, { ...s, turn: 1 }, 1)).toBe(1)
		// the 50-move draw waits while the merge takes the king for certain (drawsWait), and comes when only one part
		// of the queen is on a line to the king
		const k = { D4d4: '0:k', C2c2: '1:k', A4a4: '1:n' }
		const quiet = { ...pos([{ ...k, A2a2: '0:q' }, { ...k, C4c4: '0:q' }], 1), quiet: 99 }
		const waiting = play(V, quiet, 'A4a4-A3a2')
		expect([waiting.result, waiting.quiet]).toEqual([null, 100])
		expect(play(V, waiting, 'A2a2|C4c4-C2c2').result).toEqual({ winner: 0, reason: 'king' })
		const half = { ...pos([{ ...k, A2a2: '0:q' }, { ...k, A1a1: '0:q' }], 1), quiet: 99 }
		expect(play(V, half, 'A4a4-A3a2').result).toEqual({ winner: null, reason: 'quiet' })
	})

	it('rolls a board-crossing link when the budget is full (HQ14)', () => {
		const base = { A1a1: '0:r', ...kings }
		const knight = ['1:n', ['A2a1', 'C3c3']]
		const four = ghosts(base, [knight, ['0:n', ['B1b1', 'B1c2']], ['0:b', ['C1c1', 'D2d2']]])
		expect(four.worlds).toHaveLength(8)
		expect([budget(four, 0), budget(four, 1)]).toEqual([4, 2])
		expect(outs(four, 'A1a1-A4a1')).toEqual([['move', 100, false]])
		const linkedState = play(V, four, 'A1a1-A4a1')
		expect(where(linkedState, 0, 'r')).toEqual({ A1a1: 50, A4a1: 50 })
		expect([budget(linkedState, 0), budget(linkedState, 1)]).toEqual([8, 2])
		expect(linkedState.worlds).toHaveLength(8)
		const queen = ['0:q', ['B2b2', 'C2c3']]
		const full = ghosts(base, [knight, ['0:n', ['B1b1', 'B1c2']], ['0:b', ['C1c1', 'D2d2']], queen])
		expect(budgetInfo(V, full, 0)).toMatchObject({ used: 8, limit: 8 })
		const list = branches(V, full, 'A1a1-A4a1')
		expect(list.map((b) => [b.key, b.weight / T, b.rolled, b.notes])).toEqual([
			['miss', 0.5, true, []],
			['move', 0.5, true, []],
		])
		const missed = play(V, full, 'A1a1-A4a1', 0)
		expect([where(missed, 0, 'r'), where(missed, 1, 'n')]).toEqual([{ A1a1: 100 }, { A2a1: 100 }])
		const moved = play(V, full, 'A1a1-A4a1', 1)
		expect([where(moved, 0, 'r'), where(moved, 1, 'n')]).toEqual([{ A4a1: 100 }, { C3c3: 100 }])
		expect([budget(moved, 0), budget(moved, 1)]).toEqual([8, 1])
		expect(splitTargets(V, full, S('A1a1')).length).toBeGreaterThan(0)
		expect(splitsFrom(V, full, S('A1a1'))).toEqual([])
	})

	it('never needs a solid or game-end roll in random games with splits of both sides (HQ13)', () => {
		let worldsSeen = 0
		for (const seed of [11, 12]) {
			const rng = seededRng(seed)
			let s = newGame(V)
			for (let ply = 0; ply < 100 && !s.result; ply++) {
				let codes = legalMoves(V, s).map((m) => m.code)
				const { used, limit } = budgetInfo(V, s, s.turn)
				if ((ply % 4 === 1 || ply % 4 === 2) && used < limit) {
					const froms = new Set()
					for (const { b } of s.worlds) {
						for (let id = 0; id < b.sq.length; id++) {
							if (b.sd[id] === s.turn && b.sq[id] >= 0 && V.types[b.ty[id]].splittable) {
								froms.add(b.sq[id])
							}
						}
					}
					const list = [...froms]
					const f = list[Math.floor(rng() * list.length)]
					const splits = f === undefined ? [] : splitsFrom(V, s, f).map((m) => m.code)
					if (splits.length) {
						codes = splits
					}
				}
				const code = codes[Math.floor(rng() * codes.length)]
				const res = applyMove(V, s, code, rng)
				expect(res, code).not.toBeNull()
				res.outcomes.forEach((o) => expect(o.notes, code).toEqual([]))
				s = res.state
				const mover = 1 - s.turn
				const first = JSON.stringify(worldResult(V, s.worlds[0].b, mover))
				s.worlds.forEach(({ b }) => expect(JSON.stringify(worldResult(V, b, mover))).toBe(first))
				for (const side of [0, 1]) {
					expect(budget(s, side)).toBeLessThanOrEqual(8)
				}
				worldsSeen = Math.max(worldsSeen, s.worlds.length)
			}
		}
		expect(worldsSeen).toBeGreaterThan(8)
	}, 60000)
})
