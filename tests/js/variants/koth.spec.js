/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * King of the Hill: the board, the orthodox pieces, the hill win, the hill-entry rule (a king may not step onto a
 * hill square that is attacked once it stands there) in classical and quantum positions, and the computer player.
 * The cases are numbered K1-K21.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { chooseMove, LEVELS } from '../../../src/variants/core/ai.js'
import { castlingRights } from '../../../src/variants/core/orthodox.js'
import {
	applyOutcome,
	budget,
	legalMoves,
	newGame,
	outcomes,
	pieceLocations,
	squareView,
	T,
} from '../../../src/variants/core/quantum.js'
import V from '../../../src/variants/koth.js'
import { play, stateOf, stopwatch, workClock } from './helpers.js'

const HILL_WIN = { winner: 0, reason: 'hill' }

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
 * The outcomes of a move as `[key, p]` pairs, in the core's order.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {Array<[string, number]>|null}
 */
function odds(s, code) {
	const list = outcomes(V, s, code)
	return list ? list.map((o) => [o.key, o.p]) : null
}

/**
 * Where a piece is, as `[square name, p]` pairs.
 *
 * @param {object} s state
 * @param {number} id piece id
 * @return {Array<[string, number]>}
 */
function where(s, id) {
	return pieceLocations(s, id).map((l) => [l.sq >= 0 ? V.topology.names[l.sq] : 'off', l.p])
}

/**
 * The id of the piece on a square in the first world.
 *
 * @param {object} s state
 * @param {string} name square name
 * @return {number}
 */
function idAt(s, name) {
	return s.worlds[0].b.board[sq(name)]
}

describe('King of the Hill: board and setup', () => {
	it('starts from the orthodox position with every piece on its square (K11)', () => {
		const s = newGame(V)
		const back = 'rnbqkbnr'
		for (let f = 0; f < 8; f++) {
			const file = 'abcdefgh'[f]
			const expected = {
				[file + '1']: [back[f], 0],
				[file + '2']: ['p', 0],
				[file + '7']: ['p', 1],
				[file + '8']: [back[f], 1],
			}
			for (const [name, [type, side]] of Object.entries(expected)) {
				expect(squareView(s, sq(name)), name).toEqual([expect.objectContaining({ type, side, p: 1 })])
			}
			for (let r = 3; r <= 6; r++) {
				expect(squareView(s, sq(file + r)), file + r).toEqual([])
			}
		}
		expect(s.worlds).toHaveLength(1)
		expect(s.worlds[0].b.x.castle.map((c) => c.flag).sort()).toEqual(['K', 'Q', 'k', 'q'])
		expect(s.result).toBeNull()
		expect(s.turn).toBe(0)
		const codes = legalMoves(V, s).map((m) => m.code)
		expect(codes).toHaveLength(20)
		expect(codes.filter((c) => c.startsWith('b1-') || c.startsWith('g1-'))).toHaveLength(4)
	})

	it('shades and outlines the hill and keeps the orthodox declaration (K21)', () => {
		const shadeOf = (name) => V.topology.cells[sq(name)].shade
		expect(['d4', 'e5', 'e4', 'd5', 'c3', 'c4'].map(shadeOf))
			.toEqual(['hilldark', 'hilldark', 'hill', 'hill', 'dark', 'light'])
		const hillCells = V.topology.cells.filter((c) => /^hill/.test(c.shade))
		expect(hillCells).toHaveLength(4)
		// a thin warm border (kind hill) and a legend under the board
		expect(V.topology.layout.outlines).toEqual([
			{ x1: 3, y1: 3, x2: 5, y2: 3, kind: 'hill' },
			{ x1: 5, y1: 3, x2: 5, y2: 5, kind: 'hill' },
			{ x1: 5, y1: 5, x2: 3, y2: 5, kind: 'hill' },
			{ x1: 3, y1: 5, x2: 3, y2: 3, kind: 'hill' },
		])
		expect(V.boardLegend()).toEqual([{ kind: 'hill', text: 'Hill: a king that reaches it wins.' }])
		expect(V.topology.layout.labels).toHaveLength(16)
		expect(V.topology.layout.lines ?? []).toEqual([])
		expect(typeof V.applyMiss).toBe('function')
		expect(typeof V.unifyWorlds).toBe('function')
		expect(V.id).toBe('koth')
		expect(V.category).toBe('rules')
		expect(V.reasonText('hill')).toBe('a king reached the hill')
		expect(V.reasonText('king')).toBeNull()
		expect(V.rules()).toHaveLength(5)
		for (const text of V.rules()) {
			expect(typeof text === 'string' && text.length > 10).toBe(true)
		}
		expect(Object.keys(V.types).sort()).toEqual(['b', 'k', 'n', 'p', 'q', 'r'])
		for (const [id, type] of Object.entries(V.types)) {
			expect(typeof type.name(), id).toBe('string')
			expect(type.glyph.sprite, id).toBe(id)
			expect(type.value, id).toBeGreaterThan(0)
		}
		expect([...V.royalTypes]).toEqual(['k'])
		expect([...V.solidTypes].sort()).toEqual(['k', 'p'])
	})
})

describe('King of the Hill: the pieces move as in chess', () => {
	const kings = { a1: '0:k', a8: '1:k' }

	it('gives every piece type its orthodox move count', () => {
		const count = (placement, from) => movesFrom(stateOf(V, [[{ ...kings, ...placement }, 1]]), from).length
		expect(count({}, 'a1')).toBe(3)
		expect(count({ d1: '0:q' }, 'd1')).toBe(20)
		expect(count({ d2: '0:r' }, 'd2')).toBe(14)
		expect(count({ c1: '0:b' }, 'c1')).toBe(7)
		expect(count({ g1: '0:n' }, 'g1')).toBe(3)
		expect(count({ d5: '0:n' }, 'd5')).toBe(8)
		expect(count({ e2: '0:p' }, 'e2')).toBe(2)
		expect(count({ e3: '0:p' }, 'e3')).toBe(1)
		// a pawn capture and a blocked push
		expect(count({ e3: '0:p', e4: '1:n', d4: '1:b' }, 'e3')).toBe(1)
		// a king next to the free hill has all eight steps, two of them onto the hill
		expect(movesFrom(stateOf(V, [[{ c3: '0:k', h8: '1:k' }, 1]]), 'c3'))
			.toEqual(['c3-b2', 'c3-b3', 'c3-b4', 'c3-c2', 'c3-c4', 'c3-d2', 'c3-d3', 'c3-d4'])
		// pieces other than the king may stand on the hill without winning
		const s = play(V, stateOf(V, [[{ ...kings, d1: '0:q' }, 1]]), 'd1-d4')
		expect(s.result).toBeNull()
		expect(movesFrom(stateOf(V, [[{ ...kings, e4: '0:r', e8: '1:q' }, 1]]), 'e4')).toContain('e4-e8')
	})

	it('keeps double steps, en passant and promotion', () => {
		let s = newGame(V)
		for (const code of ['e2-e4', 'a7-a6', 'e4-e5', 'd7-d5']) {
			s = play(V, s, code)
		}
		expect(movesFrom(s, 'e5')).toEqual(['e5-d6', 'e5-e6'])
		const ep = play(V, s, 'e5-d6')
		expect(squareView(ep, sq('d5'))).toEqual([])
		expect(squareView(ep, sq('d6'))).toEqual([expect.objectContaining({ type: 'p', side: 0, p: 1 })])
		// the right expires after one ply
		s = play(V, play(V, s, 'b1-c3'), 'a6-a5')
		expect(movesFrom(s, 'e5')).toEqual(['e5-e6'])
		const promo = stateOf(V, [[{ ...kings, e7: '0:p' }, 1]])
		expect(movesFrom(promo, 'e7')).toEqual(['e7-e8=b', 'e7-e8=n', 'e7-e8=q', 'e7-e8=r'])
		const queened = play(V, promo, 'e7-e8=q')
		expect(squareView(queened, sq('e8'))).toEqual([expect.objectContaining({ type: 'q', side: 0, p: 1 })])
	})

	it('keeps castling on both wings', () => {
		const s = stateOf(V, [[{ e1: '0:k', a1: '0:r', h1: '0:r', e8: '1:k' }, 1]], 0, (b) => {
			b.x = { ep: -1, epVictim: -1, castle: castlingRights(V, b) }
		})
		const codes = legalMoves(V, s).map((m) => m.code)
		expect(codes).toContain('O-O')
		expect(codes).toContain('O-O-O')
		const short = play(V, s, 'O-O')
		expect(squareView(short, sq('g1'))).toEqual([expect.objectContaining({ type: 'k', p: 1 })])
		expect(squareView(short, sq('f1'))).toEqual([expect.objectContaining({ type: 'r', p: 1 })])
		const long = play(V, s, 'O-O-O')
		expect(squareView(long, sq('c1'))).toEqual([expect.objectContaining({ type: 'k', p: 1 })])
		expect(squareView(long, sq('d1'))).toEqual([expect.objectContaining({ type: 'r', p: 1 })])
		expect(long.result).toBeNull()
	})
})

describe('King of the Hill: the hill win and the hill-entry rule', () => {
	it('wins at once on a free hill square, for White and for Black (K1, K8)', () => {
		const k1 = stateOf(V, [[{ d3: '0:k', h8: '1:k' }, 1]])
		expect(outcomes(V, k1, 'd3-d4')).toEqual([expect.objectContaining({ key: 'move', p: 1, rolled: false })])
		const won = play(V, k1, 'd3-d4')
		expect(won.result).toEqual(HILL_WIN)
		expect(legalMoves(V, won)).toEqual([])
		const k8 = stateOf(V, [[{ a1: '0:k', e6: '1:k' }, 1]], 1)
		expect(odds(k8, 'e6-d5')).toEqual([['move', 1]])
		expect(play(V, k8, 'e6-d5').result).toEqual({ winner: 1, reason: 'hill' })
	})

	it('refuses a hill square attacked by a pawn (K2)', () => {
		const s = stateOf(V, [[{ e3: '0:k', d5: '1:p', h8: '1:k' }, 1]])
		expect(movesFrom(s, 'e3')).toEqual(['e3-d2', 'e3-d3', 'e3-d4', 'e3-e2', 'e3-f2', 'e3-f3', 'e3-f4'])
		expect(outcomes(V, s, 'e3-e4')).toBeNull()
		expect(play(V, s, 'e3-d4').result).toEqual(HILL_WIN)
	})

	it('wins by capturing onto the hill unless another piece guards the square (K3)', () => {
		const free = stateOf(V, [[{ d3: '0:k', d4: '1:n', h8: '1:k' }, 1]])
		expect(outcomes(V, free, 'd3-d4')).toEqual([expect.objectContaining({ key: 'capture', p: 1 })])
		const won = play(V, free, 'd3-d4')
		expect(won.result).toEqual(HILL_WIN)
		expect(won.quiet).toBe(0)
		const guarded = stateOf(V, [[{ d3: '0:k', d4: '1:n', e5: '1:p', h8: '1:k' }, 1]])
		expect(outcomes(V, guarded, 'd3-d4')).toBeNull()
		expect(movesFrom(guarded, 'd3'))
			.toEqual(['d3-c2', 'd3-c3', 'd3-c4', 'd3-d2', 'd3-e2', 'd3-e3', 'd3-e4'])
		expect(play(V, guarded, 'd3-e4').result).toEqual(HILL_WIN)
	})

	it('judges the square after the move: lines through the king count (K4)', () => {
		const front = stateOf(V, [[{ d3: '0:k', d8: '1:r', h8: '1:k' }, 1]])
		expect(outcomes(V, front, 'd3-d4')).toBeNull()
		expect(movesFrom(front, 'd3')).toEqual(expect.arrayContaining(['d3-c4', 'd3-e4']))
		const back = stateOf(V, [[{ d6: '0:k', d8: '1:r', h8: '1:k' }, 1]])
		expect(movesFrom(back, 'd6'))
			.toEqual(['d6-c5', 'd6-c6', 'd6-c7', 'd6-d7', 'd6-e5', 'd6-e6', 'd6-e7'])
		expect(play(V, back, 'd6-e5').result).toEqual(HILL_WIN)
	})

	it('lets the enemy king guard the hill, while kings may still stand side by side off it (K7)', () => {
		const s = stateOf(V, [[{ f4: '0:k', f6: '1:k' }, 1]])
		const codes = movesFrom(s, 'f4')
		expect(codes).not.toContain('f4-e5')
		expect(codes).toContain('f4-g5')
		expect(codes).toContain('f4-e4')
		expect(play(V, s, 'f4-e4').result).toEqual(HILL_WIN)
		expect(play(V, s, 'f4-g5').result).toBeNull()
	})

	it('counts a pinned piece as a guard (K16)', () => {
		const s = stateOf(V, [[{ d3: '0:k', h6: '0:r', a6: '1:k', c6: '1:n' }, 1]])
		expect(movesFrom(s, 'd3'))
			.toEqual(['d3-c2', 'd3-c3', 'd3-c4', 'd3-d2', 'd3-e2', 'd3-e3', 'd3-e4'])
		expect(play(V, s, 'd3-e4').result).toEqual(HILL_WIN)
	})

	it('still wins by capturing the king (K9)', () => {
		const s = stateOf(V, [[{ a1: '0:k', d1: '0:q', d8: '1:k' }, 1]])
		expect(play(V, s, 'd1-d8').result).toEqual({ winner: 0, reason: 'king' })
	})

	it('refutes the early king walk from the start (K12)', () => {
		let s = newGame(V)
		for (const code of ['e2-e4', 'e7-e5', 'e1-e2', 'b8-c6', 'e2-d3', 'g8-f6']) {
			s = play(V, s, code)
		}
		expect(s.result).toBeNull()
		expect(outcomes(V, s, 'd3-d4')).toBeNull()
		expect(movesFrom(s, 'd3')).toEqual(['d3-c3', 'd3-c4', 'd3-e2', 'd3-e3'])
	})

	it('ranks the hill win above the quiet-move draw and the move limit, and has no bare-kings draw', () => {
		const s = stateOf(V, [[{ d3: '0:k', h8: '1:k' }, 1]])
		expect(play(V, { ...s, quiet: 99 }, 'd3-d4').result).toEqual(HILL_WIN)
		expect(play(V, { ...s, quiet: 99 }, 'd3-c3').result).toEqual({ winner: null, reason: 'quiet' })
		expect(play(V, { ...s, ply: 599 }, 'd3-d4').result).toEqual(HILL_WIN)
		expect(play(V, { ...s, ply: 599 }, 'd3-c3').result?.winner).toBeNull()
		// two lone kings race for the hill
		const race = play(V, s, 'd3-c3')
		expect(race.result).toBeNull()
		expect(race.quiet).toBe(1)
	})

	it('keeps the classic end rules except the bare-kings draw', () => {
		expect([V.escapeRule, V.drawsWait, V.bareKingsDraw]).toEqual([true, true, false])
		// the 50-move draw waits while Black can capture the white king for certain (the rook on b8 guards b1)
		const s = { ...stateOf(V, [[{ a1: '0:k', b8: '1:r', h8: '1:k' }, 1]]), quiet: 99 }
		const waits = play(V, s, 'a1-b1')
		expect([waits.result, waits.quiet]).toEqual([null, 100])
		expect(play(V, waits, 'b8-b1').result).toEqual({ winner: 1, reason: 'king' })
		expect(play(V, s, 'a1-a2').result).toEqual({ winner: null, reason: 'quiet' })
	})

	it('counts a king step onto the hill as an escape for a king that is lost otherwise', () => {
		// Black's king on f6: the rooks and pawns take every square around it, and the rook on h6 takes it where it
		// stands; only e5, a hill square, may be free
		const around = { a1: '0:k', a7: '0:r', h6: '0:r', f6: '1:k' }
		const open = play(V, stateOf(V, [[{ ...around, e4: '0:p', h4: '0:p' }, 1]]), 'a1-b1')
		expect(open.result).toBeNull()
		expect(movesFrom(open, 'f6')).toContain('f6-e5')
		expect(play(V, open, 'f6-e5').result).toEqual({ winner: 1, reason: 'hill' })
		// the rook on h5 also guards e5: the hill step is refused, so Black's king cannot escape
		const shut = play(V, stateOf(V, [[{ ...around, h5: '0:r' }, 1]]), 'a1-b1')
		expect(shut.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		// a bishop ghost guards e5 in one possibility only: the hill step is a roll that may win, so it escapes
		const ghost = (at) => [{ ...around, e4: '0:p', h4: '0:p', [at]: '0:b' }, 1]
		const roll = play(V, stateOf(V, [ghost('b2'), ghost('c1')]), 'a1-b1')
		expect(roll.result).toBeNull()
		expect(odds(roll, 'f6-e5')).toEqual([['miss', 0.5], ['move', 0.5]])
		expect(applyOutcome(V, roll, 'f6-e5', 1).result).toEqual({ winner: 1, reason: 'hill' })
	})
})

describe('King of the Hill: quantum positions', () => {
	it('rolls a hill step against a ghost attacker and settles it (K5)', () => {
		const s = stateOf(V, [
			[{ d3: '0:k', b6: '1:b', h8: '1:k' }, 1],
			[{ d3: '0:k', a5: '1:b', h8: '1:k' }, 1],
		])
		const bishop = idAt(s, 'b6')
		expect(outcomes(V, s, 'd3-d4')).toEqual([
			expect.objectContaining({ key: 'miss', p: 0.5, rolled: true, notes: [] }),
			expect.objectContaining({ key: 'move', p: 0.5, rolled: true, notes: [] }),
		])
		const missed = applyOutcome(V, s, 'd3-d4', 0)
		expect(missed.result).toBeNull()
		expect(missed.turn).toBe(1)
		expect(squareView(missed, sq('d3'))).toEqual([expect.objectContaining({ type: 'k', p: 1 })])
		expect(where(missed, bishop)).toEqual([['b6', 1]])
		const moved = applyOutcome(V, s, 'd3-d4', 1)
		expect(moved.result).toEqual(HILL_WIN)
		expect(where(moved, bishop)).toEqual([['a5', 1]])
	})

	it('wins against an enemy ghost on the hill square, moved or captured (K6)', () => {
		const s = stateOf(V, [
			[{ d3: '0:k', d4: '1:n', h8: '1:k' }, 1],
			[{ d3: '0:k', a8: '1:n', h8: '1:k' }, 1],
		])
		expect(odds(s, 'd3-d4')).toEqual([['move', 0.5], ['capture', 0.5]])
		expect(applyOutcome(V, s, 'd3-d4', 0).result).toEqual(HILL_WIN)
		expect(applyOutcome(V, s, 'd3-d4', 1).result).toEqual(HILL_WIN)
	})

	it('rolls against a ghost blocker and against a line through the king (K10, K15)', () => {
		const k10 = stateOf(V, [
			[{ c3: '0:k', d8: '1:r', h8: '1:k', d6: '1:n' }, 1],
			[{ c3: '0:k', d8: '1:r', h8: '1:k', b8: '1:n' }, 1],
		])
		const knight = idAt(k10, 'd6')
		expect(odds(k10, 'c3-d4')).toEqual([['miss', 0.5], ['move', 0.5]])
		expect(where(applyOutcome(V, k10, 'c3-d4', 0), knight)).toEqual([['b8', 1]])
		const won = applyOutcome(V, k10, 'c3-d4', 1)
		expect(won.result).toEqual(HILL_WIN)
		expect(where(won, knight)).toEqual([['d6', 1]])
		const k15 = stateOf(V, [
			[{ d6: '0:k', d8: '1:r', h8: '1:k' }, 1],
			[{ d6: '0:k', a8: '1:r', h8: '1:k' }, 1],
		])
		const rook = idAt(k15, 'd8')
		expect(odds(k15, 'd6-d5')).toEqual([['miss', 0.5], ['move', 0.5]])
		expect(where(applyOutcome(V, k15, 'd6-d5', 0), rook)).toEqual([['d8', 1]])
		expect(where(applyOutcome(V, k15, 'd6-d5', 1), rook)).toEqual([['a8', 1]])
	})

	it('misses where an own ghost stands on the hill square (K13)', () => {
		const s = stateOf(V, [
			[{ d3: '0:k', d4: '0:n', h8: '1:k' }, 1],
			[{ d3: '0:k', b3: '0:n', h8: '1:k' }, 1],
		])
		const knight = idAt(s, 'd4')
		expect(odds(s, 'd3-d4')).toEqual([['miss', 0.5], ['move', 0.5]])
		const missed = applyOutcome(V, s, 'd3-d4', 0)
		expect(missed.result).toBeNull()
		expect(where(missed, knight)).toEqual([['d4', 1]])
		const won = applyOutcome(V, s, 'd3-d4', 1)
		expect(won.result).toEqual(HILL_WIN)
		expect(where(won, knight)).toEqual([['b3', 1]])
	})

	it('captures or misses against a ghost that is on the square or guards it (K14)', () => {
		const s = stateOf(V, [
			[{ d3: '0:k', d4: '1:n', h8: '1:k' }, 1],
			[{ d3: '0:k', c6: '1:n', h8: '1:k' }, 1],
		])
		const knight = idAt(s, 'd4')
		expect(odds(s, 'd3-d4')).toEqual([['miss', 0.5], ['capture', 0.5]])
		expect(where(applyOutcome(V, s, 'd3-d4', 0), knight)).toEqual([['c6', 1]])
		const won = applyOutcome(V, s, 'd3-d4', 1)
		expect(won.result).toEqual(HILL_WIN)
		expect(where(won, knight)).toEqual([['off', 1]])
		// a pawn on e5 guards d4 in both worlds: the step is illegal
		const both = stateOf(V, [
			[{ d3: '0:k', d4: '1:n', e5: '1:p', h8: '1:k' }, 1],
			[{ d3: '0:k', c6: '1:n', e5: '1:p', h8: '1:k' }, 1],
		])
		expect(outcomes(V, both, 'd3-d4')).toBeNull()
		expect(movesFrom(both, 'd3'))
			.toEqual(['d3-c2', 'd3-c3', 'd3-c4', 'd3-d2', 'd3-e2', 'd3-e3', 'd3-e4'])
		expect(odds(both, 'd3-e4')).toEqual([['move', 1]])
		expect(play(V, both, 'd3-e4').result).toEqual(HILL_WIN)
	})

	it('keeps a ghost spread over several guarding squares a ghost after a Missed step (K17)', () => {
		const s = stateOf(V, [
			[{ d3: '0:k', b6: '1:b', h8: '1:k' }, 2],
			[{ d3: '0:k', a7: '1:b', h8: '1:k' }, 1],
			[{ d3: '0:k', a5: '1:b', h8: '1:k' }, 1],
		])
		const bishop = idAt(s, 'b6')
		expect(odds(s, 'd3-d4')).toEqual([['miss', 0.75], ['move', 0.25]])
		const missed = applyOutcome(V, s, 'd3-d4', 0)
		expect(missed.result).toBeNull()
		expect(missed.turn).toBe(1)
		const locs = pieceLocations(missed, bishop)
		expect(locs.map((l) => V.topology.names[l.sq]).sort()).toEqual(['a7', 'b6'])
		expect(locs.find((l) => l.sq === sq('b6')).p).toBeCloseTo(2 / 3, 6)
		expect(locs.find((l) => l.sq === sq('a7')).p).toBeCloseTo(1 / 3, 6)
		const won = applyOutcome(V, s, 'd3-d4', 1)
		expect(won.result).toEqual(HILL_WIN)
		expect(where(won, bishop)).toEqual([['a5', 1]])
	})

	it('refuses a step onto a square that a ghost guards from each of its squares (K19)', () => {
		const s = stateOf(V, [
			[{ d3: '0:k', b6: '1:b', h8: '1:k' }, 1],
			[{ d3: '0:k', f6: '1:b', h8: '1:k' }, 1],
		])
		expect(outcomes(V, s, 'd3-d4')).toBeNull()
		expect(movesFrom(s, 'd3'))
			.toEqual(['d3-c2', 'd3-c3', 'd3-c4', 'd3-d2', 'd3-e2', 'd3-e3', 'd3-e4'])
		expect(odds(s, 'd3-e4')).toEqual([['move', 1]])
		expect(play(V, s, 'd3-e4').result).toEqual(HILL_WIN)
	})

	it('refuses it as well when the guarding ghost has three or four parts, none of them 50 %', () => {
		// the player doc's "Guarded everywhere": every part of the bishop attacks d4, so no part needs to be certain
		const ghost = (parts) => stateOf(V, parts.map(([at, rel]) => [{ d3: '0:k', [at]: '1:b', h8: '1:k' }, rel]))
		const three = ghost([['b6', 2], ['f6', 1], ['a7', 1]])
		expect(where(three, idAt(three, 'b6'))).toEqual([['b6', 0.5], ['f6', 0.25], ['a7', 0.25]])
		expect(outcomes(V, three, 'd3-d4')).toBeNull()
		const four = ghost([['b6', 1], ['f6', 1], ['a7', 1], ['g7', 1]])
		expect(where(four, idAt(four, 'b6')).map(([, p]) => p)).toEqual([0.25, 0.25, 0.25, 0.25])
		expect(outcomes(V, four, 'd3-d4')).toBeNull()
		expect(movesFrom(four, 'd3')).not.toContain('d3-d4')
		expect(play(V, four, 'd3-e4').result).toEqual(HILL_WIN)
	})

	it('gives Missed, Moved and Captured in one hill step and lowers the budget on Missed (K20)', () => {
		const s = stateOf(V, [
			[{ d3: '0:k', d4: '1:n', b6: '1:b', h8: '1:k' }, 1],
			[{ d3: '0:k', d4: '1:n', a5: '1:b', h8: '1:k' }, 1],
			[{ d3: '0:k', a8: '1:n', b6: '1:b', h8: '1:k' }, 1],
			[{ d3: '0:k', a8: '1:n', a5: '1:b', h8: '1:k' }, 1],
		])
		const knight = idAt(s, 'd4')
		const bishop = idAt(s, 'b6')
		expect(budget(s, 1)).toBe(4)
		const list = outcomes(V, s, 'd3-d4')
		expect(list.map((o) => [o.key, o.p])).toEqual([['miss', 0.5], ['move', 0.25], ['capture', 0.25]])
		// the hill step's own roll decides the game: no game-end roll follows it
		expect(list.every((o) => o.notes.length === 0)).toBe(true)
		const missed = applyOutcome(V, s, 'd3-d4', 0)
		expect(missed.result).toBeNull()
		expect(missed.turn).toBe(1)
		expect(missed.quiet).toBe(1)
		expect(where(missed, bishop)).toEqual([['b6', 1]])
		expect(where(missed, knight)).toEqual([['d4', 0.5], ['a8', 0.5]])
		expect(missed.worlds.map((e) => e.w)).toEqual([T / 2, T / 2])
		expect(budget(missed, 1)).toBe(2)
		const moved = applyOutcome(V, s, 'd3-d4', 1)
		expect(moved.result).toEqual(HILL_WIN)
		expect(moved.worlds).toHaveLength(1)
		expect(where(moved, knight)).toEqual([['a8', 1]])
		const captured = applyOutcome(V, s, 'd3-d4', 2)
		expect(captured.result).toEqual(HILL_WIN)
		expect(captured.worlds).toHaveLength(1)
		expect(where(captured, knight)).toEqual([['off', 1]])
	})

	it('lets a split guard the hill in one or in every possibility', () => {
		// K18's position: White threatens c3-d4
		const s = stateOf(V, [[{ c3: '0:k', h1: '1:r', h8: '1:k' }, 1]], 1)
		const both = play(V, s, 'h1-d1|h4')
		expect(both.worlds).toHaveLength(2)
		expect(budget(both, 1)).toBe(2)
		expect(outcomes(V, both, 'c3-d4')).toBeNull()
		const one = play(V, s, 'h1-d1|g1')
		expect(odds(one, 'c3-d4')).toEqual([['miss', 0.5], ['move', 0.5]])
		const missed = applyOutcome(V, one, 'c3-d4', 0)
		expect(squareView(missed, sq('d1'))).toEqual([expect.objectContaining({ type: 'r', side: 1, p: 1 })])
		expect(applyOutcome(V, one, 'c3-d4', 1).result).toEqual(HILL_WIN)
	})

	it('links a rook that passes a ghost, and the link decides the next hill step', () => {
		const s = stateOf(V, [
			[{ c3: '0:k', b5: '0:n', a5: '1:r', h8: '1:k' }, 1],
			[{ c3: '0:k', b1: '0:n', a5: '1:r', h8: '1:k' }, 1],
		], 1)
		const rook = idAt(s, 'a5')
		const knight = idAt(s, 'b5')
		// pass = link: no roll, the rook reaches d5 only where the knight is not on b5
		expect(outcomes(V, s, 'a5-d5')).toEqual([expect.objectContaining({ key: 'move', p: 1, rolled: false })])
		const linked = play(V, s, 'a5-d5')
		expect(linked.result).toBeNull()
		expect(where(linked, rook)).toEqual([['a5', 0.5], ['d5', 0.5]])
		// the rook on d5 guards d4; where it stayed on a5, the knight is on b5
		expect(odds(linked, 'c3-d4')).toEqual([['miss', 0.5], ['move', 0.5]])
		const missed = applyOutcome(V, linked, 'c3-d4', 0)
		expect(missed.result).toBeNull()
		expect(where(missed, rook)).toEqual([['d5', 1]])
		expect(where(missed, knight)).toEqual([['b1', 1]])
		const won = applyOutcome(V, linked, 'c3-d4', 1)
		expect(won.result).toEqual(HILL_WIN)
		expect(where(won, knight)).toEqual([['b5', 1]])
	})

	it('expires the en passant right in the worlds of a Missed hill step', () => {
		// Black has just played h7-h5; the bishop ghost guards d4 from b6 only
		const ghost = (b6) => ({ d3: '0:k', [b6 ? 'b6' : 'a5']: '1:b', h8: '1:k', g5: '0:p', h5: '1:p' })
		const s = stateOf(V, [[ghost(true), 1], [ghost(false), 1]], 0, (b) => {
			b.x = { ep: sq('h6'), epVictim: sq('h5'), castle: [] }
		})
		expect(odds(s, 'g5-h6')).toEqual([['capture', 1]])
		expect(odds(s, 'd3-d4')).toEqual([['miss', 0.5], ['move', 0.5]])
		const missed = applyOutcome(V, s, 'd3-d4', 0)
		expect(missed.worlds.every((e) => e.b.x.ep === -1 && e.b.x.epVictim === -1)).toBe(true)
	})
})

describe('King of the Hill: the computer player', () => {
	it('defends a one-move hill threat at the normal level (K18)', async () => {
		const s = stateOf(V, [[{ c3: '0:k', h1: '1:r', h8: '1:k' }, 1]], 1)
		expect(legalMoves(V, s, { splits: true })).toHaveLength(94)
		const defences = legalMoves(V, s, { splits: true }).map((m) => m.code).filter((code) => {
			const list = outcomes(V, s, code)
			return list.every((o, i) => outcomes(V, applyOutcome(V, s, code, i), 'c3-d4') === null)
		})
		expect(defences.sort()).toEqual(['h1-d1', 'h1-d1|h4', 'h1-h4'])
		for (let n = 1; n <= 20; n++) {
			const code = await chooseMove(V, s, { level: 'normal', rng: seededRng(n), now: workClock() })
			const after = applyOutcome(V, s, code, 0)
			expect(outcomes(V, after, 'c3-d4'), 'seed ' + n + ': ' + code).toBeNull()
		}
	})

	it('values a king whose path towards the hill is open', () => {
		const value = (placement) => V.evaluate(stateOf(V, [[placement, 1]]).worlds[0].b, 0)
		expect(V.evaluate(newGame(V).worlds[0].b, 0)).toBe(0)
		expect(V.evaluate(play(V, newGame(V), 'e2-e3').worlds[0].b, 0)).toBe(12)
		expect(V.evaluate(play(V, newGame(V), 'e2-e3').worlds[0].b, 1)).toBe(-12)
		// Ke1 and ka8 both have the pull of distance 3; their steps towards the hill are d2, e2, f2 and b7
		const blocked = { e1: '0:k', d2: '0:p', e2: '0:p', f2: '0:p', a8: '1:k', b7: '1:p' }
		expect(value(blocked)).toBe(0)
		expect(value({ ...blocked, e2: '1:n' })).toBe(12)
		expect(value({ ...blocked, b7: '0:n' })).toBe(-12)
		// a step that is not towards the hill (d1, f1) does not count
		expect(value({ ...blocked, d1: '1:n' })).toBe(0)
	})

	it('values a king next to the hill by its free hill steps', () => {
		const value = (placement) => V.evaluate(stateOf(V, [[placement, 1]]).worlds[0].b, 0)
		// Kh8: pull 15 and an open path (g7), 27 in all; Ke3: pull 110 and an open path, 122, plus its free steps
		const kings = { e3: '0:k', h8: '1:k' }
		expect(value(kings)).toBe(122 + 250 - 27)
		// the e5 pawn guards d4, the f6 knight e4; an own piece on d4 takes that step away too
		expect(value({ ...kings, e5: '1:p' })).toBe(122 + 60 - 27)
		expect(value({ ...kings, d4: '0:n' })).toBe(122 + 60 - 27)
		expect(value({ ...kings, e5: '1:p', f6: '1:n' })).toBe(122 - 27)
		// an enemy piece on the hill that nothing guards can be taken: still a free step
		expect(value({ ...kings, e4: '1:n' })).toBe(122 + 250 - 27)
		// the other side's king counts against: Black's king on d6 has d5 and e5
		expect(V.evaluate(stateOf(V, [[{ a1: '0:k', d6: '1:k' }, 1]]).worlds[0].b, 0)).toBe(27 - (122 + 250))
	})

	it('does not let a double hill threat through at the Hard level (1.d3 d6 2.Kd2)', async () => {
		// Kd7 looked best to Hard: after 3.Ke3 White threatens d4 and e4 at once, and no Black move guards both
		let s = newGame(V)
		for (const code of ['d2-d3', 'd7-d6', 'e1-d2']) {
			s = play(V, s, code)
		}
		const parried = (x) => outcomes(V, x, 'e3-d4') === null && outcomes(V, x, 'e3-e4') === null
		for (let n = 1; n <= 3; n++) {
			const code = await chooseMove(V, s, { level: 'hard', rng: seededRng(n), now: workClock() })
			const threat = play(V, play(V, s, code), 'd2-e3')
			const answers = legalMoves(V, threat).filter((m) => parried(play(V, threat, m.code)))
			expect(answers.length, 'seed ' + n + ': ' + code).toBeGreaterThan(0)
		}
	}, 20000)

	it('opens the path of its king at the Hard level instead of shuffling a rook from move 2', async () => {
		// Hard has no noise and keeps the first of equal moves: without the open-path term it played b1-c3, then
		// a1-b1, b1-a1, ... until the 50-move draw, and lost to Normal 8 of 12 games
		for (let n = 1; n <= 3; n++) {
			let s = newGame(V)
			const codes = []
			while (!s.result && codes.length < 12) {
				const code = await chooseMove(V, s, { level: 'hard', rng: seededRng(n), now: workClock() })
				codes.push(code)
				s = applyOutcome(V, s, code, 0)
			}
			expect(codes[0], 'seed ' + n).toMatch(/^[def]2-[def][34]$/)
			expect(codes[1], 'seed ' + n).toMatch(/^[def]7-[def][56]$/)
			for (let i = 2; i < codes.length; i++) {
				const back = codes[i - 2].split('-').reverse().join('-')
				expect(codes[i], 'seed ' + n + ': ' + codes.join(' ')).not.toBe(back)
			}
		}
		// up to 36 complete searches of the hard level: about 5 s on a desktop, three times that on a loaded one
	}, 60000)

	it('steps onto a free hill square when it can', async () => {
		const s = stateOf(V, [[{ c3: '0:k', a8: '1:r', h8: '1:k', h7: '1:p' }, 1]])
		for (const level of ['easy', 'normal', 'hard']) {
			const code = await chooseMove(V, s, { level, rng: seededRng(3), now: workClock() })
			expect(play(V, s, code).result, level + ': ' + code).toEqual(HILL_WIN)
		}
	})

	it('makes a legal move from the start at every level', async () => {
		const s = newGame(V)
		for (const L of LEVELS) {
			const elapsed = stopwatch()
			const code = await chooseMove(V, s, { level: L.id, rng: seededRng(11) })
			expect(outcomes(V, s, code), L.id + ': ' + code).not.toBeNull()
			expect(elapsed()).toBeLessThan(L.timeMs + 1500)
		}
	}, 20000)
})
