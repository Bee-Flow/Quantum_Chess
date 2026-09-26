/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Atomic chess (src/variants/atomic.js): the setup, the pieces, the explosion and its legality rules, the results,
 * and how explosions meet ghosts, rolls, links, the budget and the game-end roll. The cases T1-T28 and L1 are those
 * of handoff/research/atomic.md, section 7.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import atomic, { kingThreats } from '../../../src/variants/atomic.js'
import { catalogEntry } from '../../../src/variants/catalog.js'
import { chooseMove, LEVELS } from '../../../src/variants/core/ai.js'
import { castlingRights } from '../../../src/variants/core/orthodox.js'
import {
	applyMove,
	applyOutcome,
	branches,
	budgetInfo,
	isLegal,
	legalMoves,
	newGame,
	outcomes,
	ownPieceAt,
	pieceLocations,
	royalDanger,
	splitsFrom,
	T,
} from '../../../src/variants/core/quantum.js'
import { applyClassical, generate } from '../../../src/variants/core/world.js'
import { play, stateOf, stopwatch, workClock } from './helpers.js'

const V = atomic

/**
 * The square index of a square name.
 *
 * @param {string} name square name
 * @return {number}
 */
const sq = (name) => V.topology.byName(name)

/**
 * The name of a square index.
 *
 * @param {number} s square
 * @return {string}
 */
const N = (s) => V.topology.names[s]

/**
 * The pieces of a world, sorted: White in capitals (`Ke1 Pa2 ke8`).
 *
 * @param {object} b world
 * @return {string}
 */
function pieces(b) {
	const out = []
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sq[id] >= 0) {
			out.push((b.sd[id] === 0 ? b.ty[id].toUpperCase() : b.ty[id]) + N(b.sq[id]))
		}
	}
	return out.sort().join(' ')
}

/**
 * The worlds of a state with their chances: `0.5 {Ke1 ke8} ; 0.5 {...}`.
 *
 * @param {object} s state
 * @return {string}
 */
function worlds(s) {
	return s.worlds.map(({ b, w }) => +(w / T).toFixed(4) + ' {' + pieces(b) + '}').join(' ; ')
}

/**
 * The outcomes of a move as text: `miss 0.5 R | capture 0.5 R` (R: rolled; notes in brackets), or `ILLEGAL`.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {string}
 */
function outs(s, code) {
	const list = outcomes(V, s, code)
	if (!list) {
		return 'ILLEGAL'
	}
	return list.map((o) => o.key + (o.notes.length ? '[' + o.notes.join(';') + ']' : '') + ' '
		+ +o.p.toFixed(4) + (o.rolled ? ' R' : '')).join(' | ')
}

/**
 * The codes of the legal moves (ordinary moves, measurements, merges).
 *
 * @param {object} s state
 * @return {string[]}
 */
const codes = (s) => legalMoves(V, s).map((m) => m.code)

/**
 * The legal moves from one square.
 *
 * @param {object} s state
 * @param {string} from square name
 * @return {string[]}
 */
const movesFrom = (s, from) => codes(s).filter((c) => c.startsWith(from + '-')).sort()

/**
 * Play several moves, each with outcome `index`.
 *
 * @param {object} s state
 * @param {string[]} list move codes
 * @param {number} [index] outcome index
 * @return {object}
 */
function playAll(s, list, index = 0) {
	for (const code of list) {
		s = play(V, s, code, index)
	}
	return s
}

/**
 * The castling flags of a world (`KQkq`).
 *
 * @param {object} b world
 * @return {string}
 */
const flags = (b) => (b.x.castle ?? []).map((c) => c.flag).join('')

/**
 * Give a world the castling rights of its kings and rooks (for `stateOf`).
 *
 * @param {object} b world
 */
function withRights(b) {
	b.x = { ep: -1, epVictim: -1, castle: castlingRights(V, b) }
}

/**
 * The start position with some squares changed, as a placement for `stateOf`: `null` empties a square.
 *
 * @param {Record<string, string|null>} changes square name to `side:type` or null
 * @return {Record<string, string>}
 */
function startWith(changes) {
	const b = newGame(V).worlds[0].b
	const placement = {}
	for (let id = 0; id < b.sq.length; id++) {
		placement[N(b.sq[id])] = b.sd[id] + ':' + b.ty[id]
	}
	for (const [name, piece] of Object.entries(changes)) {
		if (piece) {
			placement[name] = piece
		} else {
			delete placement[name]
		}
	}
	return placement
}

/**
 * The position of T1 before 3. Nxf7 (1. Nf3 a6 2. Ne5 a5, White to move), built directly: in play the game already
 * ends after 2. Ne5, because Black's king cannot escape.
 *
 * @return {object}
 */
const beforeNxf7 = () => stateOf(V, [[startWith({ g1: null, e5: '0:n', a7: null, a5: '1:p' }), 1]], 0, withRights)

/**
 * The atomic king danger counted by brute force: over every enemy ordinary move (per move key) and every enemy merge,
 * the largest weight of the worlds in which it captures and leaves `side` without its king.
 *
 * @param {object} s state (no result)
 * @param {number} side the side in danger
 * @return {number}
 */
function bruteDanger(s, side) {
	const kingless = (b) => !b.ty.some((t, id) => t === 'k' && b.sd[id] === side && b.sq[id] >= 0)
	const acc = new Map()
	for (const { b, w } of s.worlds) {
		for (const m of generate(V, b, 1 - side).values()) {
			if (m.capture >= 0 && kingless(applyClassical(V, b, m))) {
				acc.set(m.key, (acc.get(m.key) ?? 0) + w)
			}
		}
	}
	let best = Math.max(0, ...acc.values())
	const enemy = { ...s, turn: 1 - side }
	for (const { code } of legalMoves(V, enemy)) {
		if (/^\w+\|\w+-/.test(code)) {
			let w = 0
			for (const br of branches(V, enemy, code)) {
				for (const e of br.worlds) {
					w += e.k === 'capture' && kingless(e.b) ? e.w : 0
				}
			}
			best = Math.max(best, w)
		}
	}
	return best / T
}

/**
 * The cheap atomic danger test: the largest weight of one enemy capture key whose target is on or next to the king.
 *
 * @param {object} s state
 * @param {number} side the side in danger
 * @return {number}
 */
function cheapDanger(s, side) {
	const acc = new Map()
	for (const { b, w } of s.worlds) {
		const k = b.sq.findIndex((x, id) => x >= 0 && b.sd[id] === side && b.ty[id] === 'k')
		if (k < 0) {
			continue
		}
		const [kf, kr] = V.topology.coords[b.sq[k]]
		for (const m of generate(V, b, 1 - side).values()) {
			const [f, r] = V.topology.coords[m.to]
			if (m.capture >= 0 && Math.abs(f - kf) <= 1 && Math.abs(r - kr) <= 1) {
				acc.set(m.key, (acc.get(m.key) ?? 0) + w)
			}
		}
	}
	return Math.max(0, ...acc.values()) / T
}

describe('atomic: declaration and setup', () => {
	it('is the catalogue entry with rules, names, glyphs and atomic piece values', () => {
		expect(V.id).toBe('atomic')
		expect(V.category).toBe(catalogEntry('atomic').category)
		const rules = V.rules()
		expect(rules.length).toBeGreaterThanOrEqual(3)
		expect(rules.length).toBeLessThanOrEqual(8)
		expect(rules.every((r) => typeof r === 'string' && r.length > 10)).toBe(true)
		for (const [type, value] of Object.entries({ k: 400, q: 780, r: 340, b: 180, n: 150, p: 100 })) {
			expect(V.types[type].name()).toMatch(/\w/)
			expect(V.types[type].glyph).toEqual({ sprite: type })
			expect(V.types[type].value).toBe(value)
		}
		expect([...V.royalTypes]).toEqual(['k'])
		expect([...V.solidTypes].sort()).toEqual(['k', 'p'])
		expect(V.reasonText('exploded')).toBe('a king was blown up')
		expect(V.reasonText('king')).toBeNull()
	})

	it('starts from the standard position with every castling right and 20 moves', () => {
		const s = newGame(V)
		const b = s.worlds[0].b
		const back = 'rnbqkbnr'
		const at = (name) => {
			const id = b.board[sq(name)]
			return id < 0 ? '.' : b.sd[id] + b.ty[id]
		}
		for (let f = 0; f < 8; f++) {
			const file = 'abcdefgh'[f]
			expect([at(file + '1'), at(file + '2'), at(file + '7'), at(file + '8')])
				.toEqual(['0' + back[f], '0p', '1p', '1' + back[f]])
			for (let r = 3; r <= 6; r++) {
				expect(at(file + r)).toBe('.')
			}
		}
		expect(flags(b)).toBe('KQkq')
		expect([b.x.ep, b.x.epVictim]).toEqual([-1, -1])
		expect(s.turn).toBe(0)
		expect(codes(s)).toHaveLength(20)
	})
})

describe('atomic: pieces', () => {
	const alone = (piece, extra = {}) => stateOf(V, [[{ a1: '0:k', h8: '1:k', d4: piece, ...extra }, 1]])

	it('moves the knight, bishop, rook and queen as in chess', () => {
		expect(movesFrom(alone('0:n'), 'd4')).toHaveLength(8)
		// the bishop cannot land on its own king on a1, and may capture the far enemy king on h8
		expect(movesFrom(alone('0:b'), 'd4')).toHaveLength(12)
		expect(movesFrom(alone('0:b'), 'd4')).toContain('d4-h8')
		expect(movesFrom(alone('0:r'), 'd4')).toHaveLength(14)
		expect(movesFrom(alone('0:q'), 'd4')).toHaveLength(26)
	})

	it('moves pawns as in chess: single and double steps, diagonal captures, both directions', () => {
		expect(movesFrom(stateOf(V, [[{ a1: '0:k', h8: '1:k', d2: '0:p' }, 1]]), 'd2')).toEqual(['d2-d3', 'd2-d4'])
		expect(movesFrom(alone('0:p', { c5: '1:n', e5: '1:b' }), 'd4')).toEqual(['d4-c5', 'd4-d5', 'd4-e5'])
		const black = stateOf(V, [[{ a1: '0:k', h8: '1:k', e7: '1:p', d6: '0:n' }, 1]], 1)
		expect(movesFrom(black, 'e7')).toEqual(['e7-d6', 'e7-e5', 'e7-e6'])
	})

	it('generates the classical move tree of Fairy-Stockfish nocheckatomic from the start (perft 1-4)', () => {
		/**
		 * The number of move sequences of a given length in one world; a finished game has none.
		 *
		 * @param {object} b world
		 * @param {number} side side to move
		 * @param {number} depth plies
		 * @return {number}
		 */
		const perft = (b, side, depth) => {
			if (V.worldResult(b)) {
				return 0
			}
			let n = 0
			for (const m of generate(V, b, side).values()) {
				n += depth === 1 ? 1 : perft(applyClassical(V, b, m), 1 - side, depth - 1)
			}
			return n
		}
		// lichess atomic gives 197326 at depth 4: it forbids moves that leave the king in check
		const b = newGame(V).worlds[0].b
		expect([1, 2, 3, 4].map((d) => perft(b, 0, d))).toEqual([20, 400, 8902, 197779])
		// r3k2r/1P4p1/8/2Pp4/8/5n2/P5PP/R3K2R w KQkq d6: castling both ways, en passant, promotions (one capturing),
		// a knight on the king and blasts next to both kings; Fairy-Stockfish nocheckatomic gives the same counts once
		// its captures next to the mover's own king are left out (they are illegal here, as on lichess and the ICC)
		const tactical = stateOf(V, [[{
			a8: '1:r',
			e8: '1:k',
			h8: '1:r',
			g7: '1:p',
			d5: '1:p',
			f3: '1:n',
			b7: '0:p',
			c5: '0:p',
			a2: '0:p',
			g2: '0:p',
			h2: '0:p',
			a1: '0:r',
			e1: '0:k',
			h1: '0:r',
		}, 1]], 0, (w) => {
			w.x = { ep: sq('d6'), epVictim: sq('d5'), castle: castlingRights(V, w) }
		}).worlds[0].b
		expect(flags(tactical)).toBe('KQkq')
		expect([1, 2, 3].map((d) => perft(tactical, 0, d))).toEqual([29, 948, 24336])
	})

	it('never lets a king capture; a king step onto a ghost rolls (T5)', () => {
		expect(movesFrom(stateOf(V, [[{ a1: '0:k', h8: '1:k', b2: '1:r' }, 1]]), 'a1')).toEqual(['a1-a2', 'a1-b1'])
		const s = stateOf(V, [[{ e1: '0:k', e2: '1:r', e8: '1:k' }, 1]])
		expect(movesFrom(s, 'e1')).toEqual(['e1-d1', 'e1-d2', 'e1-f1', 'e1-f2'])
		const g = stateOf(V, [
			[{ e1: '0:k', e2: '1:n', e8: '1:k' }, 1],
			[{ e1: '0:k', c3: '1:n', e8: '1:k' }, 1],
		])
		expect(outs(g, 'e1-e2')).toBe('miss 0.5 R | move 0.5 R')
	})
})

describe('atomic: the explosion', () => {
	it('blows up the king with 3. Nxf7 (T1)', () => {
		let s = beforeNxf7()
		expect(flags(s.worlds[0].b)).toBe('KQkq')
		expect(outs(s, 'e5-f7')).toBe('capture 1')
		s = play(V, s, 'e5-f7')
		const b = s.worlds[0].b
		expect(['e8', 'f8', 'g8', 'f7'].map((n) => b.board[sq(n)])).toEqual([-1, -1, -1, -1])
		expect(['e7', 'g7', 'd8'].map((n) => b.ty[b.board[sq(n)]])).toEqual(['p', 'p', 'q'])
		expect(pieces(b)).not.toContain('Ne5')
		expect(s.result).toEqual({ winner: 0, reason: 'exploded' })
		expect(legalMoves(V, s)).toEqual([])
	})

	it('removes the pieces around the capturer too, whoever they belong to (T2)', () => {
		let s = playAll(newGame(V), ['e2-e4', 'd7-d5', 'g1-f3', 'd5-e4'])
		expect(['f3', 'd5', 'e4'].map((n) => s.worlds[0].b.board[sq(n)])).toEqual([-1, -1, -1])
		s = play(V, s, 'f1-b5')
		expect(outs(s, 'd8-d2')).toBe('capture 1')
		s = play(V, s, 'd8-d2')
		const b = s.worlds[0].b
		expect(['e1', 'd1', 'c1', 'd2', 'd8'].map((n) => b.board[sq(n)])).toEqual([-1, -1, -1, -1, -1])
		expect(['b1', 'c2'].map((n) => b.ty[b.board[sq(n)]])).toEqual(['n', 'p'])
		expect(s.result).toEqual({ winner: 1, reason: 'exploded' })
	})

	it('clears a full blast area, and only the two kings left is a draw (T3)', () => {
		const base = {
			a8: '1:k',
			d7: '1:b',
			e7: '1:b',
			f7: '1:n',
			d6: '1:r',
			e6: '1:q',
			f6: '1:n',
			d5: '1:q',
			e5: '1:r',
			h3: '0:b',
			b1: '0:k',
		}
		const s = stateOf(V, [[{ ...base, a2: '0:p' }, 1]])
		expect(outs(s, 'h3-e6')).toBe('capture 1')
		const after = play(V, s, 'h3-e6')
		expect(worlds(after)).toBe('1 {Kb1 Pa2 ka8}')
		expect(after.result).toBeNull()
		expect(play(V, stateOf(V, [[base, 1]]), 'h3-e6').result).toEqual({ winner: null, reason: 'bareKings' })
	})

	it('spares pawns next to the blast, and a blown-up rook takes its castling right along (T4, T9)', () => {
		let s = playAll(newGame(V), ['b2-b3', 'a7-a6', 'c1-b2', 'g7-g6'])
		expect(outs(s, 'b2-h8')).toBe('capture 1')
		s = play(V, s, 'b2-h8')
		const b = s.worlds[0].b
		expect(['h8', 'g8'].map((n) => b.board[sq(n)])).toEqual([-1, -1])
		expect(['h7', 'g6', 'f8'].map((n) => b.ty[b.board[sq(n)]])).toEqual(['p', 'p', 'b'])
		expect(flags(b)).toBe('KQq')
		let t = stateOf(V, [[{ e1: '0:k', a1: '0:r', h1: '0:r', a2: '0:p', e8: '1:k', a8: '1:r' }, 1]], 1, withRights)
		expect(flags(t.worlds[0].b)).toBe('KQq')
		expect(outs(t, 'a8-a2')).toBe('capture 1')
		t = play(V, t, 'a8-a2')
		expect(worlds(t)).toBe('1 {Ke1 Rh1 ke8}')
		expect(flags(t.worlds[0].b)).toBe('K')
		expect(codes(t).filter((c) => c.startsWith('O'))).toEqual(['O-O'])
	})

	it('explodes a capturing promotion at once (T10)', () => {
		const s = stateOf(V, [[{ a1: '0:k', g7: '0:p', h8: '1:r', g8: '1:k' }, 1]])
		expect(movesFrom(s, 'g7')).toEqual(['g7-h8=b', 'g7-h8=n', 'g7-h8=q', 'g7-h8=r'])
		expect(outs(s, 'g7-h8=q')).toBe('capture 1')
		expect(play(V, s, 'g7-h8=q').result).toEqual({ winner: 0, reason: 'exploded' })
		const t = play(V, stateOf(V, [[{ a1: '0:k', g7: '0:p', h8: '1:r', e8: '1:k', f8: '1:b' }, 1]]), 'g7-h8=q')
		expect(worlds(t)).toBe('1 {Ka1 bf8 ke8}')
		expect(t.result).toBeNull()
	})
})

describe('atomic: special rules', () => {
	it('forbids a capture next to your own king (T6)', () => {
		const s = stateOf(V, [[{ g1: '0:k', a2: '0:r', f2: '1:n', e8: '1:k' }, 1]])
		expect([isLegal(V, s, 'a2-f2'), isLegal(V, s, 'a2-e2')]).toEqual([false, true])
	})

	it('keeps touching kings safe from direct capture, but not from the side (T7)', () => {
		const a = stateOf(V, [[{ e4: '0:k', a2: '0:p', f5: '1:k', a4: '1:r' }, 1]], 1)
		expect(isLegal(V, a, 'a4-e4')).toBe(false)
		expect(royalDanger(V, a, 0)).toBe(0)
		const b = stateOf(V, [[{ e3: '0:k', a2: '0:p', f5: '1:k', a3: '1:r' }, 1]], 1)
		expect(outs(b, 'a3-e3')).toBe('capture 1')
		expect(play(V, b, 'a3-e3').result).toEqual({ winner: 1, reason: 'exploded' })
		const c = stateOf(V, [[{ e4: '0:k', d3: '0:p', f5: '1:k', a3: '1:r', h7: '1:p' }, 1]], 1)
		expect(royalDanger(V, c, 0)).toBe(1)
		expect(outs(c, 'a3-d3')).toBe('capture 1')
		const after = play(V, c, 'a3-d3')
		expect(worlds(after)).toBe('1 {kf5 ph7}')
		expect(after.result).toEqual({ winner: 1, reason: 'exploded' })
	})

	it('centres the en passant blast on the square the pawn lands on (T8, T19)', () => {
		let s = stateOf(V, [[{
			e1: '0:k',
			e5: '0:p',
			e8: '1:k',
			d7: '1:p',
			c7: '1:n',
			c6: '1:p',
			e6: '1:q',
			f7: '1:b',
			a8: '1:r',
		}, 1]], 1)
		s = play(V, s, 'd7-d5')
		expect(outs(s, 'e5-d6')).toBe('capture 1')
		s = play(V, s, 'e5-d6')
		expect(worlds(s)).toBe('1 {Ke1 bf7 ke8 pc6 ra8}')
		expect(s.history.at(-1).captures.map(N)).toEqual(['d6'])
		let t = stateOf(V, [[{ e1: '0:k', e5: '0:p', e8: '1:k', d7: '1:p', c4: '1:n', e7: '1:b', c6: '1:r' }, 1]], 1)
		t = play(V, t, 'd7-d5')
		expect(N(t.worlds[0].b.x.ep)).toBe('d6')
		t = play(V, t, 'e5-d6')
		expect(worlds(t)).toBe('1 {Ke1 ke8 nc4}')
		// no en passant next to your own king
		const u = play(V, stateOf(V, [[{ e6: '0:k', e5: '0:p', h8: '1:k', d7: '1:p', a7: '1:p' }, 1]], 1), 'd7-d5')
		expect(codes(u).sort()).toEqual(['e6-d6', 'e6-d7', 'e6-e7', 'e6-f5', 'e6-f6', 'e6-f7'])
		expect(isLegal(V, u, 'e5-d6')).toBe(false)
		// but a king next to the captured pawn only (e4 touches d5, not d6) is safe: the blast is centred on d6
		let v = stateOf(V, [[{ e4: '0:k', e5: '0:p', h8: '1:k', d7: '1:p', c6: '1:n', a7: '1:p' }, 1]], 1)
		v = play(V, v, 'd7-d5')
		expect(outs(v, 'e5-d6')).toBe('capture 1')
		v = play(V, v, 'e5-d6')
		expect(worlds(v)).toBe('1 {Ke4 kh8 pa7}')
		expect(v.result).toBeNull()
	})

	it('counts a blow-up of the king as king danger (T15)', () => {
		const a = stateOf(V, [[{ e1: '0:k', d2: '0:p', a5: '1:q', e8: '1:k' }, 1]], 1)
		expect(royalDanger(V, a, 0)).toBe(1)
		expect(play(V, a, 'a5-d2').result).toEqual({ winner: 1, reason: 'exploded' })
		// the game is over after 2. Ne5 (T1), so the danger is read on the same position without the result
		const c = playAll(newGame(V), ['g1-f3', 'a7-a6', 'f3-e5'])
		expect(c.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		expect(royalDanger(V, c, 1)).toBe(0)
		expect(royalDanger(V, { ...c, result: null }, 1)).toBe(1)
		expect(royalDanger(V, { ...c, result: null }, 0)).toBe(0)
	})
})

describe('atomic: how the game ends', () => {
	it('has no stalemate: a king whose every move walks into the blast cannot escape (T17)', () => {
		const s = play(V, stateOf(V, [[{ f1: '0:k', b6: '0:r', a8: '1:k' }, 1]]), 'b6-b7')
		// lichess calls this stalemate; here both king moves lose for certain, so White wins at once
		expect(s.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		expect(V.reasonText('cannotEscape')).toBeNull()
		const open = { ...s, result: null }
		expect(codes(open).sort()).toEqual(['a8-a7', 'a8-b8'])
		for (const [king, rook] of [['a8-a7', 'b7-a7'], ['a8-b8', 'b7-b8']]) {
			const t = play(V, open, king)
			expect(t.result).toBeNull()
			expect(outs(t, rook)).toBe('capture 1')
			expect(play(V, t, rook).result).toEqual({ winner: 0, reason: 'exploded' })
		}
	})

	it('ends 2. Ne5 at once: every reply of Black lets the king be blown up (T1)', () => {
		expect(V.escapeRule).toBe(true)
		const c = playAll(newGame(V), ['g1-f3', 'a7-a6', 'f3-e5'])
		expect(c.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		expect(legalMoves(V, c)).toEqual([])
		const open = { ...c, result: null }
		const replies = legalMoves(V, open, { splits: true }).map((m) => m.code)
		expect(replies).toHaveLength(19)
		for (const code of replies) {
			outcomes(V, open, code).forEach((o, i) => {
				const next = applyOutcome(V, open, code, i)
				expect(next.result, code).toBeNull()
				expect(royalDanger(V, next, 1), code).toBe(1)
			})
		}
	})

	it('goes on while the king in danger has a way out (the escape rule)', () => {
		// 2. Ne5 threatens Nxd7 as before, but f6xe5 blows the knight up
		const s = playAll(newGame(V), ['g1-f3', 'f7-f6', 'f3-e5'])
		expect(s.result).toBeNull()
		expect(royalDanger(V, s, 1)).toBe(1)
		expect(outs(s, 'f6-e5')).toBe('capture 1')
		expect(royalDanger(V, play(V, s, 'f6-e5'), 1)).toBe(0)
		// T17 with a ghost rook (b6 or b5): a8-a7 leaves the king in danger only in half of the possibilities
		const q = play(V, stateOf(V, [
			[{ f1: '0:k', b6: '0:r', a8: '1:k' }, 1],
			[{ f1: '0:k', b5: '0:r', a8: '1:k' }, 1],
		]), 'b6-b7')
		expect(q.result).toBeNull()
		expect(codes(q).sort()).toEqual(['a8-a7', 'a8-b7', 'a8-b8'])
		expect(royalDanger(V, play(V, q, 'a8-a7'), 1)).toBe(0.5)
		expect(royalDanger(V, play(V, q, 'a8-b8'), 1)).toBe(1)
	})

	it('waits while the king in danger might still blow up the enemy king (the escape rule)', () => {
		// 2. Ne5 as in T1, but Black's queen on h4 may take f2 next to e1: a white knight is 50 % g3 (in the way) and
		// 50 % a3
		const at = (ghost) => startWith({
			g1: null,
			b1: null,
			a7: null,
			d8: null,
			f3: '0:n',
			a6: '1:p',
			h4: '1:q',
			[ghost]: '0:n',
		})
		const s = play(V, stateOf(V, [[at('g3'), 1], [at('a3'), 1]], 0, withRights), 'f3-e5')
		expect(s.result).toBeNull()
		expect(royalDanger(V, s, 1)).toBe(1)
		expect(outs(s, 'h4-f2')).toBe('miss 0.5 R | capture 0.5 R')
		expect(applyOutcome(V, s, 'h4-f2', 1).result).toEqual({ winner: 1, reason: 'exploded' })
		// with the knight surely on g3 no move of Black can reach White's king: the king cannot escape
		const sure = play(V, stateOf(V, [[at('g3'), 1]], 0, withRights), 'f3-e5')
		expect(sure.result).toEqual({ winner: 0, reason: 'cannotEscape' })
	})

	it('draws when the side to move has no legal move, even at 100 % danger (T27)', () => {
		const s = stateOf(V, [[{ a1: '0:k', b2: '1:q', a2: '1:b', c3: '1:n', h8: '1:k' }, 1]], 1)
		expect(outs(s, 'c3-b1')).toBe('move 1')
		const t = play(V, s, 'c3-b1')
		expect(t.result).toEqual({ winner: null, reason: 'noMoves' })
		expect(royalDanger(V, { ...t, result: null }, 0)).toBe(1)
	})

	it('keeps the classic end rules, with its own bare-kings draw (LEAD-DECISIONS L1)', () => {
		// the core's bare-kings draw is off: atomic decides it in each possibility (the game-end roll of T14)
		expect([V.escapeRule, V.bareKingsDraw, V.drawsWait]).toEqual([true, false, true])
		// the 50-move draw waits while Black can blow up White's king for certain (a5xd2 next to e1)
		const place = { e1: '0:k', d2: '0:p', a1: '0:r', a5: '1:q', e8: '1:k', h7: '1:p' }
		const t = play(V, { ...stateOf(V, [[place, 1]]), quiet: 99 }, 'a1-a2')
		expect([t.quiet, t.result, royalDanger(V, t, 0)]).toEqual([100, null, 1])
		expect(play(V, t, 'a5-d2').result).toEqual({ winner: 1, reason: 'exploded' })
		expect(play(V, t, 'e8-f8').result).toEqual({ winner: null, reason: 'quiet' })
		// without the certain blow-up the draw comes at once
		const calm = stateOf(V, [[{ e1: '0:k', d2: '0:p', a1: '0:r', a6: '1:q', e8: '1:k', h7: '1:p' }, 1]])
		calm.quiet = 99
		expect(play(V, calm, 'a1-a2').result).toEqual({ winner: null, reason: 'quiet' })
		// only the two kings in every possibility: atomic's own draw, once
		const bare = play(V, stateOf(V, [[{ h1: '0:k', e2: '0:r', a8: '1:k', e5: '1:b' }, 1]]), 'e2-e5')
		expect(bare.result).toEqual({ winner: null, reason: 'bareKings' })
	})

	it('counts 50 moves only for moves that happened (T25)', () => {
		const pawn = {
			...stateOf(V, [
				[{ e1: '0:k', e2: '0:p', e8: '1:k', e3: '1:n' }, 1],
				[{ e1: '0:k', e2: '0:p', e8: '1:k', a6: '1:n' }, 1],
			]),
			quiet: 10,
		}
		expect(outs(pawn, 'e2-e3')).toBe('miss 0.5 R | move 0.5 R')
		expect([applyOutcome(V, pawn, 'e2-e3', 0).quiet, applyOutcome(V, pawn, 'e2-e3', 1).quiet]).toEqual([11, 0])
		const capture = { ...stateOf(V, [[{ e1: '0:k', a1: '0:r', e8: '1:k', a6: '1:n' }, 1]]), quiet: 10 }
		expect(play(V, capture, 'a1-a6').quiet).toBe(0)
	})
})

describe('atomic: quantum interactions', () => {
	it('lands on a ghost with a roll, and only the Captured result explodes (T13 b, T21)', () => {
		const g = stateOf(V, [
			[{ a1: '0:k', a2: '0:p', b2: '0:b', e5: '1:n', f6: '1:r', h8: '1:k', h7: '1:p' }, 1],
			[{ a1: '0:k', a2: '0:p', b2: '0:b', a6: '1:n', f6: '1:r', h8: '1:k', h7: '1:p' }, 1],
		])
		expect(outs(g, 'b2-e5')).toBe('move 0.5 R | capture 0.5 R')
		expect(worlds(applyOutcome(V, g, 'b2-e5', 0))).toBe('1 {Be5 Ka1 Pa2 kh8 na6 ph7 rf6}')
		expect(worlds(applyOutcome(V, g, 'b2-e5', 1))).toBe('1 {Ka1 Pa2 kh8 ph7}')
		// a ghost bishop attacks a ghost knight next to the king
		const s = stateOf(V, [
			[{ e1: '0:k', a2: '0:p', c4: '0:b', e8: '1:k', a7: '1:p', f7: '1:n' }, 1],
			[{ e1: '0:k', a2: '0:p', c4: '0:b', e8: '1:k', a7: '1:p', a6: '1:n' }, 1],
			[{ e1: '0:k', a2: '0:p', h3: '0:b', e8: '1:k', a7: '1:p', f7: '1:n' }, 1],
			[{ e1: '0:k', a2: '0:p', h3: '0:b', e8: '1:k', a7: '1:p', a6: '1:n' }, 1],
		])
		expect(royalDanger(V, s, 1)).toBe(0.25)
		expect(outs(s, 'c4-f7')).toBe('miss 0.5 R | move 0.25 R | capture 0.25 R')
		expect(worlds(applyOutcome(V, s, 'c4-f7', 0)))
			.toBe('0.5 {Bh3 Ke1 Pa2 ke8 nf7 pa7} ; 0.5 {Bh3 Ke1 Pa2 ke8 na6 pa7}')
		expect(applyOutcome(V, s, 'c4-f7', 1).result).toBeNull()
		const captured = applyOutcome(V, s, 'c4-f7', 2)
		expect(worlds(captured)).toBe('1 {Ke1 Pa2 pa7}')
		expect(captured.result).toEqual({ winner: 0, reason: 'exploded' })
	})

	it('rolls a capture next to your own king between Moved and Missed (T6 b)', () => {
		const s = stateOf(V, [
			[{ g1: '0:k', a2: '0:r', f2: '1:n', e8: '1:k' }, 1],
			[{ g1: '0:k', a2: '0:r', c5: '1:n', e8: '1:k' }, 1],
		])
		expect(outs(s, 'a2-f2')).toBe('miss 0.5 R | move 0.5 R')
		expect(worlds(applyOutcome(V, s, 'a2-f2', 0))).toBe('1 {Kg1 Ra2 ke8 nf2}')
		expect(worlds(applyOutcome(V, s, 'a2-f2', 1))).toBe('1 {Kg1 Rf2 ke8 nc5}')
	})

	it('destroys a split ghost only where it stood; Measure can find it gone (split, T12)', () => {
		let s = stateOf(V, [[{ a1: '0:k', a2: '0:p', e1: '0:r', e5: '1:p', h8: '1:k', h7: '1:p', g8: '1:n' }, 1]], 1)
		s = play(V, s, 'g8-f6|h6')
		expect(budgetInfo(V, s, 1).used).toBe(2)
		expect(outs(s, 'e1-e5')).toBe('capture 1')
		s = play(V, s, 'e1-e5')
		expect(worlds(s)).toBe('0.5 {Ka1 Pa2 kh8 ph7} ; 0.5 {Ka1 Pa2 kh8 nh6 ph7}')
		const knight = s.worlds[1].b.board[sq('h6')]
		expect(pieceLocations(s, knight).map((l) => [l.sq < 0 ? 'off' : N(l.sq), l.p]))
			.toEqual([['off', 0.5], ['h6', 0.5]])
		expect([budgetInfo(V, s, 1).used, budgetInfo(V, s, 0).used]).toEqual([2, 1])
		expect(outs(s, '?h6')).toBe('gone 0.5 R | h6 0.5 R')
		// only one part is on the board, so there is nothing to merge
		expect(codes(s).sort())
			.toEqual(['?h6', 'h6-f5', 'h6-f7', 'h6-g4', 'h6-g8', 'h7-h5', 'h7-h6', 'h8-g7', 'h8-g8'])
		expect(outs(s, 'h6-f5')).toBe('move 1')
	})

	it('destroys your own ghost in your own blast, and the opponent loses budget (T13 a, T23)', () => {
		const own = stateOf(V, [
			[{ a1: '0:k', a2: '0:p', e1: '0:r', d4: '0:n', e5: '1:p', h8: '1:k', h7: '1:p' }, 1],
			[{ a1: '0:k', a2: '0:p', e1: '0:r', h4: '0:n', e5: '1:p', h8: '1:k', h7: '1:p' }, 1],
		])
		expect(outs(own, 'e1-e5')).toBe('capture 1')
		const t = play(V, own, 'e1-e5')
		expect(worlds(t)).toBe('0.5 {Ka1 Pa2 kh8 ph7} ; 0.5 {Ka1 Nh4 Pa2 kh8 ph7}')
		expect(budgetInfo(V, t, 0).used).toBe(2)
		const enemy = stateOf(V, [
			[{ a1: '0:k', a2: '0:p', e1: '0:r', e5: '1:p', h8: '1:k', h7: '1:p', d6: '1:n' }, 1],
			[{ a1: '0:k', a2: '0:p', e1: '0:r', e5: '1:p', h8: '1:k', h7: '1:p', f6: '1:n' }, 1],
		])
		expect(budgetInfo(V, enemy, 1).used).toBe(2)
		const u = play(V, enemy, 'e1-e5')
		expect(worlds(u)).toBe('1 {Ka1 Pa2 kh8 ph7}')
		expect(budgetInfo(V, u, 1).used).toBe(1)
	})

	it('counts "destroyed" as one of the four places of a piece (T22)', () => {
		const base = { e1: '0:k', a2: '0:p', h8: '1:k', h7: '1:p' }
		// weights 2 : 1 : 1 : 2; the first world has no knight at all (destroyed)
		const s = stateOf(V, [
			[base, 2],
			[{ ...base, d4: '1:n' }, 1],
			[{ ...base, e3: '1:n' }, 1],
			[{ ...base, g4: '1:n' }, 2],
		], 1)
		expect(budgetInfo(V, s, 1).used).toBe(4)
		expect(outs(s, 'g4-f6|h6')).toBe('ILLEGAL')
		expect(splitsFrom(V, s, sq('g4'))).toEqual([])
		const three = stateOf(V, [[base, 1], [{ ...base, e3: '1:n' }, 1], [{ ...base, g4: '1:n' }, 1]], 1)
		expect(outs(three, 'g4-f6|h6')).toBe('split 1')
	})

	it('links a slide past a ghost (pass = link) without an explosion (T25)', () => {
		const s = {
			...stateOf(V, [
				[{ e1: '0:k', a1: '0:r', e8: '1:k', a4: '1:n' }, 1],
				[{ e1: '0:k', a1: '0:r', e8: '1:k', c6: '1:n' }, 1],
			]),
			quiet: 10,
		}
		expect(outs(s, 'a1-a6')).toBe('move 1')
		const t = play(V, s, 'a1-a6')
		expect(worlds(t)).toBe('0.5 {Ke1 Ra6 ke8 nc6} ; 0.5 {Ke1 Ra1 ke8 na4}')
		expect(t.history.at(-1).captures).toEqual([])
		expect(t.quiet).toBe(11)
	})

	it('a slide blocked by a ghost captures and explodes only where the path was clear (T16)', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', a1: '0:r', a8: '1:r', b8: '1:n', h8: '1:k', h7: '1:p', a4: '1:b' }, 1],
			[{ e1: '0:k', a1: '0:r', a8: '1:r', b8: '1:n', h8: '1:k', h7: '1:p', d4: '1:b' }, 1],
		])
		expect(outs(s, 'a1-a8')).toBe('miss 0.5 R | capture 0.5 R')
		expect(worlds(applyOutcome(V, s, 'a1-a8', 1))).toBe('1 {Ke1 bd4 kh8 ph7}')
	})

	it('wins for certain with a converging capture next to the king (T11, T24)', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', d5: '0:n', e7: '1:k', f6: '1:b' }, 1],
			[{ e1: '0:k', h5: '0:n', e7: '1:k', f6: '1:b' }, 1],
		])
		expect(codes(s)).toEqual(expect.arrayContaining(['d5|h5-f6', 'd5|h5-f4']))
		expect(outs(s, 'd5|h5-f6')).toBe('capture 1')
		expect(play(V, s, 'd5|h5-f6').result).toEqual({ winner: 0, reason: 'exploded' })
		expect(outs(s, 'd5-f6')).toBe('miss 0.5 R | capture 0.5 R')
		// the merge counts with every world in which one of its parts captures (handoff/research/atomic.md 3.1)
		expect(royalDanger(V, s, 1)).toBe(1)
		expect(royalDanger(V, { ...s, turn: 1 }, 1)).toBe(1)
		expect(bruteDanger(s, 1)).toBe(1)
		const third = stateOf(V, [
			[{ e1: '0:k', d5: '0:n', e7: '1:k', f6: '1:b' }, 1],
			[{ e1: '0:k', h5: '0:n', e7: '1:k', f6: '1:b' }, 1],
			[{ e1: '0:k', a1: '0:n', e7: '1:k', f6: '1:b' }, 1],
		])
		expect(outs(third, 'd5|h5-f6')).toBe('miss 0.3333 R | capture 0.6667 R')
		expect(royalDanger(V, third, 1)).toBeCloseTo(2 / 3, 6)
		expect(bruteDanger(third, 1)).toBeCloseTo(2 / 3, 6)
		expect(worlds(applyOutcome(V, third, 'd5|h5-f6', 0))).toBe('1 {Ke1 Na1 bf6 ke7}')
		expect(applyOutcome(V, third, 'd5|h5-f6', 1).result).toEqual({ winner: 0, reason: 'exploded' })
		// a merge onto the king itself is counted already
		const onKing = stateOf(V, [
			[{ e1: '0:k', d5: '0:n', f6: '1:k', a8: '1:b' }, 1],
			[{ e1: '0:k', h5: '0:n', f6: '1:k', a8: '1:b' }, 1],
		])
		expect(royalDanger(V, onKing, 1)).toBe(1)
	})

	it('rolls a merge onto a square next to your own king between Moved and Missed (T20)', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', b3: '0:n', h8: '1:k', h7: '1:p', d2: '1:b' }, 1],
			[{ e1: '0:k', b3: '0:n', h8: '1:k', h7: '1:p', a5: '1:b' }, 1],
			[{ e1: '0:k', f3: '0:n', h8: '1:k', h7: '1:p', d2: '1:b' }, 1],
			[{ e1: '0:k', f3: '0:n', h8: '1:k', h7: '1:p', a5: '1:b' }, 1],
		])
		expect(codes(s).filter((c) => c.includes('|')).sort()).toEqual(['b3|f3-d2', 'b3|f3-d4'])
		expect(outs(s, 'b3|f3-d2')).toBe('miss 0.5 R | move 0.5 R')
		expect(worlds(applyOutcome(V, s, 'b3|f3-d2', 1))).toBe('1 {Ke1 Nd2 ba5 kh8 ph7}')
		const sure = stateOf(V, [
			[{ e1: '0:k', b3: '0:n', h8: '1:k', h7: '1:p', d2: '1:b' }, 1],
			[{ e1: '0:k', f3: '0:n', h8: '1:k', h7: '1:p', d2: '1:b' }, 1],
		])
		expect(codes(sure).filter((c) => c.includes('|'))).toEqual(['b3|f3-d4'])
		expect(outs(sure, 'b3|f3-d2')).toBe('ILLEGAL')
	})

	it('rolls a capturing promotion between Captured and Missed only (T18)', () => {
		const s = stateOf(V, [
			[{ a1: '0:k', g7: '0:p', h8: '1:r', e8: '1:k', a7: '1:p' }, 1],
			[{ a1: '0:k', g7: '0:p', b8: '1:r', e8: '1:k', a7: '1:p' }, 1],
		])
		for (const p of ['q', 'r', 'b', 'n']) {
			expect(outs(s, 'g7-h8=' + p)).toBe('miss 0.5 R | capture 0.5 R')
			expect(worlds(applyOutcome(V, s, 'g7-h8=' + p, 1))).toBe('1 {Ka1 ke8 pa7}')
		}
		expect(worlds(applyOutcome(V, s, 'g7-h8=q', 0))).toBe('1 {Ka1 Pg7 ke8 pa7 rb8}')
	})

	it('settles "only the two kings are left" with the game-end roll (T14)', () => {
		const s = stateOf(V, [
			[{ h1: '0:k', e2: '0:r', a8: '1:k', e5: '1:b', d6: '1:n' }, 1],
			[{ h1: '0:k', e2: '0:r', a8: '1:k', e5: '1:b', b1: '1:n' }, 1],
		])
		expect(outs(s, 'e2-e5'))
			.toBe('capture[end:{"winner":null,"reason":"bareKings"}] 0.5 R | capture[end:null] 0.5 R')
		expect(applyOutcome(V, s, 'e2-e5', 0).result).toEqual({ winner: null, reason: 'bareKings' })
		const on = applyOutcome(V, s, 'e2-e5', 1)
		expect(worlds(on)).toBe('1 {Kh1 ka8 nb1}')
		expect(on.result).toBeNull()
	})

	it('takes a castling right in every possibility at once, and castling stays certain (T26)', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', h1: '0:r', g2: '0:n', a2: '0:p', e8: '1:k', b7: '1:b' }, 1],
			[{ e1: '0:k', h1: '0:r', c3: '0:n', a2: '0:p', e8: '1:k', b7: '1:b' }, 1],
		], 1, withRights)
		expect(outs(s, 'b7-g2')).toBe('move 0.5 R | capture 0.5 R')
		const moved = applyOutcome(V, s, 'b7-g2', 0)
		expect(moved.worlds.map((w) => flags(w.b))).toEqual(['K'])
		expect(outs(moved, 'O-O')).toBe('move 1')
		const captured = applyOutcome(V, s, 'b7-g2', 1)
		expect(worlds(captured)).toBe('1 {Ke1 Pa2 ke8}')
		expect(flags(captured.worlds[0].b)).toBe('')
		const ghost = stateOf(V, [
			[{ e1: '0:k', h1: '0:r', g1: '0:n', a2: '0:p', e8: '1:k', b7: '1:b' }, 1],
			[{ e1: '0:k', h1: '0:r', c3: '0:n', a2: '0:p', e8: '1:k', b7: '1:b' }, 1],
		], 0, withRights)
		expect(outs(ghost, 'O-O')).toBe('ILLEGAL')
	})

	it('joins a part with another part of the same piece without an explosion (T28)', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', f3: '0:n', d6: '1:b', e8: '1:k' }, 1],
			[{ e1: '0:k', e5: '0:n', d6: '1:b', e8: '1:k' }, 1],
		])
		expect(outs(s, 'f3-e5')).toBe('move 1')
		const t = play(V, s, 'f3-e5')
		expect(worlds(t)).toBe('1 {Ke1 Ne5 bd6 ke8}')
		expect(t.history.at(-1).captures).toEqual([])
	})
})

describe('atomic: board and computer player', () => {
	it('marks the last blast on the board (L1)', () => {
		let s = stateOf(V, [[{ e1: '0:k', e5: '0:p', e8: '1:k', d7: '1:p', c4: '1:n', e7: '1:b', c6: '1:r' }, 1]], 1)
		s = play(V, s, 'd7-d5')
		expect(V.layoutOf(s)).toBe(V.topology)
		const L = V.layoutOf(play(V, s, 'e5-d6'))
		expect(L.cells).toHaveLength(64)
		const hot = L.cells.filter((c) => c.shade === 'hill' || c.shade === 'hilldark').map((c) => N(c.sq)).sort()
		expect(hot).toEqual(['c5', 'c6', 'c7', 'd5', 'd6', 'd7', 'e5', 'e6', 'e7'])
		expect(L.cells[sq('d6')].shade).toBe('hilldark')
		expect(L.cells[sq('a1')]).toBe(V.topology.cells[sq('a1')])
		expect(L.layout.outlines).toEqual([
			{ x1: 2, y1: 1, x2: 5, y2: 1 },
			{ x1: 5, y1: 1, x2: 5, y2: 4 },
			{ x1: 5, y1: 4, x2: 2, y2: 4 },
			{ x1: 2, y1: 4, x2: 2, y2: 1 },
		])
		expect(L.layout.labels).toBe(V.topology.layout.labels)
		const corner = play(V, stateOf(V, [
			[{ e1: '0:k', b1: '0:r', a8: '1:k', b8: '1:n' }, 1],
			[{ e1: '0:k', b1: '0:r', a8: '1:k', h3: '1:n' }, 1],
		]), 'b1-b8', 0)
		expect(corner.history.at(-1).key).toBe('move')
		expect(V.layoutOf(corner)).toBe(V.topology)
		expect(V.layoutOf(newGame(V))).toBe(V.topology)
	})

	it('counts blow-up threats next to the king for the computer', () => {
		const s = playAll(newGame(V), ['g1-f3', 'a7-a6', 'f3-e5'])
		const b = s.worlds[0].b
		// e5 attacks f7 and d7, both next to e8
		expect([kingThreats(b, 1), kingThreats(b, 0)]).toEqual([2, 0])
		expect([V.evaluate(b, 1), V.evaluate(b, 0)]).toEqual([-120, 120])
		expect(kingThreats(newGame(V).worlds[0].b, 0)).toBe(0)
	})

	it('makes a legal move from the start at every level within its time budget', async () => {
		for (const level of LEVELS) {
			const s = newGame(V)
			const elapsed = stopwatch()
			const code = await chooseMove(V, s, { level: level.id, rng: seededRng(3) })
			expect(elapsed()).toBeLessThan(level.timeMs + 500)
			expect(branches(V, s, code), level.id + ': ' + code).not.toBeNull()
		}
	}, 20000)

	it('finds the Nxf7 blow-up at every level (T1)', async () => {
		const s = beforeNxf7()
		for (const level of LEVELS) {
			for (const seed of [1, 2, 3]) {
				const code = await chooseMove(V, s, { level: level.id, rng: seededRng(seed), now: workClock() })
				// e5-f7 and e5-d7 both blow up the king on e8; after a quiet move Black cannot escape that blow-up, so
				// the computer, which sees the escape rule, may also win at once that way
				const result = applyMove(V, s, code, 0).state.result
				expect(result?.winner, level.id + ': ' + code).toBe(0)
				expect(['exploded', 'cannotEscape'], level.id + ': ' + code).toContain(result.reason)
			}
		}
	}, 20000)
})

describe('atomic: random games keep the explosion invariants', () => {
	it('never mixes exploded and unexploded possibilities, and never raises the opponent\'s budget', () => {
		const sameIn = (s, f) => s.worlds.every(({ b }) => JSON.stringify(f(b)) === JSON.stringify(f(s.worlds[0].b)))
		let moves = 0
		let splits = 0
		let dangers = 0
		for (let game = 0; game < 16; game++) {
			const rng = seededRng(1000 + game)
			let s = newGame(V)
			for (let ply = 0; ply < 100 && !s.result; ply++) {
				const list = legalMoves(V, s, { splits: rng() < 0.3 })
				expect(list.length).toBeGreaterThan(0)
				const code = list[Math.floor(rng() * list.length)].code
				for (const br of branches(V, s, code)) {
					const exploded = br.worlds.filter((e) => e.k === 'capture').length
					// A-1: an explosion happened in every possibility of a result, or in none
					expect(exploded === 0 || exploded === br.worlds.length, code).toBe(true)
					expect(br.captures.length).toBeLessThanOrEqual(1)
					// A-3: a blast never needs the solid roll; A-9: nor the game-end roll for a blown-up king (kings
					// are solid), which only "only the two kings are left" can need
					expect(br.notes.filter((n) => n.startsWith('solid:'))).toEqual([])
					expect(br.notes.filter((n) => n.startsWith('end:') && n.includes('exploded')), code).toEqual([])
				}
				const mover = s.turn
				const before = budgetInfo(V, s, 1 - mover).used
				const split = /^(\w+)-\w+\|\w+$/.exec(code)
				const piece = split ? ownPieceAt(s, sq(split[1])) : -1
				s = applyMove(V, s, code, rng).state
				moves++
				// A-2: a split never leaves a piece on more than 4 places, "destroyed" included; docs/rules.md 7.2
				// limits splits only, and a link or an unrolled merge may spread a piece further (generic core)
				if (split) {
					expect(piece, code).toBeGreaterThanOrEqual(0)
					expect(pieceLocations(s, piece).length, code).toBeLessThanOrEqual(4)
					splits++
				}
				// A-10: an explosion never raises the budget of the side that did not move
				expect(budgetInfo(V, s, 1 - mover).used).toBeLessThanOrEqual(before)
				for (const side of [0, 1]) {
					const info = budgetInfo(V, s, side)
					expect(info.used).toBeLessThanOrEqual(info.limit)
				}
				expect(sameIn(s, (b) => [b.x.ep, b.x.epVictim, b.x.castle])).toBe(true)
				expect(V.layoutOf(s).cells).toHaveLength(64)
				if (!s.result) {
					for (const { b } of s.worlds) {
						expect(b.ty.filter((t, id) => t === 'k' && b.sq[id] >= 0)).toHaveLength(2)
					}
					for (const side of [0, 1]) {
						const danger = royalDanger(V, s, side)
						expect(danger).toBeGreaterThanOrEqual(cheapDanger(s, side) - 1e-9)
						// T24: ordinary moves and merges, counted by brute force
						expect(danger, code).toBeCloseTo(bruteDanger(s, side), 6)
						dangers += danger > 0 ? 1 : 0
					}
				}
			}
		}
		expect(moves).toBeGreaterThan(300)
		expect(splits).toBeGreaterThan(20)
		expect(dangers).toBeGreaterThan(50)
	}, 60000)
})
