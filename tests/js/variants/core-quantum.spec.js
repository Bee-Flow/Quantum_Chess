/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The generic hooks and rule fixes of the quantum layer: idle worlds and
 * `applyMiss`, certain moves, `unifyWorlds`, the outcome labels after the settling rolls, compulsory capture, the
 * budget rule, king danger, the quiet counter, the history record, sitting out and the `squareView` guard.
 */

import { describe, expect, it } from 'vitest'
import { castlingMoves, KING_STEPS, orthodoxAfterMove } from '../../../src/variants/core/orthodox.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import {
	applyOutcome,
	boardView,
	branches,
	budget,
	budgetInfo,
	isCertain,
	isLegal,
	legalMoves,
	mergesFrom,
	mustCapture,
	newGame,
	outcomes,
	pieceLocations,
	royalDanger,
	splitsFrom,
	splitTargets,
	squareView,
	stateAfter,
	T,
} from '../../../src/variants/core/quantum.js'
import { rectTopology } from '../../../src/variants/core/topology.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { addPiece, cloneWorld, OFF, placePiece } from '../../../src/variants/core/world.js'
import { play, stateOf } from './helpers.js'

/**
 * An orthodox test variant. The hooks `applyMiss` and `unifyWorlds` of `orthodoxSpec()` are removed, so each test
 * sets exactly the hooks it is about.
 *
 * @param {object|((spec: object) => object)} [extra] fields to add, or a function of the declaration that returns them
 * @param {object} [opts] options for `orthodoxSpec`
 * @return {object}
 */
function variant(extra = {}, opts = {}) {
	const spec = orthodoxSpec(opts)
	delete spec.applyMiss
	delete spec.unifyWorlds
	const add = typeof extra === 'function' ? extra(spec) : extra
	return defineVariant(Object.assign(spec, { id: 'test', category: 'rules' }, add))
}

/** A plain orthodox variant without the hooks of package "world". */
const V = variant()

/**
 * The square with a name on the 8 × 8 board.
 *
 * @param {string} name square name
 * @return {number}
 */
function sq(name) {
	return V.topology.byName(name)
}

/**
 * A stub `applyMiss` that records every call in `x.idle` as `type:hit`.
 *
 * @param {object} b world
 * @param {object} action the action
 * @param {number} side side
 * @param {{hit: boolean}} info info
 * @return {object}
 */
function stubMiss(b, action, side, info) {
	const next = cloneWorld(b)
	next.x.idle = [...(b.x.idle ?? []), action.type + ':' + info.hit]
	return next
}

/**
 * Outcomes as `[key, p]` pairs.
 *
 * @param {object} W variant
 * @param {object} s state
 * @param {string} code move code
 * @return {Array<[string, number]>}
 */
function keysOf(W, s, code) {
	return outcomes(W, s, code).map((o) => [o.key, o.p])
}

/** Q1-a: a White knight on f3 or h3. */
const KNIGHT_GHOST = [
	[{ e1: '0:k', f3: '0:n', e8: '1:k' }, 1],
	[{ e1: '0:k', h3: '0:n', e8: '1:k' }, 1],
]

/** Q1-b: a White pawn on e2, a Black knight on e3 (A) or a6 (B). */
const BLOCKED_PAWN = [
	[{ e1: '0:k', e2: '0:p', e8: '1:k', e3: '1:n' }, 1],
	[{ e1: '0:k', e2: '0:p', e8: '1:k', a6: '1:n' }, 1],
]

/** Q6-a: a White rook on a1, a Black knight on a4 (A) or c6 (B). */
const ROOK_FILE = [
	[{ e1: '0:k', a1: '0:r', e8: '1:k', a4: '1:n' }, 1],
	[{ e1: '0:k', a1: '0:r', e8: '1:k', c6: '1:n' }, 1],
]

/**
 * A castling right K (e1, h1 to g1, f1) in every world.
 *
 * @param {object} w world
 */
function rightK(w) {
	w.x = { ep: -1, epVictim: -1, castle: [{ flag: 'K', side: 0, king: 4, rook: 7, kingTo: 6, rookTo: 5 }] }
}

describe('Q1 idle worlds and applyMiss', () => {
	const W = variant({ applyMiss: stubMiss })

	it('a: passes the idle world of a link with hit true', () => {
		const s = stateOf(W, KNIGHT_GHOST)
		const list = branches(W, s, 'f3-e5')
		expect(list).toHaveLength(1)
		const idle = list[0].worlds.find((e) => e.b.board[sq('h3')] >= 0)
		const moved = list[0].worlds.find((e) => e.b.board[sq('e5')] >= 0)
		expect(idle.idle).toBe(true)
		expect(idle.b.x.idle).toEqual(['move:true'])
		expect(moved.b.x.idle).toBeUndefined()
		// the state after it, also in light mode, holds the hooked world
		const light = stateAfter(W, s, 'f3-e5', list[0], list, { light: true })
		for (const next of [applyOutcome(W, s, 'f3-e5', 0), light]) {
			expect(next.worlds.map((e) => e.b.x.idle ?? null).sort()).toEqual([['move:true'], null])
		}
	})

	it('b: passes the worlds of a rolled Missed branch with hit false', () => {
		const s = stateOf(W, BLOCKED_PAWN)
		const list = branches(W, s, 'e2-e3')
		expect(list.map((b) => b.key)).toEqual(['miss', 'move'])
		expect(list[0].worlds.map((e) => e.b.x.idle)).toEqual([['move:false']])
		expect(list[1].worlds.every((e) => !e.idle && e.b.x.idle === undefined)).toBe(true)
	})

	it('c: passes every world of a Measure with hit false', () => {
		const s = stateOf(W, KNIGHT_GHOST)
		const list = branches(W, s, '?f3')
		expect(list.map((b) => b.key)).toEqual(['f3', 'h3'])
		for (const br of list) {
			for (const e of br.worlds) {
				expect(e.b.x.idle).toEqual(['measure:false'])
			}
		}
	})

	it('d: passes the idle child of a split with hit true', () => {
		const s = stateOf(W, ROOK_FILE)
		const list = branches(W, s, 'a1-a3|a5')
		expect(list).toHaveLength(1)
		const worlds = list[0].worlds
		expect(worlds).toHaveLength(4)
		const idle = worlds.filter((e) => e.idle)
		expect(idle).toHaveLength(1)
		expect(idle[0].b.board[sq('a1')]).toBeGreaterThanOrEqual(0)
		expect(idle[0].b.board[sq('a4')]).toBeGreaterThanOrEqual(0)
		expect(idle[0].b.x.idle).toEqual(['split:true'])
		expect(worlds.filter((e) => !e.idle).every((e) => e.b.x.idle === undefined)).toBe(true)
	})

	it('e: keeps the world objects when the hook returns them, and changes nothing without the hook', () => {
		const same = variant({ applyMiss: (b) => b })
		const s = stateOf(same, KNIGHT_GHOST)
		const idle = branches(same, s, 'f3-e5')[0].worlds.find((e) => e.idle)
		expect(idle.b).toBe(s.worlds[1].b)
		expect(outcomes(V, stateOf(V, KNIGHT_GHOST), 'f3-e5'))
			.toEqual([{ key: 'move', notes: [], p: 1, captures: [], rolled: false }])
		expect(outcomes(V, stateOf(V, BLOCKED_PAWN), 'e2-e3').map((o) => [o.key, o.p, o.rolled]))
			.toEqual([['miss', 0.5, true], ['move', 0.5, true]])
	})

	it('f: checks the budget fallback on the worlds after the hook', () => {
		const worlds = [
			[{ e1: '0:k', a1: '0:r', e8: '1:k', a4: '1:n' }, 1],
			[{ e1: '0:k', a1: '0:r', e8: '1:k', a3: '1:n' }, 1],
			[{ e1: '0:k', a1: '0:r', e8: '1:k', c6: '1:n' }, 1],
		]
		const plain = variant({ budgetRule: () => ({ limit: 2 }) })
		const one = outcomes(plain, stateOf(plain, worlds), 'a1-a6')
		expect(one.map((o) => [o.key, o.rolled])).toEqual([['move', false]])
		const W2 = variant((spec) => ({
			budgetRule: () => ({ limit: 2 }),
			applyMiss(b, action, side, info) {
				if (!info.hit) {
					return b
				}
				// a White bishop appears on the square above the Black knight
				const next = cloneWorld(b)
				const knight = next.ty.indexOf('n')
				addPiece(next, 'b', 0, spec.topology.step(next.sq[knight], [0, 1]))
				return next
			},
		}))
		const s = stateOf(W2, worlds)
		const list = branches(W2, s, 'a1-a6')
		expect(list.map((b) => b.key)).toEqual(['miss', 'move'])
		expect(list[0].weight / T).toBeCloseTo(2 / 3, 6)
		expect(list[1].weight / T).toBeCloseTo(1 / 3, 6)
		expect(list[0].worlds).toHaveLength(2)
		expect(list[0].worlds.every((e) => !e.b.ty.includes('b'))).toBe(true)
	})

	it('g: decides hit before the settling rolls, so a final Missed part can hold a world built with hit true', () => {
		const W2 = variant((spec) => ({
			applyMiss: stubMiss,
			solidExtra: (b) => 'e5:' + (b.board[spec.topology.byName('e5')] >= 0),
		}))
		const list = branches(W2, stateOf(W2, KNIGHT_GHOST), 'f3-e5')
		expect(list.map((b) => [b.key, b.rolled])).toEqual([['move', true], ['miss', true]])
		expect(list[0].worlds.map((e) => e.b.x.idle)).toEqual([undefined])
		expect(list[1].worlds.map((e) => e.b.x.idle)).toEqual([['move:true']])
	})

	it('h: runs twice on one idle world when a link over the budget is rolled, and keeps the second result', () => {
		const calls = []
		const W2 = variant({
			budgetRule: () => ({ limit: 1 }),
			applyMiss(b, action, side, info) {
				calls.push([action.type, side, info.hit])
				return info.hit ? { ...b, x: { ...b.x, first: true } } : b
			},
		})
		const s = stateOf(W2, ROOK_FILE)
		const list = branches(W2, s, 'a1-a8')
		expect(calls).toEqual([['move', 0, true], ['move', 0, false]])
		expect(list.map((b) => [b.key, b.rolled])).toEqual([['miss', true], ['move', true]])
		expect(list[0].worlds.map((e) => e.b)).toEqual([s.worlds[0].b])
		expect(list[0].worlds[0].b).toBe(s.worlds[0].b)
	})
})

describe('Q2 certain moves', () => {
	it('helper: castling and en passant are certain unless a move says otherwise', () => {
		expect(isCertain({ kind: 'castle' })).toBe(true)
		expect(isCertain({ kind: 'ep' })).toBe(true)
		expect(isCertain({ kind: 'normal' })).toBe(false)
		expect(isCertain({ kind: 'castle', certain: false })).toBe(false)
		expect(isCertain({ kind: 'special', certain: true })).toBe(true)
	})

	it('a: castling past a possible ghost is illegal', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', h1: '0:r', g1: '0:n', e8: '1:k' }, 1],
			[{ e1: '0:k', h1: '0:r', e3: '0:n', e8: '1:k' }, 1],
		], 0, rightK)
		expect(legalMoves(V, s).map((m) => m.code)).not.toContain('O-O')
		expect(branches(V, s, 'O-O')).toBeNull()
	})

	it('b: castling possible in every world has one certain outcome', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', h1: '0:r', e3: '0:n', e8: '1:k' }, 1],
			[{ e1: '0:k', h1: '0:r', c3: '0:n', e8: '1:k' }, 1],
		], 0, rightK)
		expect(outcomes(V, s, 'O-O')).toEqual([{ key: 'move', notes: [], p: 1, captures: [], rolled: false }])
	})

	it('c: en passant needs the square in every world', () => {
		const worlds = [
			[{ e1: '0:k', e5: '0:p', a3: '0:n', e8: '1:k', d5: '1:p' }, 1],
			[{ e1: '0:k', e5: '0:p', h3: '0:n', e8: '1:k', d5: '1:p' }, 1],
		]
		const stale = stateOf(V, worlds, 0, (w) => {
			const open = w.board[sq('a3')] >= 0
			w.x = { ep: open ? sq('d6') : -1, epVictim: open ? sq('d5') : -1, castle: [] }
		})
		expect(branches(V, stale, 'e5-d6')).toBeNull()
		expect(legalMoves(V, stale).map((m) => m.code)).not.toContain('e5-d6')
		const both = stateOf(V, worlds, 0, (w) => {
			w.x = { ep: sq('d6'), epVictim: sq('d5'), castle: [] }
		})
		expect(keysOf(V, both, 'e5-d6')).toEqual([['capture', 1]])
	})

	it('d: a castling move with certain false is rolled as before', () => {
		const W = variant((spec) => ({
			extraMoves: (w, side) => castlingMoves(spec, w, side).map((m) => ({ ...m, certain: false })),
		}))
		const s = stateOf(W, [
			[{ e1: '0:k', h1: '0:r', g1: '0:n', e8: '1:k' }, 1],
			[{ e1: '0:k', h1: '0:r', e3: '0:n', e8: '1:k' }, 1],
		], 0, rightK)
		expect(outcomes(W, s, 'O-O').map((o) => [o.key, o.p, o.rolled]))
			.toEqual([['miss', 0.5, true], ['move', 0.5, true]])
	})

	it('e: a special move with certain true needs every world', () => {
		const W = variant((spec) => ({
			extraMoves(w, side) {
				const a3 = spec.topology.byName('a3')
				const king = w.board[spec.topology.byName('e1')]
				if (side !== 0 || w.board[a3] < 0 || king < 0) {
					return []
				}
				const move = { key: 'e1>e3', from: w.sq[king], to: spec.topology.byName('e3'), id: king, capture: -1 }
				return [{ ...move, promo: null, drop: null, kind: 'special', certain: true }]
			},
		}))
		const ghost = stateOf(W, [
			[{ e1: '0:k', a3: '0:n', e8: '1:k' }, 1],
			[{ e1: '0:k', h3: '0:n', e8: '1:k' }, 1],
		])
		expect(branches(W, ghost, 'e1>e3')).toBeNull()
		const solid = stateOf(W, [[{ e1: '0:k', a3: '0:n', e8: '1:k' }, 1]])
		expect(keysOf(W, solid, 'e1>e3')).toEqual([['move', 1]])
	})

	it('f: a key that is castling in one world and a king step in another is illegal', () => {
		const W = variant((spec) => ({
			extraMoves(w, side) {
				const e1 = spec.topology.byName('e1')
				const f1 = spec.topology.byName('f1')
				const king = w.board[e1]
				const rook = w.board[f1]
				if (side !== 0 || king < 0 || rook < 0 || w.ty[king] !== 'k' || w.ty[rook] !== 'r') {
					return []
				}
				const extra = { rook: { id: rook, to: e1 }, kingTo: f1 }
				const move = { key: 'e1-f1', from: e1, to: f1, id: king, capture: -1, promo: null, drop: null }
				return [{ ...move, kind: 'castle', extra }]
			},
		}))
		const mixed = stateOf(W, [
			[{ e1: '0:k', f1: '0:r', e8: '1:k' }, 1],
			[{ e1: '0:k', h1: '0:r', e8: '1:k' }, 1],
		])
		expect(branches(W, mixed, 'e1-f1')).toBeNull()
		const swap = stateOf(W, [
			[{ e1: '0:k', f1: '0:r', e8: '1:k', a6: '1:n' }, 1],
			[{ e1: '0:k', f1: '0:r', e8: '1:k', c6: '1:n' }, 1],
		])
		expect(keysOf(W, swap, 'e1-f1')).toEqual([['move', 1]])
		const after = play(W, swap, 'e1-f1')
		for (const { b } of after.worlds) {
			expect(b.ty[b.board[sq('f1')]]).toBe('k')
			expect(b.ty[b.board[sq('e1')]]).toBe('r')
		}
	})

	it('g: a certain move is never a split path', () => {
		const W = variant((spec) => ({
			extraMoves(w, side) {
				const knight = w.board[spec.topology.byName('g1')]
				if (side !== 0 || knight < 0 || w.ty[knight] !== 'n') {
					return []
				}
				const to = spec.topology.byName('g3')
				const move = { key: 'g1>g3', from: w.sq[knight], to, id: knight, capture: -1 }
				return [{ ...move, promo: null, drop: null, kind: 'special', certain: true }]
			},
		}))
		const s = stateOf(W, [[{ a1: '0:k', g1: '0:n', a8: '1:k' }, 1]])
		expect(isLegal(W, s, 'g1>g3')).toBe(true)
		expect(splitTargets(W, s, sq('g1'))).toEqual([sq('e2'), sq('f3'), sq('h3')])
	})
})

describe('Q3 unifyWorlds', () => {
	/**
	 * Two worlds that differ only in `x.tag`.
	 *
	 * @param {object} W variant
	 * @return {object}
	 */
	function tagged(W) {
		const s = stateOf(W, [[{ e1: '0:k', e8: '1:k' }, 1], [{ e1: '0:k', e8: '1:k' }, 1]])
		s.worlds.forEach((e, i) => {
			e.b.x.tag = i === 0 ? 'a' : 'b'
		})
		return s
	}

	it('a: merges the worlds that become identical', () => {
		const W = variant({
			unifyWorlds: (bs) => bs.map((b) => (b.x.tag === 'z' ? b : { ...b, x: { ...b.x, tag: 'z' } })),
		})
		const after = play(W, tagged(W), 'e1-d1')
		expect(after.worlds).toEqual([expect.objectContaining({ w: T })])
		expect(after.worlds[0].b.x.tag).toBe('z')
	})

	it('b: sees only the worlds of the chosen branch, with the mover', () => {
		const calls = []
		const W = variant({
			unifyWorlds(bs, mover) {
				calls.push([bs.length, mover])
				return bs
			},
		})
		const s = stateOf(W, BLOCKED_PAWN)
		applyOutcome(W, s, 'e2-e3', 0)
		expect(calls).toEqual([[1, 0]])
		const list = branches(W, s, 'e2-e3')
		stateAfter(W, s, 'e2-e3', list[1], list, { light: true })
		expect(calls).toEqual([[1, 0], [1, 0]])
	})

	it('c: without the hook the worlds stay as they are', () => {
		expect(play(V, tagged(V), 'e1-d1').worlds).toHaveLength(2)
	})
})

describe('Q4 outcome labels and notes after the settling rolls', () => {
	it('a: a solid roll gives each part its own key and a short note', () => {
		const W = variant((spec) => ({ solidExtra: (b) => 'e5:' + (b.board[spec.topology.byName('e5')] >= 0) }))
		const s = stateOf(W, KNIGHT_GHOST)
		expect(outcomes(W, s, 'f3-e5').map((o) => ({ key: o.key, notes: o.notes, p: o.p }))).toEqual([
			{ key: 'move', notes: ['solid:e5:true'], p: 0.5 },
			{ key: 'miss', notes: ['solid:e5:false'], p: 0.5 },
		])
	})

	it('b: a split part made only of idle worlds is a miss', () => {
		const W = variant((spec) => ({
			afterMove(next, m) {
				orthodoxAfterMove(spec, next, m)
				next.x.n = (next.x.n ?? 0) + 1
			},
			solidExtra: (b) => 'n' + (b.x.n ?? 0),
		}))
		const s = stateOf(W, KNIGHT_GHOST)
		expect(keysOf(W, s, 'f3-e5|g5')).toEqual([['split', 0.5], ['miss', 0.5]])
		// without applyMiss the Missed part keeps its world as it was: nothing happened there
		const list = branches(W, s, 'f3-e5|g5')
		expect(list.map((b) => [b.key, b.worlds.length, b.notes])).toEqual([
			['split', 2, ['solid:n1']],
			['miss', 1, ['solid:n0']],
		])
		expect(list[1].worlds[0].b).toBe(s.worlds[1].b)
	})

	it('b: an idle split part stays a miss when the game-end roll splits it again', () => {
		const W = variant((spec) => ({
			afterMove(next, m) {
				orthodoxAfterMove(spec, next, m)
				next.x.n = (next.x.n ?? 0) + 1
			},
			solidExtra: (b) => 'n' + (b.x.n ?? 0),
			worldResult: (b) => (b.x.flag ? { winner: 0, reason: 'flag' } : null),
		}))
		const s = stateOf(W, [KNIGHT_GHOST[0], KNIGHT_GHOST[1], KNIGHT_GHOST[1]])
		s.worlds[2].b.x.flag = true
		expect(outcomes(W, s, 'f3-e5|g5').map((o) => [o.key, o.notes.at(-1)])).toEqual([
			['split', 'solid:n1'],
			['miss', 'end:null'],
			['miss', 'end:{"winner":0,"reason":"flag"}'],
		])
	})

	it('c: a game-end roll relabels the parts too and keeps the end note', () => {
		const W = variant((spec) => ({
			worldResult(b) {
				const id = b.board[spec.topology.byName('e5')]
				return id >= 0 && b.ty[id] === 'n' ? { winner: 0, reason: 'outpost' } : null
			},
		}))
		const s = stateOf(W, KNIGHT_GHOST)
		expect(outcomes(W, s, 'f3-e5').map((o) => [o.key, o.notes])).toEqual([
			['move', ['end:{"winner":0,"reason":"outpost"}']],
			['miss', ['end:null']],
		])
	})
})

describe('Q5 compulsory capture', () => {
	/**
	 * An antichess-like test variant: captures only when a capture exists in the world, no royal king.
	 *
	 * @param {boolean} compulsory whether the capture is compulsory over the whole state
	 * @return {object}
	 */
	function anti(compulsory) {
		return variant({
			compulsoryCapture: compulsory,
			filterMoves(w, side, list) {
				const caps = list.filter((m) => m.capture >= 0)
				return caps.length ? caps : list
			},
		}, { royalKing: false })
	}
	const worlds = [
		[{ h1: '0:k', a1: '0:r', c2: '0:p', h8: '1:k', a8: '1:n' }, 1],
		[{ h1: '0:k', a1: '0:r', c2: '0:p', h8: '1:k', c6: '1:n' }, 1],
	]

	it('a: only moves that might capture are legal', () => {
		const W = anti(true)
		const s = stateOf(W, worlds)
		expect(mustCapture(W, s)).toBe(true)
		expect(legalMoves(W, s, { splits: true }).map((m) => m.code)).toEqual(['a1-a8'])
		expect(keysOf(W, s, 'a1-a8')).toEqual([['move', 0.5], ['capture', 0.5]])
		expect(branches(W, s, 'c2-c3')).toBeNull()
		expect(splitsFrom(W, s, sq('a1'))).toEqual([])
		expect(splitTargets(W, s, sq('a1'))).toEqual([])
		expect(branches(W, s, 'a1-a2|a3')).toBeNull()
	})

	it('b: without the flag everything stays legal', () => {
		const W = anti(false)
		const s = stateOf(W, worlds)
		expect(W.compulsoryCapture).toBe(false)
		expect(mustCapture(W, s)).toBe(false)
		expect(isLegal(W, s, 'c2-c3')).toBe(true)
	})

	it('c: no Measure and no quiet merge, but a merge onto an enemy stays legal', () => {
		const ghost = [
			[{ e1: '0:k', c3: '0:n', e8: '1:k', d5: '1:p' }, 1],
			[{ e1: '0:k', e3: '0:n', e8: '1:k', d5: '1:p' }, 1],
		]
		const W = variant({ compulsoryCapture: true })
		const s = stateOf(W, ghost)
		expect(mustCapture(W, s)).toBe(true)
		const codes = legalMoves(W, s).map((m) => m.code)
		expect(codes).toContain('c3|e3-d5')
		expect(codes).not.toContain('c3|e3-d1')
		expect(codes).not.toContain('?c3')
		expect(codes.filter((c) => !c.includes('|')).sort()).toEqual(['c3-d5', 'e3-d5'])
		expect(mergesFrom(W, s, sq('c3')).map((m) => m.code)).toEqual(['c3|e3-d5'])
		expect(branches(W, s, 'c3|e3-d1')).toBeNull()
		expect(branches(W, s, '?c3')).toBeNull()
		const free = stateOf(V, ghost)
		expect(legalMoves(V, free).map((m) => m.code)).toEqual(expect.arrayContaining(['c3|e3-d1', '?c3']))
	})
})

describe('Q6 budget rule', () => {
	it('a: a lower limit turns a link into a roll', () => {
		const W = variant({ budgetRule: () => ({ limit: 1 }) })
		expect(keysOf(W, stateOf(W, ROOK_FILE), 'a1-a8')).toEqual([['miss', 0.5], ['move', 0.5]])
		expect(outcomes(V, stateOf(V, ROOK_FILE), 'a1-a8').map((o) => [o.key, o.rolled])).toEqual([['move', false]])
	})

	it('b: a team budget counts both sides together', () => {
		const W = variant({ budgetRule: () => ({ sides: [0, 1], limit: 2 }) })
		const s = play(W, newGame(W), 'g1-f3|h3')
		expect(isLegal(W, s, 'g8-f6|h6')).toBe(false)
		expect(isLegal(V, play(V, newGame(V), 'g1-f3|h3'), 'g8-f6|h6')).toBe(true)
		expect(budgetInfo(W, s, 1)).toEqual({ used: 2, limit: 2, sides: [0, 1] })
		expect(budget(s, 1)).toBe(1)
	})

	it('b: a team arrangement tells the sides apart', () => {
		const W = variant({ budgetRule: () => ({ sides: [0, 1] }) })
		const s = stateOf(W, [
			[{ e1: '0:k', c3: '0:n', e8: '1:k', f6: '1:n' }, 1],
			[{ e1: '0:k', f6: '0:n', e8: '1:k', c3: '1:n' }, 1],
		])
		expect(budgetInfo(W, s, 0)).toEqual({ used: 2, limit: 8, sides: [0, 1] })
	})

	it('c: the default is the side alone with the limit of 8', () => {
		expect(budgetInfo(V, newGame(V), 0)).toEqual({ used: 1, limit: 8, sides: [0] })
		const s = play(V, newGame(V), 'g1-f3|h3')
		expect(budgetInfo(V, s, 0)).toEqual({ used: budget(s, 0), limit: 8, sides: [0] })
	})
})

describe('Q7 king danger', () => {
	/** A mini-atomic variant: a capture removes the capturer and every non-pawn piece next to the capture square. */
	const atomic = variant((spec) => ({
		afterMove(next, m) {
			orthodoxAfterMove(spec, next, m)
			if (m.capture < 0) {
				return
			}
			const [x, y] = spec.topology.coords[m.to]
			placePiece(next, m.id, OFF)
			for (let id = 0; id < next.sq.length; id++) {
				const s = next.sq[id]
				if (s < 0 || next.ty[id] === 'p') {
					continue
				}
				const [a, c] = spec.topology.coords[s]
				if (Math.abs(a - x) <= 1 && Math.abs(c - y) <= 1) {
					placePiece(next, id, OFF)
				}
			}
		},
	}))

	it('a: counts a capture that leaves the side without a royal piece', () => {
		const s = stateOf(atomic, [[{ e1: '0:k', d2: '0:n', e8: '1:k', d8: '1:r' }, 1]], 1)
		expect(royalDanger(atomic, s, 0)).toBe(1)
		expect(royalDanger(V, stateOf(V, [[{ e1: '0:k', d2: '0:n', e8: '1:k', d8: '1:r' }, 1]], 1), 0)).toBe(0)
	})

	it('b: weighs that capture by its worlds', () => {
		const s = stateOf(atomic, [
			[{ e1: '0:k', d2: '0:n', e8: '1:k', d8: '1:r' }, 1],
			[{ e1: '0:k', d2: '0:n', e8: '1:k', h8: '1:r' }, 1],
		], 1)
		expect(royalDanger(atomic, s, 0)).toBe(0.5)
	})

	it('c: a variant without royal types has no danger', () => {
		const W = variant({}, { royalKing: false })
		const s = stateOf(W, [[{ e1: '0:k', a1: '0:r', e8: '1:k', e5: '1:r' }, 1]], 1)
		expect(royalDanger(W, s, 0)).toBe(0)
		expect(royalDanger(V, stateOf(V, [[{ e1: '0:k', a1: '0:r', e8: '1:k', e5: '1:r' }, 1]], 1), 0)).toBe(1)
	})

	it('d: counts converging captures', () => {
		const two = [
			[{ a1: '0:k', d4: '0:q', h8: '1:k' }, 1],
			[{ a1: '0:k', h5: '0:q', h8: '1:k' }, 1],
		]
		expect(royalDanger(V, stateOf(V, two, 1), 1)).toBe(1)
		expect(royalDanger(V, stateOf(V, two, 0), 1)).toBe(1)
		const three = [...two, [{ a1: '0:k', a2: '0:q', h8: '1:k' }, 1]]
		expect(royalDanger(V, stateOf(V, three, 1), 1)).toBeCloseTo(2 / 3, 6)
		expect(keysOf(V, stateOf(V, three, 0), 'd4|h5-h8').map(([k]) => k)).toEqual(['miss', 'capture'])
	})
})

describe('Q8 the quiet counter', () => {
	it('a: a missed pawn push does not reset the counter', () => {
		const s = { ...stateOf(V, BLOCKED_PAWN), quiet: 7 }
		expect(applyOutcome(V, s, 'e2-e3', 0).quiet).toBe(8)
		expect(applyOutcome(V, s, 'e2-e3', 1).quiet).toBe(0)
	})

	it('b: the type flag resetsQuiet decides for a non-royal king', () => {
		const lazy = variant((spec) => {
			spec.types.k.resetsQuiet = false
			return {}
		}, { royalKing: false })
		const plain = variant({}, { royalKing: false })
		expect(lazy.quietTypes.has('k')).toBe(false)
		expect(plain.quietTypes.has('k')).toBe(true)
		expect([...V.quietTypes]).toEqual(['p'])
		const at = (W) => ({ ...stateOf(W, [[{ e1: '0:k', e8: '1:k' }, 1]]), quiet: 5 })
		expect(play(lazy, at(lazy), 'e1-d1').quiet).toBe(6)
		expect(play(plain, at(plain), 'e1-d1').quiet).toBe(0)
	})

	it('c: a capture resets, a link, a split and a Measure add one', () => {
		const cap = { ...stateOf(V, [[{ e1: '0:k', a1: '0:r', e8: '1:k', a8: '1:n' }, 1]]), quiet: 3 }
		expect(play(V, cap, 'a1-a8').quiet).toBe(0)
		const link = { ...stateOf(V, ROOK_FILE), quiet: 3 }
		expect(play(V, link, 'a1-a8').quiet).toBe(4)
		expect(play(V, { ...stateOf(V, KNIGHT_GHOST), quiet: 3 }, '?f3').quiet).toBe(4)
		expect(play(V, newGame(V), 'g1-f3|h3').quiet).toBe(1)
		expect(play(V, newGame(V), 'e2-e4').quiet).toBe(0)
	})
})

describe('Q9 the history record', () => {
	it('a: records the squares of every kind of move', () => {
		const last = (s) => s.history.at(-1)
		let s = play(V, newGame(V), 'e2-e4')
		expect(last(s)).toMatchObject({ from: [sq('e2')], to: [sq('e4')] })
		s = play(V, s, 'e7-e5')
		s = play(V, s, 'g1-f3|h3')
		expect(last(s)).toMatchObject({ from: [sq('g1')], to: [sq('f3'), sq('h3')] })
		s = play(V, s, 'd7-d6')
		s = play(V, s, 'f3|h3-g1')
		expect(last(s)).toMatchObject({ from: [sq('f3'), sq('h3')], to: [sq('g1')] })
		expect(last(play(V, stateOf(V, KNIGHT_GHOST), '?f3'))).toMatchObject({ from: [sq('f3')], to: [] })
		const castle = stateOf(V, [[{ e1: '0:k', h1: '0:r', e8: '1:k' }, 1]], 0, rightK)
		expect(last(play(V, castle, 'O-O'))).toMatchObject({ from: [sq('e1')], to: [sq('g1')] })
	})

	it('b: stores the variant record info, not in light mode, and nothing for null', () => {
		const calls = []
		const W = variant({
			recordInfo(prev, code, branch, next) {
				calls.push([prev.ply, code, branch.key, next.turn])
				return code === 'e2-e4' ? { note: 'x' } : null
			},
		})
		const s = play(W, newGame(W), 'e2-e4')
		expect(s.history.at(-1).info).toEqual({ note: 'x' })
		expect(calls).toEqual([[0, 'e2-e4', 'move', 1]])
		const t = play(W, s, 'e7-e5')
		expect('info' in t.history.at(-1)).toBe(false)
		const list = branches(W, t, 'd2-d4')
		const light = stateAfter(W, t, 'd2-d4', list[0], list, { light: true })
		expect(calls).toHaveLength(2)
		expect(light.history).toBe(t.history)
	})
})

describe('Q10 a side that cannot move sits out', () => {
	/**
	 * A toy variant on a 4 × 1 board: side 0 has a king-like piece, side 1 a piece without moves; no royal types.
	 *
	 * @param {object} [extra] fields to add
	 * @param {object} [kingMove] the movement descriptor of the side-0 piece
	 * @return {object}
	 */
	function toy(extra = {}, kingMove = { leap: [[1, 0], [-1, 0]] }) {
		return defineVariant({
			id: 'toy',
			category: 'rules',
			sides: [{ id: 'a', name: 'A', color: 'white' }, { id: 'b', name: 'B', color: 'black' }],
			topology: rectTopology(4, 1),
			types: { k: { moves: [kingMove], solid: true }, w: { solid: true } },
			setup: () => null,
			...extra,
		})
	}
	const start = [[{ a1: '0:k', d1: '1:w' }, 1]]

	it('passes the turn of a stuck side on to the next side that can move', () => {
		const W = toy({ passWhenStuck: true })
		const s = play(W, stateOf(W, start), 'a1-b1')
		expect(s.turn).toBe(0)
		expect(s.result).toBeNull()
		expect(s.ply).toBe(1)
		expect(s.history.at(-1).skipped).toEqual([1])
		const byFunction = toy({ passWhenStuck: (next) => next.turn === 1 })
		expect(play(byFunction, stateOf(byFunction, start), 'a1-b1').turn).toBe(0)
	})

	it('keeps the noMoves draw without the flag', () => {
		for (const W of [toy(), toy({ passWhenStuck: () => false })]) {
			const s = play(W, stateOf(W, start), 'a1-b1')
			expect(s.result).toEqual({ winner: null, reason: 'noMoves' })
			expect(s.turn).toBe(1)
			expect('skipped' in s.history.at(-1)).toBe(false)
		}
	})

	it('passes every world of a skipped turn through applyMiss', () => {
		const seen = []
		const W = toy({
			passWhenStuck: true,
			applyMiss(b, action, side) {
				if (action.type !== 'pass') {
					return b
				}
				seen.push([side, action.code])
				const next = cloneWorld(b)
				next.x.passes = (b.x.passes ?? 0) + 1
				return next
			},
		})
		const s = play(W, stateOf(W, start), 'a1-b1')
		expect(s.worlds.every((e) => e.b.x.passes === 1)).toBe(true)
		expect(s.worlds.reduce((a, e) => a + e.w, 0)).toBe(T)
		expect(seen).toEqual([[1, null]])
	})

	it('calls recordInfo once, after the sit-out, with the worlds of the outcome before unifyWorlds', () => {
		const calls = []
		const W = toy({
			passWhenStuck: true,
			unifyWorlds: (bs) => bs.map((b) => ({ ...b, x: { ...b.x, unified: true } })),
			recordInfo(prev, code, branch, next) {
				const record = next.history.at(-1)
				calls.push({
					turn: next.turn,
					skipped: record.skipped,
					info: 'info' in record,
					unified: branch.worlds.map((e) => e.b.x.unified ?? false),
				})
				return { turn: next.turn }
			},
		})
		const s = play(W, stateOf(W, start), 'a1-b1')
		expect(calls).toEqual([{ turn: 0, skipped: [1], info: false, unified: [false] }])
		expect(s.history.at(-1)).toMatchObject({ skipped: [1], info: { turn: 0 } })
		expect(s.worlds.every((e) => e.b.x.unified)).toBe(true)
	})

	it('gives noMoves to the state before any pass when no side can move', () => {
		const W = toy({
			passWhenStuck: true,
			applyMiss(b, action) {
				return action.type === 'pass' ? { ...b, x: { ...b.x, passes: 1 } } : b
			},
		}, { leap: [[1, 0]], mode: 'move' })
		const s = play(W, stateOf(W, [[{ a1: '0:k', c1: '1:w' }, 1]]), 'a1-b1')
		expect(s.result).toEqual({ winner: null, reason: 'noMoves' })
		expect(s.turn).toBe(1)
		expect(s.worlds.every((e) => e.b.x.passes === undefined)).toBe(true)
		expect('skipped' in s.history.at(-1)).toBe(false)
	})
})

describe('Q11 squareView guard', () => {
	it('shows squares beyond the board as empty', () => {
		const s = newGame(V)
		expect(squareView(s, V.topology.size + 5)).toEqual([])
		const view = boardView(s, V.topology.size + 10)
		expect(view).toHaveLength(V.topology.size + 10)
		expect(view.slice(V.topology.size)).toEqual(new Array(10).fill([]))
	})
})

describe('Q12 declaration defaults', () => {
	it('fills in the new fields', () => {
		expect(V.compulsoryCapture).toBe(false)
		expect(V.passWhenStuck).toBe(false)
		expect(V.quietTypes).toBeInstanceOf(Set)
	})
})

describe('Q13 parts with different faces cannot merge', () => {
	/**
	 * A test variant with a splittable piece `s` and its promoted face `+s`.
	 *
	 * @return {object}
	 */
	function faces() {
		return variant((spec) => {
			spec.types.s = { moves: [{ leap: KING_STEPS }] }
			spec.types['+s'] = { moves: [{ leap: KING_STEPS }] }
			return {}
		})
	}

	it('refuses the merge of two faces, but still offers Measure', () => {
		const W = faces()
		const s = stateOf(W, [
			[{ e1: '0:k', d4: '0:s', e8: '1:k' }, 1],
			[{ e1: '0:k', f4: '0:+s', e8: '1:k' }, 1],
		])
		expect(mergesFrom(W, s, sq('d4'))).toEqual([])
		expect(branches(W, s, 'd4|f4-e4')).toBeNull()
		expect(isLegal(W, s, '?d4')).toBe(true)
	})

	it('still merges two parts with the same face', () => {
		const W = faces()
		const s = stateOf(W, [
			[{ e1: '0:k', d4: '0:s', e8: '1:k' }, 1],
			[{ e1: '0:k', f4: '0:s', e8: '1:k' }, 1],
		])
		expect(mergesFrom(W, s, sq('d4')).map((m) => m.code)).toContain('d4|f4-e4')
		expect(play(W, s, 'd4|f4-e4').worlds).toHaveLength(1)
	})

	it('joins a part only onto a part with the same face', () => {
		const W = faces()
		const two = stateOf(W, [
			[{ e1: '0:k', d4: '0:s', e8: '1:k' }, 1],
			[{ e1: '0:k', e4: '0:+s', e8: '1:k' }, 1],
		])
		expect(keysOf(W, two, 'd4-e4')).toEqual([['miss', 0.5], ['move', 0.5]])
		const one = stateOf(W, [
			[{ e1: '0:k', d4: '0:s', e8: '1:k' }, 1],
			[{ e1: '0:k', e4: '0:s', e8: '1:k' }, 1],
		])
		expect(keysOf(W, one, 'd4-e4')).toEqual([['move', 1]])
	})
})

describe('Q14 a part that moves onto another part of the same piece joins it', () => {
	it('joins without a roll', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', f3: '0:n', e8: '1:k' }, 1],
			[{ e1: '0:k', e5: '0:n', e8: '1:k' }, 1],
		])
		expect(outcomes(V, s, 'f3-e5').map((o) => [o.key, o.p, o.rolled])).toEqual([['move', 1, false]])
		expect(play(V, s, 'f3-e5').worlds).toHaveLength(1)
	})

	it('keeps the other parts linked', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', f3: '0:n', e8: '1:k' }, 1],
			[{ e1: '0:k', e5: '0:n', e8: '1:k' }, 1],
			[{ e1: '0:k', a4: '0:n', e8: '1:k' }, 1],
		])
		expect(outcomes(V, s, 'f3-e5').map((o) => [o.key, o.rolled])).toEqual([['move', false]])
		const after = play(V, s, 'f3-e5')
		const knight = after.worlds[0].b.ty.indexOf('n')
		const locs = pieceLocations(after, knight).map((l) => [V.topology.names[l.sq], l.p])
		expect(locs.map(([n]) => n)).toEqual(['a4', 'e5'])
		expect(locs[0][1]).toBeCloseTo(1 / 3, 6)
		expect(locs[1][1]).toBeCloseTo(2 / 3, 6)
	})

	it('still rolls when another piece might be on the target', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', f3: '0:n', e8: '1:k', a8: '1:b' }, 1],
			[{ e1: '0:k', e5: '0:n', e8: '1:k', a8: '1:b' }, 1],
			[{ e1: '0:k', f3: '0:n', e8: '1:k', e5: '1:b' }, 1],
		])
		const list = outcomes(V, s, 'f3-e5')
		expect(list.map((o) => o.key)).toEqual(['miss', 'move', 'capture'])
		for (const o of list) {
			expect(o.p).toBeCloseTo(1 / 3, 6)
		}
	})
})
