/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Makruk (Thai chess): setup, the Thai pieces, the Bia's promotion to Met, stalemate, the bare-Khun count, the 64-move
 * rule and the bare Khuns, and how they meet the quantum rules. The classical move counts were checked against
 * Fairy-Stockfish.
 */

import { describe, expect, it } from 'vitest'
import { sharedRules } from '../../../src/variantplay/texts.js'
import { chooseMove, LEVELS } from '../../../src/variants/core/ai.js'
import {
	applyOutcome,
	branches,
	budget,
	legalMoves,
	newGame,
	outcomes,
	royalDanger,
	splitsFrom,
	T,
} from '../../../src/variants/core/quantum.js'
import {
	applyClassical,
	attacks,
	cloneWorld,
	generate,
	nameOf,
	OFF,
	placePiece,
	royalSquares,
} from '../../../src/variants/core/world.js'
import V, { canTakeKhun, countInfo, honourLimit, stalemated } from '../../../src/variants/makruk.js'
import { play, stateOf, stopwatch } from './helpers.js'

const K = { a1: '0:k', h8: '1:k' }

/**
 * A state from explicit worlds with Makruk's empty extra state and a quiet counter.
 *
 * @param {Array<[Record<string, string>, number]>} worlds placements with relative weights
 * @param {number} [turn] side to move
 * @param {number} [quiet] plies since the last capture or promotion
 * @return {object}
 */
function S(worlds, turn = 0, quiet = 0) {
	return { ...stateOf(V, worlds, turn, () => {}), quiet }
}

/**
 * The position of every world as text: weight, then the pieces (White upper case) sorted.
 *
 * @param {object} s state
 * @return {string}
 */
function show(s) {
	return s.worlds.map(({ b, w }) => {
		const pieces = []
		b.sq.forEach((sq, id) => {
			if (sq >= 0) {
				pieces.push((b.sd[id] === 0 ? b.ty[id].toUpperCase() : b.ty[id]) + nameOf(V, sq))
			}
		})
		return (w / T).toFixed(2) + ' ' + pieces.sort().join(' ')
	}).join(' / ')
}

/**
 * The legal move codes of a state that start with a prefix, sorted.
 *
 * @param {object} s state
 * @param {string} [prefix] prefix
 * @return {string[]}
 */
function codes(s, prefix = '') {
	return legalMoves(V, s).map((m) => m.code).filter((c) => c.startsWith(prefix)).sort()
}

/**
 * Outcomes as `key p` strings, `R` marking a roll.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {string[]}
 */
function outs(s, code) {
	return outcomes(V, s, code).map((o) => o.key + ' ' + o.p + (o.rolled ? ' R' : ''))
}

/**
 * Play several moves, each with its first outcome.
 *
 * @param {object} s state
 * @param {string[]} list move codes
 * @return {object}
 */
function playAll(s, list) {
	return list.reduce((st, c) => play(V, st, c), s)
}

/**
 * Legal perft on one world: Khun captures excluded by removing the moves that leave the own Khun attacked, as in
 * Fairy-Stockfish (the variants core itself generates capture-the-king moves).
 *
 * @param {object} w world
 * @param {number} side side to move
 * @param {number} depth depth
 * @return {number}
 */
function perft(w, side, depth) {
	let n = 0
	for (const m of generate(V, w, side).values()) {
		const next = applyClassical(V, w, m)
		const k = royalSquares(V, next, side)
		if (k.length && !attacks(V, next, 1 - side, k[0])) {
			n += depth === 1 ? 1 : perft(next, 1 - side, depth - 1)
		}
	}
	return n
}

/**
 * The count fields that the cases compare.
 *
 * @param {object} s state
 * @return {object|null}
 */
function count(s) {
	const c = countInfo(s)
	return c && { allow: c.allow, done: c.done, limit: c.limit, pieces: c.pieces }
}

describe('makruk: board, setup and pieces', () => {
	it('is the regional variant makruk on an uncheckered wooden 8 x 8 board', () => {
		expect(V.id).toBe('makruk')
		expect(V.category).toBe('regional')
		expect(V.topology.size).toBe(64)
		expect(V.topology.cells.every((c) => c.shade === 'wood')).toBe(true)
		const rules = V.rules()
		expect(rules.length).toBeGreaterThanOrEqual(3)
		expect(rules.length).toBeLessThanOrEqual(8)
		for (const [id, type] of Object.entries(V.types)) {
			expect(typeof type.name(), id).toBe('string')
			expect(type.glyph, id).toBeTruthy()
			expect(type.value, id).toBeGreaterThan(0)
		}
		expect(V.types.k.royal && V.types.k.solid && V.types.p.solid).toBe(true)
		expect(['m', 's', 'n', 'r'].every((ty) => V.types[ty].splittable)).toBe(true)
		expect(V.types.p.splittable || V.types.k.splittable).toBe(false)
	})

	it('has no castling or en passant, and keeps the escape rule and its own bare-Khuns draw', () => {
		expect([V.specialMoves, V.escapeRule, V.bareKingsDraw, V.drawsWait]).toEqual([false, true, false, true])
		expect(sharedRules(V).some((r) => r.includes('Castling') || r.includes('en passant'))).toBe(false)
		expect(V.rules().some((r) => /no checkmate|only by capturing/i.test(r))).toBe(false)
	})

	it('puts every piece on its start square (Khun d1 / e8, Met e1 / d8, Bias on ranks 3 and 6)', () => {
		const s = newGame(V, {})
		expect(show(s)).toBe('1.00 Kd1 Me1 Nb1 Ng1 Pa3 Pb3 Pc3 Pd3 Pe3 Pf3 Pg3 Ph3 Ra1 Rh1 Sc1 Sf1 '
			+ 'ke8 md8 nb8 ng8 pa6 pb6 pc6 pd6 pe6 pf6 pg6 ph6 ra8 rh8 sc8 sf8')
		expect(s.worlds[0].b.x).toEqual({})
	})

	it('has the 23 first moves and 7 splits of Makruk, and Fairy-Stockfish\'s perft', () => {
		const s = newGame(V, {})
		const first = [
			'a1-a2 a3-a4 b1-d2 b3-b4 c1-b2 c1-c2 c1-d2 c3-c4 d1-c2 d1-d2 d1-e2 d3-d4',
			'e1-d2 e1-f2 e3-e4 f1-e2 f1-f2 f1-g2 f3-f4 g1-e2 g3-g4 h1-h2 h3-h4',
		]
		expect(codes(s)).toEqual(first.join(' ').split(' '))
		const all = legalMoves(V, s, { splits: true })
		expect(all).toHaveLength(30)
		const splits = 'c1-b2|c2 c1-b2|d2 c1-c2|d2 e1-d2|f2 f1-e2|f2 f1-e2|g2 f1-f2|g2'
		expect(all.filter((m) => m.type === 'split').map((m) => m.code)).toEqual(splits.split(' '))
		const b = s.worlds[0].b
		expect([1, 2, 3].map((d) => perft(b, 0, d))).toEqual([23, 529, 12012])
		const end = stateOf(V, [[{ d8: '1:k', f4: '1:n', a3: '1:p', b2: '0:p', e1: '0:k' }, 1]], 1, () => {})
		expect([1, 2, 3].map((d) => perft(end.worlds[0].b, 1, d))).toEqual([15, 89, 1251])
	})

	it('moves the Khon one step diagonally or straight forward, for both sides', () => {
		expect(codes(S([[{ ...K, e4: '0:s' }, 1]]), 'e4-')).toEqual(['e4-d3', 'e4-d5', 'e4-e5', 'e4-f3', 'e4-f5'])
		expect(codes(S([[{ ...K, e5: '1:s' }, 1]], 1), 'e5-')).toEqual(['e5-d4', 'e5-d6', 'e5-e4', 'e5-f4', 'e5-f6'])
		// it captures forward and diagonally, never sideways or straight back
		const s = S([[{ ...K, e4: '0:s', e5: '1:n', d5: '1:r', e3: '1:r', d4: '1:n' }, 1]])
		expect(codes(s, 'e4-')).toEqual(['e4-d3', 'e4-d5', 'e4-e5', 'e4-f3', 'e4-f5'])
	})

	it('moves the Met one step diagonally, and the Ma, Rua and Khun like knight, rook and king', () => {
		expect(codes(S([[{ ...K, d4: '0:m' }, 1]]), 'd4-')).toEqual(['d4-c3', 'd4-c5', 'd4-e3', 'd4-e5'])
		expect(codes(S([[{ ...K, d4: '0:n' }, 1]]), 'd4-')).toHaveLength(8)
		expect(codes(S([[{ ...K, d4: '0:r' }, 1]]), 'd4-')).toHaveLength(14)
		expect(codes(S([[{ e4: '0:k', h8: '1:k' }, 1]]), 'e4-')).toHaveLength(8)
		expect(codes(S([[{ a1: '0:k', h8: '1:k', a4: '0:r', a6: '1:n', c4: '0:p' }, 1]]), 'a4-'))
			.toEqual(['a4-a2', 'a4-a3', 'a4-a5', 'a4-a6', 'a4-b4'])
	})

	it('moves a Bia one step (never two) and always promotes it to a Met on its sixth rank', () => {
		const s = S([[{ ...K, e3: '0:p', c5: '0:p', b6: '1:n', d6: '1:n' }, 1]])
		expect(codes(s, 'e3-')).toEqual(['e3-e4'])
		expect(codes(s, 'c5-')).toEqual(['c5-b6=m', 'c5-c6=m', 'c5-d6=m'])
		const promoted = play(V, s, 'c5-c6=m')
		expect(show(promoted)).toBe('1.00 Ka1 Mc6 Pe3 kh8 nb6 nd6')
		expect(promoted.quiet).toBe(0)
		expect(codes(play(V, promoted, 'h8-g8'), 'c6-')).toEqual(['c6-b5', 'c6-b7', 'c6-d5', 'c6-d7'])
		expect(codes(S([[{ ...K, d4: '1:p', e3: '0:n' }, 1]], 1), 'd4-')).toEqual(['d4-d3=m', 'd4-e3=m'])
		expect(codes(S([[{ ...K, b5: '0:p', b6: '1:s' }, 1]]), 'b5-')).toEqual([])
	})
})

describe('makruk: winning and drawing', () => {
	it('draws a stalemate, and a mate wins at once: the Khun cannot escape', () => {
		const s = S([[{ f7: '0:k', f5: '0:m', h8: '1:k' }, 1]])
		expect(play(V, s, 'f5-g6').result).toEqual({ winner: null, reason: 'stalemate' })
		expect(play(V, s, 'f5-e6').result).toBeNull()
		// the core's escape rule (docs/rules.md 5): every Black move leaves the Khun to be captured for certain
		const mate = play(V, S([[{ f7: '0:k', a1: '0:r', h8: '1:k' }, 1]]), 'a1-h1')
		expect(mate.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		// a Khun in danger that can step away (to g8) plays on; a move that leaves it attacked loses it
		const open = play(V, S([[{ f6: '0:k', a1: '0:r', h8: '1:k' }, 1]]), 'a1-h1')
		expect([open.result, royalDanger(V, open, 1)]).toEqual([null, 1])
		expect(playAll(open, ['h8-h7', 'h1-h7']).result).toEqual({ winner: 0, reason: 'king' })
	})

	it('counts a pinned piece in the stalemate test', () => {
		const pinned = S([[{ d7: '0:k', a1: '0:r', a8: '1:k', a7: '1:m' }, 1]])
		expect(play(V, pinned, 'd7-c7').result).toEqual({ winner: null, reason: 'stalemate' })
		const free = play(V, S([[{ d7: '0:k', b1: '0:r', a8: '1:k', a7: '1:m' }, 1]]), 'd7-c7')
		expect(free.result).toBeNull()
		expect(codes(free)).toEqual(['a7-b6', 'a7-b8', 'a8-b7', 'a8-b8'])
		expect(stalemated(V, free.worlds[0].b, 1)).toBe(false)
	})

	it('makes no legal move a loss when the Khun is attacked and a stalemate when it is not (T4c)', () => {
		const boxed = { a1: '0:k', a2: '0:r', a3: '0:p', b1: '0:p', b2: '0:p', a4: '1:m', h8: '1:k' }
		const a1 = V.topology.byName('a1')
		const lost = play(V, S([[{ ...boxed, c5: '1:n' }, 1]], 1), 'c5-b3')
		expect(lost.result).toEqual({ winner: 1, reason: 'noMoves' })
		expect([generate(V, lost.worlds[0].b, 0).size, attacks(V, lost.worlds[0].b, 1, a1)]).toEqual([0, true])
		const stale = play(V, S([[{ ...boxed, c4: '1:m' }, 1]], 1), 'c4-b3')
		expect(stale.result).toEqual({ winner: null, reason: 'stalemate' })
		expect([generate(V, stale.worlds[0].b, 0).size, attacks(V, stale.worlds[0].b, 1, a1)]).toEqual([0, false])
	})

	it('draws when only the two Khuns are left, unless they touch', () => {
		expect(play(V, S([[{ d4: '0:k', e5: '1:m', h8: '1:k' }, 1]]), 'd4-e5').result)
			.toEqual({ winner: null, reason: 'bareKings' })
		const touch = play(V, S([[{ d4: '0:k', e5: '1:m', f6: '1:k' }, 1]]), 'd4-e5')
		expect(touch.result).toBeNull()
		expect(play(V, touch, 'f6-e5').result).toEqual({ winner: 1, reason: 'king' })
	})

	it('gives two Rua 5 moves against a bare Khun (limit 8, 4 pieces), then draws by the count', () => {
		const t6 = play(V, S([[{ a1: '0:k', b2: '0:r', c3: '0:r', h8: '1:k', b7: '1:n' }, 1]], 0, 30), 'b2-b7')
		expect(t6.result).toBeNull()
		expect(t6.quiet).toBe(0)
		expect(countInfo(t6)).toEqual({ lone: 1, chaser: 0, allow: 5, done: 0, limit: 8, pieces: 4 })
		let s = t6
		const done = []
		for (const c of ['h8-g8', 'c3-c4', 'g8-h8', 'c4-c5', 'h8-g8', 'c5-c4', 'g8-h8', 'c4-c5', 'h8-g8']) {
			s = play(V, s, c)
			done.push(countInfo(s).done)
			expect(s.result).toBeNull()
		}
		expect(done).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4])
		const end = play(V, s, 'c5-c4')
		expect(end.result).toEqual({ winner: null, reason: 'count' })
		expect(end.quiet).toBe(10)
		// a mate on the 4th counted move wins at once (Fairy-Stockfish: mate at 16 of 16); on the 5th it comes too late
		const mated = playAll(t6, ['h8-g8', 'c3-c4', 'g8-h8', 'c4-c5', 'h8-g8', 'c5-c4', 'g8-h8', 'c4-c8'])
		expect([countInfo(mated).done, mated.quiet]).toEqual([4, 8])
		expect(mated.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		expect(play(V, s, 'c5-c8').result).toEqual({ winner: null, reason: 'count' })
		// the rook ending can also end in stalemate
		const stale = playAll(t6, ['h8-g8', 'c3-c4', 'g8-h8', 'c4-c5', 'h8-g8', 'c5-c4', 'g8-h8', 'c4-g4'])
		expect(stale.result).toEqual({ winner: null, reason: 'stalemate' })
	})

	it('lets the count wait while the Khuns touch', () => {
		const s = S([[{ f6: '0:k', a1: '0:r', b1: '0:r', h8: '1:k' }, 1]], 0, 9)
		expect(count(s)).toEqual({ allow: 5, done: 4, limit: 8, pieces: 4 })
		expect(play(V, s, 'f6-f7').result).toEqual({ winner: null, reason: 'count' })
		const waits = play(V, s, 'f6-g7')
		expect(waits.result).toBeNull()
		expect(canTakeKhun(V, waits)).toBe(true)
		expect(V.sideInfo(waits, 0).text).toBe('5/5')
		// the lone Khun takes the chaser's Khun: no count any more, although White still has two Rua
		const end = play(V, waits, 'h8-g7')
		expect(end.result).toEqual({ winner: 1, reason: 'king' })
		expect([countInfo(end), V.sideInfo(end, 0), V.sideInfo(end, 1)]).toEqual([null, null, null])
	})

	it('gives the chaser a free move when the lone Khun takes the last Bia', () => {
		let s = play(V, S([[{ a1: '0:k', b2: '0:r', c3: '0:r', g5: '0:p', h6: '1:k' }, 1]], 1, 40), 'h6-g5')
		expect([s.result, s.quiet, s.turn]).toEqual([null, 0, 0])
		expect(count(s)).toEqual({ allow: 5, done: 0, limit: 8, pieces: 4 })
		const done = []
		for (const c of ['b2-b3', 'g5-h6', 'b3-b2', 'h6-h7', 'b2-b1', 'h7-h8', 'b1-b7', 'h8-g8']) {
			s = play(V, s, c)
			done.push(countInfo(s).done)
			expect(s.result).toBeNull()
		}
		expect(done).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
		// White's 5th move mates (Fairy-Stockfish: mate 1 at count 15 of 16) and wins at once
		const mated = play(V, s, 'c3-c8')
		expect([countInfo(mated).done, mated.result]).toEqual([4, { winner: 0, reason: 'cannotEscape' }])
		// without the mate, White's 6th move is the last: a mate then comes too late
		s = playAll(s, ['c3-c4', 'g8-h8'])
		expect([countInfo(s).done, s.result]).toEqual([4, null])
		expect(play(V, s, 'c4-c8').result).toEqual({ winner: null, reason: 'count' })
		expect(play(V, s, 'c4-c5').result).toEqual({ winner: null, reason: 'count' })
	})

	it('starts the count with the last Bia\'s promotion (T6e)', () => {
		const s = play(V, S([[{ a1: '0:k', b1: '0:r', c5: '0:p', h8: '1:k' }, 1]], 0, 40), 'c5-c6=m')
		expect([s.result, s.quiet, count(s)]).toEqual([null, 0, { allow: 13, done: 0, limit: 16, pieces: 4 }])
		expect(V.sideInfo(s, 0).text).toBe('0/13')
	})

	it('still gives one move when there are more pieces than the limit', () => {
		const nine = { a1: '0:k', b1: '0:r', c1: '0:r', d1: '0:n', e1: '0:n', f1: '0:s', g1: '0:s', h1: '0:m' }
		nine.h8 = '1:k'
		let s = play(V, S([[{ ...nine, h2: '1:m' }, 1]]), 'g1-h2')
		expect([s.result, count(s)]).toEqual([null, { allow: 1, done: 0, limit: 8, pieces: 9 }])
		s = play(V, s, 'h8-g8')
		expect(s.result).toBeNull()
		expect(play(V, s, 'd1-c3').result).toEqual({ winner: null, reason: 'count' })
		// the capture that starts the count mates: it wins at once (Fairy-Stockfish: mate 0, the count never saves a
		// mated player)
		const trap = { e2: '0:k', b1: '0:r', c1: '0:s', d1: '0:m', f1: '0:s', g1: '0:n', h1: '0:r', c6: '0:n' }
		trap.a8 = '1:k'
		s = play(V, S([[{ ...trap, h8: '1:n' }, 1]]), 'h1-h8')
		expect([s.result, count(s)]).toEqual([
			{ winner: 0, reason: 'cannotEscape' },
			{ allow: 1, done: 0, limit: 8, pieces: 9 },
		])
	})

	it('takes the limit from the first line of the table that applies, and the most generous world', () => {
		const allow = (pl) => countInfo(S([[{ a1: '0:k', ...pl, h8: '1:k' }, 1]], 1)).allow
		expect(allow({ b2: '0:r' })).toBe(14)
		expect(allow({ b2: '0:s', c2: '0:s' })).toBe(19)
		expect(allow({ b2: '0:n', c2: '0:n' })).toBe(29)
		expect(allow({ b2: '0:s', c2: '0:n', d2: '0:n' })).toBe(28)
		expect(allow({ b2: '0:s', c2: '0:m' })).toBe(41)
		expect(allow({ b2: '0:n', c2: '0:m', d2: '0:m' })).toBe(60)
		expect(allow({ b2: '0:m' })).toBe(62)
		expect(allow({ b2: '0:r', c2: '0:r', d2: '0:n' })).toBe(4)
		expect(allow({ b2: '0:r', c2: '0:s', d2: '0:s' })).toBe(12)
		expect(allow({ b2: '0:s', c2: '0:s', d2: '0:n', e2: '0:n' })).toBe(17)
		expect(allow({ b2: '0:s', c2: '0:n' })).toBe(41)
		expect(honourLimit({})).toBe(64)
		expect(countInfo(S([[{ a1: '0:k', b2: '0:r', c4: '0:p', h8: '1:k' }, 1]], 1))).toBeNull()
		const generous = S([
			[{ a1: '0:k', b2: '0:r', c3: '0:r', h8: '1:k' }, 1],
			[{ a1: '0:k', b2: '0:r', c3: '0:n', h8: '1:k' }, 1],
		], 1)
		expect(countInfo(generous)).toEqual({ lone: 1, chaser: 0, allow: 13, done: 0, limit: 16, pieces: 4 })
	})

	it('draws after 65 moves each without a capture or promotion, only without Bias, and waits for a capture', () => {
		expect(play(V, S([[{ a1: '0:k', b2: '0:r', h8: '1:k', g7: '1:n', c3: '0:p' }, 1]], 0, 300), 'b2-b3').result)
			.toBeNull()
		const pos = { a1: '0:k', b2: '0:r', h8: '1:k', g7: '1:n' }
		const drawn = play(V, S([[pos, 1]], 0, 129), 'b2-b3')
		expect([drawn.result, drawn.quiet]).toEqual([{ winner: null, reason: 'quiet' }, 130])
		expect(play(V, S([[pos, 1]], 0, 128), 'b2-b3').result).toBeNull()
		// a mate on ply 129 wins at once; on ply 130 it comes too late (Fairy-Stockfish draws one ply earlier)
		const mate = { f7: '0:k', a1: '0:r', h8: '1:k', a8: '1:n' }
		const s = play(V, S([[mate, 1]], 0, 128), 'a1-h1')
		expect([s.result, s.quiet]).toEqual([{ winner: 0, reason: 'cannotEscape' }, 129])
		expect(play(V, S([[mate, 1]], 0, 129), 'a1-h1').result).toEqual({ winner: null, reason: 'quiet' })
		// the draw waits as long as the player to move can take the enemy Khun for certain, then the capture wins
		let w = S([[{ a1: '0:k', h1: '0:r', h8: '1:k', a8: '1:r' }, 1]], 1, 129)
		for (const c of ['a8-a7', 'h1-h2', 'a7-a6']) {
			w = play(V, w, c)
			expect([w.result, canTakeKhun(V, w)]).toEqual([null, true])
		}
		expect(w.quiet).toBe(132)
		expect(play(V, w, 'h2-h8').result).toEqual({ winner: 0, reason: 'king' })
	})

	it('shows the count in the chaser\'s row and the 64-move rule in both rows', () => {
		let s = play(V, S([[{ a1: '0:k', b2: '0:r', c3: '0:r', h8: '1:k', b7: '1:n' }, 1]], 0, 30), 'b2-b7')
		expect(V.sideInfo(s, 0).text).toBe('0/5')
		expect(typeof V.sideInfo(s, 0).title).toBe('string')
		expect(V.sideInfo(s, 1)).toBeNull()
		s = playAll(s, ['h8-g8', 'c3-c4', 'g8-h8', 'c4-c5', 'h8-g8', 'c5-c4', 'g8-h8', 'c4-c5', 'h8-g8'])
		expect(V.sideInfo(s, 0).text).toBe('4/5')
		const pos = { a1: '0:k', b2: '0:r', h8: '1:k', g7: '1:n' }
		expect([0, 1].map((side) => V.sideInfo(S([[pos, 1]], 0, 129), side).text)).toEqual(['64/65', '64/65'])
		expect(V.sideInfo(S([[pos, 1]], 0, 100), 0).text).toBe('50/65')
		expect(V.sideInfo(S([[pos, 1]], 0, 99), 0)).toBeNull()
		expect(V.sideInfo(newGame(V, {}), 0)).toBeNull()
		// capped at 65/65 while the draw waits, however long the wait lasts
		let w = S([[{ a1: '0:k', h1: '0:r', h8: '1:k', a8: '1:r' }, 1]], 1, 129)
		const texts = []
		for (const c of ['a8-a7', 'h1-h2', 'a7-a6']) {
			w = play(V, w, c)
			texts.push(V.sideInfo(w, 0).text, V.sideInfo(w, 1).text)
		}
		expect([w.result, w.quiet]).toEqual([null, 132])
		expect(texts).toEqual(new Array(6).fill('65/65'))
		expect(V.sideInfo(w, 0).title).toBe('Moves without a capture: 65 of 65')
		// and the count's first number never exceeds the second
		const late = S([[{ f6: '0:k', a1: '0:r', b1: '0:r', h8: '1:k' }, 1]], 1, 30)
		expect([countInfo(late).done, V.sideInfo(late, 0).text, V.sideInfo(late, 1)]).toEqual([15, '5/5', null])
	})

	it('explains its own results and scores a side with no move at all', () => {
		for (const reason of ['king', 'cannotEscape', 'stalemate', 'bareKings', 'count', 'quiet']) {
			expect(typeof V.reasonText(reason)).toBe('string')
		}
		expect(V.reasonText('moveLimit')).toBeNull()
		expect(V.quietPlies).toBe(Number.POSITIVE_INFINITY)
		// every possibility a checkmate: the side that cannot move loses; otherwise a draw
		const attacked = S([[{ a1: '0:k', a8: '1:r', h8: '1:k' }, 1]])
		expect(V.noMoves(attacked)).toEqual({ winner: 1, reason: 'noMoves' })
		const safe = S([[{ a1: '0:k', b8: '1:r', h8: '1:k' }, 1]])
		expect(V.noMoves(safe)).toEqual({ winner: null, reason: 'noMoves' })
	})
})

describe('makruk: quantum rules', () => {
	it('rolls a Bia push onto a possible ghost: it promotes or stays a Bia', () => {
		const s = S([[{ ...K, c5: '0:p', c6: '1:n' }, 1], [{ ...K, c5: '0:p', a5: '1:n' }, 1]])
		expect(outs(s, 'c5-c6=m')).toEqual(['miss 0.5 R', 'move 0.5 R'])
		expect(show(applyOutcome(V, s, 'c5-c6=m', 0))).toBe('1.00 Ka1 Pc5 kh8 nc6')
		expect(show(applyOutcome(V, s, 'c5-c6=m', 1))).toBe('1.00 Ka1 Mc6 kh8 na5')
		const capture = S([[{ ...K, c5: '0:p', b6: '1:n' }, 1], [{ ...K, c5: '0:p', a4: '1:n' }, 1]])
		expect(outs(capture, 'c5-b6=m')).toEqual(['miss 0.5 R', 'capture 0.5 R'])
	})

	it('splits the Met, the Khon (with its forward step) and a promoted Bia, never the Bia or the Khun', () => {
		const s = S([[{ ...K, d4: '0:m', f5: '0:s', b3: '0:p' }, 1]])
		const sq = (name) => V.topology.byName(name)
		const met = 'd4-c3|e3 d4-c3|c5 d4-c3|e5 d4-e3|c5 d4-e3|e5 d4-c5|e5'
		expect(splitsFrom(V, s, sq('d4')).map((m) => m.code)).toEqual(met.split(' '))
		const khon = splitsFrom(V, s, sq('f5')).map((m) => m.code)
		expect(khon).toHaveLength(10)
		expect(khon.some((c) => c.includes('f4'))).toBe(false)
		expect(splitsFrom(V, s, sq('b3'))).toEqual([])
		expect(splitsFrom(V, s, sq('a1'))).toEqual([])
		const split = play(V, s, 'f5-f6|g6')
		expect(show(split)).toBe('0.50 Ka1 Md4 Pb3 Sg6 kh8 / 0.50 Ka1 Md4 Pb3 Sf6 kh8')
		expect(budget(split, 0)).toBe(2)
		const promoted = playAll(S([[{ ...K, c5: '0:p' }, 1]]), ['c5-c6=m', 'h8-g8', 'c6-b7|d7'])
		expect(show(promoted)).toBe('0.50 Ka1 Md7 kg8 / 0.50 Ka1 Mb7 kg8')
	})

	it('links a Rua that slides past a possible ghost (pass = link) and rolls its landing on one', () => {
		const pos = { d1: '0:k', a1: '0:r', e8: '1:k' }
		const s = S([[{ ...pos, a4: '1:n' }, 1], [{ ...pos, c6: '1:n' }, 1]])
		expect(outs(s, 'a1-a7')).toEqual(['move 1'])
		const linked = play(V, s, 'a1-a7')
		expect(show(linked).split(' / ').sort()).toEqual(['0.50 Kd1 Ra1 ke8 na4', '0.50 Kd1 Ra7 ke8 nc6'])
		expect(outs(s, 'a1-a4')).toEqual(['move 0.5 R', 'capture 0.5 R'])
	})

	it('settles a stalemate that holds in only some possibilities with the game-end roll', () => {
		const s = S([[{ f7: '0:k', f5: '0:m', h8: '1:k' }, 1], [{ f7: '0:k', e4: '0:m', h8: '1:k' }, 1]])
		const o = outcomes(V, s, 'f5-g6')
		expect(o.map((x) => [x.key, x.p, x.rolled])).toEqual([['move', 0.5, true], ['miss', 0.5, true]])
		expect(o[0].notes).toEqual(['end:{"winner":null,"reason":"stalemate"}'])
		const drawn = applyOutcome(V, s, 'f5-g6', 0)
		expect([drawn.result, show(drawn)]).toEqual([{ winner: null, reason: 'stalemate' }, '1.00 Kf7 Mg6 kh8'])
		const goesOn = applyOutcome(V, s, 'f5-g6', 1)
		expect([goesOn.result, show(goesOn)]).toEqual([null, '1.00 Kf7 Me4 kh8'])
		// a ghost Rua that pins the Met in one possibility only: a certain Khun step ends in the game-end roll
		const pin = S([
			[{ d7: '0:k', a1: '0:r', a8: '1:k', a7: '1:m' }, 1],
			[{ d7: '0:k', b1: '0:r', a8: '1:k', a7: '1:m' }, 1],
		])
		expect(outs(pin, 'd7-c7')).toEqual(['move 0.5 R', 'move 0.5 R'])
		expect(show(applyOutcome(V, pin, 'd7-c7', 0))).toBe('1.00 Kc7 Ra1 ka8 ma7')
		expect(applyOutcome(V, pin, 'd7-c7', 0).result).toEqual({ winner: null, reason: 'stalemate' })
		expect(applyOutcome(V, pin, 'd7-c7', 1).result).toBeNull()
	})

	it('starts the count only when the lone side is bare in every possibility', () => {
		const s = S([
			[{ a1: '0:k', b1: '0:r', c1: '0:r', h8: '1:k', b6: '1:m' }, 1],
			[{ a1: '0:k', b1: '0:r', c1: '0:r', h8: '1:k', f6: '1:m' }, 1],
		], 0, 20)
		expect(countInfo(s)).toBeNull()
		expect(outs(s, 'b1-b6')).toEqual(['move 0.5 R', 'capture 0.5 R'])
		const moved = applyOutcome(V, s, 'b1-b6', 0)
		expect([moved.quiet, countInfo(moved), show(moved)]).toEqual([21, null, '1.00 Ka1 Rb6 Rc1 kh8 mf6'])
		const captured = applyOutcome(V, s, 'b1-b6', 1)
		expect([captured.quiet, count(captured)]).toEqual([0, { allow: 5, done: 0, limit: 8, pieces: 4 }])
		// a Khun that takes the last enemy piece, a ghost part: Captured is the bare-Khuns draw
		const bare = S([[{ d4: '0:k', e5: '1:s', h8: '1:k' }, 1], [{ d4: '0:k', g5: '1:s', h8: '1:k' }, 1]])
		expect(outs(bare, 'd4-e5')).toEqual(['move 0.5 R', 'capture 0.5 R'])
		expect(applyOutcome(V, bare, 'd4-e5', 0).result).toBeNull()
		expect(applyOutcome(V, bare, 'd4-e5', 1).result).toEqual({ winner: null, reason: 'bareKings' })
	})

	it('settles only two Khuns in some possibilities with the game-end roll', () => {
		// Black's Khon on f5 is already captured in the first world only; the White Khun takes the Met in both
		const s = S([[{ a1: '0:k', b2: '1:m', h8: '1:k', f5: '1:s' }, 1]], 0, 10)
		const b = s.worlds[0].b
		const twin = { b: cloneWorld(b), w: T - Math.floor(T / 2) }
		placePiece(b, b.board[V.topology.byName('f5')], OFF)
		const st = { ...s, worlds: [{ b, w: Math.floor(T / 2) }, twin] }
		expect(outcomes(V, st, 'a1-b2').map((o) => [o.key, o.p, o.rolled, o.notes])).toEqual([
			['capture', 0.5, true, ['end:{"winner":null,"reason":"bareKings"}']],
			['capture', 0.5, true, ['end:null']],
		])
		expect(applyOutcome(V, st, 'a1-b2', 0).result).toEqual({ winner: null, reason: 'bareKings' })
		const on = applyOutcome(V, st, 'a1-b2', 1)
		expect([on.result, show(on)]).toEqual([null, '1.00 Kb2 kh8 sf5'])
	})

	it('draws at once when a roll that captures nothing leaves a count already used up (Q9)', () => {
		/**
		 * Black to move 20 moves after the last capture; its Met on a3 is already captured in the second world.
		 *
		 * @param {string} rua the square of White's second Rua
		 * @return {object}
		 */
		function q9(rua) {
			const s = S([[{ a1: '0:k', b2: '0:r', [rua]: '0:r', h8: '1:k', a3: '1:m' }, 1]], 1, 40)
			const b = s.worlds[0].b
			const twin = { b: cloneWorld(b), w: T - Math.floor(T / 2) }
			placePiece(twin.b, b.board[V.topology.byName('a3')], OFF)
			return { ...s, worlds: [{ b, w: Math.floor(T / 2) }, twin] }
		}
		const s = q9('c1')
		expect([countInfo(s), outs(s, 'a3-b2')]).toEqual([null, ['miss 0.5 R', 'capture 0.5 R']])
		const missed = applyOutcome(V, s, 'a3-b2', 0)
		expect([missed.result, missed.quiet, missed.turn, show(missed)])
			.toEqual([{ winner: null, reason: 'count' }, 41, 0, '1.00 Ka1 Rb2 Rc1 kh8'])
		expect([countInfo(missed).done, countInfo(missed).allow]).toEqual([20, 5])
		const captured = applyOutcome(V, s, 'a3-b2', 1)
		expect([captured.result, captured.quiet, countInfo(captured), show(captured)])
			.toEqual([null, 0, null, '1.00 Ka1 Rc1 kh8 mb2'])
		// the chaser to move can take the Khun for certain: the draw waits, and the display stops at 5/5
		const waits = applyOutcome(V, q9('h1'), 'a3-b2', 0)
		expect([waits.result, waits.quiet]).toEqual([null, 41])
		expect([V.sideInfo(waits, 0), V.sideInfo(waits, 1)]).toEqual([
			{ text: '5/5', title: 'Counting: 5 of 5 moves to capture the lone Khun' },
			null,
		])
		expect(play(V, waits, 'h1-h8').result).toEqual({ winner: 0, reason: 'king' })
		const late = play(V, waits, 'h1-g1')
		expect([late.result, V.sideInfo(late, 0).text]).toEqual([{ winner: null, reason: 'count' }, '5/5'])
	})

	it('rolls the game end of a split that stalemates in one possibility (Q10)', () => {
		const s = S([[{ f7: '0:k', f5: '0:m', h8: '1:k' }, 1]])
		expect(outcomes(V, s, 'f5-e6|g6').map((o) => [o.key, o.p, o.rolled, o.notes])).toEqual([
			['split', 0.5, true, ['end:null']],
			['split', 0.5, true, ['end:{"winner":null,"reason":"stalemate"}']],
		])
		const goesOn = applyOutcome(V, s, 'f5-e6|g6', 0)
		expect([goesOn.result, show(goesOn), budget(goesOn, 0)]).toEqual([null, '1.00 Kf7 Me6 kh8', 1])
		const drawn = applyOutcome(V, s, 'f5-e6|g6', 1)
		expect([drawn.result, show(drawn)]).toEqual([{ winner: null, reason: 'stalemate' }, '1.00 Kf7 Mg6 kh8'])
	})

	it('counts every chaser turn, a split and a measurement too', () => {
		let s = play(V, S([[{ a1: '0:k', b2: '0:r', c3: '0:r', h8: '1:k', b7: '1:n' }, 1]], 0, 30), 'b2-b7')
		s = playAll(s, ['h8-g8', 'c3-c4|c5'])
		expect([countInfo(s).done, budget(s, 0), s.result]).toEqual([1, 2, null])
		s = play(V, s, 'g8-h8')
		s = applyOutcome(V, s, '?c4', 0)
		expect([countInfo(s).done, s.worlds.length, s.result]).toEqual([2, 1, null])
	})

	it('waits with the 64-move draw for a certain capture, also a converging one', () => {
		const W = { f7: '0:k', h1: '0:r', h8: '1:k', a8: '1:n' }
		expect(play(V, S([[{ ...W, c3: '0:n' }, 1], [{ ...W, e3: '0:n' }, 1]], 1, 129), 'a8-b6').result).toBeNull()
		const W2 = { f7: '0:k', h8: '1:k', a8: '1:n' }
		expect(play(V, S([[{ ...W2, h1: '0:r' }, 1], [{ ...W2, g1: '0:r' }, 1]], 1, 129), 'a8-b6').result)
			.toEqual({ winner: null, reason: 'quiet' })
		const W3 = { f7: '0:k', h8: '1:k', a5: '1:n' }
		const s = play(V, S([[{ ...W3, h1: '0:r' }, 1], [{ ...W3, a8: '0:r' }, 1]], 1, 129), 'a5-b3')
		expect([s.result, s.quiet]).toEqual([null, 130])
		expect(codes(s).filter((c) => c.includes('|'))).toEqual(['h1|a8-a1', 'h1|a8-h8'])
		expect(outs(s, 'h1|a8-h8')).toEqual(['capture 1'])
		expect(outs(s, 'h1-h8')).toEqual(['miss 0.5 R', 'capture 0.5 R'])
		expect(play(V, s, 'h1|a8-h8').result).toEqual({ winner: 0, reason: 'king' })
	})

	it('shows the danger of a ghost Ma and rolls its capture of the Khun', () => {
		const s = S([[{ a1: '0:k', e6: '0:n', f8: '1:k' }, 1], [{ a1: '0:k', c6: '0:n', f8: '1:k' }, 1]], 1)
		expect(royalDanger(V, s, 1)).toBe(0.5)
		const shot = S([[{ a1: '0:k', e6: '0:n', g7: '1:k' }, 1], [{ a1: '0:k', c6: '0:n', g7: '1:k' }, 1]])
		expect(outs(shot, 'e6-g7')).toEqual(['miss 0.5 R', 'capture 0.5 R'])
		expect(applyOutcome(V, shot, 'e6-g7', 1).result).toEqual({ winner: 0, reason: 'king' })
	})
})

describe('makruk: the computer player', () => {
	it('plays a legal move from the start position at every level within its time budget', async () => {
		const s = newGame(V, {})
		for (const level of LEVELS) {
			const elapsed = stopwatch()
			const code = await chooseMove(V, s, { level: level.id, rng: () => 0.5 })
			expect(branches(V, s, code), level.id).not.toBeNull()
			expect(elapsed(), level.id).toBeLessThan(level.timeMs + 500)
		}
	}, 20000)

	it('values advanced Bias and drives a lone Khun to the edge', () => {
		const start = newGame(V, {}).worlds[0].b
		expect(V.evaluate(start, 0)).toBe(0)
		const pushed = stateOf(V, [[{ ...K, e5: '0:p', e6: '1:p' }, 1]], 0, () => {}).worlds[0].b
		expect(V.evaluate(pushed, 0)).toBeGreaterThan(0)
		const edge = S([[{ d4: '0:k', a8: '1:k', b1: '0:r' }, 1]]).worlds[0].b
		const centre = S([[{ d4: '0:k', e6: '1:k', b1: '0:r' }, 1]]).worlds[0].b
		expect(V.evaluate(edge, 0)).toBeGreaterThan(V.evaluate(centre, 0))
		expect(V.evaluate(edge, 1)).toBe(-V.evaluate(edge, 0))
	})
})
