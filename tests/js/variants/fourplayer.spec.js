/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Four-player chess: the cross-shaped board, the four armies and their directions, castling along a file, en passant
 * for the next player only, promotion by mode, elimination (free for all) and teams, the fair-share budget, a player
 * who cannot move, and how the quantum rules interact with them. The cases follow handoff/research/fourplayer.md 7.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { resignResult } from '../../../src/variantplay/panel.js'
import { resultText } from '../../../src/variantplay/texts.js'
import { chooseMove, evaluateState, LEVELS } from '../../../src/variants/core/ai.js'
import {
	applyMove,
	applyOutcome,
	branches,
	budgetInfo,
	isLegal,
	legalMoves,
	mergesFrom,
	newGame,
	outcomes,
	royalDanger,
	T,
} from '../../../src/variants/core/quantum.js'
import { cloneWorld, nameOf, OFF, placePiece } from '../../../src/variants/core/world.js'
import V from '../../../src/variants/fourplayer.js'
import { play, stateOf, stopwatch, workClock } from './helpers.js'

const LETTERS = ['R', 'B', 'Y', 'G']

/** The four kings on their start squares (Red, Blue, Yellow, Green). */
const K4 = { h1: '0:k', a7: '1:k', g14: '2:k', n8: '3:k' }

/**
 * The square index of a name.
 *
 * @param {string} name square name
 * @return {number}
 */
function sq(name) {
	return V.topology.byName(name)
}

/**
 * An `edit` for `stateOf`: the mode and empty per-world bookkeeping, plus any extra fields.
 *
 * @param {boolean} [teams] Teams mode
 * @param {object} [extra] more fields of `x`
 * @return {(b: object) => void}
 */
function mode(teams = false, extra = {}) {
	return (b) => {
		b.x = { teams, ep: -1, epVictim: -1, castle: [], ...extra }
	}
}

/**
 * A state from equally likely placements.
 *
 * @param {Array<Record<string, string>>} placements one placement per world
 * @param {number} [turn] side to move
 * @param {boolean} [teams] Teams mode
 * @param {object} [extra] more fields of `x`
 * @return {object}
 */
function position(placements, turn = 0, teams = false, extra = {}) {
	return stateOf(V, placements.map((p) => [p, 1]), turn, mode(teams, extra))
}

/**
 * The pieces of a world as sorted text such as `RKh1`.
 *
 * @param {object} s state
 * @param {number} [i] world index
 * @return {string[]}
 */
function pieces(s, i = 0) {
	const b = s.worlds[i].b
	const out = []
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sq[id] >= 0) {
			out.push(LETTERS[b.sd[id]] + b.ty[id].toUpperCase() + nameOf(V, b.sq[id]))
		}
	}
	return out.sort()
}

/**
 * The ordinary move codes of the side to move from one square, sorted.
 *
 * @param {object} s state
 * @param {string} from square name
 * @return {string[]}
 */
function movesFrom(s, from) {
	return legalMoves(V, s).filter((m) => m.type === 'move' && m.from === sq(from)).map((m) => m.code).sort()
}

/**
 * The outcomes of a move as `[key, p]` pairs.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {Array<[string, number]>}
 */
function odds(s, code) {
	return outcomes(V, s, code).map((o) => [o.key, o.p])
}

/**
 * One castling right of the start position.
 *
 * @param {number} side side index
 * @param {string} flag K or Q
 * @return {object}
 */
function right(side, flag) {
	return newGame(V).worlds[0].b.x.castle.find((c) => c.side === side && c.flag === flag)
}

/**
 * The rights of a world as text such as `RK`.
 *
 * @param {object} b world
 * @return {string[]}
 */
function rightsOf(b) {
	return (b.x.castle ?? []).map((c) => LETTERS[c.side] + c.flag).sort()
}

/**
 * The start position changed by `edit` (one world, Red to move).
 *
 * @param {(b: object) => void} edit changes to the start world
 * @param {object} [options] option values
 * @return {object}
 */
function fromStart(edit, options = {}) {
	const s = newGame(V, options)
	const b = cloneWorld(s.worlds[0].b)
	edit(b)
	return { ...s, worlds: [{ b, w: T }] }
}

/**
 * The computer's extra terms for Red (`V.evaluate`) in a one-world position, after `mover` played the last ply.
 *
 * @param {Record<string, string>} placement the pieces
 * @param {number} mover the side that played the last ply
 * @param {boolean} [teams] Teams mode
 * @return {number}
 */
function redTerms(placement, mover, teams = false) {
	return V.evaluate(position([placement], (mover + 1) % 4, teams, { mover }).worlds[0].b, 0)
}

/**
 * Play a game on from a state with the computer at one level for every side.
 *
 * @param {object} s state
 * @param {string} level easy, normal or hard
 * @param {number} plies the last ply to play
 * @param {number} seed seed of the computer and the rolls
 * @return {Promise<object>} the last state
 */
async function playOut(s, level, plies, seed) {
	const rng = seededRng(seed)
	while (!s.result && s.ply < plies) {
		const code = await chooseMove(V, s, { level, rng, now: workClock() })
		s = applyMove(V, s, code, rng).state
	}
	return s
}

describe('four-player chess: board, setup and moves', () => {
	it('sets up the 64 pieces of the chess.com start position on a 160-square cross', () => {
		const s = newGame(V, { mode: 'ffa' })
		expect(V.topology.size).toBe(160)
		for (const missing of ['a1', 'c3', 'l1', 'n3', 'a12', 'c14', 'l12', 'n14']) {
			expect(sq(missing)).toBe(-1)
		}
		expect(pieces(s)).toEqual([
			'RRd1',
			'RNe1',
			'RBf1',
			'RQg1',
			'RKh1',
			'RBi1',
			'RNj1',
			'RRk1',
			'RPd2',
			'RPe2',
			'RPf2',
			'RPg2',
			'RPh2',
			'RPi2',
			'RPj2',
			'RPk2',
			'BRa11',
			'BNa10',
			'BBa9',
			'BQa8',
			'BKa7',
			'BBa6',
			'BNa5',
			'BRa4',
			'BPb11',
			'BPb10',
			'BPb9',
			'BPb8',
			'BPb7',
			'BPb6',
			'BPb5',
			'BPb4',
			'YRk14',
			'YNj14',
			'YBi14',
			'YQh14',
			'YKg14',
			'YBf14',
			'YNe14',
			'YRd14',
			'YPk13',
			'YPj13',
			'YPi13',
			'YPh13',
			'YPg13',
			'YPf13',
			'YPe13',
			'YPd13',
			'GRn4',
			'GNn5',
			'GBn6',
			'GQn7',
			'GKn8',
			'GBn9',
			'GNn10',
			'GRn11',
			'GPm4',
			'GPm5',
			'GPm6',
			'GPm7',
			'GPm8',
			'GPm9',
			'GPm10',
			'GPm11',
		].sort())
		expect(s.worlds[0].b.x.teams).toBe(false)
		expect(rightsOf(s.worlds[0].b)).toEqual(['BK', 'BQ', 'GK', 'GQ', 'RK', 'RQ', 'YK', 'YQ'])
		expect(newGame(V, { mode: 'teams' }).worlds[0].b.x.teams).toBe(true)
	})

	it('gives every army its 20 start moves in its own direction', () => {
		const s = newGame(V, { mode: 'ffa' })
		const files = 'defghijk'.split('')
		const ranks = [4, 5, 6, 7, 8, 9, 10, 11]
		// every pawn [from, one step, two steps]
		const pushes = (list) => list.flatMap(([a, b, c]) => [a + '-' + b, a + '-' + c])
		const expected = [
			['e1-d3', 'e1-f3', 'j1-i3', 'j1-k3', ...pushes(files.map((f) => [f + 2, f + 3, f + 4]))],
			['a10-c9', 'a10-c11', 'a5-c4', 'a5-c6', ...pushes(ranks.map((r) => ['b' + r, 'c' + r, 'd' + r]))],
			['j14-i12', 'j14-k12', 'e14-d12', 'e14-f12', ...pushes(files.map((f) => [f + 13, f + 12, f + 11]))],
			['n5-l4', 'n5-l6', 'n10-l9', 'n10-l11', ...pushes(ranks.map((r) => ['m' + r, 'l' + r, 'k' + r]))],
		]
		for (let side = 0; side < 4; side++) {
			const codes = legalMoves(V, { ...s, turn: side }).map((m) => m.code).sort()
			expect(codes, LETTERS[side]).toEqual(expected[side].sort())
		}
	})

	it('plays clockwise: Red, Blue, Yellow, Green', () => {
		let s = newGame(V)
		const turns = []
		for (const code of ['h2-h4', 'b8-d8', 'g13-g11', 'm7-k7']) {
			s = play(V, s, code)
			turns.push(s.turn)
		}
		expect(turns).toEqual([1, 2, 3, 0])
	})

	it('moves every piece type with the missing corners in the way', () => {
		expect(movesFrom(position([{ ...K4, d4: '0:n' }]), 'd4'))
			.toEqual(['d4-b5', 'd4-c6', 'd4-e2', 'd4-e6', 'd4-f3', 'd4-f5'])
		expect(movesFrom(position([{ ...K4, c4: '0:n' }]), 'c4'))
			.toEqual(['c4-a5', 'c4-b6', 'c4-d2', 'c4-d6', 'c4-e3', 'c4-e5'])
		const bishop = movesFrom(position([{ ...K4, d4: '0:b' }]), 'd4')
		expect(bishop).toEqual(['e5', 'f6', 'g7', 'h8', 'i9', 'j10', 'k11', 'e3', 'f2', 'g1', 'c5', 'b6', 'a7']
			.map((t) => 'd4-' + t).sort())
		expect(branches(V, position([{ ...K4, d4: '0:b' }]), 'd4-a7')[0].key).toBe('capture')
		expect(movesFrom(position([{ ...K4, d4: '0:r' }]), 'd4')).toHaveLength(26)
		expect(movesFrom(position([{ ...K4, d4: '0:q' }]), 'd4')).toHaveLength(39)
		expect(movesFrom(position([K4]), 'h1')).toEqual(['h1-g1', 'h1-g2', 'h1-h2', 'h1-i1', 'h1-i2'])
		expect(movesFrom(position([{ g7: '0:k', a7: '1:k', g14: '2:k', n8: '3:k' }]), 'g7')).toHaveLength(8)
	})

	it('castles on both wings for every army, along a rank or a file', () => {
		const cases = [
			[0, 'O-O', ['RKj1', 'RRi1']],
			[0, 'O-O-O', ['RKf1', 'RRg1']],
			[1, 'O-O', ['BKa5', 'BRa6']],
			[1, 'O-O-O', ['BKa9', 'BRa8']],
			[2, 'O-O', ['YKe14', 'YRf14']],
			[2, 'O-O-O', ['YKi14', 'YRh14']],
			[3, 'O-O', ['GKn10', 'GRn9']],
			[3, 'O-O-O', ['GKn6', 'GRn7']],
		]
		const all = newGame(V).worlds[0].b.x.castle
		for (const [side, code, expected] of cases) {
			const rooks = {}
			for (const flag of ['K', 'Q']) {
				rooks[nameOf(V, right(side, flag).rook)] = side + ':r'
			}
			const s = position([{ ...K4, ...rooks }], side, false, { castle: all })
			expect(outcomes(V, s, code), LETTERS[side] + code).toEqual([expect.objectContaining({ key: 'move', p: 1 })])
			const after = play(V, s, code)
			const army = pieces(after).filter((p) => p[0] === LETTERS[side])
			expect(army, LETTERS[side] + code).toEqual(expect.arrayContaining(expected))
			expect(army).toHaveLength(3)
			const left = rightsOf(after.worlds[0].b)
			expect(left).toHaveLength(6)
			expect(left.some((r) => r[0] === LETTERS[side])).toBe(false)
		}
	})

	it('promotes on the 8th line in free for all and on the 11th in Teams, to Q, R, B or N', () => {
		const promos = (from, to) => ['q', 'r', 'b', 'n'].map((p) => from + '-' + to + '=' + p)
		const ffa = position([{ ...K4, e7: '0:p', g5: '1:p', j8: '2:p', h9: '3:p', f8: '1:n' }])
		const pawnMoves = (s, side, from) => movesFrom({ ...s, turn: side }, from)
		expect(pawnMoves(ffa, 0, 'e7')).toEqual([...promos('e7', 'e8'), ...promos('e7', 'f8')].sort())
		expect(branches(V, ffa, 'e7-f8=n')[0].key).toBe('capture')
		expect(pawnMoves(ffa, 1, 'g5')).toEqual(promos('g5', 'h5').sort())
		expect(pawnMoves(ffa, 2, 'j8')).toEqual(promos('j8', 'j7').sort())
		expect(pawnMoves(ffa, 3, 'h9')).toEqual(promos('h9', 'g9').sort())
		const teams = position([{ ...K4, e7: '0:p', e10: '0:p', j10: '1:p' }], 0, true)
		expect(pawnMoves(teams, 0, 'e7')).toEqual(['e7-e8'])
		expect(pawnMoves(teams, 0, 'e10')).toEqual(promos('e10', 'e11').sort())
		expect(pawnMoves(teams, 1, 'j10')).toEqual(promos('j10', 'k10').sort())
		expect(pieces(play(V, teams, 'e10-e11=n'))).toContain('RNe11')
	})
})

describe('four-player chess: en passant', () => {
	it('lets only the next player take, with a pawn next to the double-stepped pawn', () => {
		// Teams: in free for all a Green pawn never stands on file g (it promotes there)
		let s = position([{ ...K4, f2: '0:p', e4: '1:p', g4: '3:p' }], 0, true)
		s = play(V, s, 'f2-f4')
		expect(s.turn).toBe(1)
		expect([s.worlds[0].b.x.ep, s.worlds[0].b.x.epVictim]).toEqual([sq('f3'), sq('f4')])
		expect(movesFrom(s, 'e4')).toEqual(['e4-f3'])
		expect(odds(s, 'e4-f3')).toEqual([['capture', 1]])
		const taken = play(V, s, 'e4-f3')
		expect(pieces(taken)).toEqual(['BKa7', 'BPf3', 'GKn8', 'GPg4', 'RKh1', 'YKg14'])
		expect(taken.worlds[0].b.x.ep).toBe(-1)
		// the right expires after the next player's turn
		const later = play(V, play(V, s, 'a7-a6'), 'g14-g13')
		expect(later.turn).toBe(3)
		expect(movesFrom(later, 'g4')).toEqual([])
	})

	it('works for every army, and never for a pawn that is not next to the double-stepped pawn', () => {
		const pairs = [
			[{ b10: '1:p', d11: '2:p' }, 1, 'b10-d10', 'd11-c10'],
			[{ j13: '2:p', k11: '3:p' }, 2, 'j13-j11', 'k11-j12'],
			[{ m5: '3:p', k4: '0:p' }, 3, 'm5-k5', 'k4-l5'],
		]
		for (const [extra, turn, double, ep] of pairs) {
			const s = play(V, position([{ ...K4, ...extra }], turn), double)
			expect(odds(s, ep), ep).toEqual([['capture', 1]])
		}
		const behind = play(V, position([{ ...K4, f2: '0:p', e2: '1:p' }]), 'f2-f4')
		expect(movesFrom(behind, 'e2')).toEqual(['e2-f2'])
		const yellow = play(V, position([{ ...K4, b11: '2:p', d11: '2:p', b10: '1:p' }], 1), 'b10-d10')
		expect([...movesFrom(yellow, 'b11'), ...movesFrom(yellow, 'd11')]).toEqual(['b11-b10', 'd11-c10'])
	})

	it('goes to the other neighbour when the players in between are out, and is purely geometric', () => {
		let s = play(V, position([{ h1: '0:k', n8: '3:k', j2: '0:p', k4: '3:p' }]), 'j2-j4')
		expect(s.turn).toBe(3)
		expect(movesFrom(s, 'k4')).toEqual(['k4-j3'])
		expect(pieces(play(V, s, 'k4-j3'))).toEqual(['GKn8', 'GPj3', 'RKh1'])
		// head-on (hand-built: an opposite pawn never reaches the fourth line in a game)
		s = play(V, position([{ h1: '0:k', g14: '2:k', n8: '3:k', f2: '0:p', e4: '2:p', g4: '2:p' }]), 'f2-f4')
		expect(s.turn).toBe(2)
		expect([...movesFrom(s, 'e4'), ...movesFrom(s, 'g4')]).toEqual(['e4-e3', 'e4-f3', 'g4-f3', 'g4-g3'])
		expect(pieces(play(V, s, 'e4-f3'))).toEqual(['GKn8', 'RKh1', 'YKg14', 'YPf3', 'YPg4'])
	})

	it('promotes an en passant capture that lands on the promotion line', () => {
		const promos = (code) => ['q', 'r', 'b', 'n'].map((p) => code + '=' + p)
		let s = play(V, position([{ ...K4, h2: '0:p', g4: '1:p' }]), 'h2-h4')
		expect(movesFrom(s, 'g4')).toEqual(promos('g4-h3').sort())
		expect(pieces(play(V, s, 'g4-h3=q'))).toEqual(['BKa7', 'BQh3', 'GKn8', 'RKh1', 'YKg14'])
		s = play(V, position([{ ...K4, k2: '0:p', j4: '1:p' }], 0, true), 'k2-k4')
		expect(movesFrom(s, 'j4')).toEqual(promos('j4-k3').sort())
		for (const code of promos('j4-k3')) {
			expect(odds(s, code)).toEqual([['capture', 1]])
		}
	})

	it('ends when the next player sits out (S3)', () => {
		// FFA, Blue is out, Red is boxed in (S2): after Green's double step Red sits out and Yellow may not take
		const s = position([{
			d1: '0:k',
			e1: '0:b',
			e2: '0:r',
			d2: '0:p',
			f2: '0:p',
			e3: '0:p',
			d3: '2:n',
			f3: '2:n',
			e4: '2:n',
			g14: '2:k',
			k11: '2:p',
			n8: '3:k',
			m10: '3:p',
		}], 3)
		expect(odds(s, 'm10-k10')).toEqual([['move', 1]])
		const next = play(V, s, 'm10-k10')
		expect(next.turn).toBe(2)
		expect(next.ply).toBe(1)
		expect(next.history.at(-1).skipped).toEqual([0])
		expect(next.worlds.every(({ b }) => b.x.ep === -1)).toBe(true)
		// the turn Red sat out is its last ply, so the computer knows Yellow is to move
		expect(next.worlds.every(({ b }) => b.x.mover === 0)).toBe(true)
		expect(movesFrom(next, 'k11')).toEqual([])
	})
})

describe('four-player chess: winning, teams and draws', () => {
	it('takes an eliminated army off the board in free for all and skips its player', () => {
		const s = position([{ ...K4, d4: '0:q', b8: '1:p', c6: '1:n', a11: '1:r' }])
		expect(odds(s, 'd4-a7')).toEqual([['capture', 1]])
		const after = play(V, s, 'd4-a7')
		expect(pieces(after)).toEqual(['GKn8', 'RKh1', 'RQa7', 'YKg14'])
		expect(after.turn).toBe(2)
		expect(after.result).toBeNull()
		expect(after.history.at(-1).info).toEqual({ out: [1] })
		expect(V.infoText(after.history.at(-1))).toEqual(['Blue is out'])
		expect(V.isOut(after.worlds[0].b, 1)).toBe(true)
		expect(V.sideInfo(after, 1)).toEqual({ text: 'out' })
		expect(V.sideInfo(after, 2)).toBeNull()
		// a resignation now: the players still in the game win, not the eliminated one
		expect(V.resignResult(after, 0)).toEqual({ winner: null, winners: [2, 3], reason: 'resign' })
	})

	it('lets the last king standing win', () => {
		const s = position([{ h1: '0:k', h8: '0:r', n8: '3:k', m9: '3:p' }])
		const after = play(V, s, 'h8-n8')
		expect(after.result).toEqual({ winner: 0, reason: 'king' })
		expect(pieces(after)).toEqual(['RKh1', 'RRn8'])
		expect(V.resignResult(s, 3)).toEqual({ winner: 0, reason: 'resign' })
	})

	it('Teams: partners block and cannot be captured, and the first king captured loses for its team', () => {
		const s = position([{ ...K4, d4: '0:q', c5: '2:n', e5: '1:n', d7: '1:b' }], 0, true)
		const queen = movesFrom(s, 'd4')
		expect(queen).toEqual(expect.arrayContaining(['d4-e5', 'd4-d7']))
		expect(queen).not.toContain('d4-c5')
		expect(queen).not.toContain('d4-b6')
		const t = position([{ ...K4, d4: '0:q', b8: '1:p' }], 0, true)
		const after = play(V, t, 'd4-a7')
		expect(after.result).toEqual({ winner: null, winners: [0, 2], reason: 'king' })
		expect(pieces(after)).toContain('BPb8')
		expect(V.resignResult(t, 3)).toEqual({ winner: null, winners: [0, 2], reason: 'resign' })
		expect(V.sideInfo(t, 1).text).toBe('with Green')
		expect(V.sideInfo(t, 2).text).toBe('with Red')
	})

	it('draws after 200 plies without a capture or a pawn move', () => {
		const s = { ...position([K4]), quiet: 199 }
		const after = play(V, s, 'h1-h2')
		expect(after.result).toEqual({ winner: null, reason: 'quiet' })
		expect(V.reasonText('quiet')).toBe('200 moves in a row without a capture or a pawn move')
	})

	it('keeps a king that cannot escape in the game, and the quiet-move draw waits for a sure king capture', () => {
		expect([V.escapeRule, V.bareKingsDraw, V.drawsWait]).toEqual([false, false, true])
		// two players left: after k5-k2 every move of Red's king lands on a square a rook covers, but it plays on
		const trapped = play(V, position([{ h1: '0:k', n8: '3:k', k1: '3:r', k5: '3:r' }], 3), 'k5-k2')
		expect(trapped.result).toBeNull()
		expect(trapped.turn).toBe(0)
		expect(legalMoves(V, trapped).map((m) => m.code).sort()).toEqual(['h1-g1', 'h1-g2', 'h1-h2', 'h1-i1', 'h1-i2'])
		expect(play(V, play(V, trapped, 'h1-h2'), 'k2-h2').result).toEqual({ winner: 3, reason: 'king' })
		// the 200th quiet ply: Blue, to move, can take Green's king for certain, so the draw waits
		const s = { ...position([{ ...K4, k8: '1:q' }]), quiet: 199 }
		const after = play(V, s, 'h1-h2')
		expect(after.quiet).toBe(200)
		expect(after.result).toBeNull()
		const taken = play(V, after, 'k8-n8')
		expect(taken.quiet).toBe(0)
		expect(taken.result).toBeNull()
		expect(V.infoText(taken.history.at(-1))).toEqual(['Green is out'])
	})

	it('draws with two lone kings apart in free for all, but not when they touch or with three', () => {
		let after = play(V, position([{ h1: '0:k', i2: '3:n', n8: '3:k' }]), 'h1-i2')
		expect(after.result).toEqual({ winner: null, reason: 'bareKings' })
		expect(resultText(V, after.result)).toBe('Draw (only the two kings are left)')
		after = play(V, position([{ h1: '0:k', i2: '3:n', j3: '3:k' }]), 'h1-i2')
		expect(after.result).toBeNull()
		expect(after.turn).toBe(3)
		expect(play(V, after, 'j3-i2').result).toEqual({ winner: 3, reason: 'king' })
		after = play(V, position([{ h1: '0:k', i2: '3:n', n8: '3:k', a7: '1:k' }]), 'h1-i2')
		expect(after.result).toBeNull()
	})

	it('Teams: a player who cannot move draws the game', () => {
		const s = position([{
			d1: '0:k',
			e1: '0:b',
			d2: '0:p',
			e2: '0:p',
			f2: '0:p',
			d3: '2:n',
			e3: '2:n',
			f3: '2:n',
			g3: '2:n',
			g14: '2:k',
			a7: '1:k',
			n8: '3:k',
		}], 3, true)
		expect(legalMoves(V, { ...s, turn: 0 })).toEqual([])
		expect(play(V, s, 'n8-n9').result).toEqual({ winner: null, reason: 'noMoves' })
	})

	it('free for all: a player who cannot move sits out', () => {
		const s = position([{
			d1: '0:k',
			e1: '0:b',
			e2: '0:r',
			d2: '0:p',
			f2: '0:p',
			e3: '0:p',
			d3: '2:n',
			f3: '2:n',
			e4: '2:n',
			g14: '2:k',
			a7: '1:k',
			n8: '3:k',
		}], 3)
		const after = play(V, s, 'n8-n9')
		expect(after.result).toBeNull()
		expect(after.turn).toBe(1)
		expect(after.ply).toBe(1)
		expect(after.history.at(-1).skipped).toEqual([0])
	})

	it('falls for the known opening trap in both modes', () => {
		for (const m of ['ffa', 'teams']) {
			let s = newGame(V, { mode: m })
			for (const code of ['h2-h3', 'b8-d8', 'e14-f12', 'm7-l7']) {
				s = play(V, s, code)
			}
			const after = play(V, s, 'g1-n8')
			if (m === 'teams') {
				expect(after.result).toEqual({ winner: null, winners: [0, 2], reason: 'king' })
			} else {
				expect(after.result).toBeNull()
				expect(after.turn).toBe(1)
				expect(pieces(after).some((p) => p[0] === 'G')).toBe(false)
			}
		}
	})
})

describe('four-player chess: quantum interactions', () => {
	it('rolls a ghost queen onto a king, and the turn order follows the roll', () => {
		const worlds = []
		for (const q of ['d4', 'j4']) {
			for (const n of ['c6', 'd8']) {
				worlds.push({ ...K4, b8: '1:p', [q]: '0:q', [n]: '1:n' })
			}
		}
		const s = position(worlds)
		expect([0, 1, 2, 3].map((side) => budgetInfo(V, s, side).used)).toEqual([2, 2, 1, 1])
		expect([0, 1, 2, 3].map((side) => budgetInfo(V, s, side).limit)).toEqual([2, 2, 2, 2])
		expect(odds(s, 'd4-a7')).toEqual([['miss', 0.5], ['capture', 0.5]])
		const miss = applyOutcome(V, s, 'd4-a7', 0)
		expect(miss.turn).toBe(1)
		expect(miss.worlds).toHaveLength(2)
		expect(miss.worlds.every(({ b }) => b.board[sq('j4')] >= 0)).toBe(true)
		expect(budgetInfo(V, miss, 0).limit).toBe(2)
		const hit = applyOutcome(V, s, 'd4-a7', 1)
		expect(hit.turn).toBe(2)
		expect(hit.worlds).toHaveLength(1)
		expect(pieces(hit)).toEqual(['GKn8', 'RKh1', 'RQa7', 'YKg14'])
		expect([0, 2, 3].map((side) => budgetInfo(V, hit, side))).toEqual([0, 2, 3]
			.map((side) => ({ used: 1, limit: 4, sides: [side] })))
	})

	it('dissolves the links to an eliminated army', () => {
		// the Red rook is on d8 exactly when the Blue knight blocks f8: what d8-i8 gives as a link
		const linked = play(V, position([
			{ ...K4, d8: '0:r', f8: '1:n', d10: '2:q' },
			{ ...K4, d8: '0:r', f10: '1:n', d10: '2:q' },
		]), 'd8-i8')
		expect(linked.worlds.map((e, i) => pieces(linked, i).filter((p) => /^(RR|BN)/.test(p))).sort())
			.toEqual([['BNf10', 'RRi8'], ['BNf8', 'RRd8']])
		const s = position([
			{ ...K4, d8: '0:r', f8: '1:n', d10: '2:q' },
			{ ...K4, i8: '0:r', f10: '1:n', d10: '2:q' },
		], 2)
		expect(odds(s, 'd10-a7')).toEqual([['capture', 1]])
		const after = play(V, s, 'd10-a7')
		expect(after.turn).toBe(3)
		expect(after.worlds.map((e) => e.w / T)).toEqual([0.5, 0.5])
		expect(after.worlds.map((e, i) => pieces(after, i)).sort()).toEqual([
			['GKn8', 'RKh1', 'RRd8', 'YKg14', 'YQa7'],
			['GKn8', 'RKh1', 'RRi8', 'YKg14', 'YQa7'],
		])
		expect(budgetInfo(V, after, 0)).toEqual({ used: 2, limit: 4, sides: [0] })
	})

	it('shares the budget fairly: 2 each while four kings stand, 4 with three', () => {
		let s = play(V, newGame(V), 'e1-d3|f3')
		expect(s.worlds).toHaveLength(2)
		for (const code of ['b8-d8', 'g13-g11', 'm7-k7']) {
			s = play(V, s, code)
		}
		expect(budgetInfo(V, s, 0)).toEqual({ used: 2, limit: 2, sides: [0] })
		expect(isLegal(V, s, 'j1-i3|k3')).toBe(false)
		expect(odds(s, 'j1-k3')).toEqual([['move', 1]])
		const three = position([
			{ h1: '0:k', g14: '2:k', n8: '3:k', j1: '0:n', d3: '0:n' },
			{ h1: '0:k', g14: '2:k', n8: '3:k', j1: '0:n', f3: '0:n' },
		])
		expect(budgetInfo(V, three, 0)).toEqual({ used: 2, limit: 4, sides: [0] })
		expect(isLegal(V, three, 'j1-i3|k3')).toBe(true)
	})

	it('rolls a link that would break the budget of 2', () => {
		const worlds = []
		for (const rn of ['d3', 'f3']) {
			for (const bn of ['f8', 'f10']) {
				worlds.push({ ...K4, [rn]: '0:n', d8: '0:r', [bn]: '1:n' })
			}
		}
		expect(odds(position(worlds), 'd8-i8')).toEqual([['miss', 0.5], ['move', 0.5]])
		const one = position([{ ...K4, d8: '0:r', f8: '1:n' }, { ...K4, d8: '0:r', f10: '1:n' }])
		expect(odds(one, 'd8-i8')).toEqual([['move', 1]])
	})

	it('raises the limit at once when a player is out (Q11)', () => {
		const worlds = (extra) => {
			const out = []
			for (const rn of ['d3', 'f3']) {
				for (const gn of ['f8', 'f10']) {
					out.push({ h1: '0:k', g14: '2:k', n8: '3:k', [rn]: '0:n', d8: '0:r', [gn]: '3:n', ...extra })
				}
			}
			return position(out)
		}
		const three = worlds({})
		expect(budgetInfo(V, three, 0)).toEqual({ used: 2, limit: 4, sides: [0] })
		expect(odds(three, 'd8-i8')).toEqual([['move', 1]])
		const four = worlds({ a7: '1:k' })
		expect(budgetInfo(V, four, 0)).toEqual({ used: 2, limit: 2, sides: [0] })
		expect(odds(four, 'd8-i8')).toEqual([['miss', 0.5], ['move', 0.5]])
	})

	it('settles a double step blocked by a ghost before en passant is possible', () => {
		const s = position([
			{ ...K4, f2: '0:p', e4: '1:p', f3: '2:n' },
			{ ...K4, f2: '0:p', e4: '1:p', h12: '2:n' },
		])
		expect(odds(s, 'f2-f4')).toEqual([['miss', 0.5], ['move', 0.5]])
		const miss = applyOutcome(V, s, 'f2-f4', 0)
		expect(pieces(miss)).toContain('YNf3')
		expect(pieces(miss)).toContain('RPf2')
		expect(movesFrom(miss, 'e4')).toEqual(['e4-f3', 'e4-f4'])
		expect(odds(miss, 'e4-f3')).toEqual([['capture', 1]])
		const moved = applyOutcome(V, s, 'f2-f4', 1)
		expect(pieces(moved)).toContain('YNh12')
		expect(moved.worlds[0].b.x.ep).toBe(sq('f3'))
		expect(movesFrom(moved, 'e4')).toEqual(['e4-f3'])
		expect(odds(moved, 'e4-f3')).toEqual([['capture', 1]])
	})

	it('eliminates by a converging capture, certain or rolled', () => {
		const s = position([{ ...K4, a4: '0:q' }, { ...K4, d4: '0:q' }])
		expect(outcomes(V, s, 'a4|d4-a7')).toEqual([expect.objectContaining({ key: 'capture', p: 1, rolled: false })])
		const after = play(V, s, 'a4|d4-a7')
		expect(after.worlds).toHaveLength(1)
		expect(pieces(after)).toEqual(['GKn8', 'RKh1', 'RQa7', 'YKg14'])
		expect(after.turn).toBe(2)
		const worlds = []
		for (const q of ['a4', 'd4']) {
			for (const n of ['b6', 'c9']) {
				worlds.push({ ...K4, [q]: '0:q', [n]: '1:n' })
			}
		}
		const r = position(worlds)
		expect(odds(r, 'a4|d4-a7')).toEqual([['miss', 0.25], ['capture', 0.75]])
		const miss = applyOutcome(V, r, 'a4|d4-a7', 0)
		expect(miss.turn).toBe(1)
		expect(pieces(miss)).toEqual(['BKa7', 'BNb6', 'GKn8', 'RKh1', 'RQd4', 'YKg14'])
		const hit = applyOutcome(V, r, 'a4|d4-a7', 1)
		expect(hit.turn).toBe(2)
		expect(hit.worlds.every(({ b }) => b.sd.every((side, id) => side !== 1 || b.sq[id] < 0))).toBe(true)
	})

	it('never rolls castling: illegal past a possible ghost, certain otherwise', () => {
		const rights = { castle: [right(0, 'K')] }
		const blocked = position([{ ...K4, k1: '0:r', i1: '1:n' }, { ...K4, k1: '0:r', c6: '1:n' }], 0, false, rights)
		expect(legalMoves(V, blocked).map((m) => m.code)).not.toContain('O-O')
		expect(branches(V, blocked, 'O-O')).toBeNull()
		const clear = position([{ ...K4, k1: '0:r', d8: '1:n' }, { ...K4, k1: '0:r', c6: '1:n' }], 0, false, rights)
		expect(outcomes(V, clear, 'O-O')).toEqual([expect.objectContaining({ key: 'move', p: 1, rolled: false })])
		const after = play(V, clear, 'O-O')
		expect(after.worlds.map((e, i) => pieces(after, i).filter((p) => p[0] === 'R'))).toEqual([
			['RKj1', 'RRi1'],
			['RKj1', 'RRi1'],
		])
	})

	it('loses a castling right everywhere once the rook is not 100 % home, and keeps it after a Missed roll', () => {
		const rights = { castle: [right(0, 'K')] }
		let s = position([{ ...K4, k1: '0:r', k5: '1:n' }, { ...K4, k1: '0:r', c6: '1:n' }], 0, false, rights)
		expect(odds(s, 'k1-k8')).toEqual([['move', 1]])
		s = play(V, s, 'k1-k8')
		expect(s.worlds.map(({ b }) => rightsOf(b))).toEqual([[], []])
		const i = outcomes(V, s, '?k5').findIndex((o) => o.key === 'k5')
		s = applyOutcome(V, s, '?k5', i)
		expect(pieces(s)).toEqual(['BKa7', 'BNk5', 'GKn8', 'RKh1', 'RRk1', 'YKg14'])
		s = play(V, play(V, s, 'g14-g13'), 'n8-n9')
		expect(isLegal(V, s, 'O-O')).toBe(false)
		const roll = position([{ ...K4, k1: '0:r', k3: '1:n' }, { ...K4, k1: '0:r', k5: '1:n' }], 0, false, rights)
		expect(odds(roll, 'k1-k5')).toEqual([['miss', 0.5], ['capture', 0.5]])
		const missed = applyOutcome(V, roll, 'k1-k5', 0)
		expect(pieces(missed)).toEqual(['BKa7', 'BNk3', 'GKn8', 'RKh1', 'RRk1', 'YKg14'])
		expect(rightsOf(missed.worlds[0].b)).toEqual(['RK'])
		expect(rightsOf(applyOutcome(V, roll, 'k1-k5', 1).worlds[0].b)).toEqual([])
	})

	it('ends the en passant right in every world after the next player\'s turn, whatever it was', () => {
		let s = position([
			{ ...K4, f2: '0:p', e4: '1:p', c6: '1:n' },
			{ ...K4, f2: '0:p', e4: '1:p', d8: '1:n' },
		])
		expect(odds(s, 'f2-f4')).toEqual([['move', 1]])
		s = play(V, s, 'f2-f4')
		expect(s.worlds.map(({ b }) => b.x.ep)).toEqual([sq('f3'), sq('f3')])
		expect(odds(s, 'e4-f3')).toEqual([['capture', 1]])
		const measures = outcomes(V, s, '?c6')
		expect(measures.map((o) => [o.key, o.p])).toEqual([['c6', 0.5], ['d8', 0.5]])
		for (let i = 0; i < 2; i++) {
			expect(applyOutcome(V, s, '?c6', i).worlds.every(({ b }) => b.x.ep === -1)).toBe(true)
		}
		expect(odds(s, 'c6-e7')).toEqual([['move', 1]])
		const linked = play(V, s, 'c6-e7')
		expect(linked.worlds).toHaveLength(2)
		expect(linked.worlds.every(({ b }) => b.x.ep === -1 && b.x.epVictim === -1)).toBe(true)
	})

	it('Teams: landing where the partner might be rolls, passing it links', () => {
		const s = position([{ ...K4, d8: '0:r', g8: '2:n' }, { ...K4, d8: '0:r', g10: '2:n' }], 0, true)
		expect(odds(s, 'd8-g8')).toEqual([['miss', 0.5], ['move', 0.5]])
		expect(pieces(applyOutcome(V, s, 'd8-g8', 0))).toEqual(['BKa7', 'GKn8', 'RKh1', 'RRd8', 'YKg14', 'YNg8'])
		expect(pieces(applyOutcome(V, s, 'd8-g8', 1))).toEqual(['BKa7', 'GKn8', 'RKh1', 'RRg8', 'YKg14', 'YNg10'])
		expect(odds(s, 'd8-i8')).toEqual([['move', 1]])
		const linked = play(V, s, 'd8-i8')
		expect(linked.worlds.map((e, i) => pieces(linked, i).filter((p) => /^(RR|YN)/.test(p))).sort()).toEqual([
			['RRd8', 'YNg8'],
			['RRi8', 'YNg10'],
		])
	})

	it('shows the danger of every enemy and their converging captures, but never of the partner', () => {
		expect(royalDanger(V, position([{ ...K4, h5: '2:q' }]), 0)).toBe(1)
		expect(royalDanger(V, position([{ ...K4, h5: '2:q' }], 0, true), 0)).toBe(0)
		expect(royalDanger(V, position([{ ...K4, h5: '3:q' }], 0, true), 0)).toBe(1)
		for (const turn of [0, 1, 3]) {
			expect(royalDanger(V, position([{ ...K4, a4: '0:q' }, { ...K4, d4: '0:q' }], turn), 1)).toBe(1)
		}
		const ghost = (teams) => position([{ ...K4, h5: '2:q' }, { ...K4, e4: '2:q' }], 3, teams)
		expect(royalDanger(V, ghost(false), 0)).toBe(1)
		expect(royalDanger(V, ghost(true), 0)).toBe(0)
	})

	it('Teams: a merge onto a square where the partner might be is rolled (P4)', () => {
		const worlds = []
		for (const q of ['a4', 'd4']) {
			for (const n of ['d7', 'c9']) {
				worlds.push({ ...K4, [q]: '0:q', [n]: '2:n' })
			}
		}
		const s = position(worlds, 0, true)
		expect(mergesFrom(V, s, sq('a4')).map((m) => m.code)).toContain('a4|d4-d7')
		expect(odds(s, 'a4|d4-d7')).toEqual([['miss', 0.5], ['move', 0.5]])
		const miss = applyOutcome(V, s, 'a4|d4-d7', 0)
		expect(miss.worlds).toHaveLength(2)
		expect(miss.worlds.map((e, i) => pieces(miss, i).filter((p) => /^(RQ|YN)/.test(p))).sort()).toEqual([
			['RQa4', 'YNd7'],
			['RQd4', 'YNd7'],
		])
		const move = applyOutcome(V, s, 'a4|d4-d7', 1)
		expect(pieces(move)).toEqual(['BKa7', 'GKn8', 'RKh1', 'RQd7', 'YKg14', 'YNc9'])
		expect(odds(position(worlds), 'a4|d4-d7')).toEqual([['move', 0.5], ['capture', 0.5]])
	})

	it('rolls for the whole game when a ghost attacks the last enemy king', () => {
		const s = position([{ h1: '0:k', n8: '3:k', h8: '0:r' }, { h1: '0:k', n8: '3:k', h6: '0:r' }])
		expect(odds(s, 'h8-n8')).toEqual([['miss', 0.5], ['capture', 0.5]])
		expect(applyOutcome(V, s, 'h8-n8', 0).result).toBeNull()
		expect(applyOutcome(V, s, 'h8-n8', 1).result).toEqual({ winner: 0, reason: 'king' })
	})
})

describe('four-player chess: declaration, view and computer', () => {
	it('lets a resignation win for the players still in the game, or for the other team (R1)', () => {
		const ffa = position([{ h1: '0:k', g14: '2:k', n8: '3:k' }])
		expect(resignResult(V, ffa, 0)).toEqual({ winner: null, winners: [2, 3], reason: 'resign' })
		expect(resignResult(V, position([{ h1: '0:k', n8: '3:k' }]), 0)).toEqual({ winner: 3, reason: 'resign' })
		expect(resignResult(V, position([K4], 0, true), 1)).toEqual({ winner: null, winners: [0, 2], reason: 'resign' })
	})

	it('declares names, values, glyphs and a short rules card', () => {
		expect(V.category).toBe('boards')
		for (const [id, type] of Object.entries(V.types)) {
			expect(typeof type.name(), id).toBe('string')
			expect(type.glyph.sprite).toBe(id)
			expect(type.value).toBeGreaterThan(0)
		}
		expect(V.sides.map((s) => s.name())).toEqual(['Red', 'Blue', 'Yellow', 'Green'])
		const rules = V.rules()
		expect(rules.length).toBeGreaterThanOrEqual(3)
		expect(rules.length).toBeLessThanOrEqual(8)
		// the classic "your king cannot escape" is off here, and the budget is not the shared card's 8
		expect(rules.join(' ')).toMatch(/A king that cannot escape does not lose at once/)
		expect(rules.join(' ')).toMatch(/budget is not 8 here/)
		expect(rules.join(' ')).not.toMatch(/checkmate/)
		// two lone kings next to each other are no draw: the player to move takes the other king and wins (T11)
		expect(rules.join(' ')).toMatch(/two lone kings that are not next to each other\.$/)
	})

	it('values captures fully with fewer players and never wants to be out', () => {
		const two = (extra) => evaluateState(V, position([{ h1: '0:k', n8: '3:k', ...extra }]), 0)
		expect(two({}) - two({ d8: '3:q' })).toBeCloseTo(1000)
		const four = (extra) => evaluateState(V, position([{ ...K4, ...extra }]), 0)
		expect(four({}) - four({ d8: '3:q' })).toBeCloseTo(1000 / 3)
		expect(V.evaluate(position([{ a7: '1:k', g14: '2:k', n8: '3:k' }]).worlds[0].b, 0)).toBe(-10000)
		// Teams: the partner's material counts as the own
		const teams = (extra) => evaluateState(V, position([{ ...K4, ...extra }], 0, true), 0)
		expect(teams({ d8: '2:q' }) - teams({})).toBeCloseTo(1000)
		expect(teams({}) - teams({ d8: '3:q' })).toBeCloseTo(1000)
	})

	it('turns the board so that every player sees its king at the bottom, queen on its left', () => {
		const { width: W, height: H, zoomable } = V.topology.layout
		expect([W, H, zoomable]).toEqual([14, 14, true])
		// the rotation of VariantBoard.vue
		const rot = (r, x, y) => ({ 0: [x, y], 90: [H - y, x], 180: [W - x, H - y], 270: [y, W - x] })[r]
		const centre = (name) => {
			const c = V.topology.cells[sq(name)]
			return [c.x + c.w / 2, c.y + c.h / 2]
		}
		const cases = [['h1', 'g1'], ['a7', 'a8'], ['g14', 'h14'], ['n8', 'n7']]
		cases.forEach(([king, queen], side) => {
			const r = V.sides[side].rotate
			const [kx, ky] = rot(r, ...centre(king))
			const [qx, qy] = rot(r, ...centre(queen))
			expect([ky, qy], LETTERS[side]).toEqual([H - 0.5, H - 0.5])
			expect(kx - qx, LETTERS[side]).toBe(1)
		})
	})

	it('writes the file letters in one row under the board, clear of the rank numbers', () => {
		const labels = V.topology.layout.labels
		const letters = labels.filter((l) => /^[a-n]$/.test(l.text))
		const numbers = labels.filter((l) => /^\d+$/.test(l.text))
		expect(letters.map((l) => l.text).join('')).toBe('abcdefghijklmn')
		expect(letters.every((l) => l.y === 14.32)).toBe(true)
		// the numbers hug the cross: ranks 1-3 and 12-14 beside the arm, the others at the left edge
		const arm = [2.7, 2.7, 2.7]
		expect(numbers.map((l) => l.x)).toEqual([...arm, ...new Array(8).fill(-0.3), ...arm])
		// "c" and "3" once met in the inner corner and read as "c3", a square that does not exist
		for (let i = 0; i < labels.length; i++) {
			for (let j = i + 1; j < labels.length; j++) {
				const d = Math.hypot(labels[i].x - labels[j].x, labels[i].y - labels[j].y)
				expect(d, labels[i].text + ' ' + labels[j].text).toBeGreaterThan(0.8)
			}
		}
	})

	it('records the side that played the last ply in every world, for the computer', () => {
		expect(newGame(V).worlds[0].b.x.mover).toBe(3)
		const worlds = []
		for (const q of ['d4', 'j4']) {
			for (const n of ['c6', 'd8']) {
				worlds.push({ ...K4, b8: '1:p', [q]: '0:q', [n]: '1:n' })
			}
		}
		const s = position(worlds)
		// a missed capture, a capture, a link, a split and a Measure
		for (const next of [
			applyOutcome(V, s, 'd4-a7', 0),
			applyOutcome(V, s, 'd4-a7', 1),
			play(V, s, 'd4-d7'),
			play(V, position([K4, { ...K4, e1: '0:n' }]), 'h1-h2'),
		]) {
			expect(next.worlds.map(({ b }) => b.x.mover)).toEqual(next.worlds.map(() => 0))
		}
		const measured = position([{ ...K4, c6: '1:n' }, { ...K4, d8: '1:n' }], 1)
		for (let i = 0; i < 2; i++) {
			expect(applyOutcome(V, measured, '?c6', i).worlds.every(({ b }) => b.x.mover === 1)).toBe(true)
		}
		const split = play(V, newGame(V), 'e1-d3|f3')
		expect(split.worlds.map(({ b }) => b.x.mover)).toEqual([0, 0])
	})

	it('fears a king capture only from the players who move before the king\'s player again', () => {
		// Red's king on h1: a queen on h5 attacks it, on d8 it does not
		const red = (mover, teams = false) => {
			const queen = teams ? '3:q' : '2:q'
			return redTerms({ ...K4, h5: queen }, mover, teams) - redTerms({ ...K4, d8: queen }, mover, teams)
		}
		// free for all (Yellow's queen): a captured king takes the army (here the king, 400) with it
		expect(red(0)).toBe(-10400)
		expect(red(1)).toBe(-10400)
		// Yellow moves after Red, and Red may step away first
		expect(red(2)).toBe(0)
		expect(red(3)).toBe(0)
		// Teams (Green's queen): a captured king loses the game; nothing to fear once Red is to move
		expect(red(2, true)).toBe(-20000)
		expect(red(3, true)).toBe(0)
		// the partner's king too: Blue's queen on g10 attacks Yellow's king, and Blue moves before Yellow
		const partner = (mover) => redTerms({ ...K4, g10: '1:q' }, mover, true)
			- redTerms({ ...K4, b10: '1:q' }, mover, true)
		expect(partner(0)).toBe(-20000)
		expect(partner(1)).toBe(0)
		// and the other way round: a king that Red can capture now is as good as out
		expect(redTerms({ ...K4, d7: '0:q' }, 3) - redTerms({ ...K4, d7: '0:q' }, 0)).toBe(4000)
		// Teams, Yellow to move: Yellow's queen takes Blue's king before Green's queen can take Red's
		const race = (yellow) => redTerms({ ...K4, h5: '3:q', [yellow]: '2:q' }, 1, true)
		expect(race('d7') - race('e14')).toBe(40000)
	})

	it('blocks a real threat in Teams instead of fearing a player who moves after it', async () => {
		// hard self-play once split here (b7-a8|i14) and lost the king to Red's queen at a 50 % roll
		const moves = [
			'd2-d4 b11-d11 k13-k11 m4-k4 e2-e4 b10-d10 j13-j11 m5-k5 f2-f4 b9-d9',
			'i13-i11 m6-k6 g2-g4 b8-d8 h13-h11 k6-j6 f1-m8 a9-f4 i14-d9 n7-m8',
			'i2-i4 f4-h2 d9-b7 n6-j2 g1-h2 a8-b7 g13-g11 j2-k1 h2-a9',
		].join(' ').split(' ')
		let s = newGame(V, { mode: 'teams' })
		for (const code of moves) {
			s = play(V, s, code)
		}
		expect(s.turn).toBe(1)
		for (const L of LEVELS) {
			for (const seed of [1, 2]) {
				const code = await chooseMove(V, s, { level: L.id, rng: seededRng(seed), now: workClock() })
				expect(code, L.id).toBe('b7-a8')
			}
		}
	})

	it('takes a free king in free for all, even the king of a weak player', async () => {
		// the whole start position, but Blue has only its king left and Red's queen stands on d7
		const s = fromStart((b) => {
			for (let id = 0; id < b.sq.length; id++) {
				if (b.sd[id] === 1 && b.ty[id] !== 'k') {
					placePiece(b, id, OFF)
				} else if (b.sd[id] === 0 && b.ty[id] === 'q') {
					placePiece(b, id, sq('d7'))
				}
			}
		})
		// taking the king is worth more than any other move, although the average of the enemies left rises
		const value = (code) => evaluateState(V, play(V, s, code), 0)
		const others = legalMoves(V, s).filter((m) => m.type === 'move' && m.code !== 'd7-a7')
		expect(others.length).toBeGreaterThan(20)
		expect(value('d7-a7')).toBeGreaterThan(Math.max(...others.map((m) => value(m.code))))
		const bare = position([{ ...K4, d7: '0:q', h5: '0:p' }], 0, false, { mover: 3 })
		for (const state of [s, bare]) {
			for (const L of LEVELS) {
				for (const seed of [1, 2]) {
					const code = await chooseMove(V, state, { level: L.id, rng: seededRng(seed), now: workClock() })
					expect(code, L.id).toBe('d7-a7')
				}
			}
		}
	})

	it('converts a won endgame instead of shuffling into the quiet-move draw', async () => {
		const two = position([{ h1: '0:k', f6: '0:q', e5: '0:r', j9: '3:k' }], 0, false, { mover: 3 })
		const three = position([{ h1: '0:k', f6: '0:q', e5: '0:r', b7: '1:k', j9: '3:k' }], 0, false, { mover: 3 })
		for (const [s, level] of [[two, 'hard'], [two, 'normal'], [three, 'hard']]) {
			const end = await playOut(s, level, 100, 1)
			expect(end.result, level).toEqual({ winner: 0, reason: 'king' })
		}
		// it never leaves an undefended piece next to a lone king that moves before it
		const rook = (at, mover) => redTerms({ h1: '0:k', e4: '0:q', [at]: '0:r', k11: '3:k' }, mover)
		expect(rook('j11', 0)).toBeLessThan(rook('j5', 0))
		expect(rook('j11', 3)).toBeGreaterThan(rook('j5', 3))
	})

	it('finds a legal move from the start at every level within its time budget', async () => {
		for (const m of ['ffa', 'teams']) {
			const s = newGame(V, { mode: m })
			for (const L of LEVELS) {
				const elapsed = stopwatch()
				const code = await chooseMove(V, s, { level: L.id, rng: seededRng(3) })
				expect(isLegal(V, s, code), m + ' ' + L.id + ' ' + code).toBe(true)
				expect(elapsed()).toBeLessThan(L.timeMs + 500)
			}
		}
	})
})
