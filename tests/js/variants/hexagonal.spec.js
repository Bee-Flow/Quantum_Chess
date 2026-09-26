/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Gliński's hexagonal chess: the board, the setup, the movement of every piece on hexagons, the pawn's double step by
 * cell, en passant and promotion at the end of every file, the win and draw conditions, and how they meet the quantum
 * rules. The cases follow section 7 of handoff/research/hexagonal.md (C1-C10, Q1-Q13); the perft numbers match the
 * hexchess.club engine.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { glyphOf, typeName } from '../../../src/variantplay/glyphs.js'
import { resultText, sharedRules } from '../../../src/variantplay/texts.js'
import { catalogEntry } from '../../../src/variants/catalog.js'
import { aiSplits, chooseMove, evaluateState, LEVELS } from '../../../src/variants/core/ai.js'
import {
	applyMove,
	applyOutcome,
	branches,
	budget,
	budgetInfo,
	hasLegalMove,
	isLegal,
	legalMoves,
	newGame,
	outcomes,
	splitsFrom,
	splitTargets,
	T,
} from '../../../src/variants/core/quantum.js'
import { applyClassical, attacks, generate, royalSquares, worldFrom } from '../../../src/variants/core/world.js'
import V, { BISHOP6, distance, PAWN_START, promotes, ROOK6 } from '../../../src/variants/hexagonal.js'
import { play, stateOf, stopwatch, workClock } from './helpers.js'

const topo = V.topology

/** The kings of most cases: they take no part. */
const K = { l1: '0:k', f11: '1:k' }

/**
 * A list of cell names or keys from a string separated by spaces.
 *
 * @param {string} text names
 * @return {string[]}
 */
function list(text) {
	return text.split(' ')
}

/**
 * The four promotion keys of a pawn move, sorted.
 *
 * @param {string} key the move without promotion, `g9-g10`
 * @return {string[]}
 */
function promos(key) {
	return ['b', 'n', 'q', 'r'].map((p) => key + '=' + p)
}

/**
 * The cell with a name.
 *
 * @param {string} name cell name
 * @return {number}
 */
function sq(name) {
	return topo.byName(name)
}

/**
 * A world with the variant's extra state (no castling rights).
 *
 * @param {Record<string, string>} placement cells and pieces
 * @return {object}
 */
function world(placement) {
	return worldFrom(V, placement, { ep: -1, epVictim: -1 })
}

/**
 * A state from explicit worlds, each with the variant's extra state.
 *
 * @param {Array<[Record<string, string>, number]>} worlds placements with relative weights
 * @param {number} [turn] side to move
 * @return {object}
 */
function S(worlds, turn = 0) {
	return stateOf(V, worlds, turn, (b) => {
		b.x = { ep: -1, epVictim: -1 }
	})
}

/**
 * A state of one world.
 *
 * @param {Record<string, string>} placement cells and pieces
 * @param {number} [turn] side to move
 * @return {object}
 */
function one(placement, turn = 0) {
	return S([[placement, 1]], turn)
}

/**
 * The classical move keys of a side in a world, optionally only those from one cell, sorted.
 *
 * @param {object} w world
 * @param {number} side side
 * @param {string} [from] from cell
 * @return {string[]}
 */
function keys(w, side, from = null) {
	return [...generate(V, w, side).values()]
		.filter((m) => from === null || m.from === sq(from))
		.map((m) => m.key)
		.sort()
}

/**
 * The target cells of the moves of the piece on a cell, sorted.
 *
 * @param {object} w world
 * @param {string} from from cell
 * @return {string[]}
 */
function targets(w, from) {
	const id = w.board[sq(from)]
	return [...generate(V, w, w.sd[id]).values()].filter((m) => m.from === sq(from)).map((m) => topo.names[m.to]).sort()
}

/**
 * The pieces of a world, White upper case, sorted: `Kl1 Rc1 kf11`.
 *
 * @param {object} b world
 * @return {string}
 */
function pieces(b) {
	const out = []
	b.sq.forEach((s, id) => {
		if (s >= 0) {
			out.push((b.sd[id] === 0 ? b.ty[id].toUpperCase() : b.ty[id]) + topo.names[s])
		}
	})
	return out.sort().join(' ')
}

/**
 * The worlds of a state as `weight pieces` strings, sorted.
 *
 * @param {object} s state
 * @return {string[]}
 */
function show(s) {
	return s.worlds.map(({ b, w }) => (w / T).toFixed(2) + ' ' + pieces(b)).sort()
}

/**
 * The outcomes of a move as `key p` strings, `R` marking a roll; null when illegal.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {string[]|null}
 */
function outs(s, code) {
	const found = outcomes(V, s, code)
	return found ? found.map((o) => o.key + ' ' + o.p + (o.rolled ? ' R' : '')) : null
}

/**
 * The en passant cell and victim of every world, by name (`-` for none).
 *
 * @param {object} s state
 * @return {string[]}
 */
function epOf(s) {
	return s.worlds.map(({ b }) => (b.x.ep >= 0 ? topo.names[b.x.ep] + '/' + topo.names[b.x.epVictim] : '-'))
}

/**
 * Perft on one world. Legal: moves that leave the own king attacked are left out, as in the reference engines; the
 * core itself generates pseudo-legal capture-the-king moves.
 *
 * @param {object} w world
 * @param {number} side side to move
 * @param {number} depth depth
 * @param {boolean} legal leave out moves into check
 * @return {number}
 */
function perft(w, side, depth, legal) {
	let n = 0
	for (const m of generate(V, w, side).values()) {
		const next = applyClassical(V, w, m)
		if (legal && attacks(V, next, 1 - side, royalSquares(V, next, side)[0])) {
			continue
		}
		n += depth === 1 ? 1 : perft(next, 1 - side, depth - 1, legal)
	}
	return n
}

describe('hexagonal: the board', () => {
	it('has 91 cells: files a to l without j, V-shaped ranks (C1)', () => {
		expect(topo.size).toBe(91)
		const files = 'abcdefghikl'.split('').map((f) => topo.names.filter((n) => n[0] === f).length)
		expect(files).toEqual([6, 7, 8, 9, 10, 11, 10, 9, 8, 7, 6])
		const ranks = []
		for (let r = 1; r <= 11; r++) {
			ranks.push(topo.names.filter((n) => Number(n.slice(1)) === r).length)
		}
		expect(ranks).toEqual([11, 11, 11, 11, 11, 11, 9, 7, 5, 3, 1])
		expect([sq('j1'), sq('f12'), sq('a7'), sq('l7')]).toEqual([-1, -1, -1, -1])
		expect([sq('f6'), sq('f1'), sq('f11'), sq('l6'), sq('a1')]).toEqual([45, 40, 50, 90, 0])
		expect(topo.coords[sq('f6')]).toEqual([0, 0])
		// White promotes on the top edge, Black on rank 1
		const top = topo.names.filter((n, s) => promotes(0, s))
		expect(top.sort()).toEqual(['a6', 'b7', 'c8', 'd9', 'e10', 'f11', 'g10', 'h9', 'i8', 'k7', 'l6'])
		expect(topo.names.filter((n, s) => promotes(1, s)).every((n) => n.endsWith('1') && n.length === 2)).toBe(true)
		expect(topo.names.filter((n, s) => promotes(1, s))).toHaveLength(11)
		expect(distance(sq('f1'), sq('f11'))).toBe(10)
		expect(distance(sq('a1'), sq('l1'))).toBe(10)
		expect(distance(sq('f6'), sq('d5'))).toBe(2)
	})

	it('shades the cells in three horizontal bands; bishops keep their shade (C1)', () => {
		const shade = (n) => topo.cells[sq(n)].shade
		const count = { light: 0, mid: 0, dark: 0 }
		topo.cells.forEach((c) => {
			count[c.shade]++
		})
		expect(count).toEqual({ light: 30, mid: 31, dark: 30 })
		expect(['f1', 'f2', 'f3', 'f6', 'f9', 'f10', 'f11', 'a1', 'b1', 'c1'].map(shade))
			.toEqual(['light', 'dark', 'mid', 'mid', 'mid', 'light', 'dark', 'dark', 'mid', 'light'])
		for (let s = 0; s < topo.size; s++) {
			for (const v of ROOK6) {
				const n = topo.step(s, v)
				// neighbours never share a shade
				expect(n < 0 || topo.cells[n].shade !== topo.cells[s].shade).toBe(true)
			}
			for (const v of BISHOP6) {
				const n = topo.step(s, v)
				expect(n < 0 || topo.cells[n].shade === topo.cells[s].shade).toBe(true)
			}
		}
	})

	it('draws flat-topped hexagons that fit the drawing and turn onto themselves for Black', () => {
		const { width, height, labels } = topo.layout
		expect(width).toBeCloseTo(11.215, 3)
		expect(height).toBe(12.3)
		expect(width * height).toBeLessThan(200)
		const f6 = topo.cells[sq('f6')]
		expect(f6.x).toBeCloseTo(width / 2, 3)
		expect(f6.y).toBeCloseTo(height / 2, 3)
		expect(topo.cells[sq('a1')].x).toBeCloseTo(1.2774, 3)
		expect(topo.cells[sq('f11')].y).toBeCloseTo(1.15, 6)
		expect(topo.cells[sq('f1')].y).toBeCloseTo(11.15, 6)
		for (const c of topo.cells) {
			expect(c).toMatchObject({ shape: 'hex', h: 1 })
			expect(c.w).toBeCloseTo(2 / Math.sqrt(3), 6)
			expect(c.x - c.w / 2).toBeGreaterThan(0.5)
			expect(c.x + c.w / 2).toBeLessThan(width - 0.5)
			expect(c.y - 0.5).toBeGreaterThan(0.5)
			expect(c.y + 0.5).toBeLessThan(height - 0.5)
			// the 180 degree turn puts every cell on the cell of its mirror (q, h) -> (-q, -h)
			const [q, h] = topo.coords[c.sq]
			const m = topo.cells[topo.at([-q, -h])]
			expect(m.x).toBeCloseTo(width - c.x, 6)
			expect(m.y).toBeCloseTo(height - c.y, 6)
		}
		expect(labels).toHaveLength(33)
		expect(labels.map((l) => l.text).filter((x) => /[a-z]/.test(x)).join('')).toBe('abcdefghikl')
		for (const l of labels) {
			expect(l.x > 0.2 && l.x < width - 0.2 && l.y > 0.2 && l.y < height - 0.2).toBe(true)
			const nearest = Math.min(...topo.cells.map((c) => Math.hypot(c.x - l.x, c.y - l.y)))
			expect(nearest).toBeGreaterThan(0.8)
		}
	})
})

describe('hexagonal: the start position', () => {
	it('places 18 pieces per side on their start cells (setup)', () => {
		const w = V.setup()
		expect(pieces(w)).toBe([
			'Bf1 Bf2 Bf3 Kg1 Nd1 Nh1 Pb1 Pc2 Pd3 Pe4 Pf5 Pg4 Ph3 Pi2 Pk1 Qe1 Rc1 Ri1',
			'bf10 bf11 bf9 kg10 nd9 nh9 pb7 pc7 pd7 pe7 pf7 pg7 ph7 pi7 pk7 qe10 rc8 ri8',
		].join(' '))
		expect(w.x).toEqual({ ep: -1, epVictim: -1 })
		// the first ids as the spec suggests: White K, Q, R c1, R i1, B f1, B f2, B f3, N d1, N h1, P b1
		expect(w.ty.slice(0, 10).join('')).toBe('kqrrbbbnnp')
		expect(w.sq.slice(0, 10).map((s) => topo.names[s])).toEqual(list('g1 e1 c1 i1 f1 f2 f3 d1 h1 b1'))
		// one bishop per shade, and the pawns on their starting cells
		expect(['f1', 'f2', 'f3'].map((n) => topo.cells[sq(n)].shade).sort()).toEqual(['dark', 'light', 'mid'])
		for (const side of [0, 1]) {
			const pawns = w.sq.filter((s, id) => w.sd[id] === side && w.ty[id] === 'p')
			expect(new Set(pawns)).toEqual(PAWN_START[side])
		}
		// a new world on every call
		expect(V.setup()).not.toBe(w)
		expect(V.setup()).toEqual(w)
	})

	it('gives each side exactly 51 moves (C2)', () => {
		const w = V.setup()
		expect(keys(w, 0)).toEqual(list('b1-b2 b1-b3 c1-d2 c1-e3 c1-f4 c2-c3 c2-c4 d1-b2 d1-c3 d1-f4 d1-g2 d3-d4 d3-d5 e1-a5 e1-b4 e1-c3 e1-d2 e1-e2 e1-e3 e4-e5 e4-e6 f1-e2 f1-g2 f2-b6 f2-c5 f2-d4 f2-e3 f2-g3 f2-h4 f2-i5 f2-k6 f3-d2 f3-h2 f5-f6 g1-g2 g1-h2 g4-g5 g4-g6 h1-e2 h1-f4 h1-i3 h1-k2 h3-h4 h3-h5 i1-f4 i1-g3 i1-h2 i2-i3 i2-i4 k1-k2 k1-k3'))
		expect(generate(V, w, 1).size).toBe(51)
		// f5-f7 is blocked by Black's f7 pawn; nothing captures at the start
		expect([...generate(V, w, 0).values()].filter((m) => m.kind === 'double')).toHaveLength(8)
		const s = newGame(V)
		expect(legalMoves(V, s).filter((m) => m.type === 'move')).toHaveLength(51)
	})

	it('matches the reference perft: 2,587 / 138,057 pseudo-legal, 2,586 / 137,858 legal (C2)', () => {
		const w = V.setup()
		expect(perft(w, 0, 2, false)).toBe(2587)
		expect(perft(w, 0, 2, true)).toBe(2586)
		expect(perft(w, 0, 3, false)).toBe(138057)
		expect(perft(w, 0, 3, true)).toBe(137858)
	})
})

describe('hexagonal: piece movement', () => {
	it('moves every piece along the hexagonal lines on an empty board (C3)', () => {
		const alone = (n, piece) => world({ [n]: piece })
		expect(targets(alone('f6', '0:r'), 'f6')).toHaveLength(30)
		expect(targets(alone('f6', '0:b'), 'f6')).toEqual(list('b4 d2 d5 d8 e4 e7 g4 g7 h2 h5 h8 k4'))
		expect(targets(alone('f6', '0:n'), 'f6')).toEqual(list('c4 c5 d3 d7 e3 e8 g3 g8 h3 h7 i4 i5'))
		expect(targets(alone('f6', '0:k'), 'f6')).toEqual(list('d5 e4 e5 e6 e7 f5 f7 g4 g5 g6 g7 h5'))
		expect(targets(alone('f6', '0:q'), 'f6')).toHaveLength(42)
		expect(targets(alone('e1', '0:q'), 'e1')).toHaveLength(30)
		expect(targets(alone('f11', '1:k'), 'f11')).toEqual(['e10', 'e9', 'f10', 'g10', 'g9'])
		expect(targets(alone('a1', '0:n'), 'a1')).toEqual(['b4', 'c4', 'd2', 'd3'])
		expect(targets(alone('c1', '0:r'), 'c1'))
			.toEqual(list('a1 b1 c2 c3 c4 c5 c6 c7 c8 d1 d2 e1 e3 f1 f4 g4 h4 i4 k4 l4'))
		// with the default king on l1 (on the line f6-g5-h4-i3-k2-l1) the rook has 29 moves and the queen 41
		expect(targets(world({ ...K, f6: '0:r' }), 'f6')).toHaveLength(29)
		expect(targets(world({ ...K, f6: '0:q' }), 'f6')).toHaveLength(41)
	})

	it('has the empty-board mobility of the spec for every piece', () => {
		const want = { r: [20, 30, 2070], b: [10, 14, 1080], q: [30, 42, 3150], k: [5, 12, 900], n: [4, 12, 720] }
		for (const [ty, [min, max, total]] of Object.entries(want)) {
			const counts = topo.names.map((n) => generate(V, world({ [n]: '0:' + ty }), 0).size)
			expect([Math.min(...counts), Math.max(...counts), counts.reduce((a, c) => a + c, 0)], ty)
				.toEqual([min, max, total])
		}
	})

	it('moves pawns straight up and captures onto the forward edge neighbours only (C4)', () => {
		const knights = (side, list) => Object.fromEntries(list.split(' ').map((n) => [n, side + ':n']))
		const w = world({ ...K, f6: '0:p', ...knights(1, 'e6 g6 e7 g7 e5 g5 f7') })
		expect(keys(w, 0, 'f6')).toEqual(['f6-e6', 'f6-g6'])
		const b = world({ ...K, f6: '1:p', ...knights(0, 'e6 g6 e7 g7 e5 g5 f5') })
		expect(keys(b, 1, 'f6')).toEqual(['f6-e5', 'f6-g5'])
		// on an empty board a pawn only steps forward
		expect(keys(world({ ...K, f6: '0:p' }), 0, 'f6')).toEqual(['f6-f7'])
	})

	it('has no castling; the king steps one cell, diagonals included (C8)', () => {
		const w = world({ g1: '0:k', i1: '0:r', f11: '1:k' })
		expect(keys(w, 0, 'g1')).toEqual(['g1-e1', 'g1-f1', 'g1-f2', 'g1-f3', 'g1-g2', 'g1-h1', 'g1-h2'])
		expect(keys(w, 0).filter((k) => k.startsWith('O'))).toEqual([])
		expect(newGame(V).worlds[0].b.x.castle).toBeUndefined()
	})

	it('never blocks a diagonal step with the two cells beside it (C10)', () => {
		const w = world({ f6: '0:k', e5: '0:p', e6: '0:p', a1: '1:k' })
		expect(targets(w, 'f6')).toEqual(['d5', 'e4', 'e7', 'f5', 'f7', 'g4', 'g5', 'g6', 'g7', 'h5'])
		const b = world({ ...K, f3: '0:b', g2: '0:p', g3: '0:p' })
		expect(keys(b, 0, 'f3')).toEqual(expect.arrayContaining(['f3-h2', 'f3-k1']))
	})
})

describe('hexagonal: pawns', () => {
	it('lets a pawn double-step from any starting cell of its side, also after a capture (C5)', () => {
		let s = one({ ...K, e4: '0:p', f5: '1:n' })
		expect(keys(s.worlds[0].b, 0, 'e4')).toEqual(['e4-e5', 'e4-e6', 'e4-f5'])
		s = play(V, play(V, s, 'e4-f5'), 'f11-f10')
		expect(keys(s.worlds[0].b, 0, 'f5')).toEqual(['f5-f6', 'f5-f7'])
		// d4 is no starting cell
		s = play(V, play(V, one({ ...K, e4: '0:p', d4: '1:n' }), 'e4-d4'), 'f11-f10')
		expect(keys(s.worlds[0].b, 0, 'd4')).toEqual(['d4-d5'])
		// c2 is White's own starting cell of the c-file
		s = play(V, play(V, one({ ...K, b1: '0:p', c2: '1:n' }), 'b1-c2'), 'f11-f10')
		expect(keys(s.worlds[0].b, 0, 'c2')).toEqual(['c2-c3', 'c2-c4'])
		// a blocked pawn neither double-steps nor steps
		expect(keys(world({ ...K, c2: '0:p', c3: '1:n' }), 0, 'c2')).toEqual([])
		expect(keys(world({ ...K, c2: '0:p', c4: '1:n' }), 0, 'c2')).toEqual(['c2-c3'])
		// Black's starting cells are all on rank 7
		expect(keys(world({ ...K, d7: '1:p' }), 1, 'd7')).toEqual(['d7-d5', 'd7-d6'])
		expect(keys(world({ ...K, d6: '1:p' }), 1, 'd6')).toEqual(['d6-d5'])
	})

	it('captures en passant onto the skipped cell, on the next move only (C6)', () => {
		let s = play(V, one({ ...K, b5: '0:p', d6: '0:p', c7: '1:p' }, 1), 'c7-c5')
		expect(epOf(s)).toEqual(['c6/c5'])
		const ep = [...generate(V, s.worlds[0].b, 0).values()].filter((m) => m.kind === 'ep')
		expect(ep.map((m) => m.key).sort()).toEqual(['b5-c6', 'd6-c6'])
		for (const [code, left] of [['b5-c6', 'Kl1 Pc6 Pd6 kf11'], ['d6-c6', 'Kl1 Pb5 Pc6 kf11']]) {
			expect(outs(s, code)).toEqual(['capture 1'])
			const after = play(V, s, code)
			expect([pieces(after.worlds[0].b), epOf(after)]).toEqual([left, ['-']])
		}
		// White's double step: the Black pawn takes back towards the lower left
		s = play(V, one({ ...K, c2: '0:p', d4: '1:p' }), 'c2-c4')
		expect(epOf(s)).toEqual(['c3/c4'])
		expect(keys(s.worlds[0].b, 1, 'd4')).toEqual(['d4-c3', 'd4-d3'])
		expect(generate(V, s.worlds[0].b, 1).get('d4-c3').kind).toBe('ep')
		// only immediately
		s = play(V, one({ ...K, b5: '0:p', c7: '1:p' }, 1), 'c7-c5')
		expect(isLegal(V, s, 'b5-c6')).toBe(true)
		s = play(V, play(V, s, 'l1-l2'), 'f11-f10')
		expect(keys(s.worlds[0].b, 0, 'b5')).toEqual(['b5-b6'])
	})

	it('promotes at the end of every file, by a move or a capture (C7)', () => {
		const w = world({ ...K, g9: '0:p', f10: '1:n', h9: '1:n' })
		expect(keys(w, 0, 'g9')).toEqual(['g9-f10', ...promos('g9-g10'), ...promos('g9-h9')])
		const s = one({ ...K, g9: '0:p', f10: '1:n', h9: '1:n' })
		expect(isLegal(V, s, 'g9-g10')).toBe(false)
		expect(isLegal(V, s, 'g9-g10=k')).toBe(false)
		const b = world({ ...K, g2: '1:p', f2: '0:n', h1: '0:n' })
		expect(keys(b, 1, 'g2')).toEqual(['g2-f2', ...promos('g2-g1'), ...promos('g2-h1')])
		expect(keys(world({ ...K, a5: '0:p' }), 0, 'a5')).toEqual(promos('a5-a6'))
		expect(keys(world({ ...K, d8: '0:p', c8: '1:n' }), 0, 'd8')).toEqual([...promos('d8-c8'), ...promos('d8-d9')])
		// a promoted bishop takes the shade of its promotion cell
		const after = play(V, s, 'g9-h9=b')
		expect(pieces(after.worlds[0].b)).toBe('Bh9 Kl1 kf11 nf10')
		expect(topo.cells[sq('h9')].shade).toBe('light')
	})
})

describe('hexagonal: winning and drawing', () => {
	it('ends Gliński\'s fool\'s mate at once: every Black answer would lose the king (C9)', () => {
		let s = newGame(V)
		for (const code of ['e1-c3', 'e10-c6', 'b1-b2', 'b7-b6', 'f3-b1', 'e7-e6', 'c3-f9']) {
			expect(s.result, code).toBeNull()
			expect(outs(s, code), code).toEqual([(code === 'c3-f9' ? 'capture' : 'move') + ' 1'])
			s = play(V, s, code)
		}
		// the classic escape rule (handoff/LEAD-DECISIONS.md L1): Black's king cannot escape, so White wins at once
		expect(s.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		expect(resultText(V, s.result)).toBe('White wins (the king could not escape)')
		expect(royalSquares(V, s.worlds[0].b, 1).map((q) => topo.names[q])).toEqual(['g10'])
		expect(attacks(V, s.worlds[0].b, 0, sq('g10'))).toBe(true)
		const replies = [...generate(V, s.worlds[0].b, 1).values()]
		expect(replies).toHaveLength(64)
		for (const m of replies) {
			const next = applyClassical(V, s.worlds[0].b, m)
			expect(attacks(V, next, 0, royalSquares(V, next, 1)[0]), m.key).toBe(true)
		}
		// if Black could still move (the check runs after White's move only), White would take the king anyway
		const open = play(V, { ...s, result: null }, 'h9-f8')
		const take = legalMoves(V, open).find((m) => m.type === 'move' && m.to === sq('g10'))
		expect(outs(open, take.code)).toEqual(['capture 1'])
		expect(play(V, open, take.code).result).toEqual({ winner: 0, reason: 'king' })
	})

	it('ends a classical stalemate at once, in favour of the stalemating side (Q6)', () => {
		// reached by a move: the White king on f9 covers all five cells around the Black king on f11 (Gliński's
		// stalemate); the pawn on b1 keeps it from being a bare-kings draw
		for (const from of ['f8', 'g8']) {
			const stalemate = play(V, one({ [from]: '0:k', b1: '0:p', f11: '1:k' }), from + '-f9')
			expect(stalemate.result, from).toEqual({ winner: 0, reason: 'cannotEscape' })
		}
		// a spare pawn move is an escape: no stalemate, the game goes on
		const spare = play(V, one({ g8: '0:k', b1: '0:p', f11: '1:k', a5: '1:p' }), 'g8-f9')
		expect(spare.result).toBeNull()
		expect(legalMoves(V, spare).map((m) => m.code)).toContain('a5-a4')
		// hand-built with Black to move (the escape rule looks only at the state after a move): every king step walks
		// into capture, and White takes the king
		const s = one({ f9: '0:k', b1: '0:p', f11: '1:k' }, 1)
		expect(hasLegalMove(V, s)).toBe(true)
		const moves = legalMoves(V, s).map((m) => m.code).sort()
		expect(moves).toEqual(['f11-e10', 'f11-e9', 'f11-f10', 'f11-g10', 'f11-g9'])
		for (const code of moves) {
			expect(outs(s, code)).toEqual(['move 1'])
			const after = play(V, s, code)
			expect(after.result).toBeNull()
			const take = 'f9-' + code.slice(4)
			expect(outs(after, take)).toEqual(['capture 1'])
			expect(play(V, after, take).result).toEqual({ winner: 0, reason: 'king' })
		}
	})

	it('keeps a mated side in the game while one of its moves might capture the enemy king', () => {
		// Qd9-f10, guarded by the king on f9, leaves the Black king on f11 no escape
		const place = { f9: '0:k', d9: '0:q', b1: '0:p', f11: '1:k' }
		const mate = play(V, one({ ...place, a1: '1:q' }), 'd9-f10')
		expect(mate.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		// the same mate with a Black ghost queen 50% on f5, which attacks the White king up the f-file: no loss at once
		const s = S([[{ ...place, f5: '1:q' }, 1], [{ ...place, a1: '1:q' }, 1]])
		expect(outs(s, 'd9-f10')).toEqual(['move 1'])
		const after = play(V, s, 'd9-f10')
		expect(after.result).toBeNull()
		expect(outs(after, 'f5-f9')).toEqual(['miss 0.5 R', 'capture 0.5 R'])
		expect(applyOutcome(V, after, 'f5-f9', 1).result).toEqual({ winner: 1, reason: 'king' })
		// every other Black move lets White take the king
		const missed = applyOutcome(V, after, 'f5-f9', 0)
		expect(missed.result).toBeNull()
		expect(outs(missed, 'f10-f11')).toEqual(['capture 1'])
	})

	it('scores a side with no move at all as a loss (Q7)', () => {
		expect(V.noMoves({ turn: 1 })).toEqual({ winner: 0, reason: 'noMoves' })
		expect(V.noMoves({ turn: 0 })).toEqual({ winner: 1, reason: 'noMoves' })
		expect(V.reasonText).toBeUndefined()
		expect(resultText(V, V.noMoves({ turn: 1 }))).toBe('White wins (no legal move)')
		expect(resultText(V, { winner: null, reason: 'bareKings' })).toBe('Draw (only the two kings are left)')
	})

	it('draws bare kings by a roll, unless the side to move can take the king (Q11)', () => {
		let s = S([[{ f6: '0:k', f11: '1:k', g6: '1:n' }, 1], [{ f6: '0:k', f11: '1:k', a1: '1:n' }, 1]])
		expect(outs(s, 'f6-g6')).toEqual(['move 0.5 R', 'capture 0.5 R'])
		const moved = applyOutcome(V, s, 'f6-g6', 0)
		expect([moved.result, show(moved)]).toEqual([null, ['1.00 Kg6 kf11 na1']])
		expect(applyOutcome(V, s, 'f6-g6', 1).result).toEqual({ winner: null, reason: 'bareKings' })
		// Q11b: the draw waits while Black can take the White king next to it
		s = play(V, one({ f9: '0:k', f11: '1:k', f10: '1:n' }), 'f9-f10')
		expect(s.result).toBeNull()
		expect(play(V, s, 'f11-f10').result).toEqual({ winner: 1, reason: 'king' })
		// Q11c: king and knight against king is no draw
		s = S([
			[{ f6: '0:k', f11: '1:k', g6: '1:n', a6: '0:n' }, 1],
			[{ f6: '0:k', f11: '1:k', a1: '1:n', a6: '0:n' }, 1],
		])
		expect(applyOutcome(V, s, 'f6-g6', 1).result).toBeNull()
	})
})

describe('hexagonal: quantum rules', () => {
	it('links a rook that passes a ghost on a bent rank (Q1, pass = link)', () => {
		const s = S([[{ ...K, c1: '0:r', e3: '1:n' }, 1], [{ ...K, c1: '0:r', a6: '1:n' }, 1]])
		expect(outs(s, 'c1-h4')).toEqual(['move 1'])
		const n = play(V, s, 'c1-h4')
		expect(show(n)).toEqual(['0.50 Kl1 Rc1 kf11 ne3', '0.50 Kl1 Rh4 kf11 na6'])
		expect(budget(n, 0)).toBe(2)
	})

	it('lets a diagonal slide pass between two ghost cells without a link (Q2)', () => {
		const s = S([[{ ...K, f3: '0:b', g3: '1:n' }, 1], [{ ...K, f3: '0:b', g2: '1:n' }, 1]])
		expect(outs(s, 'f3-h2')).toEqual(['move 1'])
		const n = play(V, s, 'f3-h2')
		expect(show(n)).toEqual(['0.50 Bh2 Kl1 kf11 ng2', '0.50 Bh2 Kl1 kf11 ng3'])
		expect(budget(n, 0)).toBe(1)
		// the king's diagonal step between ghost cells is certain too; a step onto a ghost is rolled (Q9)
		const k = S([[{ f6: '0:k', f11: '1:k', g5: '1:n' }, 1], [{ f6: '0:k', f11: '1:k', g6: '1:n' }, 1]])
		expect(outs(k, 'f6-h5')).toEqual(['move 1'])
		expect(show(play(V, k, 'f6-h5'))).toEqual(['0.50 Kh5 kf11 ng5', '0.50 Kh5 kf11 ng6'])
		expect(outs(k, 'f6-g6')).toEqual(['move 0.5 R', 'capture 0.5 R'])
		expect(show(applyOutcome(V, k, 'f6-g6', 0))).toEqual(['1.00 Kg6 kf11 ng5'])
	})

	it('rolls a double step through a ghost, then allows en passant for certain (Q3, Q3b)', () => {
		const s = S([
			[{ ...K, c2: '0:p', d4: '1:p', c3: '1:n' }, 1],
			[{ ...K, c2: '0:p', d4: '1:p', a6: '1:n' }, 1],
		])
		expect(outs(s, 'c2-c4')).toEqual(['miss 0.5 R', 'move 0.5 R'])
		const missed = applyOutcome(V, s, 'c2-c4', 0)
		expect([show(missed), epOf(missed)]).toEqual([['1.00 Kl1 Pc2 kf11 nc3 pd4'], ['-']])
		const moved = applyOutcome(V, s, 'c2-c4', 1)
		expect([show(moved), epOf(moved)]).toEqual([['1.00 Kl1 Pc4 kf11 na6 pd4'], ['c3/c4']])
		expect(outs(moved, 'd4-c3')).toEqual(['capture 1'])
		const ep = play(V, moved, 'd4-c3')
		expect([show(ep), epOf(ep)]).toEqual([['1.00 Kl1 kf11 na6 pc3'], ['-']])
	})

	it('regains the double step by capturing onto a starting cell, in the captured outcome (Q4)', () => {
		const s = S([[{ ...K, e4: '0:p', f5: '1:b' }, 1], [{ ...K, e4: '0:p', h4: '1:b' }, 1]])
		expect(outs(s, 'e4-f5')).toEqual(['miss 0.5 R', 'capture 0.5 R'])
		const captured = play(V, applyOutcome(V, s, 'e4-f5', 1), 'f11-f10')
		expect(outs(captured, 'f5-f7')).toEqual(['move 1'])
		const missed = applyOutcome(V, s, 'e4-f5', 0)
		expect(show(missed)).toEqual(['1.00 Kl1 Pe4 bh4 kf11'])
		expect(outs(play(V, missed, 'f11-f10'), 'e4-e6')).toEqual(['move 1'])
	})

	it('promotes only where the pawn arrives; the new queen can split (Q5)', () => {
		const s = S([[{ ...K, d8: '0:p', d9: '1:n' }, 1], [{ ...K, d8: '0:p', h9: '1:n' }, 1]])
		expect(outs(s, 'd8-d9=q')).toEqual(['miss 0.5 R', 'move 0.5 R'])
		expect(show(applyOutcome(V, s, 'd8-d9=q', 0))).toEqual(['1.00 Kl1 Pd8 kf11 nd9'])
		const moved = applyOutcome(V, s, 'd8-d9=q', 1)
		expect(show(moved)).toEqual(['1.00 Kl1 Qd9 kf11 nh9'])
		expect(isLegal(V, s, 'd8-c8=q')).toBe(false)
		expect(isLegal(V, s, 'd8-d9')).toBe(false)
		const n = play(V, moved, 'f11-f10')
		expect(outs(n, 'd9-d5|d6')).toEqual(['split 1'])
		expect(show(play(V, n, 'd9-d5|d6'))).toEqual(['0.50 Kl1 Qd5 kf10 nh9', '0.50 Kl1 Qd6 kf10 nh9'])
	})

	it('ends the en passant right after one ply, also on Measure turns and links (Q8)', () => {
		// two independent ghosts: a White knight on h1 or k3, a Black knight on g9 or i7
		const base = S([
			[{ ...K, d3: '0:p', c4: '1:p', h1: '0:n', g9: '1:n' }, 1],
			[{ ...K, d3: '0:p', c4: '1:p', h1: '0:n', i7: '1:n' }, 1],
			[{ ...K, d3: '0:p', c4: '1:p', k3: '0:n', g9: '1:n' }, 1],
			[{ ...K, d3: '0:p', c4: '1:p', k3: '0:n', i7: '1:n' }, 1],
		])
		expect(outs(base, 'd3-d5')).toEqual(['move 1'])
		const s = play(V, base, 'd3-d5')
		expect(epOf(s)).toEqual(['d4/d5', 'd4/d5', 'd4/d5', 'd4/d5'])
		expect(outs(s, 'c4-d4')).toEqual(['capture 1'])
		for (let i = 0; i < 2; i++) {
			for (let j = 0; j < 2; j++) {
				const n = applyOutcome(V, applyOutcome(V, s, '?g9', i), '?h1', j)
				expect(n.worlds.every(({ b }) => b.x.ep === -1 && b.x.epVictim === -1)).toBe(true)
				expect(branches(V, n, 'c4-d4')).toBeNull()
			}
		}
		// Q8b: a knight move that happens in two worlds only (a link) ends it in all four
		expect(outs(s, 'g9-f7')).toEqual(['move 1'])
		expect(epOf(play(V, s, 'g9-f7'))).toEqual(['-', '-', '-', '-'])
	})

	it('settles a ghost queen\'s king capture by a roll without settling notes (Q10)', () => {
		const s = S([[{ ...K, f6: '0:q' }, 1], [{ ...K, b1: '0:q' }, 1]])
		expect(outs(s, 'f6-f11')).toEqual(['miss 0.5 R', 'capture 0.5 R'])
		expect(branches(V, s, 'f6-f11').map((b) => b.notes)).toEqual([[], []])
		expect(applyOutcome(V, s, 'f6-f11', 1).result).toEqual({ winner: 0, reason: 'king' })
		const missed = applyOutcome(V, s, 'f6-f11', 0)
		expect([missed.result, show(missed)]).toEqual([null, ['1.00 Kl1 Qb1 kf11']])
	})

	it('splits a central queen over 40 cells; the computer looks at a few (Q12)', () => {
		const s = one({ ...K, f6: '0:q' })
		expect(splitTargets(V, s, sq('f6'))).toHaveLength(40)
		expect(splitsFrom(V, s, sq('f6'))).toHaveLength(780)
		expect(outs(s, 'f6-a1|l6')).toEqual(['split 1'])
		const ai = aiSplits(V, s, sq('f6'), seededRng(1))
		expect(ai.length).toBeGreaterThan(0)
		expect(ai.length).toBeLessThanOrEqual(6)
		expect(ai.every((c) => isLegal(V, s, c))).toBe(true)
	})

	it('keeps a split bishop on its shade and merges it back without a roll (Q13)', () => {
		const s = one({ ...K, f3: '0:b' })
		const shades = new Set(splitTargets(V, s, sq('f3')).map((q) => topo.cells[q].shade))
		expect([...shades]).toEqual(['mid'])
		const n = play(V, s, 'f3-d2|h2')
		expect(show(n)).toEqual(['0.50 Bd2 Kl1 kf11', '0.50 Bh2 Kl1 kf11'])
		expect(budgetInfo(V, n, 0)).toEqual({ used: 2, limit: 8, sides: [0] })
		const back = play(V, n, 'f11-f10')
		expect(outs(back, 'd2|h2-f3')).toEqual(['move 1'])
		expect(play(V, back, 'd2|h2-f3').worlds).toHaveLength(1)
	})

	it('keeps the en passant cell the same in every world and the budget within its limit in random games', () => {
		for (const seed of [11, 12, 13]) {
			const rng = seededRng(seed)
			let s = newGame(V)
			for (let ply = 0; ply < 60 && !s.result; ply++) {
				let codes = legalMoves(V, s).map((m) => m.code)
				if (ply % 3 === 1) {
					// every third ply a split of a random splittable piece, when it has one
					const froms = new Set()
					for (const { b } of s.worlds) {
						b.sq.forEach((f, id) => {
							if (f >= 0 && b.sd[id] === s.turn && V.types[b.ty[id]].splittable) {
								froms.add(f)
							}
						})
					}
					const pool = [...froms]
					const f = pool[Math.floor(rng() * pool.length)]
					const splits = f === undefined ? [] : splitsFrom(V, s, f).map((m) => m.code)
					codes = splits.length ? splits : codes
				}
				s = applyMove(V, s, codes[Math.floor(rng() * codes.length)], rng).state
				const x = JSON.stringify(s.worlds[0].b.x)
				expect(s.worlds.every(({ b }) => JSON.stringify(b.x) === x)).toBe(true)
				const { ep, epVictim } = s.worlds[0].b.x
				if (ep >= 0) {
					// right after a double step: the skipped cell is empty and the victim an enemy pawn
					const last = s.history.at(-1)
					expect(last.to[0]).toBe(epVictim)
					expect(distance(last.from[0], last.to[0])).toBe(2)
					expect(s.worlds.every(({ b }) => b.board[ep] === -1 && b.ty[b.board[epVictim]] === 'p'
						&& b.sd[b.board[epVictim]] !== s.turn)).toBe(true)
				}
				for (const side of [0, 1]) {
					const info = budgetInfo(V, s, side)
					expect(info.used).toBeLessThanOrEqual(info.limit)
				}
			}
		}
	})
})

describe('hexagonal: declaration and computer player', () => {
	it('declares the catalogue category, names, glyphs, values and the rules card', () => {
		expect(V.id).toBe('hexagonal')
		expect(V.category).toBe(catalogEntry('hexagonal').category)
		expect(Object.keys(V.types).sort()).toEqual(['b', 'k', 'n', 'p', 'q', 'r'])
		expect(['k', 'q', 'r', 'b', 'n', 'p'].map((ty) => typeName(V, ty)))
			.toEqual(['King', 'Queen', 'Rook', 'Bishop', 'Knight', 'Pawn'])
		for (const ty of Object.keys(V.types)) {
			expect(glyphOf(V, ty, 0)).toMatchObject({ kind: 'sprite' })
		}
		expect(Object.fromEntries(Object.entries(V.types).map(([k, ty]) => [k, ty.value])))
			.toEqual({ k: 400, q: 950, r: 560, b: 330, n: 300, p: 100 })
		expect([...V.solidTypes].sort()).toEqual(['k', 'p'])
		expect(Object.keys(V.types).filter((ty) => V.types[ty].splittable).sort()).toEqual(['b', 'n', 'q', 'r'])
		const rules = V.rules()
		expect(rules.length).toBeGreaterThanOrEqual(3)
		expect(rules.length).toBeLessThanOrEqual(8)
		expect(rules.every((r) => typeof r === 'string' && r.length > 20)).toBe(true)
		// the classic end rules of the core, with no variant copy of the result (handoff/LEAD-DECISIONS.md L1); en
		// passant keeps the shared castling and en passant sentence (L2)
		expect([V.escapeRule, V.bareKingsDraw, V.drawsWait, V.specialMoves]).toEqual([true, true, true, true])
		expect(V.worldResult).toBeUndefined()
		// the card says what the escape rule means for stalemate and the bare-kings exception, no longer that a
		// stalemated king must move, and leaves the escape rule itself (with its exception) to the shared card
		expect(rules[7]).toContain('a king that cannot escape loses even when it is not attacked')
		expect(rules[7]).toContain('unless the player to move can capture the other king')
		expect(rules[7]).not.toContain('must still move')
		expect(rules[7]).not.toContain('for certain')
		expect(sharedRules(V).at(-1)).toContain('unless one of your moves could still capture the enemy king')
	})

	it('evaluates the start as even and rewards central minor pieces and advanced pawns', () => {
		const s = newGame(V)
		expect(evaluateState(V, s, 0)).toBe(0)
		expect(evaluateState(V, s, 1)).toBe(0)
		const base = { ...K, a1: '0:n', a6: '1:n' }
		expect(V.evaluate(world(base), 0)).toBe(0)
		expect(V.evaluate(world({ ...K, f6: '0:n', a6: '1:n' }), 0)).toBe(30)
		expect(V.evaluate(world({ ...K, g9: '0:p', b7: '1:p' }), 0)).toBe(48)
		expect(V.evaluate(world({ ...K, g9: '0:p', b7: '1:p' }), 1)).toBe(-48)
	})

	it('makes a legal move from the start at every level within its time budget', async () => {
		const s = newGame(V)
		for (const level of LEVELS) {
			const elapsed = stopwatch()
			const code = await chooseMove(V, s, { level: level.id, rng: seededRng(5) })
			expect(elapsed()).toBeLessThan(level.timeMs + 250)
			expect(isLegal(V, s, code)).toBe(true)
		}
		// and it takes a king that hangs
		const hang = one({ ...K, f6: '0:q', a6: '1:n' })
		expect(await chooseMove(V, hang, { level: 'easy', rng: seededRng(3), now: workClock() })).toBe('f6-f11')
	}, 30000)
})
