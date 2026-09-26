/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Crazyhouse: the test cases Z1-Z14, Q1-Q15 and F1 plus the setup, the
 * movement of every piece type and the computer player.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { glyphOf } from '../../../src/variantplay/glyphs.js'
import { sortHand } from '../../../src/variantplay/panel.js'
import { codeText, outcomeText, resultText } from '../../../src/variantplay/texts.js'
import { chooseMove, LEVELS } from '../../../src/variants/core/ai.js'
import {
	applyMove,
	branches,
	budget,
	budgetInfo,
	handView,
	legalMoves,
	newGame,
	outcomes,
	ownPieceAt,
	royalDanger,
	splitsFrom,
	T,
} from '../../../src/variants/core/quantum.js'
import { addPiece, HAND, OFF } from '../../../src/variants/core/world.js'
import V from '../../../src/variants/crazyhouse.js'
import { play, stateOf, stopwatch, workClock } from './helpers.js'

const sq = (name) => V.topology.byName(name)
const RIGHT_K = () => ({ flag: 'K', side: 0, king: sq('e1'), rook: sq('h1'), kingTo: sq('g1'), rookTo: sq('f1') })

/**
 * An `edit` for `stateOf`: the default extra state (optionally with castling rights) plus pieces in hand.
 *
 * @param {Array<[number, string]>} [hand] pieces in hand as [side, type]
 * @param {Array<() => object>} [castle] castling rights
 * @return {(b: object) => void}
 */
function withHand(hand = [], castle = []) {
	return (b) => {
		b.x = { ep: -1, epVictim: -1, castle: castle.map((c) => c()) }
		for (const [side, type] of hand) {
			addPiece(b, type, side, HAND)
		}
	}
}

/** The castling rights of a FEN flag: side, king, rook, king target, rook target. */
const FEN_RIGHTS = {
	K: [0, 'e1', 'h1', 'g1', 'f1'],
	Q: [0, 'e1', 'a1', 'c1', 'd1'],
	k: [1, 'e8', 'h8', 'g8', 'f8'],
	q: [1, 'e8', 'a8', 'c8', 'd8'],
}

/**
 * A one-world state from a crazyhouse FEN as Fairy-Stockfish writes it: `~` after a piece marks it as promoted, and
 * `[...]` holds both hands (upper case White).
 *
 * @param {string} fen the FEN
 * @return {object}
 */
function fromFen(fen) {
	const [board, turn, castle, ep] = fen.split(' ')
	const [, rows, pocket] = /^(.*)\[(.*)\]$/.exec(board)
	const placement = {}
	rows.split('/').forEach((row, i) => {
		let f = 0
		for (const [, c, promoted] of row.matchAll(/([1-8a-zA-Z])(~?)/g)) {
			if (/\d/.test(c)) {
				f += Number(c)
				continue
			}
			const side = c === c.toUpperCase() ? '0:' : '1:'
			placement['abcdefgh'[f] + (8 - i)] = side + (promoted ? '+' : '') + c.toLowerCase()
			f++
		}
	})
	const rights = [...castle.replace('-', '')].map((flag) => {
		const [side, king, rook, kingTo, rookTo] = FEN_RIGHTS[flag]
		return () => ({ flag, side, king: sq(king), rook: sq(rook), kingTo: sq(kingTo), rookTo: sq(rookTo) })
	})
	const inHand = [...pocket].map((c) => [c === c.toUpperCase() ? 0 : 1, c.toLowerCase()])
	return stateOf(V, [[placement, 1]], turn === 'w' ? 0 : 1, (b) => {
		withHand(inHand, rights)(b)
		if (ep !== '-') {
			b.x.ep = sq(ep)
			b.x.epVictim = sq(ep[0] + (turn === 'w' ? '5' : '4'))
		}
	})
}

const codes = (s) => legalMoves(V, s).map((m) => m.code)
const outs = (s, code) => outcomes(V, s, code)?.map((o) => [o.key, Math.round(o.p * 10000) / 10000, o.rolled])
function at(s, name) {
	return s.worlds.map(({ b }) => {
		const id = b.board[sq(name)]
		return id >= 0 ? b.sd[id] + b.ty[id] : '.'
	})
}
const hand = (s, side) => handView(s, side).map((h) => [h.type, h.min, h.max])
const kings = { e1: '0:k', e8: '1:k' }

describe('crazyhouse: setup and movement', () => {
	it('starts from the orthodox position with empty hands, rights KQkq and 20 moves', () => {
		const s = newGame(V)
		const b = s.worlds[0].b
		const expected = {
			a1: '0r',
			b1: '0n',
			c1: '0b',
			d1: '0q',
			e1: '0k',
			f1: '0b',
			g1: '0n',
			h1: '0r',
			a8: '1r',
			b8: '1n',
			c8: '1b',
			d8: '1q',
			e8: '1k',
			f8: '1b',
			g8: '1n',
			h8: '1r',
		}
		for (const f of 'abcdefgh') {
			expected[f + '2'] = '0p'
			expected[f + '7'] = '1p'
		}
		for (let i = 0; i < 64; i++) {
			const name = V.topology.names[i]
			const id = b.board[i]
			expect(id >= 0 ? b.sd[id] + b.ty[id] : undefined, name).toBe(expected[name])
		}
		expect(b.sq.length).toBe(32)
		expect(handView(s, 0)).toEqual([])
		expect(handView(s, 1)).toEqual([])
		expect(b.x.castle.map((c) => c.flag).sort()).toEqual(['K', 'Q', 'k', 'q'])
		expect(b.x.ep).toBe(-1)
		expect(s.turn).toBe(0)
		expect(codes(s).length).toBe(20)
		expect(V.id).toBe('crazyhouse')
		expect(V.category).toBe('rules')
		expect(V.drops).toBe(true)
		const rules = V.rules()
		expect(rules.length).toBeGreaterThanOrEqual(3)
		expect(rules.length).toBeLessThanOrEqual(8)
	})

	it('moves every piece type as in chess; promoted types move like their base type', () => {
		const count = (type, from) => {
			const s = stateOf(V, [[{ ...kings, [from]: '0:' + type }, 1]])
			return codes(s).filter((c) => c.startsWith(from + '-')).length
		}
		expect(count('q', 'd4')).toBe(27)
		expect(count('r', 'd4')).toBe(14)
		expect(count('b', 'd4')).toBe(13)
		expect(count('n', 'd4')).toBe(8)
		expect(count('n', 'a1')).toBe(2)
		expect(count('+q', 'd4')).toBe(27)
		expect(count('+r', 'd4')).toBe(14)
		expect(count('+b', 'd4')).toBe(13)
		expect(count('+n', 'd4')).toBe(8)
		expect(count('p', 'c2')).toBe(2)
		expect(count('p', 'c3')).toBe(1)
		const k = stateOf(V, [[{ d4: '0:k', e8: '1:k' }, 1]])
		expect(codes(k).filter((c) => c.startsWith('d4-')).length).toBe(8)
		// a pawn captures diagonally forward only, and never straight ahead
		const p = stateOf(V, [[{ ...kings, c3: '0:p', b4: '1:n', d4: '1:n', c4: '1:n' }, 1]])
		expect(codes(p).filter((c) => c.startsWith('c3-')).sort()).toEqual(['c3-b4', 'c3-d4'])
		for (const type of ['k', 'q', 'r', 'b', 'n', 'p', '+q', '+r', '+b', '+n']) {
			expect(typeof V.types[type].name()).toBe('string')
			expect(V.types[type].glyph.sprite).toBe(type.replace('+', ''))
		}
		expect(V.types['+q'].splittable).toBe(true)
		expect(V.types.p.solid).toBe(true)
	})

	it('generates the same number of moves with drops as Fairy-Stockfish (perft 1, no king attacked)', () => {
		// 4k3/8/8/8/8/8/8/4K3[NRP] w: 177; 4k3/8/2n5/8/3P4/8/8/4K2R[BQp] w - -: 133; the same with [BQpn] b: 118
		const a = stateOf(V, [[kings, 1]], 0, withHand([[0, 'n'], [0, 'r'], [0, 'p']]))
		expect(codes(a).length).toBe(177)
		const pl = { ...kings, d4: '0:p', c6: '1:n', h1: '0:r' }
		expect(codes(stateOf(V, [[pl, 1]], 0, withHand([[0, 'b'], [0, 'q'], [1, 'p']]))).length).toBe(133)
		expect(codes(stateOf(V, [[pl, 1]], 1, withHand([[0, 'b'], [0, 'q'], [1, 'p'], [1, 'n']]))).length).toBe(118)
	})

	it('matches Fairy-Stockfish with both hands, promoted pieces, castling and en passant (perft 1)', () => {
		// positions from random games; in each, no move would leave the own king attacked, so the counts compare
		const rich = fromFen('2B1k2r/3n1p1p/1P3n1b/R6B/P6n/1p6/qB~1p1K2/q~5N1[Pbpppppppqrr] b k - 0 1')
		const c = codes(rich)
		expect(c.length).toBe(205)
		for (const code of ['O-O', 'd2-d1=q', 'd2-d1=n', 'a1-g1', 'a2-b2', 'r@e1', 'p@e7']) {
			expect(c).toContain(code)
		}
		expect(c).not.toContain('p@e1')
		expect(rich.worlds[0].b.ty[rich.worlds[0].b.board[sq('b2')]]).toBe('+b')
		const ep = fromFen('rn2kbQr/1p2nppp/8/1Pp3P1/1p4P1/2p2P2/R2N3P/4KBNR[BPPQbpp] w q c6 0 1')
		expect(codes(ep).length).toBe(145)
		expect(outs(ep, 'b5-c6')).toEqual([['capture', 1, false]])
		expect(codes(fromFen('1nb2kr1/2Npn3/6P1/6Pp/1p4P1/5P2/2rPPB2/1bBQ1KN1[PPPPPppqrr] w - h6 0 1')).length).toBe(64)
		// a promoted bishop taken goes into the hand as a pawn, as Fairy-Stockfish has it
		const took = play(V, rich, 'a2-b2')
		expect(hand(took, 1)).toEqual([['b', 1, 1], ['p', 8, 8], ['q', 1, 1], ['r', 2, 2]])
	})
})

describe('crazyhouse: drops and hands', () => {
	it('Z1 captured pawns go to the capturer; pawn drops everywhere except rank 1 and 8', () => {
		let s = newGame(V)
		for (const m of ['e2-e4', 'd7-d5', 'e4-d5', 'd8-d5']) {
			s = play(V, s, m)
		}
		expect(handView(s, 0)).toEqual([{ type: 'p', min: 1, max: 1, expected: 1 }])
		expect(handView(s, 1)).toEqual([{ type: 'p', min: 1, max: 1, expected: 1 }])
		expect(s.quiet).toBe(0)
		const c = codes(s)
		expect(c.filter((x) => x.includes('@')).length).toBe(33)
		for (const ok of ['p@e2', 'p@e3', 'p@d3']) {
			expect(c).toContain(ok)
		}
		for (const no of ['p@d8', 'p@e1', 'p@e8', 'p@e7']) {
			expect(c).not.toContain(no)
		}
		const black = codes({ ...s, turn: 1 })
		expect(black.filter((x) => x.includes('@')).length).toBe(33)
		expect(black).not.toContain('p@d8')
	})

	it('Z2 Z12 a drop onto a certainly empty square is certain; pieces may be dropped on rank 1 and 8', () => {
		let s = { ...stateOf(V, [[kings, 1]], 0, withHand([[0, 'n']])), quiet: 7 }
		expect(outs(s, 'n@f3')).toEqual([['move', 1, false]])
		s = play(V, s, 'n@f3')
		expect(at(s, 'f3')).toEqual(['0n'])
		expect(handView(s, 0)).toEqual([])
		expect(s.quiet).toBe(0)
		const z12 = codes(stateOf(V, [[kings, 1]], 0, withHand([[0, 'n'], [0, 'r'], [0, 'p']])))
		expect(z12).toContain('n@a8')
		expect(z12).toContain('r@a1')
		expect(z12).not.toContain('p@a8')
		expect(z12.filter((x) => x.startsWith('n@')).length).toBe(62)
	})

	it('Z3 pawn drops: 48 squares for either side, never rank 1 or 8', () => {
		const s = stateOf(V, [[kings, 1]], 0, withHand([[0, 'p'], [1, 'p']]))
		for (const turn of [0, 1]) {
			const c = codes({ ...s, turn })
			expect(c).not.toContain('p@a1')
			expect(c).not.toContain('p@h8')
			expect(c).not.toContain('p@a8')
			expect(c).toContain('p@a2')
			expect(c).toContain('p@h7')
			expect(c.filter((x) => x.startsWith('p@')).length).toBe(48)
		}
	})

	it('Z4 Z12 a pawn dropped on its second rank double-steps and can be taken en passant; elsewhere it cannot', () => {
		let s = stateOf(V, [[{ ...kings, e4: '1:p', a7: '1:p' }, 1]], 0, withHand([[0, 'p']]))
		s = play(V, s, 'p@d2')
		s = play(V, s, 'a7-a6')
		expect(outs(s, 'd2-d4')).toEqual([['move', 1, false]])
		s = play(V, s, 'd2-d4')
		expect(s.worlds[0].b.x.ep).toBe(sq('d3'))
		expect(outs(s, 'e4-d3')).toEqual([['capture', 1, false]])
		s = play(V, s, 'e4-d3')
		expect(at(s, 'd3')).toEqual(['1p'])
		expect(at(s, 'd4')).toEqual(['.'])
		expect(hand(s, 1)).toEqual([['p', 1, 1]])
		let t = stateOf(V, [[kings, 1]], 0, withHand([[0, 'p']]))
		t = play(V, t, 'p@d3')
		t = play(V, t, 'e8-d8')
		expect(codes(t)).toContain('d3-d4')
		expect(codes(t)).not.toContain('d3-d5')
	})

	it('Z9 a knight dropped on rank 1 blocks castling and goes to the capturer when taken', () => {
		let s = stateOf(V, [[{ e1: '0:k', h1: '0:r', e8: '1:k' }, 1]], 1, withHand([[1, 'n']], [RIGHT_K]))
		expect(outs(s, 'n@f1')).toEqual([['move', 1, false]])
		s = play(V, s, 'n@f1')
		expect(codes(s)).not.toContain('O-O')
		expect(outs(s, 'e1-f1')).toEqual([['capture', 1, false]])
		s = play(V, s, 'e1-f1')
		expect(hand(s, 0)).toEqual([['n', 1, 1]])
		expect(hand(s, 1)).toEqual([])
		const b = s.worlds[0].b
		const knight = b.sq.findIndex((q) => q === HAND)
		expect([b.sd[knight], b.ty[knight]]).toEqual([0, 'n'])
	})
})

describe('crazyhouse: promotion, castling, en passant', () => {
	it('Z5 a promoted queen moves like a queen and returns to a hand as a pawn', () => {
		let s = stateOf(V, [[{ a1: '0:k', e7: '0:p', h8: '1:k', a8: '1:r' }, 1]])
		expect(codes(s).filter((c) => c.startsWith('e7'))).toEqual(['e7-e8=q', 'e7-e8=r', 'e7-e8=b', 'e7-e8=n'])
		s = play(V, s, 'e7-e8=q')
		expect(at(s, 'e8')).toEqual(['0+q'])
		const moves = codes({ ...s, turn: 0 }).filter((x) => x.startsWith('e8-'))
		expect(moves.length).toBe(21)
		expect(moves).toContain('e8-a8')
		expect(moves).toContain('e8-h8')
		expect(outs(s, 'a8-e8')).toEqual([['capture', 1, false]])
		s = play(V, s, 'a8-e8')
		expect(hand(s, 1)).toEqual([['p', 1, 1]])
	})

	it('Z8 a pawn dropped on the seventh rank promotes on its next move', () => {
		let s = stateOf(V, [[{ a1: '0:k', h8: '1:k', a6: '1:p' }, 1]], 0, withHand([[0, 'p']]))
		s = play(V, s, 'p@c7')
		s = play(V, s, 'a6-a5')
		expect(codes(s).filter((c) => c.startsWith('c7'))).toEqual(['c7-c8=q', 'c7-c8=r', 'c7-c8=b', 'c7-c8=n'])
		s = play(V, s, 'c7-c8=n')
		expect(at(s, 'c8')).toEqual(['0+n'])
	})

	it('Z6 a rook dropped in its corner never castles', () => {
		let s = stateOf(V, [[{ e1: '0:k', h1: '0:r', e8: '1:k', a7: '1:p' }, 1]], 0, withHand([[0, 'r']], [RIGHT_K]))
		expect(outs(s, 'O-O')).toEqual([['move', 1, false]])
		for (const m of ['h1-h5', 'a7-a6', 'r@h1', 'a6-a5']) {
			s = play(V, s, m)
		}
		expect(at(s, 'h1')).toEqual(['0r'])
		expect(at(s, 'e1')).toEqual(['0k'])
		expect(codes(s)).not.toContain('O-O')
	})

	it('Z11 a drop ends the en passant chance', () => {
		let s = stateOf(V, [[{ e1: '0:k', d2: '0:p', e8: '1:k', e4: '1:p' }, 1]], 0, withHand([[1, 'n']]))
		s = play(V, s, 'd2-d4')
		expect(codes(s)).toContain('e4-d3')
		s = play(V, s, 'n@a6')
		s = play(V, s, 'e1-f1')
		expect(codes(s)).not.toContain('e4-d3')
		expect(s.worlds[0].b.x.ep).toBe(-1)
	})
})

describe('crazyhouse: end of the game and texts', () => {
	it('Z10 a dropped knight captures the king: White wins', () => {
		let s = stateOf(V, [[{ a1: '0:k', h8: '1:k', g7: '1:p', h7: '1:p' }, 1]], 0, withHand([[0, 'n']]))
		s = play(V, s, 'n@f7')
		s = play(V, s, 'g7-g6')
		expect(outs(s, 'f7-h8')).toEqual([['capture', 1, false]])
		s = play(V, s, 'f7-h8')
		expect(s.result).toEqual({ winner: 0, reason: 'king' })
		expect(legalMoves(V, s)).toEqual([])
		// the captured king leaves the board and never goes into a hand
		const b = s.worlds[0].b
		const king = b.ty.findIndex((ty, id) => ty === 'k' && b.sd[id] === 1)
		expect(b.sq[king]).toBe(OFF)
		expect(hand(s, 0)).toEqual([])
		expect(hand(s, 1)).toEqual([])
	})

	it('Q9 Z13 the quiet counter: only a drop that happened resets it, and the draw text names drops', () => {
		const worlds = [[{ ...kings, d4: '1:n' }, 1], [{ ...kings, f4: '1:n' }, 1]]
		const s = { ...stateOf(V, worlds, 0, withHand([[0, 'p']])), quiet: 7 }
		expect(play(V, s, 'p@d4', 0).quiet).toBe(8)
		expect(play(V, s, 'p@d4', 1).quiet).toBe(0)
		expect(play(V, s, 'e1-e2').quiet).toBe(8)
		const near = { ...s, quiet: V.quietPlies - 1 }
		expect(play(V, near, 'e1-d1').result).toEqual({ winner: null, reason: 'quiet' })
		// the draw waits while the player to move can take the king for certain (drawsWait): after e1-e2 the knight
		// on d4 or f4 takes it in every possibility (the merge d4|f4-e2)
		const waits = play(V, near, 'e1-e2')
		expect(royalDanger(V, waits, 0)).toBe(1)
		expect(waits.quiet).toBe(V.quietPlies)
		expect(waits.result).toBeNull()
		expect(play(V, near, 'p@d4', 1).result).toBeNull()
		expect(resultText(V, { winner: null, reason: 'quiet' }))
			.toBe('Draw (50 moves without a capture, a pawn move or a drop)')
		expect(V.reasonText('king')).toBeNull()
	})

	it('the king that cannot escape: a drop mate wins at once, and a drop that shields the king is an escape', () => {
		expect([V.escapeRule, V.bareKingsDraw, V.drawsWait, V.specialMoves]).toEqual([true, true, true, true])
		const mate = { a1: '0:k', h8: '1:k', g7: '1:p', h7: '1:p' }
		// the rook dropped on b8 would take the king next move whatever Black does, and Black has nothing to drop
		const dropped = play(V, stateOf(V, [[mate, 1]], 0, withHand([[0, 'r']])), 'r@b8')
		expect(dropped.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		expect(resultText(V, dropped.result)).toBe('White wins (the king could not escape)')
		const rook = { ...mate, b1: '0:r' }
		expect(play(V, stateOf(V, [[rook, 1]]), 'b1-b8').result).toEqual({ winner: 0, reason: 'cannotEscape' })
		// with a knight in Black's hand the same move is no mate: the knight can be dropped in between
		const shield = play(V, stateOf(V, [[rook, 1]], 0, withHand([[1, 'n']])), 'b1-b8')
		expect(shield.result).toBeNull()
		expect(royalDanger(V, shield, 1)).toBe(1)
		expect(royalDanger(V, play(V, shield, 'n@e8'), 1)).toBe(0)
		// the rules card leaves capture-the-king and the escape rule to the shared card and adds the drops
		const card = V.rules()
		expect(card).not.toContain('Capture the enemy king to win.')
		expect(card.at(-1)).toMatch(/drop/)
	})

	it('no drop shields a king from a knight: no escape at 64 possibilities with full hands, in time', () => {
		// White: Ka1, pawns a2 b2, three knights split in two that reach neither c2 nor h1. Black: Kh8, Nc2 (takes a1),
		// Rh2, three bishops split in two. Both hands hold n, b, r, q, p. After h2-h1 the rook takes b1 as well: a drop
		// on b1..g1 closes the rook's line, never the knight's, so every action of White (most of them drops, at 64
		// possibilities) is tried and none escapes. This is the slowest case of the escape search.
		const build = (knight) => {
			const white = [['d5', 'e6'], ['f5', 'g4'], ['c6', 'd7']]
			const black = [['a7', 'b8'], ['a6', 'b7'], ['h7', 'g8']]
			const worlds = []
			for (let wm = 0; wm < 8; wm++) {
				for (let bm = 0; bm < 8; bm++) {
					const p = { a1: '0:k', a2: '0:p', b2: '0:p', h8: '1:k', h2: '1:r', [knight]: '1:n' }
					white.forEach((two, i) => {
						p[two[(wm >> i) & 1]] = '0:n'
					})
					black.forEach((two, i) => {
						p[two[(bm >> i) & 1]] = '1:b'
					})
					worlds.push([p, 1])
				}
			}
			const full = ['n', 'b', 'r', 'q', 'p'].flatMap((type) => [[0, type], [1, type]])
			return stateOf(V, worlds, 1, withHand(full))
		}
		const elapsed = stopwatch()
		const mate = play(V, build('c2'), 'h2-h1')
		const ms = elapsed()
		expect(mate.worlds.length).toBe(64)
		expect(mate.result).toEqual({ winner: 1, reason: 'cannotEscape' })
		expect(ms).toBeLessThan(5000)
		// with the knight on c3 (it takes b1, not a1) a drop on c1..g1 saves the king
		const saved = play(V, build('c3'), 'h2-h1')
		expect(saved.result).toBeNull()
		expect(royalDanger(V, saved, 0)).toBe(1)
		expect(royalDanger(V, play(V, saved, 'n@e1'), 0)).toBe(0)
	})

	it('bare kings: a draw only when both hands are empty too', () => {
		// a captured piece goes into a hand, so a board with only the kings is no draw while a hand holds a piece
		const taken = play(V, stateOf(V, [[{ ...kings, e2: '1:n' }, 1]]), 'e1-e2')
		expect(hand(taken, 0)).toEqual([['n', 1, 1]])
		expect(taken.result).toBeNull()
		expect(play(V, stateOf(V, [[kings, 1]]), 'e1-d1').result).toEqual({ winner: null, reason: 'bareKings' })
	})

	it('Z14 UI texts and hooks for drops and promoted pieces', () => {
		expect(outcomeText('move', 'p@d4')).toBe('Dropped')
		expect(outcomeText('miss', 'n@f3')).toBe('Missed: the piece stays in hand')
		expect(outcomeText('move', 'e2-e4')).toBe('Moved')
		expect(codeText(V, 'p@e4')).toBe('P@e4')
		expect(codeText(V, 'e7-e8=q')).toBe('e7-e8=q')
		const sprite = { kind: 'sprite', symbol: 'qc-piece-cburnett-wQ', tint: null, promoted: true }
		expect(glyphOf(V, '+q', 0)).toEqual(sprite)
		expect(glyphOf(V, 'q', 1).promoted).toBeUndefined()
		const pieces = ['q', 'r', 'b', 'n', 'p'].map((type) => ({ type }))
		expect(sortHand(V, pieces).map((p) => p.type)).toEqual(['p', 'n', 'b', 'r', 'q'])
	})
})

describe('crazyhouse: quantum interactions', () => {
	it('Q1 Q5 a drop where a ghost might stand is a roll: Dropped or Missed, with the odds of an empty square', () => {
		const s = stateOf(V, [[{ ...kings, d4: '1:n' }, 1], [{ ...kings, f4: '1:n' }, 1]], 0, withHand([[0, 'p']]))
		expect(outs(s, 'p@d4')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		const miss = play(V, s, 'p@d4', 0)
		expect(at(miss, 'd4')).toEqual(['1n'])
		expect(hand(miss, 0)).toEqual([['p', 1, 1]])
		const moved = play(V, s, 'p@d4', 1)
		expect(at(moved, 'd4')).toEqual(['0p'])
		expect(at(moved, 'f4')).toEqual(['1n'])
		expect(hand(moved, 0)).toEqual([])
		const q5 = stateOf(V, [[{ ...kings, d4: '1:n' }, 3], [{ ...kings, f5: '1:n' }, 1]], 0, withHand([[0, 'p']]))
		expect(outs(q5, 'p@d4')).toEqual([['miss', 0.75, true], ['move', 0.25, true]])
	})

	it('Q2 Z7 capturing a ghost is a roll; the hand is certain after it (a promoted ghost gives a pawn)', () => {
		const A = { e1: '0:k', b5: '0:b', e8: '1:k', c6: '1:n' }
		const B = { e1: '0:k', b5: '0:b', e8: '1:k', a6: '1:n' }
		const s = stateOf(V, [[A, 1], [B, 1]])
		expect(outs(s, 'b5-c6')).toEqual([['move', 0.5, true], ['capture', 0.5, true]])
		const moved = play(V, s, 'b5-c6', 0)
		expect(at(moved, 'a6')).toEqual(['1n'])
		expect(hand(moved, 0)).toEqual([])
		const took = play(V, s, 'b5-c6', 1)
		expect(at(took, 'c6')).toEqual(['0b'])
		expect(hand(took, 0)).toEqual([['n', 1, 1]])
		let z = stateOf(V, [[{ a1: '0:k', d7: '0:p', h8: '1:k', a5: '1:r', h1: '1:b' }, 1]])
		for (const m of ['d7-d8=q', 'h8-h7', 'd8-d5|d2']) {
			z = play(V, z, m)
		}
		expect(at(z, 'd5').sort()).toEqual(['.', '0+q'])
		expect(outs(z, 'a5-d5')).toEqual([['move', 0.5, true], ['capture', 0.5, true]])
		const zMoved = play(V, z, 'a5-d5', 0)
		expect(at(zMoved, 'd2')).toEqual(['0+q'])
		expect(hand(zMoved, 1)).toEqual([])
		const zTook = play(V, z, 'a5-d5', 1)
		expect(at(zTook, 'd2')).toEqual(['.'])
		expect(hand(zTook, 1)).toEqual([['p', 1, 1]])
	})

	it('Q3 Q15 a drop onto an own ghost is rolled and never joins it; the ghost\'s own move joins', () => {
		const q3 = stateOf(
			V,
			[[{ e1: '0:k', c3: '0:n', e8: '1:k' }, 1], [{ e1: '0:k', e5: '0:n', e8: '1:k' }, 1]],
			0,
			withHand([[0, 'b']]),
		)
		expect(outs(q3, 'b@e5')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		expect(hand(play(V, q3, 'b@e5', 0), 0)).toEqual([['b', 1, 1]])
		expect(at(play(V, q3, 'b@e5', 1), 'c3')).toEqual(['0n'])
		const s = stateOf(
			V,
			[[{ e1: '0:k', c3: '0:n', e8: '1:k' }, 1], [{ e1: '0:k', e4: '0:n', e8: '1:k' }, 1]],
			0,
			withHand([[0, 'n']]),
		)
		expect(outs(s, 'n@e4')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		const moved = play(V, s, 'n@e4', 1)
		expect(moved.worlds.length).toBe(1)
		expect(moved.worlds[0].b.board[sq('e4')]).toBe(3)
		expect(moved.worlds[0].b.board[sq('c3')]).toBe(1)
		const miss = play(V, s, 'n@e4', 0)
		expect(miss.worlds[0].b.board[sq('e4')]).toBe(1)
		expect(hand(miss, 0)).toEqual([['n', 1, 1]])
		expect(outs(s, 'c3-e4')).toEqual([['move', 1, false]])
		expect(play(V, s, 'c3-e4').worlds.length).toBe(1)
	})

	it('Q4 Q8 a dropped piece is one piece; a full budget never blocks a drop, and a drop never raises it', () => {
		let s = stateOf(V, [[{ e1: '0:k', g1: '0:n', e8: '1:k' }, 1]], 0, withHand([[0, 'n']]))
		s = play(V, s, 'g1-f3|h3')
		expect(budget(s, 0)).toBe(2)
		s = play(V, s, 'e8-d8')
		expect(outs(s, 'n@c3')).toEqual([['move', 1, false]])
		s = play(V, s, 'n@c3')
		expect(budget(s, 0)).toBe(2)
		const mine = { ...s, turn: 0 }
		const id = ownPieceAt(mine, sq('c3'))
		expect(s.worlds.every(({ b }) => b.board[sq('c3')] === id)).toBe(true)
		expect(splitsFrom(V, mine, sq('c3')).length).toBeGreaterThan(0)
		let f = stateOf(V, [[{ e1: '0:k', b1: '0:n', c1: '0:b', g1: '0:n', e8: '1:k' }, 1]], 0, withHand([[0, 'p']]))
		for (const m of ['b1-a3|c3', 'e8-d8', 'g1-f3|h3', 'd8-e8', 'c1-d2|e3', 'e8-d8']) {
			f = play(V, f, m)
		}
		expect(budgetInfo(V, f, 0)).toEqual({ used: 8, limit: 8, sides: [0] })
		expect(legalMoves(V, f, { splits: true }).filter((m) => m.type === 'split')).toEqual([])
		expect(outs(f, 'p@d4')).toEqual([['move', 1, false]])
		expect(budget(play(V, f, 'p@d4'), 0)).toBe(8)
		expect(outs(f, 'p@c3')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		const probe = play(V, f, 'p@c3', 1)
		expect(budget(probe, 0)).toBe(4)
		expect(at(probe, 'a3').every((x) => x === '0n')).toBe(true)
	})

	it('Q6 Q7 a captured ghost has one id in every possibility; a converging capture fills the hand', () => {
		const P = (n, c) => ({ e1: '0:k', b5: '0:b', [n]: '0:n', e8: '1:k', [c]: '1:n' })
		let s = stateOf(V, [[P('f3', 'c6'), 1], [P('h3', 'c6'), 1], [P('f3', 'a6'), 1], [P('h3', 'a6'), 1]])
		expect(outs(s, 'b5-c6')).toEqual([['move', 0.5, true], ['capture', 0.5, true]])
		s = play(V, s, 'b5-c6', 1)
		expect(s.worlds.length).toBe(2)
		const ids = s.worlds.map(({ b }) => b.sq.findIndex((q, id) => q === HAND && b.sd[id] === 0))
		expect(new Set(ids).size).toBe(1)
		expect(budget(s, 0)).toBe(2)
		s = play(V, s, 'e8-f8')
		expect(outs(s, 'n@d4')).toEqual([['move', 1, false]])
		s = play(V, s, 'n@d4')
		expect(ownPieceAt({ ...s, turn: 0 }, sq('d4'))).toBe(ids[0])
		expect(budget(s, 0)).toBe(2)
		let m = stateOf(V, [[{ a1: '0:k', e3: '0:n', h8: '1:k', e5: '1:n' }, 1]])
		m = play(V, m, 'e3-c4|g4')
		m = play(V, m, 'h8-h7')
		expect(outs(m, 'c4|g4-e5')).toEqual([['capture', 1, false]])
		m = play(V, m, 'c4|g4-e5')
		expect(m.worlds.length).toBe(1)
		expect(handView(m, 0)).toEqual([{ type: 'n', min: 1, max: 1, expected: 1 }])
	})

	it('Q10 pass = link: a drop that finds a ghost also settles the piece linked to it', () => {
		const A = { e1: '0:k', d1: '0:r', h7: '1:k', d4: '1:n' }
		const B = { e1: '0:k', d1: '0:r', h7: '1:k', f4: '1:n' }
		let s = stateOf(V, [[A, 1], [B, 1]], 0, withHand([[0, 'p']]))
		expect(outs(s, 'd1-d8')).toEqual([['move', 1, false]])
		s = play(V, s, 'd1-d8')
		expect(at(s, 'd1').sort()).toEqual(['.', '0r'])
		s = play(V, s, 'h7-h6')
		expect(outs(s, 'p@d4')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		const miss = play(V, s, 'p@d4', 0)
		expect(at(miss, 'd1')).toEqual(['0r'])
		expect(hand(miss, 0)).toEqual([['p', 1, 1]])
		const moved = play(V, s, 'p@d4', 1)
		expect(at(moved, 'd4')).toEqual(['0p'])
		expect(at(moved, 'd8')).toEqual(['0r'])
	})

	it('Q11 Q12 castling is certain-only; a partial slide loses the right, a corner drop never restores it', () => {
		const A = { e1: '0:k', h1: '0:r', e8: '1:k', g1: '1:n' }
		const B = { e1: '0:k', h1: '0:r', e8: '1:k', c3: '1:n' }
		let s = stateOf(V, [[A, 1], [B, 1]], 0, withHand([], [RIGHT_K]))
		expect(codes(s)).not.toContain('O-O')
		expect(branches(V, s, 'O-O')).toBeNull()
		s = play(V, { ...s, turn: 1 }, 'g1-e2')
		expect(outs(s, 'O-O')).toEqual([['move', 1, false]])
		s = play(V, s, 'O-O')
		expect(at(s, 'g1')).toEqual(['0k', '0k'])
		expect(at(s, 'f1')).toEqual(['0r', '0r'])
		const C = { e1: '0:k', h1: '0:r', e8: '1:k', h3: '1:n' }
		const D = { e1: '0:k', h1: '0:r', e8: '1:k', a6: '1:n' }
		let r = stateOf(V, [[C, 1], [D, 1]], 0, withHand([[0, 'r']], [RIGHT_K]))
		expect(outs(r, 'h1-h5')).toEqual([['move', 1, false]])
		r = play(V, r, 'h1-h5')
		expect(r.worlds.every(({ b }) => b.x.castle.length === 0)).toBe(true)
		r = play(V, r, 'e8-d8')
		expect(outs(r, 'r@h1')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		const miss = play(V, r, 'r@h1', 0)
		expect(at(miss, 'h1')).toEqual(['0r'])
		expect(codes({ ...miss, turn: 0 })).not.toContain('O-O')
		const moved = play(V, r, 'r@h1', 1)
		expect(at(moved, 'h5')).toEqual(['0r'])
		expect(codes({ ...moved, turn: 0 })).not.toContain('O-O')
	})

	it('Q13 en passant ends after one ply, also when that ply is a missed drop', () => {
		const P = (bq, nq) => ({ e1: '0:k', d2: '0:p', [bq]: '0:b', [nq]: '0:n', e8: '1:k', e4: '1:p' })
		let s = stateOf(
			V,
			[[P('a6', 'f1'), 1], [P('a6', 'h3'), 1], [P('c8', 'f1'), 1], [P('c8', 'h3'), 1]],
			0,
			withHand([[1, 'p']]),
		)
		s = play(V, s, 'd2-d4')
		expect(outs(s, 'e4-d3')).toEqual([['capture', 1, false]])
		expect(outs(s, 'p@a6')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		s = play(V, s, 'p@a6', 0)
		expect(s.worlds.length).toBe(2)
		expect(s.worlds.every(({ b }) => b.x.ep === -1 && b.x.epVictim === -1)).toBe(true)
		expect(hand(s, 1)).toEqual([['p', 1, 1]])
		expect(outs(s, 'e1-f1')).toEqual([['miss', 0.5, true], ['move', 0.5, true]])
		s = play(V, s, 'e1-f1', 0)
		expect(codes(s)).not.toContain('e4-d3')
	})

	it('Q14 king danger counts no piece in hand; a ghost\'s king capture is a roll that ends the game on a hit', () => {
		let s = stateOf(V, [[kings, 1]], 1, withHand([[1, 'q']]))
		expect(royalDanger(V, s, 0)).toBe(0)
		s = play(V, s, 'q@e2')
		expect(royalDanger(V, s, 0)).toBe(1)
		// a knight ghost 50 % on f6 takes the king on h7: Captured (the game is over) or Missed, never a follow-up roll
		const g = stateOf(V, [[{ a1: '0:k', f6: '0:n', h7: '1:k' }, 1], [{ a1: '0:k', b4: '0:n', h7: '1:k' }, 1]])
		const list = branches(V, g, 'f6-h7')
		expect(list.map((br) => [br.key, br.weight / T, br.notes])).toEqual([['miss', 0.5, []], ['capture', 0.5, []]])
		expect(play(V, g, 'f6-h7', 1).result).toEqual({ winner: 0, reason: 'king' })
		expect(play(V, g, 'f6-h7', 0).result).toBeNull()
	})
})

describe('crazyhouse: computer player and random games', () => {
	it('makes a legal move from the start at every level within its time budget', async () => {
		const s = newGame(V)
		for (const L of LEVELS) {
			const elapsed = stopwatch()
			const code = await chooseMove(V, s, { level: L.id, rng: seededRng(7) })
			const ms = elapsed()
			expect(branches(V, s, code), L.id + ' ' + code).not.toBeNull()
			expect(ms, L.id).toBeLessThan(L.timeMs + 1000)
		}
	}, 30000)

	it('values hand pieces in full, takes a king it can take and stays in time with full hands', async () => {
		const s = stateOf(
			V,
			[[{ a1: '0:k', h8: '1:k', g7: '1:p', h7: '1:p', a7: '1:p' }, 1]],
			0,
			withHand([[0, 'n'], [0, 'q']]),
		)
		// the search counts a hand piece at 0.8 of its value; the variant adds the other 0.2
		expect(V.evaluate(s.worlds[0].b, 0)).toBeCloseTo(0.2 * (220 + 420), 5)
		expect(V.evaluate(s.worlds[0].b, 1)).toBeCloseTo(-0.2 * (220 + 420), 5)
		let z = play(V, s, 'n@f7')
		z = play(V, z, 'a7-a6')
		expect(play(V, z, 'f7-h8').result).toEqual({ winner: 0, reason: 'king' })
		for (const L of LEVELS) {
			// it takes the king, or wins as surely by a move the king cannot escape (a queen drop on the back rank)
			const code = await chooseMove(V, z, { level: L.id, rng: seededRng(5), now: workClock() })
			expect(branches(V, z, code), L.id + ' ' + code).toHaveLength(1)
			expect(play(V, z, code).result?.winner, L.id + ' ' + code).toBe(0)
		}
		// a middlegame with pieces in both hands (many drops) at the hard level
		let m = newGame(V)
		for (const code of ['e2-e4', 'd7-d5', 'e4-d5', 'g8-f6', 'f1-b5', 'c7-c6', 'd5-c6', 'b7-c6', 'b5-c6', 'b8-c6']) {
			m = play(V, m, code)
		}
		expect(hand(m, 0)).toEqual([['p', 3, 3]])
		expect(hand(m, 1)).toEqual([['b', 1, 1], ['p', 1, 1]])
		const hard = LEVELS.find((l) => l.id === 'hard')
		const elapsed = stopwatch()
		const code = await chooseMove(V, m, { level: 'hard', rng: seededRng(9) })
		expect(branches(V, m, code), code).not.toBeNull()
		expect(elapsed()).toBeLessThan(hard.timeMs + 1500)
	}, 30000)

	it('orders the king\'s moves and the moves onto the squares in between first when a line attacks the king', () => {
		const hands = withHand([[0, 'n'], [0, 'p']])
		// the rook on h1 attacks a1 along rank 1: the king's move, the knight's moves and the drops onto b1..g1
		const rook = stateOf(V, [[{ a1: '0:k', a2: '0:p', b2: '0:p', d3: '0:n', h1: '1:r', h8: '1:k' }, 1]], 0, hands)
		expect(codes(rook).slice(0, 9).sort())
			.toEqual(['a1-b1', 'd3-c1', 'd3-e1', 'n@b1', 'n@c1', 'n@d1', 'n@e1', 'n@f1', 'n@g1'])
		// a promoted bishop on h8 attacks a1 along the diagonal: the king's moves come first, then b2..g7
		const bishop = stateOf(V, [[{ a1: '0:k', d3: '0:n', h8: '1:+b', g8: '1:k' }, 1]], 0, hands)
		const first = codes(bishop).slice(0, 17)
		expect(first.slice(0, 3).sort()).toEqual(['a1-a2', 'a1-b1', 'a1-b2'])
		const diagonal = ['b2', 'c3', 'd4', 'e5', 'f6', 'g7']
		expect(first.slice(3).sort())
			.toEqual(['d3-b2', 'd3-e5', ...diagonal.map((q) => 'n@' + q), ...diagonal.map((q) => 'p@' + q)].sort())
		// a blocked line keeps the generated order: the drops come last
		const blocked = stateOf(V, [[{ a1: '0:k', c1: '0:n', h1: '1:r', h8: '1:k' }, 1]], 0, hands)
		const list = codes(blocked)
		expect(list.findIndex((c) => c.includes('@'))).toBe(list.filter((c) => !c.includes('@')).length)
		expect(list.findIndex((c) => c.includes('@'))).toBeGreaterThan(0)
	})

	it('shields its certainly attacked king with a drop at 64 possibilities (normal and hard)', async () => {
		// White: Ka1, pawns a2 b2, three knights split in two. Black: Kh8, Rh1 (takes a1 next move for certain), Qa5,
		// three bishops split in two that attack the knights. Both hands hold n, b, r, q, p. White can capture
		// nothing; a knight move to b1 or d1 parries in half the possibilities, a drop on b1..g1 in all of them.
		// Before the ordering (drops last, 28 moves before the first one) the hard level ran out of time and played
		// c3-d1.
		const white = [['c5', 'e6'], ['d4', 'f5'], ['c3', 'e4']]
		const black = [['g2', 'h3'], ['a7', 'b8'], ['h7', 'g8']]
		const worlds = []
		for (let wm = 0; wm < 8; wm++) {
			for (let bm = 0; bm < 8; bm++) {
				const p = { a1: '0:k', a2: '0:p', b2: '0:p', h8: '1:k', h1: '1:r', a5: '1:q' }
				white.forEach((two, i) => {
					p[two[(wm >> i) & 1]] = '0:n'
				})
				black.forEach((two, i) => {
					p[two[(bm >> i) & 1]] = '1:b'
				})
				worlds.push([p, 1])
			}
		}
		const full = ['n', 'b', 'r', 'q', 'p'].flatMap((type) => [[0, type], [1, type]])
		const s = stateOf(V, worlds, 0, withHand(full))
		expect(s.worlds.length).toBe(64)
		expect(royalDanger(V, s, 0)).toBe(1)
		expect(codes(s).slice(0, 4)).toEqual(['a1-b1', 'c3-d1', 'c3-b1', 'n@b1'])
		for (const level of ['normal', 'hard']) {
			// a check every half millisecond, the pace of a desktop here: 3,000 checks at the normal level, 8,000 at
			// the hard level (a quarter as many leave the normal level on a1-b1, which leaves the king attacked)
			const code = await chooseMove(V, s, { level, rng: seededRng(3), now: workClock(0.5) })
			const list = branches(V, s, code)
			expect(list, level + ' ' + code).not.toBeNull()
			for (let i = 0; i < list.length; i++) {
				expect(royalDanger(V, play(V, s, code, i), 0), level + ' ' + code).toBeLessThan(1)
			}
		}
		// a fixed amount of work: about 7 s on a desktop, over twice that on a loaded one
	}, 60000)

	it('F1 random games with many drops keep the crazyhouse invariants', () => {
		for (const seed of [11, 12, 13, 14, 15, 16]) {
			randomGame(seededRng(seed))
		}
	}, 60000)
})

/**
 * The per-state invariants of crazyhouse (spec F1).
 *
 * @param {object} s state
 */
function checkF1(s) {
	const first = s.worlds[0].b
	const handKey = (b) => b.sq.map((q, id) => (q === HAND ? id + ':' + b.sd[id] + b.ty[id] : '')).join(',')
	const x = (b) => JSON.stringify([b.x.castle, b.x.ep, b.x.epVictim])
	const occupant = new Map()
	for (const { b } of s.worlds) {
		expect(handKey(b)).toBe(handKey(first))
		expect(x(b)).toBe(x(first))
		expect(b.sq.length).toBe(32)
		for (let id = 0; id < b.sq.length; id++) {
			expect(b.ty[id] + b.sd[id]).toBe(first.ty[id] + first.sd[id])
			if (b.sq[id] === OFF) {
				expect(b.ty[id]).toBe('k')
			}
			if (b.sq[id] === HAND) {
				expect(['p', 'n', 'b', 'r', 'q']).toContain(b.ty[id])
			}
			if (b.sq[id] >= 0) {
				const was = occupant.get(b.sq[id]) ?? id
				expect(was, 'one piece per square').toBe(id)
				occupant.set(b.sq[id], id)
				if (b.ty[id] === 'p') {
					expect([0, 7]).not.toContain(V.topology.coords[b.sq[id]][1])
				}
			}
		}
	}
	for (const side of [0, 1]) {
		const info = budgetInfo(V, s, side)
		expect(info.used).toBeLessThanOrEqual(info.limit)
	}
}

/**
 * One random game biased towards drops and quantum moves, checking F1 after every move and the outcomes of every
 * drop, castling and en passant it plays.
 *
 * @param {() => number} rng random numbers
 */
function randomGame(rng) {
	let s = newGame(V)
	checkF1(s)
	for (let ply = 0; ply < 100 && !s.result; ply++) {
		// keep the game going: no king captures while something else is possible
		const kingOn = (to) => s.worlds.some(({ b }) => b.board[to] >= 0 && b.ty[b.board[to]] === 'k')
		const all = legalMoves(V, s).filter((m) => !(m.type === 'move' && m.to >= 0 && kingOn(m.to)))
		let pool = (all.length ? all : legalMoves(V, s)).map((m) => m.code)
		const drops = all.filter((m) => m.drop)
		// drops onto a square where a ghost might stand are the interesting ones (a roll)
		const probes = drops.filter((m) => s.worlds.some(({ b }) => b.board[m.to] >= 0)).map((m) => m.code)
		const enemyOn = (to) => s.worlds.some(({ b }) => b.board[to] >= 0 && b.sd[b.board[to]] !== s.turn)
		const captures = all.filter((m) => m.type === 'move' && m.to >= 0 && enemyOn(m.to)).map((m) => m.code)
		const roll = rng()
		if (probes.length && roll < 0.2) {
			pool = probes
		} else if (drops.length && roll < 0.4) {
			pool = drops.map((m) => m.code)
		} else if (captures.length && roll < 0.55) {
			pool = captures
		} else if (ply % 3 === 1) {
			const froms = new Set()
			for (const { b } of s.worlds) {
				b.sq.forEach((q, id) => {
					if (q >= 0 && b.sd[id] === s.turn && V.types[b.ty[id]].splittable) {
						froms.add(q)
					}
				})
			}
			const splits = [...froms].flatMap((f) => splitsFrom(V, s, f).map((m) => m.code))
			if (splits.length) {
				pool = splits
			}
		}
		const code = pool[Math.floor(rng() * pool.length)]
		const outs = outcomes(V, s, code)
		for (const o of outs) {
			expect(o.notes.filter((n) => n.startsWith('solid:') || n.startsWith('end:')), code).toEqual([])
		}
		if (code.includes('@')) {
			expect(outs.map((o) => o.key).every((k) => k === 'miss' || k === 'move')).toBe(true)
			expect(outs.every((o) => o.rolled === (outs.length > 1))).toBe(true)
		}
		const res = applyMove(V, s, code, rng)
		const rec = res.state.history.at(-1)
		// only a capture, or a drop or pawn move that happened, resets the counter (a Missed drop adds 1)
		const happened = rec.captures.length > 0 || (rec.key === 'move' && (code.includes('@') || isPawnMove(s, code)))
		expect(res.state.quiet, code).toBe(happened ? 0 : s.quiet + 1)
		if (code.startsWith('O-O') || outs.some((o) => o.key === 'capture' && isEnPassant(s, code))) {
			expect(outs.map((o) => o.rolled)).toEqual([false])
		}
		s = res.state
		checkF1(s)
	}
}

/**
 * Whether a move code is a pawn move in the first world where its from square holds a piece.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {boolean}
 */
function isPawnMove(s, code) {
	const m = /^([a-h][1-8])-/.exec(code)
	if (!m) {
		return false
	}
	const w = s.worlds.find(({ b }) => b.board[sq(m[1])] >= 0)
	return Boolean(w) && w.b.ty[w.b.board[sq(m[1])]] === 'p'
}

/**
 * Whether a move code is an en passant capture in some world of the state.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {boolean}
 */
function isEnPassant(s, code) {
	const m = /^([a-h][1-8])-([a-h][1-8])$/.exec(code)
	return Boolean(m) && s.worlds.some(({ b }) => b.x.ep === sq(m[2]) && b.ty[b.board[sq(m[1])]] === 'p')
}
