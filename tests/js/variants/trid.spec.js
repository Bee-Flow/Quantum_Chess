/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Tri-Dimensional chess (src/variants/trid.js): the board and its drawing, the start position, projected movement
 * with blocking on every level, pawns, castling and en passant, the end of the game, the moves of the attack boards
 * (Meder art. 3.6: the pins, ownership, the one-piece limit, carrying a piece, the squares that move with a board,
 * promotion by a board move), the quantum cases (T1-T13, TQ1-TQ14 and F1 name the cases of the rules this file was
 * first written from) and the attack boards in superposition.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { chooseMove, LEVELS } from '../../../src/variants/core/ai.js'
import {
	applyMove,
	branches,
	budget,
	budgetInfo,
	legalMoves,
	mergesFrom,
	newGame,
	outcomes,
	pieceLocations,
	royalDanger,
	splitsFrom,
	T,
} from '../../../src/variants/core/quantum.js'
import { applyClassical, generate } from '../../../src/variants/core/world.js'
import V, { extras, lastRank, startRights } from '../../../src/variants/trid.js'
import { COL_OF, columns, PIN_OF, PIN_SQUARES, START_BOARDS, TAB_OF } from '../../../src/variants/trid/board.js'
import { ADJACENT, direction, PIN, PINS } from '../../../src/variants/trid/geometry.js'
import { play, stateOf, stopwatch, workClock } from './helpers.js'

const topo = V.topology

/**
 * The square with this name.
 *
 * @param {string} name square name
 * @return {number}
 */
function S(name) {
	const s = topo.byName(name)
	expect(s, name).toBeGreaterThanOrEqual(0)
	return s
}

/**
 * A state from placements, as in the spec's test section: both kings added on d0KL1 and d9KL6 (unless `kings` is
 * false), every pawn has moved unless its square is listed in `unmoved`, both sides have had their first move, and
 * castling rights only as given.
 *
 * @param {Array<object|[object, number]>} worlds placements, or placements with relative weights
 * @param {object} [opts] options
 * @param {number} [opts.turn] side to move
 * @param {string[]} [opts.unmoved] squares of the pawns that have not moved
 * @param {string[]} [opts.rights] castling flags (K, Q, k, q)
 * @param {boolean} [opts.kings] add the kings
 * @param {string[]} [opts.boards] the pins of the attack boards (default: the start pins)
 * @return {object}
 */
function pos(worlds, { turn = 0, unmoved = [], rights = [], kings = true, boards = START_BOARDS } = {}) {
	const list = worlds.map((w) => (Array.isArray(w) ? w : [w, 1]))
		.map(([pl, rel]) => [kings ? { d0KL1: '0:k', d9KL6: '1:k', ...pl } : pl, rel])
	return stateOf(V, list, turn, (b) => {
		const moved = []
		b.ty.forEach((ty, id) => {
			if (ty === 'p' && !unmoved.includes(topo.names[b.sq[id]])) {
				moved.push(id)
			}
		})
		b.x = extras({ castle: startRights().filter((c) => rights.includes(c.flag)), moved, boards })
	})
}

/**
 * The legal move codes of the state (no splits).
 *
 * @param {object} s state
 * @return {string[]}
 */
function codes(s) {
	return legalMoves(V, s).map((m) => m.code)
}

/**
 * The legal ordinary move codes starting on a square, sorted.
 *
 * @param {object} s state
 * @param {string} from square name
 * @return {string[]}
 */
function movesFrom(s, from) {
	return codes(s).filter((c) => c.startsWith(from + '-') && !c.includes('|')).sort()
}

/**
 * The classical keys of one world for a side, optionally only those from one square, sorted.
 *
 * @param {object} w world
 * @param {number} side side
 * @param {string} [from] square name
 * @return {string[]}
 */
function classical(w, side, from) {
	return [...generate(V, w, side).values()]
		.filter((m) => from === undefined || topo.names[m.from] === from)
		.map((m) => m.key)
		.sort()
}

/**
 * The target squares of the classical moves from a square, as names with the key's own suffix removed, sorted.
 *
 * @param {object} s state
 * @param {string} from square name
 * @return {string[]}
 */
function targets(s, from) {
	return movesFrom(s, from).map((c) => c.split('-')[1]).sort()
}

/**
 * The outcomes of a move as sorted `[key, p, rolled]` triples, or null when illegal.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {Array|null}
 */
function outs(s, code) {
	const o = outcomes(V, s, code)
	return o ? o.map((x) => [x.key, x.p, x.rolled]).sort() : null
}

/**
 * Play a move and take the outcome with this key.
 *
 * @param {object} s state
 * @param {string} code move code
 * @param {string} key outcome key (move, miss, capture, split, a square name)
 * @return {object}
 */
function playKey(s, code, key) {
	const list = branches(V, s, code)
	expect(list, 'legal: ' + code).not.toBeNull()
	const i = list.findIndex((b) => b.key === key)
	expect(i, code + ' has outcome ' + key).toBeGreaterThanOrEqual(0)
	return play(V, s, code, i)
}

/**
 * Where the piece standing on a square (in some world) is, as `name: p` pairs.
 *
 * @param {object} s state
 * @param {string} name square name
 * @return {Record<string, number>}
 */
function where(s, name) {
	const id = s.worlds.map(({ b }) => b.board[S(name)]).find((i) => i >= 0)
	const out = {}
	for (const l of pieceLocations(s, id)) {
		out[l.sq >= 0 ? topo.names[l.sq] : String(l.sq)] = l.p
	}
	return out
}

/**
 * The piece on a square in every world, as `side:type` or `.`.
 *
 * @param {object} s state
 * @param {string} name square name
 * @return {string[]}
 */
function at(s, name) {
	return s.worlds.map(({ b }) => {
		const id = b.board[S(name)]
		return id < 0 ? '.' : b.sd[id] + ':' + b.ty[id]
	})
}

/**
 * Count the leaves of the classical move tree (no check rule).
 *
 * @param {object} w world
 * @param {number} side side to move
 * @param {number} depth plies
 * @return {number}
 */
function perft(w, side, depth) {
	if (depth === 0) {
		return 1
	}
	let n = 0
	for (const m of generate(V, w, side).values()) {
		n += depth === 1 ? 1 : perft(applyClassical(V, w, m), 1 - side, depth - 1)
	}
	return n
}

/**
 * Split a list written as words.
 *
 * @param {string} text words separated by single spaces
 * @return {string[]}
 */
function words(text) {
	return text.split(' ')
}

const PROMOS = (code) => ['b', 'n', 'q', 'r'].map((p) => code + '=' + p)

/**
 * The legal board moves of the state, sorted.
 *
 * @param {object} s state
 * @return {string[]}
 */
function boardCodes(s) {
	return codes(s).filter((c) => c.includes('>')).sort()
}

/**
 * The pins of the attack boards in every world, joined per world.
 *
 * @param {object} s state
 * @return {string[]}
 */
function pinsOf(s) {
	return [...new Set(s.worlds.map(({ b }) => b.x.boards.join()))]
}

/** From the start, the moves that leave White's QL1 board with only its z pawn (the queen, rook and a pawn leave). */
const FREE_QL1 = words('a2W-a4W a8B-b6N a1W-b3W b6N-a8B a1QL1-a2W a8B-b6N a0QL1-a1W b6N-a8B a2W-a3W a8B-b6N '
	+ 'a1W-a2W b6N-a8B z0QL1-a0QL1 a8B-b6N a0QL1-a1W b6N-a8B')

/** White's queen's board on QL3, White's king's board on KL1, Black's on QL6 and KL6. */
const QL3 = ['QL3', 'KL1', 'QL6', 'KL6']

describe('Tri-D chess: board and start position', () => {
	it('has 64 squares at the start, 20 two-level map squares and 16 void map squares (T1)', () => {
		// every square of the main levels and of the twelve pins, and a tab per pin
		expect(topo.size).toBe(48 + 12 * 4 + 12)
		const COLS = columns(START_BOARDS)
		expect(COLS.flat()).toHaveLength(64)
		const count = (n) => COLS.map((c, i) => [c, i]).filter(([c]) => c.length === n)
			.map(([, i]) => 'zabcde'[i % 6] + Math.floor(i / 6)).sort()
		expect(count(2)).toEqual(words('a1 a3 a4 a5 a6 a8 b3 b4 b5 b6 c3 c4 c5 c6 d1 d3 d4 d5 d6 d8'))
		expect(count(0)).toEqual(words('b0 b9 c0 c9 e2 e3 e4 e5 e6 e7 z2 z3 z4 z5 z6 z7'))
		expect(count(1)).toHaveLength(24)
		expect(COLS[1 + 6].map((s) => topo.names[s])).toEqual(['a1W', 'a1QL1'])
		expect(COLS[6].map((s) => topo.names[s])).toEqual(['z1QL1'])
		expect(topo.byName('b0QL1')).toBe(-1)
		// the squares of a column are in height order, the attack boards above their main level
		expect(columns(['QL2', 'KL1', 'QL5', 'KL6'])[1 + 6 * 4].map((s) => topo.names[s]))
			.toEqual(['a4W', 'a4QL2', 'a4N', 'a4QL5'])
		expect(topo.names.slice(-12)).toEqual(PINS)
	})

	it('sets up every piece on its start square, with White to move and no castling yet (T2)', () => {
		const s = newGame(V)
		const w = s.worlds[0].b
		const placed = {}
		w.sq.forEach((sq, id) => {
			placed[topo.names[sq]] = w.sd[id] + ':' + w.ty[id]
		})
		expect(placed).toEqual({
			z0QL1: '0:r',
			a0QL1: '0:q',
			d0KL1: '0:k',
			e0KL1: '0:r',
			a1W: '0:n',
			b1W: '0:b',
			c1W: '0:b',
			d1W: '0:n',
			z1QL1: '0:p',
			a1QL1: '0:p',
			d1KL1: '0:p',
			e1KL1: '0:p',
			a2W: '0:p',
			b2W: '0:p',
			c2W: '0:p',
			d2W: '0:p',
			z9QL6: '1:r',
			a9QL6: '1:q',
			d9KL6: '1:k',
			e9KL6: '1:r',
			a8B: '1:n',
			b8B: '1:b',
			c8B: '1:b',
			d8B: '1:n',
			z8QL6: '1:p',
			a8QL6: '1:p',
			d8KL6: '1:p',
			e8KL6: '1:p',
			a7B: '1:p',
			b7B: '1:p',
			c7B: '1:p',
			d7B: '1:p',
		})
		expect(w.x).toEqual(extras({ castle: startRights(), started: [false, false] }))
		expect(w.x.boards).toEqual(['QL1', 'KL1', 'QL6', 'KL6'])
		const pawnMoves = ['a', 'b', 'c', 'd'].flatMap((f) => ['3W', '3N', '4W', '4N'].map((t) => f + '2W-' + f + t))
		expect(codes(s).sort()).toEqual(['a1W-b3N', 'a1W-b3W', 'd1W-c3N', 'd1W-c3W', ...pawnMoves].sort())
		expect(classical(w, 1)).toHaveLength(20)
		expect(classical(w, 1)).not.toContain('O-O')
		expect(perft(w, 0, 2)).toBe(400)
		expect(perft(w, 0, 3)).toBe(9128)
	})

	it('draws the three levels and every pin, and nothing overlaps', () => {
		const L = V.layoutOf(newGame(V))
		const { layout } = L
		expect(L.size).toBe(topo.size)
		// W, N, B and the four attack boards; the six empty slots are dashed (QL2 and QL5 share one, KL2 and KL5 too)
		expect(layout.boards).toHaveLength(7)
		expect(layout.outlines.filter((o) => o.kind === 'next')).toHaveLength(6 * 4)
		// small enough to show whole on a phone (about 28 px per square at 390 px): no zoom buttons
		expect(layout.zoomable).toBeUndefined()
		expect(layout.width * layout.height).toBeLessThanOrEqual(200)
		const texts = layout.labels.map((l) => l.text)
		for (const caption of ['W', 'N', 'B', ...PINS]) {
			expect(texts.filter((x) => x === caption)).toHaveLength(1)
		}
		for (let r = 0; r <= 9; r++) {
			expect(texts).toContain(String(r))
		}
		// the 64 squares that exist and the twelve tabs
		expect(L.cells).toHaveLength(64 + 12)
		// the tabs: wooden where a board stands, pale where the pin is free
		const tabs = L.cells.filter((c) => c.shade === 'wood' || c.shade === 'camp')
		expect(tabs.map((c) => topo.names[c.sq])).toEqual(PINS)
		expect(tabs.filter((c) => c.shade === 'wood').map((c) => topo.names[c.sq])).toEqual(START_BOARDS)
		// each pin name stands in the top of its tab, so the dot that marks a free pin as a target (in the middle of
		// the tab, a sixth of a square across) leaves the name readable
		for (const tab of tabs) {
			const name = layout.labels.find((l) => l.text === topo.names[tab.sq])
			expect(name.y - tab.y, topo.names[tab.sq]).toBeLessThanOrEqual(0.2)
		}
		for (const a of L.cells) {
			expect(a.x).toBeGreaterThanOrEqual(0)
			expect(a.x + a.w).toBeLessThanOrEqual(layout.width)
			expect(a.y + a.h).toBeLessThanOrEqual(layout.height)
			for (const b of L.cells) {
				if (a.sq < b.sq) {
					expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true)
				}
			}
		}
		// a map square has the same colour on every level
		const cell = (n) => L.cells.find((c) => c.sq === S(n))
		expect(cell('a1W').shade).toBe('dark')
		expect(cell('a1QL1').shade).toBe('dark')
		expect(cell('b3N').shade).toBe(cell('b3W').shade)
		// W and B share their files, and so do the attack boards: a file runs straight up the column
		for (const f of 'abcd') {
			expect(new Set([`${f}1W`, `${f}4W`, `${f}5B`, `${f}8B`].map((n) => cell(n).x)).size).toBe(1)
		}
		expect([cell('a1QL1').x, cell('d1KL1').x, cell('a8QL6').x, cell('d8KL6').x])
			.toEqual([cell('a1W').x, cell('d1W').x, cell('a8B').x, cell('d8B').x])
		// each attack board abuts the corner it is pinned to, one row further out
		expect(cell('a1QL1').y - (cell('a1W').y + 1)).toBeCloseTo(0.2, 9)
		expect(cell('d8B').y - (cell('d8KL6').y + 1)).toBeCloseTo(0.2, 9)
		// N stands beside W and B, its ranks 4 and 5 level with the band between them
		expect(cell('a3N').x).toBeGreaterThan(cell('d3W').x + 2)
		expect(cell('a4N').y).toBeGreaterThan(cell('a5B').y)
		expect(cell('a5N').y).toBeLessThan(cell('a4W').y)
		// every rank of every board is numbered on its row, and only the pin names sit on a cell (their tabs)
		for (const c of L.cells) {
			const [, rank, h] = topo.coords[c.sq]
			if (c.shade !== 'wood' && c.shade !== 'camp') {
				expect(layout.labels.some((l) => l.text === String(rank) && Math.abs(l.y - (c.y + 0.5)) < 1e-9), h)
					.toBe(true)
			}
		}
		for (const l of layout.labels) {
			const on = L.cells.filter((c) => l.x > c.x && l.x < c.x + c.w && l.y > c.y && l.y < c.y + c.h)
			expect(on.map((c) => topo.names[c.sq])).toEqual(PINS.includes(l.text) ? [l.text] : [])
		}
		// the tabs say whether a board stands on their pin
		expect(L.names[S('QL1')]).toBe('Attack board on QL1')
		expect(L.names[S('QL3')]).toBe('Free pin QL3')
		expect(L.names[S('a1W')]).toBe('a1W')
	})

	it('draws each attack board at its pin, with its squares, and opens a second inner band when both need it', () => {
		const at = (boards) => {
			const L = V.layoutOf(pos([{}], { boards }))
			return { L, cell: (n) => L.cells.find((c) => c.sq === S(n)) }
		}
		const { L, cell } = at(['QL3', 'KL2', 'QL5', 'KL6'])
		// the squares of the empty pins are not drawn, those of the boards are, beside the corners they hang over
		expect(cell('a1QL1')).toBeUndefined()
		expect(cell('z0QL1')).toBeUndefined()
		for (const n of ['z2QL3', 'a3QL3', 'd4KL2', 'e5KL2', 'z4QL5', 'a5QL5']) {
			expect(cell(n), n).toBeDefined()
		}
		expect(L.cells).toHaveLength(64 + 12)
		// a board keeps its files, and its ranks run beside the corner: the inner band below B, above W
		expect(cell('a3QL3').x).toBe(cell('a3N').x)
		expect(cell('a3QL3').y - (cell('a3N').y + 1)).toBeCloseTo(0.2, 9)
		expect(cell('a5QL5').x).toBe(cell('a5B').x)
		expect(cell('a5QL5').y - (cell('a5B').y + 1)).toBeCloseTo(0.2, 9)
		expect(cell('d4W').y - (cell('d4KL2').y + 1)).toBeCloseTo(0.2, 9)
		// N's bands are level with the ranks of B and W
		expect(cell('a2QL3').y).toBe(cell('a2W').y)
		expect(L.layout.boards).toHaveLength(7)
		expect(L.names[S('QL1')]).toBe('Free pin QL1')
		// QL2 and QL5 share a slot; with boards on both, B's pins get a band of their own above W's
		const two = at(['QL2', 'KL1', 'QL5', 'KL6'])
		expect(two.L.layout.height).toBeCloseTo(L.layout.height + 2.2, 9)
		expect(two.cell('a4QL5').y + 1 + 0.2).toBeCloseTo(two.cell('a5QL2').y, 9)
		expect(two.cell('a4W').y - (two.cell('a4QL2').y + 1)).toBeCloseTo(0.2, 9)
		for (const a of two.L.cells) {
			for (const b of two.L.cells) {
				if (a.sq < b.sq) {
					expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true)
				}
			}
		}
		// the layout is shared per set of pins
		expect(V.layoutOf(pos([{}], { boards: ['QL3', 'KL2', 'QL5', 'KL6'] }))).toBe(L)
	})
})

describe('Tri-D chess: rules card', () => {
	it('names the levels and pins, the board moves, the castling rights and the ghosts', () => {
		const card = V.rules()
		expect(card).toHaveLength(8)
		expect(card[0]).toContain('White\'s (W, lowest), Neutral (N) and Black\'s (B, highest)')
		// every board caption and square name on screen is explained
		expect(card[0]).toContain('QL1 to QL6 on the queen\'s side and KL1 to KL6 on the king\'s side')
		for (const board of ['QL1', 'KL1', 'QL6', 'KL6']) {
			expect(card[0]).toContain(board)
		}
		expect(card[1]).toContain('A square is named file, rank and board, such as b3N or z0QL1.')
		expect(card[1]).toContain('The squares of a pin exist only while a board stands on it.')
		expect(card[3]).toContain('an attack board that holds at most one piece to a free pin next to it')
		expect(card[3]).toContain('only an empty board may move backwards')
		expect(card[4]).toContain('but not after riding a board')
		expect(card[5]).toContain('A pawn that a board move takes to its last rank, or leaves on it, promotes at once')
		expect(card[3]).toContain('(QL3 reaches QL1, QL2, QL4 and QL5)')
		expect(card[6]).toContain('if neither the king nor that rook has moved in any possibility')
		expect(card[6]).toContain('once the queen\'s square is empty')
		expect(card[7]).toContain('A ghost on the other level of your target square does not matter.')
		expect(card[7]).toContain('Attack boards are never ghosts')
		// the classic end rules apply (docs/rules.md 5): the card must not deny them
		for (const line of card) {
			expect(line).not.toMatch(/checkmate|only by capturing|no bare|trapped|never move/i)
		}
		expect(V.boardLegend(newGame(V))).toEqual([{
			kind: 'pin',
			text: 'To move an attack board, tap its pin name, then the name of a free pin (dashed).',
		}])
	})
})

describe('Tri-D chess: movement', () => {
	it('blocks a rook on any level of a map square in between (T3)', () => {
		const s = pos([{ b1W: '0:r', b3N: '1:n' }])
		expect(targets(s, 'b1W')).toEqual(words('a1QL1 a1W b2W b3N b3W c1W d1KL1 d1W e1KL1 z1QL1'))
		expect(codes(s)).not.toContain('b1W-b4W')
		expect(codes(s)).not.toContain('b1W-b5N')
	})

	it('flies a rook across the void but never stops there (T4)', () => {
		let s = pos([{ z0QL1: '0:r', z8QL6: '1:p' }])
		expect(targets(s, 'z0QL1')).toEqual(['a0QL1', 'z1QL1', 'z8QL6'])
		s = pos([{ z0QL1: '0:r' }])
		expect(targets(s, 'z0QL1')).toEqual(['a0QL1', 'z1QL1', 'z8QL6', 'z9QL6'])
	})

	it('lets a queen stop on any level but never move straight up or down (T5)', () => {
		const s = pos([{ b3W: '0:q' }])
		const list = movesFrom(s, 'b3W')
		expect(list).toHaveLength(28)
		expect(list).not.toContain('b3W-b3N')
		for (const t of ['b4N', 'b8B', 'e0KL1', 'd5B']) {
			expect(list).toContain('b3W-' + t)
		}
	})

	it('moves a bishop along the map diagonals onto both levels (12 moves from c4N)', () => {
		const s = pos([{ c4N: '0:b' }])
		expect(targets(s, 'c4N')).toEqual(words('a2W a6B a6N b3N b3W b5B b5N d3N d3W d5B d5N z1QL1'))
	})

	it('lets the knight choose its level (T6)', () => {
		expect(targets(newGame(V), 'a1W')).toEqual(['b3N', 'b3W'])
		expect(targets(pos([{ a1W: '0:n' }]), 'a1W')).toEqual(['b3N', 'b3W', 'c2W'])
	})

	it('steps the king to neighbouring map squares on any level (T12)', () => {
		const s = pos([{ b4W: '0:k', d9KL6: '1:k' }], { kings: false })
		expect(targets(s, 'b4W')).toEqual(words('a3N a3W a4N a4W a5B a5N b3N b3W b5B b5N c3N c3W c4N c4W c5B c5N'))
		expect(targets(pos([{}]), 'd0KL1')).toEqual(['c1W', 'd1KL1', 'd1W', 'e0KL1', 'e1KL1'])
	})
})

describe('Tri-D chess: pawns', () => {
	it('promotes on the last rank of the file the pawn arrives on (T7, T11, T13)', () => {
		expect(movesFrom(pos([{ b7B: '0:p' }]), 'b7B')).toEqual(PROMOS('b7B-b8B'))
		expect(movesFrom(pos([{ a7B: '0:p' }]), 'a7B')).toEqual(['a7B-a8B', 'a7B-a8QL6'])
		expect(movesFrom(pos([{ a8B: '0:p' }]), 'a8B')).toEqual(PROMOS('a8B-a9QL6'))
		expect(movesFrom(pos([{ z8QL6: '0:p' }]), 'z8QL6')).toEqual(PROMOS('z8QL6-z9QL6'))
		expect(movesFrom(pos([{ d7B: '0:p', e8KL6: '1:n' }]), 'd7B')).toEqual(['d7B-d8B', 'd7B-d8KL6', 'd7B-e8KL6'])
		expect(movesFrom(pos([{ c7B: '0:p', b8B: '1:n', d8KL6: '1:n' }]), 'c7B'))
			.toEqual([...PROMOS('c7B-b8B'), ...PROMOS('c7B-c8B'), 'c7B-d8KL6'].sort())
		// Black
		expect(movesFrom(pos([{ c2W: '1:p' }], { turn: 1 }), 'c2W')).toEqual(PROMOS('c2W-c1W'))
		expect(movesFrom(pos([{ a2W: '1:p' }], { turn: 1 }), 'a2W')).toEqual(['a2W-a1QL1', 'a2W-a1W'])
		expect(movesFrom(pos([{ a1W: '1:p' }], { turn: 1 }), 'a1W')).toEqual(PROMOS('a1W-a0QL1'))
		expect(movesFrom(pos([{ a1QL1: '1:p' }], { turn: 1 }), 'a1QL1')).toEqual(PROMOS('a1QL1-a0QL1'))
		expect(movesFrom(pos([{ b2W: '1:p', a1W: '0:n', c1W: '0:n' }], { turn: 1 }), 'b2W'))
			.toEqual(['b2W-a1W', ...PROMOS('b2W-b1W'), ...PROMOS('b2W-c1W')].sort())
		// promotion happens: the pawn becomes the chosen piece
		const after = play(V, pos([{ b7B: '0:p' }]), 'b7B-b8B=n')
		expect(at(after, 'b8B')).toEqual(['0:n'])
	})

	it('double-steps only when unmoved and the skipped map square is empty on every level (T8)', () => {
		expect(movesFrom(pos([{ a2W: '0:p', a3N: '1:n' }], { unmoved: ['a2W'] }), 'a2W')).toEqual(['a2W-a3W'])
		expect(movesFrom(pos([{ a2W: '0:p' }], { unmoved: ['a2W'] }), 'a2W'))
			.toEqual(['a2W-a3N', 'a2W-a3W', 'a2W-a4N', 'a2W-a4W'])
		// the queen's pawn steps onto a2W, a start square, and may not double-step from there
		let s = newGame(V)
		s = play(V, s, 'a2W-a4W')
		s = play(V, s, 'a7B-a6B')
		s = play(V, s, 'a1QL1-a2W')
		s = play(V, s, 'a6B-a5B')
		expect(movesFrom(s, 'a2W')).toEqual(['a2W-a3N', 'a2W-a3W'])
		// the z and e pawns never double-step: their next map squares are void
		expect(movesFrom(newGame(V), 'z1QL1')).toEqual([])
		expect(movesFrom(newGame(V), 'e1KL1')).toEqual([])
	})

	it('captures en passant onto either level, only on the very next move (T9)', () => {
		const start = pos([{ c5N: '0:p', b7B: '1:p' }], { turn: 1, unmoved: ['b7B'] })
		const s = play(V, start, 'b7B-b5N')
		expect(movesFrom(s, 'c5N')).toEqual(['c5N-b6B', 'c5N-b6N', 'c5N-c6B', 'c5N-c6N'])
		for (const code of ['c5N-b6N', 'c5N-b6B']) {
			expect(outs(s, code)).toEqual([['capture', 1, false]])
			const after = play(V, s, code)
			expect(at(after, 'b5N')).toEqual(['.'])
			expect(at(after, code.slice(4))).toEqual(['0:p'])
		}
		const later = play(V, play(V, s, 'd0KL1-c1W'), 'd9KL6-c8B')
		expect(movesFrom(later, 'c5N')).toEqual(['c5N-c6B', 'c5N-c6N'])
	})

	it('lets Black capture en passant onto either level too, but never a pawn that promoted on its double step', () => {
		const s = play(V, pos([{ c2W: '0:p', b4N: '1:p' }], { unmoved: ['c2W'] }), 'c2W-c4W')
		expect(movesFrom(s, 'b4N')).toEqual(['b4N-b3N', 'b4N-b3W', 'b4N-c3N', 'b4N-c3W'])
		for (const code of ['b4N-c3W', 'b4N-c3N']) {
			expect(outs(s, code)).toEqual([['capture', 1, false]])
			const after = play(V, s, code)
			expect(at(after, 'c4W')).toEqual(['.'])
			expect(at(after, code.slice(4))).toEqual(['1:p'])
		}
		// the edge pawns leave their file only by capturing inwards
		expect(movesFrom(pos([{ z1QL1: '0:p', a2W: '1:n' }]), 'z1QL1')).toEqual(['z1QL1-a2W'])
		// an unmoved pawn on a7B double-steps onto a9QL6 and promotes there: the new queen is no en passant victim
		const board = { d0KL1: '0:k', d5N: '1:k', a7B: '0:p', z9QL6: '1:p' }
		const q = play(V, pos([board], { kings: false, unmoved: ['a7B'] }), 'a7B-a9QL6=q')
		expect(at(q, 'a9QL6')).toEqual(['0:q'])
		expect(q.worlds[0].b.x.epVictim).toBe(S('a9QL6'))
		expect(movesFrom(q, 'z9QL6')).toEqual(['z9QL6-z8QL6'])
	})

	it('castles on both wings from the second move on, never on the first (T10)', () => {
		let s = newGame(V)
		expect(codes(s)).not.toContain('O-O')
		s = play(V, s, 'a2W-a3W')
		expect(codes(s)).not.toContain('O-O')
		s = play(V, s, 'a7B-a6B')
		expect(codes(s)).toContain('O-O')
		expect(codes(s)).not.toContain('O-O-O')
		const castle = legalMoves(V, s).find((m) => m.code === 'O-O')
		expect([topo.names[castle.from], topo.names[castle.to]]).toEqual(['d0KL1', 'e0KL1'])
		expect(outs(s, 'O-O')).toEqual([['move', 1, false]])
		s = play(V, s, 'O-O')
		expect(at(s, 'e0KL1')).toEqual(['0:k'])
		expect(at(s, 'd0KL1')).toEqual(['0:r'])
		expect(codes(s)).toContain('O-O')
		s = play(V, s, 'O-O')
		expect(at(s, 'e9KL6')).toEqual(['1:k'])
		expect(s.worlds[0].b.x.castle).toEqual([])
		// queen's side: once the queen has left a0QL1
		let q = newGame(V)
		for (const code of ['c2W-c3W', 'a7B-a6B', 'b1W-c2W', 'a6B-a5B', 'a0QL1-b1W', 'c7B-c6B']) {
			q = play(V, q, code)
		}
		expect(codes(q)).toEqual(expect.arrayContaining(['O-O', 'O-O-O']))
		// it needs the square a0QL1 empty, not the queen gone: back on her square she blocks it again
		const back = play(V, play(V, q, 'b1W-a0QL1'), 'c6B-c5B')
		expect(codes(back)).toContain('O-O')
		expect(codes(back)).not.toContain('O-O-O')
		q = play(V, q, 'O-O-O')
		expect(at(q, 'a0QL1')).toEqual(['0:k'])
		expect(at(q, 'd0KL1')).toEqual(['0:r'])
		expect(at(q, 'z0QL1')).toEqual(['.'])
		expect(at(q, 'e0KL1')).toEqual(['0:r'])
		q = play(V, q, 'a5B-a4N')
		expect(codes(q).filter((c) => c.startsWith('O-O'))).toEqual([])
		expect(movesFrom(q, 'a0QL1')).toEqual(['a0QL1-z0QL1'])
		// castling never captures, and pieces on rank 1 do not matter
		const c = pos([{ z0QL1: '0:r', e0KL1: '0:r', a0QL1: '1:n' }], { rights: ['K', 'Q'] })
		expect(movesFrom(c, 'd0KL1')).toEqual(['d0KL1-c1W', 'd0KL1-d1KL1', 'd0KL1-d1W', 'd0KL1-e1KL1'])
		expect(codes(c).filter((x) => x.startsWith('O-O'))).toEqual(['O-O'])
		const free = pos([{ z0QL1: '0:r', e0KL1: '0:r', a1W: '0:n', a1QL1: '1:n' }], { rights: ['K', 'Q'] })
		expect(codes(free).filter((x) => x.startsWith('O-O')).sort()).toEqual(['O-O', 'O-O-O'])
	})

	it('castles on the queen\'s side for Black as well: the king onto a9QL6, the corner rook onto d9KL6', () => {
		const s = pos([{ z9QL6: '1:r', e9KL6: '1:r', a2W: '0:p' }], { turn: 1, rights: ['k', 'q'] })
		expect(codes(s).filter((c) => c.startsWith('O-O')).sort()).toEqual(['O-O', 'O-O-O'])
		const castle = legalMoves(V, s).find((m) => m.code === 'O-O-O')
		expect([topo.names[castle.from], topo.names[castle.to]]).toEqual(['d9KL6', 'a9QL6'])
		expect(outs(s, 'O-O-O')).toEqual([['move', 1, false]])
		const done = play(V, s, 'O-O-O')
		expect(at(done, 'a9QL6')).toEqual(['1:k'])
		expect(at(done, 'd9KL6')).toEqual(['1:r'])
		expect(at(done, 'z9QL6')).toEqual(['.'])
		expect(at(done, 'e9KL6')).toEqual(['1:r'])
		expect(done.worlds[0].b.x.castle).toEqual([])
	})
})

describe('Tri-D chess: attack boards', () => {
	it('keeps every board on its start pin until it holds at most one piece', () => {
		let s = newGame(V)
		expect(boardCodes(s)).toEqual([])
		for (const code of FREE_QL1) {
			expect(boardCodes(s)).toEqual([])
			s = play(V, s, code)
		}
		// only the z pawn is left on QL1: White's board may go forward to QL2 or QL3; KL1 across is taken
		expect(boardCodes(s)).toEqual(['QL1>QL2', 'QL1>QL3'])
		const move = legalMoves(V, s).find((m) => m.code === 'QL1>QL3')
		expect([topo.names[move.from], topo.names[move.to], move.kind]).toEqual(['QL1', 'QL3', 'board'])
		expect(outs(s, 'QL1>QL3')).toEqual([['move', 1, false]])
	})

	it('knows the pins next to each pin (Meder art. 3.6)', () => {
		const next = (name) => ADJACENT[PINS.indexOf(name)].map((j) => PINS[j]).sort()
		expect(PIN.map((p) => ADJACENT[PINS.indexOf(p.name)].length)).toEqual([3, 3, 4, 4, 5, 5, 5, 5, 4, 4, 3, 3])
		expect(next('QL3')).toEqual(['KL3', 'QL1', 'QL2', 'QL4', 'QL5'])
		expect(next('QL6')).toEqual(['KL6', 'QL4', 'QL5'])
		expect(next('KL1')).toEqual(['KL2', 'KL3', 'QL1'])
		expect(next('KL5')).toEqual(['KL3', 'KL4', 'KL6', 'QL5'])
		// from QL3, QL2, QL4 and QL5 lie ahead for White, QL1 behind, KL3 beside
		const dir = (a, b) => direction(PINS.indexOf(a), PINS.indexOf(b))
		expect(['QL2', 'QL4', 'QL5', 'QL1', 'KL3'].map((p) => dir('QL3', p))).toEqual([1, 1, 1, -1, 0])
		// the boards cover the corner square of their main level and the squares beyond it
		const squaresOf = (name) => PIN_SQUARES[PINS.indexOf(name)].map((sq) => topo.names[sq])
		expect(squaresOf('QL2')).toEqual(['z4QL2', 'a4QL2', 'z5QL2', 'a5QL2'])
		expect(squaresOf('KL4')).toEqual(['d6KL4', 'e6KL4', 'd7KL4', 'e7KL4'])
		expect(TAB_OF.map((sq) => topo.names[sq])).toEqual(PINS)
	})

	it('moves an empty board to any free pin next to it, a board with a piece only forwards or sideways', () => {
		// White's empty board on QL3 may also go back to QL1; the board on KL1 holds White's king
		expect(boardCodes(pos([{}], { boards: QL3 })))
			.toEqual(['KL1>KL2', 'KL1>KL3', 'KL1>QL1', 'QL3>KL3', 'QL3>QL1', 'QL3>QL2', 'QL3>QL4', 'QL3>QL5'])
		// with a knight on it, not backwards
		expect(boardCodes(pos([{ z2QL3: '0:n' }], { boards: QL3 })).filter((c) => c.startsWith('QL3')))
			.toEqual(['QL3>KL3', 'QL3>QL2', 'QL3>QL4', 'QL3>QL5'])
		// Black: forwards is towards rank 0; the board on QL6 is empty, the one on KL6 holds Black's king
		expect(boardCodes(pos([{}], { turn: 1 }))).toEqual(['KL6>KL4', 'KL6>KL5', 'QL6>QL4', 'QL6>QL5'])
		const back = pos([{ a6QL4: '1:n' }], { turn: 1, boards: ['QL1', 'KL1', 'QL4', 'KL6'] })
		expect(boardCodes(back).filter((c) => c.startsWith('QL4')))
			.toEqual(['QL4>KL4', 'QL4>QL2', 'QL4>QL3', 'QL4>QL5'])
		const empty = pos([{}], { turn: 1, boards: ['QL1', 'KL1', 'QL4', 'KL6'] })
		expect(boardCodes(empty).filter((c) => c.startsWith('QL4')))
			.toEqual(['QL4>KL4', 'QL4>QL2', 'QL4>QL3', 'QL4>QL5', 'QL4>QL6'])
		// a pin holds one board: an occupied pin is never a target
		expect(boardCodes(pos([{}], { boards: ['QL3', 'KL1', 'QL5', 'KL3'] })).filter((c) => c.startsWith('QL3')))
			.toEqual(['QL3>QL1', 'QL3>QL2', 'QL3>QL4'])
	})

	it('gives an empty board to its owner and a board with a piece to that piece\'s side', () => {
		// Black's empty board on QL3: Black may move it, White may not
		const black = ['QL1', 'KL1', 'QL3', 'KL6']
		expect(boardCodes(pos([{}], { boards: black })).filter((c) => c.startsWith('QL3'))).toEqual([])
		expect(boardCodes(pos([{}], { turn: 1, boards: black })).filter((c) => c.startsWith('QL3')))
			.toEqual(['QL3>KL3', 'QL3>QL2', 'QL3>QL4', 'QL3>QL5'])
		// White's board with a Black knight on it is Black's: forwards for Black is towards QL1
		expect(boardCodes(pos([{ a3QL3: '1:n' }], { boards: QL3 })).filter((c) => c.startsWith('QL3'))).toEqual([])
		expect(boardCodes(pos([{ a3QL3: '1:n' }], { turn: 1, boards: QL3 })).filter((c) => c.startsWith('QL3')))
			.toEqual(['QL3>KL3', 'QL3>QL1'])
		// Black's board with a White rook on it is White's
		const rook = pos([{ z6QL4: '0:r' }], { boards: ['QL1', 'KL1', 'QL4', 'KL6'] })
		expect(boardCodes(rook).filter((c) => c.startsWith('QL4'))).toEqual(['QL4>KL4', 'QL4>QL6'])
		expect(boardCodes({ ...rook, turn: 1 }).filter((c) => c.startsWith('QL4'))).toEqual([])
	})

	it('never moves a board that holds two pieces, of either side', () => {
		for (const pair of [{ z2QL3: '0:n', a3QL3: '1:p' }, { z2QL3: '0:n', z3QL3: '0:b' }]) {
			for (const turn of [0, 1]) {
				expect(boardCodes(pos([pair], { turn, boards: QL3 })).filter((c) => c.startsWith('QL3'))).toEqual([])
			}
		}
		// the king's board with the rook beside the king stays where it is
		expect(boardCodes(pos([{ e0KL1: '0:r' }])).filter((c) => c.startsWith('KL1'))).toEqual([])
	})

	it('carries its piece to the same place on the new pin, and the squares move with the board', () => {
		let s = pos([{ z2QL3: '0:n', a1W: '0:r', b5N: '0:n' }], { boards: QL3 })
		expect(targets(s, 'a1W')).toEqual(words('a2QL3 a2W a3N a3QL3 a3W a4N a4W a5B a5N a6B a6N a7B a8B a8QL6 a9QL6 '
			+ 'b1W c1W d1KL1 d1W e1KL1'))
		s = play(V, s, 'QL3>QL5')
		expect(pinsOf(s)).toEqual(['QL5,KL1,QL6,KL6'])
		expect(at(s, 'z4QL5')).toEqual(['0:n'])
		expect(at(s, 'z2QL3')).toEqual(['.'])
		s = play(V, s, 'd9KL6-d8B')
		// the rook's file now ends on a5QL5 and a4QL5 on the new board; the old board's squares are gone
		expect(targets(s, 'a1W')).toEqual(words('a2W a3N a3W a4N a4QL5 a4W a5B a5N a5QL5 a6B a6N a7B a8B a8QL6 a9QL6 '
			+ 'b1W c1W d1KL1 d1W e1KL1'))
		// pieces reach the board's squares: the knight on b5N jumps to z4QL5's neighbours
		expect(targets(s, 'b5N')).toContain('a3W')
		expect(targets(s, 'b5N')).not.toContain('a3QL3')
		expect(targets(s, 'z4QL5')).toEqual(words('a2W a6B a6N b3N b3W b5B'))
		// a rider flies across the pin the board left: a rook on z0 now sees z4 and z5 on QL5
		const r = pos([{ z0QL1: '0:r' }], { boards: ['QL1', 'KL1', 'QL5', 'KL6'] })
		expect(targets(r, 'z0QL1')).toEqual(['a0QL1', 'z1QL1', 'z4QL5', 'z5QL5'])
	})

	it('counts a board move as a turn: en passant ends, a carried pawn no longer double-steps, a carried king or rook loses castling', () => {
		// the pawn a1QL1 has not moved yet, and rides to a3QL3
		let s = pos([{ a1QL1: '0:p' }], { unmoved: ['a1QL1'], boards: ['QL1', 'KL1', 'QL6', 'KL6'] })
		expect(movesFrom(s, 'a1QL1')).toEqual(['a1QL1-a2W', 'a1QL1-a3N', 'a1QL1-a3W'])
		s = play(V, s, 'QL1>QL3')
		expect(at(s, 'a3QL3')).toEqual(['0:p'])
		s = play(V, s, 'd9KL6-d8B')
		expect(movesFrom(s, 'a3QL3')).toEqual(['a3QL3-a4N', 'a3QL3-a4W'])
		// en passant: Black double-steps, White moves a board instead of taking, the chance is gone
		const ep = play(V, pos([{ c5N: '0:p', b7B: '1:p' }], { turn: 1, unmoved: ['b7B'], boards: QL3 }), 'b7B-b5N')
		expect(movesFrom(ep, 'c5N')).toContain('c5N-b6N')
		const later = play(V, play(V, ep, 'QL3>QL2'), 'b5N-b4W')
		expect(later.worlds[0].b.x.ep).toBe(-1)
		// the king rides its board to KL3: the queen's side castling right goes with it
		const castle = pos([{ z0QL1: '0:r', a0QL1: '0:q' }], { rights: ['Q'] })
		expect(castle.worlds[0].b.x.castle).toHaveLength(1)
		const rode = play(V, castle, 'KL1>KL3')
		expect(at(rode, 'd2KL3')).toEqual(['0:k'])
		expect(rode.worlds[0].b.x.castle).toEqual([])
		expect(rode.worlds[0].b.x.started).toEqual([true, true])
		// the move list writes a board move as its code
		expect(V.codeText('QL1>QL3')).toBe('QL1>QL3')
		expect(V.codeText('QL4>QL6=n')).toBe('QL4>QL6=N')
		expect(V.codeText('a1W-b3W')).toBeNull()
	})

	it('promotes a pawn that a board move takes to its last rank, or leaves on it (Meder art. 3.4(e))', () => {
		// the file of a pawn decides, and on files a and d the board over the far corner
		expect([0, 1, 2, 3, 4, 5].map((f) => lastRank(START_BOARDS, 0, f))).toEqual([9, 9, 8, 8, 9, 9])
		expect([0, 1, 2, 3, 4, 5].map((f) => lastRank(['QL2', 'KL1', 'QL5', 'KL6'], 0, f))).toEqual([9, 8, 8, 8, 9, 9])
		expect([0, 1, 2, 3, 4, 5].map((f) => lastRank(['QL2', 'KL3', 'QL6', 'KL6'], 1, f))).toEqual([0, 1, 1, 1, 1, 0])
		// without a board on QL6 a pawn promotes on a8B
		const bare = pos([{ a7B: '0:p', d5N: '1:k' }], { kings: false, boards: ['QL1', 'KL1', 'QL5', 'KL6'] })
		expect(movesFrom(bare, 'a7B')).toEqual(PROMOS('a7B-a8B'))
		// carried: White's z pawn rides QL4 to QL6 and lands on z9, its last rank; White picks the piece
		const carry = pos([{ z7QL4: '0:p' }], { boards: ['QL4', 'KL1', 'QL5', 'KL6'] })
		expect(boardCodes(carry).filter((c) => c.startsWith('QL4')))
			.toEqual(['QL4>KL4', ...PROMOS('QL4>QL6')].sort())
		expect(at(play(V, carry, 'QL4>QL6=n'), 'z9QL6')).toEqual(['0:n'])
		expect(at(play(V, carry, 'QL4>KL4'), 'd7KL4')).toEqual(['0:p'])
		// left behind: White's own empty board leaves QL6, so the pawn on a8B now stands on its last rank
		const own = pos([{ a8B: '0:p', d5N: '1:k' }], { kings: false, boards: ['QL6', 'KL1', 'QL1', 'KL6'] })
		expect(boardCodes(own).filter((c) => c.startsWith('QL6'))).toEqual([...PROMOS('QL6>QL4'), ...PROMOS('QL6>QL5')])
		expect(at(play(V, own, 'QL6>QL5=r'), 'a8B')).toEqual(['0:r'])
		// Black moves its board away from over White's pawn: the pawn becomes a queen
		const enemy = pos([{ a8B: '0:p', d0KL1: '0:k', d5N: '1:k' }], { turn: 1, kings: false })
		expect(boardCodes(enemy)).toEqual(['KL6>KL4', 'KL6>KL5', 'QL6>QL4', 'QL6>QL5'])
		expect(at(play(V, enemy, 'QL6>QL4'), 'a8B')).toEqual(['0:q'])
		// and the same for Black on a1W when White's board leaves QL1
		const black = pos([{ a1W: '1:p' }])
		expect(at(play(V, black, 'QL1>QL2'), 'a1W')).toEqual(['1:q'])
	})
})

describe('Tri-D chess: attack boards and ghosts', () => {
	it('carries a ghost part where it stands, with no roll, and keeps the boards the same in every world', () => {
		const s = pos([
			{ b1W: '0:k', d9KL6: '1:k', z2QL3: '0:n' },
			{ b1W: '0:k', d9KL6: '1:k', c5N: '0:n' },
		], { kings: false, boards: QL3 })
		expect(outs(s, 'QL3>QL5')).toEqual([['move', 1, false]])
		const after = play(V, s, 'QL3>QL5')
		expect(where(after, 'c5N')).toEqual({ c5N: 0.5, z4QL5: 0.5 })
		expect(pinsOf(after)).toEqual(['QL5,KL1,QL6,KL6'])
		expect(budget(after, 0)).toBe(2)
		expect(V.solidExtra(after.worlds[0].b)).toBe('QL5,KL1,QL6,KL6')
	})

	it('rolls a board move that a ghost makes impossible in some possibilities', () => {
		// a pawn and, in half the possibilities, a knight on the board: too full there
		const full = pos([
			{ b1W: '0:k', d9KL6: '1:k', a3QL3: '0:p', z2QL3: '0:n' },
			{ b1W: '0:k', d9KL6: '1:k', a3QL3: '0:p', c5N: '0:n' },
		], { kings: false, boards: QL3 })
		expect(outs(full, 'QL3>QL5')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		const moved = playKey(full, 'QL3>QL5', 'move')
		expect(at(moved, 'a5QL5')).toEqual(['0:p'])
		expect(where(moved, 'c5N')).toEqual({ c5N: 1 })
		expect(pinsOf(moved)).toEqual(['QL5,KL1,QL6,KL6'])
		const missed = playKey(full, 'QL3>QL5', 'miss')
		expect(where(missed, 'z2QL3')).toEqual({ z2QL3: 1 })
		expect(at(missed, 'a3QL3')).toEqual(['0:p'])
		expect(pinsOf(missed)).toEqual(['QL3,KL1,QL6,KL6'])
		// a Black ghost on White's empty board hands it to Black in half the possibilities
		const contested = pos([
			{ b1W: '0:k', d9KL6: '1:k', z2QL3: '1:n' },
			{ b1W: '0:k', d9KL6: '1:k', c5N: '1:n' },
		], { kings: false, boards: QL3 })
		expect(outs(contested, 'QL3>QL1')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		expect(outs({ ...contested, turn: 1 }, 'QL3>QL1')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		expect(pinsOf(playKey(contested, 'QL3>QL1', 'move'))).toEqual(['QL1,KL1,QL6,KL6'])
		// the ghost knight on the board: a board with a piece cannot go back, an empty one can
		const back = pos([
			{ b1W: '0:k', d9KL6: '1:k', z2QL3: '0:n' },
			{ b1W: '0:k', d9KL6: '1:k', c5N: '0:n' },
		], { kings: false, boards: QL3 })
		expect(outs(back, 'QL3>QL1')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		expect(where(playKey(back, 'QL3>QL1', 'move'), 'c5N')).toEqual({ c5N: 1 })
	})

	it('keeps the pins the same in every world in random games with board moves, splits, merges and measures', () => {
		let boardMoves = 0
		let rolled = 0
		for (const seed of [21, 22, 23, 24, 25, 26, 27, 28]) {
			const rng = seededRng(seed)
			let s = pos([{
				d0KL1: '0:k',
				e0KL1: '0:n',
				a1W: '0:r',
				b2W: '0:b',
				c2W: '0:p',
				z2QL3: '0:q',
				d9KL6: '1:k',
				e9KL6: '1:n',
				a8B: '1:r',
				b7B: '1:b',
				c7B: '1:p',
				z6QL4: '1:q',
			}], { kings: false, boards: ['QL3', 'KL1', 'QL4', 'KL6'] })
			for (let ply = 0; ply < 60 && !s.result; ply++) {
				const all = legalMoves(V, s, { splits: ply % 4 === 1 }).map((m) => m.code)
				const boards = all.filter((c) => c.includes('>'))
				const list = boards.length && rng() < 0.4 ? boards : all
				const code = list[Math.floor(rng() * list.length)]
				const res = applyMove(V, s, code, rng)
				if (code.includes('>')) {
					boardMoves++
					rolled += res.outcomes.length > 1 ? 1 : 0
				}
				for (const br of res.outcomes) {
					expect(br.notes.filter((n) => n.startsWith('solid:') || n.startsWith('end:'))).toEqual([])
				}
				s = res.state
				expect(pinsOf(s)).toHaveLength(1)
				const x = JSON.stringify(s.worlds[0].b.x)
				expect(s.worlds.every(({ b }) => JSON.stringify(b.x) === x)).toBe(true)
				// no piece stands on a tab or on a square of a pin without a board
				for (const { b } of s.worlds) {
					for (const sq of b.sq.filter((q) => q >= 0)) {
						expect(TAB_OF).not.toContain(sq)
						expect(PIN_OF[sq] < 0 || b.x.boards.includes(PINS[PIN_OF[sq]]), topo.names[sq]).toBe(true)
					}
				}
			}
		}
		expect(boardMoves).toBeGreaterThan(50)
		expect(rolled).toBeGreaterThan(0)
	})

	it('lets the computer move a board: it carries a pawn to promotion', async () => {
		const s = pos([{ z7QL4: '0:p', c2W: '0:p', c7B: '1:p' }], { boards: ['QL4', 'KL1', 'QL5', 'KL6'] })
		for (const level of ['easy', 'normal', 'hard']) {
			expect(await chooseMove(V, s, { level, rng: seededRng(5), now: workClock() }), level).toBe('QL4>QL6=q')
		}
	})
})

describe('Tri-D chess: end of the game', () => {
	it('is won by capturing the king', () => {
		const s = pos([{ d8B: '0:q', a2W: '1:p' }])
		const after = play(V, s, 'd8B-d9KL6')
		expect(after.result).toEqual({ winner: 0, reason: 'king' })
		expect(legalMoves(V, after)).toEqual([])
	})

	it('keeps the classic end rules of the core, with no end rule of its own', () => {
		expect([V.escapeRule, V.bareKingsDraw, V.drawsWait, V.specialMoves]).toEqual([true, true, true, true])
		expect(V.worldResult).toBeUndefined()
	})

	it('is won at once when the king cannot escape', () => {
		// the rook d8KL6 guards rank 8 (a8QL6, a8B); the rook e9KL6 takes rank 9 across the void b9 and c9; with its
		// pawn on z8QL6 the king's board holds two pieces and cannot move away
		const trap = pos([{ d0KL1: '0:k', d8KL6: '0:r', e0KL1: '0:r', z9QL6: '1:k', z8QL6: '1:p' }], { kings: false })
		expect(play(V, trap, 'e0KL1-e9KL6').result).toEqual({ winner: 0, reason: 'cannotEscape' })
		// without the rook on rank 8 the king steps to rank 8 and the game goes on
		const open = pos([{ d0KL1: '0:k', e0KL1: '0:r', z9QL6: '1:k', z8QL6: '1:p' }], { kings: false })
		const s = play(V, open, 'e0KL1-e9KL6')
		expect(s.result).toBeNull()
		expect(movesFrom(s, 'z9QL6')).toEqual(['z9QL6-a8B', 'z9QL6-a8QL6', 'z9QL6-a9QL6'])
		// without the pawn the king rides its board away: a board move is an escape too
		const ride = pos([{ d0KL1: '0:k', d8KL6: '0:r', e0KL1: '0:r', z9QL6: '1:k' }], { kings: false })
		const t = play(V, ride, 'e0KL1-e9KL6')
		expect(t.result).toBeNull()
		expect(boardCodes(t)).toEqual(['QL6>QL4', 'QL6>QL5'])
	})

	it('is drawn when only the kings are left, unless the side to move can take the other king for certain', () => {
		const lone = pos([{ b4W: '0:k', c5N: '1:n', d9KL6: '1:k' }], { kings: false })
		expect(play(V, lone, 'b4W-c5N').result).toEqual({ winner: null, reason: 'bareKings' })
		// kings on neighbouring map squares, also across levels: the draw waits
		const near = pos([{ b4W: '0:k', c5N: '1:n', d6B: '1:k' }], { kings: false })
		const s = play(V, near, 'b4W-c5N')
		expect(s.result).toBeNull()
		expect(play(V, s, 'd6B-c5N').result).toEqual({ winner: 1, reason: 'king' })
		// a king that steps away instead leaves two kings that cannot take each other: now it is a draw
		expect(play(V, s, 'd6B-d7B').result).toEqual({ winner: null, reason: 'bareKings' })
	})

	it('is drawn when the side to move has no legal move', () => {
		// White's board on KL1 holds a Black knight, so White cannot move it either
		const s = pos([{
			e0KL1: '1:n',
			z0QL1: '0:k',
			a0QL1: '0:p',
			z1QL1: '0:p',
			a1QL1: '0:p',
			a1W: '0:p',
			a2W: '0:p',
			a3W: '1:p',
			a3N: '1:p',
			d9KL6: '1:k',
		}], { turn: 1, kings: false })
		expect(play(V, s, 'd9KL6-d8B').result).toEqual({ winner: null, reason: 'noMoves' })
	})
})

describe('Tri-D chess: quantum rules', () => {
	const ghostKnight = () => pos([{ b1W: '0:r', b3N: '1:n' }, { b1W: '0:r', c5B: '1:n' }])

	it('links a rider blocked by a ghost on another level of a map square in between (TQ1)', () => {
		const s = ghostKnight()
		expect(outs(s, 'b1W-b5N')).toEqual([['move', 1, false]])
		const after = play(V, s, 'b1W-b5N')
		expect(where(after, 'b1W')).toEqual({ b1W: 0.5, b5N: 0.5 })
		expect(budget(after, 0)).toBe(2)
	})

	it('rolls a slide past a ghost when its target might hold a piece', () => {
		const s = pos([{ b1W: '0:r', b3N: '1:n' }, { b1W: '0:r', b5N: '1:n' }])
		expect(outs(s, 'b1W-b5N')).toEqual([['capture', 0.5, true], ['miss', 0.5, true]])
		const t = pos([{ b1W: '0:r', b3N: '1:n', b5N: '1:b' }, { b1W: '0:r', c6B: '1:n', b5N: '1:b' }])
		expect(outs(t, 'b1W-b5N')).toEqual([['capture', 0.5, true], ['miss', 0.5, true]])
	})

	it('ignores a ghost on the other level of the target map square (TQ2)', () => {
		const s = ghostKnight()
		expect(outs(s, 'b1W-b3W')).toEqual([['move', 1, false]])
		expect(where(play(V, s, 'b1W-b3W'), 'b3W')).toEqual({ b3W: 1 })
		expect(where(play(V, s, 'b1W-b4W'), 'b1W')).toEqual({ b1W: 0.5, b4W: 0.5 })
	})

	it('splits a knight over both levels of one map square, which then blocks it for certain (TQ3)', () => {
		const s0 = pos([{ a1W: '0:n', b6N: '1:r' }])
		expect(splitsFrom(V, s0, S('a1W')).map((m) => m.code)).toContain('a1W-b3W|b3N')
		expect(outs(s0, 'a1W-b3W|b3N')).toEqual([['split', 1, false]])
		const s = play(V, s0, 'a1W-b3W|b3N')
		expect(budget(s, 0)).toBe(2)
		expect(branches(V, s, 'b6N-b1W')).toBeNull()
		expect(outs(s, 'b6N-b3N')).toEqual([['capture', 0.5, true], ['move', 0.5, true]])
		const moved = playKey(s, 'b6N-b3N', 'move')
		expect(where(moved, 'b3W')).toEqual({ b3W: 1 })
		expect(at(moved, 'b3N')).toEqual(['1:r'])
		expect(outs(s, 'b6N-b4W')).toEqual([['move', 1, false]])
	})

	it('merges a level split onto any common target, never vertically (TQ11)', () => {
		let s = play(V, pos([{ a1W: '0:n' }]), 'a1W-b3W|b3N')
		s = play(V, s, 'd9KL6-d8B')
		const merges = mergesFrom(V, s, S('b3W')).map((m) => m.code.split('-')[1]).sort()
		expect(merges).toEqual(['a1QL1', 'a1W', 'a5B', 'a5N', 'c1W', 'c5B', 'c5N', 'd2W', 'd4N', 'd4W'])
		expect(outs(s, 'b3W|b3N-c5N')).toEqual([['move', 1, false]])
		const after = play(V, s, 'b3W|b3N-c5N')
		expect(where(after, 'c5N')).toEqual({ c5N: 1 })
		expect(budget(after, 0)).toBe(1)
	})

	it('rolls a pawn that probes one level; its double step over a certain ghost is illegal (TQ4, TQ13)', () => {
		const s = pos([{ c2W: '0:p', c3W: '1:n' }, { c2W: '0:p', c3N: '1:n' }], { unmoved: ['c2W'] })
		expect(outs(s, 'c2W-c3W')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		expect(where(playKey(s, 'c2W-c3W', 'move'), 'c3N')).toEqual({ c3N: 1 })
		expect(where(playKey(s, 'c2W-c3W', 'miss'), 'c3W')).toEqual({ c3W: 1 })
		expect(branches(V, s, 'c2W-c4W')).toBeNull()
		expect(branches(V, s, 'c2W-c4N')).toBeNull()
		// a capture probes one level too, and the pushes stay certain while c3 is empty
		const t = pos([{ c2W: '0:p', b3W: '1:n' }, { c2W: '0:p', b3N: '1:n' }], { unmoved: ['c2W'] })
		expect(outs(t, 'c2W-b3W')).toEqual([['capture', 0.5, true], ['miss', 0.5, true]])
		const missed = playKey(t, 'c2W-b3W', 'miss')
		expect(where(missed, 'b3N')).toEqual({ b3N: 1 })
		expect(missed.worlds[0].b.x.moved).toEqual([])
		for (const code of ['c2W-c3W', 'c2W-c3N', 'c2W-c4W', 'c2W-c4N']) {
			expect(outs(t, code)).toEqual([['move', 1, false]])
		}
	})

	it('promotes only in the worlds where the pawn arrives (TQ5)', () => {
		const s = pos([{ b7B: '0:p', b8B: '1:n' }, { b7B: '0:p', c6N: '1:n' }])
		expect(outs(s, 'b7B-b8B=q')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		const moved = playKey(s, 'b7B-b8B=q', 'move')
		expect(at(moved, 'b8B')).toEqual(['0:q'])
		expect(where(moved, 'c6N')).toEqual({ c6N: 1 })
		const missed = playKey(s, 'b7B-b8B=q', 'miss')
		expect(at(missed, 'b7B')).toEqual(['0:p'])
		expect(at(missed, 'b8B')).toEqual(['1:n'])
	})

	it('rolls a double step past a ghost, then en passant is certain (TQ6, TQ14)', () => {
		const s = pos([
			{ c5N: '0:p', b7B: '1:p', b6N: '1:n' },
			{ c5N: '0:p', b7B: '1:p', a6B: '1:n' },
		], { turn: 1, unmoved: ['b7B'] })
		expect(outs(s, 'b7B-b5N')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		const missed = playKey(s, 'b7B-b5N', 'miss')
		expect(outs(missed, 'c5N-b6N')).toEqual([['capture', 1, false]])
		expect(missed.worlds[0].b.x.ep).toBe(-1)
		const moved = playKey(s, 'b7B-b5N', 'move')
		for (const code of ['c5N-b6N', 'c5N-b6B']) {
			expect(outs(moved, code)).toEqual([['capture', 1, false]])
			expect(at(play(V, moved, code), 'b5N')).toEqual(['.'])
		}
		// TQ14: a White ghost on the other level of the target does not matter, on the target it does
		const t = pos([
			{ c5N: '0:p', b5B: '0:n', b7B: '1:p' },
			{ c5N: '0:p', a3W: '0:n', b7B: '1:p' },
		], { turn: 1, unmoved: ['b7B'] })
		expect(outs(t, 'b7B-b5N')).toEqual([['move', 1, false]])
		expect(outs(t, 'b7B-b5B')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		const ep = play(V, play(V, t, 'b7B-b5N'), 'c5N-b6B')
		expect(where(ep, 'b6B')).toEqual({ b6B: 1 })
		expect(at(ep, 'b5N')).toEqual(['.', '.'])
		expect(where(ep, 'a3W')).toEqual({ a3W: 0.5, b5B: 0.5 })
	})

	it('offers castling next to ghosts as a certain move; a missed attack keeps the right (TQ7)', () => {
		const start = newGame(V).worlds[0].b
		const base = {}
		start.sq.forEach((sq, id) => {
			if (topo.names[sq] !== 'e1KL1') {
				base[topo.names[sq]] = start.sd[id] + ':' + start.ty[id]
			}
		})
		const unmoved = Object.keys(base).filter((n) => base[n].endsWith(':p'))
		const rights = ['K', 'Q', 'k', 'q']
		const s = pos([{ ...base, e1KL1: '1:n' }, { ...base, c3N: '1:n' }], { kings: false, unmoved, rights })
		expect(outs(s, 'O-O')).toEqual([['move', 1, false]])
		expect(codes(s)).not.toContain('O-O-O')
		// a Black knight 50 % c1W / 50 % b5N attacks the rook on e0KL1
		const t = pos([{ e0KL1: '0:r', c1W: '1:n' }, { e0KL1: '0:r', b5N: '1:n' }], { turn: 1, rights: ['K'] })
		expect(outs(t, 'c1W-e0KL1')).toEqual([['capture', 0.5, true], ['miss', 0.5, true]])
		const lost = playKey(t, 'c1W-e0KL1', 'capture')
		expect(lost.worlds.every(({ b }) => b.x.castle.length === 0)).toBe(true)
		const kept = playKey(t, 'c1W-e0KL1', 'miss')
		expect(where(kept, 'b5N')).toEqual({ b5N: 1 })
		expect(outs(kept, 'O-O')).toEqual([['move', 1, false]])
	})

	it('refuses queen-side castling while a ghost may stand on a0QL1, and allows it once measured away (TQ8)', () => {
		const white = { z0QL1: '0:r', c2W: '0:p' }
		const s = pos([{ ...white, a0QL1: '1:n' }, { ...white, b2W: '1:n' }], { rights: ['Q'] })
		expect(codes(s)).not.toContain('O-O-O')
		expect(branches(V, s, 'O-O-O')).toBeNull()
		const measured = play(V, s, 'c2W-c3W')
		const away = playKey(measured, '?a0QL1', 'b2W')
		expect(outs(away, 'O-O-O')).toEqual([['move', 1, false]])
		const done = play(V, away, 'O-O-O')
		expect(at(done, 'a0QL1')).toEqual(['0:k'])
		expect(at(done, 'd0KL1')).toEqual(['0:r'])
		expect(at(done, 'z0QL1')).toEqual(['.'])
		expect(done.worlds[0].b.x.castle).toEqual([])
		const home = playKey(measured, '?a0QL1', 'a0QL1')
		expect(branches(V, home, 'O-O-O')).toBeNull()
	})

	it('ends en passant after one ply in every world, also after Measure turns and missed moves (TQ9)', () => {
		// (a) Measure turns
		const a = pos([
			{ c5N: '0:p', a1W: '0:n', b7B: '1:p', a8B: '1:n' },
			{ c5N: '0:p', c2W: '0:n', b7B: '1:p', a8B: '1:n' },
			{ c5N: '0:p', a1W: '0:n', b7B: '1:p', d8B: '1:n' },
			{ c5N: '0:p', c2W: '0:n', b7B: '1:p', d8B: '1:n' },
		], { turn: 1, unmoved: ['b7B'] })
		expect(outs(a, 'b7B-b5N')).toEqual([['move', 1, false]])
		let s = play(V, a, 'b7B-b5N')
		expect(outs(s, 'c5N-b6N')).toEqual([['capture', 1, false]])
		expect(outs(s, 'c5N-b6B')).toEqual([['capture', 1, false]])
		s = play(V, s, '?a1W')
		s = play(V, s, '?a8B')
		expect(branches(V, s, 'c5N-b6N')).toBeNull()
		expect(branches(V, s, 'c5N-b6B')).toBeNull()
		// (b) missed moves
		const b = pos([
			{ c5N: '0:p', a1W: '0:r', b7B: '1:p', a4W: '1:n' },
			{ c5N: '0:p', a1W: '0:r', b7B: '1:p', c7B: '1:n' },
		], { turn: 1, unmoved: ['b7B'] })
		s = play(V, b, 'b7B-b5N')
		expect(outs(s, 'a1W-a6N')).toEqual([['move', 1, false]])
		s = play(V, s, 'a1W-a6N')
		expect(outs(s, 'c7B-d5B')).toEqual([['move', 1, false]])
		s = play(V, s, 'c7B-d5B')
		expect(branches(V, s, 'c5N-b6N')).toBeNull()
		expect(s.worlds.every(({ b: w }) => w.x.ep === -1 && w.x.epVictim === -1)).toBe(true)
	})

	it('ends en passant and counts the turn in a world where the move did not happen (applyMiss)', () => {
		const start = newGame(V).worlds[0].b
		const first = V.applyMiss(start, { type: 'measure' }, 0, { hit: false })
		expect(first.x).toEqual(extras({ castle: startRights(), started: [true, false] }))
		expect(start.x.started).toEqual([false, false])
		const w = { ...start, x: extras({ ep: COL_OF[S('b6N')], epVictim: S('b5N') }) }
		const idle = V.applyMiss(w, { type: 'measure' }, 0, { hit: false })
		// the fields keep their order: worlds are compared by the JSON text of `x`
		expect(Object.keys(idle.x)).toEqual(['ep', 'epVictim', 'castle', 'started', 'moved', 'boards'])
		expect([idle.x.ep, idle.x.epVictim]).toEqual([-1, -1])
		expect(w.x.epVictim).toBe(S('b5N'))
		const calm = { ...start, x: extras() }
		expect(V.applyMiss(calm, { type: 'measure' }, 1, { hit: false })).toBe(calm)
	})

	it('loses the castling right for good after a partial slide of the rook (TQ10)', () => {
		const s = pos([{ e0KL1: '0:r', e1KL1: '1:n' }, { e0KL1: '0:r', b5N: '1:n' }], { rights: ['K'] })
		expect(outs(s, 'O-O')).toEqual([['move', 1, false]])
		expect(outs(s, 'e0KL1-e8KL6')).toEqual([['move', 1, false]])
		let t = play(V, s, 'e0KL1-e8KL6')
		expect(where(t, 'e0KL1')).toEqual({ e0KL1: 0.5, e8KL6: 0.5 })
		t = play(V, t, 'd9KL6-d8B')
		expect(branches(V, t, 'O-O')).toBeNull()
		t = playKey(t, '?e0KL1', 'e0KL1')
		expect(where(t, 'e0KL1')).toEqual({ e0KL1: 1 })
		t = play(V, t, 'd8B-d9KL6')
		expect(branches(V, t, 'O-O')).toBeNull()
		expect(t.worlds.every(({ b }) => b.x.castle.length === 0)).toBe(true)
	})

	it('settles king steps per square and counts king danger on both levels (TQ12)', () => {
		const s = pos([{ d1W: '1:n' }, { c5B: '1:n' }])
		expect(outs(s, 'd0KL1-d1KL1')).toEqual([['move', 1, false]])
		expect(outs(s, 'd0KL1-d1W')).toEqual([['capture', 0.5, true], ['move', 0.5, true]])
		const t = pos([{ d8B: '1:r', d4N: '0:n' }, { d8B: '1:r', a3W: '0:n' }], { turn: 1 })
		expect(royalDanger(V, t, 0)).toBe(0.5)
		expect(outs(t, 'd8B-d0KL1')).toEqual([['capture', 0.5, true], ['miss', 0.5, true]])
		const won = playKey(t, 'd8B-d0KL1', 'capture')
		expect(won.result).toEqual({ winner: 1, reason: 'king' })
		const missed = playKey(t, 'd8B-d0KL1', 'miss')
		expect(missed.result).toBeNull()
		expect(where(missed, 'd4N')).toEqual({ d4N: 1 })
		expect(at(missed, 'd8B')).toEqual(['1:r'])
	})

	it('keeps the world extras equal in every world and never needs a solid or game-end roll (F1)', () => {
		let plies = 0
		for (const seed of [11, 12, 13, 14, 15, 16]) {
			const rng = seededRng(seed)
			let s = newGame(V)
			for (let ply = 0; ply < 80 && !s.result; ply++) {
				let list = codes(s)
				if (ply % 3 === 1) {
					const froms = [...new Set(s.worlds.flatMap(({ b }) => b.sq.filter((sq, id) => sq >= 0
						&& b.sd[id] === s.turn && V.types[b.ty[id]].splittable)))]
					const f = froms[Math.floor(rng() * froms.length)]
					const splits = f === undefined ? [] : splitsFrom(V, s, f).map((m) => m.code)
					if (splits.length) {
						list = splits
					}
				}
				const res = applyMove(V, s, list[Math.floor(rng() * list.length)], rng)
				for (const br of res.outcomes) {
					expect(br.notes.filter((n) => n.startsWith('solid:') || n.startsWith('end:'))).toEqual([])
				}
				s = res.state
				const x = JSON.stringify(s.worlds[0].b.x)
				expect(s.worlds.every(({ b }) => JSON.stringify(b.x) === x)).toBe(true)
				expect(s.worlds.reduce((a, e) => a + e.w, 0)).toBe(T)
				for (const side of [0, 1]) {
					const info = budgetInfo(V, s, side)
					expect(info.used).toBeLessThanOrEqual(info.limit)
				}
				plies++
			}
		}
		expect(plies).toBeGreaterThan(200)
	})

	it('evaluates a world for the computer as own minus enemy activity, with a bonus on the neutral level', () => {
		const start = newGame(V).worlds[0].b
		expect([V.evaluate(start, 0), V.evaluate(start, 1)]).toEqual([0, 0])
		const world = (pl) => pos([pl]).worlds[0].b
		const high = world({ b4N: '0:q', c5B: '1:n' })
		expect(V.evaluate(high, 0)).toBeGreaterThan(0)
		expect(V.evaluate(high, 1)).toBe(-V.evaluate(high, 0))
		// a piece reaches the same squares from either level of its map square
		expect(V.evaluate(high, 0) - V.evaluate(world({ b4W: '0:q', c5B: '1:n' }), 0)).toBe(10)
		expect(V.evaluate(world({ b4N: '0:r' }), 0)).toBe(V.evaluate(world({ b4W: '0:r' }), 0))
	})

	it('lets the computer play a legal move from the start at every level within its time', async () => {
		const s = newGame(V)
		for (const L of LEVELS) {
			const elapsed = stopwatch()
			const code = await chooseMove(V, s, { level: L.id, rng: seededRng(3) })
			expect(elapsed()).toBeLessThan(L.timeMs + 1000)
			expect(branches(V, s, code), L.id + ': ' + code).not.toBeNull()
		}
	}, 20000)
})
