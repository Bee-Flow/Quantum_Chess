/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Three-check (src/variants/threecheck.js): the start, the pieces, what counts as a check, the third-check win, the
 * bare-kings draw and the escape rule (the core's classic flags, handoff/LEAD-DECISIONS.md L1), how checks combine
 * with splits, merges, measurements, rolls and links (the counters are solid), the texts of the counters and the
 * computer player. The cases T1-T29 are those of handoff/research/threecheck.md, section 7; T30 is item 10 of its
 * engine review (section 8.2).
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { catalogEntry } from '../../../src/variants/catalog.js'
import { chooseMove, LEVELS, mightForce } from '../../../src/variants/core/ai.js'
import { castlingRights } from '../../../src/variants/core/orthodox.js'
import {
	applyMove,
	applyOutcome,
	branches,
	budgetInfo,
	legalMoves,
	MAX_WORLDS,
	newGame,
	splitsFrom,
	T,
	worldResult,
} from '../../../src/variants/core/quantum.js'
import { givesCheck, nameOf } from '../../../src/variants/core/world.js'
import V, { checksOf, kingPressure } from '../../../src/variants/threecheck.js'
import { play, stateOf, stopwatch, workClock } from './helpers.js'

const J = JSON.stringify

/**
 * The index of a square.
 *
 * @param {string} name square name
 * @return {number}
 */
function sq(name) {
	return V.topology.byName(name)
}

/**
 * A state from equally likely placements, in the order written, with explicit three-check bookkeeping.
 *
 * @param {Array<Record<string, string>>} placements one placement per world
 * @param {object} [opts] options
 * @param {number} [opts.turn] side to move
 * @param {number[]} [opts.checks] checks given by White and by Black
 * @param {boolean} [opts.castle] give the castling rights of the position
 * @param {string} [opts.ep] en passant square
 * @param {string} [opts.epVictim] the pawn that may be taken en passant
 * @return {object}
 */
function st(placements, { turn = 0, checks = [0, 0], castle = false, ep = null, epVictim = null } = {}) {
	return stateOf(V, placements.map((p) => [p, 1]), turn, (b) => {
		b.x = {
			ep: ep ? sq(ep) : -1,
			epVictim: epVictim ? sq(epVictim) : -1,
			castle: castle ? castlingRights(V, b) : [],
			checks: checks.slice(),
		}
	})
}

/**
 * The pieces of a world as sorted text, White upper case: `Kg1 Qh5 ke8`.
 *
 * @param {object} b world
 * @return {string}
 */
function pieces(b) {
	return b.sq
		.map((q, id) => (q >= 0 ? (b.sd[id] ? b.ty[id] : b.ty[id].toUpperCase()) + nameOf(V, q) : null))
		.filter(Boolean)
		.sort()
		.join(' ')
}

/**
 * The outcomes of a move with the state after each: `{ key, p, rolled, notes, pos, checks, result, state }`, where
 * `pos` lists the distinct piece placements and `checks` the distinct counters of the new state.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {object[]|null}
 */
function run(s, code) {
	const list = branches(V, s, code)
	if (!list) {
		return null
	}
	return list.map((br, i) => {
		const state = applyOutcome(V, s, code, i)
		return {
			key: br.key,
			p: br.weight / T,
			rolled: br.rolled,
			notes: br.notes,
			pos: [...new Set(state.worlds.map(({ b }) => pieces(b)))],
			checks: [...new Set(state.worlds.map(({ b }) => J(checksOf(b))))],
			result: state.result,
			state,
		}
	})
}

/**
 * The counters of a state, which must be the same in every world.
 *
 * @param {object} s state
 * @return {number[]}
 */
function counters(s) {
	const all = [...new Set(s.worlds.map(({ b }) => J(checksOf(b))))]
	expect(all).toHaveLength(1)
	return JSON.parse(all[0])
}

/**
 * The codes of the ordinary moves from one square.
 *
 * @param {object} s state
 * @param {string} from square name
 * @return {string[]}
 */
function movesFrom(s, from) {
	return legalMoves(V, s).map((m) => m.code).filter((c) => c.startsWith(from + '-')).sort()
}

/** A White queen that is 50 % on `a` and 50 % on `b`, the White king on g1 and the Black king on e8. */
function ghostQueen(a, b, extra = {}) {
	return [
		{ g1: '0:k', [a]: '0:q', e8: '1:k', ...extra },
		{ g1: '0:k', [b]: '0:q', e8: '1:k', ...extra },
	]
}

describe('three-check: declaration, start and pieces', () => {
	it('is declared as in the catalogue, with 3 to 8 rules and every piece type named and drawn', () => {
		expect(V.id).toBe('threecheck')
		expect(V.category).toBe(catalogEntry('threecheck').category)
		const rules = V.rules()
		expect(rules.length).toBeGreaterThanOrEqual(3)
		expect(rules.length).toBeLessThanOrEqual(8)
		expect(rules.every((r) => typeof r === 'string' && r.length > 10)).toBe(true)
		expect(Object.keys(V.types).sort()).toEqual(['b', 'k', 'n', 'p', 'q', 'r'])
		for (const [id, type] of Object.entries(V.types)) {
			expect(type.name()).toMatch(/^[A-Z]/)
			expect(type.glyph).toEqual({ sprite: id })
			expect(type.value).toBeGreaterThan(0)
		}
		expect([...V.royalTypes]).toEqual(['k'])
		expect([...V.solidTypes].sort()).toEqual(['k', 'p'])
		expect(V.topology.size).toBe(64)
	})

	it('starts from the orthodox position with no checks given (T14)', () => {
		const s = newGame(V)
		const b = s.worlds[0].b
		const expected = {}
		'rnbqkbnr'.split('').forEach((type, f) => {
			const file = 'abcdefgh'[f]
			expected[file + '1'] = type.toUpperCase()
			expected[file + '2'] = 'P'
			expected[file + '7'] = 'p'
			expected[file + '8'] = type
		})
		const actual = {}
		b.sq.forEach((q, id) => {
			actual[nameOf(V, q)] = b.sd[id] ? b.ty[id] : b.ty[id].toUpperCase()
		})
		expect(actual).toEqual(expected)
		expect(b.x.checks).toEqual([0, 0])
		expect(b.x.castle.map((c) => c.flag).sort()).toEqual(['K', 'Q', 'k', 'q'])
		expect(legalMoves(V, s)).toHaveLength(20)
		expect(s.result).toBeNull()
		expect(V.sideInfo(s, 0, 0)).toEqual({ text: 'Checks: 0/3', title: 'Checks given: 0 of 3' })
		expect(V.sideInfo(s, 1, 0).text).toBe('Checks: 0/3')
	})

	it('moves every piece type as in orthodox chess', () => {
		const kings = { b1: '0:k', h7: '1:k' }
		expect(movesFrom(st([{ ...kings, d4: '0:q' }]), 'd4')).toHaveLength(27)
		expect(movesFrom(st([{ ...kings, d4: '0:r' }]), 'd4')).toHaveLength(14)
		expect(movesFrom(st([{ ...kings, d4: '0:b' }]), 'd4')).toHaveLength(13)
		expect(movesFrom(st([{ ...kings, d4: '0:n' }]), 'd4')).toHaveLength(8)
		expect(movesFrom(st([{ ...kings, a1: '0:n' }]), 'a1')).toEqual(['a1-b3', 'a1-c2'])
		expect(movesFrom(st([{ e4: '0:k', e8: '1:k' }]), 'e4')).toHaveLength(8)
		// pawn: single and double step, diagonal captures only
		expect(movesFrom(st([{ ...kings, e2: '0:p', d3: '1:n', f3: '1:p' }]), 'e2'))
			.toEqual(['e2-d3', 'e2-e3', 'e2-e4', 'e2-f3'])
		expect(movesFrom(st([{ ...kings, e2: '0:p', e3: '1:n' }]), 'e2')).toEqual([])
		// Black pawns move down the board
		expect(movesFrom(st([{ ...kings, c7: '1:p' }], { turn: 1 }), 'c7')).toEqual(['c7-c5', 'c7-c6'])
		// promotion to the four pieces (T11)
		expect(movesFrom(st([{ a1: '0:k', e7: '0:p', h8: '1:k' }]), 'e7'))
			.toEqual(['e7-e8=b', 'e7-e8=n', 'e7-e8=q', 'e7-e8=r'])
	})
})

describe('three-check: what counts as a check', () => {
	it('counts a classical check and records it (T1, T29)', () => {
		let s = newGame(V)
		for (const code of ['e2-e4', 'e7-e5', 'f1-c4', 'b8-c6', 'c4-f7']) {
			s = play(V, s, code)
		}
		expect(s.worlds).toHaveLength(1)
		expect(counters(s)).toEqual([1, 0])
		expect(s.result).toBeNull()
		const h = s.history
		expect(h[4].info).toEqual({ check: 1 })
		expect(h.slice(0, 4).every((r) => !('info' in r))).toBe(true)
		expect(V.infoText(h[4], 0)).toEqual(['White gave check 1 of 3'])
		expect(V.infoText(h[3], 0)).toBeNull()
		expect(V.sideInfo(s, 0, 1)).toEqual({ text: 'Checks: 1/3', title: 'Checks given: 1 of 3' })
		expect(V.sideInfo(s, 1, 1).text).toBe('Checks: 0/3')
	})

	it('counts a double check once and a discovered check (T2, T24)', () => {
		const [dbl] = run(st([{ h1: '0:k', e1: '0:r', e4: '0:n', e8: '1:k' }]), 'e4-f6')
		expect(dbl.checks).toEqual(['[1,0]'])
		// a king move uncovers the rook's file
		const out = run(st([{ e1: '0:r', e2: '0:k', e8: '1:k' }]), 'e2-d2')
		expect(out).toHaveLength(1)
		expect(out[0].checks).toEqual(['[1,0]'])
		expect(out[0].result).toBeNull()
	})

	it('does not count a king next to the enemy king (T3)', () => {
		const [o] = run(st([{ d5: '0:k', d7: '1:k' }], { checks: [2, 0] }), 'd5-d6')
		const b = o.state.worlds[0].b
		expect(givesCheck(V, b, 0, 1)).toBe(true)
		expect(givesCheck(V, b, 0, 1, { royal: false })).toBe(false)
		expect(o.checks).toEqual(['[2,0]'])
		expect(o.result).toBeNull()
		expect(legalMoves(V, o.state).some((m) => m.code === 'd7-d6')).toBe(true)
	})

	it('counts a check left standing again, only for the mover, and for Black too (T10, T18, T12)', () => {
		expect(run(st([{ g1: '0:k', b5: '0:b', a2: '0:p', e8: '1:k' }], { checks: [1, 0] }), 'a2-a3')[0].checks)
			.toEqual(['[2,0]'])
		// the White king stays attacked by the rook: Black's counter does not move
		expect(run(st([{ e1: '0:k', a2: '0:p', e8: '1:r', h8: '1:k' }]), 'a2-a3')[0].checks).toEqual(['[0,0]'])
		expect(run(st([{ e1: '0:k', a8: '1:r', h8: '1:k' }], { turn: 1 }), 'a8-a1')[0].checks).toEqual(['[0,1]'])
	})

	it('counts a check by a piece pinned to its own king (T16)', () => {
		expect(run(st([{ e1: '0:k', c3: '0:n', e8: '1:r', f6: '1:k' }]), 'c3-e4')[0].checks).toEqual(['[1,0]'])
	})

	it('counts checks given by castling, en passant and promotion (T9, T15, T11)', () => {
		const castled = run(st([{ e1: '0:k', h1: '0:r', f8: '1:k' }], { castle: true }), 'O-O')
		expect(castled).toHaveLength(1)
		expect(castled[0].pos).toEqual(['Kg1 Rf1 kf8'])
		expect(castled[0].checks).toEqual(['[1,0]'])
		// en passant opens rank 5 for the rook
		const s = play(V, st([{ h1: '0:k', a5: '0:r', b5: '0:p', h5: '1:k', c7: '1:p' }], { turn: 1 }), 'c7-c5')
		expect(counters(s)).toEqual([0, 0])
		expect(legalMoves(V, s).some((m) => m.code === 'b5-c6' && m.kind === 'ep')).toBe(true)
		const ep = run(s, 'b5-c6')
		expect(ep[0].pos).toEqual(['Kh1 Pc6 Ra5 kh5'])
		expect(ep[0].checks).toEqual(['[1,0]'])
		expect(run(s, 'b5-b6')[0].checks).toEqual(['[0,0]'])
		// promotion: a queen or rook on e8 attacks h8 along the rank, a bishop or knight does not
		const promo = st([{ a1: '0:k', e7: '0:p', h8: '1:k' }])
		const got = Object.fromEntries(['q', 'r', 'b', 'n'].map((p) => [p, run(promo, 'e7-e8=' + p)[0].checks[0]]))
		expect(got).toEqual({ q: '[1,0]', r: '[1,0]', b: '[0,0]', n: '[0,0]' })
	})

	it('treats worlds built without counters as no checks given', () => {
		const s = stateOf(V, [[{ g1: '0:k', f1: '0:b', e8: '1:k' }, 1]])
		expect(s.worlds[0].b.x.checks).toBeUndefined()
		const after = play(V, s, 'f1-b5')
		expect(counters(after)).toEqual([1, 0])
		expect(after.history[0].info).toEqual({ check: 1 })
	})
})

describe('three-check: winning and drawing', () => {
	it('wins with the third check, even with the own king attacked (T4, T17)', () => {
		const [win] = run(st([{ a1: '0:k', d1: '0:q', h8: '1:k' }], { checks: [2, 1] }), 'd1-d8')
		expect(win.checks).toEqual(['[3,1]'])
		expect(win.result).toEqual({ winner: 0, reason: 'checks' })
		expect(legalMoves(V, win.state)).toEqual([])
		const [bold] = run(st([{ a1: '0:k', d1: '0:q', a7: '1:r', h8: '1:k' }], { checks: [2, 0] }), 'd1-d8')
		expect(bold.checks).toEqual(['[3,0]'])
		expect(bold.result).toEqual({ winner: 0, reason: 'checks' })
	})

	it('still wins by capturing the king', () => {
		const [o] = run(st([{ e1: '0:k', e2: '0:r', e8: '1:k' }], { checks: [1, 2] }), 'e2-e8')
		expect(o.result).toEqual({ winner: 0, reason: 'king' })
		expect(o.checks).toEqual(['[1,2]'])
	})

	it('draws when only the two kings are left, unless the king can be taken (T19)', () => {
		const [bare] = run(st([{ e4: '0:k', d5: '1:p', h8: '1:k' }], { checks: [1, 2] }), 'e4-d5')
		expect(bare.result).toEqual({ winner: null, reason: 'bareKings' })
		const [near] = run(st([{ e4: '0:k', d5: '1:p', e6: '1:k' }], { checks: [1, 2] }), 'e4-d5')
		expect(near.result).toBeNull()
		expect(run(near.state, 'e6-d5')[0].result).toEqual({ winner: 1, reason: 'king' })
		// a king and any other piece can still give checks: no draw
		expect(run(st([{ e4: '0:k', a2: '0:p', d5: '1:p', h8: '1:k' }]), 'e4-d5')[0].result).toBeNull()
	})

	it('leaves the escape rule and the bare-kings draw to the core\'s classic flags (LEAD-DECISIONS L1)', () => {
		expect([V.escapeRule, V.bareKingsDraw, V.drawsWait, V.specialMoves]).toEqual([true, true, true, true])
		// the variant's own hook never decides bare kings: the core does it once, for the whole state
		const bare = st([{ d5: '0:k', h8: '1:k' }], { checks: [1, 2] }).worlds[0].b
		expect(V.worldResult(bare, 0)).toBeNull()
		expect(V.worldResult(st([{ d5: '0:k', h8: '1:k' }], { checks: [1, 3] }).worlds[0].b, 0))
			.toEqual({ winner: 1, reason: 'checks' })
	})

	it('wins when the enemy king cannot escape, unless a move might give the third check (L1)', () => {
		// Qh6-g7 is a check the king on h8 cannot get out of: g7 is covered by the king on f6
		const mate = (black, checks) => {
			const worlds = black.map((extra) => ({ f6: '0:k', h6: '0:q', h8: '1:k', ...extra }))
			return run(st(worlds, { checks }), 'h6-g7')
		}
		const [second] = mate([{}], [1, 0])
		expect(second.checks).toEqual(['[2,0]'])
		expect(second.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		expect(second.state.history.at(-1).info).toEqual({ check: 2 })
		// the third check itself is reported as such
		expect(mate([{}], [2, 0])[0].result).toEqual({ winner: 0, reason: 'checks' })
		// a Black rook that could give Black's first check is no escape ...
		expect(mate([{ a2: '1:r' }], [1, 0])[0].result).toEqual({ winner: 0, reason: 'cannotEscape' })
		// ... but one that could give Black's third check is, even a ghost rook whose every move gives it 50 % only
		expect(mate([{ a2: '1:r' }], [1, 2])[0].result).toBeNull()
		const ghost = mate([{ a2: '1:r' }, { b3: '1:r' }], [1, 2])
		expect(ghost).toHaveLength(1)
		expect(ghost[0].result).toBeNull()
		// a2-a6 attacks the White king along rank 6 only where the rook really was on a2
		const third = run(ghost[0].state, 'a2-a6')
		expect(third.map((x) => [x.key, x.p, x.notes, J(x.result)])).toEqual([
			['miss', 0.5, ['solid:checks:2:2'], 'null'],
			['move', 0.5, ['solid:checks:2:3'], J({ winner: 1, reason: 'checks' })],
		])
	})

	it('names its reasons and counter rolls (T29)', () => {
		expect(V.reasonText('checks')).toBe('three checks')
		expect(V.reasonText('bareKings')).toBeNull()
		expect(V.noteText('solid:checks:1:0')).toBe('Checks: White 1, Black 0')
		expect(V.noteText('solid:checks:3:0')).toBe('Third check: White wins')
		expect(V.noteText('solid:checks:2:3')).toBe('Third check: Black wins')
		expect(V.noteText('solid:6:0k,60:1k||checks:1:0')).toBe('Checks: White 1, Black 0')
		expect(V.noteText('end:{"winner":null,"reason":"bareKings"}')).toBeNull()
		expect(V.noteText('solid:')).toBeNull()
	})
})

describe('three-check: quantum', () => {
	it('settles a split in which one half gives check at once; both halves checking keep the ghost (T5)', () => {
		const o = run(st([{ g1: '0:k', f1: '0:b', e8: '1:k' }]), 'f1-b5|d3')
		expect(o.map((x) => [x.key, x.p, x.rolled, x.notes])).toEqual([
			['split', 0.5, true, ['solid:checks:0:0']],
			['split', 0.5, true, ['solid:checks:1:0']],
		])
		expect(o[0].pos).toEqual(['Bd3 Kg1 ke8'])
		expect(o[0].checks).toEqual(['[0,0]'])
		expect(o[1].pos).toEqual(['Bb5 Kg1 ke8'])
		expect(o[1].checks).toEqual(['[1,0]'])
		const both = run(st([{ g1: '0:k', d1: '0:q', e8: '1:k' }]), 'd1-a4|h5')
		expect(both).toHaveLength(1)
		expect(both[0].rolled).toBe(false)
		expect(both[0].notes).toEqual([])
		expect(both[0].checks).toEqual(['[1,0]'])
		expect(both[0].pos.sort()).toEqual(['Kg1 Qa4 ke8', 'Kg1 Qh5 ke8'])
	})

	it('rolls a check by a ghost part: it counts only where the part really was (T6)', () => {
		const o = run(st(ghostQueen('d1', 'd3')), 'd1-h5')
		expect(o.map((x) => [x.key, x.p, x.rolled, x.notes])).toEqual([
			['move', 0.5, true, ['solid:checks:1:0']],
			['miss', 0.5, true, ['solid:checks:0:0']],
		])
		expect(o[0].pos).toEqual(['Kg1 Qh5 ke8'])
		expect(o[1].pos).toEqual(['Kg1 Qd3 ke8'])
	})

	it('ends the game only for real: a possible third check is decided by the counter roll (T8)', () => {
		const o = run(st(ghostQueen('d1', 'd3'), { checks: [2, 0] }), 'd1-h5')
		expect(o).toHaveLength(2)
		expect(o[0]).toMatchObject({ key: 'move', p: 0.5, notes: ['solid:checks:3:0'], checks: ['[3,0]'] })
		expect(o[0].result).toEqual({ winner: 0, reason: 'checks' })
		expect(V.noteText(o[0].notes[0])).toBe('Third check: White wins')
		expect(o[1]).toMatchObject({ key: 'miss', p: 0.5, notes: ['solid:checks:2:0'], checks: ['[2,0]'] })
		expect(o[1].result).toBeNull()
		expect(o[1].pos).toEqual(['Kg1 Qd3 ke8'])
		expect(mightForce(V, st(ghostQueen('d1', 'd3'), { checks: [2, 0] }), 'd1-h5')).toBe(true)
		// a first check forces too: in the Moved outcome the king can be captured for certain (the escape rule)
		expect(mightForce(V, st(ghostQueen('d1', 'd3')), 'd1-h5')).toBe(true)
		expect(mightForce(V, st(ghostQueen('d1', 'd3')), 'g1-h1')).toBe(false)
	})

	it('settles a possible blocker when a certain move checks past it (T7)', () => {
		const s = st([
			{ g1: '0:k', a1: '0:r', e5: '1:n', e8: '1:k' },
			{ g1: '0:k', a1: '0:r', c6: '1:n', e8: '1:k' },
		])
		const o = run(s, 'a1-e1')
		expect(o.map((x) => [x.key, x.p, x.rolled])).toEqual([['move', 0.5, true], ['move', 0.5, true]])
		expect(o[0].pos).toEqual(['Kg1 Re1 ke8 ne5'])
		expect(o[0].checks).toEqual(['[0,0]'])
		expect(o[1].pos).toEqual(['Kg1 Re1 ke8 nc6'])
		expect(o[1].checks).toEqual(['[1,0]'])
	})

	it('turns pass = link into a roll when the move checks only where it passed', () => {
		// the rook slides past c1, where a Black knight might be; on e1 it attacks e8
		const checking = run(st([
			{ g1: '0:k', a1: '0:r', c1: '1:n', e8: '1:k' },
			{ g1: '0:k', a1: '0:r', c6: '1:n', e8: '1:k' },
		]), 'a1-e1')
		expect(checking.map((x) => [x.key, x.p, x.rolled, x.notes])).toEqual([
			['miss', 0.5, true, ['solid:checks:0:0']],
			['move', 0.5, true, ['solid:checks:1:0']],
		])
		expect(checking[0].pos).toEqual(['Kg1 Ra1 ke8 nc1'])
		expect(checking[1].pos).toEqual(['Kg1 Re1 ke8 nc6'])
		// the same slide without a check stays linked: one outcome, the rook 50 % a1 and 50 % e1
		const linked = run(st([
			{ g1: '0:k', a1: '0:r', c1: '1:n', h8: '1:k' },
			{ g1: '0:k', a1: '0:r', c6: '1:n', h8: '1:k' },
		]), 'a1-e1')
		expect(linked).toHaveLength(1)
		expect(linked[0]).toMatchObject({ key: 'move', p: 1, rolled: false, notes: [], checks: ['[0,0]'] })
		expect(linked[0].pos.sort()).toEqual(['Kg1 Ra1 kh8 nc1', 'Kg1 Re1 kh8 nc6'])
	})

	it('never counts a check for a measurement (T13, T21)', () => {
		const base = { g1: '0:k', b5: '0:b', a2: '0:p', e8: '1:k' }
		const o = run(st([{ ...base, c1: '0:n' }, { ...base, h3: '0:n' }], { checks: [1, 0] }), '?c1')
		expect(o.map((x) => [x.key, x.p, x.notes, x.checks])).toEqual([
			['c1', 0.5, [], ['[1,0]']],
			['h3', 0.5, [], ['[1,0]']],
		])
		const ghost = st([
			{ g1: '0:k', a2: '0:p', h5: '0:q', e8: '1:k' },
			{ g1: '0:k', a2: '0:p', d1: '0:q', e8: '1:k' },
		])
		const m = run(ghost, '?d1')
		expect(m.map((x) => [x.key, x.p, x.checks])).toEqual([['d1', 0.5, ['[0,0]']], ['h5', 0.5, ['[0,0]']]])
		// any played move settles the standing ghost attacker instead (T21)
		const a = run(ghost, 'a2-a3')
		expect(a.map((x) => [x.key, x.p, x.rolled])).toEqual([['move', 0.5, true], ['move', 0.5, true]])
		expect(a[0].pos).toEqual(['Kg1 Pa3 Qh5 ke8'])
		expect(a[0].checks).toEqual(['[1,0]'])
		expect(a[1].pos).toEqual(['Kg1 Pa3 Qd1 ke8'])
		expect(a[1].checks).toEqual(['[0,0]'])
	})

	it('counts no check in a world where the move missed, even under a standing check (T20)', () => {
		const o = run(st(ghostQueen('d1', 'd3', { b5: '0:b' }), { checks: [1, 0] }), 'd1-d2')
		expect(o.map((x) => [x.key, x.p, x.rolled])).toEqual([['move', 0.5, true], ['miss', 0.5, true]])
		expect(o[0].pos).toEqual(['Bb5 Kg1 Qd2 ke8'])
		expect(o[0].checks).toEqual(['[2,0]'])
		expect(o[1].pos).toEqual(['Bb5 Kg1 Qd3 ke8'])
		expect(o[1].checks).toEqual(['[1,0]'])
		const control = run(st(ghostQueen('d1', 'd3'), { checks: [1, 0] }), 'd1-d2')
		expect(control).toHaveLength(1)
		expect(control[0]).toMatchObject({ key: 'move', rolled: false, checks: ['[1,0]'] })
		expect(control[0].pos).toHaveLength(2)
	})

	it('counts a merge like a move (T22)', () => {
		const o = run(st([{ a1: '0:k', c2: '0:q', e8: '1:k' }, { a1: '0:k', g2: '0:q', e8: '1:k' }]), 'c2|g2-e4')
		expect(o).toHaveLength(1)
		expect(o[0]).toMatchObject({ key: 'move', rolled: false, notes: [], checks: ['[1,0]'] })
		expect(o[0].state.worlds).toHaveLength(1)
	})

	it('rolls a merge onto a possible enemy by itself, with no counter roll when no check is possible', () => {
		// the player doc must not say that merges never roll: this one rolls with the Black king out of reach
		const o = run(st([
			{ a1: '0:k', c2: '0:q', h8: '1:k', g7: '1:p', h7: '1:p', e4: '1:n' },
			{ a1: '0:k', g2: '0:q', h8: '1:k', g7: '1:p', h7: '1:p', a8: '1:n' },
		]), 'c2|g2-e4')
		expect(o.map((x) => [x.key, x.p, x.rolled, x.notes, x.checks])).toEqual([
			['move', 0.5, true, [], ['[0,0]']],
			['capture', 0.5, true, [], ['[0,0]']],
		])
		expect(o[0].pos).toEqual(['Ka1 Qe4 kh8 na8 pg7 ph7'])
		expect(o[1].pos).toEqual(['Ka1 Qe4 kh8 pg7 ph7'])
	})

	it('rolls a merge that would link when it checks only where it arrived', () => {
		// the knight on d3 blocks c2-e4 in the first world only: the merge misses there
		const merge = (king) => run(st([
			{ a1: '0:k', c2: '0:q', [king]: '1:k', d3: '1:n' },
			{ a1: '0:k', c2: '0:q', [king]: '1:k', a6: '1:n' },
			{ a1: '0:k', g2: '0:q', [king]: '1:k', a6: '1:n' },
		]), 'c2|g2-e4')
		const linked = merge('h8')
		expect(linked).toHaveLength(1)
		expect(linked[0]).toMatchObject({ key: 'move', p: 1, rolled: false, notes: [], checks: ['[0,0]'] })
		expect(linked[0].pos.sort()).toEqual(['Ka1 Qc2 kh8 nd3', 'Ka1 Qe4 kh8 na6'])
		const o = merge('e8')
		expect(o.map((x) => [x.key, x.rolled, x.notes, x.pos, x.checks])).toEqual([
			['miss', true, ['solid:checks:0:0'], ['Ka1 Qc2 ke8 nd3'], ['[0,0]']],
			['move', true, ['solid:checks:1:0'], ['Ka1 Qe4 ke8 na6'], ['[1,0]']],
		])
		expect(o[0].p).toBeCloseTo(1 / 3, 6)
		expect(o[1].p).toBeCloseTo(2 / 3, 6)
	})

	it('ends the game when the move\'s own roll decides a possible third check (landing roll, no counter roll)', () => {
		// Each outcome of a landing roll has one counter in all its worlds, so no `solid:checks` note says that the
		// game ends: the preview of such an outcome reads only "Captured" or "Moved". Announcing it needs a core
		// change (`outcomes()` returning each branch's result); it relies on every world of a branch having the same
		// result, which is checked here.
		const capture = st(ghostQueen('d1', 'd3', { h5: '1:p' }), { checks: [2, 0] })
		const push = st([
			{ g1: '0:k', b5: '0:b', d4: '0:p', e8: '1:k', d5: '1:n' },
			{ g1: '0:k', b5: '0:b', d4: '0:p', e8: '1:k', a8: '1:n' },
		], { checks: [2, 0] })
		const win = J({ winner: 0, reason: 'checks' })
		for (const [s, code, expected] of [
			[capture, 'd1-h5', [['miss', '[2,0]', 'null'], ['capture', '[3,0]', win]]],
			[push, 'd4-d5', [['miss', '[2,0]', 'null'], ['move', '[3,0]', win]]],
		]) {
			const o = run(s, code)
			expect(o.map((x) => [x.key, ...x.checks, J(x.result)]), code).toEqual(expected)
			expect(o.every((x) => x.p === 0.5 && x.rolled), code).toBe(true)
			for (const br of branches(V, s, code)) {
				expect(new Set(br.worlds.map(({ b }) => J(worldResult(V, b, s.turn)))).size, code).toBe(1)
			}
		}
	})

	it('splits a ghost part under a standing check: the untouched worlds count nothing (T23)', () => {
		const o = run(st(ghostQueen('d1', 'h3', { b5: '0:b' }), { checks: [1, 0] }), 'd1-a4|d2')
		expect(o.map((x) => [x.key, x.p, x.rolled, x.checks])).toEqual([
			['split', 0.5, true, ['[2,0]']],
			['miss', 0.5, true, ['[1,0]']],
		])
		expect(o[0].pos.sort()).toEqual(['Bb5 Kg1 Qa4 ke8', 'Bb5 Kg1 Qd2 ke8'])
		expect(o[1].pos).toEqual(['Bb5 Kg1 Qh3 ke8'])
	})

	it('keeps castling certain, but rolls its check past a possible blocker (T26)', () => {
		const s = st([
			{ e1: '0:k', h1: '0:r', f8: '1:k', f5: '1:n' },
			{ e1: '0:k', h1: '0:r', f8: '1:k', a5: '1:n' },
		], { castle: true })
		const o = run(s, 'O-O')
		expect(o.map((x) => [x.key, x.p, x.rolled, x.notes])).toEqual([
			['move', 0.5, true, ['solid:checks:0:0']],
			['move', 0.5, true, ['solid:checks:1:0']],
		])
		expect(o[0].pos).toEqual(['Kg1 Rf1 kf8 nf5'])
		expect(o[1].pos).toEqual(['Kg1 Rf1 kf8 na5'])
		expect(o.every((x) => x.state.worlds.every(({ b }) => b.x.castle.length === 0))).toBe(true)
		const blocked = st([
			{ e1: '0:k', h1: '0:r', f8: '1:k', g1: '0:n' },
			{ e1: '0:k', h1: '0:r', f8: '1:k', e3: '0:n' },
		], { castle: true })
		expect(branches(V, blocked, 'O-O')).toBeNull()
	})

	it('keeps en passant certain, but rolls the check it uncovers past a possible blocker (T27)', () => {
		const base = { h1: '0:k', a5: '0:r', b5: '0:p', h5: '1:k', c5: '1:p' }
		const s = st([{ ...base, e5: '1:n' }, { ...base, e8: '1:n' }], { ep: 'c6', epVictim: 'c5' })
		const o = run(s, 'b5-c6')
		expect(o.map((x) => [x.key, x.p, x.rolled])).toEqual([['capture', 0.5, true], ['capture', 0.5, true]])
		expect(o[0].pos).toEqual(['Kh1 Pc6 Ra5 kh5 ne5'])
		expect(o[0].checks).toEqual(['[0,0]'])
		expect(o[1].pos).toEqual(['Kh1 Pc6 Ra5 kh5 ne8'])
		expect(o[1].checks).toEqual(['[1,0]'])
	})

	it('rolls a part joining another part that already gives check (T28)', () => {
		const o = run(st(ghostQueen('d1', 'h5')), 'd1-h5')
		expect(o.map((x) => [x.key, x.p, x.rolled, x.notes, x.pos])).toEqual([
			['move', 0.5, true, ['solid:checks:1:0'], ['Kg1 Qh5 ke8']],
			['miss', 0.5, true, ['solid:checks:0:0'], ['Kg1 Qh5 ke8']],
		])
		const plain = run(st(ghostQueen('d1', 'd3')), 'd1-d3')
		expect(plain).toHaveLength(1)
		expect(plain[0]).toMatchObject({ key: 'move', rolled: false, pos: ['Kg1 Qd3 ke8'] })
		expect(plain[0].state.worlds).toHaveLength(1)
	})

	it('rolls a capture that might leave the kings alone (T19, quantum)', () => {
		const s = st([
			{ e4: '0:k', d5: '1:n', h8: '1:k' },
			{ e4: '0:k', a8: '1:n', h8: '1:k' },
		], { checks: [1, 2] })
		const o = run(s, 'e4-d5')
		expect(o.map((x) => [x.key, x.p, x.rolled, x.notes, x.checks])).toEqual([
			['move', 0.5, true, [], ['[1,2]']],
			['capture', 0.5, true, [], ['[1,2]']],
		])
		expect(o[0].result).toBeNull()
		expect(o[0].pos).toEqual(['Kd5 kh8 na8'])
		expect(o[1].result).toEqual({ winner: null, reason: 'bareKings' })
	})

	it('does not reset the quiet counter for a pawn push that missed (T30)', () => {
		const s = st([
			{ g1: '0:k', e2: '0:p', e3: '1:n', e8: '1:k' },
			{ g1: '0:k', e2: '0:p', h6: '1:n', e8: '1:k' },
		])
		s.quiet = 7
		const o = run(s, 'e2-e3')
		expect(o.map((x) => [x.key, x.state.quiet])).toEqual([['miss', 8], ['move', 0]])
	})

	it('keeps its invariants in random games with splits, merges and measurements (T25)', () => {
		let rolls = 0
		let checks = 0
		for (let g = 0; g < 30; g++) {
			const rng = seededRng(4242 + g)
			let s = newGame(V)
			for (let ply = 0; ply < 120 && !s.result; ply++) {
				let codes = legalMoves(V, s).map((m) => m.code)
				if (ply % 3 === 1) {
					const froms = new Set()
					for (const { b } of s.worlds) {
						b.sq.forEach((q, id) => {
							if (q >= 0 && b.sd[id] === s.turn && V.types[b.ty[id]].splittable) {
								froms.add(q)
							}
						})
					}
					const list = [...froms]
					const f = list[Math.floor(rng() * list.length)]
					const splits = f === undefined ? [] : splitsFrom(V, s, f).map((m) => m.code)
					if (splits.length) {
						codes = splits
					}
				}
				const code = codes[Math.floor(rng() * codes.length)]
				const mover = s.turn
				const before = counters(s)
				const res = applyMove(V, s, code, rng)
				expect(res, code).not.toBeNull()
				s = res.state
				const after = counters(s)
				for (const field of ['castle', 'ep', 'epVictim']) {
					expect(new Set(s.worlds.map(({ b }) => J(b.x[field]))).size).toBe(1)
				}
				expect(after[1 - mover]).toBe(before[1 - mover])
				expect(after[mover] - before[mover]).toBeGreaterThanOrEqual(0)
				expect(after[mover] - before[mover]).toBeLessThanOrEqual(1)
				const record = s.history.at(-1)
				if (after[mover] > before[mover]) {
					checks++
					expect(record.info).toEqual({ check: after[mover] })
				} else {
					expect('info' in record).toBe(false)
				}
				for (const note of res.branch.notes.filter((n) => n.startsWith('solid:'))) {
					rolls++
					expect(note).toMatch(/^solid:checks:\d+:\d+$/)
				}
				if (after[mover] >= 3) {
					expect(s.result).toEqual({ winner: mover, reason: 'checks' })
				}
				expect(after[1 - mover]).toBeLessThan(3)
				expect(s.worlds.length).toBeLessThanOrEqual(MAX_WORLDS)
				expect(s.worlds.reduce((a, e) => a + e.w, 0)).toBe(T)
				for (const side of [0, 1]) {
					const info = budgetInfo(V, s, side)
					expect(info.used).toBeLessThanOrEqual(info.limit)
				}
			}
		}
		expect(checks).toBeGreaterThan(20)
		expect(rolls).toBeGreaterThan(5)
	})
})

describe('three-check: the computer player', () => {
	it('values checks and pressure on the enemy king, without NaN at three checks', () => {
		const quiet = st([{ g1: '0:k', f1: '0:b', a2: '0:p', e8: '1:k', h7: '1:p' }]).worlds[0].b
		expect(V.evaluate(quiet, 0)).toBe(0)
		const b = st([{ g1: '0:k', b5: '0:b', d1: '0:q', e8: '1:k' }], { checks: [1, 0] }).worlds[0].b
		expect(kingPressure(b, 0, 1)).toBe(2)
		expect(kingPressure(b, 1, 0)).toBe(0)
		expect(V.evaluate(b, 0)).toBeGreaterThan(180)
		expect(V.evaluate(b, 1)).toBe(-V.evaluate(b, 0))
		const won = st([{ g1: '0:k', e8: '1:k' }], { checks: [3, 0] }).worlds[0].b
		expect(Number.isFinite(V.evaluate(won, 0))).toBe(true)
		expect(V.evaluate(won, 0)).toBe(500)
	})

	it('plays a legal move from the start at every level within its time budget', async () => {
		for (const level of LEVELS) {
			const s = newGame(V)
			const elapsed = stopwatch()
			const code = await chooseMove(V, s, { level: level.id, rng: seededRng(7) })
			expect(elapsed()).toBeLessThan(level.timeMs + 500)
			expect(branches(V, s, code), level.id + ': ' + code).not.toBeNull()
		}
	}, 20000)

	it('gives the third check when it can, and takes a free check', async () => {
		for (const level of LEVELS) {
			const third = st([{ a1: '0:k', d1: '0:q', h8: '1:k', a7: '1:p', b7: '1:p' }], { checks: [2, 0] })
			const code = await chooseMove(V, third, { level: level.id, rng: seededRng(3), now: workClock() })
			expect(run(third, code).every((o) => J(o.result) === J({ winner: 0, reason: 'checks' })), code).toBe(true)
			const first = st([{ g1: '0:k', f1: '0:b', a2: '0:p', e8: '1:k', h7: '1:p' }])
			expect(await chooseMove(V, first, { level: level.id, rng: seededRng(3), now: workClock() })).toBe('f1-b5')
		}
	}, 20000)
})
