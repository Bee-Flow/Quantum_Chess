/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The engine of multiverse chess (handoff/research/multiverse-final.md sections 2 to 8): the setups and options, the
 * geometry and names, the vectors of every piece along every axis, the move keys, branches, jumps, the present, Submit,
 * the stuck test and the quantum rules on top of the multiverse (links through time, a Missed branch, time splits,
 * measurements, merges onto a king in the past).
 */

import { describe, expect, it } from 'vitest'
import {
	applyOutcome,
	branches,
	budgetInfo,
	isLegal,
	legalMoves,
	newGame,
	ordinaryMoves,
	outcomes,
	pieceLocations,
	royalDanger,
	splitsFrom,
	splitTargets,
	squareView,
	T,
} from '../../../src/variants/core/quantum.js'
import V from '../../../src/variants/multiverse.js'
import { allowQuantum, applyMiss, solidExtra, stuck, unifyWorlds } from '../../../src/variants/multiverse/engine.js'
import { SUBMIT } from '../../../src/variants/multiverse/moves.js'
import {
	BISHOP,
	DRAGON,
	KNIGHT,
	PRINCESS,
	QUEEN,
	ROOK,
	UNICORN,
} from '../../../src/variants/multiverse/pieces.js'
import { buildWorld, fenPieces, place, SETUP_ORDER, SETUPS } from '../../../src/variants/multiverse/setup.js'
import {
	canSubmit,
	LAB,
	lOf,
	mandatory,
	MINUS,
	skeleton,
	sqOf,
	SQUARES,
	uOf,
} from '../../../src/variants/multiverse/skeleton.js'
import { lastMoveMarks } from '../../../src/variants/multiverse/texts.js'

/**
 * A square by its static name.
 *
 * @param {string} name square name, e.g. `(0)c3` or `(0)~3c3`
 * @return {number}
 */
function sq(name) {
	const s = V.topology.byName(name)
	if (s < 0) {
		throw new Error('unknown square ' + name)
	}
	return s
}

/**
 * A new game.
 *
 * @param {string} [setup] setup id
 * @param {object} [opts] more option values
 * @return {object}
 */
function start(setup = 'small', opts = {}) {
	return newGame(V, { setup, timelines: '3', reach: 'auto', view: 'white', ...opts })
}

/**
 * A state from worlds with relative weights.
 *
 * @param {Array<[object, number]>} worlds worlds and weights
 * @return {object}
 */
function stateOf(worlds) {
	const total = worlds.reduce((a, [, w]) => a + w, 0)
	let rest = T
	const list = worlds.map(([b, rel], i) => {
		const w = i === worlds.length - 1 ? rest : Math.floor((T * rel) / total)
		rest -= w
		return { b, w }
	})
	const turn = list[0].b.x.s
	return { v: 1, variant: 'multiverse', options: {}, worlds: list, turn, ply: 0, quiet: 0, result: null, history: [] }
}

/**
 * A one-world state from `buildWorld` options.
 *
 * @param {object} spec the world (see `buildWorld`)
 * @return {object}
 */
function one(spec) {
	return stateOf([[buildWorld(spec), 1]])
}

/**
 * Play codes one after the other; a code may be `[code, outcomeIndex]`. The skeleton must stay equal in every world.
 *
 * @param {object} s state
 * @param {Array<string|Array>} codes codes
 * @return {object}
 */
function run(s, codes) {
	for (const c of codes) {
		const [code, i] = Array.isArray(c) ? c : [c, 0]
		expect(branches(V, s, code), 'legal: ' + code).not.toBeNull()
		s = applyOutcome(V, s, code, i)
		expect(new Set(s.worlds.map(({ b }) => solidExtra(b))).size).toBe(1)
		expect(s.turn).toBe(s.worlds[0].b.x.s)
	}
	return s
}

/**
 * The ordinary move keys of the side to move.
 *
 * @param {object} s state
 * @return {string[]}
 */
function keys(s) {
	return ordinaryMoves(V, s).map((m) => m.code)
}

/**
 * The outcomes of a code as `key percent [certain]`.
 *
 * @param {object} s state
 * @param {string} code code
 * @return {string[]}
 */
function oc(s, code) {
	return (outcomes(V, s, code) ?? []).map((o) => o.key + ' ' + Math.round(o.p * 100) + (o.rolled ? '' : ' certain'))
}

/**
 * Where a piece stands, as `name percent`.
 *
 * @param {object} s state
 * @param {number} id piece id
 * @return {string[]}
 */
function loc(s, id) {
	return pieceLocations(s, id).map((l) => (l.sq >= 0 ? V.topology.names[l.sq] : 'off') + ' ' + Math.round(l.p * 100))
}

/**
 * The lines of the must-move rows.
 *
 * @param {object} s state
 * @return {number[]}
 */
function mustLines(s) {
	const x = s.worlds[0].b.x
	return mandatory(x).map((u) => lOf(u, x.md))
}

/**
 * Give the piece on a square another id in a world under construction (the same piece in several worlds: a ghost).
 *
 * @param {object} w world
 * @param {number} q square
 * @param {number} id the id
 */
function setId(w, q, id) {
	const old = w.board[q]
	const [type, side] = [w.ty[old], w.sd[old]]
	w.sq[old] = -1
	w.ty[old] = ''
	w.sd[old] = 0
	place(w, id, q, type, side)
}

describe('setups and options', () => {
	for (const id of SETUP_ORDER) {
		it('starts ' + id + ' with its position, White to move on every starting timeline', () => {
			const S = SETUPS[id]
			const s = start(id)
			const b = s.worlds[0].b
			const x = b.x
			expect([x.n, x.md, x.m, x.s, x.t, x.c, x.k]).toEqual([S.n, S.md, 3, 0, 0, [0, 0], -1])
			expect(x.h).toBe(S.n <= 5 ? 4 : 8)
			expect(Object.keys(x)).toEqual(['n', 'h', 'm', 'md', 's', 't', 'c', 'tl', 'ep', 'ord', 'nr', 'k'])
			expect(x.nr).toBe(S.rows.length)
			for (const [l, fen] of S.rows) {
				const u = uOf(l, S.md)
				expect(x.tl[u]).toEqual([S.turnZero ? 1 : 2, 2, null, null])
				const pieces = fenPieces(fen, S.n, true)
				const at = (slot) => pieces
					.map((p) => squareView(s, sqOf(u, slot, p.x, p.y)).map((o) => o.side + o.type))
				expect(at(0)).toEqual(pieces.map((p) => [p.side + p.type]))
				if (S.turnZero) {
					expect(at(2)).toEqual(pieces.map((p) => [p.side + 'h' + p.type]))
				}
			}
			const count = S.rows.reduce((a, [, fen]) => a + fenPieces(fen, S.n).length, 0)
			expect(b.sq.filter((q) => q >= 0).length).toBe(count * (S.turnZero ? 2 : 1))
			expect(mustLines(s).sort()).toEqual(S.rows.map(([l]) => l).sort())
			expect(isLegal(V, s, SUBMIT)).toBe(false)
			expect(keys(s).length).toBeGreaterThan(0)
			expect(budgetInfo(V, s, 0).limit).toBe(8)
		})
	}

	it('reads the timelines and the travel reach', () => {
		expect(start('small', { timelines: '1' }).worlds[0].b.x.m).toBe(1)
		expect(start('small', { timelines: '2' }).worlds[0].b.x.m).toBe(2)
		expect(start('small', { reach: '4' }).worlds[0].b.x.h).toBe(8)
		expect(start('standard', { reach: '2' }).worlds[0].b.x.h).toBe(4)
		expect(start('standard').worlds[0].b.x.h).toBe(8)
		expect(V.options.map((o) => o.id)).toEqual(['setup', 'timelines', 'reach', 'view'])
		expect(V.options[0].values.map((v) => v.id)).toEqual(SETUP_ORDER)
		expect(V.options[0].default).toBe('small')
		expect(SETUP_ORDER.length).toBe(21)
		expect(V.options[0].describe('justunicorns')).toContain('5 × 5')
		// the plain label, the official name and the size, then the pieces
		expect(V.options[0].describe('defended'))
			.toBe('Defended pawn: queen and knight swapped (Standard – Defended Pawn, 8 × 8) The queen and a knight swap places.')
		expect(V.options[0].describe('marauders')).toContain('Brawns (W) are pawns that also capture sideways')
		expect(V.options[2].values[0].label()).toBe('Automatic (2 turns on boards up to 5 × 5, 4 on larger ones)')
		const rules = V.rules()
		expect(rules).toHaveLength(10)
		// the pieces with their letters, active timelines, the solid pieces, the notation, royal queens
		expect(rules[2]).toContain('the unicorn (U) three')
		expect(rules[2]).toContain('the knight two along one and one along another')
		expect(rules[3]).toContain('a brawn also captures sideways')
		expect(rules[4]).toContain('Your n-th new timeline is active')
		expect(rules[5]).toContain('Kings, royal queens, common kings, pawns and brawns are solid')
		expect(rules[6]).toContain('a Measure is your move on the board of the part you measure')
		expect(rules[8]).toContain('a king or royal queen of yours can be taken for certain')
		expect(rules[9]).toContain('(0T2)Nc3>>(0T1)a3 opens a new one')
		expect(rules[1]).toContain('Each move is played at once (and rolled if its result is uncertain)')
	})

	it('declares the classic end rules and limits of the final spec', () => {
		expect([V.escapeRule, V.bareKingsDraw, V.drawsWait, V.flipBoard]).toEqual([false, false, true, false])
		expect([V.maxPly, V.quietPlies, V.specialMoves]).toEqual([1200, 300, true])
		expect(V.sides.map((s) => s.rotate)).toEqual([0, 0])
		expect([...V.royalTypes].filter((t) => t[0] !== 'h').sort()).toEqual(['k', 'k0', 'y'])
		expect([...V.solidTypes].filter((t) => t[0] !== 'h').sort())
			.toEqual(['c', 'k', 'k0', 'p', 'p0', 'w', 'w0', 'y'])
		expect(V.types.hq).toMatchObject({ royal: false, splittable: false, value: 0 })
		expect(V.types.hk0).toMatchObject({ royal: true, solid: true, splittable: false })
	})
})

describe('geometry, names and keys', () => {
	it('maps lines to fixed rows and labels without wrapping the even start', () => {
		expect(SQUARES).toBe(6336)
		const minus = (k) => MINUS + k
		expect(LAB).toEqual(['0', minus(1), '+1', minus(2), '+2', minus(3), '+3', minus(4), '+4', minus(0), '+0'])
		for (const md of [0, 1, 2]) {
			for (let l = -4; l <= 4; l++) {
				const u = uOf(l, md)
				if (u >= 0) {
					expect(lOf(u, md)).toBe(l)
				}
			}
		}
		expect([uOf(-1, 1), uOf(0, 1), uOf(4, 1), uOf(-5, 1), uOf(4, 0)]).toEqual([9, 10, -1, -1, -1])
		expect(V.topology.names[sq('(+1)c3')]).toBe('(+1)c3')
		expect(V.topology.names.every((name) => !/[-|?@=\s]/.test(name))).toBe(true)
		expect(sq('(0)~3c3') - sq('(0)c3')).toBe(3 * 64)
	})

	it('writes physical, jump, branch and promotion keys with the absolute board', () => {
		const s = one({ c: [1, 0], rows: {
			0: { st: 2, en: 10, boards: { 10: '4k/1P3/2N2/5/K4' } },
			1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/5/5/5/K4' } },
		} })
		const all = keys(s)
		expect(all).toContain('(0T5)c3-e4')
		expect(all).toContain('(0T5)c3>(+1T5)a3')
		expect(all).toContain('(0T5)c3>>(0T4)a3')
		expect(all).toContain('(0T5)b4-b5=Q')
		for (const k of all) {
			expect(k.includes('|') || k.startsWith('?')).toBe(false)
			expect(k.split('-').length).toBeLessThanOrEqual(2)
		}
		const even = keys(start('twotimelines'))
		expect(even).toContain('(' + MINUS + '0T1)b1>(+0T1)b3')
		expect(even.length).toBe(44)
	})
})

describe('piece vectors along every axis', () => {
	it('has the official number of vectors per piece', () => {
		expect([ROOK, BISHOP, UNICORN, DRAGON, PRINCESS, QUEEN, KNIGHT].map((v) => v.length))
			.toEqual([7, 20, 28, 16, 27, 71, 40])
		// no vector goes forward in time on its own line: it would never find a board
		expect(QUEEN.concat(KNIGHT).some((v) => v[3] === 0 && v[2] > 0)).toBe(false)
	})

	/**
	 * The moves of a lone White piece on (0T5)c3, counted as [on its board, jumps, branches], with L+1 [7, 10] next
	 * to L0 [2, 10] and a travel reach of 2 turns.
	 *
	 * @param {string} letter the piece in FEN
	 * @return {number[]}
	 */
	const counts = (letter) => {
		const s = one({ c: [1, 0], rows: {
			0: { st: 2, en: 10, boards: { 10: '5/5/2' + letter + '2/5/5' } },
			1: { st: 7, en: 10, parent: [0, 6], boards: {} },
		} })
		const list = ordinaryMoves(V, s).filter((m) => m.code.startsWith('(0T5)c3'))
		return ['normal', 'hop', 'branch'].map((kind) => list.filter((m) => m.kind === kind).length)
	}

	it('rook: one axis (files, ranks, one turn back per step, one line across)', () => {
		expect(counts('R')).toEqual([8, 1, 2])
		const s = one({ rows: { 0: { st: 2, en: 10, boards: { 10: '5/5/2R2/5/5' } } } })
		expect(keys(s).filter((k) => k.includes('>')).sort()).toEqual(['(0T5)c3>>(0T3)c3', '(0T5)c3>>(0T4)c3'])
	})

	it('bishop: two axes at once, equally far', () => {
		expect(counts('B')).toEqual([8, 4, 9])
	})

	it('unicorn: three axes at once, never on its own board', () => {
		expect(counts('U')).toEqual([0, 4, 12])
	})

	it('dragon: all four axes at once', () => {
		expect(counts('D')).toEqual([0, 0, 4])
	})

	it('queen and princess: every direction of their parts', () => {
		expect(counts('Q')).toEqual([16, 9, 27])
		expect(counts('S')).toEqual([16, 5, 11])
	})

	it('king and common king: one step along one to four axes; knight: two and one', () => {
		expect(counts('K')).toEqual([8, 9, 18])
		expect(counts('C')).toEqual([8, 9, 18])
		expect(counts('N')).toEqual([8, 4, 8])
	})

	it('pawn: steps and doubles along the rank and the line, captures diagonally and through time', () => {
		const s = one({ c: [0, 1], rows: {
			0: { st: 2, en: 10, boards: { 10: '4k/5/5/2P*2/K4' } },
			'-1': { st: 8, en: 10, parent: [0, 7], boards: { 10: '4k/5/5/5/K4', 8: '4k/5/5/2n2/K4' } },
			'-2': { st: 10, en: 10, parent: [1, 9], boards: { 10: '4k/5/5/5/K4' } },
		} })
		expect(keys(s).filter((k) => k.startsWith('(0T5)c2')).sort()).toEqual([
			'(0T5)c2-c3',
			'(0T5)c2-c4',
			'(0T5)c2>(' + MINUS + '1T5)c2',
			'(0T5)c2>(' + MINUS + '2T5)c2',
			'(0T5)c2>>(' + MINUS + '1T4)c2',
		])
		expect(ordinaryMoves(V, s).find((m) => m.code === '(0T5)c2-c4').kind).toBe('double')
	})

	it('pawn: Black goes down and towards White\'s timelines; a capture across a line may go ahead in time', () => {
		// Black: forward rank −1 and forward line +1; the capture one line forward and one turn ahead is a jump
		const black = one({ s: 1, c: [1, 0], rows: {
			0: { st: 2, en: 11, boards: { 11: 'k4/2p*2/5/5/4K' } },
			1: { st: 9, en: 13, parent: [0, 8], boards: { 13: 'k4/2N2/5/5/4K' } },
		} })
		expect(keys(black).filter((k) => k.startsWith('(0T5)c4')).sort()).toEqual([
			'(0T5)c4-c2',
			'(0T5)c4-c3',
			'(0T5)c4>(+1T6)c4',
			'(0T5)c4>>(+1T5)c4',
		])
		const white = one({ c: [0, 1], rows: {
			0: { st: 2, en: 10, boards: { 10: '4k/5/5/2P2/K4' } },
			'-1': { st: 8, en: 12, parent: [0, 7], boards: { 12: '4k/5/5/2n2/K4' } },
		} })
		expect(keys(white).filter((k) => k.startsWith('(0T5)c2')).sort()).toEqual([
			'(0T5)c2-c3',
			'(0T5)c2>(' + MINUS + '1T6)c2',
			'(0T5)c2>>(' + MINUS + '1T5)c2',
		])
	})

	it('brawn: the pawn\'s moves plus sideways, rank and past captures across a line', () => {
		const s = one({ md: 2, rows: {
			'-1': { st: 2, en: 2, boards: { 2: '4k/5/2p2/1p1p1/K4' } },
			0: { st: 2, en: 2, boards: { 2: '4k/5/5/2W*2/K4' } },
			1: { st: 2, en: 2, boards: { 2: '4k/5/5/5/K4' } },
		} })
		expect(keys(s).filter((k) => k.startsWith('(0T1)c2')).sort()).toEqual([
			'(0T1)c2-c3',
			'(0T1)c2-c4',
			'(0T1)c2>(' + MINUS + '1T1)b2',
			'(0T1)c2>(' + MINUS + '1T1)c2',
			'(0T1)c2>(' + MINUS + '1T1)c3',
			'(0T1)c2>(' + MINUS + '1T1)d2',
		])
	})

	it('castling and en passant on one board', () => {
		let s = run(one({ rows: { 0: { st: 2, en: 10, boards: { 10: 'k4/5/5/5/K*3R*' } } } }), ['(0T5)a1-c1'])
		expect([squareView(s, sq('(0)c1'))[0].type, squareView(s, sq('(0)b1'))[0].type]).toEqual(['k', 'r'])
		s = run(one({ rows: { 0: { st: 2, en: 10, boards: { 10: '4k/3p*1/5/2P*2/K4' } } } }), ['(0T5)c2-c4'])
		expect(ordinaryMoves(V, s).find((m) => m.code === '(0T5)d4-c3').kind).toBe('ep')
		s = run(s, ['(0T5)d4-c3'])
		expect(squareView(s, sq('(0)c4'))).toEqual([])
		// 8 × 8, both sides and both colours; a piece between or a rook that moved takes the right away
		const castles = (fen, side = 0) => ordinaryMoves(V, one({ n: 8, h: 8, s: side, rows: {
			0: { st: 2, en: 10 + side, boards: { [10 + side]: fen } },
		} })).filter((m) => m.kind === 'castle').map((m) => m.code)
		expect(castles('r*3k*2r*/8/8/8/8/8/8/R*3K*2R*')).toEqual(['(0T5)e1-g1', '(0T5)e1-c1'])
		expect(castles('r*3k*2r*/8/8/8/8/8/8/R*3K*2R*', 1)).toEqual(['(0T5)e8-g8', '(0T5)e8-c8'])
		expect(castles('r*3k*2r*/8/8/8/8/8/8/R*N2K*2R*')).toEqual(['(0T5)e1-g1'])
		expect(castles('r*3k*2r*/8/8/8/8/8/8/R3K*2R')).toEqual([])
	})
})

describe('turns, branches, jumps and the present', () => {
	it('a move makes a board; a branch opens a timeline and moves the present back', () => {
		let s = run(start(), ['(0T1)d1-c3'])
		const x1 = s.worlds[0].b.x
		expect([s.turn, x1.tl[0], squareView(s, sq('(0)~3d1')).map((o) => o.type)])
			.toEqual([1, [2, 3, null, null], ['hn']])
		s = run(s, ['(0T1)a4-a3'])
		expect(keys(s).filter((k) => k.includes('>>')).sort())
			.toEqual(['(0T2)c3>>(0T1)a3', '(0T2)c3>>(0T1)c5', '(0T2)c3>>(0T1)e3'])
		const knight = s.worlds[0].b.board[sq('(0)c3')]
		s = run(s, ['(0T2)c3>>(0T1)a3'])
		const x = s.worlds[0].b.x
		expect([x.tl[0], x.tl[2], x.c, skeleton(x).present]).toEqual([[2, 5, null, null], [3, 3, 0, 2], [1, 0], 3])
		expect(loc(s, knight)).toEqual(['(+1)a3 100'])
		expect(squareView(s, sq('(+1)d1')).map((o) => o.type)).toEqual(['n'])
		expect([s.turn, mustLines(s), isLegal(V, s, SUBMIT)]).toEqual([1, [1], false])
		expect(s.history.at(-1).info).toEqual({
			rows: [2],
			arrows: [[0, 4, 2, 2, 2, 3, 0, 2]],
			back: 3,
			cells: [[0, 5, 2, 2], [2, 3, 0, 2]],
		})
	})

	it('optional boards and Submit; the turn passes by itself when no board is left', () => {
		let s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3', '(0T2)c3>>(0T1)a3', '(+1T1)e4-e3'])
		expect([s.turn, mustLines(s), isLegal(V, s, SUBMIT), canSubmit(s.worlds[0].b.x)]).toEqual([1, [], true, true])
		// White's knight on +1 could take the king on the past board (0T2) ○ a5: 5D check
		expect(royalDanger(V, s, 1)).toBe(1)
		expect(V.actions(s)[0].label).toBe('Submit turn (a king of yours can be taken: 100 %)')
		s = run(s, [SUBMIT])
		expect([s.turn, mustLines(s), s.worlds[0].b.x.t]).toEqual([0, [1], 0])
		expect(V.actions(s)[0].label).toBe('Submit turn (1 more board first)')
		s = run(s, ['(+1T2)b2-b3'])
		expect([s.turn, isLegal(V, s, SUBMIT)]).toEqual([1, false])
		expect(lastMoveMarks(s).map((q) => V.topology.names[q])).toEqual(['(+1)b2', '(+1)b3'])
	})

	it('one jump uses two boards', () => {
		let s = one({ c: [1, 0], rows: {
			0: { st: 2, en: 10, boards: { 10: '4k/5/R4/5/K4' } },
			1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/5/5/5/K4' } },
		} })
		expect(mustLines(s)).toEqual([0, 1])
		expect(oc(s, '(0T5)a3>(+1T5)a3')).toEqual(['move 100 certain'])
		s = run(s, ['(0T5)a3>(+1T5)a3'])
		expect([s.worlds[0].b.x.tl[0][1], s.worlds[0].b.x.tl[2][1], s.turn]).toEqual([11, 11, 1])
	})

	it('an inactive branch leaves the present; a reactivated timeline can bring it back to the mover', () => {
		let s = run(one({ c: [1, 0], rows: {
			0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/K3R', 8: '4k/5/5/5/K4' } },
			1: { st: 7, en: 10, parent: [0, 6], boards: { 10: '4k/5/5/5/K4' } },
		} }), ['(0T5)e1>>(0T4)e1'])
		const x = s.worlds[0].b.x
		expect([x.tl[4], skeleton(x).act(4), skeleton(x).present, isLegal(V, s, SUBMIT), mustLines(s)])
			.toEqual([[9, 9, 0, 8], false, 10, false, [1]])
		s = run(one({ s: 1, c: [2, 0], rows: {
			0: { st: 2, en: 11, boards: { 11: '4k/5/5/3r1/K4', 9: '4k/5/5/5/K4' } },
			1: { st: 9, en: 12, parent: [0, 8], boards: { 12: '4k/5/5/5/K4' } },
			2: { st: 7, en: 7, parent: [0, 6], boards: { 7: '4k/5/5/5/K4' } },
		} }), ['(0T5)d2>>(0T4)d2'])
		expect([skeleton(s.worlds[0].b.x).present, mustLines(s), isLegal(V, s, SUBMIT), s.turn])
			.toEqual([7, [2], false, 1])
	})

	it('an even start numbers and activates new timelines like a single one (−0 and +0 start)', () => {
		const row = (s) => {
			const x = s.worlds[0].b.x
			return x.tl
				.map((e, u) => (e ? LAB[u] + ' ' + e.join(',') + (skeleton(x).act(u) ? '' : ' inactive') : null))
				.filter(Boolean)
		}
		let s = run(start('twotimelines', { reach: '4' }), [
			'(' + MINUS + '0T1)b1-c3',
			'(+0T1)b1-c3',
			'(' + MINUS + '0T1)g8-f6',
			'(+0T1)g8-f6',
			'(' + MINUS + '0T2)c3>>(' + MINUS + '0T1)e3',
		])
		// White's first new line is +1 below +0, active; it moves the present back to T1 ●
		expect([row(s), skeleton(s.worlds[0].b.x).present, isLegal(V, s, SUBMIT)])
			.toEqual([['+1 3,3,9,2', MINUS + '0 2,5,,', '+0 2,4,,'], 3, true])
		// White's second one is inactive while Black has opened none: the turn passes when no board is left
		s = run(s, ['(+0T2)g1>>(+0T1)g3'])
		expect([row(s)[1], s.turn, mustLines(s)]).toEqual(['+2 3,3,10,2 inactive', 1, [1]])
		// Black's first new line is −1 above −0; it reactivates +2, whose latest board is Black's: it must move there
		s = run(s, ['(+1T1)b8>>(+0T1)b6'])
		expect([row(s)[0], row(s)[2], s.worlds[0].b.x.c, mustLines(s), s.turn])
			.toEqual([MINUS + '1 4,4,10,3', '+2 3,3,10,2', [2, 1], [2], 1])
	})

	it('the cap: only a royal capture travels back, and it opens no timeline', () => {
		let s = one({ m: 1, c: [1, 0], rows: {
			0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/K3R', 8: '4k/5/5/5/K4', 6: '5/5/5/5/K3k' } },
			1: { st: 7, en: 10, parent: [0, 6], boards: { 10: '4k/5/5/5/K4' } },
		} })
		expect(keys(s).filter((k) => k.includes('>>'))).toEqual(['(0T5)e1>>(0T3)e1'])
		expect(royalDanger(V, s, 1)).toBe(1)
		s = run(s, ['(0T5)e1>>(0T3)e1'])
		expect([s.result, s.worlds[0].b.x.c, s.worlds[0].b.x.tl.filter(Boolean).length])
			.toEqual([{ winner: 0, reason: 'king' }, [1, 0], 2])
	})
})

describe('a turn that cannot be finished', () => {
	it('stranding the own turn loses; the warning comes first', () => {
		let s = run(start('marauders'), ['(0T1)a1-a2'])
		expect(s.result).toBeNull()
		expect(V.moveWarning(s, '(+1T1)b2-b3')).toBe('After this move you cannot finish your turn: you lose')
		expect(V.moveWarning(s, '(+1T1)b1>(' + MINUS + '1T1)b1')).toBeNull()
		s = run(s, ['(+1T1)b2-b3'])
		expect(s.result).toEqual({ winner: 1, reason: 'stranded' })
		expect(legalMoves(V, s)).toEqual([])
	})

	it('at the start of a turn: checkmate when a king can be taken for certain, else stalemate', () => {
		const board = (l1) => one({ c: [1, 0], rows: {
			0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/5' } },
			1: { st: 9, en: 11, parent: [0, 8], boards: { 11: l1 } },
		} })
		const mate = board('4k/5/5/5/r3K')
		expect([mustLines(mate), stuck(V, mate), V.noMoves(mate)])
			.toEqual([[0], true, { winner: 1, reason: 'checkmate' }])
		expect(V.noMoves(board('4k/5/5/5/4K'))).toEqual({ winner: null, reason: 'stalemate' })
	})

	it('jumps that need the same board strand every order (the completion search)', () => {
		const w = { m: 1, s: 1, c: [1, 1], rows: {
			0: { st: 2, en: 9, boards: { 9: 'r3k/5/5/5/2K2' } },
			1: { st: 7, en: 9, parent: [0, 6], boards: { 9: '5/5/5/5/5' } },
			'-1': { st: 8, en: 9, parent: [0, 7], boards: { 9: '5/5/2w2/2P2/5' } },
		} }
		const s = one(w)
		expect([stuck(V, s), V.stateResult(s)]).toEqual([true, { winner: null, reason: 'stalemate' }])
		expect(V.stateResult(one({ ...w, t: 1 }))).toEqual({ winner: 0, reason: 'stranded' })
	})

	it('the search ignores the computer\'s pruned view', () => {
		const s = run(start('marauders'), ['(0T1)a1-a2'])
		const view = { ...s, worlds: s.worlds.map(({ b, w }) => ({ b: { ...b, x: { ...b.x, ai: 1 } }, w })) }
		expect(stuck(V, view)).toBe(false)
		expect(stuck(V, run(view, ['(+1T1)b2-b3']))).toBe(true)
	})
})

describe('quantum rules in the multiverse', () => {
	const s1 = () => run(start(), ['(0)d1-(0)c3|(0)e3', '(0T1)a4-a3'])

	it('a ghost travels: the timeline opens everywhere and the knight is linked over two timelines', () => {
		let s = s1()
		const knight = s.worlds.find(({ b }) => b.board[sq('(0)c3')] >= 0).b.board[sq('(0)c3')]
		expect(oc(s, '(0T2)c3>>(0T1)e3')).toEqual(['move 100 certain'])
		s = run(s, ['(0T2)c3>>(0T1)e3'])
		expect(loc(s, knight)).toEqual(['(0)e3 50', '(+1)e3 50'])
		expect(s.worlds.map(({ b }) => b.x.tl[2])).toEqual([[3, 3, 0, 2], [3, 3, 0, 2]])
		expect(oc(s, '(+1T1)e4-e3')).toEqual(['miss 50', 'move 50'])
		const missed = run(s, [['(+1T1)e4-e3', 0]])
		expect([missed.worlds.length, loc(missed, knight), missed.worlds[0].b.x.tl[2], missed.turn])
			.toEqual([1, ['(+1)e3 100'], [3, 4, 0, 2], 1])
	})

	it('a rolled Missed branch still opens its timeline, nobody arrives', () => {
		const s = s1()
		expect(oc(s, '(0T2)c3>>(0T1)c5')).toEqual(['miss 50', 'capture 50'])
		const miss = run(s, [['(0T2)c3>>(0T1)c5', 0]])
		expect([miss.worlds[0].b.x.tl[2], miss.worlds[0].b.x.c, squareView(miss, sq('(+1)c5')).map((o) => o.type)])
			.toEqual([[3, 3, 0, 2], [1, 0], ['b']])
		expect(miss.history.at(-1).info).toEqual({
			rows: [2],
			arrows: [],
			back: 3,
			cells: [[0, 5, 2, 2], [2, 3, 2, 4]],
		})
		expect(V.infoText(miss.history.at(-1))).toEqual([
			'Missed: timeline +1 opened anyway, nobody arrived',
			'The present moved back to T1\u00a0●',
		])
	})

	it('a time split lands both halves on one past board and opens one timeline', () => {
		const s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3'])
		const knight = s.worlds[0].b.board[sq('(0)c3')]
		expect(splitTargets(V, s, sq('(0)c3')).map((q) => V.topology.names[q]))
			.toEqual(['(0)d1', '(0)a4', '(0)~3a3', '(0)~3e3'])
		expect(isLegal(V, s, '(0)c3-(0)a4|(0)~3e3')).toBe(false)
		expect(splitsFrom(V, s, sq('(0)c3')).map((m) => m.code)).toEqual(['(0)c3-(0)d1|(0)a4', '(0)c3-(0)~3a3|(0)~3e3'])
		const ts = run(s, ['(0)c3-(0)~3a3|(0)~3e3'])
		expect([ts.worlds.length, loc(ts, knight), ts.worlds[0].b.x.tl[2], ts.worlds[0].b.x.c, ts.turn])
			.toEqual([2, ['(+1)a3 50', '(+1)e3 50'], [3, 3, 0, 2], [1, 0], 1])
		// the move list: a time split opens a timeline (>>), its second half on the same board as the first
		expect(V.codeText('(0)c3-(0)~3a3|(0)~3e3', ts.history.at(-1))).toBe('(0T2)c3>>(0T1)a3|e3')
		expect(V.codeText('(0)c3-(0)~3a3|(0)~3e3', ts.history.at(-1), { type: 'n' })).toBe('(0T2)Nc3>>(0T1)a3|e3')
		// the same move waiting for confirmation, written from the state before it
		expect(V.codeText('(0)c3-(0)~3a3|(0)~3e3', null, { type: 'n', state: s })).toBe('(0T2)Nc3>>(0T1)a3|e3')
		expect(V.codeText('(0)c3-(0)d1|(0)a4', null, { type: 'n', state: s })).toBe('(0T2)Nc3-d1|a4')
	})

	it('a measurement uses the board of the part, and only a part on a board the side may play', () => {
		let s = s1()
		expect(legalMoves(V, s).filter((m) => m.type === 'measure').map((m) => m.code)).toEqual(['?(0)c3', '?(0)e3'])
		const m = run(s, [['?(0)c3', 0]])
		expect([m.worlds.length, m.worlds[0].b.x.tl[0][1], m.turn]).toEqual([1, 5, 1])
		s = run(s, ['(0T2)c3>>(0T1)e3', '(+1T1)b4-b3', SUBMIT])
		expect([s.turn, mustLines(s), isLegal(V, s, '?(0)e3'), isLegal(V, s, '?(+1)e3')]).toEqual([0, [1], false, true])
		expect(legalMoves(V, s).filter((x) => x.type === 'merge')).toEqual([])
	})

	it('a merge onto a king in the past opens no timeline in any outcome', () => {
		const mk = (latest) => buildWorld({
			rows: { 0: { st: 2, en: 10, boards: { 10: latest, 6: '4k/5/5/5/K1k2' } } },
		})
		const A = mk('4k/5/5/5/KN3')
		const B = mk('4k/5/5/5/K2N1')
		const C = mk('4k/5/5/5/K4')
		setId(B, sq('(0)d1'), A.board[sq('(0)b1')])
		const s = stateOf([[C, 2], [A, 1], [B, 1]])
		const code = '(0)b1|(0)d1-(0)~3c1'
		expect(oc(s, code)).toEqual(['miss 50', 'capture 50'])
		const miss = run(s, [[code, 0]])
		const x = miss.worlds[0].b.x
		expect([miss.result, x.c, x.tl.filter(Boolean).length, x.tl[0][1]]).toEqual([null, [0, 0], 1, 11])
		expect(run(s, [[code, 1]]).result).toEqual({ winner: 0, reason: 'king' })
	})

	it('allowQuantum keeps splits and merges on one board and measurements on playable boards', () => {
		const s = s1()
		const split = (a, b) => allowQuantum(s, { type: 'split', from: [sq('(0)c3')], to: [sq(a), sq(b)] })
		expect([split('(0)a4', '(0)d1'), split('(0)~3a3', '(0)~3e3'), split('(0)a4', '(0)~3e3')])
			.toEqual([true, true, false])
		expect(allowQuantum(s, { type: 'merge', from: [sq('(0)c3'), sq('(+1)c3')], to: [] })).toBe(false)
		expect(allowQuantum(s, { type: 'merge', from: [sq('(0)c3'), sq('(0)e3')], to: [sq('(0)~3c1')] })).toBe(true)
		expect(allowQuantum(s, { type: 'measure', from: [sq('(0)~3c3')], to: [] })).toBe(false)
	})

	it('idle worlds build the same boards, and castling rights need the same rook square everywhere', () => {
		const s = s1()
		// the world where the knight stands on e3: there the branch from c3 does not happen
		const w = s.worlds.find(({ b }) => b.board[sq('(0)e3')] >= 0).b
		const other = s.worlds.find(({ b }) => b !== w).b
		const gen = V.generate(other, 0).find((m) => m.key === '(0T2)c3>>(0T1)c5')
		const idle = applyMiss(w, { type: 'move', code: gen.key, key: gen.key, sample: gen }, 0, { hit: false })
		expect(idle).not.toBe(w)
		expect([idle.x.tl[2], idle.x.tl[0][1], idle.x.c, w.x.tl[2]]).toEqual([[3, 3, 0, 2], 5, [1, 0], null])
		const rook = buildWorld({ rows: { 0: { st: 2, en: 10, boards: { 10: 'k4/5/5/5/K*3R*' } } } })
		const moved = buildWorld({ rows: { 0: { st: 2, en: 10, boards: { 10: 'k4/5/5/4R*/K*4' } } } })
		const id = rook.board[sq('(0)e1')]
		setId(moved, sq('(0)e2'), id)
		const same = [rook, rook]
		expect(unifyWorlds(same)).toBe(same)
		const out = unifyWorlds([rook, moved])
		expect(out.map((b) => b.ty[id])).toEqual(['r', 'r'])
	})
})
