/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Horde: the 36-pawn setup, first-rank double steps without en passant, Black-only castling, the two ways to win,
 * the per-possibility stalemate draw, the quiet counter, and how these rules meet splits, rolls, links, the game-end
 * roll and measurements. The cases T1-T25 are those of section 7 of handoff/research/horde.md.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { resultText } from '../../../src/variantplay/texts.js'
import { chooseMove, LEVELS } from '../../../src/variants/core/ai.js'
import { castlingRights } from '../../../src/variants/core/orthodox.js'
import {
	applyMove,
	applyOutcome,
	branches,
	budget,
	budgetInfo,
	isLegal,
	legalMoves,
	newGame,
	outcomes,
	royalDanger,
	splitsFrom,
	splitTargets,
	T,
} from '../../../src/variants/core/quantum.js'
import { addPiece, applyClassical, attacks, emptyWorld, generate, nameOf } from '../../../src/variants/core/world.js'
import V from '../../../src/variants/horde.js'
import { play, stateOf } from './helpers.js'

const sq = (name) => V.topology.byName(name)
const STALEMATE = { winner: null, reason: 'stalemate' }
const END_STALEMATE = 'end:{"winner":null,"reason":"stalemate"}'

/**
 * The legal codes of a state, sorted.
 *
 * @param {object} s state
 * @param {boolean} [splits] include splits
 * @return {string[]}
 */
function codes(s, splits = false) {
	return legalMoves(V, s, { splits }).map((m) => m.code).sort()
}

/**
 * The outcomes of a move as `{ key, notes, p }`.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {object[]|null}
 */
function outs(s, code) {
	return outcomes(V, s, code)?.map((o) => ({ key: o.key, notes: o.notes, p: o.p })) ?? null
}

/**
 * The pieces of a side in a world, as sorted `type + square` strings.
 *
 * @param {object} b world
 * @param {number} side side index
 * @return {string[]}
 */
function pieces(b, side) {
	const out = []
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sd[id] === side && b.sq[id] >= 0) {
			out.push(b.ty[id] + nameOf(V, b.sq[id]))
		}
	}
	return out.sort()
}

/**
 * Give a world the castling rights of its position (the `edit` argument of `stateOf`).
 *
 * @param {object} b world
 */
function rights(b) {
	b.x = { ep: -1, epVictim: -1, castle: castlingRights(V, b) }
}

/**
 * The castling flags of every world of a state.
 *
 * @param {object} s state
 * @return {string[]}
 */
function flags(s) {
	return s.worlds.map((e) => (e.b.x.castle ?? []).map((c) => c.flag).join(''))
}

/**
 * A list of words, sorted: `words('b a')` is `['a', 'b']`.
 *
 * @param {string} text words separated by spaces
 * @return {string[]}
 */
function words(text) {
	return text.split(' ').sort()
}

/**
 * A placement from a short text: `'Pc2 ke8'` is `{ c2: '0:p', e8: '1:k' }` (upper case White, lower case Black).
 *
 * @param {string} text pieces separated by spaces
 * @return {Record<string, string>}
 */
function place(text) {
	const out = {}
	for (const w of text.split(' ')) {
		const type = w[0]
		out[w.slice(1)] = (type === type.toUpperCase() ? '0:' : '1:') + type.toLowerCase()
	}
	return out
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

/**
 * The ordinary moves of the piece on a square in a one-world state.
 *
 * @param {Record<string, string>} placement pieces
 * @param {number} turn side to move
 * @param {string} from square name
 * @return {string[]}
 */
function movesFrom(placement, turn, from) {
	return codes(one(placement, turn)).filter((c) => c.startsWith(from + '-'))
}

describe('horde: setup and classical rules', () => {
	it('starts with 36 White pawns against the ordinary Black army, White to move (T1)', () => {
		const s = newGame(V)
		expect(s.worlds).toHaveLength(1)
		expect(s.turn).toBe(0)
		expect(s.result).toBeNull()
		const b = s.worlds[0].b
		const white = []
		for (const r of [1, 2, 3, 4]) {
			for (const f of 'abcdefgh') {
				white.push('p' + f + r)
			}
		}
		white.push('pb5', 'pc5', 'pf5', 'pg5')
		expect(pieces(b, 0)).toEqual(white.sort())
		expect(pieces(b, 1)).toEqual(words('ra8 nb8 bc8 qd8 ke8 bf8 ng8 rh8 pa7 pb7 pc7 pd7 pe7 pf7 pg7 ph7'))
		expect(b.x.ep).toBe(-1)
		expect(b.x.epVictim).toBe(-1)
		const right = (c) => [c.flag, ...[c.king, c.kingTo, c.rook, c.rookTo].map((q) => nameOf(V, q))].join(' ')
		expect(b.x.castle.map(right)).toEqual(['k e8 g8 h8 f8', 'q e8 c8 a8 d8'])
		// only the free pawns can move, and White has nothing to split
		expect(codes(s, true)).toEqual(words('a4-a5 b5-b6 c5-c6 d4-d5 e4-e5 f5-f6 g5-g6 h4-h5'))
		const a = play(V, s, 'e4-e5')
		expect(a.result).toBeNull()
		const replies = 'a7-a5 a7-a6 b7-b6 b8-a6 b8-c6 c7-c6 d7-d5 d7-d6 e7-e6 f7-f6 g7-g6 g8-f6 g8-h6 h7-h5 h7-h6'
		expect(codes(a)).toEqual(words(replies))
		expect(codes(a, true).filter((c) => c.includes('|'))).toEqual(['b8-a6|c6', 'g8-f6|h6'])
	})

	it('declares the orthodox pieces with names, sprites and values; only the king is royal', () => {
		expect(V.id).toBe('horde')
		expect(V.category).toBe('rules')
		expect(V.sideCount).toBe(2)
		expect([...V.royalTypes]).toEqual(['k'])
		expect([...V.solidTypes].sort()).toEqual(['k', 'p'])
		expect([...V.quietTypes]).toEqual(['p'])
		expect(Object.keys(V.types).sort()).toEqual(['b', 'k', 'n', 'p', 'q', 'r'])
		const values = { k: 400, q: 900, r: 500, b: 330, n: 320, p: 100 }
		for (const [id, type] of Object.entries(V.types)) {
			expect(typeof type.name(), id).toBe('string')
			expect(type.glyph, id).toEqual({ sprite: id })
			expect(type.value, id).toBe(values[id])
			expect(type.splittable, id).toBe(!['k', 'p'].includes(id))
		}
		expect(V.types.p.promote.to).toEqual(['q', 'r', 'b', 'n'])
		expect(V.topology.size).toBe(64)
		const rules = V.rules()
		expect(rules.length).toBeGreaterThanOrEqual(3)
		expect(rules.length).toBeLessThanOrEqual(8)
		expect(rules.every((r) => typeof r === 'string' && r.length > 0)).toBe(true)
	})

	it('moves every piece type as in chess', () => {
		// promoted White pieces in the middle of an empty board, the Black king out of their way
		expect(movesFrom({ d4: '0:q', e8: '1:k' }, 0, 'd4')).toHaveLength(27)
		expect(movesFrom({ d4: '0:r', e8: '1:k' }, 0, 'd4')).toHaveLength(14)
		expect(movesFrom({ d4: '0:b', e8: '1:k' }, 0, 'd4')).toHaveLength(13)
		expect(movesFrom({ d4: '0:n', e8: '1:k' }, 0, 'd4')).toHaveLength(8)
		expect(movesFrom({ a1: '0:n', e8: '1:k' }, 0, 'a1')).toEqual(['a1-b3', 'a1-c2'])
		// the Black king steps one square in every direction
		expect(movesFrom({ a2: '0:p', e5: '1:k' }, 1, 'e5')).toHaveLength(8)
		expect(movesFrom({ a2: '0:p', h8: '1:k' }, 1, 'h8')).toEqual(['h8-g7', 'h8-g8', 'h8-h7'])
		// White pawns: one step, two from rank 1 or 2, diagonal captures; Black pawns two from rank 7
		expect(movesFrom({ e3: '0:p', e8: '1:k' }, 0, 'e3')).toEqual(['e3-e4'])
		expect(movesFrom({ e2: '0:p', e8: '1:k' }, 0, 'e2')).toEqual(['e2-e3', 'e2-e4'])
		expect(movesFrom({ e1: '0:p', e8: '1:k' }, 0, 'e1')).toEqual(['e1-e2', 'e1-e3'])
		expect(movesFrom({ e4: '0:p', d5: '1:n', f5: '1:p', e8: '1:k' }, 0, 'e4')).toEqual(['e4-d5', 'e4-e5', 'e4-f5'])
		expect(movesFrom({ a2: '0:p', e7: '1:p', e8: '1:k' }, 1, 'e7')).toEqual(['e7-e5', 'e7-e6'])
		expect(movesFrom({ a2: '0:p', e6: '1:p', e8: '1:k' }, 1, 'e6')).toEqual(['e6-e5'])
		expect(movesFrom(place('Pa2 pe2 ke8'), 1, 'e2')).toEqual(words('e2-e1=b e2-e1=n e2-e1=q e2-e1=r'))
	})

	it('allows no en passant after a double step from rank 1 (T2)', () => {
		const s = one({ a1: '0:p', b3: '1:p', e8: '1:k' })
		expect(codes(s)).toEqual(['a1-a2', 'a1-a3'])
		const a = play(V, s, 'a1-a3')
		expect(a.worlds[0].b.x.ep).toBe(-1)
		expect(a.worlds[0].b.x.epVictim).toBe(-1)
		expect(codes(a).filter((c) => c.startsWith('b3'))).toEqual(['b3-b2'])
		expect(isLegal(V, a, 'b3-a2')).toBe(false)
	})

	it('allows en passant after a double step from rank 2, even by a pawn that came from rank 1 (T3)', () => {
		const s = one({ c1: '0:p', d4: '1:p', e8: '1:k' })
		const up = play(V, play(V, s, 'c1-c2'), 'e8-e7')
		expect(codes(up)).toEqual(['c2-c3', 'c2-c4'])
		const a = play(V, up, 'c2-c4')
		expect(a.worlds[0].b.x.ep).toBe(sq('c3'))
		expect(a.worlds[0].b.x.epVictim).toBe(sq('c4'))
		expect(outs(a, 'd4-c3')).toEqual([{ key: 'capture', notes: [], p: 1 }])
		// that pawn was White's last piece
		expect(play(V, a, 'd4-c3').result).toEqual({ winner: 1, reason: 'horde' })
	})

	it('blocks a double step when either square is taken (T4)', () => {
		const s = one({ a1: '0:p', b1: '0:p', a3: '1:n', b2: '1:n', e8: '1:k' })
		expect(codes(s)).toEqual(['a1-a2', 'a1-b2'])
	})

	it('lets White capture en passant after a Black double step (T5)', () => {
		const s = one({ e5: '0:p', d7: '1:p', e8: '1:k' }, 1)
		const a = play(V, s, 'd7-d5')
		expect(codes(a)).toEqual(['e5-d6', 'e5-e6'])
		expect(outs(a, 'e5-d6')).toEqual([{ key: 'capture', notes: [], p: 1 }])
		expect(pieces(play(V, a, 'e5-d6').worlds[0].b, 1)).toEqual(['ke8'])
	})

	it('promotes to a queen, rook, bishop or knight; a capture on h8 ends the castling right (T8)', () => {
		const s = one({ g7: '0:p', h8: '1:r', a8: '1:k' })
		expect(codes(s, true)).toEqual(words('g7-g8=b g7-g8=n g7-g8=q g7-g8=r g7-h8=b g7-h8=n g7-h8=q g7-h8=r'))
		const r = stateOf(V, [[{ g7: '0:p', h8: '1:r', e8: '1:k' }, 1]], 0, rights)
		expect(flags(r)).toEqual(['k'])
		const a = play(V, r, 'g7-h8=q')
		expect(flags(a)).toEqual([''])
		expect(pieces(a.worlds[0].b, 0)).toEqual(['qh8'])
	})

	it('lets only Black castle, certainly and without a roll (T9)', () => {
		const s = stateOf(V, [[{ a2: '0:p', a8: '1:r', e8: '1:k', h8: '1:r' }, 1]], 1, rights)
		expect(s.worlds[0].b.x.castle.every((c) => c.side === 1)).toBe(true)
		expect(codes(s)).toContain('O-O')
		expect(codes(s)).toContain('O-O-O')
		expect(outcomes(V, s, 'O-O').map((o) => [o.key, o.p, o.rolled])).toEqual([['move', 1, false]])
		const a = play(V, s, 'O-O')
		expect(pieces(a.worlds[0].b, 1)).toEqual(['kg8', 'ra8', 'rf8'])
		expect(flags(a)).toEqual([''])
		// White has no king, so it never has a castling right
		expect(newGame(V).worlds[0].b.x.castle.map((c) => c.side)).toEqual([1, 1])
	})

	it('generates the classical moves of the three lichess perft positions (T16)', () => {
		/**
		 * A one-world position from a FEN (castling rights from the FEN, no en passant square).
		 *
		 * @param {string} fen position
		 * @return {{w: object, side: number}}
		 */
		const fromFen = (fen) => {
			const [placement, turn, castle] = fen.split(' ')
			const w = emptyWorld(V)
			placement.split('/').forEach((row, i) => {
				let f = 0
				for (const ch of row) {
					if (/\d/.test(ch)) {
						f += Number(ch)
						continue
					}
					addPiece(w, ch.toLowerCase(), ch === ch.toUpperCase() ? 0 : 1, V.topology.at([f, 7 - i]))
					f++
				}
			})
			w.x = { ep: -1, epVictim: -1, castle: [] }
			w.x.castle = castlingRights(V, w).filter((c) => castle.includes(c.flag))
			return { w, side: turn === 'w' ? 0 : 1 }
		}
		const kingOf = (w) => w.sq.find((s, id) => s >= 0 && w.sd[id] === 1 && w.ty[id] === 'k')
		/**
		 * The classically legal successors: Black may not leave its king attacked or castle out of or through an
		 * attack (the variant itself has no check).
		 *
		 * @param {object} w world
		 * @param {number} side side to move
		 * @return {object[]}
		 */
		const legal = (w, side) => {
			const out = []
			for (const m of generate(V, w, side).values()) {
				const next = applyClassical(V, w, m)
				if (side === 1) {
					if (attacks(V, next, 0, kingOf(next))) {
						continue
					}
					if (m.kind === 'castle') {
						const [kf, kr] = V.topology.coords[m.from]
						const tf = V.topology.coords[m.extra.kingTo][0]
						const files = []
						for (let f = kf; f !== tf; f += Math.sign(tf - kf)) {
							files.push(f)
						}
						if (files.some((f) => attacks(V, w, 0, V.topology.at([f, kr])))) {
							continue
						}
					}
				}
				out.push(next)
			}
			return out
		}
		const perft = (w, side, d) => (d === 1
			? legal(w, side).length
			: legal(w, side).reduce((n, next) => n + perft(next, 1 - side, d - 1), 0))
		const cases = [
			['rnbqkbnr/pppppppp/8/1PP2PP1/PPPPPPPP/PPPPPPPP/PPPPPPPP/PPPPPPPP w kq', [8, 128, 1274, 23310]],
			['4k3/pp4q1/3P2p1/8/P3PP2/PPP2r2/PPP5/PPPP4 b -', [30, 241, 6633, 56539]],
			// fails with en passant after a first-rank double step (13, 173, 2216, 34086)
			['k7/5p2/4p2P/3p2P1/2p2P2/1p2P2P/p2P2P1/2P2P2 w -', [13, 172, 2205, 33781]],
		]
		for (const [fen, want] of cases) {
			const { w, side } = fromFen(fen)
			expect(want.map((n, i) => perft(w, side, i + 1)), fen).toEqual(want)
		}
	})
})

describe('horde: winning and drawing', () => {
	it('gives Black the win when the last White piece is captured (T6)', () => {
		const s = one({ h2: '0:p', h8: '1:r', e8: '1:k' }, 1)
		const a = play(V, s, 'h8-h2')
		expect(a.result).toEqual({ winner: 1, reason: 'horde' })
		expect(legalMoves(V, a)).toEqual([])
		expect(resultText(V, a.result)).toBe('Black wins (the horde was destroyed)')
	})

	it('has no check: Black may step into attack, and capturing the king wins for White (T7)', () => {
		const s = one({ d6: '0:p', e8: '1:k', a8: '1:r' }, 1)
		expect(codes(s).filter((c) => c.startsWith('e8'))).toEqual(['e8-d7', 'e8-d8', 'e8-e7', 'e8-f7', 'e8-f8'])
		const a = play(V, s, 'e8-e7')
		expect(codes(a)).toEqual(['d6-d7', 'd6-e7'])
		expect(royalDanger(V, a, 1)).toBe(1)
		expect(royalDanger(V, a, 0)).toBe(0)
		const b = play(V, a, 'd6-e7')
		expect(b.result).toEqual({ winner: 0, reason: 'king' })
		expect(resultText(V, b.result)).toBe('White wins (a king was captured)')
	})

	it('is a draw when a Black move leaves the horde without a move (T15)', () => {
		const s = one({ h5: '0:p', g8: '1:n', e8: '1:k' }, 1)
		expect(outs(s, 'g8-h6')).toEqual([{ key: 'move', notes: [], p: 1 }])
		const a = play(V, s, 'g8-h6')
		expect(a.result).toEqual(STALEMATE)
		expect(resultText(V, a.result)).toBe('Draw (stalemate)')
	})

	it('checks the stalemate of the side to move next, not of the mover (T25)', () => {
		const s = one({ h5: '0:p', e8: '1:k', h7: '1:p' })
		expect(outs(s, 'h5-h6')).toEqual([{ key: 'move', notes: [], p: 1 }])
		const a = play(V, s, 'h5-h6')
		expect(a.result).toBeNull()
		expect(codes(a)).toEqual(['e8-d7', 'e8-d8', 'e8-e7', 'e8-f7', 'e8-f8'])
		expect(play(V, a, 'e8-d8').result).toEqual(STALEMATE)
	})

	it('resets the 50-move counter only for pawn moves and captures that happened (T24)', () => {
		const s = stateOf(V, [
			[{ e2: '0:p', a2: '0:p', e8: '1:k', e3: '1:n' }, 1],
			[{ e2: '0:p', a2: '0:p', e8: '1:k', a6: '1:n' }, 1],
		])
		s.quiet = 7
		expect(outs(s, 'e2-e3')).toEqual([{ key: 'miss', notes: [], p: 0.5 }, { key: 'move', notes: [], p: 0.5 }])
		expect(applyOutcome(V, s, 'e2-e3', 0).quiet).toBe(8)
		expect(applyOutcome(V, s, 'e2-e3', 1).quiet).toBe(0)
		const z = { ...s, quiet: 99 }
		expect(applyOutcome(V, z, 'e2-e3', 0).result).toEqual({ winner: null, reason: 'quiet' })
		expect(applyOutcome(V, z, 'e2-e3', 1).result).toBeNull()
		// a promoted queen and the king do not reset it; pawn moves do
		const q = one({ d1: '0:q', a2: '0:p', e8: '1:k', h7: '1:p' })
		q.quiet = 7
		const q1 = play(V, q, 'd1-d4')
		expect(q1.quiet).toBe(8)
		const q2 = play(V, q1, 'e8-d8')
		expect(q2.quiet).toBe(9)
		const q3 = play(V, q2, 'a2-a3')
		expect(q3.quiet).toBe(0)
		expect(play(V, q3, 'h7-h5').quiet).toBe(0)
	})

	it('ends a classical stalemate of Black as a White win: the Black king cannot escape (L1)', () => {
		expect(V.escapeRule).toBe(true)
		expect(V.drawsWait).toBe(true)
		expect(V.bareKingsDraw).toBe(false)
		const s = one(place('Qa4 Rg7 Pd5 kd8'))
		const a = play(V, s, 'a4-c6')
		expect(a.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		expect(resultText(V, a.result)).toBe('White wins (the king could not escape)')
		// the king is not attacked, but it has only king steps and every one of them walks into attack
		const open = { ...a, result: null }
		expect(royalDanger(V, open, 1)).toBe(0)
		expect(codes(open)).toEqual(words('d8-c7 d8-c8 d8-d7 d8-e7 d8-e8'))
		// with a safe square left the game goes on
		expect(play(V, s, 'a4-b3').result).toBeNull()
		// White has no king, so it never loses this way: its only move puts its last piece where it is surely taken
		const w = play(V, one(place('Pa2 ra8 ke8'), 1), 'a8-a4')
		expect(w.result).toBeNull()
		expect(codes(w)).toEqual(['a2-a3'])
	})

	it('counts a chance to take the last White piece as an escape for the Black king (L1)', () => {
		// the queen on d8 attacks the king on a8 and covers b8; a rook 50% on d1 might take it, White's last piece
		const ghost = stateOf(V, [
			[place('Qd4 ka8 pa7 pb7 rd1'), 1],
			[place('Qd4 ka8 pa7 pb7 rh1'), 1],
		])
		const a = play(V, ghost, 'd4-d8')
		expect(a.result).toBeNull()
		expect(royalDanger(V, a, 1)).toBe(1)
		expect(outs(a, 'd1-d8')).toEqual([{ key: 'miss', notes: [], p: 0.5 }, { key: 'capture', notes: [], p: 0.5 }])
		expect(applyOutcome(V, a, 'd1-d8', 1).result).toEqual({ winner: 1, reason: 'horde' })
		// a solid rook on h1 can neither take the queen nor block it: the king cannot escape
		const lost = { winner: 0, reason: 'cannotEscape' }
		expect(play(V, one(place('Qd4 ka8 pa7 pb7 rh1')), 'd4-d8').result).toEqual(lost)
		// the king may take the last White piece itself, but not a guarded one
		expect(play(V, one(place('Qc6 ka8')), 'c6-b7').result).toBeNull()
		expect(play(V, one(place('Qc6 Pa6 ka8')), 'c6-b7').result).toEqual(lost)
	})

	it('tries every Black action, ghosts included, before the escape rule ends the game', () => {
		/**
		 * Eight possibilities: a White queen on d3 or e3, two Black knights on two squares each. The rook move a1-h1
		 * attacks the king on h8, the pawns cover g8 and g7.
		 *
		 * @param {string[]} squares the squares of the first knight
		 * @return {object}
		 */
		const ghosts = (squares) => {
			const solid = place('Ra1 Pf7 Pf6 Pa2 Pb2 kh8 ra8 pa7 pb7 pc7')
			const worlds = []
			for (const x of squares) {
				for (const y of ['c5', 'a3']) {
					for (const q of ['d3', 'e3']) {
						worlds.push([{ ...solid, [q]: '0:q', [x]: '1:n', [y]: '1:n' }, 1])
					}
				}
			}
			return stateOf(V, worlds)
		}
		const s = ghosts(['a5', 'b4'])
		expect(s.worlds).toHaveLength(8)
		const a = play(V, s, 'a1-h1')
		expect(a.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		// Black had moves, splits, merges and measurements, and none of them saved the king
		const actions = legalMoves(V, { ...a, result: null }, { splits: true })
		expect(new Set(actions.map((m) => m.type))).toEqual(new Set(['move', 'split', 'merge', 'measure']))
		// a knight part on f4 might block the h-file from h3 or h5: the king is no longer taken for certain
		expect(play(V, ghosts(['a5', 'f4']), 'a1-h1').result).toBeNull()
	})

	it('lets the 50-move draw wait for a certain king capture, not for a certain take of the last piece (L1)', () => {
		// Black steps next to the queen on the 100th quiet ply: White takes the king for certain, so no draw yet
		const w = one(place('Qd1 ke8 ra7'), 1)
		w.quiet = 99
		const w1 = play(V, w, 'e8-d8')
		expect(w1.quiet).toBe(100)
		expect(w1.result).toBeNull()
		expect(play(V, w1, 'd1-d8').result).toEqual({ winner: 0, reason: 'king' })
		expect(play(V, w, 'e8-e7').result).toEqual({ winner: null, reason: 'quiet' })
		// The last white piece steps where the rook takes it for sure: the draw does not wait (docs/variants.md, Horde)
		const b = one(place('Qa1 ke8 rh4'))
		b.quiet = 99
		expect(play(V, b, 'a1-a4').result).toEqual({ winner: null, reason: 'quiet' })
		b.quiet = 98
		const b1 = play(V, b, 'a1-a4')
		expect(b1.result).toBeNull()
		expect(outs(b1, 'h4-a4')).toEqual([{ key: 'capture', notes: [], p: 1 }])
		expect(play(V, b1, 'h4-a4').result).toEqual({ winner: 1, reason: 'horde' })
	})
})

describe('horde: quantum interactions', () => {
	it('lets a pawn probe a ghost: the capture is rolled, the push is certain (T10)', () => {
		const s = stateOf(V, [
			[{ e5: '0:p', e8: '1:k', d6: '1:n' }, 1],
			[{ e5: '0:p', e8: '1:k', a6: '1:n' }, 1],
		])
		expect(outs(s, 'e5-d6')).toEqual([{ key: 'miss', notes: [], p: 0.5 }, { key: 'capture', notes: [], p: 0.5 }])
		expect(outs(s, 'e5-e6')).toEqual([{ key: 'move', notes: [], p: 1 }])
		const m = applyOutcome(V, s, 'e5-d6', 0)
		expect(m.worlds).toHaveLength(1)
		expect(pieces(m.worlds[0].b, 1)).toEqual(['ke8', 'na6'])
		expect(pieces(m.worlds[0].b, 0)).toEqual(['pe5'])
		// the White piece count is the same in every world of every outcome
		for (const br of branches(V, s, 'e5-d6')) {
			expect(new Set(br.worlds.map((e) => pieces(e.b, 0).length)).size).toBe(1)
		}
	})

	it('decides by the capture roll whether a ghost takes the last pawn (T11)', () => {
		const s = stateOf(V, [
			[{ h2: '0:p', e8: '1:k', c7: '1:b' }, 1],
			[{ h2: '0:p', e8: '1:k', a8: '1:b' }, 1],
		], 1)
		expect(outs(s, 'c7-h2')).toEqual([{ key: 'miss', notes: [], p: 0.5 }, { key: 'capture', notes: [], p: 0.5 }])
		const m = applyOutcome(V, s, 'c7-h2', 0)
		expect(m.result).toBeNull()
		expect(m.worlds).toHaveLength(1)
		expect(pieces(m.worlds[0].b, 1)).toEqual(['ba8', 'ke8'])
		expect(applyOutcome(V, s, 'c7-h2', 1).result).toEqual({ winner: 1, reason: 'horde' })
	})

	it('settles a stalemate in some possibilities by the game-end roll (T12)', () => {
		const s = stateOf(V, [
			[{ h5: '0:p', e8: '1:k', h6: '1:n' }, 1],
			[{ h5: '0:p', e8: '1:k', b8: '1:n' }, 1],
		], 1)
		expect(outs(s, 'e8-d8')).toEqual([
			{ key: 'move', notes: [END_STALEMATE], p: 0.5 },
			{ key: 'move', notes: ['end:null'], p: 0.5 },
		])
		const a = applyOutcome(V, s, 'e8-d8', 0)
		expect(a.result).toEqual(STALEMATE)
		expect(a.worlds).toHaveLength(1)
		expect(pieces(a.worlds[0].b, 1)).toEqual(['kd8', 'nh6'])
		const b = applyOutcome(V, s, 'e8-d8', 1)
		expect(b.result).toBeNull()
		expect(b.worlds).toHaveLength(1)
		expect(pieces(b.worlds[0].b, 1)).toEqual(['kd8', 'nb8'])
	})

	it('lets White split only promoted pieces (T13)', () => {
		const s = one({ d1: '0:q', a2: '0:p', e8: '1:k', h7: '1:p' })
		expect(splitTargets(V, s, sq('d1'))).toHaveLength(21)
		expect(splitTargets(V, s, sq('a2'))).toHaveLength(0)
		expect(splitsFrom(V, s, sq('a2'))).toEqual([])
		const a = play(V, s, 'd1-d4|h5')
		expect(a.worlds).toHaveLength(2)
		expect(budget(a, 0)).toBe(2)
		expect(a.worlds.map((e) => pieces(e.b, 0).join(' ')).sort()).toEqual(['pa2 qd4', 'pa2 qh5'])
	})

	it('lets a ghost capture the king with the odds of its part (T14)', () => {
		const s = stateOf(V, [
			[{ e1: '0:q', a2: '0:p', e8: '1:k' }, 1],
			[{ a1: '0:q', a2: '0:p', e8: '1:k' }, 1],
		])
		expect(outs(s, 'e1-e8')).toEqual([{ key: 'miss', notes: [], p: 0.5 }, { key: 'capture', notes: [], p: 0.5 }])
		const m = applyOutcome(V, s, 'e1-e8', 0)
		expect(m.result).toBeNull()
		expect(pieces(m.worlds[0].b, 0)).toEqual(['pa2', 'qa1'])
		expect(applyOutcome(V, s, 'e1-e8', 1).result).toEqual({ winner: 0, reason: 'king' })
	})

	it('settles a split whose part blocks the last pawn by the game-end roll (T17)', () => {
		const s = one({ h5: '0:p', e8: '1:k', g8: '1:n' }, 1)
		expect(outs(s, 'g8-f6|h6')).toEqual([
			{ key: 'split', notes: ['end:null'], p: 0.5 },
			{ key: 'split', notes: [END_STALEMATE], p: 0.5 },
		])
		const a = applyOutcome(V, s, 'g8-f6|h6', 0)
		expect(a.result).toBeNull()
		expect(a.worlds).toHaveLength(1)
		expect(pieces(a.worlds[0].b, 1)).toEqual(['ke8', 'nf6'])
		expect(budget(a, 1)).toBe(1)
		const b = applyOutcome(V, s, 'g8-f6|h6', 1)
		expect(b.result).toEqual(STALEMATE)
		expect(pieces(b.worlds[0].b, 1)).toEqual(['ke8', 'nh6'])
		// a split whose parts leave the pawn free is not rolled
		expect(outs(s, 'g8-e7|f6')).toEqual([{ key: 'split', notes: [], p: 1 }])
		expect(play(V, s, 'g8-e7|f6').worlds).toHaveLength(2)
	})

	it('needs no game-end roll when the last White piece is a promoted ghost (T18)', () => {
		const s = stateOf(V, [
			[{ a1: '0:q', e8: '1:k', a8: '1:r' }, 1],
			[{ h1: '0:q', e8: '1:k', a8: '1:r' }, 1],
		], 1)
		expect(outs(s, 'a8-a1')).toEqual([{ key: 'move', notes: [], p: 0.5 }, { key: 'capture', notes: [], p: 0.5 }])
		const m = applyOutcome(V, s, 'a8-a1', 0)
		expect(m.result).toBeNull()
		expect(m.worlds).toHaveLength(1)
		expect(pieces(m.worlds[0].b, 0)).toEqual(['qh1'])
		expect(pieces(m.worlds[0].b, 1)).toEqual(['ke8', 'ra1'])
		expect(applyOutcome(V, s, 'a8-a1', 1).result).toEqual({ winner: 1, reason: 'horde' })
	})

	it('rolls a first-rank double step past a ghost; Moved leaves no en passant square (T19)', () => {
		const s = stateOf(V, [
			[{ b1: '0:p', g2: '0:p', e8: '1:k', c3: '1:p', b2: '1:n' }, 1],
			[{ b1: '0:p', g2: '0:p', e8: '1:k', c3: '1:p', h6: '1:n' }, 1],
		])
		expect(codes(s)).toContain('b1-b3')
		expect(outs(s, 'b1-b3')).toEqual([{ key: 'miss', notes: [], p: 0.5 }, { key: 'move', notes: [], p: 0.5 }])
		const mv = applyOutcome(V, s, 'b1-b3', 1)
		expect(mv.worlds).toHaveLength(1)
		expect(mv.worlds[0].b.x.ep).toBe(-1)
		expect(codes(mv).filter((c) => c.startsWith('c3'))).toEqual(['c3-c2'])
		const ms = applyOutcome(V, s, 'b1-b3', 0)
		expect(ms.worlds).toHaveLength(1)
		expect(pieces(ms.worlds[0].b, 0)).toEqual(['pb1', 'pg2'])
		expect(pieces(ms.worlds[0].b, 1)).toEqual(['ke8', 'nb2', 'pc3'])
	})

	it('counts a stalemated possibility even when White could measure a ghost (T20)', () => {
		const s = stateOf(V, [
			[{ a1: '0:r', a2: '0:p', b1: '0:p', e8: '1:k', a3: '1:n', b2: '1:n' }, 1],
			[{ h1: '0:r', a2: '0:p', b1: '0:p', e8: '1:k', a3: '1:n', b2: '1:n' }, 1],
		], 1)
		expect(outs(s, 'e8-d8')).toEqual([
			{ key: 'move', notes: [END_STALEMATE], p: 0.5 },
			{ key: 'move', notes: ['end:null'], p: 0.5 },
		])
		expect(applyOutcome(V, s, 'e8-d8', 0).result).toEqual(STALEMATE)
		const a = applyOutcome(V, s, 'e8-d8', 1)
		expect(a.result).toBeNull()
		expect(pieces(a.worlds[0].b, 0)).toEqual(['pa2', 'pb1', 'rh1'])
		expect(codes({ ...s, turn: 0 })).toContain('?a1')
	})

	it('links a promoted piece that slides past a Black ghost (pass = link)', () => {
		const s = stateOf(V, [
			[{ d1: '0:q', a2: '0:p', e8: '1:k', d4: '1:n' }, 1],
			[{ d1: '0:q', a2: '0:p', e8: '1:k', a6: '1:n' }, 1],
		])
		expect(budget(s, 0)).toBe(1)
		expect(outcomes(V, s, 'd1-d7').map((o) => [o.key, o.p, o.rolled])).toEqual([['move', 1, false]])
		const a = play(V, s, 'd1-d7')
		expect(a.worlds.map((e) => [...pieces(e.b, 0), ...pieces(e.b, 1)].join(' ')).sort())
			.toEqual(['pa2 qd1 ke8 nd4', 'pa2 qd7 ke8 na6'])
		// the queen is now a ghost linked to the knight: White's budget grows although it never split
		expect(budget(a, 0)).toBe(2)
		expect(budgetInfo(V, a, 0)).toEqual({ used: 2, limit: 8, sides: [0] })
		// measuring the queen settles the knight too
		const b = play(V, a, 'e8-e7')
		expect(outs(b, '?d1').map((o) => o.key)).toEqual(['d1', 'd7'])
		const c = applyOutcome(V, b, '?d1', 0)
		expect(c.worlds).toHaveLength(1)
		expect(pieces(c.worlds[0].b, 1)).toEqual(['ke7', 'nd4'])
		expect(budget(c, 0)).toBe(1)
	})

	it('allows castling only when it is possible in every possibility; a partial slide loses the right (T21)', () => {
		const blocked = stateOf(V, [
			[{ a2: '0:p', e8: '1:k', h8: '1:r', g8: '1:n' }, 1],
			[{ a2: '0:p', e8: '1:k', h8: '1:r', e6: '1:n' }, 1],
		], 1, rights)
		expect(flags(blocked)).toEqual(['k', 'k'])
		expect(codes(blocked)).not.toContain('O-O')
		expect(branches(V, blocked, 'O-O')).toBeNull()
		const free = stateOf(V, [
			[{ a2: '0:p', e8: '1:k', h8: '1:r', c6: '1:n' }, 1],
			[{ a2: '0:p', e8: '1:k', h8: '1:r', e6: '1:n' }, 1],
		], 1, rights)
		expect(outcomes(V, free, 'O-O').map((o) => [o.key, o.p, o.rolled])).toEqual([['move', 1, false]])
		const c = stateOf(V, [
			[{ a2: '0:p', e8: '1:k', h8: '1:r', h6: '1:n' }, 1],
			[{ a2: '0:p', e8: '1:k', h8: '1:r', a6: '1:n' }, 1],
		], 1, rights)
		expect(outcomes(V, c, 'h8-h3').map((o) => [o.key, o.p, o.rolled])).toEqual([['move', 1, false]])
		const c1 = play(V, c, 'h8-h3')
		expect(c1.worlds.map((e) => pieces(e.b, 1).join(' ')).sort()).toEqual(['ke8 na6 rh3', 'ke8 nh6 rh8'])
		expect(flags(c1)).toEqual(['', ''])
		const c2 = play(V, c1, 'a2-a3')
		expect(isLegal(V, c2, 'O-O')).toBe(false)
		// Black measures the knight on h6: the rook never left h8, but the right stays lost
		expect(outs(c2, '?h6').map((o) => o.key)).toEqual(['a6', 'h6'])
		const c3 = applyOutcome(V, c2, '?h6', 1)
		expect(c3.worlds).toHaveLength(1)
		expect(pieces(c3.worlds[0].b, 1)).toEqual(['ke8', 'nh6', 'rh8'])
		expect(isLegal(V, play(V, c3, 'a3-a4'), 'O-O')).toBe(false)
	})

	it('ends the en passant right after one turn, also after a Measure turn and a Missed push (T23)', () => {
		const s = stateOf(V, [
			[{ a2: '0:p', c2: '0:p', g2: '0:p', d4: '1:p', e8: '1:k', b8: '1:n', g3: '1:n' }, 1],
			[{ a2: '0:p', c2: '0:p', g2: '0:p', d4: '1:p', e8: '1:k', b8: '1:n', a6: '1:n' }, 1],
			[{ a2: '0:p', c2: '0:p', g2: '0:p', d4: '1:p', e8: '1:k', h6: '1:n', g3: '1:n' }, 1],
			[{ a2: '0:p', c2: '0:p', g2: '0:p', d4: '1:p', e8: '1:k', h6: '1:n', a6: '1:n' }, 1],
		])
		const a = play(V, s, 'c2-c4')
		expect(a.worlds.map((e) => e.b.x.ep)).toEqual([18, 18, 18, 18])
		expect(outcomes(V, a, 'd4-c3').map((o) => [o.key, o.p, o.rolled])).toEqual([['capture', 1, false]])
		expect(outs(a, '?b8').map((o) => o.key)).toEqual(['h6', 'b8'])
		const m = applyOutcome(V, a, '?b8', 1)
		expect(m.worlds).toHaveLength(2)
		expect(m.worlds.map((e) => e.b.x.ep)).toEqual([-1, -1])
		expect(outs(m, 'g2-g3')).toEqual([{ key: 'miss', notes: [], p: 0.5 }, { key: 'move', notes: [], p: 0.5 }])
		const g = applyOutcome(V, m, 'g2-g3', 0)
		expect(g.worlds).toHaveLength(1)
		expect(codes(g).filter((c) => c.startsWith('d4'))).toEqual(['d4-d3'])
		expect(branches(V, g, 'd4-c3')).toBeNull()
	})
})

describe('horde: hooks for the computer and the board', () => {
	it('rewards advanced White pawns and counts the horde in the player row (T22)', () => {
		const s = newGame(V)
		const b = s.worlds[0].b
		expect(V.evaluate(b, 0)).toBe(40)
		expect(V.evaluate(b, 1)).toBe(-40)
		expect(V.evaluate(one({ a6: '0:p', b7: '0:p', c2: '0:p', e8: '1:k' }).worlds[0].b, 0)).toBe(85)
		expect(V.sideInfo(s, 0, 0)).toEqual({
			text: 'Horde: 36',
			title: 'White pieces left. Black wins by capturing all of them.',
		})
		expect(V.sideInfo(s, 1, 0)).toBeNull()
		expect(V.sideInfo(one({ d1: '0:q', a2: '0:p', e8: '1:k' }), 0, 1).text).toBe('Horde: 2')
		expect(V.reasonText('horde')).toBe('the horde was destroyed')
		expect(V.reasonText('stalemate')).toBe('stalemate')
		expect(V.reasonText('king')).toBeNull()
	})

	it('keeps the per-world bookkeeping identical in every world during random games', () => {
		const starts = [
			() => newGame(V),
			() => one(place('Pc2 Pd2 Pe1 Pg7 Ph3 ke8 ra8 rh8 nb8 bf8 pd7 pf7')),
		]
		for (let seed = 1; seed <= 6; seed++) {
			const rng = seededRng(seed * 31)
			let s = starts[seed % 2]()
			if (seed % 2) {
				s.worlds[0].b.x.castle = castlingRights(V, s.worlds[0].b)
			}
			for (let ply = 0; ply < 40 && !s.result; ply++) {
				const list = legalMoves(V, s, { splits: ply % 3 === 1 }).map((m) => m.code)
				const res = applyMove(V, s, list[Math.floor(rng() * list.length)], rng)
				s = res.state
				expect(s.worlds.reduce((a, e) => a + e.w, 0)).toBe(T)
				const same = (f) => new Set(s.worlds.map((e) => JSON.stringify(f(e.b)))).size
				expect(same((b) => b.x.ep)).toBe(1)
				expect(same((b) => b.x.castle)).toBe(1)
				expect(same((b) => pieces(b, 0).length)).toBe(1)
				for (const side of [0, 1]) {
					const info = budgetInfo(V, s, side)
					expect(info.used).toBeLessThanOrEqual(info.limit)
				}
				if (s.result) {
					expect(legalMoves(V, s)).toEqual([])
				} else {
					for (const { b } of s.worlds) {
						expect(generate(V, b, s.turn).size).toBeGreaterThan(0)
					}
				}
			}
		}
	})

	it('makes a legal move from the start position at every level within its time budget', async () => {
		const s = newGame(V)
		for (const level of LEVELS) {
			const started = Date.now()
			const code = await chooseMove(V, s, { level: level.id, rng: seededRng(7) })
			expect(Date.now() - started).toBeLessThan(level.timeMs + 500)
			expect(isLegal(V, s, code), level.id + ' ' + code).toBe(true)
		}
		// and as Black after White's first move
		const a = play(V, s, 'e4-e5')
		for (const level of LEVELS) {
			const started = Date.now()
			const code = await chooseMove(V, a, { level: level.id, rng: seededRng(7) })
			expect(Date.now() - started).toBeLessThan(level.timeMs + 500)
			expect(isLegal(V, a, code), level.id + ' ' + code).toBe(true)
		}
	}, 20000)

	it('takes the king or the last White piece when it can', async () => {
		const white = one({ e1: '0:q', a2: '0:p', e8: '1:k', h7: '1:p' })
		const black = one({ h2: '0:p', h8: '1:r', e8: '1:k', a7: '1:p' }, 1)
		for (const level of ['easy', 'normal', 'hard']) {
			const w = await chooseMove(V, white, { level, rng: seededRng(3) })
			expect(play(V, white, w).result, level + ' ' + w).toEqual({ winner: 0, reason: 'king' })
			const b = await chooseMove(V, black, { level, rng: seededRng(3) })
			expect(play(V, black, b).result, level + ' ' + b).toEqual({ winner: 1, reason: 'horde' })
		}
	})

	it('takes a free knight rather than count on a stalemating block that Black would not play', async () => {
		// e4-e5 lets the g7 knight block the last free pawn (a draw); e4-d5 wins a knight. Black, far ahead, never
		// plays the draw.
		const s = one(place('Pb2 Pe4 ke8 ra8 ng7 nd5 pb3'))
		expect(codes(s)).toEqual(['e4-d5', 'e4-e5'])
		expect(play(V, play(V, s, 'e4-e5'), 'g7-e6').result).toEqual(STALEMATE)
		for (const level of ['easy', 'hard']) {
			expect(await chooseMove(V, s, { level, rng: seededRng(1) }), level).toBe('e4-d5')
		}
	})

	// The normal level searches only forcing replies and assumes Black plays one, here the stalemating g7-e6, so it
	// picks e4-e5. Needs the core change in ai.js replyValue: without fullReply, the replier may stand pat
	// (bestForThem starts at evaluateState(V, s, them)). Then, in the position above,
	// `chooseMove(V, s, { level: 'normal', rng: seededRng(1) })` returns 'e4-d5'.
	it.todo('normal level: takes the free knight too (needs a stand-pat option in the core replyValue)')
})
