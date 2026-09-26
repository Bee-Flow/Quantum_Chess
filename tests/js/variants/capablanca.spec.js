/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Capablanca chess: the 10 × 8 board and its setup, the archbishop and the chancellor, castling three squares to the
 * i or c file, pawns and promotion, the win and draw rules, the quantum cases and the computer player. The cases
 * T1-T9 and Q1-Q12b are those of handoff/research/capablanca.md, section 7.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import V, { BACK, BISHOP_PAIR, evaluate, PROMOTE_TO, VALUES } from '../../../src/variants/capablanca.js'
import { chooseMove, LEVELS } from '../../../src/variants/core/ai.js'
import { castlingRights } from '../../../src/variants/core/orthodox.js'
import {
	applyMove,
	budget,
	budgetInfo,
	legalMoves,
	newGame,
	outcomes,
	pieceLocations,
	royalDanger,
	splitsFrom,
	squareView,
	T,
} from '../../../src/variants/core/quantum.js'
import { applyClassical, attacks, generate, royalSquares, worldFrom } from '../../../src/variants/core/world.js'
import { play, stateOf, stopwatch, workClock } from './helpers.js'

const FILES = 'abcdefghij'
const WHITE_WINS = { winner: 0, reason: 'king' }
const BLACK_TRAPPED = { winner: 0, reason: 'cannotEscape' }

/**
 * The square index of a square name.
 *
 * @param {string} name square name
 * @return {number}
 */
function sq(name) {
	return V.topology.byName(name)
}

/**
 * Give a world the castling rights of its king and rooks (and no en passant square).
 *
 * @param {object} b world
 */
function withRights(b) {
	b.x = { ep: -1, epVictim: -1, castle: castlingRights(V, b) }
}

/**
 * A state from explicit worlds with the castling rights of each world.
 *
 * @param {Array<[Record<string, string>, number]>} worlds placements with relative weights
 * @param {number} [turn] side to move
 * @return {object}
 */
function castleState(worlds, turn = 0) {
	return stateOf(V, worlds, turn, withRights)
}

/**
 * The codes of every legal move (splits included on request).
 *
 * @param {object} s state
 * @param {object} [opts] options of `legalMoves`
 * @return {string[]}
 */
function codes(s, opts) {
	return legalMoves(V, s, opts).map((m) => m.code)
}

/**
 * The sorted codes of the ordinary legal moves from a square.
 *
 * @param {object} s state
 * @param {string} from square name
 * @return {string[]}
 */
function movesFrom(s, from) {
	return legalMoves(V, s)
		.filter((m) => m.type === 'move' && m.from === sq(from))
		.map((m) => m.code)
		.sort()
}

/**
 * The castling codes that are legal.
 *
 * @param {object} s state
 * @return {string[]}
 */
function castles(s) {
	return codes(s).filter((c) => c.startsWith('O-'))
}

/**
 * The outcomes of a move in the notation of the spec: `key p`, with ` R` for a rolled outcome, joined by ` | `
 * (notes of a settling roll in brackets); null when the move is illegal.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {string|null}
 */
function odds(s, code) {
	const list = outcomes(V, s, code)
	return list
		? list.map((o) => o.key + (o.notes.length ? '[' + o.notes.join(';') + ']' : '') + ' ' + o.p
			+ (o.rolled ? ' R' : '')).join(' | ')
		: null
}

/**
 * The pieces of a world, White upper case and Black lower case, sorted: `Ka1 Ra1 kf8`.
 *
 * @param {object} b world
 * @return {string}
 */
function pieces(b) {
	const out = []
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sq[id] >= 0) {
			out.push((b.sd[id] === 0 ? b.ty[id].toUpperCase() : b.ty[id]) + V.topology.names[b.sq[id]])
		}
	}
	return out.sort().join(' ')
}

/**
 * A placement from ranks written from file a to j: White upper case, Black lower case, `.` an empty square.
 *
 * @param {Record<number, string>} rows the ranks that hold pieces, by rank number
 * @return {Record<string, string>}
 */
function fromRanks(rows) {
	const out = {}
	for (const [rank, row] of Object.entries(rows)) {
		for (let f = 0; f < row.length; f++) {
			if (row[f] !== '.') {
				out[FILES[f] + rank] = (row[f] === row[f].toUpperCase() ? '0:' : '1:') + row[f].toLowerCase()
			}
		}
	}
	return out
}

/**
 * The castling flags of a world.
 *
 * @param {object} b world
 * @return {string}
 */
function rights(b) {
	return (b.x.castle ?? []).map((c) => c.flag).join('')
}

/**
 * The worlds of a state as sorted lines `p pieces castle=flags`, with ` ep=square` when set.
 *
 * @param {object} s state
 * @return {string[]}
 */
function show(s) {
	return s.worlds
		.map(({ b, w }) => (w / T).toFixed(4) + ' ' + pieces(b) + ' castle=' + rights(b)
			+ (b.x.ep >= 0 ? ' ep=' + V.topology.names[b.x.ep] : ''))
		.sort()
}

/**
 * Where the piece on a square (in the first world that has one there) may be, as `square p` strings.
 *
 * @param {object} s state
 * @param {string} name square name
 * @return {string[]}
 */
function where(s, name) {
	const id = s.worlds.find(({ b }) => b.board[sq(name)] >= 0).b.board[sq(name)]
	return pieceLocations(s, id).map((l) => (l.sq >= 0 ? V.topology.names[l.sq] : 'off') + ' ' + l.p)
}

/**
 * The classically legal moves of a world, as FIDE and Fairy-Stockfish define them (the quantum game has no such
 * filter): the own king is not left attacked, and a castling king neither starts on, crosses nor lands on an
 * attacked square. Returns `[move, world after it]` pairs.
 *
 * @param {object} w world
 * @param {number} side side to move
 * @return {Array<[object, object]>}
 */
function classicalLegal(w, side) {
	const out = []
	for (const m of generate(V, w, side).values()) {
		if (m.kind === 'castle') {
			const [kf, r] = V.topology.coords[m.from]
			const tf = V.topology.coords[m.extra.kingTo][0]
			let attacked = false
			for (let f = Math.min(kf, tf); f <= Math.max(kf, tf) && !attacked; f++) {
				attacked = attacks(V, w, 1 - side, V.topology.at([f, r]))
			}
			if (attacked) {
				continue
			}
		}
		const n = applyClassical(V, w, m)
		const k = royalSquares(V, n, side)
		if (k.length && !attacks(V, n, 1 - side, k[0])) {
			out.push([m, n])
		}
	}
	return out
}

/**
 * Classical perft: the number of move sequences of a given length.
 *
 * @param {object} w world
 * @param {number} side side to move
 * @param {number} depth plies
 * @return {number}
 */
function perft(w, side, depth) {
	const list = classicalLegal(w, side)
	if (depth === 1) {
		return list.length
	}
	return list.reduce((a, [, n]) => a + perft(n, 1 - side, depth - 1), 0)
}

describe('Capablanca chess: board and setup', () => {
	it('declares a 10 x 8 board variant with eight piece types (T1)', () => {
		expect(V.id).toBe('capablanca')
		expect(V.category).toBe('boards')
		expect(V.topology.size).toBe(80)
		expect(['a1', 'j1', 'a2', 'f1', 'a8', 'j8'].map(sq)).toEqual([0, 9, 10, 5, 70, 79])
		expect(['a1', 'j1', 'f1', 'f8', 'd1', 'g1'].map((n) => V.topology.cells[sq(n)].shade))
			.toEqual(['dark', 'light', 'light', 'dark', 'light', 'dark'])
		expect(V.topology.layout.width).toBe(10)
		expect(V.topology.layout.height).toBe(8)
		expect(V.topology.layout.labels.map((l) => l.text).join('')).toBe('abcdefghij12345678')
		expect(Object.keys(V.types).sort()).toEqual(['a', 'b', 'c', 'k', 'n', 'p', 'q', 'r'])
		const names = Object.fromEntries(Object.entries(V.types).map(([id, type]) => [id, type.name()]))
		expect(names).toEqual({
			k: 'King',
			q: 'Queen',
			r: 'Rook',
			b: 'Bishop',
			n: 'Knight',
			p: 'Pawn',
			a: 'Archbishop',
			c: 'Chancellor',
		})
		for (const id of ['k', 'q', 'r', 'b', 'n', 'p']) {
			expect(V.types[id].glyph).toEqual({ sprite: id })
		}
		// the compound pieces are drawn as the two pieces they combine
		expect(V.types.a.glyph).toEqual({ sprites: ['b', 'n'] })
		expect(V.types.c.glyph).toEqual({ sprites: ['r', 'n'] })
		for (const [id, value] of Object.entries(VALUES)) {
			expect(V.types[id].value, id).toBe(value)
		}
		expect(VALUES).toEqual({ k: 400, q: 950, c: 900, a: 875, r: 500, b: 350, n: 300, p: 100 })
		expect([...V.royalTypes]).toEqual(['k'])
		expect([...V.solidTypes].sort()).toEqual(['k', 'p'])
		const splittable = Object.keys(V.types).filter((id) => V.types[id].splittable)
		expect(splittable.sort()).toEqual(['a', 'b', 'c', 'n', 'q', 'r'])
		expect(V.types.p.promote.to).toEqual(PROMOTE_TO)
		expect(V.sides.map((s) => s.color)).toEqual(['white', 'black'])
		expect([V.maxPly, V.quietPlies]).toEqual([600, 100])
		expect(V.rules().length).toBeGreaterThanOrEqual(3)
		expect(V.rules().length).toBeLessThanOrEqual(8)
		for (const text of V.rules()) {
			expect(typeof text === 'string' && text.length > 20).toBe(true)
		}
	})

	it('puts every piece on its start square and gives both sides both castling rights (T1)', () => {
		const s = newGame(V, {})
		expect(BACK).toBe('rnabqkbcnr')
		for (let f = 0; f < 10; f++) {
			const file = FILES[f]
			const expected = {
				[file + '1']: [BACK[f], 0],
				[file + '2']: ['p', 0],
				[file + '7']: ['p', 1],
				[file + '8']: [BACK[f], 1],
			}
			for (const [name, [type, side]] of Object.entries(expected)) {
				expect(squareView(s, sq(name)), name).toEqual([expect.objectContaining({ type, side, p: 1 })])
			}
			for (let r = 3; r <= 6; r++) {
				expect(squareView(s, sq(file + r)), file + r).toEqual([])
			}
		}
		const b = s.worlds[0].b
		expect(pieces(b)).toBe('Ac1 Bd1 Bg1 Ch1 Kf1 Nb1 Ni1 Pa2 Pb2 Pc2 Pd2 Pe2 Pf2 Pg2 Ph2 Pi2 Pj2 Qe1 Ra1 Rj1 '
			+ 'ac8 bd8 bg8 ch8 kf8 nb8 ni8 pa7 pb7 pc7 pd7 pe7 pf7 pg7 ph7 pi7 pj7 qe8 ra8 rj8')
		const names = V.topology.names
		expect(b.x.castle.map((c) => c.flag + ': ' + names[c.king] + '>' + names[c.kingTo] + ', '
			+ names[c.rook] + '>' + names[c.rookTo]))
			.toEqual(['K: f1>i1, j1>h1', 'Q: f1>c1, a1>d1', 'k: f8>i8, j8>h8', 'q: f8>c8, a8>d8'])
		expect([b.x.ep, b.x.epVictim]).toEqual([-1, -1])
		expect([s.turn, s.result, s.worlds.length]).toEqual([0, null, 1])
	})

	it('has 28 first moves and 4 first splits, and leaves only the i-pawns unprotected (T1)', () => {
		const s = newGame(V, {})
		const all = codes(s)
		expect(all).toHaveLength(28)
		expect(all.filter((c) => /^[a-j]2-/.test(c))).toHaveLength(20)
		expect(all.filter((c) => !/^[a-j]2-/.test(c)).sort())
			.toEqual(['b1-a3', 'b1-c3', 'c1-b3', 'c1-d3', 'h1-g3', 'h1-i3', 'i1-h3', 'i1-j3'])
		expect(codes(s, { splits: true }).filter((c) => c.includes('|')).sort())
			.toEqual(['b1-a3|c3', 'c1-b3|d3', 'h1-g3|i3', 'i1-h3|j3'])
		const b = s.worlds[0].b
		const bare = (side, rank) => [...FILES].map((f) => f + rank).filter((n) => !attacks(V, b, side, sq(n)))
		expect([bare(0, 2), bare(1, 7)]).toEqual([['i2'], ['i7']])
	})
})

describe('Capablanca chess: the pieces', () => {
	const kings = { a1: '0:k', j8: '1:k' }

	it('moves the archbishop as a bishop or a knight and the chancellor as a rook or a knight (T2)', () => {
		const from = (type) => movesFrom(stateOf(V, [[{ ...kings, e4: '0:' + type }, 1]]), 'e4')
		expect(from('a').map((c) => c.slice(3)).join(' '))
			.toBe('a8 b1 b7 c2 c3 c5 c6 d2 d3 d5 d6 f2 f3 f5 f6 g2 g3 g5 g6 h1 h7 i8')
		expect(from('c').map((c) => c.slice(3)).join(' '))
			.toBe('a4 b4 c3 c4 c5 d2 d4 d6 e1 e2 e3 e5 e6 e7 e8 f2 f4 f6 g3 g4 g5 h4 i4 j4')
		expect(from('q')).toHaveLength(30)
		// boxed in by its own pawns, the chancellor still jumps, and a jump onto an enemy captures
		const boxed = stateOf(V, [[{ ...kings, e4: '0:c', d4: '0:p', f4: '0:p', e5: '0:p', e3: '0:p', f6: '1:n' }, 1]])
		expect(movesFrom(boxed, 'e4')).toEqual(['e4-c3', 'e4-c5', 'e4-d2', 'e4-d6', 'e4-f2', 'e4-f6', 'e4-g3', 'e4-g5'])
		expect(generate(V, boxed.worlds[0].b, 0).get('e4-f6').capture).toBe(boxed.worlds[0].b.board[sq('f6')])
		// the same for the archbishop, whose diagonals are closed by pawns
		const closed = stateOf(V, [[{ ...kings, e4: '0:a', d3: '0:p', f3: '0:p', d5: '1:p', f5: '1:p' }, 1]])
		expect(movesFrom(closed, 'e4').map((c) => c.slice(3)).join(' '))
			.toBe('c3 c5 d2 d5 d6 f2 f5 f6 g3 g5')
	})

	it('moves the orthodox pieces as in chess on the wider board', () => {
		const count = (placement, from) => movesFrom(stateOf(V, [[{ ...kings, ...placement }, 1]]), from).length
		expect(count({ e4: '0:r' }, 'e4')).toBe(16)
		expect(count({ e4: '0:b' }, 'e4')).toBe(14)
		expect(count({ e4: '0:n' }, 'e4')).toBe(8)
		expect(count({ j5: '0:n' }, 'j5')).toBe(4)
		expect(count({ e4: '0:k' }, 'e4')).toBe(8)
		// a queen in the corner: 8 squares and the king along rank 8, 6 down the file, 7 on the long diagonal
		expect(count({ a8: '0:q' }, 'a8')).toBe(22)
		expect(count({}, 'a1')).toBe(3)
		expect(count({ e2: '0:p' }, 'e2')).toBe(2)
		expect(count({ e3: '0:p' }, 'e3')).toBe(1)
		expect(count({ e3: '0:p', e4: '1:n', d4: '1:b', f4: '1:c' }, 'e3')).toBe(2)
		// a rook on the a-file crosses the whole 10-file rank
		expect(movesFrom(stateOf(V, [[{ ...kings, a4: '0:r' }, 1]]), 'a4')).toContain('a4-j4')
		// Black's pawns move down the board
		expect(movesFrom(stateOf(V, [[{ ...kings, e7: '1:p' }, 1]], 1), 'e7')).toEqual(['e7-e5', 'e7-e6'])
	})

	it('matches Fairy-Stockfish\'s perft of the start position with the classical check rule added (T9)', () => {
		const w = V.setup({})
		expect([1, 2, 3].map((d) => perft(w, 0, d))).toEqual([28, 784, 25228])
	})
})

describe('Capablanca chess: castling', () => {
	const home = { a1: '0:r', f1: '0:k', j1: '0:r', f8: '1:k' }

	it('castles three squares towards either rook, for both sides (T3)', () => {
		const s = castleState([[home, 1]])
		expect(legalMoves(V, s).filter((m) => m.kind === 'castle').map((m) => m.code + ' ' + V.topology.names[m.to]))
			.toEqual(['O-O i1', 'O-O-O c1'])
		expect(odds(s, 'O-O')).toBe('move 1')
		expect(show(play(V, s, 'O-O'))).toEqual(['1.0000 Ki1 Ra1 Rh1 kf8 castle='])
		expect(show(play(V, s, 'O-O-O'))).toEqual(['1.0000 Kc1 Rd1 Rj1 kf8 castle='])
		// the move list and the last-move marks show the king's squares
		const rec = play(V, s, 'O-O').history.at(-1)
		expect([rec.code, ...rec.from, ...rec.to].map((v) => (typeof v === 'number' ? V.topology.names[v] : v)))
			.toEqual(['O-O', 'f1', 'i1'])
		const black = castleState([[{ f1: '0:k', a8: '1:r', f8: '1:k', j8: '1:r' }, 1]], 1)
		expect(show(play(V, black, 'O-O'))).toEqual(['1.0000 Kf1 ki8 ra8 rh8 castle='])
		expect(show(play(V, black, 'O-O-O'))).toEqual(['1.0000 Kf1 kc8 rd8 rj8 castle='])
	})

	it('needs every square between king and rook empty, but has no check condition (T4)', () => {
		const castlesWith = (extra) => castles(castleState([[{ ...home, ...extra }, 1]]))
		expect(castlesWith({ b1: '0:n' })).toEqual(['O-O'])
		expect(castlesWith({ c1: '0:a' })).toEqual(['O-O'])
		expect(castlesWith({ e1: '0:q' })).toEqual(['O-O'])
		expect(castlesWith({ g1: '0:b' })).toEqual(['O-O-O'])
		expect(castlesWith({ h1: '0:c' })).toEqual(['O-O-O'])
		// an enemy piece blocks too: castling never captures
		expect(castlesWith({ i1: '1:n' })).toEqual(['O-O-O'])
		// castling out of, through and into attack is allowed (FIDE and Fairy-Stockfish would forbid both)
		const attacked = { a1: '0:r', f1: '0:k', j1: '0:r', j8: '1:k', g8: '1:r', e8: '1:r' }
		const s = castleState([[attacked, 1]])
		expect(castles(s)).toEqual(['O-O', 'O-O-O'])
		expect(classicalLegal(s.worlds[0].b, 0).filter(([m]) => m.kind === 'castle')).toEqual([])
		// out of attack (the queen on f8) and into it (the rooks on i8 and c8)
		const checked = { ...home, f8: '1:q', j8: '1:k', i8: '1:r', c8: '1:r' }
		expect(castles(castleState([[checked, 1]]))).toEqual(['O-O', 'O-O-O'])
	})

	it('loses a right for good when the king or that rook moves or the rook is captured (T5)', () => {
		let s = newGame(V, {})
		for (const code of ['j2-j4', 'j7-j5', 'j1-j3', 'a7-a6', 'j3-j1', 'a6-a5']) {
			s = play(V, s, code)
		}
		expect(rights(s.worlds[0].b)).toBe('Qkq')
		for (const code of ['e2-e3', 'e7-e6', 'f1-e2']) {
			s = play(V, s, code)
		}
		expect(rights(s.worlds[0].b)).toBe('kq')
		const c = castleState([[{ ...home, j8: '1:r' }, 1]], 1)
		expect(odds(c, 'j8-j1')).toBe('capture 1')
		expect(show(play(V, c, 'j8-j1'))).toEqual(['1.0000 Kf1 Ra1 kf8 rj1 castle=Q'])
	})

	it('allows exactly Fairy-Stockfish\'s 55 moves in its castling test position (T8)', () => {
		let s = newGame(V, {})
		for (const code of ['b2-b4', 'f7-f5', 'c2-c3', 'g8-d5', 'a2-a4', 'h8-g6', 'f2-f3', 'i8-h6', 'h2-h3']) {
			s = play(V, s, code)
		}
		const fsf = 'f5f4 a7a6 b7b6 c7c6 d7d6 e7e6 i7i6 j7j6 a7a5 b7b5 c7c5 e7e5 i7i5 j7j5 b8a6 b8c6 h6g4 h6i4 h6j5 '
			+ 'h6f7 h6g8 h6i8 d5a2 d5b3 d5f3 d5c4 d5e4 d5c6 d5e6 d5f7 d5g8 j8g8 j8h8 j8i8 e8f7 c8b6 c8d6 g6g2 g6g3 '
			+ 'g6f4 g6g4 g6h4 g6e5 g6g5 g6i5 g6a6 g6b6 g6c6 g6d6 g6e6 g6f6 g6h8 f8f7 f8g8 f8i8'
		const uci = codes(s).map((c) => (c === 'O-O' ? 'f8i8' : c === 'O-O-O' ? 'f8c8' : c.replace('-', '')))
		expect(uci.sort()).toEqual(fsf.split(' ').sort())
		expect(castles(s)).toEqual(['O-O'])
		const b = play(V, s, 'O-O').worlds[0].b
		expect([b.ty[b.board[sq('i8')]], b.ty[b.board[sq('h8')]], b.board[sq('f8')], b.board[sq('j8')]])
			.toEqual(['k', 'r', -1, -1])
	})
})

describe('Capablanca chess: pawns', () => {
	it('promotes to a queen, chancellor, archbishop, rook, bishop or knight, and never stays a pawn (T6)', () => {
		const s = stateOf(V, [[{ e7: '0:p', a1: '0:k', j8: '1:k', d8: '1:n' }, 1]])
		expect(codes(s).filter((c) => c.startsWith('e7-'))).toEqual([
			'e7-e8=q',
			'e7-e8=c',
			'e7-e8=a',
			'e7-e8=r',
			'e7-e8=b',
			'e7-e8=n',
			'e7-d8=q',
			'e7-d8=c',
			'e7-d8=a',
			'e7-d8=r',
			'e7-d8=b',
			'e7-d8=n',
		])
		const w = play(V, s, 'e7-e8=c').worlds[0].b
		expect(w.ty[w.board[sq('e8')]]).toBe('c')
		const next = [...generate(V, w, 0).keys()].filter((k) => k.startsWith('e8-'))
		expect(next).toHaveLength(17)
		expect(next).toEqual(expect.arrayContaining(['e8-f6', 'e8-d8', 'e8-j8', 'e8-e1']))
		const black = stateOf(V, [[{ c2: '1:p', a1: '0:k', j8: '1:k' }, 1]], 1)
		expect(codes(black).filter((c) => c.startsWith('c2-')))
			.toEqual(['c2-c1=q', 'c2-c1=c', 'c2-c1=a', 'c2-c1=r', 'c2-c1=b', 'c2-c1=n'])
	})

	it('double-steps only from the start rank and takes en passant on the j-file on the next ply only (T7)', () => {
		let s = stateOf(V, [[{ j2: '0:p', i4: '1:p', a1: '0:k', a8: '1:k' }, 1]])
		expect(movesFrom(s, 'j2')).toEqual(['j2-j3', 'j2-j4'])
		s = play(V, s, 'j2-j4')
		expect(V.topology.names[s.worlds[0].b.x.ep]).toBe('j3')
		expect(movesFrom(s, 'i4')).toEqual(['i4-i3', 'i4-j3'])
		expect(odds(s, 'i4-j3')).toBe('capture 1')
		expect(show(play(V, s, 'i4-j3'))).toEqual(['1.0000 Ka1 ka8 pj3 castle='])
		// one ply later the right is gone
		const later = play(V, play(V, s, 'a8-b8'), 'a1-b1')
		expect(movesFrom(later, 'i4')).toEqual(['i4-i3'])
		expect(movesFrom(stateOf(V, [[{ c3: '0:p', a1: '0:k', a8: '1:k' }, 1]]), 'c3')).toEqual(['c3-c4'])
	})
})

describe('Capablanca chess: winning and drawing', () => {
	it('wins by capturing the king, also with a chancellor sliding along the whole rank', () => {
		const s = stateOf(V, [[{ a1: '0:k', a4: '0:c', j4: '1:k', h8: '1:q' }, 1]])
		expect(odds(s, 'a4-j4')).toBe('capture 1')
		const won = play(V, s, 'a4-j4')
		expect(won.result).toEqual(WHITE_WINS)
		expect(legalMoves(V, won)).toEqual([])
		// an archbishop's knight jump takes the king over a wall of pieces
		const jump = stateOf(V, [[{ j1: '0:k', d5: '0:a', e7: '1:k', d6: '1:p', e6: '1:p', d7: '1:p' }, 1]])
		expect(play(V, jump, 'd5-e7').result).toEqual(WHITE_WINS)
	})

	it('draws after 100 plies without a capture or pawn move, and at the move limit', () => {
		const quiet = { ...stateOf(V, [[{ a1: '0:k', e4: '0:n', j8: '1:k', f2: '1:p' }, 1]]), quiet: 99 }
		expect(play(V, quiet, 'e4-f6').result).toEqual({ winner: null, reason: 'quiet' })
		expect(play(V, quiet, 'e4-f2').result).toBeNull()
		const black = { ...quiet, turn: 1 }
		expect(play(V, black, 'f2-f1=c').result).toBeNull()
		expect(play(V, black, 'f2-f1=c').quiet).toBe(0)
		const long = { ...stateOf(V, [[{ a1: '0:k', e4: '0:n', j8: '1:k' }, 1]]), ply: 599 }
		expect(play(V, long, 'e4-f6').result).toEqual({ winner: null, reason: 'moveLimit' })
	})

	it('wins when the enemy king cannot escape, as a chancellor or archbishop can force (LEAD-DECISIONS L1)', () => {
		expect([V.escapeRule, V.bareKingsDraw, V.drawsWait, V.specialMoves]).toEqual([true, true, true, true])
		// the card leaves the win rules to the shared card and must not deny the escape rule
		expect(V.rules().join(' ')).not.toMatch(/checkmate|only by capturing|capture the king to win/i)
		// king and chancellor against a lone king: i8 and i7 are next to the king on h7, j8 and j7 are on the j-file
		const lone = stateOf(V, [[{ h7: '0:k', a1: '0:c', j8: '1:k' }, 1]])
		expect(play(V, lone, 'a1-j1').result).toEqual(BLACK_TRAPPED)
		expect(play(V, lone, 'a1-i1').result).toBeNull()
		// a chancellor only half on j1 makes j7 a gamble, not a loss
		const ghost = play(V, lone, 'a1-a3|j1')
		expect([ghost.result, royalDanger(V, ghost, 1)]).toEqual([null, 0.5])
		// an archbishop's jump can be neither blocked nor taken here, and every square next to Black's king is full
		const armies = fromRanks({
			8: 'rnabqkb.nr',
			7: 'pppppnp.pp',
			5: '.c..A.....',
			2: 'PPPPPPPPPP',
			1: 'RN.BQKBCNR',
		})
		expect(play(V, stateOf(V, [[armies, 1]]), 'e5-g6').result).toEqual(BLACK_TRAPPED)
		// with a pawn on f7 instead of the knight, f7xg6 escapes
		expect(play(V, stateOf(V, [[{ ...armies, f7: '1:p' }, 1]]), 'e5-g6').result).toBeNull()
	})

	it('counts castling three squares as an escape', () => {
		// the knight on e3 attacks the king on f1, the bishop on i3 covers g1, and e1, e2, f2 and g2 are full
		const pos = fromRanks({ 8: 'k.........', 5: '...n......', 3: '........b.', 2: '....PNP...', 1: '....QK...R' })
		const s = play(V, castleState([[pos, 1]], 1), 'd5-e3')
		expect([s.result, royalDanger(V, s, 0), castles(s)]).toEqual([null, 1, ['O-O']])
		expect(royalDanger(V, play(V, s, 'O-O'), 0)).toBe(0)
		// without the castling right the same move wins for Black
		expect(play(V, stateOf(V, [[pos, 1]], 1), 'd5-e3').result).toEqual({ winner: 1, reason: 'cannotEscape' })
	})

	it('draws with bare kings, but the generic draws wait while a king can be taken for certain', () => {
		const lone = stateOf(V, [[{ e4: '0:k', e5: '1:a', h8: '1:k' }, 1]])
		expect(play(V, lone, 'e4-e5').result).toEqual({ winner: null, reason: 'bareKings' })
		// the king takes the last piece next to the enemy king: no draw, Black takes it
		const near = play(V, stateOf(V, [[{ e4: '0:k', e5: '1:a', e6: '1:k' }, 1]]), 'e4-e5')
		expect([near.result, royalDanger(V, near, 0)]).toEqual([null, 1])
		expect(play(V, near, 'e6-e5').result).toEqual({ winner: 1, reason: 'king' })
		// the 100th quiet ply opens rank 1 for the chancellor on j1: the 50-move draw waits
		const quiet = { ...stateOf(V, [[{ a1: '0:k', b1: '0:n', j1: '1:c', j8: '1:k' }, 1]]), quiet: 99 }
		const open = play(V, quiet, 'b1-c3')
		expect([open.result, open.quiet]).toEqual([null, 100])
		expect(play(V, open, 'j1-a1').result).toEqual({ winner: 1, reason: 'king' })
	})
})

describe('Capablanca chess: quantum positions', () => {
	const home = { a1: '0:r', f1: '0:k', j1: '0:r', f8: '1:k' }

	it('blocks castling behind a possible ghost on the path, and castles for certain on the free side (Q1)', () => {
		const s = castleState([[{ ...home, h1: '0:c' }, 1], [{ ...home, h3: '0:c' }, 1]])
		expect(castles(s)).toEqual(['O-O-O'])
		expect(odds(s, 'O-O')).toBeNull()
		expect(odds(s, 'O-O-O')).toBe('move 1')
		expect(show(play(V, s, 'O-O-O')))
			.toEqual(['0.5000 Ch1 Kc1 Rd1 Rj1 kf8 castle=', '0.5000 Ch3 Kc1 Rd1 Rj1 kf8 castle='])
	})

	it('loses the right everywhere after a rook slide that only partly happened (pass = link, Q2)', () => {
		let s = castleState([[{ ...home, j4: '1:n' }, 1], [{ ...home, a6: '1:n' }, 1]])
		expect(odds(s, 'j1-j6')).toBe('move 1')
		s = play(V, s, 'j1-j6')
		expect(show(s)).toEqual(['0.5000 Kf1 Ra1 Rj1 kf8 nj4 castle=Q', '0.5000 Kf1 Ra1 Rj6 kf8 na6 castle=Q'])
		expect(budget(s, 0)).toBe(2)
		s = play(V, s, 'f8-e8')
		expect(castles(s)).toEqual(['O-O-O'])
		expect(odds(s, '?j1')).toBe('j1 0.5 R | j6 0.5 R')
		s = play(V, s, '?j1', 0)
		expect(show(s)).toEqual(['1.0000 Kf1 Ra1 Rj1 ke8 nj4 castle=Q'])
		expect(castles({ ...s, turn: 0 })).toEqual(['O-O-O'])
	})

	it('makes a jump certain, links a blocked slide and rolls a landing on a ghost (Q3, Q3b)', () => {
		const s = stateOf(V, [
			[{ e4: '0:c', a1: '0:k', j8: '1:k', e5: '1:n' }, 1],
			[{ e4: '0:c', a1: '0:k', j8: '1:k', g5: '1:n' }, 1],
		])
		expect(odds(s, 'e4-f6')).toBe('move 1')
		expect(show(play(V, s, 'e4-f6'))).toEqual(['0.5000 Cf6 Ka1 kj8 ne5 castle=', '0.5000 Cf6 Ka1 kj8 ng5 castle='])
		expect(odds(s, 'e4-e7')).toBe('move 1')
		expect(show(play(V, s, 'e4-e7'))).toEqual(['0.5000 Ce4 Ka1 kj8 ne5 castle=', '0.5000 Ce7 Ka1 kj8 ng5 castle='])
		expect(odds(s, 'e4-e5')).toBe('move 0.5 R | capture 0.5 R')
		expect(show(play(V, s, 'e4-e5', 0))).toEqual(['1.0000 Ce5 Ka1 kj8 ng5 castle='])
		expect(show(play(V, s, 'e4-e5', 1))).toEqual(['1.0000 Ce5 Ka1 kj8 castle='])
		// a jump onto the piece's own other part joins it without a roll
		const own = stateOf(V, [[{ e4: '0:c', a1: '0:k', j8: '1:k' }, 1], [{ f6: '0:c', a1: '0:k', j8: '1:k' }, 1]])
		expect(odds(own, 'e4-f6')).toBe('move 1')
		expect(show(play(V, own, 'e4-f6'))).toEqual(['1.0000 Cf6 Ka1 kj8 castle='])
	})

	it('splits an archbishop into a jump and a slide that a ghost may block (Q4)', () => {
		const s = stateOf(V, [
			[{ c1: '0:a', f1: '0:k', f8: '1:k', e3: '1:n' }, 1],
			[{ c1: '0:a', f1: '0:k', f8: '1:k', h6: '1:n' }, 1],
		])
		expect(odds(s, 'c1-d3|g5')).toBe('split 1')
		const n = play(V, s, 'c1-d3|g5')
		expect(show(n)).toEqual([
			'0.2500 Ac1 Kf1 kf8 ne3 castle=',
			'0.2500 Ad3 Kf1 kf8 ne3 castle=',
			'0.2500 Ad3 Kf1 kf8 nh6 castle=',
			'0.2500 Ag5 Kf1 kf8 nh6 castle=',
		])
		expect(where(n, 'd3')).toEqual(['c1 0.25', 'd3 0.5', 'g5 0.25'])
		expect(budget(n, 0)).toBe(3)
		expect(budgetInfo(V, n, 0)).toEqual({ used: 3, limit: 8, sides: [0] })
	})

	it('rolls a promotion that captures a possible piece, and promotes for certain onto an empty square (Q5)', () => {
		const s = stateOf(V, [
			[{ g7: '0:p', a1: '0:k', a8: '1:k', h8: '1:n' }, 1],
			[{ g7: '0:p', a1: '0:k', a8: '1:k', d5: '1:n' }, 1],
		])
		expect(odds(s, 'g7-h8=c')).toBe('miss 0.5 R | capture 0.5 R')
		expect(show(play(V, s, 'g7-h8=c', 0))).toEqual(['1.0000 Ka1 Pg7 ka8 nd5 castle='])
		expect(show(play(V, s, 'g7-h8=c', 1))).toEqual(['1.0000 Ch8 Ka1 ka8 castle='])
		expect(odds(s, 'g7-g8=a')).toBe('move 1')
		expect(show(play(V, s, 'g7-g8=a')))
			.toEqual(['0.5000 Ag8 Ka1 ka8 nd5 castle=', '0.5000 Ag8 Ka1 ka8 nh8 castle='])
	})

	it('takes the king for certain with a converging jump and clear slide, and rolls if a ghost may block (Q6)', () => {
		const s = stateOf(V, [[{ c6: '0:c', a1: '0:k', e7: '1:k' }, 1], [{ e2: '0:c', a1: '0:k', e7: '1:k' }, 1]])
		expect(codes(s)).toEqual(expect.arrayContaining(['e2|c6-e7', '?e2']))
		expect(royalDanger(V, s, 1)).toBe(1)
		expect(odds(s, 'e2|c6-e7')).toBe('capture 1')
		const won = play(V, s, 'e2|c6-e7')
		expect([show(won), won.result]).toEqual([['1.0000 Ce7 Ka1 castle='], WHITE_WINS])
		const b = stateOf(V, [
			[{ c6: '0:c', a1: '0:k', e7: '1:k', e5: '1:n' }, 1],
			[{ c6: '0:c', a1: '0:k', e7: '1:k', g4: '1:n' }, 1],
			[{ e2: '0:c', a1: '0:k', e7: '1:k', e5: '1:n' }, 1],
			[{ e2: '0:c', a1: '0:k', e7: '1:k', g4: '1:n' }, 1],
		])
		expect(royalDanger(V, b, 1)).toBe(0.75)
		expect(odds(b, 'e2|c6-e7')).toBe('miss 0.25 R | capture 0.75 R')
		expect(show(play(V, b, 'e2|c6-e7', 0))).toEqual(['1.0000 Ce2 Ka1 ke7 ne5 castle='])
		expect(play(V, b, 'e2|c6-e7', 1).result).toEqual(WHITE_WINS)
	})

	it('rolls a jump and a clear slide onto the king when the ghost has a third part (docs, merge rule)', () => {
		// the Q6 merge with a third part of the chancellor on j1: the certain capture needs a piece with no other part
		const c = stateOf(V, [
			[{ c6: '0:c', a1: '0:k', e7: '1:k' }, 1],
			[{ e2: '0:c', a1: '0:k', e7: '1:k' }, 1],
			[{ j1: '0:c', a1: '0:k', e7: '1:k' }, 2],
		])
		expect(royalDanger(V, c, 1)).toBe(0.5)
		expect(odds(c, 'e2|c6-e7')).toBe('miss 0.5 R | capture 0.5 R')
		const missed = play(V, c, 'e2|c6-e7', 0)
		expect([missed.result, show(missed)]).toEqual([null, ['1.0000 Cj1 Ka1 ke7 castle=']])
		expect(play(V, c, 'e2|c6-e7', 1).result).toEqual(WHITE_WINS)
		// the same for an archbishop: the c6-e7 jump and the clear b4-e7 slide
		const a = stateOf(V, [
			[{ c6: '0:a', a1: '0:k', e7: '1:k' }, 1],
			[{ b4: '0:a', a1: '0:k', e7: '1:k' }, 1],
			[{ j1: '0:a', a1: '0:k', e7: '1:k' }, 2],
		])
		expect(odds(a, 'b4|c6-e7')).toBe('miss 0.5 R | capture 0.5 R')
		const whole = stateOf(V, [[{ c6: '0:a', a1: '0:k', e7: '1:k' }, 1], [{ b4: '0:a', a1: '0:k', e7: '1:k' }, 1]])
		expect(odds(whole, 'b4|c6-e7')).toBe('capture 1')
	})

	it('ends the game on a roll when one part of an archbishop jumps onto the king (Q7)', () => {
		const s = stateOf(V, [[{ d5: '0:a', j1: '0:k', e7: '1:k' }, 1], [{ b1: '0:a', j1: '0:k', e7: '1:k' }, 1]])
		expect(royalDanger(V, s, 1)).toBe(0.5)
		expect(odds(s, 'd5-e7')).toBe('miss 0.5 R | capture 0.5 R')
		expect(play(V, s, 'd5-e7', 1).result).toEqual(WHITE_WINS)
		const missed = play(V, s, 'd5-e7', 0)
		expect([missed.result, show(missed)]).toEqual([null, ['1.0000 Ab1 Kj1 ke7 castle=']])
	})

	it('rolls a double step past a ghost; en passant follows for certain on the next ply only (Q8, Q10)', () => {
		const s = stateOf(V, [
			[{ e2: '0:p', a1: '0:k', a8: '1:k', d4: '1:p', e3: '1:n' }, 1],
			[{ e2: '0:p', a1: '0:k', a8: '1:k', d4: '1:p', c6: '1:n' }, 1],
		])
		expect(odds(s, 'e2-e4')).toBe('miss 0.5 R | move 0.5 R')
		const missed = play(V, s, 'e2-e4', 0)
		expect([show(missed), missed.quiet]).toEqual([['1.0000 Ka1 Pe2 ka8 ne3 pd4 castle='], 1])
		const moved = play(V, s, 'e2-e4', 1)
		expect([show(moved), moved.quiet]).toEqual([['1.0000 Ka1 Pe4 ka8 nc6 pd4 castle= ep=e3'], 0])
		expect(odds(moved, 'd4-e3')).toBe('capture 1')
		expect(show(play(V, moved, 'd4-e3'))).toEqual(['1.0000 Ka1 ka8 nc6 pe3 castle='])
		// Q10: two Measure turns in between end the right in every world
		const base = { e2: '0:p', a1: '0:k', a8: '1:k', d4: '1:p' }
		let q = stateOf(V, [
			[{ ...base, h6: '1:n', b3: '0:n' }, 1],
			[{ ...base, g4: '1:n', b3: '0:n' }, 1],
			[{ ...base, h6: '1:n', h3: '0:n' }, 1],
			[{ ...base, g4: '1:n', h3: '0:n' }, 1],
		])
		expect(odds(q, 'e2-e4')).toBe('move 1')
		q = play(V, q, 'e2-e4')
		expect(q.worlds.every(({ b }) => b.x.ep === sq('e3'))).toBe(true)
		expect(odds(q, 'd4-e3')).toBe('capture 1')
		expect(odds(q, '?g4')).toBe('g4 0.5 R | h6 0.5 R')
		q = play(V, q, '?g4', 0)
		expect(q.worlds.map(({ b }) => b.x.ep)).toEqual([-1, -1])
		q = play(V, q, '?b3', 0)
		expect(show(q)).toEqual(['1.0000 Ka1 Nb3 Pe4 ka8 ng4 pd4 castle='])
		expect(odds(q, 'd4-e3')).toBeNull()
	})

	it('castles for certain once a split takes the chancellor off the path, not while on it (Q9, Q12)', () => {
		let s = castleState([[{ ...home, h1: '0:c' }, 1]])
		expect(castles(s)).toEqual(['O-O-O'])
		const off = play(V, play(V, s, 'h1-g3|i3'), 'f8-e8')
		expect(show(off)).toEqual(['0.5000 Cg3 Kf1 Ra1 Rj1 ke8 castle=KQ', '0.5000 Ci3 Kf1 Ra1 Rj1 ke8 castle=KQ'])
		expect(odds(off, 'O-O')).toBe('move 1')
		expect(show(play(V, off, 'O-O')))
			.toEqual(['0.5000 Cg3 Ki1 Ra1 Rh1 ke8 castle=', '0.5000 Ci3 Ki1 Ra1 Rh1 ke8 castle='])
		// Q12: a split onto the path keeps the right but blocks castling until the ghost is measured away
		expect(odds(s, 'h1-g1|h3')).toBe('split 1')
		s = play(V, s, 'h1-g1|h3')
		expect(show(s)).toEqual(['0.5000 Cg1 Kf1 Ra1 Rj1 kf8 castle=KQ', '0.5000 Ch3 Kf1 Ra1 Rj1 kf8 castle=KQ'])
		expect(budget(s, 0)).toBe(2)
		s = play(V, s, 'f8-e8')
		expect([castles(s), odds(s, 'O-O'), odds(s, 'O-O-O')]).toEqual([['O-O-O'], null, 'move 1'])
		expect(odds(s, '?g1')).toBe('g1 0.5 R | h3 0.5 R')
		s = play(V, play(V, s, '?g1', 1), 'e8-f8')
		expect(odds(s, 'O-O')).toBe('move 1')
		expect(show(play(V, s, 'O-O'))).toEqual(['1.0000 Ch3 Ki1 Ra1 Rh1 kf8 castle='])
	})

	it('lets an enemy ghost block castling, also on b1 where only the rook passes (Q12b)', () => {
		const i1 = castleState([[{ ...home, i1: '1:n' }, 1], [{ ...home, i3: '1:n' }, 1]])
		expect([castles(i1), odds(i1, 'O-O'), odds(i1, 'O-O-O')]).toEqual([['O-O-O'], null, 'move 1'])
		const b1 = castleState([[{ ...home, b1: '1:n' }, 1], [{ ...home, a3: '1:n' }, 1]])
		expect([castles(b1), odds(b1, 'O-O-O'), odds(b1, 'O-O')]).toEqual([['O-O'], null, 'move 1'])
	})

	it('keeps the rights after a king or rook move that Missed, but not after a partly blocked slide (Q11)', () => {
		const s = castleState([
			[{ ...home, g2: '0:n', h5: '1:n' }, 1],
			[{ ...home, e3: '0:n', j3: '1:n' }, 1],
		])
		expect(odds(s, 'f1-g2')).toBe('miss 0.5 R | move 0.5 R')
		expect(show(play(V, s, 'f1-g2', 0))).toEqual(['1.0000 Kf1 Ng2 Ra1 Rj1 kf8 nh5 castle=KQ'])
		expect(odds(s, 'j1-j5')).toBe('move 1')
		expect(show(play(V, s, 'j1-j5')))
			.toEqual(['0.5000 Kf1 Ne3 Ra1 Rj1 kf8 nj3 castle=Q', '0.5000 Kf1 Ng2 Ra1 Rj5 kf8 nh5 castle=Q'])
		const rook = castleState([[{ ...home, j3: '1:n' }, 1], [{ ...home, j5: '1:n' }, 1]])
		expect(odds(rook, 'j1-j5')).toBe('miss 0.5 R | capture 0.5 R')
		expect(show(play(V, rook, 'j1-j5', 0))).toEqual(['1.0000 Kf1 Ra1 Rj1 kf8 nj3 castle=KQ'])
		expect(show(play(V, rook, 'j1-j5', 1))).toEqual(['1.0000 Kf1 Ra1 Rj5 kf8 castle=Q'])
	})

	it('keeps castling rights and the en passant square identical in every world of random games', () => {
		let castled = 0
		for (const seed of [3, 5, 8]) {
			const rng = seededRng(seed)
			let s = newGame(V, {})
			for (let ply = 0; ply < 80 && !s.result; ply++) {
				let list = codes(s)
				if (ply % 3 === 1) {
					const froms = [...new Set(legalMoves(V, s).filter((m) => m.type === 'move').map((m) => m.from))]
					const f = froms[Math.floor(rng() * froms.length)]
					const splits = splitsFrom(V, s, f).map((m) => m.code)
					list = splits.length ? splits : list
				}
				const special = list.filter((c) => c.startsWith('O-'))
				const code = special.length ? special[0] : list[Math.floor(rng() * list.length)]
				castled += special.length ? 1 : 0
				s = applyMove(V, s, code, rng).state
				const first = s.worlds[0].b.x
				for (const { b } of s.worlds) {
					expect(JSON.stringify(b.x.castle), code).toBe(JSON.stringify(first.castle))
					expect([b.x.ep, b.x.epVictim], code).toEqual([first.ep, first.epVictim])
					for (const c of b.x.castle) {
						expect([b.ty[b.board[c.king]], b.ty[b.board[c.rook]]], code).toEqual(['k', 'r'])
					}
				}
				for (const side of [0, 1]) {
					const { used, limit } = budgetInfo(V, s, side)
					expect(used).toBeLessThanOrEqual(limit)
				}
			}
		}
		expect(castled).toBeGreaterThan(0)
	})
})

describe('Capablanca chess: the computer player', () => {
	it('values the centre, the bishop pair and a sheltered king', () => {
		const start = newGame(V, {}).worlds[0].b
		expect([evaluate(start, 0), evaluate(start, 1)]).toEqual([0, 0])
		const world = (placement) => worldFrom(V, { a1: '0:k', j8: '1:k', ...placement })
		// bishops on both colours against two light-squared bishops on squares just as central
		const pair = world({ d1: '0:b', g1: '0:b' })
		expect(evaluate(pair, 0) - evaluate(world({ d1: '0:b', b3: '0:b' }), 0)).toBe(BISHOP_PAIR)
		expect(evaluate(pair, 1)).toBe(-evaluate(pair, 0))
		expect(evaluate(world({ e4: '0:n' }), 0)).toBe(42)
		expect(evaluate(world({ e4: '0:n' }), 0)).toBeGreaterThan(evaluate(world({ j1: '0:n' }), 0))
		// pawns gain by advancing, centre pawns more than flank pawns
		expect(evaluate(world({ e6: '0:p' }), 0)).toBe(evaluate(world({ e3: '1:p' }), 1))
		expect([evaluate(world({ e4: '0:p' }), 0), evaluate(world({ a4: '0:p' }), 0)]).toEqual([8, 2])
		// a king in the open costs while the enemy has a rook or a stronger piece
		const open = worldFrom(V, { e4: '0:k', j8: '1:k', a8: '1:r' })
		const safe = worldFrom(V, { e1: '0:k', j8: '1:k', a8: '1:r' })
		expect(evaluate(safe, 0) - evaluate(open, 0)).toBe(40)
		expect(V.evaluate).toBe(evaluate)
	})

	it('takes the king when it can, at every level', async () => {
		const s = stateOf(V, [[{ a1: '0:k', a4: '0:c', j4: '1:k', h8: '1:q', b2: '1:p' }, 1]])
		for (const L of LEVELS) {
			const code = await chooseMove(V, s, { level: L.id, rng: seededRng(5), now: workClock() })
			expect(play(V, s, code).result, L.id + ': ' + code).toEqual(WHITE_WINS)
		}
	})

	it('makes a legal move from the start at every level within its time', async () => {
		const s = newGame(V, {})
		for (const L of LEVELS) {
			const elapsed = stopwatch()
			const code = await chooseMove(V, s, { level: L.id, rng: seededRng(11) })
			expect(outcomes(V, s, code), L.id + ': ' + code).not.toBeNull()
			expect(elapsed()).toBeLessThan(L.timeMs + 1500)
		}
	}, 20000)

	it('stays within its time at every level with 64 worlds', async () => {
		// both knights and the archbishop of each side split: 8 arrangements per side, the budget's maximum
		let s = newGame(V, {})
		for (const code of ['b1-a3|c3', 'b8-a6|c6', 'i1-h3|j3', 'i8-h6|j6', 'c1-b3|d3', 'c8-b6|d6']) {
			s = play(V, s, code)
		}
		expect(s.worlds.length).toBe(64)
		for (const L of LEVELS) {
			const elapsed = stopwatch()
			const code = await chooseMove(V, s, { level: L.id, rng: seededRng(3) })
			expect(outcomes(V, s, code), L.id + ': ' + code).not.toBeNull()
			expect(elapsed()).toBeLessThan(L.timeMs + 1500)
		}
	}, 30000)
})
