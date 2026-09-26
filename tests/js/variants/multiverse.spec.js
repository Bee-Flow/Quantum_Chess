/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The test scenarios of multiverse chess (handoff/research/multiverse-final.md section 10, with the expectations of its
 * section 15 "Review notes"), each under its number and name from the spec: the structure and classical rules (S),
 * the quantum rules (Q), the limits and records (L, R), the drawing (U) and the computer (A).
 *
 * After every action the invariants of section 10 are checked: the weights sum to T, `sq` and `board` agree, every
 * world has the same skeleton (`solidExtra`) and the same solid pieces, no budget is over its limit, there are no
 * more worlds than the product of the budgets, the side to move is `x.s`, no roll ever settles the structure, the
 * mover never raises the opponent's budget, and every created row is reachable (White's rows start on a Black board
 * from a White parent board, Black's the other way round).
 *
 * The self-play scenario A3 plays 2 games per setup and level; the spec's 8 run with `QC_SLOW=1`:
 *
 *     QC_SLOW=1 npx vitest run tests/js/variants/multiverse.spec.js
 *
 * The app parts of U6 (no "Flip board" in the game view) and U7 (touch panning and pinch, Playwright) are app tests
 * of the later interface stage; here U6 checks the declaration.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { chooseMove } from '../../../src/variants/core/ai.js'
import {
	applyMove,
	branches,
	budget,
	budgetInfo,
	hasLegalMove,
	isLegal,
	legalMoves,
	MAX_WORLDS,
	newGame,
	ordinaryMoves,
	outcomes,
	pieceLocations,
	royalDanger,
	splitsFrom,
	splitTargets,
	squareView,
	stateAfter,
	T,
} from '../../../src/variants/core/quantum.js'
import V from '../../../src/variants/multiverse.js'
import { solidExtra, stuck } from '../../../src/variants/multiverse/engine.js'
import { buildWorld, place } from '../../../src/variants/multiverse/setup.js'
import { LAB, lOf, mandatory, ROWS, skeleton, uOf } from '../../../src/variants/multiverse/skeleton.js'
import { play, workClock } from './helpers.js'

/**
 * The games per setup and level of the self-play scenario A3: the spec's 8 with `QC_SLOW=1` (about a minute and a
 * half), else 2.
 */
const SEEDS = process.env.QC_SLOW ? 8 : 2

/** The warning of a move after which the mover cannot finish its own turn (section 6.14). */
const LOSE = 'After this move you cannot finish your turn: you lose'
/** The warning of a move after which the opponent cannot finish its turn and the game is drawn (section 6.14). */
const DRAW = 'After this move your opponent cannot finish their turn: the game ends in a draw'
/** The warning of a move after which the mover cannot finish its own turn in some outcomes of its roll only. */
const MAY_LOSE = 'Depending on the roll, you may not be able to finish your turn after this move: then you lose'
/** The warning of a move after which the opponent cannot finish its turn in some outcomes of its roll only. */
const MAY_DRAW
	= 'Depending on the roll, your opponent may not be able to finish their turn after this move: then the game ends in a draw'

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
 * The static name of a square.
 *
 * @param {number} s square
 * @return {string}
 */
function nameOf(s) {
	return V.topology.names[s]
}

/**
 * A new game (defaults: Small, cap 3, reach auto).
 *
 * @param {string} [setup] setup id
 * @param {object} [opts] more option values
 * @return {object}
 */
function start(setup = 'small', opts = {}) {
	return newGame(V, { setup, timelines: '3', reach: 'auto', view: 'white', ...opts })
}

/**
 * The extra state of the first world.
 *
 * @param {object} s state
 * @return {object}
 */
function X(s) {
	return s.worlds[0].b.x
}

/**
 * The row entry `[st, en, pu, pv]` of a line.
 *
 * @param {object} s state
 * @param {number} l internal line number
 * @return {Array|null}
 */
function row(s, l) {
	return X(s).tl[uOf(l, X(s).md)]
}

/**
 * The must-move boards of the side to move, as timeline labels (`0`, `+1`, `−1`, `−0`, `+0`).
 *
 * @param {object} s state
 * @return {string[]}
 */
function must(s) {
	return mandatory(X(s)).map((u) => LAB[u])
}

/**
 * The invariants of section 10 that hold in every state.
 *
 * @param {object} s state
 */
function invariants(s) {
	const bad = []
	if (s.worlds.length > MAX_WORLDS) {
		bad.push('too many worlds')
	}
	if (s.worlds.reduce((a, e) => a + e.w, 0) !== T) {
		bad.push('weights')
	}
	const b0 = s.worlds[0].b
	const skel = solidExtra(b0)
	const solid = (b) => b.board.map((id) => (id >= 0 && V.solidTypes.has(b.ty[id]) ? b.sd[id] + b.ty[id] : '')).join()
	const solid0 = solid(b0)
	for (const { b } of s.worlds) {
		if (b.sq.some((q, id) => q >= 0 && b.board[q] !== id) || b.board.some((id, q) => id >= 0 && b.sq[id] !== q)) {
			bad.push('sq and board differ')
		}
		if (solidExtra(b) !== skel) {
			bad.push('the skeleton differs')
		}
		if (solid(b) !== solid0) {
			bad.push('the solid pieces differ')
		}
	}
	for (const side of [0, 1]) {
		const info = budgetInfo(V, s, side)
		if (info.used > info.limit) {
			bad.push('budget of side ' + side)
		}
	}
	if (s.worlds.length > budget(s, 0) * budget(s, 1)) {
		bad.push('more worlds than the product of the budgets')
	}
	if (!s.result && s.turn !== b0.x.s) {
		bad.push('the side to move')
	}
	for (let u = 0; u < ROWS; u++) {
		const e = b0.x.tl[u]
		if (e && e[2] !== null) {
			// a row created by White (side 0) starts on a Black board and copies a White board; Black's the other way
			const c = lOf(u, b0.x.md) > 0 ? 0 : 1
			if ((e[0] & 1) !== 1 - c || (e[3] & 1) !== c) {
				bad.push('row ' + LAB[u] + ' cannot be reached')
			}
		}
	}
	expect(bad).toEqual([])
}

/**
 * A state from worlds with relative weights; its invariants are checked.
 *
 * @param {Array<[object, number]>} worlds worlds and relative weights
 * @param {number} [turn] side to move (default the first world's `x.s`)
 * @return {object}
 */
function stateOf(worlds, turn = worlds[0][0].x.s) {
	const total = worlds.reduce((a, [, w]) => a + w, 0)
	let rest = T
	const list = worlds.map(([b, rel], i) => {
		const w = i === worlds.length - 1 ? rest : Math.floor((T * rel) / total)
		rest -= w
		return { b, w }
	})
	const s = {
		v: 1,
		variant: 'multiverse',
		options: {},
		worlds: list,
		turn,
		ply: 0,
		quiet: 0,
		result: null,
		history: [],
	}
	invariants(s)
	return s
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
 * The id of the piece on a square of a world.
 *
 * @param {object} w world
 * @param {string} name square name
 * @return {number}
 */
function idAt(w, name) {
	return w.board[sq(name)]
}

/**
 * Give the piece on a square of a world another id (one ghost with the same id in several worlds).
 *
 * @param {object} w mutable world
 * @param {string} name square name
 * @param {number} id the new id
 */
function setId(w, name, id) {
	const q = sq(name)
	const old = w.board[q]
	const [type, side] = [w.ty[old], w.sd[old]]
	w.sq[old] = -1
	w.ty[old] = ''
	w.sd[old] = 0
	place(w, id, q, type, side)
}

/**
 * Play one action with a chosen outcome and check the invariants: no roll settles the structure, the mover does not
 * raise the opponent's budget, and the state after it keeps every invariant.
 *
 * @param {object} s state
 * @param {string} code move code
 * @param {number} [index] outcome index
 * @return {object}
 */
function step(s, code, index = 0) {
	const list = branches(V, s, code)
	expect(list, 'legal: ' + code).not.toBeNull()
	expect(list.flatMap((br) => br.notes ?? []).filter((note) => note.startsWith('solid:')), code).toEqual([])
	const next = play(V, s, code, index)
	expect(budget(next, 1 - s.turn), 'the opponent\'s budget after ' + code).toBeLessThanOrEqual(budget(s, 1 - s.turn))
	invariants(next)
	return next
}

/**
 * Play codes one after the other; a code may be `[code, outcomeIndex]`.
 *
 * @param {object} s state
 * @param {Array<string|Array>} codes codes
 * @return {object}
 */
function run(s, codes) {
	for (const c of codes) {
		const [code, i] = Array.isArray(c) ? c : [c, 0]
		s = step(s, code, i)
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
 * The outcomes of a code as `key percent`, with ` certain` when it is not rolled.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {string[]}
 */
function oc(s, code) {
	return (outcomes(V, s, code) ?? []).map((o) => o.key + ' ' + Math.round(o.p * 100) + (o.rolled ? '' : ' certain'))
}

/**
 * Where a piece may be, as `square percent` (`off` when it is not on the board).
 *
 * @param {object} s state
 * @param {number} id piece id
 * @return {string[]}
 */
function loc(s, id) {
	return pieceLocations(s, id).map((l) => (l.sq >= 0 ? nameOf(l.sq) : 'off') + ' ' + Math.round(l.p * 100))
}

/**
 * The types that may stand on a square.
 *
 * @param {object} s state
 * @param {string} name square name
 * @return {string[]}
 */
function typesOn(s, name) {
	return squareView(s, sq(name)).map((o) => o.type)
}

/**
 * The start position after White's split of the knight: `S1` of the spec.
 *
 * @return {object}
 */
function s1() {
	return run(start(), ['(0)d1-(0)c3|(0)e3'])
}

/**
 * The position of scenario S3 after its branch: Small after `(0T1)d1-c3`, `(0T1)a4-a3`, `(0T2)c3>>(0T1)a3`.
 *
 * @return {object}
 */
function afterBranch() {
	return run(start(), ['(0T1)d1-c3', '(0T1)a4-a3', '(0T2)c3>>(0T1)a3'])
}

/**
 * The position of scenario S9: a White knight can take the Black king on a past board.
 *
 * @return {object}
 */
function kingInThePast() {
	return one({
		s: 0,
		rows: { 0: { st: 6, en: 10, boards: { 10: '3k1/5/4N/5/K4', 8: '4k/5/5/5/K4', 6: '4k/5/5/5/K4' } } },
	})
}

/**
 * The two worlds of scenarios Q4, Q5 and Q19: a Black knight went c3 → b1 (A) or c3 → d1 (B) at T3 ●; White has its
 * king on e3 and a bishop on a1.
 *
 * @return {object}
 */
function pastShield() {
	const mk = (last) => buildWorld({
		s: 0,
		rows: {
			0: { st: 6, en: 10, boards: { 10: '3k1/5/4K/5/B' + last, 8: '4k/5/5/4K/B' + last, 6: '4k/5/2n2/4K/B4' } },
		},
	})
	const A = mk('n3')
	const B = mk('2n1')
	setId(B, '(0)d1', idAt(A, '(0)b1'))
	return stateOf([[A, 1], [B, 1]])
}

/** The moves of Timeline Marauders before scenario Q27b's stalemating move (no rolls). */
const Q27B = [
	'(0T1)c1>(−1T1)c1',
	'(+1T1)a1-a3',
	'(0T1)c5-c3',
	'(−1T1)b5>(+1T1)b5',
	'(+1T2)b1>(0T2)b1',
	'(−1T2)c1-c2',
	'(+1T2)b5-b2',
	'(−1T2)c5>>(0T1)b4',
	'(0T2)e5-e3',
	'(−2T2)a1-a2',
	'(+1T3)c1-b2',
	'(−1T3)c2-c3',
	'(0T3)b1-b4',
	'(−2T2)b4>>(−1T1)a4',
	'(−1T3)c4>(0T3)b4',
	'submit',
	'(−2T3)e1-e3',
	'(−1T4)c3-d4',
	'(−3T2)c1-c2',
]

/** The moves of Timeline Marauders of scenario A5 (no rolls). */
const A5 = [
	'(+1T1)a1-a3',
	'(0T1)a1>(−1T1)a1',
	'(−1T1)b4>(+1T1)b4',
	'(0T1)c5-c3',
	'(+1T2)a3-b4',
	'(0T2)e1-e3',
	'(−1T2)a1-a2',
	'(0T2)c3>(+1T2)c2',
	'(−1T2)c5>>(0T2)d5',
	'(+1T3)c1-c2',
	'(0T3)c1-c3',
	'(−2T3)e3-e4',
	'(−1T3)a2-a3',
	'(−2T3)d5-e4',
	'(0T3)a5-a3',
	'(−1T3)b5>(+1T3)b5',
	'(+1T4)c2>>(+1T3)c2',
	'submit',
]

/**
 * The position of scenario Q27c: under the cap, the jumps of Black's must-move boards need the same board.
 *
 * @param {number} t actions of the side to move in this turn
 * @return {object}
 */
function sameBoard(t) {
	return one({
		m: 1,
		s: 1,
		t,
		c: [1, 1],
		rows: {
			0: { st: 2, en: 9, boards: { 9: 'r3k/5/5/5/2K2' } },
			1: { st: 7, en: 9, parent: [0, 6], boards: { 9: '5/5/5/5/5' } },
			'-1': { st: 8, en: 9, parent: [0, 7], boards: { 9: '5/5/2w2/2P2/5' } },
		},
	})
}

/**
 * The state as the computer's view marks it (`x.ai` in every world), without pruning anything itself.
 *
 * @param {object} s state
 * @return {object}
 */
function markedView(s) {
	return { ...s, worlds: s.worlds.map(({ b, w }) => ({ b: { ...b, x: { ...b.x, ai: 1 } }, w })) }
}

describe('Multiverse chess: structure and classical rules', () => {
	it('S1 start', () => {
		const s = start()
		expect(keys(s)).toEqual([
			'(0T1)d1-e3',
			'(0T1)d1-c3',
			'(0T1)a2-a3',
			'(0T1)b2-b3',
			'(0T1)c2-c3',
			'(0T1)d2-d3',
			'(0T1)e2-e3',
		])
		expect(splitsFrom(V, s, sq('(0)d1')).map((m) => m.code)).toEqual(['(0)d1-(0)c3|(0)e3'])
		expect(isLegal(V, s, 'submit')).toBe(false)
		expect([X(s).h, X(s).m, budgetInfo(V, s, 0).limit]).toEqual([4, 3, 8])
		const standard = start('standard')
		expect([X(standard).h, keys(standard).length]).toEqual([8, 20])
	})

	it('S2 a move makes a board', () => {
		const s = run(start(), ['(0T1)d1-c3'])
		expect(s.turn).toBe(1)
		expect(X(s).tl[0]).toEqual([2, 3, null, null])
		expect(typesOn(s, '(0)~3d1')).toEqual(['hn'])
	})

	it('S3 branch', () => {
		let s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3'])
		expect(keys(s).filter((k) => k.includes('>>')).sort()).toEqual([
			'(0T2)c3>>(0T1)a3',
			'(0T2)c3>>(0T1)c5',
			'(0T2)c3>>(0T1)e3',
		])
		const knight = idAt(s.worlds[0].b, '(0)c3')
		s = run(s, ['(0T2)c3>>(0T1)a3'])
		expect(row(s, 0).slice(0, 2)).toEqual([2, 5])
		expect(row(s, 1)).toEqual([3, 3, 0, 2])
		expect(X(s).c).toEqual([1, 0])
		expect(loc(s, knight)).toEqual(['(+1)a3 100'])
		// its past self, copied with the board
		expect(typesOn(s, '(+1)d1')).toEqual(['n'])
		expect([s.turn, must(s), isLegal(V, s, 'submit')]).toEqual([1, ['+1'], false])
	})

	it('S4 optional boards and Submit', () => {
		let s = run(afterBranch(), ['(+1T1)e4-e3'])
		expect([s.turn, must(s), isLegal(V, s, 'submit')]).toEqual([1, [], true])
		s = run(s, ['submit'])
		expect([s.turn, must(s)]).toEqual([0, ['+1']])
		s = run(s, ['(+1T2)b2-b3'])
		// the turn passed by itself
		expect([s.turn, isLegal(V, s, 'submit')]).toEqual([1, false])
	})

	it('S5 one jump clears two boards', () => {
		let s = one({
			s: 0,
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: '4k/5/R4/5/K4' } },
				1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/5/5/5/K4' } },
			},
		})
		expect(must(s)).toEqual(['0', '+1'])
		expect(oc(s, '(0T5)a3>(+1T5)a3')).toEqual(['move 100 certain'])
		s = run(s, ['(0T5)a3>(+1T5)a3'])
		expect([row(s, 0)[1], row(s, 1)[1], s.turn]).toEqual([11, 11, 1])
	})

	it('S6 an active branch moves the present back', () => {
		let s = one({
			s: 0,
			c: [0, 1],
			rows: {
				0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/K3R', 8: '4k/5/5/5/K4' } },
				'-1': { st: 10, en: 10, parent: [0, 9], boards: { 10: '4k/5/5/5/K4' } },
			},
		})
		expect(must(s)).toEqual(['0', '−1'])
		s = run(s, ['(0T5)e1>>(0T4)e1'])
		expect(row(s, 1)).toEqual([9, 9, 0, 8])
		expect(skeleton(X(s)).present).toBe(9)
		expect([s.turn, isLegal(V, s, 'submit'), must(s)]).toEqual([0, true, []])
	})

	it('S7 an inactive branch does not', () => {
		let s = one({
			s: 0,
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/K3R', 8: '4k/5/5/5/K4' } },
				1: { st: 7, en: 10, parent: [0, 6], boards: { 10: '4k/5/5/5/K4' } },
			},
		})
		s = run(s, ['(0T5)e1>>(0T4)e1'])
		expect(row(s, 2)).toEqual([9, 9, 0, 8])
		expect(skeleton(X(s)).act(uOf(2, 0))).toBe(false)
		expect(skeleton(X(s)).present).toBe(10)
		expect([isLegal(V, s, 'submit'), must(s)]).toEqual([false, ['+1']])
	})

	it('S7b reactivating the opponent\'s timeline can bring the present back to your own board', () => {
		let s = one({
			s: 1,
			c: [2, 0],
			rows: {
				0: { st: 2, en: 11, boards: { 11: '4k/5/5/3r1/K4', 9: '4k/5/5/5/K4' } },
				1: { st: 9, en: 12, parent: [0, 8], boards: { 12: '4k/5/5/5/K4' } },
				2: { st: 7, en: 7, parent: [0, 6], boards: { 7: '4k/5/5/5/K4' } },
			},
		})
		expect([skeleton(X(s)).present, must(s), skeleton(X(s)).act(uOf(2, 0))]).toEqual([11, ['0'], false])
		s = run(s, ['(0T5)d2>>(0T4)d2'])
		expect(row(s, -1)).toEqual([10, 10, 0, 9])
		expect(skeleton(X(s)).act(uOf(2, 0))).toBe(true)
		expect(skeleton(X(s)).present).toBe(7)
		expect([must(s), isLegal(V, s, 'submit'), s.turn]).toEqual([['+2'], false, 1])
	})

	it('S8 the cap', () => {
		let s = one({
			m: 1,
			s: 0,
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/K3R', 8: '4k/5/5/5/K4', 6: '5/5/5/5/K3k' } },
				1: { st: 7, en: 10, parent: [0, 6], boards: { 10: '4k/5/5/5/K4' } },
			},
		})
		expect(keys(s).filter((k) => k.includes('>>'))).toEqual(['(0T5)e1>>(0T3)e1'])
		s = run(s, ['(0T5)e1>>(0T3)e1'])
		expect(s.result).toEqual({ winner: 0, reason: 'king' })
		expect(X(s).c).toEqual([1, 0])
		expect(X(s).tl.filter(Boolean).length).toBe(2)
	})

	it('S9 a king in the past', () => {
		const s = kingInThePast()
		expect(royalDanger(V, s, 1)).toBe(1)
		expect(oc(s, '(0T5)e3>>(0T4)e5')).toEqual(['capture 100 certain'])
		expect(run(s, ['(0T5)e3>>(0T4)e5']).result).toEqual({ winner: 0, reason: 'king' })
	})

	it('S10 the reach', () => {
		const rook = (h) => one({ h, s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/4R/5/K4' } } } })
		const back = (s) => keys(s).filter((k) => k.startsWith('(0T5)e3>>(0T'))
		expect(back(rook(4))).toEqual(['(0T5)e3>>(0T4)e3', '(0T5)e3>>(0T3)e3'])
		expect(back(rook(8))).toEqual(['(0T5)e3>>(0T4)e3', '(0T5)e3>>(0T3)e3', '(0T5)e3>>(0T2)e3', '(0T5)e3>>(0T1)e3'])
	})

	it('S11 own past self blocks', () => {
		const s = one({
			s: 0,
			rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/R3K', 8: '4k/5/5/5/R3K', 6: '4k/5/5/5/R3K' } } },
		})
		expect(keys(s).filter((k) => k.startsWith('(0T5)a1>>'))).toEqual([])
	})

	it('S12 pawn directions, T–L capture', () => {
		const s = one({
			s: 0,
			c: [0, 1],
			rows: {
				0: { st: 2, en: 10, boards: { 10: '4k/5/5/2P2/K4' } },
				'-1': { st: 8, en: 10, parent: [0, 7], boards: { 10: '4k/5/5/5/K4', 8: '4k/5/5/2n2/K4' } },
			},
		})
		expect(keys(s).filter((k) => k.startsWith('(0T5)c2')).sort()).toEqual([
			'(0T5)c2-c3',
			'(0T5)c2>(−1T5)c2',
			'(0T5)c2>>(−1T4)c2',
		])
		expect(oc(s, '(0T5)c2>>(−1T4)c2')).toEqual(['capture 100 certain'])
	})

	it('S13 double step, en passant', () => {
		let s = one({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/3p*1/5/2P*2/K4' } } } })
		s = run(s, ['(0T5)c2-c4'])
		expect(ordinaryMoves(V, s).find((m) => m.code === '(0T5)d4-c3')?.kind).toBe('ep')
		expect(oc(s, '(0T5)d4-c3')).toEqual(['capture 100 certain'])
		s = run(s, ['(0T5)d4-c3'])
		expect(typesOn(s, '(0)c4')).toEqual([])
	})

	it('S13b en passant after a double step on the first board of a new timeline', () => {
		// 5d-chess-js offers no en passant here: it looks for the board one turn before, which does not exist
		// (section 15, I2)
		let s = one({
			s: 1,
			c: [1, 0],
			rows: {
				0: { st: 2, en: 9, boards: { 9: '4k/5/5/5/K4' } },
				1: { st: 9, en: 9, parent: [0, 8], boards: { 9: '4k/4p*/5/3P*1/K4' } },
			},
		})
		s = run(s, ['(+1T4)e4-e2', '(0T4)e5-d5'])
		expect(s.turn).toBe(0)
		expect(ordinaryMoves(V, s).find((m) => m.code === '(+1T5)d2-e3')?.kind).toBe('ep')
		expect(oc(s, '(+1T5)d2-e3')).toEqual(['capture 100 certain'])
		s = run(s, ['(+1T5)d2-e3'])
		expect(typesOn(s, '(+1)e2')).toEqual([])
	})

	it('S14 promotion', () => {
		const s = one({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/1P3/5/5/K4' } } } })
		expect(keys(s).filter((k) => k.startsWith('(0T5)b4'))).toEqual(['(0T5)b4-b5=Q'])
		expect(typesOn(run(s, ['(0T5)b4-b5=Q']), '(0)b5')).toEqual(['q'])
	})

	it('S14b a brawn promotes by a capture into the past', () => {
		const s = one({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/3W1/5/5/K4', 8: '3rk/5/5/5/K4' } } } })
		expect(keys(s).filter((k) => k.startsWith('(0T5)d4'))).toEqual([
			'(0T5)d4-d5=Q',
			'(0T5)d4-e5=Q',
			'(0T5)d4>>(0T4)d5=Q',
		])
		expect(typesOn(run(s, ['(0T5)d4>>(0T4)d5=Q']), '(+1)d5')).toEqual(['q'])
	})

	it('S15 castling', () => {
		const s = run(one({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: 'k4/5/5/5/K*3R*' } } } }), ['(0T5)a1-c1'])
		expect(typesOn(s, '(0)c1')).toEqual(['k'])
		expect(typesOn(s, '(0)b1')).toEqual(['r'])
	})

	it('S16 unicorns and dragons', () => {
		expect(keys(start('justunicorns'))).toEqual(['(0T1)a1-a2', '(0T1)a1-b2'])
		expect(keys(start('justdragons'))).toEqual(['(0T1)a1-a2', '(0T1)a1-b2'])
		const s = run(start('justunicorns'), ['(0T1)a1-a2', '(0T1)e5-e4'])
		expect(keys(s).filter((k) => k.startsWith('(0T2)b1') || k.startsWith('(0T2)d1')).sort()).toEqual([
			'(0T2)b1>>(0T1)a2',
			'(0T2)b1>>(0T1)c2',
			'(0T2)d1>>(0T1)c2',
			'(0T2)d1>>(0T1)e2',
		])
	})

	it('S17 brawn', () => {
		const s = one({
			md: 2,
			s: 0,
			rows: {
				'-1': { st: 2, en: 2, boards: { 2: '4k/5/2p2/1p1p1/K4' } },
				0: { st: 2, en: 2, boards: { 2: '4k/5/5/2W*2/K4' } },
				1: { st: 2, en: 2, boards: { 2: '4k/5/5/5/K4' } },
			},
		})
		expect(keys(s).filter((k) => k.startsWith('(0T1)c2')).sort()).toEqual([
			'(0T1)c2-c3',
			'(0T1)c2-c4',
			'(0T1)c2>(−1T1)b2',
			'(0T1)c2>(−1T1)c2',
			'(0T1)c2>(−1T1)c3',
			'(0T1)c2>(−1T1)d2',
		])
	})

	it('S18 even start', () => {
		let s = start('twotimelines')
		expect(must(s)).toEqual(['−0', '+0'])
		expect(keys(s).length).toBe(44)
		expect(keys(s).filter((k) => k.includes('>')).sort()).toEqual([
			'(+0T1)b1>(−0T1)b3',
			'(+0T1)g1>(−0T1)g3',
			'(−0T1)b1>(+0T1)b3',
			'(−0T1)g1>(+0T1)g3',
		])
		s = run(s, ['(−0T1)b1>(+0T1)b3'])
		expect([row(s, -1)[1], row(s, 0)[1], s.turn]).toEqual([3, 3, 1])
	})

	it('S19 Turn Zero', () => {
		const s = run(start('turnzero'), ['(0T1)g1-f3'])
		expect(keys(s).filter((k) => k.includes('(0T0)')).sort()).toEqual(['(0T1)b8>>(0T0)b6', '(0T1)g8>>(0T0)g6'])
	})

	it('S20 royal types', () => {
		const live = (set) => [...set].filter((type) => type[0] !== 'h').sort()
		expect(live(V.royalTypes)).toEqual(['k', 'k0', 'y'])
		expect(live(V.solidTypes)).toEqual(['c', 'k', 'k0', 'p', 'p0', 'w', 'w0', 'y'])
		const board = (fen) => one({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: fen } } } })
		// the common king is not royal; the royal queen is
		expect(run(board('yc3/5/2N2/5/YC3'), ['(0T5)c3-b5']).result).toBeNull()
		expect(run(board('yc3/5/1N3/5/YC3'), ['(0T5)b3-a5']).result).toEqual({ winner: 0, reason: 'king' })
	})

	it('S21 an even start never wraps a line', () => {
		// shown −3 … +3 are the internal lines −4 … 3 of an even start
		const rows = {}
		for (const l of [-4, -3, -2, -1, 0, 1, 2, 3]) {
			const starting = l === -1 || l === 0
			const white = l > 0
			rows[l] = {
				st: starting ? 2 : white ? 9 : 10,
				en: 10,
				parent: starting ? null : white ? [uOf(l - 1, 1), 8] : [uOf(l + 1, 1), 9],
				boards: { 10: l === 3 || l === -4 ? '4k/5/5/5/KN3' : '4k/5/5/5/K4' },
			}
		}
		const s = one({ md: 1, s: 0, c: [3, 3], rows })
		const outer = keys(s).filter((k) => k.startsWith('(+3T5)b1') || k.startsWith('(−3T5)b1'))
		expect(outer.filter((k) => /\([+−]0T/.test(k))).toEqual([])
		expect(outer).toContain('(+3T5)b1>(+2T5)b3')
		expect(outer).toContain('(−3T5)b1>(−2T5)b3')
	})
})

describe('Multiverse chess: quantum', () => {
	it('Q1 split', () => {
		const s = s1()
		expect(s.worlds.map((e) => e.w)).toEqual([8388608, 8388608])
		expect(budget(s, 0)).toBe(2)
		expect(X(s).tl[0].slice(0, 2)).toEqual([2, 3])
		expect(s.turn).toBe(1)
	})

	it('Q2 a ghost travels (link)', () => {
		let s = run(s1(), ['(0T1)a4-a3'])
		const knight = idAt(s.worlds.find(({ b }) => b.board[sq('(0)c3')] >= 0).b, '(0)c3')
		expect(oc(s, '(0T2)c3>>(0T1)e3')).toEqual(['move 100 certain'])
		s = run(s, ['(0T2)c3>>(0T1)e3'])
		expect(loc(s, knight)).toEqual(['(0)e3 50', '(+1)e3 50'])
		expect(s.worlds.map(({ b }) => b.x.tl[uOf(1, 0)])).toEqual([[3, 3, 0, 2], [3, 3, 0, 2]])
		expect(budget(s, 0)).toBe(2)
	})

	it('Q3 a probe', () => {
		const s = run(s1(), ['(0T1)a4-a3', '(0T2)c3>>(0T1)e3'])
		const knight = idAt(s.worlds.find(({ b }) => b.board[sq('(+1)e3')] >= 0).b, '(+1)e3')
		expect(oc(s, '(+1T1)e4-e3')).toEqual(['miss 50', 'move 50'])
		const missed = run(s, [['(+1T1)e4-e3', 0]])
		expect(missed.worlds.length).toBe(1)
		expect(loc(missed, knight)).toEqual(['(+1)e3 100'])
		// the board passed
		expect(row(missed, 1)).toEqual([3, 4, 0, 2])
		expect([missed.turn, isLegal(V, missed, 'submit')]).toEqual([1, true])
	})

	it('Q4 pass = link through the past', () => {
		const s = pastShield()
		const bishop = idAt(s.worlds[0].b, '(0)a1')
		expect(oc(s, '(0T5)a1>>(0T3)c1')).toEqual(['move 100 certain'])
		const after = run(s, ['(0T5)a1>>(0T3)c1'])
		expect(loc(after, bishop)).toEqual(['(0)a1 50', '(+1)c1 50'])
		expect([budget(after, 0), budget(after, 1)]).toEqual([2, 2])
	})

	it('Q5 land = roll in the past', () => {
		const s = pastShield()
		expect(oc(s, '(0T5)a1>>(0T4)b1')).toEqual(['move 50', 'capture 50'])
		const hit = run(s, [['(0T5)a1>>(0T4)b1', 1]])
		// the present is settled by shooting the past
		expect(hit.worlds.length).toBe(1)
		expect(squareView(hit, sq('(0)b1')).map((o) => o.type + ' ' + o.p)).toEqual(['n 1'])
	})

	it('Q6 time split', () => {
		const s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3'])
		const knight = idAt(s.worlds[0].b, '(0)c3')
		// (0)~3c5 holds the bishop
		expect(splitTargets(V, s, sq('(0)c3')).map(nameOf)).toEqual(['(0)d1', '(0)a4', '(0)~3a3', '(0)~3e3'])
		expect(oc(s, '(0)c3-(0)~3a3|(0)~3e3')).toEqual(['split 100 certain'])
		const after = run(s, ['(0)c3-(0)~3a3|(0)~3e3'])
		expect(after.worlds.length).toBe(2)
		expect(loc(after, knight)).toEqual(['(+1)a3 50', '(+1)e3 50'])
		expect([row(after, 1), X(after).c, after.turn]).toEqual([[3, 3, 0, 2], [1, 0], 1])
	})

	it('Q7 two boards', () => {
		const s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3'])
		expect(isLegal(V, s, '(0)c3-(0)a4|(0)~3e3')).toBe(false)
	})

	it('Q8 jump split', () => {
		const w = buildWorld({
			s: 0,
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: '4k/5/2N2/5/K4' } },
				1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/5/5/5/K4' } },
			},
		})
		const knight = idAt(w, '(0)c3')
		const s = stateOf([[w, 1]])
		expect(oc(s, '(0)c3-(+1)a3|(+1)e3')).toEqual(['split 100 certain'])
		const after = run(s, ['(0)c3-(+1)a3|(+1)e3'])
		expect(loc(after, knight)).toEqual(['(+1)a3 50', '(+1)e3 50'])
		expect([row(after, 0)[1], row(after, 1)[1], after.turn]).toEqual([11, 11, 1])
	})

	it('Q9 merge on another timeline; not across boards', () => {
		const w = buildWorld({
			s: 0,
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: '4k/5/2N2/5/K4' } },
				1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/5/5/5/K4' } },
			},
		})
		const knight = idAt(w, '(0)c3')
		const s = run(stateOf([[w, 1]]), ['(0)c3-(+1)a3|(+1)e3', '(0T5)e5-d5', '(+1T5)e5-d5'])
		expect(oc(s, '(+1)a3|(+1)e3-(+1)c4')).toEqual(['move 100 certain'])
		const merged = run(s, ['(+1)a3|(+1)e3-(+1)c4'])
		expect(loc(merged, knight)).toEqual(['(+1)c4 100'])
		// the past still remembers both paths
		expect([merged.worlds.length, budget(merged, 0)]).toEqual([2, 2])
		const apart = run(s1(), ['(0T1)a4-a3', '(0T2)c3>>(0T1)e3', '(+1T1)b4-b3', 'submit'])
		expect(legalMoves(V, apart).filter((m) => m.type === 'merge')).toEqual([])
	})

	it('Q10 which-path memory', () => {
		let s = run(s1(), ['(0T1)a4-a3', '(0)c3|(0)e3-(0)d1'])
		expect([s.worlds.length, budget(s, 0)]).toEqual([2, 2])
		const record = s.history.at(-1)
		expect(record.info.memory).toEqual([0, 4])
		expect(V.infoText(record)).toContain('The past still remembers both paths until (0T2) ○ is sealed')
		s = run(s, ['(0T2)b4-b3', '(0T3)e2-e3', '(0T3)c4-c3'])
		expect([s.worlds.length, budget(s, 0), row(s, 0)[1]]).toEqual([2, 2, 8])
		s = run(s, ['(0T4)d1-c3'])
		expect([s.worlds.length, budget(s, 0), row(s, 0)[1]]).toEqual([1, 1, 9])
	})

	it('Q11 measuring uses the board', () => {
		const s = run(s1(), ['(0T1)a4-a3'])
		expect(legalMoves(V, s).filter((m) => m.type === 'measure').map((m) => m.code)).toEqual(['?(0)c3', '?(0)e3'])
		expect(oc(s, '?(0)c3')).toEqual(['(0)c3 50', '(0)e3 50'])
		const measured = run(s, [['?(0)c3', 0]])
		expect([measured.worlds.length, row(measured, 0)[1], measured.turn]).toEqual([1, 5, 1])
	})

	it('Q12 only on a board you may play', () => {
		const s = run(s1(), ['(0T1)a4-a3', '(0T2)c3>>(0T1)e3', '(+1T1)b4-b3', 'submit'])
		expect([s.turn, must(s)]).toEqual([0, ['+1']])
		// the knight's parts stand on (0)e3 (a Black board now) and (+1)e3
		expect(isLegal(V, s, '?(0)e3')).toBe(false)
		expect(isLegal(V, s, '?(+1)e3')).toBe(true)
		expect(legalMoves(V, s).filter((m) => m.type === 'measure').map((m) => m.code)).toEqual(['?(+1)e3'])
	})

	it('Q13 twins', () => {
		const s = run(s1(), ['(0T1)a4-a3', '(0T2)b2-b3', '(0T2)d5>>(0T1)d3'])
		expect(row(s, -1)).toEqual([4, 4, 0, 3])
		expect(squareView(s, sq('(−1)c3')).map((o) => o.type + ' ' + o.p)).toEqual(['n 0.5'])
		expect(squareView(s, sq('(−1)e3')).map((o) => o.type + ' ' + o.p)).toEqual(['n 0.5'])
		expect(budget(s, 0)).toBe(2)
		expect(must(s)).toEqual(['−1'])
		expect(oc(s, '?(−1)c3')).toEqual(['gone 50', '(−1)c3 50'])
		const found = run(s, [['?(−1)c3', 1]])
		expect(found.worlds.length).toBe(1)
		expect(squareView(found, sq('(0)c3')).map((o) => o.type + ' ' + o.p)).toEqual(['n 1'])
		expect(budget(found, 0)).toBe(1)
	})

	it('Q14 a rolled Missed still opens the timeline', () => {
		const s = run(s1(), ['(0T1)a4-a3'])
		expect(oc(s, '(0T2)c3>>(0T1)c5')).toEqual(['miss 50', 'capture 50'])
		const missed = run(s, [['(0T2)c3>>(0T1)c5', 0]])
		expect([row(missed, 1), X(missed).c, missed.turn]).toEqual([[3, 3, 0, 2], [1, 0], 1])
		// nobody arrived: the copied bishop still stands there
		expect(typesOn(missed, '(+1)c5')).toEqual(['b'])
	})

	it('Q15 game-end roll in the past', () => {
		const A = buildWorld({ s: 0, rows: { 0: { st: 6, en: 8, boards: { 8: '5/5/2N2/5/K3k', 6: '5/5/4k/5/K4' } } } })
		const B = buildWorld({ s: 0, rows: { 0: { st: 6, en: 8, boards: { 8: '5/5/N4/5/K3k', 6: '5/5/4k/5/K4' } } } })
		setId(B, '(0)a3', idAt(A, '(0)c3'))
		const s = stateOf([[A, 1], [B, 1]])
		expect(royalDanger(V, s, 1)).toBe(0.5)
		expect(oc(s, '(0T4)c3>>(0T3)e3')).toEqual(['miss 50', 'capture 50'])
		const missed = run(s, [['(0T4)c3>>(0T3)e3', 0]])
		expect(missed.result).toBeNull()
		expect([X(missed).tl.filter(Boolean).length, row(missed, 0)[1], X(missed).c]).toEqual([1, 9, [0, 0]])
		expect(run(s, [['(0T4)c3>>(0T3)e3', 1]]).result).toEqual({ winner: 0, reason: 'king' })
	})

	it('Q15b a merge onto a king in the past opens no row in any outcome', () => {
		const mk = (last) => buildWorld({
			s: 0,
			rows: { 0: { st: 2, en: 10, boards: { 10: last, 6: '4k/5/5/5/K1k2' } } },
		})
		const A = mk('4k/5/5/5/KN3')
		const B = mk('4k/5/5/5/K2N1')
		const C = mk('4k/5/5/5/K4')
		setId(B, '(0)d1', idAt(A, '(0)b1'))
		const s = stateOf([[C, 2], [A, 1], [B, 1]])
		const code = '(0)b1|(0)d1-(0)~3c1'
		expect(oc(s, code)).toEqual(['miss 50', 'capture 50'])
		const missed = run(s, [[code, 0]])
		expect(missed.result).toBeNull()
		expect([X(missed).c, X(missed).tl.filter(Boolean).length, row(missed, 0)[1]]).toEqual([[0, 0], 1, 11])
		expect(run(s, [[code, 1]]).result).toEqual({ winner: 0, reason: 'king' })
	})

	it('Q16 converging capture', () => {
		const mk = (fen) => buildWorld({ s: 1, rows: { 0: { st: 6, en: 11, boards: { 11: fen } } } })
		const A = mk('2k2/5/1N3/5/K4')
		const B = mk('2k2/4N/5/5/K4')
		setId(B, '(0)e4', idAt(A, '(0)b3'))
		// the merge onto c5 captures in every world
		expect(royalDanger(V, stateOf([[A, 1], [B, 1]]), 1)).toBe(1)
	})

	it('Q17 the same danger before and after Submit', () => {
		const mk = (fen) => buildWorld({ s: 1, rows: { 0: { st: 6, en: 11, boards: { 11: fen } } } })
		// different pieces: a White knight in world A, a White bishop in world B
		const s = stateOf([[mk('2k1p/5/1N3/5/K4'), 1], [mk('2k1p/5/B4/5/K4'), 1]])
		expect(royalDanger(V, s, 1)).toBe(0.5)
		const after = run(s, ['(0T5)e5-e4'])
		expect(after.turn).toBe(0)
		expect(royalDanger(V, after, 1)).toBe(0.5)
	})

	it('Q18 one skeleton', () => {
		// links, rolls, time splits, twins, measurements, merges into the past: one skeleton in every world after
		// every action (`run` checks it after each one, and every scenario here plays through `run`)
		const lines = [
			[s1(), ['(0T1)a4-a3', '(0T2)c3>>(0T1)e3', ['(+1T1)e4-e3', 1]]],
			[s1(), ['(0T1)a4-a3', '(0T2)b2-b3', '(0T2)d5>>(0T1)d3', ['?(−1)c3', 0]]],
			[s1(), ['(0T1)a4-a3', ['(0T2)c3>>(0T1)c5', 1]]],
			[run(start(), ['(0T1)d1-c3', '(0T1)a4-a3']), ['(0)c3-(0)~3a3|(0)~3e3', '(+1T1)e4-e3']],
			[pastShield(), ['(0T5)a1>>(0T3)c1']],
		]
		for (const [s, codes] of lines) {
			const end = run(s, codes)
			expect(new Set(end.worlds.map(({ b }) => solidExtra(b))).size).toBe(1)
		}
	})

	it('Q19 budget fallback', () => {
		const limited = { ...V, budgetRule: () => ({ limit: 1 }) }
		const s = pastShield()
		const list = branches(limited, s, '(0T5)a1>>(0T3)c1')
		// rolled instead of linked
		expect(list.map((br) => br.key + ' ' + Math.round((br.weight / T) * 100))).toEqual(['miss 50', 'move 50'])
		const missed = stateAfter(limited, s, '(0T5)a1>>(0T3)c1', list[0], list)
		expect(row(missed, 1)).toEqual([7, 7, 0, 6])
		expect(typesOn(missed, '(+1)c1')).toEqual([])
	})

	it('Q20 budget 8 everywhere', () => {
		expect(['small', 'standard', 'twotimelines', 'marauders'].map((id) => budgetInfo(V, start(id), 0).limit))
			.toEqual([8, 8, 8, 8])
	})

	it('Q21 a piece absent from the first world merges', () => {
		const board = (fen) => buildWorld({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: fen } } } })
		const A = board('4k/5/2N2/5/K4')
		const B = board('4k/5/4N/5/K4')
		const C = board('4k/5/5/5/K4')
		const knight = idAt(A, '(0)c3')
		setId(B, '(0)e3', knight)
		const s = stateOf([[C, 2], [A, 1], [B, 1]])
		expect(s.worlds[0].b.ty[knight]).toBe('')
		expect(loc(s, knight)).toEqual(['off 50', '(0)c3 25', '(0)e3 25'])
		expect(oc(s, '(0)c3|(0)e3-(0)d1')).toEqual(['move 100 certain'])
	})

	it('Q22 castling is certain-only', () => {
		const board = (fen) => buildWorld({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: fen } } } })
		const A = board('k4/5/5/5/K*2NR*')
		const B = board('k4/5/5/1N3/K*3R*')
		setId(B, '(0)b2', idAt(A, '(0)d1'))
		expect(isLegal(V, stateOf([[A, 1], [B, 1]]), '(0T5)a1-c1')).toBe(false)
		const C = board('k4/5/5/1N3/K*3R*')
		const D = board('k4/5/1N3/5/K*3R*')
		setId(D, '(0)b3', idAt(C, '(0)b2'))
		expect(oc(stateOf([[C, 1], [D, 1]]), '(0T5)a1-c1')).toEqual(['move 100 certain'])
	})

	it('Q23 en passant after a linked world', () => {
		const board = (fen) => buildWorld({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: fen } } } })
		const A = board('4k/3p*1/5/N1P*2/K4')
		const B = board('4k/3p*1/5/2P*2/K1N2')
		setId(B, '(0)c1', idAt(A, '(0)a2'))
		const s = run(stateOf([[A, 1], [B, 1]]), ['(0T5)c2-c4'])
		expect(oc(s, '(0T5)d4-c3')).toEqual(['capture 100 certain'])
	})

	it('Q24 rejoin across timelines', () => {
		const mk = (l0, l1) => buildWorld({
			s: 0,
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: l0 } },
				1: { st: 9, en: 10, parent: [0, 8], boards: { 10: l1 } },
			},
		})
		const A = mk('4k/5/N4/5/K4', '4k/5/5/5/K4')
		const B = mk('4k/5/5/5/K4', '4k/5/2N2/5/K4')
		const knight = idAt(A, '(0)a3')
		setId(B, '(+1)c3', knight)
		const s = stateOf([[A, 1], [B, 1]])
		expect(oc(s, '(0T5)a3>(+1T5)c3')).toEqual(['move 100 certain'])
		expect(loc(run(s, ['(0T5)a3>(+1T5)c3']), knight)).toEqual(['(+1)c3 100'])
	})

	it('Q25 merge into the past', () => {
		const board = (fen) => buildWorld({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: fen } } } })
		const A = board('4k/5/5/5/1N3')
		const B = board('4k/5/5/5/3N1')
		const knight = idAt(A, '(0)b1')
		setId(B, '(0)d1', knight)
		const s = stateOf([[A, 1], [B, 1]])
		expect(oc(s, '(0)b1|(0)d1-(0)~3c1')).toEqual(['move 100 certain'])
		const merged = run(s, ['(0)b1|(0)d1-(0)~3c1'])
		expect(loc(merged, knight)).toEqual(['(+1)c1 100'])
		expect(row(merged, 1)).toEqual([7, 7, 0, 6])
		// the past still remembers both paths
		expect(merged.worlds.length).toBe(2)
	})

	it('Q26 a partial slide loses castling', () => {
		const board = (fen) => buildWorld({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: fen } } } })
		const A = board('k4/5/4n/5/K*3R*')
		const B = board('k4/5/1n3/5/K*3R*')
		setId(B, '(0)b3', idAt(A, '(0)e3'))
		const rook = idAt(A, '(0)e1')
		let s = stateOf([[A, 1], [B, 1]])
		// blocked by the Black knight in one world: linked
		expect(oc(s, '(0T5)e1-e4')).toEqual(['move 100 certain'])
		s = run(s, ['(0T5)e1-e4'])
		expect(loc(s, rook)).toEqual(['(0)e1 50', '(0)e4 50'])
		expect(s.worlds.map(({ b }) => b.ty[rook])).toEqual(['r', 'r'])
		s = run(s, ['(0T5)a5-b5'])
		const list = branches(V, s, '?(0)e1')
		const home = list.findIndex((br) => br.key === '(0)e1')
		s = run(s, [['?(0)e1', home]])
		expect(loc(s, rook)).toEqual(['(0)e1 100'])
		expect(s.worlds[0].b.ty[rook]).toBe('r')
		// no castling key on White's next board
		s = run(s, ['(0T6)b5-a5'])
		expect(keys(s).filter((k) => k.startsWith('(0T7)a1-c1'))).toEqual([])
	})

	it('Q27 stuck', () => {
		let s = start('marauders')
		expect(must(s)).toEqual(['0', '−1', '+1'])
		expect(keys(s).length).toBe(34)
		expect(keys(s).filter((k) => k.includes('>(−1T1)')).length).toBe(8)
		s = run(s, ['(0T1)a1-a2'])
		expect(keys(s).filter((k) => k.includes('>(−1T1)')).length).toBe(5)
		expect(s.result).toBeNull()
		// White stranded its own turn
		expect(run(s, ['(+1T1)b2-b3']).result).toEqual({ winner: 1, reason: 'stranded' })
		// at the start of a turn: L0 must move with no White piece on it
		const mk = (l1) => one({
			s: 0,
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/5' } },
				1: { st: 9, en: 11, parent: [0, 8], boards: { 11: l1 } },
			},
		})
		const mate = mk('4k/5/5/5/r3K')
		expect(must(mate)).toEqual(['0'])
		expect(hasLegalMove(V, mate)).toBe(false)
		expect(V.noMoves(mate)).toEqual({ winner: 1, reason: 'checkmate' })
		expect(V.noMoves(mk('4k/5/5/5/4K'))).toEqual({ winner: null, reason: 'stalemate' })
	})

	it('Q27b a branch from a must-move row is no way out', () => {
		const before = run(start('marauders'), Q27B)
		expect(before.result).toBeNull()
		expect(V.moveWarning(before, '(0T4)a1-a2')).toBe(DRAW)
		const s = run(before, ['(0T4)a1-a2'])
		// no Black piece on +1
		expect([s.turn, must(s), X(s).c]).toEqual([1, ['+1', '−2'], [0, 2]])
		expect(s.result).toEqual({ winner: null, reason: 'stalemate' })
	})

	it('Q27c jumps that need the same board', () => {
		const s = sameBoard(0)
		expect(must(s).sort()).toEqual(['+1', '0', '−1'])
		expect(keys(s).filter((k) => k.startsWith('(−1T4)'))).toEqual(['(−1T4)c3>(0T4)c3'])
		// +1 can only be reached from L0, which the rook's and the brawn's jumps also need; a branch is over the cap
		expect(stuck(V, s)).toBe(true)
		expect(V.stateResult(s)).toEqual({ winner: null, reason: 'stalemate' })
		// the same after an action of the side to move in this turn
		expect(V.stateResult(sameBoard(1))).toEqual({ winner: 0, reason: 'stranded' })
	})

	it('Q27d a roll can take away the move that finishes the turn', () => {
		const mk = (l0, l1) => buildWorld({
			s: 0,
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: l0 } },
				1: { st: 9, en: 10, parent: [0, 8], boards: { 10: l1 } },
			},
		})
		// one Black knight, on (0)c3 in world A and on (+1)c3 in world B: in each world it blocks one White pawn
		const A = mk('4k/5/2n2/2P2/5', '4k/5/5/2P2/5')
		const B = mk('4k/5/5/2P2/5', '4k/5/2n2/2P2/5')
		setId(B, '(+1)c3', idAt(A, '(0)c3'))
		const stalemate = { winner: null, reason: 'stalemate' }
		expect([A, B].map((w) => V.stateResult(stateOf([[w, 1]])))).toEqual([stalemate, stalemate])
		// together the turn is a gamble, not a stalemate: a Missed move still plays its board (section 15, I3)
		const s = stateOf([[A, 1], [B, 1]])
		expect(must(s)).toEqual(['0', '+1'])
		expect(stuck(V, s)).toBe(false)
		expect(keys(s).sort()).toEqual(['(+1T5)c2-c3', '(0T5)c2-c3'])
		for (const [code, other] of [['(0T5)c2-c3', '(+1T5)c2-c3'], ['(+1T5)c2-c3', '(0T5)c2-c3']]) {
			expect(oc(s, code)).toEqual(['miss 50', 'move 50'])
			// only the Moved outcome strands the turn: the warning says that the roll decides
			expect(V.moveWarning(s, code)).toBe(MAY_LOSE)
			// Missed: the knight blocks this pawn, so the other pawn is free and finishes the turn
			const missed = run(s, [[code, 0]])
			expect(missed.result).toBeNull()
			expect(run(missed, [other]).turn).toBe(1)
			// the move keeps only the world in which the other pawn is blocked
			expect(run(s, [[code, 1]]).result).toEqual({ winner: 1, reason: 'stranded' })
		}
	})

	it('Q28 the stuck test ignores pruning', () => {
		const s = markedView(run(start('marauders'), ['(0T1)a1-a2']))
		expect(stuck(V, s)).toBe(false)
		expect(stuck(V, run(s, ['(+1T1)b2-b3']))).toBe(true)
	})

	it('Q29 a measurable part is a way out', () => {
		const mk = (l0, l1) => buildWorld({
			m: 1,
			s: 0,
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: l0 } },
				1: { st: 9, en: 11, parent: [0, 8], boards: { 11: l1 } },
			},
		})
		// blocked pawns on L0 and a White knight part on a1 (world A) whose other part stands on (+1)c3 (world B)
		const A = mk('k4/1p3/1Pp2/2P2/N4', '4k/5/5/5/K4')
		const B = mk('k4/1p3/1Pp2/2P2/5', '4k/5/2N2/5/K4')
		setId(B, '(+1)c3', idAt(A, '(0)a1'))
		const s = stateOf([[A, 1], [B, 1]])
		expect(must(s)).toEqual(['0'])
		expect(keys(s).filter((k) => k.startsWith('(0T5)'))).toEqual([])
		expect(stuck(V, s)).toBe(false)
		expect(legalMoves(V, s).filter((m) => m.type === 'measure').map((m) => m.code)).toEqual(['?(0)a1'])
		const measured = run(s, [['?(0)a1', 0]])
		expect([row(measured, 0)[1], measured.turn]).toEqual([11, 1])
	})

	it('Q30 strand warning', () => {
		const s = run(start('marauders'), ['(0T1)a1-a2'])
		expect(V.moveWarning(s, '(+1T1)b2-b3')).toBe(LOSE)
		expect(V.moveWarning(s, '(+1T1)b1>(−1T1)b1')).toBeNull()
	})

	it('Q30b no warning for a winning move', () => {
		const mk = (l1) => one({
			s: 0,
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: '5/5/5/5/K4' } },
				1: { st: 9, en: 12, parent: [0, 8], boards: { 12: l1 } },
			},
		})
		const win = run(mk('R3k/5/5/5/K4'), ['(0T5)a1-a2'])
		expect(V.moveWarning(win, 'submit')).toBeNull()
		expect(run(win, ['submit']).result).toEqual({ winner: 0, reason: 'checkmate' })
		// without the rook on L+1
		const draw = run(mk('4k/5/5/5/K4'), ['(0T5)a1-a2'])
		expect(V.moveWarning(draw, 'submit')).toBe(DRAW)
		expect(run(draw, ['submit']).result).toEqual({ winner: null, reason: 'stalemate' })
	})

	it('Q30c the draw note in play', () => {
		const before = run(start('marauders'), Q27B)
		const warning = V.moveWarning(before, '(0T4)a1-a2')
		expect(warning).toBe(DRAW)
		expect(warning).not.toBe(LOSE)
	})

	it('Q30d a gamble is not announced as a certain loss or draw', () => {
		// White must move on L0, where it has nothing; its only chance is a knight (world A only) that takes the Black
		// king on the past board (0T4) ○ c2
		const mk = (latest) => buildWorld({
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: '5/5/3k1/5/5', 8: '5/5/5/2k2/5', 6: '5/5/5/2k2/5' } },
				1: { st: 9, en: 12, parent: [0, 8], boards: { 12: latest } },
			},
		})
		const s = stateOf([[mk('5/5/5/2N2/5'), 1], [mk('5/5/5/5/5'), 1]])
		expect([stuck(V, s), must(s)]).toEqual([false, ['0']])
		const code = '(+1T6)c2>>(0T4)c2'
		expect(oc(s, code)).toEqual(['miss 50', 'capture 50'])
		expect(run(s, [[code, 0]]).result).toEqual({ winner: 1, reason: 'stranded' })
		expect(run(s, [[code, 1]]).result).toEqual({ winner: 0, reason: 'king' })
		expect(V.moveWarning(s, code)).toBe(MAY_LOSE)
		// every other action strands for certain
		expect(V.moveWarning(s, '(+1T6)c2-e3')).toBe(LOSE)
		// a roll that may leave the opponent without a way to finish its turn: Black's only piece is a knight, 50 % b2
		const ghost = (fen) => buildWorld({ rows: { 0: { st: 2, en: 10, boards: { 10: fen } } } })
		const A = ghost('5/5/5/1n3/K4')
		const B = ghost('5/5/2n2/5/K4')
		setId(B, '(0)c3', idAt(A, '(0)b2'))
		const d = stateOf([[A, 1], [B, 1]])
		expect(oc(d, '(0T5)a1-b2')).toEqual(['move 50', 'capture 50'])
		expect(run(d, [['(0T5)a1-b2', 1]]).result).toEqual({ winner: null, reason: 'stalemate' })
		expect(run(d, [['(0T5)a1-b2', 0]]).result).toBeNull()
		expect(V.moveWarning(d, '(0T5)a1-b2')).toBe(MAY_DRAW)
	})
})

describe('Multiverse chess: limits and records', () => {
	it('L1 limits', () => {
		expect(play(V, { ...start(), ply: 1199 }, '(0T1)d1-c3').result).toEqual({ winner: null, reason: 'moveLimit' })
		const quiet = { ...start(), quiet: 299 }
		expect(play(V, quiet, '(0T1)d1-c3').result).toEqual({ winner: null, reason: 'quiet' })
		expect(play(V, quiet, '(0T1)a2-a3').quiet).toBe(0)
		// a brawn move resets the count, a common king's does not, and Submit counts as a move
		expect(play(V, { ...start('justbrawns'), quiet: 299 }, '(0T1)b1-b2').quiet).toBe(0)
		expect(play(V, { ...start('kingofkings'), quiet: 299 }, '(0T1)a1-a2').result?.reason).toBe('quiet')
		const twoBoards = one({
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/K4' } },
				1: { st: 9, en: 12, parent: [0, 8], boards: { 12: '4k/5/5/5/K4' } },
			},
		})
		const submit = play(V, { ...twoBoards, quiet: 298 }, '(0T5)a1-a2')
		expect([submit.result, submit.quiet, isLegal(V, submit, 'submit')]).toEqual([null, 299, true])
		expect(play(V, submit, 'submit').result).toEqual({ winner: null, reason: 'quiet' })
		expect(V.reasonText('quiet')).toBe('300 moves in a row without a capture or a pawn or brawn move')
	})

	it('R1 records: a branch', () => {
		expect(afterBranch().history.at(-1).info).toEqual({
			rows: [2],
			arrows: [[0, 4, 2, 2, 2, 3, 0, 2]],
			back: 3,
			cells: [[0, 5, 2, 2], [2, 3, 0, 2]],
		})
	})

	// the absolute code in the move notation, with no words: the record is saved with the game and shown as it is in
	// the move list (section 15, I1)
	it('R1 records: the text of a time split', () => {
		const s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3', '(0)c3-(0)~3a3|(0)~3e3'])
		expect(s.history.at(-1).info.text).toBe('(0T2)c3-(0T1)a3|(0T1)e3')
	})

	it('R1 records: a Missed branch', () => {
		const s = run(s1(), ['(0T1)a4-a3', ['(0T2)c3>>(0T1)c5', 0]])
		expect(s.history.at(-1).info).toEqual({ rows: [2], arrows: [], back: 3, cells: [[0, 5, 2, 2], [2, 3, 2, 4]] })
	})

	it('R2 last-move marks', () => {
		// reach 2: the branch lands on the oldest stored board, whose slot L0's own advance reuses
		let s = one({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/4R/5/K4', 6: '4k/5/5/5/K4' } } } })
		s = run(s, ['(0T5)e3>>(0T3)e3'])
		expect(V.lastMoveMarks(s).map(nameOf)).toEqual(['(0)e3', '(+1)e3'])
		let t = one({
			s: 0,
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/K3R' } },
				1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/5/5/5/K3R' } },
			},
		})
		t = run(t, ['(0T5)e1-e2', '(+1T5)e1-e3'])
		// the turn passed
		expect(t.turn).toBe(1)
		expect(V.lastMoveMarks(t).map(nameOf)).toEqual(['(0)e1', '(0)e2', '(+1)e1', '(+1)e3'])
		t = run(t, ['(0T5)e5-d5'])
		// White's marks on L0 followed their board into the past
		expect(V.lastMoveMarks(t).map(nameOf)).toEqual(['(0)~4e1', '(0)~4e2', '(+1)e1', '(+1)e3', '(0)e5', '(0)d5'])
	})
})

describe('Multiverse chess: the drawing', () => {
	it('U1 start layout', () => {
		const { cells, layout } = V.layoutOf(start())
		expect(cells.length).toBe(25)
		expect(layout.boards.map((b) => b.label)).toEqual(['L0 T1 ○ · must move'])
		expect((layout.areas ?? []).map((a) => a.shade)).toEqual(['frame', 'wood'])
		// the placeholder of the next board
		expect((layout.outlines ?? []).length).toBe(4)
		expect(layout.height).toBeGreaterThanOrEqual(0.75 * layout.width)
	})

	it('U2 after a branch', () => {
		const s = afterBranch()
		const { cells, layout } = V.layoutOf(s)
		const rowLabels = layout.labels.map((l) => l.text).filter((text) => /^L/.test(text) || text === 'new')
		expect(rowLabels.sort()).toEqual(['L+1', 'L0', 'new'])
		expect((layout.areas ?? []).map((a) => a.shade).sort()).toEqual(['frame', 'river', 'wood'])
		// the connector
		expect((layout.lines ?? []).length).toBe(1)
		// Black is in 5D check: the White knight on L+1 can take the king on (0T2 ○) a5
		expect(royalDanger(V, s, 1)).toBe(1)
		expect((layout.outlines ?? []).filter((o) => o.kind === 'threat').length).toBe(1)
		expect(cells.filter((c) => c.shade === 'danger').map((c) => nameOf(c.sq))).toEqual(['(0)~1a5'])
	})

	it('U3 focus key', () => {
		const s = afterBranch()
		const key = V.layoutOf(s).layout.focus.key
		// a move on the optional board keeps it, the must-move board changes it
		expect(V.layoutOf(run(s, ['(0T2)b4-b3'])).layout.focus.key).toEqual(key)
		expect(V.layoutOf(run(s, ['(+1T1)e4-e3'])).layout.focus.key).not.toEqual(key)
	})

	it('U4 danger display', () => {
		const s = one({ s: 1, rows: { 0: { st: 6, en: 11, boards: { 11: '2k2/5/1N3/5/K4' } } } })
		const { cells, layout } = V.layoutOf(s)
		expect(cells.filter((c) => c.shade === 'danger').map((c) => nameOf(c.sq))).toEqual(['(0)c5'])
		expect((layout.lines ?? []).length).toBe(0)
		expect((layout.outlines ?? []).filter((o) => o.kind === 'threat').length).toBe(1)
	})

	it('U5 names', () => {
		expect(V.layoutOf(afterBranch()).names[sq('(+1)a3')]).toBe('Timeline +1, turn 1, Black to move: a3')
	})

	it('U6 no flip (the declaration; the game view is an app test)', () => {
		expect(V.flipBoard).toBe(false)
		expect(V.sides.map((side) => side.rotate)).toEqual([0, 0])
	})
})

describe('Multiverse chess: the computer', () => {
	it('A1 the computer\'s view', () => {
		expect(V.aiView).toBeTypeOf('function')
		// Black: L+1 must move, L0 optional
		const s = afterBranch()
		const all = keys(s)
		const pruned = keys(V.aiView(s, 1, 'normal'))
		expect(pruned.length).toBeLessThan(all.length)
		expect(pruned.filter((k) => !all.includes(k))).toEqual([])
		expect(pruned.filter((k) => !k.startsWith('(+1T1)') && !k.includes('>(+1T1)'))).toEqual([])
	})

	it('A2 the computer takes a king', async () => {
		const s = kingInThePast()
		const code = await chooseMove(V, s, { level: 'normal', rng: seededRng(1), now: workClock() })
		expect(play(V, s, code).result).toEqual({ winner: 0, reason: 'king' })
	})

	it('A3 self-play', async () => {
		/**
		 * Play one game of the computer against itself. Every position it plays from is not stuck, so some action
		 * must leave the mover able to finish its turn (the invariant of section 10 checked on self-play).
		 *
		 * @param {string} setup setup id
		 * @param {string} level level id
		 * @param {number} seed seed
		 * @return {Promise<{state: object, previous: object}>}
		 */
		const game = async (setup, level, seed) => {
			const rng = seededRng(seed)
			const where = setup + ' ' + level + ' seed ' + seed
			let s = start(setup)
			let previous = s
			while (!s.result) {
				const way = legalMoves(V, s).some((m) => V.moveWarning(s, m.code) !== LOSE)
				expect(way, where + ', ply ' + s.ply + ': no action keeps the turn finishable').toBe(true)
				const code = await chooseMove(V, s, { level, rng, now: workClock() })
				expect(code, where + ': a failed search').toBeTypeOf('string')
				expect(isLegal(V, s, code), where + ': ' + code).toBe(true)
				previous = s
				s = applyMove(V, s, code, rng).state
			}
			return { state: s, previous }
		}
		for (let seed = 1; seed <= SEEDS; seed++) {
			const { state } = await game('small', 'normal', seed)
			expect(state.result.reason, 'Small, seed ' + seed).toBe('king')
		}
		for (const level of ['normal', 'easy']) {
			for (let seed = 1; seed <= SEEDS; seed++) {
				const { state, previous } = await game('marauders', level, seed)
				const { reason } = state.result
				if (reason === 'checkmate' || reason === 'stalemate') {
					// at the start of the stuck side's turn: the opponent's action left it there
					expect(state.history.at(-1).side, level + ' seed ' + seed).not.toBe(state.turn)
				}
				if (reason === 'stranded') {
					// only when every alternative loses too: it strands, or leaves a royal piece capturable for certain
					const mover = previous.turn
					const loses = (code) => branches(V, previous, code).every((br, i, list) => {
						const next = stateAfter(V, previous, code, br, list)
						return next.result?.winner === 1 - mover || (!next.result && royalDanger(V, next, mover) >= 1)
					})
					const escapes = legalMoves(V, previous).map((m) => m.code).filter((c) => !loses(c))
					expect(escapes, 'Timeline Marauders ' + level + ', seed ' + seed).toEqual([])
				}
			}
		}
	}, 600000)

	it('A4 no blind blunder inside a turn', async () => {
		const w = buildWorld({
			s: 0,
			c: [1, 0],
			rows: {
				0: { st: 2, en: 10, boards: { 10: '1p3/2p1k/5/5/K1Q2' } },
				1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/3pp/5/5/K4' } },
			},
		})
		const queen = idAt(w, '(0)c1')
		const hanging = []
		for (let seed = 1; seed <= 6; seed++) {
			const rng = seededRng(seed)
			let s = stateOf([[w, 1]])
			while (!s.result && s.turn === 0) {
				s = applyMove(V, s, await chooseMove(V, s, { level: 'normal', rng, now: workClock() }), rng).state
			}
			const takes = !s.result && legalMoves(V, s).some((m) => m.type === 'move' && m.to >= 0
				&& s.worlds.some(({ b }) => b.board[m.to] === queen))
			if (takes) {
				hanging.push(seed)
			}
		}
		expect(hanging).toEqual([])
	}, 120000)

	it('A5 the view keeps the way out', async () => {
		expect(V.aiView).toBeTypeOf('function')
		const s = run(start('marauders'), A5)
		// no Black piece on +2
		expect(must(s)).toEqual(['+2'])
		const view = V.aiView(s, 1, 'easy')
		expect(view).not.toBe(s)
		// a new active Black row at T2 moves the present back and makes Submit legal
		expect(keys(view)).toContain('(+1T4)b5>>(+1T2)b5')
		expect(keys(view)).not.toContain('(+1T4)b5>>(+1T3)b5')
		const stranded = []
		for (let seed = 1; seed <= 4; seed++) {
			const rng = seededRng(seed)
			const code = await chooseMove(V, s, { level: 'easy', rng, now: workClock() })
			if (applyMove(V, s, code, rng).state.result) {
				stranded.push(seed + ': ' + code)
			}
		}
		expect(stranded).toEqual([])
	}, 60000)
})
