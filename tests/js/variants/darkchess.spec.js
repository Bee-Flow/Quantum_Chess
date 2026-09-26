/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Fog of war (darkchess): the setup, the moves, what each side sees (own pieces, move targets and the en passant
 * victim, over all possibilities), capture-the-king without check, and the computer's view, which must depend only on
 * what a human in its seat can see. The cases are numbered D1-D18.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { chooseMove, LEVELS } from '../../../src/variants/core/ai.js'
import {
	applyMove,
	branches,
	isLegal,
	legalMoves,
	newGame,
	ordinaryMoves,
	outcomes,
	royalDanger,
	splitsFrom,
	squareView,
	T,
} from '../../../src/variants/core/quantum.js'
import { generate } from '../../../src/variants/core/world.js'
import V, { targetCount } from '../../../src/variants/darkchess.js'
import { play, stateOf, stopwatch, workClock } from './helpers.js'

const S = (name) => V.topology.byName(name)
const N = (sq) => V.topology.names[sq]

/**
 * Square names, sorted: a list such as `'d1 e1 a3:a8'`, where `a3:a8` is every square of that rectangle.
 *
 * @param {string} text square names and rectangles
 * @return {string[]}
 */
function squares(text) {
	const out = []
	for (const part of text.split(/\s+/).filter(Boolean)) {
		const [from, to = from] = part.split(':')
		const [f1, r1] = V.topology.coords[S(from)]
		const [f2, r2] = V.topology.coords[S(to)]
		for (let f = f1; f <= f2; f++) {
			for (let r = r1; r <= r2; r++) {
				out.push(N(V.topology.at([f, r])))
			}
		}
	}
	return out.sort()
}

/**
 * The squares a side sees, as sorted names.
 *
 * @param {object} s state
 * @param {number} side side index
 * @return {string[]}
 */
function seen(s, side) {
	return [...V.visibility(s, side)].map(N).sort()
}

/**
 * The outcomes of a move as `[key, p]` pairs.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {Array<[string, number]>|null}
 */
function odds(s, code) {
	const list = outcomes(V, s, code)
	return list && list.map((o) => [o.key, o.p])
}

/**
 * Play a move with the outcome of the given key.
 *
 * @param {object} s state
 * @param {string} code move code
 * @param {string} key outcome key
 * @return {object}
 */
function playKey(s, code, key) {
	const list = branches(V, s, code)
	expect(list, 'legal: ' + code).not.toBeNull()
	const index = list.findIndex((br) => br.key === key)
	expect(index, code + ' has outcome ' + key).toBeGreaterThanOrEqual(0)
	return play(V, s, code, index)
}

/**
 * Give every world the castling rights listed (flags K and Q of White, with the orthodox squares).
 *
 * @param {string} flags e.g. 'KQ'
 * @return {(b: object) => void}
 */
function rights(flags) {
	const all = {
		K: { flag: 'K', side: 0, king: S('e1'), rook: S('h1'), kingTo: S('g1'), rookTo: S('f1') },
		Q: { flag: 'Q', side: 0, king: S('e1'), rook: S('a1'), kingTo: S('c1'), rookTo: S('d1') },
	}
	return (b) => {
		b.x = { ep: -1, epVictim: -1, castle: [...flags].map((f) => ({ ...all[f] })) }
	}
}

/**
 * The number of ordinary moves from one square.
 *
 * @param {object} s state
 * @param {string} from square name
 * @return {number}
 */
function movesFrom(s, from) {
	return ordinaryMoves(V, s).filter((m) => m.from === S(from)).length
}

/**
 * The enemy kings of each world of a view.
 *
 * @param {object} view state
 * @param {number} enemy side
 * @return {number[]} per world, the number of enemy kings on the board
 */
function kingsPerWorld(view, enemy) {
	return view.worlds.map(({ b }) => b.sq.filter((s, id) => s >= 0 && b.sd[id] === enemy && b.ty[id] === 'k').length)
}

/**
 * The enemy pieces on the board in each world of a view, as type and square, sorted.
 *
 * @param {object} view state
 * @param {number} enemy side
 * @return {string[]} per world, e.g. 'kd8 nb8 ...'
 */
function enemyPieces(view, enemy) {
	return view.worlds.map(({ b }) => b.sq
		.flatMap((s, id) => (s >= 0 && b.sd[id] === enemy ? [b.ty[id] + N(s)] : []))
		.sort()
		.join(' '))
}

describe('darkchess: the orthodox game', () => {
	it('starts from the orthodox position with every piece on its square', () => {
		const s = newGame(V)
		const b = s.worlds[0].b
		const back = 'rnbqkbnr'
		for (let f = 0; f < 8; f++) {
			const file = 'abcdefgh'[f]
			const at = (sq) => b.sd[b.board[S(sq)]] + b.ty[b.board[S(sq)]]
			expect(at(file + '1')).toBe('0' + back[f])
			expect(at(file + '2')).toBe('0p')
			expect(at(file + '7')).toBe('1p')
			expect(at(file + '8')).toBe('1' + back[f])
			for (let r = 3; r <= 6; r++) {
				expect(b.board[S(file + r)]).toBe(-1)
			}
		}
		expect(b.sq.filter((sq) => sq >= 0)).toHaveLength(32)
		expect(b.x.castle.map((c) => c.flag).sort()).toEqual(['K', 'Q', 'k', 'q'])
		expect(s.turn).toBe(0)
		expect(legalMoves(V, s)).toHaveLength(20)
		expect(V.id).toBe('darkchess')
		expect(V.category).toBe('uncertainty')
		expect(V.hidden).toBe(true)
		const rules = V.rules()
		expect(rules.length).toBeGreaterThanOrEqual(3)
		expect(rules.length).toBeLessThanOrEqual(8)
		// the shared card explains capture-the-king, the escape rule, castling and en passant
		expect(rules.join(' ')).not.toMatch(/checkmate|only by capturing/i)
		expect(V.specialMoves).toBe(true)
		for (const ty of Object.keys(V.types)) {
			expect(typeof V.types[ty].name()).toBe('string')
			expect(V.types[ty].glyph.sprite).toBe(ty)
		}
	})

	it('moves every piece type as in orthodox chess', () => {
		const kings = { b1: '0:k', h7: '1:k' }
		const count = (piece, from, extra = {}) => movesFrom(
			stateOf(V, [[{ ...kings, ...extra, [from]: piece }, 1]]),
			from,
		)
		expect(count('0:q', 'd4')).toBe(27)
		expect(count('0:r', 'd4')).toBe(14)
		expect(count('0:b', 'd4')).toBe(13)
		expect(count('0:n', 'd4')).toBe(8)
		expect(movesFrom(stateOf(V, [[{ e4: '0:k', h7: '1:k' }, 1]]), 'e4')).toBe(8)
		// a pawn: one or two steps from its start rank, captures diagonally, promotes to four types
		expect(count('0:p', 'e2')).toBe(2)
		expect(count('0:p', 'e2', { d3: '1:n', f3: '1:b' })).toBe(4)
		expect(count('0:p', 'e3')).toBe(1)
		const promo = ordinaryMoves(V, stateOf(V, [[{ ...kings, a7: '0:p' }, 1]])).filter((m) => m.from === S('a7'))
		expect(promo.map((m) => m.code).sort()).toEqual(['a7-a8=b', 'a7-a8=n', 'a7-a8=q', 'a7-a8=r'])
		// Black's pawn moves down the board
		const black = stateOf(V, [[{ ...kings, e7: '1:p' }, 1]], 1)
		expect(ordinaryMoves(V, black).filter((m) => m.from === S('e7')).map((m) => m.code).sort())
			.toEqual(['e7-e5', 'e7-e6'])
	})

	it('D5: castling ignores attacks, and needs the squares between king and rook empty', () => {
		const s = stateOf(V, [[{ e1: '0:k', h1: '0:r', a8: '1:k', f8: '1:r' }, 1]], 0, rights('K'))
		expect(odds(s, 'O-O')).toEqual([['move', 1]])
		expect(seen(s, 0)).toEqual(squares('d1 e1 f1 g1 h1 d2 e2 f2 h2:h8'))
		const after = play(V, s, 'O-O')
		const b = after.worlds[0].b
		expect(b.ty[b.board[S('g1')]]).toBe('k')
		expect(b.ty[b.board[S('f1')]]).toBe('r')
		expect(seen(after, 1)).toEqual(expect.arrayContaining(squares('f1:f7')))
		// out of, through and into attack
		const hot = { e1: '0:k', a1: '0:r', h1: '0:r', c8: '1:r', d8: '1:r', e8: '1:r', h8: '1:k' }
		const s2 = stateOf(V, [[hot, 1]], 0, rights('KQ'))
		expect(odds(s2, 'O-O')).toEqual([['move', 1]])
		expect(odds(s2, 'O-O-O')).toEqual([['move', 1]])
		expect(branches(V, stateOf(V, [[{ ...hot, b1: '0:n' }, 1]], 0, rights('KQ')), 'O-O-O')).toBeNull()
	})

	it('D6: there is no check; a king that steps into an unseen attack is captured and the game is lost', () => {
		const s = stateOf(V, [[{ e1: '0:k', h8: '1:k', d8: '1:r' }, 1]])
		expect(seen(s, 0)).toEqual(squares('d1 e1 f1 d2 e2 f2'))
		expect(odds(s, 'e1-d1')).toEqual([['move', 1]])
		const after = play(V, s, 'e1-d1')
		expect(seen(after, 1)).toContain('d1')
		expect(odds(after, 'd8-d1')).toEqual([['capture', 1]])
		expect(play(V, after, 'd8-d1').result).toEqual({ winner: 1, reason: 'king' })
	})

	it('has the classic end rules: no stalemate, a king that cannot escape loses at once, even unseen', () => {
		expect([V.escapeRule, V.drawsWait, V.bareKingsDraw]).toEqual([true, true, false])
		// every step of the king is attacked for certain, by a queen that White does not see: Black wins at once
		const mate = stateOf(V, [[{ a1: '0:k', h8: '1:k', c4: '1:q' }, 1]], 1)
		const after = play(V, mate, 'c4-b3')
		expect(seen(after, 0)).toEqual(squares('a1 a2 b1 b2'))
		expect(after.result).toEqual({ winner: 1, reason: 'cannotEscape' })
		// a danger that is not certain (the attacker is a ghost) is no reason to stop: the king must still move
		const ghost = stateOf(V, [
			[{ a1: '0:k', h8: '1:k', c4: '1:q' }, 1],
			[{ a1: '0:k', h8: '1:k', g4: '1:q' }, 1],
		], 1)
		const risky = play(V, ghost, 'c4-b3')
		expect(risky.result).toBeNull()
		expect(legalMoves(V, risky).map((m) => m.code).sort()).toEqual(['a1-a2', 'a1-b1', 'a1-b2'])
		expect(play(V, risky, 'a1-b1').result).toBeNull()
	})

	it('has no bare-kings draw: the kings cannot see each other, so either may still be taken', () => {
		// White takes the last black piece: only the kings are left, and the game goes on
		const bare = play(V, stateOf(V, [[{ a1: '0:k', b2: '1:n', e5: '1:k' }, 1]]), 'a1-b2')
		expect(bare.result).toBeNull()
		const near = play(V, bare, 'e5-d4')
		expect(seen(near, 0)).not.toContain('d4')
		// the white king steps next to the black king without seeing it, and is taken
		const blind = play(V, near, 'b2-c3')
		expect(blind.result).toBeNull()
		expect(seen(blind, 1)).toContain('c3')
		expect(play(V, blind, 'd4-c3').result).toEqual({ winner: 1, reason: 'king' })
	})

	it('draws after 50 moves by each side without a capture or pawn move, and a capture resets the count', () => {
		const base = stateOf(V, [[{ a1: '0:k', h8: '1:k', d4: '0:r', d7: '1:n' }, 1]])
		const s = { ...base, quiet: 99 }
		expect(play(V, s, 'a1-a2').result).toEqual({ winner: null, reason: 'quiet' })
		const took = play(V, s, 'd4-d7')
		expect(took.result).toBeNull()
		expect(took.quiet).toBe(0)
		// the draw waits while the player to move can capture the enemy king for certain: here the white king steps
		// next to a rook it does not see
		const unseen = { ...stateOf(V, [[{ a1: '0:k', d4: '0:r', h8: '1:k', b8: '1:r' }, 1]]), quiet: 99 }
		expect(seen(unseen, 0)).not.toContain('b8')
		expect(play(V, unseen, 'a1-a2').result).toEqual({ winner: null, reason: 'quiet' })
		const waits = play(V, unseen, 'a1-b1')
		expect(waits.result).toBeNull()
		expect(waits.quiet).toBe(100)
		expect(play(V, waits, 'b8-b1').result).toEqual({ winner: 1, reason: 'king' })
	})
})

describe('darkchess: what each side sees', () => {
	it('D1: at the start each side sees its own half of the board', () => {
		const s = newGame(V)
		expect(seen(s, 0)).toEqual(squares('a1:h4'))
		expect(seen(s, 1)).toEqual(squares('a5:h8'))
	})

	it('D2: after 1. e4 d5 the pawns see each other, and e3 stays dark', () => {
		let s = play(V, newGame(V), 'e2-e4')
		expect(seen(s, 0)).toEqual(squares('a1:h2 a3 b3 c3 d3 f3 g3 h3 a4:h4 b5 e5 h5 a6'))
		expect(seen(s, 0)).not.toContain('e3')
		expect(seen(s, 1)).toEqual(squares('a5:h8'))
		s = play(V, s, 'd7-d5')
		expect(seen(s, 0)).toHaveLength(36)
		expect(seen(s, 0)).toContain('d5')
		expect(seen(s, 1)).toHaveLength(36)
		expect(seen(s, 1).filter((n) => Number(n[1]) <= 4)).toEqual(['d4', 'e4', 'g4', 'h3'])
	})

	it('D3: a pawn does not see the piece that blocks it', () => {
		const s = stateOf(V, [[{ e1: '0:k', e4: '0:p', e8: '1:k', e5: '1:p' }, 1]])
		expect(seen(s, 0)).toEqual(squares('d1 e1 f1 d2 e2 f2 e4'))
		expect(legalMoves(V, s).map((m) => m.from)).toEqual(new Array(5).fill(S('e1')))
	})

	it('D4: en passant shows the passing pawn for one turn, and the victim learns only the square', () => {
		let s = stateOf(V, [[{ e1: '0:k', e5: '0:p', e8: '1:k', d7: '1:p' }, 1]], 1)
		s = play(V, s, 'd7-d5')
		expect(seen(s, 0)).toEqual(squares('d1 e1 f1 d2 e2 f2 d5 e5 d6 e6'))
		expect(odds(s, 'e5-d6')).toEqual([['capture', 1]])
		// the computer may know the en passant square while it can use it
		const view = V.aiView(s, 0)
		expect(view.worlds[0].b.x.ep).toBe(S('d6'))
		expect(odds(view, 'e5-d6')).toEqual([['capture', 1]])
		const taken = play(V, s, 'e5-d6')
		expect(taken.worlds[0].b.board[S('d5')]).toBe(-1)
		const record = taken.history.at(-1)
		expect(record.captures).toEqual([S('d6')])
		expect(record.info).toEqual({ taken: [S('d5')], types: [['p']] })
		expect(V.infoText(record, 1)).toEqual(['Capture on d5'])
		expect(V.infoText(record, 0)).toBeNull()
		expect(seen(taken, 1)).toEqual(squares('d7 e7 f7 d8 e8 f8'))
		// without the capture, the window closes after White's move
		expect(seen(play(V, s, 'e1-f1'), 0)).toEqual(squares('e1 f1 g1 e2 f2 g2 e5 e6'))
	})

	it('D16: a promotion in the fog stays unseen', () => {
		const s = stateOf(V, [[{ e1: '0:k', a7: '0:p', h8: '1:k' }, 1]])
		expect(seen(s, 1)).toEqual(squares('g7 h7 g8 h8'))
		expect(odds(s, 'a7-a8=q')).toEqual([['move', 1]])
		const after = play(V, s, 'a7-a8=q')
		expect(seen(after, 1)).toEqual(squares('g7 h7 g8 h8'))
		expect(after.history.at(-1).info).toBeUndefined()
		expect(royalDanger(V, after, 1)).toBe(1)
		expect(seen(after, 0)).toEqual(expect.arrayContaining(squares('b8:h8')))
	})
})

describe('darkchess: the quantum rules in the fog', () => {
	it('D7: splitting a knight scouts from both squares', () => {
		const s = play(V, newGame(V), 'g1-f3|h3')
		const gained = seen(s, 0).filter((n) => !squares('a1:h4').includes(n))
		expect(gained).toEqual(['e5', 'g5'])
		expect(seen(s, 0)).toEqual(expect.arrayContaining(squares('a1:h4')))
		expect(seen(s, 1)).toEqual(squares('a5:h8'))
	})

	it('D8: an enemy ghost half in the fog, a linked rook that sees the king, and the game-end roll', () => {
		const s = stateOf(V, [
			[{ a1: '0:r', e1: '0:k', e8: '1:k', a5: '1:n' }, 1],
			[{ a1: '0:r', e1: '0:k', e8: '1:k', h5: '1:n' }, 1],
		])
		expect(seen(s, 0)).toEqual(squares('a1 b1 c1 d1 e1 f1 a2 d2 e2 f2 a3:a8'))
		expect(squareView(s, S('a5'))).toEqual([expect.objectContaining({ side: 1, type: 'n', p: 0.5 })])
		expect(odds(s, 'a1-a5')).toEqual([['move', 0.5], ['capture', 0.5]])
		// pass = link: the rook passes the possible knight, no roll
		expect(outcomes(V, s, 'a1-a8')).toEqual([expect.objectContaining({ key: 'move', p: 1, rolled: false })])
		let after = play(V, s, 'a1-a8')
		expect(seen(after, 0)).toEqual(expect.arrayContaining(squares('b8 c8 d8 e8')))
		expect(royalDanger(V, after, 1)).toBe(0.5)
		after = play(V, after, 'h5-g7')
		expect(odds(after, 'a8-e8')).toEqual([['miss', 0.5], ['capture', 0.5]])
		expect(playKey(after, 'a8-e8', 'capture').result).toEqual({ winner: 0, reason: 'king' })
		const missed = playKey(after, 'a8-e8', 'miss')
		expect(missed.result).toBeNull()
		expect(missed.worlds).toHaveLength(1)
		const b = missed.worlds[0].b
		expect(b.ty[b.board[S('a1')]]).toBe('r')
		expect(b.ty[b.board[S('a5')]]).toBe('n')
	})

	it('D9: a pawn sees a possible enemy on its diagonal, and its capture rolls', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', e4: '0:p', e8: '1:k', d5: '1:n' }, 1],
			[{ e1: '0:k', e4: '0:p', e8: '1:k', b6: '1:n' }, 1],
		])
		expect(seen(s, 0)).toEqual(squares('d1 e1 f1 d2 e2 f2 e4 d5 e5'))
		expect(odds(s, 'e4-d5')).toEqual([['miss', 0.5], ['capture', 0.5]])
		expect(branches(V, s, 'e4-f5')).toBeNull()
		expect(odds(s, 'e4-e5')).toEqual([['move', 1]])
	})

	it('D13: the en passant window closes after any turn, also after a Measure', () => {
		const worlds = []
		for (const wn of ['f3', 'h3']) {
			for (const bn of ['f6', 'h6']) {
				worlds.push([{ e1: '0:k', e8: '1:k', d2: '0:p', e4: '1:p', [wn]: '0:n', [bn]: '1:n' }, 1])
			}
		}
		let s = stateOf(V, worlds)
		expect(odds(s, 'd2-d4')).toEqual([['move', 1]])
		s = play(V, s, 'd2-d4')
		expect(seen(s, 1)).toEqual(squares('d3 e3 f3 d4 e4 g4 d5 f5 h5 f6 h6 d7 e7 f7 h7 d8 e8 f8 g8'))
		expect(odds(s, 'e4-d3')).toEqual([['capture', 1]])
		s = playKey(s, '?f6', 'f6')
		const fifteen = squares('e3 f3 e4 g4 d5 h5 f6 d7 e7 f7 h7 d8 e8 f8 g8')
		expect(seen(s, 1)).toEqual(fifteen)
		s = playKey(s, '?f3', 'f3')
		expect(branches(V, s, 'e4-d3')).toBeNull()
		expect(seen(s, 1)).toEqual(fifteen)
	})

	it('D13b: pass = link, and the window also closes in the possibilities where the move missed', () => {
		const worlds = []
		for (const wn of ['f3', 'h3']) {
			for (const bn of ['f6', 'h6']) {
				worlds.push([{ e1: '0:k', e8: '1:k', d2: '0:p', e4: '1:p', [wn]: '0:n', [bn]: '1:n' }, 1])
			}
		}
		let s = play(V, stateOf(V, worlds), 'd2-d4')
		expect(outcomes(V, s, 'f6-g4')).toEqual([expect.objectContaining({ key: 'move', p: 1, rolled: false })])
		s = play(V, s, 'f6-g4')
		expect(s.worlds.every(({ b }) => b.x.ep === -1 && b.x.epVictim === -1)).toBe(true)
		expect(seen(s, 1)).toEqual(squares('f2 h2 e3 f3 e4 g4 e5 f5 f6 h6 d7 e7 f7 d8 e8 f8 g8'))
		expect(odds(s, 'f3-g5')).toEqual([['move', 1]])
		s = play(V, s, 'f3-g5')
		expect(seen(s, 1)).toEqual(squares('f2 h2 e3 e4 g4 e5 f5 f6 h6 d7 e7 f7 d8 e8 f8 g8'))
		expect(branches(V, s, 'e4-d3')).toBeNull()
	})

	it('D18: castling past a possible enemy ghost is illegal, and the square shows the ghost', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', h1: '0:r', e8: '1:k', f1: '1:n' }, 1],
			[{ e1: '0:k', h1: '0:r', e8: '1:k', d6: '1:n' }, 1],
		], 0, rights('K'))
		expect(branches(V, s, 'O-O')).toBeNull()
		expect(legalMoves(V, s).map((m) => m.code)).not.toContain('O-O')
		expect(seen(s, 0)).toEqual(squares('d1 e1 f1 g1 h1 d2 e2 f2 h2:h8'))
		expect(squareView(s, S('f1'))).toEqual([expect.objectContaining({ side: 1, type: 'n', p: 0.5 })])
		expect(outcomes(V, s, 'h1-f1').map((o) => [o.key, o.p, o.rolled])).toEqual([
			['move', 0.5, true],
			['capture', 0.5, true],
		])
		expect(branches(V, V.aiView(s, 0), 'O-O')).toBeNull()
	})
})

describe('darkchess: the computer sees only what a player sees', () => {
	it('D10: two positions that look the same give the same view; a visible difference changes it', () => {
		const e4 = play(V, newGame(V), 'e2-e4')
		const a = play(V, e4, 'h7-h6')
		const b = play(V, e4, 'g7-g6')
		const c = play(V, e4, 'd7-d5')
		expect(seen(a, 0)).toEqual(seen(b, 0))
		expect(V.aiView(a, 0)).toEqual(V.aiView(b, 0))
		expect(V.aiView(c, 0)).not.toEqual(V.aiView(a, 0))
		for (const real of [a, b, c]) {
			const view = V.aiView(real, 0)
			const vis = V.visibility(real, 0)
			expect(view.worlds.reduce((acc, e) => acc + e.w, 0)).toBe(T)
			expect(kingsPerWorld(view, 1)).toEqual(view.worlds.map(() => 1))
			expect(view.history).toEqual([])
			expect(view.quiet).toBe(0)
			for (const { b: vb } of view.worlds) {
				for (let id = 0; id < vb.sq.length; id++) {
					const sq = vb.sq[id]
					if (vb.sd[id] === 0) {
						const rb = real.worlds[0].b
						expect(rb.sd[rb.board[sq]] + rb.ty[rb.board[sq]]).toBe('0' + vb.ty[id])
					} else if (sq >= 0 && vis.has(sq)) {
						expect(squareView(real, sq).some((o) => o.side === 1 && o.type === vb.ty[id])).toBe(true)
					}
				}
			}
		}
	})

	it('D14: the view does not depend on the order of the possibilities', () => {
		const at = (knight, bishop) => ({ a1: '0:k', e1: '0:r', h8: '1:k', [knight]: '1:n', [bishop]: '1:b' })
		let p = stateOf(V, [[at('e5', 'c8'), 1], [at('g8', 'e5'), 1]])
		let q = stateOf(V, [[at('e5', 'g8'), 1], [at('c8', 'e5'), 1]])
		expect(seen(p, 0)).toEqual(squares('a1:h1 a2 b2 e2 e3 e4 e5'))
		expect(squareView(p, S('e5')).map((o) => [o.type, o.p]).sort()).toEqual([['b', 0.5], ['n', 0.5]])
		expect(outcomes(V, p, 'e1-e5'))
			.toEqual([expect.objectContaining({ key: 'capture', p: 1, captures: [S('e5')] })])
		p = play(V, p, 'e1-e5')
		q = play(V, q, 'e1-e5')
		// the rook took a knight or a bishop: that is all White saw on e5
		expect(p.history.at(-1).info).toEqual({ taken: [S('e5')], types: [['b', 'n']] })
		// a Measure of Black's is not seen: whichever piece it finds, White's view stays the same
		const measured = ['gone', 'g8'].map((key) => playKey(p, '?g8', key))
		expect(seen(measured[0], 0)).toEqual(seen(measured[1], 0))
		expect(V.aiView(measured[0], 0)).toEqual(V.aiView(measured[1], 0))
		p = play(V, p, 'h8-g7')
		q = play(V, q, 'h8-g7')
		const vis = squares('a1 b1 e1 a2 b2 e2 e3 e4 a5:h5 e6 e7 e8')
		expect(seen(p, 0)).toEqual(vis)
		expect(seen(q, 0)).toEqual(vis)
		const view = V.aiView(p, 0)
		expect(view).toEqual(V.aiView(q, 0))
		// the view counts the captured types from what White saw, not per possibility: both knights and both
		// bishops stay, and the king takes the nearest hidden square on its rank (the queen's)
		expect(view.worlds.map((e) => e.w)).toEqual([T])
		expect(enemyPieces(view, 1)).toEqual([
			'bc8 bf8 kd8 nb8 ng8 pa7 pb7 pc7 pd7 pf7 pg7 ph7 ra8 rh8',
		])
	})

	it('D14b: the view does not learn from a capture which type the capture took', () => {
		// White's rook is a ghost on e1 or h1; e5 holds a knight or a bishop. Which one stands on e5 in the
		// possibility with the rook on e1 is not on the board, and differs between p and q
		const at = (rook, knight, bishop) => ({ a1: '0:k', [rook]: '0:r', d8: '1:k', [knight]: '1:n', [bishop]: '1:b' })
		const p = stateOf(V, [[at('e1', 'e5', 'c8'), 1], [at('h1', 'g8', 'e5'), 1]])
		const q = stateOf(V, [[at('e1', 'g8', 'e5'), 1], [at('h1', 'e5', 'c8'), 1]])
		expect(seen(p, 0)).toEqual(seen(q, 0))
		expect(squareView(p, S('e5')).map((o) => [o.type, o.p]).sort()).toEqual([['b', 0.5], ['n', 0.5]])
		expect(squareView(q, S('e5')).map((o) => [o.type, o.p]).sort()).toEqual([['b', 0.5], ['n', 0.5]])
		expect(odds(p, 'e1-e5')).toEqual(odds(q, 'e1-e5'))
		const tp = playKey(p, 'e1-e5', 'capture')
		const tq = playKey(q, 'e1-e5', 'capture')
		expect(tp.history.at(-1).info).toEqual({ taken: [S('e5')], types: [['b', 'n']] })
		expect(tq.history.at(-1).info).toEqual(tp.history.at(-1).info)
		expect(seen(tp, 0)).toEqual(seen(tq, 0))
		expect(V.aiView(tp, 0)).toEqual(V.aiView(tq, 0))
	})

	it('D14c: the view does not learn from a hidden Measure which enemy type stands with which own ghost part', () => {
		// White's rook is a ghost on e1 or h1, e5 holds a knight or a bishop, and Black's queen is a ghost on b6 or c6,
		// in the fog. Whatever Black's Measure finds, White sees the same board and the same odds, but the rook's e1
		// part stands with the knight on e5 in one case and with the bishop in the other
		const at = (rook, knight, bishop, queen) => ({
			a1: '0:k',
			[rook]: '0:r',
			d7: '1:k',
			[knight]: '1:n',
			[bishop]: '1:b',
			[queen]: '1:q',
		})
		const s = stateOf(V, [
			[at('e1', 'e5', 'c8', 'b6'), 1],
			[at('e1', 'b8', 'e5', 'c6'), 1],
			[at('h1', 'e5', 'c8', 'c6'), 1],
			[at('h1', 'b8', 'e5', 'b6'), 1],
		], 1)
		const [a, b] = ['b6', 'c6'].map((key) => playKey(s, '?b6', key))
		expect(a.worlds).toHaveLength(2)
		expect(seen(a, 0)).toEqual(seen(b, 0))
		const parts = (st, sq) => squareView(st, sq).map((o) => [o.id, o.side, o.type, o.p]).sort()
		for (const sq of V.visibility(a, 0)) {
			expect(parts(b, sq), N(sq)).toEqual(parts(a, sq))
		}
		expect(squareView(a, S('e5')).map((o) => [o.type, o.p]).sort()).toEqual([['b', 0.5], ['n', 0.5]])
		const codes = legalMoves(V, a, { splits: true }).map((m) => m.code)
		expect(legalMoves(V, b, { splits: true }).map((m) => m.code)).toEqual(codes)
		for (const code of codes) {
			expect(odds(b, code), code).toEqual(odds(a, code))
		}
		expect(V.aiView(a, 0)).toEqual(V.aiView(b, 0))
		// the view puts the likeliest type on e5 in every possibility (a tie: the bishop, before the knight)
		const army = 'bc8 be5 ke8 nb8 ng8 pa7 pb7 pc7 pd7 pe7 pf7 pg7 qd8 ra8'
		expect(enemyPieces(V.aiView(a, 0), 1)).toEqual([army, army])
	})

	it('records a merge capture with its square and type, and the view counts the piece as taken', () => {
		const s = stateOf(V, [
			[{ a1: '0:r', e1: '0:k', h8: '1:k', a4: '1:n' }, 1],
			[{ h4: '0:r', e1: '0:k', h8: '1:k', a4: '1:n' }, 1],
		])
		expect(odds(s, 'a1|h4-a4')).toEqual([['capture', 1]])
		const after = play(V, s, 'a1|h4-a4')
		const record = after.history.at(-1)
		expect(record.info).toEqual({ taken: [S('a4')], types: [['n']] })
		expect(V.infoText(record, 1)).toEqual(['Capture on a4'])
		expect(V.infoText(record, 0)).toBeNull()
		// g8 stays hidden, yet the view holds only one knight
		expect(seen(after, 0)).not.toContain('g8')
		expect(enemyPieces(V.aiView(after, 0), 1)).toEqual(['bc8 bf8 ke8 nb8 pb7 pc7 pd7 pe7 pf7 pg7 ph7 qd8 rh8'])
	})

	it('puts no phantom on a hidden square its pawns show empty, and then takes a free promotion', async () => {
		const s = stateOf(V, [[{ a1: '0:k', d7: '0:p', h8: '1:k', h7: '1:p' }, 1]])
		expect(seen(s, 0)).toEqual(squares('a1 b1 a2 b2 d7 d8'))
		// c8 and e8 are hidden, yet empty in every possibility: a piece there would be a target of the pawn
		expect(enemyPieces(V.aiView(s, 0), 1)).toEqual(['kf8 nb8 ng8 pa7 pb7 pc7 pe7 pf7 pg7 ph7 ra8 rh8'])
		for (const level of LEVELS) {
			const code = await chooseMove(V, s, { level: level.id, rng: seededRng(3), now: workClock() })
			expect(code, level.id).toBe('d7-d8=q')
		}
		// the same for Black, whose king goes to the nearest hidden square of its own back rank
		const black = stateOf(V, [[{ h8: '1:k', d2: '1:p', a8: '0:k' }, 1]], 1)
		expect(enemyPieces(V.aiView(black, 1), 0)).toEqual(['kf1 nb1 ng1 pa2 pb2 pc2 pe2 pf2 pg2 ph2 ra1 rh1'])
	})

	it('D15: moving the hidden part of an enemy ghost changes nothing the player or the computer can see', () => {
		const ghost = (second) => stateOf(V, [
			[{ a1: '0:r', e1: '0:k', e8: '1:k', a5: '1:n' }, 1],
			[{ a1: '0:r', e1: '0:k', e8: '1:k', [second]: '1:n' }, 1],
		])
		const a = ghost('h5')
		const b = ghost('g6')
		expect(seen(a, 0)).toEqual(seen(b, 0))
		expect(seen(a, 0)).not.toContain('h5')
		expect(seen(b, 0)).not.toContain('g6')
		const codes = legalMoves(V, a, { splits: true }).map((m) => m.code)
		expect(codes).toHaveLength(51)
		expect(legalMoves(V, b, { splits: true }).map((m) => m.code)).toEqual(codes)
		const brief = (s, code) => outcomes(V, s, code).map((o) => [o.key, o.p, o.rolled, o.notes])
		for (const code of codes) {
			expect(brief(b, code), code).toEqual(brief(a, code))
		}
		expect(V.aiView(a, 0)).toEqual(V.aiView(b, 0))
	})

	it('D17: the view does not know which of two knights it sees', () => {
		const p = stateOf(V, [[{ a1: '0:k', e1: '0:r', h8: '1:k', e5: '1:n', b8: '1:n' }, 1]])
		const q = stateOf(V, [[{ a1: '0:k', e1: '0:r', h8: '1:k', b8: '1:n', e5: '1:n' }, 1]])
		expect(seen(p, 0)).toEqual(seen(q, 0))
		expect(seen(p, 0)).toContain('e5')
		expect(seen(p, 0)).not.toContain('b8')
		expect(V.aiView(p, 0)).toEqual(V.aiView(q, 0))
	})

	it('D11: in random games the fog, the view and the real state agree on everything a player can see', () => {
		const kindOf = (note) => (note.startsWith('end:') ? note : note.split(':')[0])
		const brief = (list) => list && list.map((o) => [o.key, o.weight, o.rolled, o.notes.map(kindOf)])
		let maxWorlds = 0
		for (const seed of [11, 12, 13]) {
			const rng = seededRng(seed)
			let s = newGame(V)
			for (let ply = 0; ply < 60 && !s.result; ply++) {
				const me = s.turn
				const vis = V.visibility(s, me)
				const view = V.aiView(s, me)
				expect(view.worlds.reduce((acc, e) => acc + e.w, 0)).toBe(T)
				expect(kingsPerWorld(view, 1 - me)).toEqual(view.worlds.map(() => 1))
				for (const { b } of s.worlds) {
					b.sq.forEach((sq, id) => {
						if (b.sd[id] === me && sq >= 0) {
							expect(vis.has(sq)).toBe(true)
						}
					})
				}
				for (let sq = 0; sq < V.topology.size; sq++) {
					expect(new Set(squareView(s, sq).map((o) => o.side)).size).toBeLessThanOrEqual(1)
				}
				const real = legalMoves(V, s)
				const codes = real.map((m) => m.code)
				for (const m of real) {
					if (m.type === 'move') {
						expect(vis.has(m.to), m.code).toBe(true)
					}
					expect(branches(V, view, m.code), m.code).not.toBeNull()
					expect(brief(branches(V, view, m.code)), m.code).toEqual(brief(branches(V, s, m.code)))
				}
				// moves that only the view allows are pawn moves onto or through a hidden square
				for (const m of legalMoves(V, view)) {
					if (!codes.includes(m.code)) {
						const b0 = s.worlds[0].b
						expect(b0.ty[b0.board[m.from]], m.code).toBe('p')
						const [file, rank] = V.topology.coords[m.from]
						const double = Math.abs(V.topology.coords[m.to][1] - rank) === 2
						const first = double ? V.topology.at([file, (rank + V.topology.coords[m.to][1]) / 2]) : m.to
						expect(!vis.has(m.to) || !vis.has(first), m.code).toBe(true)
					}
				}
				const splits = []
				for (const f of new Set(s.worlds.flatMap(({ b }) => b.sq.filter((sq, id) => sq >= 0
					&& b.sd[id] === me && V.types[b.ty[id]].splittable)))) {
					splits.push(...splitsFrom(V, s, f).slice(0, 3))
				}
				for (const m of splits) {
					expect(brief(branches(V, view, m.code)), m.code).toEqual(brief(branches(V, s, m.code)))
				}
				maxWorlds = Math.max(maxWorlds, s.worlds.length)
				// splits often, so that the games reach many possibilities (up to 64)
				const pool = rng() < 0.4 && splits.length ? splits.map((m) => m.code) : codes
				s = applyMove(V, s, pool[Math.floor(rng() * pool.length)], rng).state
			}
		}
		expect(maxWorlds).toBe(64)
	}, 60000)

	it('counts for the vision term exactly the squares that the moves of a side go to', () => {
		const targets = (b, side) => new Set([...generate(V, b, side).values()].map((m) => m.to)).size
		const seenKinds = new Set()
		const check = (s) => {
			for (const { b } of [...s.worlds, ...V.aiView(s, s.turn).worlds]) {
				for (const side of [0, 1]) {
					expect(targetCount(b, side)).toBe(targets(b, side))
					for (const m of generate(V, b, side).values()) {
						seenKinds.add(m.kind)
					}
				}
			}
		}
		// en passant, both castlings and a double step, then random games
		let ep = stateOf(V, [[{ e1: '0:k', e5: '0:p', e8: '1:k', d7: '1:p' }, 1]], 1)
		ep = play(V, ep, 'd7-d5')
		check(ep)
		check(stateOf(V, [[{ e1: '0:k', a1: '0:r', h1: '0:r', b2: '0:p', e8: '1:k' }, 1]], 0, rights('KQ')))
		for (const seed of [21, 22]) {
			const rng = seededRng(seed)
			let s = newGame(V)
			for (let ply = 0; ply < 80 && !s.result; ply++) {
				check(s)
				const codes = legalMoves(V, s, { splits: rng() < 0.3 }).map((m) => m.code)
				s = applyMove(V, s, codes[Math.floor(rng() * codes.length)], rng).state
			}
		}
		expect([...seenKinds]).toEqual(expect.arrayContaining(['ep', 'castle', 'double']))
		// at the start White could move to the 16 squares of ranks 3 and 4, worth 2 centipawns each
		expect(V.evaluate(newGame(V).worlds[0].b, 0)).toBe(2 * 16)
	}, 60000)

	it('makes a legal move at every level, within its time, from the start and beside an enemy ghost', async () => {
		const ghost = play(V, stateOf(V, [
			[{ a1: '0:r', e1: '0:k', e8: '1:k', a5: '1:n', h7: '1:p' }, 1],
			[{ a1: '0:r', e1: '0:k', e8: '1:k', h5: '1:n', h7: '1:p' }, 1],
		]), 'a1-a8')
		for (const s of [newGame(V), ghost]) {
			for (const level of LEVELS) {
				const elapsed = stopwatch()
				const code = await chooseMove(V, s, { level: level.id, rng: seededRng(5) })
				expect(isLegal(V, s, code), level.id + ': ' + code).toBe(true)
				expect(elapsed()).toBeLessThan(level.timeMs * 2 + 1000)
			}
		}
	}, 30000)
})
