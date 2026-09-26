/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Antichess: compulsory capture in every possibility and over the whole state, the non-royal king, promotion to a
 * king, the win by losing everything or by having no move, the "no capture can ever happen again" draw, the quiet
 * counter, and how these rules meet splits, merges, rolls and links; random games check that every world keeps the
 * same en passant square, castling rights (none) and pieces, within the budget. The cases T1-T24 are those of section
 * 7 of handoff/research/antichess.md.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { resultText } from '../../../src/variantplay/texts.js'
import V from '../../../src/variants/antichess.js'
import { chooseMove, LEVELS, mightForce } from '../../../src/variants/core/ai.js'
import { castlingMoves, castlingRights } from '../../../src/variants/core/orthodox.js'
import {
	applyMove,
	applyOutcome,
	budget,
	budgetInfo,
	isLegal,
	legalMoves,
	MAX_LOCATIONS,
	mergesFrom,
	mustCapture,
	newGame,
	outcomes,
	pieceLocations,
	splitCode,
	splitsFrom,
	splitTargets,
	T,
} from '../../../src/variants/core/quantum.js'
import { generate, nameOf, worldFrom } from '../../../src/variants/core/world.js'
import { play, stateOf, stopwatch, workClock } from './helpers.js'

const sq = (name) => V.topology.byName(name)
const PROMOS = ['q', 'r', 'b', 'n', 'k']

/**
 * The legal codes of a state, sorted.
 *
 * @param {object} s state
 * @param {boolean} [splits] include splits
 * @return {string[]}
 */
function codes(s, splits = true) {
	return legalMoves(V, s, { splits }).map((m) => m.code).sort()
}

/**
 * The outcomes of a move as `[key, p, notes]`.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {Array|null}
 */
function outs(s, code) {
	const list = outcomes(V, s, code)
	return list && list.map((o) => [o.key, o.p, o.notes.join(';')])
}

/**
 * Play the outcome of a move chosen by a predicate on its outcome (not by index: the order follows the worlds).
 *
 * @param {object} s state
 * @param {string} code move code
 * @param {(o: object) => boolean} pred which outcome
 * @return {object}
 */
function playWhere(s, code, pred) {
	const list = outcomes(V, s, code)
	expect(list, 'legal: ' + code).not.toBeNull()
	const i = list.findIndex(pred)
	expect(i, 'outcome of ' + code).toBeGreaterThanOrEqual(0)
	return applyOutcome(V, s, code, i)
}

/**
 * The pieces of every world with its probability: `'0.5 Be5 ka8 nh5'` (White upper case, pieces sorted).
 *
 * @param {object} s state
 * @return {string[]}
 */
function show(s) {
	return s.worlds.map(({ b, w }) => {
		const list = []
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sq[id] >= 0) {
				list.push((b.sd[id] === 0 ? b.ty[id].toUpperCase() : b.ty[id]) + nameOf(V, b.sq[id]))
			}
		}
		return [String(w / T), ...list.sort()].join(' ')
	}).sort()
}

/**
 * A state of one world.
 *
 * @param {Record<string, string>} placement pieces
 * @param {number} [turn] side to move
 * @return {object}
 */
function one(placement, turn = 0) {
	return stateOf(V, [[placement, 1]], turn)
}

describe('antichess: setup and declaration', () => {
	it('starts from the orthodox position without castling rights (T1)', () => {
		const s = newGame(V)
		expect(s.worlds).toHaveLength(1)
		const b = s.worlds[0].b
		const expected = {}
		'rnbqkbnr'.split('').forEach((type, f) => {
			const file = 'abcdefgh'[f]
			expected[file + '1'] = '0' + type
			expected[file + '2'] = '0p'
			expected[file + '7'] = '1p'
			expected[file + '8'] = '1' + type
		})
		const actual = {}
		for (let id = 0; id < b.sq.length; id++) {
			actual[nameOf(V, b.sq[id])] = b.sd[id] + b.ty[id]
		}
		expect(actual).toEqual(expected)
		expect(b.x).toEqual({ ep: -1, epVictim: -1, castle: [] })
		expect(s.turn).toBe(0)
		expect(s.result).toBeNull()
		expect(codes(s, false)).toHaveLength(20)
		expect(codes(s).filter((c) => c.includes('|'))).toEqual(['b1-a3|c3', 'g1-f3|h3'])
	})

	it('never castles, even with castling rights and an empty back rank (T1)', () => {
		// no capture anywhere, so compulsory capture cannot hide a castling move either
		const placement = { e1: '0:k', a1: '0:r', h1: '0:r', c7: '1:p', b8: '1:k' }
		const w = worldFrom(V, placement, {})
		w.x = { ep: -1, epVictim: -1, castle: castlingRights(V, w) }
		expect(w.x.castle.filter((c) => c.side === 0).map((c) => c.flag)).toEqual(['K', 'Q'])
		// the core would castle both ways here: the test position really allows it
		expect(castlingMoves(V, w, 0).map((m) => m.key)).toEqual(['O-O', 'O-O-O'])
		const keys = [...generate(V, w, 0).keys()]
		expect(keys).toHaveLength(24)
		expect(keys.filter((k) => k.startsWith('O'))).toEqual([])
		const s = stateOf(V, [[placement, 1]], 0, (b) => {
			b.x = { ep: -1, epVictim: -1, castle: castlingRights(V, b) }
		})
		expect(mustCapture(V, s)).toBe(false)
		expect(codes(s, false)).toHaveLength(24)
		expect(codes(s).filter((c) => c.startsWith('O'))).toEqual([])
		expect(isLegal(V, s, 'O-O')).toBe(false)
		expect(isLegal(V, s, 'O-O-O')).toBe(false)
	})

	it('has no royal piece, solid kings and pawns, and only pawns reset the quiet counter (T1)', () => {
		expect(V.id).toBe('antichess')
		expect(V.category).toBe('rules')
		expect([...V.royalTypes]).toEqual([])
		expect([...V.solidTypes].sort()).toEqual(['k', 'p'])
		expect([...V.quietTypes]).toEqual(['p'])
		expect(V.compulsoryCapture).toBe(true)
		expect(V.materialSign).toBe(-1)
		expect(V.types.p.promote.to).toEqual(PROMOS)
		for (const [id, type] of Object.entries(V.types)) {
			expect(typeof type.name(), id).toBe('string')
			expect(type.glyph, id).toEqual({ sprite: id })
			expect(type.value, id).toBe(100)
			expect(type.splittable, id).toBe(!['k', 'p'].includes(id))
		}
		const rules = V.rules()
		expect(rules.length).toBeGreaterThanOrEqual(3)
		expect(rules.length).toBeLessThanOrEqual(8)
		expect(rules.every((r) => typeof r === 'string' && r.length > 0)).toBe(true)
		for (const reason of ['allLost', 'stalemate', 'bishops']) {
			expect(typeof V.reasonText(reason)).toBe('string')
		}
		expect(V.reasonText('quiet')).toBeNull()
		expect(V.sideInfo(newGame(V), 1).text).toContain('16')
	})

	it('switches the classic end rules off: no "cannot escape" win, no bare-kings draw (LEAD-DECISIONS L1)', () => {
		expect([V.escapeRule, V.bareKingsDraw, V.drawsWait]).toEqual([false, false, false])
		// en passant exists, so the shared rules card keeps its castling and en passant sentence (L2)
		expect(V.specialMoves).toBe(true)
		// every move of the lone white king walks into a rook (checkmate in chess): the game simply goes on
		const boxed = play(V, one({ a1: '0:k', b8: '1:r', h3: '1:r' }, 1), 'h3-h2')
		expect(codes(boxed)).toEqual(['a1-a2', 'a1-b1', 'a1-b2'])
		expect(boxed.result).toBeNull()
		const kings = play(V, one({ a1: '0:k', h8: '1:k' }), 'a1-b1')
		expect(kings.result).toBeNull()
		expect(kings.quiet).toBe(1)
	})

	it('describes the winner in the result texts', () => {
		expect(resultText(V, { winner: 1, reason: 'allLost' })).toBe('Black wins (the winner has no pieces left)')
		expect(resultText(V, { winner: 0, reason: 'stalemate' })).toBe('White wins (the winner has no move left)')
		expect(resultText(V, { winner: null, reason: 'bishops' })).toBe('Draw (no capture can ever happen again)')
		expect(V.sideInfo(newGame(V), 0)).toEqual({
			text: 'Pieces: 16',
			title: 'Pieces on the board: lose them all to win',
		})
	})
})

describe('antichess: movement', () => {
	it('moves every piece type as in chess (counts from d4 and e2)', () => {
		const count = (type) => codes(one({ d4: '0:' + type, h7: '1:p' }), false).length
		expect(count('k')).toBe(8)
		expect(count('q')).toBe(27)
		expect(count('r')).toBe(14)
		expect(count('b')).toBe(13)
		expect(count('n')).toBe(8)
		expect(codes(one({ e2: '0:p', h7: '1:p' }), false)).toEqual(['e2-e3', 'e2-e4'])
		expect(codes(one({ e2: '0:p', h7: '1:p' }, 1), false)).toEqual(['h7-h5', 'h7-h6'])
	})

	it('forces a capture and lets the player choose among captures (T2, T3)', () => {
		const s = play(V, play(V, newGame(V), 'e2-e3'), 'b7-b5')
		expect(codes(s)).toEqual(['f1-b5'])
		expect(mustCapture(V, s)).toBe(true)
		expect(codes(one({ a1: '0:r', c3: '0:n', a8: '1:r', b5: '1:p', h7: '1:p' }))).toEqual(['a1-a8', 'c3-b5'])
	})

	it('treats the king as an ordinary piece that must capture and can be captured (T4)', () => {
		expect(codes(one({ d4: '0:k', e4: '1:r', h7: '1:p' }))).toEqual(['d4-e4'])
		const s = one({ a1: '0:k', h2: '0:p', a4: '1:r' }, 1)
		expect(codes(s)).toEqual(['a4-a1'])
		const after = play(V, s, 'a4-a1')
		expect(after.result).toBeNull()
		expect(show(after)).toEqual(['1 Ph2 ra1'])
	})

	it('promotes to a king as well, also by a compulsory capture (T5)', () => {
		const s = one({ e7: '0:p', a5: '1:p' })
		expect(codes(s)).toEqual(PROMOS.map((p) => 'e7-e8=' + p).sort())
		const k = play(V, s, 'e7-e8=k')
		expect(show(k)).toEqual(['1 Ke8 pa5'])
		expect(k.result).toBeNull()
		const c = one({ e7: '0:p', a2: '0:p', d8: '1:n', h7: '1:p' })
		c.quiet = 10
		expect(codes(c)).toEqual(PROMOS.map((p) => 'e7-d8=' + p).sort())
		const after = play(V, c, 'e7-d8=k')
		expect(show(after)).toEqual(['1 Kd8 Pa2 ph7'])
		expect(after.quiet).toBe(0)
		expect(after.result).toBeNull()
	})

	it('makes en passant a compulsory, certain capture (T6)', () => {
		const s = play(V, one({ e5: '0:p', a2: '0:p', d7: '1:p', h7: '1:p' }, 1), 'd7-d5')
		expect(codes(s)).toEqual(['e5-d6'])
		expect(outs(s, 'e5-d6')).toEqual([['capture', 1, '']])
		expect(show(play(V, s, 'e5-d6'))).toEqual(['1 Pa2 Pd6 ph7'])
	})
})

describe('antichess: winning and drawing', () => {
	it('gives the win to the side that lost all its pieces (T7)', () => {
		const s = one({ a1: '0:r', a7: '1:p' })
		expect(codes(s)).toEqual(['a1-a7'])
		const after = play(V, s, 'a1-a7')
		expect(after.result).toEqual({ winner: 1, reason: 'allLost' })
		expect(legalMoves(V, after)).toEqual([])
	})

	it('gives the win to the side that has no move (T8)', () => {
		const s = one({ h2: '0:p', h3: '1:p', b8: '1:n' }, 1)
		expect(codes(s)).toEqual(['b8-a6', 'b8-a6|c6', 'b8-a6|d7', 'b8-c6', 'b8-c6|d7', 'b8-d7'])
		expect(play(V, s, 'b8-c6').result).toEqual({ winner: 0, reason: 'stalemate' })
		expect(V.noMoves({ turn: 1 })).toEqual({ winner: 1, reason: 'stalemate' })
	})

	it('draws when no capture can ever happen again, locked pawns included (T9)', () => {
		const draw = { winner: null, reason: 'bishops' }
		const a = one({ c1: '0:b', c8: '1:b', g5: '1:n' })
		expect(codes(a)).toEqual(['c1-g5'])
		expect(play(V, a, 'c1-g5').result).toEqual(draw)
		const same = play(V, one({ c1: '0:b', f8: '1:b', g5: '1:n' }), 'c1-g5')
		expect(same.result).toBeNull()
		expect(codes(same, false)).toHaveLength(7)
		expect(play(V, one({ f1: '0:b', g7: '0:p', b4: '1:b' }), 'g7-g8=b').result).toEqual(draw)
		const locked = one({ e6: '0:b', g6: '0:p', e4: '0:p', g7: '1:p', e5: '1:p', c2: '1:p' }, 1)
		expect(codes(locked)).toEqual(PROMOS.map((p) => 'c2-c1=' + p).sort())
		expect(play(V, locked, 'c2-c1=b').result).toEqual(draw)
		// a pawn on the enemy bishops' colour, a pawn blocked by a bishop, and a pending en passant
		const enemyColour = one({ b6: '0:b', g6: '0:p', e4: '0:p', g7: '1:p', e5: '1:p', d2: '1:p' }, 1)
		expect(play(V, enemyColour, 'd2-d1=b').result).toBeNull()
		const byBishop = one({ e6: '0:b', g6: '0:p', e4: '0:p', f6: '1:b', e5: '1:p' }, 1)
		expect(play(V, byBishop, 'f6-g7').result).toBeNull()
		const ep = play(V, one({ a1: '0:b', d4: '0:p', e5: '0:p', h1: '1:b', d7: '1:p', e6: '1:p' }, 1), 'd7-d5')
		expect(ep.result).toBeNull()
		expect(codes(ep)).toEqual(['e5-d6'])
		// two bare kings are not a draw
		expect(play(V, one({ a1: '0:k', h8: '1:k' }), 'a1-b1').result).toBeNull()
	})

	it('checks the wins before the draws, as lichess does', () => {
		// after e2-f1 no capture can ever happen again, but Black has no move (h8 and g7 are blocked): Black wins
		const s = one({ e2: '0:b', g6: '0:p', h8: '1:b', g7: '1:p' })
		expect(mustCapture(V, s)).toBe(false)
		expect(play(V, s, 'e2-f1').result).toEqual({ winner: 1, reason: 'stalemate' })
		// the same with Black's bishop free on a1: the draw
		expect(play(V, one({ e2: '0:b', g6: '0:p', a1: '1:b', g7: '1:p' }), 'e2-f1').result)
			.toEqual({ winner: null, reason: 'bishops' })
		// the 100th quiet ply leaves White without a move: White's win, not the 50-move draw
		const quiet = one({ h2: '0:p', h3: '1:p', b8: '1:n' }, 1)
		quiet.quiet = 99
		const won = play(V, quiet, 'b8-c6')
		expect(won.quiet).toBe(100)
		expect(won.result).toEqual({ winner: 0, reason: 'stalemate' })
	})

	it('counts 50 moves without a capture or pawn move; king moves and misses do not reset it (T20, T21)', () => {
		const s = stateOf(V, [
			[{ a1: '0:k', h1: '0:n', c2: '0:p', h8: '1:k', c4: '1:n' }, 1],
			[{ a1: '0:k', h1: '0:n', c2: '0:p', h8: '1:k', c3: '1:n' }, 1],
		])
		s.quiet = 10
		expect(mustCapture(V, s)).toBe(false)
		expect(outs(s, 'c2-c3')).toEqual([['miss', 0.5, ''], ['move', 0.5, '']])
		expect(play(V, s, 'a1-a2').quiet).toBe(11)
		expect(play(V, s, 'h1-g3').quiet).toBe(11)
		expect(playWhere(s, 'c2-c3', (o) => o.key === 'miss').quiet).toBe(11)
		expect(playWhere(s, 'c2-c3', (o) => o.key === 'move').quiet).toBe(0)
		const promo = one({ e7: '0:p', a5: '1:p' })
		promo.quiet = 10
		expect(play(V, promo, 'e7-e8=k').quiet).toBe(0)
		const kings = one({ a1: '0:k', h8: '1:k' })
		kings.quiet = 99
		expect(play(V, kings, 'a1-b1').result).toEqual({ winner: null, reason: 'quiet' })
	})
})

describe('antichess: quantum', () => {
	it('splits from the start, and a split part the enemy could take forces it to try', () => {
		const s = play(V, newGame(V), 'g1-f3|h3')
		expect(s.worlds.map((e) => e.w)).toEqual([T / 2, T / 2])
		expect(budget(s, 0)).toBe(2)
		expect(mustCapture(V, s)).toBe(false)
		const probe = play(V, one({ a1: '0:k', g1: '0:n', e4: '1:p', h8: '1:k' }), 'g1-f3|h3')
		expect(mustCapture(V, probe)).toBe(true)
		expect(codes(probe)).toEqual(['e4-f3'])
		expect(outs(probe, 'e4-f3')).toEqual([['miss', 0.5, ''], ['capture', 0.5, '']])
	})

	it('forces a capture try that exists in one possibility only (T10, T15)', () => {
		const s = stateOf(V, [
			[{ d4: '0:p', g1: '0:n', a8: '1:k', e5: '1:n' }, 1],
			[{ d4: '0:p', g1: '0:n', a8: '1:k', h5: '1:n' }, 1],
		])
		expect(mustCapture(V, s)).toBe(true)
		expect(codes(s)).toEqual(['d4-e5'])
		expect(outs(s, 'd4-e5')).toEqual([['miss', 0.5, ''], ['capture', 0.5, '']])
		expect(isLegal(V, s, 'g1-f3')).toBe(false)
		// your own ghost forces you
		const own = stateOf(V, [[{ a1: '0:r', c2: '0:p', a8: '1:n' }, 1], [{ h1: '0:r', c2: '0:p', a8: '1:n' }, 1]])
		expect(codes(own)).toEqual(['a1-a8'])
		expect(outs(own, 'a1-a8')).toEqual([['miss', 0.5, ''], ['capture', 0.5, '']])
		expect(isLegal(V, own, 'c2-c3')).toBe(false)
	})

	it('rolls a capture try into Captured, Moved or Missed (T11)', () => {
		const at = (x, extra) => ({ c3: '0:b', [x]: '1:n', a8: '1:k', ...extra })
		const s = stateOf(V, [[at('e5', { g1: '0:n' }), 1], [at('h5', { g1: '0:n' }), 1]])
		expect(codes(s)).toEqual(['c3-e5'])
		expect(outs(s, 'c3-e5')).toEqual([['move', 0.5, ''], ['capture', 0.5, '']])
		expect(show(playWhere(s, 'c3-e5', (o) => o.key === 'move'))).toEqual(['1 Be5 Ng1 ka8 nh5'])
		expect(show(playWhere(s, 'c3-e5', (o) => o.key === 'capture'))).toEqual(['1 Be5 Ng1 ka8'])
		const b = stateOf(V, [[at('e5', { h1: '0:r' }), 1], [at('h5', { h1: '0:r' }), 1]])
		expect(codes(b)).toEqual(['c3-e5', 'h1-h5'])
		expect(outs(b, 'c3-e5')).toEqual([['miss', 0.5, ''], ['capture', 0.5, '']])
		expect(outs(b, 'h1-h5')).toEqual([['miss', 0.5, ''], ['capture', 0.5, '']])
		const c = stateOf(V, [[at('e5', { h1: '0:r' }), 2], [at('h5', { h1: '0:r' }), 1], [at('b8', { h1: '0:r' }), 1]])
		expect(codes(c)).toEqual(['c3-e5', 'h1-h5'])
		expect(outs(c, 'c3-e5')).toEqual([['miss', 0.25, ''], ['move', 0.25, ''], ['capture', 0.5, '']])
		expect(outs(c, 'h1-h5')).toEqual([['miss', 0.5, ''], ['move', 0.25, ''], ['capture', 0.25, '']])
		expect(show(playWhere(c, 'c3-e5', (o) => o.key === 'move'))).toEqual(['1 Be5 Rh1 ka8 nb8'])
	})

	it('allows no split or measure while a capture is possible, only merges that might capture (T12)', () => {
		const s = stateOf(V, [
			[{ c3: '0:n', e4: '0:p', d5: '1:p', a8: '1:k' }, 1],
			[{ e3: '0:n', e4: '0:p', d5: '1:p', a8: '1:k' }, 1],
		])
		expect(codes(s)).toEqual(['c3-d5', 'c3|e3-d5', 'e3-d5', 'e4-d5'])
		expect(isLegal(V, s, '?c3')).toBe(false)
		expect(isLegal(V, s, 'c3-b1|b5')).toBe(false)
		expect(splitTargets(V, s, sq('c3'))).toEqual([])
		expect(mergesFrom(V, s, sq('c3')).map((m) => m.code)).toEqual(['c3|e3-d5'])
		expect(outs(s, 'c3|e3-d5')).toEqual([['capture', 1, '']])
		expect(outs(s, 'c3-d5')).toEqual([['miss', 0.5, ''], ['capture', 0.5, '']])
		const free = stateOf(V, [
			[{ c3: '0:n', a2: '0:p', h7: '1:p', a8: '1:k' }, 1],
			[{ e3: '0:n', a2: '0:p', h7: '1:p', a8: '1:k' }, 1],
		])
		for (const code of ['?c3', 'c3|e3-d5', 'c3|e3-d1', 'c3-b1|b5']) {
			expect(isLegal(V, free, code), code).toBe(true)
		}
	})

	it('settles a converging capture try (merge) like any capture try (T18)', () => {
		const at = (x, y, extra = {}) => ({ [x]: '0:n', a2: '0:p', [y]: '1:n', a8: '1:k', ...extra })
		const four = (extra) => stateOf(V, [
			[at('c3', 'd5', extra), 1],
			[at('e3', 'd5', extra), 1],
			[at('c3', 'h5', extra), 1],
			[at('e3', 'h5', extra), 1],
		])
		const s = four()
		expect(mustCapture(V, s)).toBe(true)
		expect(codes(s)).toEqual(['c3-d5', 'c3|e3-d5', 'e3-d5'])
		expect(outs(s, 'c3|e3-d5')).toEqual([['move', 0.5, ''], ['capture', 0.5, '']])
		expect(outs(s, 'c3-d5')).toEqual([['miss', 0.5, ''], ['move', 0.25, ''], ['capture', 0.25, '']])
		expect(show(playWhere(s, 'c3|e3-d5', (o) => o.key === 'move'))).toEqual(['1 Nd5 Pa2 ka8 nh5'])
		expect(show(playWhere(s, 'c3|e3-d5', (o) => o.key === 'capture'))).toEqual(['1 Nd5 Pa2 ka8'])
		const r = four({ h1: '0:r' })
		expect(codes(r)).toEqual(['c3-d5', 'c3|e3-d5', 'e3-d5', 'h1-h5'])
		expect(outs(r, 'c3|e3-d5')).toEqual([['miss', 0.5, ''], ['capture', 0.5, '']])
		expect(isLegal(V, r, 'c3|e3-d1')).toBe(false)
		expect(show(playWhere(r, 'c3|e3-d5', (o) => o.key === 'miss')))
			.toEqual(['0.5 Nc3 Pa2 Rh1 ka8 nh5', '0.5 Ne3 Pa2 Rh1 ka8 nh5'])
	})

	it('links a slider that passes its own ghost when no capture is possible (pass = link)', () => {
		const s = stateOf(V, [
			[{ a1: '0:r', a4: '0:n', h8: '1:k', h7: '1:p' }, 1],
			[{ a1: '0:r', c6: '0:n', h8: '1:k', h7: '1:p' }, 1],
		])
		expect(mustCapture(V, s)).toBe(false)
		expect(outcomes(V, s, 'a1-a8')).toEqual([expect.objectContaining({ key: 'move', p: 1, rolled: false })])
		expect(show(play(V, s, 'a1-a8'))).toEqual(['0.5 Na4 Ra1 kh8 ph7', '0.5 Nc6 Ra8 kh8 ph7'])
	})

	it('keeps the 4-square bound on splits: a piece on 4 squares cannot split again (section 4.6)', () => {
		let s = one({ e1: '0:r', b2: '0:n', c7: '1:k' })
		for (const code of ['e1-a1|h1', 'c7-d7', 'h1-h2|h3', 'd7-c7', 'h3-g3|h4', 'c7-d7']) {
			s = play(V, s, code)
		}
		const rook = s.worlds[0].b.ty.indexOf('r')
		const squares = pieceLocations(s, rook).map((l) => nameOf(V, l.sq))
		expect(squares.sort()).toEqual(['a1', 'g3', 'h2', 'h4'])
		expect(squares).toHaveLength(MAX_LOCATIONS)
		// the budget still has room (4 of 8): only the bound stops the rook, not the knight
		expect(budgetInfo(V, s, 0)).toEqual({ used: 4, limit: 8, sides: [0] })
		for (const name of squares) {
			// there are empty squares to split to, but every split would put the rook on a fifth square
			const [t1, t2] = splitTargets(V, s, sq(name))
			expect(t2, name).toBeDefined()
			expect(isLegal(V, s, splitCode(V, sq(name), t1, t2)), name).toBe(false)
			expect(splitsFrom(V, s, sq(name)), name).toEqual([])
		}
		expect(splitsFrom(V, s, sq('b2')).map((m) => m.code)).toContain('b2-a4|c4')
	})

	it('lets the game-end roll decide a stalemate caused by a ghost, the opponent\'s or your own (T13, T19)', () => {
		const t13 = stateOf(V, [
			[{ h2: '0:p', h3: '1:p', e8: '1:k', g3: '1:n' }, 1],
			[{ h2: '0:p', h3: '1:p', e8: '1:k', b1: '1:n' }, 1],
		], 1)
		expect(outs(t13, 'e8-d8')).toEqual([
			['move', 0.5, 'end:null'],
			['move', 0.5, 'end:{"winner":0,"reason":"stalemate"}'],
		])
		const goesOn = playWhere(t13, 'e8-d8', (o) => o.notes[0] === 'end:null')
		expect(codes(goesOn)).toEqual(['h2-g3'])
		const won = playWhere(t13, 'e8-d8', (o) => o.notes[0] !== 'end:null')
		expect(won.result).toEqual({ winner: 0, reason: 'stalemate' })
		expect(show(won)).toEqual(['1 Ph2 kd8 nb1 ph3'])
		const t19 = stateOf(V, [
			[{ b3: '0:p', c2: '0:p', a1: '0:n', b4: '1:p', c3: '1:p', e8: '1:k' }, 1],
			[{ b3: '0:p', c2: '0:p', f3: '0:n', b4: '1:p', c3: '1:p', e8: '1:k' }, 1],
		], 1)
		expect(mustCapture(V, t19)).toBe(false)
		const own = playWhere(t19, 'e8-d8', (o) => o.notes[0] !== 'end:null')
		expect(own.result).toEqual({ winner: 0, reason: 'stalemate' })
		expect(show(own)).toEqual(['1 Na1 Pb3 Pc2 kd8 pb4 pc3'])
		expect(codes(playWhere(t19, 'e8-d8', (o) => o.notes[0] === 'end:null'), false)).toHaveLength(8)
	})

	it('decides "all pieces lost" by the capture\'s own roll when the last piece is a ghost (T14)', () => {
		const s = stateOf(V, [[{ b2: '0:b', h2: '0:p', f6: '1:n' }, 1], [{ b2: '0:b', h2: '0:p', a6: '1:n' }, 1]])
		expect(codes(s)).toEqual(['b2-f6'])
		expect(outs(s, 'b2-f6')).toEqual([['move', 0.5, ''], ['capture', 0.5, '']])
		const moved = playWhere(s, 'b2-f6', (o) => o.key === 'move')
		expect(moved.result).toBeNull()
		expect(show(moved)).toEqual(['1 Bf6 Ph2 na6'])
		expect(playWhere(s, 'b2-f6', (o) => o.key === 'capture').result).toEqual({ winner: 1, reason: 'allLost' })
	})

	it('lets a Missed move stalemate the opponent, and the computer sees it (T22)', () => {
		const s = stateOf(V, [[{ b3: '0:p', a1: '0:r', b4: '1:p' }, 1], [{ b3: '0:p', h1: '0:r', b4: '1:p' }, 1]])
		expect(mustCapture(V, s)).toBe(false)
		expect(outs(s, 'a1-a3')).toEqual([
			['move', 0.5, 'end:null'],
			['miss', 0.5, 'end:{"winner":1,"reason":"stalemate"}'],
		])
		expect(mightForce(V, s, 'a1-a3')).toBe(true)
		const missed = playWhere(s, 'a1-a3', (o) => o.key === 'miss')
		expect(missed.result).toEqual({ winner: 1, reason: 'stalemate' })
		expect(show(missed)).toEqual(['1 Pb3 Rh1 pb4'])
		expect(codes(playWhere(s, 'a1-a3', (o) => o.key === 'move'))).toEqual(['b4-a3'])
	})

	it('keeps a promoted king solid (T16)', () => {
		const list = codes(one({ d1: '0:k', a1: '0:q', h7: '1:p' }))
		expect(list.some((c) => c.startsWith('a1-') && c.includes('|'))).toBe(true)
		expect(list.some((c) => c.startsWith('d1-') && c.includes('|'))).toBe(false)
	})

	it('allows en passant only right after the double step, also where a move missed (T17)', () => {
		const at = (knight, rook) => ({ a1: '0:k', d2: '0:p', [knight]: '0:n', e4: '1:p', [rook]: '1:r' })
		let s = stateOf(V, [[at('g1', 'a8'), 1], [at('b1', 'a8'), 1], [at('g1', 'h8'), 1], [at('b1', 'h8'), 1]])
		expect(outs(s, 'd2-d4')).toEqual([['move', 1, '']])
		s = play(V, s, 'd2-d4')
		expect(s.worlds.every((e) => e.b.x.ep === sq('d3'))).toBe(true)
		expect(codes(s)).toEqual(['a8-a1', 'e4-d3'])
		expect(outs(s, 'e4-d3')).toEqual([['capture', 1, '']])
		expect(outs(s, 'a8-a1')).toEqual([['miss', 0.5, ''], ['capture', 0.5, '']])
		s = playWhere(s, 'a8-a1', (o) => o.key === 'miss')
		expect(s.worlds).toHaveLength(2)
		expect(s.worlds.every((e) => e.b.x.ep === -1)).toBe(true)
		// the knight's part moves where it stands; the other possibility stays (no roll)
		expect(outcomes(V, s, 'g1-e2')).toEqual([expect.objectContaining({ key: 'move', p: 1, rolled: false })])
		s = play(V, s, 'g1-e2')
		expect(mustCapture(V, s)).toBe(false)
		expect(isLegal(V, s, 'e4-d3')).toBe(false)
		expect(codes(s, false)).toHaveLength(15)
	})

	it('offers a capture-promotion try onto a ghost; a failed try does not reset the counter (T21)', () => {
		const s = stateOf(V, [
			[{ e7: '0:p', h2: '0:p', a8: '1:k', d8: '1:n' }, 1],
			[{ e7: '0:p', h2: '0:p', a8: '1:k', a6: '1:n' }, 1],
		])
		s.quiet = 10
		expect(mustCapture(V, s)).toBe(true)
		expect(codes(s)).toEqual(PROMOS.map((p) => 'e7-d8=' + p).sort())
		for (const p of PROMOS) {
			expect(outs(s, 'e7-d8=' + p)).toEqual([['miss', 0.5, ''], ['capture', 0.5, '']])
		}
		expect(isLegal(V, s, 'e7-e8=q')).toBe(false)
		expect(isLegal(V, s, 'h2-h3')).toBe(false)
		const missed = playWhere(s, 'e7-d8=k', (o) => o.key === 'miss')
		expect(show(missed)).toEqual(['1 Pe7 Ph2 ka8 na6'])
		expect(missed.quiet).toBe(11)
		const hit = playWhere(s, 'e7-d8=k', (o) => o.key === 'capture')
		expect(show(hit)).toEqual(['1 Kd8 Ph2 ka8'])
		expect(hit.quiet).toBe(0)
		expect(hit.result).toBeNull()
	})

	it('never counts joining your own part as a capture try (T23)', () => {
		const at = (knight, black) => ({ [knight]: '0:n', a1: '0:r', [black]: '1:n', h8: '1:k' })
		const s = stateOf(V, [[at('f3', 'a8'), 1], [at('e5', 'a8'), 1]])
		expect(mustCapture(V, s)).toBe(true)
		expect(codes(s)).toEqual(['a1-a8'])
		expect(isLegal(V, s, 'f3-e5')).toBe(false)
		const free = stateOf(V, [[at('f3', 'b8'), 1], [at('e5', 'b8'), 1]])
		expect(outcomes(V, free, 'f3-e5')).toEqual([expect.objectContaining({ key: 'move', p: 1, rolled: false })])
		expect(show(play(V, free, 'f3-e5'))).toEqual(['1 Ne5 Ra1 kh8 nb8'])
	})
})

describe('antichess: random games', () => {
	it('keeps en passant, castling, the pieces and the budget the same in every world after every move', () => {
		/**
		 * The pieces on the board of a world: id, side and type of each, in id order.
		 *
		 * @param {object} b world
		 * @return {string}
		 */
		const pieces = (b) => b.sq.map((s, id) => (s >= 0 ? id + ':' + b.sd[id] + b.ty[id] : '')).join(',')
		const seen = { plies: 0, ep: 0, epQuantum: 0, splits: 0, worlds: 1 }
		// in games 3, 6 and 7 a split or a link that stays put in some worlds follows a double step: applyMiss must end
		// the en passant right there too, or the worlds disagree
		for (let seed = 1; seed <= 8; seed++) {
			const rng = seededRng(seed)
			let s = newGame(V)
			for (let ply = 0; ply < 60 && !s.result; ply++) {
				// every third ply picks among the splits (when there are any) to put the budget under pressure
				const list = legalMoves(V, s, { splits: true })
				const splits = list.filter((m) => m.type === 'split')
				const pool = ply % 3 === 1 && splits.length ? splits : list
				expect(pool.length, 'a side to move without a result has a legal move').toBeGreaterThan(0)
				const code = pool[Math.floor(rng() * pool.length)].code
				const res = applyMove(V, s, code, rng)
				expect(res, code).not.toBeNull()
				s = res.state
				seen.plies++
				seen.splits += res.branch.key === 'split' ? 1 : 0
				seen.worlds = Math.max(seen.worlds, s.worlds.length)
				const first = s.worlds[0].b
				expect(first.x.castle, code).toEqual([])
				for (const { b } of s.worlds) {
					expect([b.x.ep, b.x.epVictim, b.x.castle], code).toEqual([first.x.ep, first.x.epVictim, []])
					expect(pieces(b), code).toBe(pieces(first))
				}
				if (first.x.ep >= 0) {
					seen.ep++
					seen.epQuantum += s.worlds.length > 1 ? 1 : 0
				}
				for (const side of [0, 1]) {
					const { used, limit } = budgetInfo(V, s, side)
					expect(used, code).toBeLessThanOrEqual(limit)
				}
			}
		}
		// the games really exercise double steps, en passant squares among ghosts, splits and many worlds
		expect(seen.plies).toBeGreaterThan(100)
		expect(seen.ep).toBeGreaterThan(0)
		expect(seen.epQuantum).toBeGreaterThan(0)
		expect(seen.splits).toBeGreaterThan(10)
		expect(seen.worlds).toBeGreaterThanOrEqual(8)
	})
})

describe('antichess: the computer player', () => {
	it('plays only capture tries under the obligation (T24)', async () => {
		const s = stateOf(V, [
			[{ c3: '0:n', e4: '0:p', d5: '1:p', a8: '1:k' }, 1],
			[{ e3: '0:n', e4: '0:p', d5: '1:p', a8: '1:k' }, 1],
		])
		for (const level of ['easy', 'normal', 'hard']) {
			for (let seed = 1; seed <= 3; seed++) {
				const code = await chooseMove(V, s, { level, rng: seededRng(seed), now: workClock() })
				expect(['c3-d5', 'e3-d5', 'e4-d5', 'c3|e3-d5'], level + ' ' + code).toContain(code)
			}
		}
	})

	it('makes a legal move from the start position at every level within its time budget', async () => {
		const s = newGame(V)
		for (const level of LEVELS) {
			const elapsed = stopwatch()
			const code = await chooseMove(V, s, { level: level.id, rng: seededRng(7) })
			expect(elapsed()).toBeLessThan(level.timeMs)
			expect(isLegal(V, s, code), level.id + ' ' + code).toBe(true)
		}
	})

	it('gives a piece away when it can: it prefers the move that forces the opponent to capture', async () => {
		// no capture anywhere; Rd1-d7 and h2-h3 offer a piece to the c8 bishop, which must then take it
		const s = one({ d1: '0:r', h2: '0:p', c8: '1:b', h7: '1:p' })
		for (const level of ['normal', 'hard']) {
			const code = await chooseMove(V, s, { level, rng: seededRng(3), now: workClock() })
			const after = play(V, s, code)
			expect(mustCapture(V, after), level + ' ' + code).toBe(true)
		}
	})
})
