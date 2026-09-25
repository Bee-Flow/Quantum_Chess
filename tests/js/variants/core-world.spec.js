/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The classical side of the variants core (package "world" of handoff/CORE-CHANGES.md): castling placement and the
 * king-onto-rook option (Chess960), the orthodox helpers on files and multi-board topologies, en passant expiry and
 * castling rights across the worlds, attacks without royal attackers and board options of `orthodoxSpec`.
 */

import { describe, expect, it } from 'vitest'
import {
	between,
	castlingMoves,
	castlingRights,
	clearEnPassant,
	orthodoxAfterMove,
	orthodoxTypes,
	pawnExtras,
	standardBoard,
	unifyCastling,
} from '../../../src/variants/core/orthodox.js'
import { orthodoxSpec, whiteBlack } from '../../../src/variants/core/orthodoxVariant.js'
import { FILE_LETTERS, makeTopology } from '../../../src/variants/core/topology.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import {
	applyClassical,
	attacks,
	cloneWorld,
	emptyWorld,
	generate,
	givesCheck,
	normaliseType,
	worldFrom,
	worldKey,
} from '../../../src/variants/core/world.js'
import { play, stateOf } from './helpers.js'

const V = defineVariant(Object.assign(orthodoxSpec(), { id: 'world-test', category: 'rules' }))

/**
 * The square index of a square name.
 *
 * @param {object} W variant
 * @param {string} name square name
 * @return {number}
 */
function sq(W, name) {
	const s = W.topology.byName(name)
	expect(s, name).toBeGreaterThanOrEqual(0)
	return s
}

/**
 * The pieces on the board of a world as `{ squareName: 'side:type' }`.
 *
 * @param {object} W variant
 * @param {object} w world
 * @return {Record<string, string>}
 */
function placementOf(W, w) {
	const out = {}
	w.board.forEach((id, s) => {
		if (id >= 0) {
			out[W.topology.names[s]] = w.sd[id] + ':' + w.ty[id]
		}
	})
	return out
}

/**
 * A world from a placement with the castling rights of `castlingRights` and no en passant square.
 *
 * @param {object} W variant
 * @param {Record<string, string>} placement squares and pieces
 * @return {object}
 */
function withRights(W, placement) {
	const w = worldFrom(W, placement)
	w.x = { ep: -1, epVictim: -1, castle: castlingRights(W, w) }
	return w
}

/**
 * Castle in a world built from a placement and return the placement after the move.
 *
 * @param {Record<string, string>} placement squares and pieces (White to castle)
 * @param {string} key `O-O` or `O-O-O`
 * @param {object} [opts] options of `castlingMoves`
 * @return {Record<string, string>}
 */
function castle(placement, key, opts = {}) {
	const w = withRights(V, placement)
	const m = castlingMoves(V, w, 0, opts).find((c) => c.key === key)
	expect(m, key).toBeDefined()
	return placementOf(V, applyClassical(V, w, m))
}

/**
 * A variant with the orthodox pieces on two 8 × 8 boards, squares `[file, rank, board]` named `A:e1` and `B:e1`.
 *
 * @return {object}
 */
function twoBoards() {
	const coords = []
	for (let b = 0; b < 2; b++) {
		for (let r = 0; r < 8; r++) {
			for (let f = 0; f < 8; f++) {
				coords.push([f, r, b])
			}
		}
	}
	const topology = makeTopology({
		coords,
		name: ([f, r, b]) => 'AB'[b] + ':' + FILE_LETTERS[f] + (r + 1),
		cell: ([f, r, b]) => ({ x: f + 9 * b, y: 7 - r, w: 1, h: 1, shape: 'rect', shade: 'light' }),
	})
	const rank = (s) => topology.coords[s][1]
	const spec = {
		id: 'two-boards',
		category: 'rules',
		sides: whiteBlack(),
		topology,
		types: orthodoxTypes({ lastRank: (side, s) => rank(s) === (side === 0 ? 7 : 0) }),
		setup: () => emptyWorld(spec),
		extraMoves(w, side) {
			return [
				...pawnExtras(spec, w, side, (sd, s) => rank(s) === (sd === 0 ? 1 : 6)),
				...castlingMoves(spec, w, side),
			]
		},
		afterMove(next, m) {
			orthodoxAfterMove(spec, next, m)
		},
	}
	return defineVariant(spec)
}

describe('W1: castling placement in applyClassical', () => {
	const cases = [
		['Chess960, king stays on g1', { a1: '0:r', g1: '0:k', h1: '0:r' }, 'O-O', { a1: '0:r', g1: '0:k', f1: '0:r' }],
		['Chess960, swap f1/g1', { f1: '0:k', g1: '0:r' }, 'O-O', { g1: '0:k', f1: '0:r' }],
		['Chess960, swap d1/c1', { d1: '0:k', c1: '0:r' }, 'O-O-O', { c1: '0:k', d1: '0:r' }],
		['Chess960, king stays on c1', { a1: '0:r', c1: '0:k' }, 'O-O-O', { c1: '0:k', d1: '0:r' }],
		['Chess960, rook stays on d1', { e1: '0:k', d1: '0:r' }, 'O-O-O', { c1: '0:k', d1: '0:r' }],
		['orthodox short', { a1: '0:r', e1: '0:k', h1: '0:r' }, 'O-O', { g1: '0:k', f1: '0:r', a1: '0:r' }],
		['orthodox long', { a1: '0:r', e1: '0:k', h1: '0:r' }, 'O-O-O', { c1: '0:k', d1: '0:r', h1: '0:r' }],
	]
	for (const [name, placement, key, expected] of cases) {
		it(name + ' (' + key + ')', () => {
			const all = { ...placement, e8: '1:k' }
			const want = { ...expected, e8: '1:k' }
			expect(castle(all, key)).toEqual(want)
			expect(castle(all, key, { toRook: true })).toEqual(want)
		})
	}

	it('refuses a castling whose king or rook target holds another piece', () => {
		const w = withRights(V, { e1: '0:k', h1: '0:r', e8: '1:k' })
		const m = castlingMoves(V, w, 0).find((c) => c.key === 'O-O')
		const blocked = cloneWorld(w)
		blocked.board[sq(V, 'g1')] = blocked.sq.push(sq(V, 'g1')) - 1
		blocked.ty.push('n')
		blocked.sd.push(0)
		expect(() => applyClassical(V, blocked, m)).toThrow('castling king target occupied')
		const rookTo = (to) => ({ ...m, extra: { ...m.extra, rook: { ...m.extra.rook, to } } })
		expect(() => applyClassical(V, w, rookTo(sq(V, 'e8')))).toThrow('castling rook target occupied')
		expect(() => applyClassical(V, w, rookTo(m.extra.kingTo))).toThrow('castling rook target occupied')
	})

	it('plays the king-stays castling through the quantum layer', () => {
		const s = stateOf(V, [[{ a1: '0:r', g1: '0:k', h1: '0:r', e8: '1:k' }, 1]], 0, (w) => {
			w.x = { ep: -1, epVictim: -1, castle: castlingRights(V, w) }
		})
		const after = play(V, s, 'O-O')
		expect(after.worlds).toHaveLength(1)
		expect(placementOf(V, after.worlds[0].b)).toEqual({ a1: '0:r', g1: '0:k', f1: '0:r', e8: '1:k' })
		expect(after.worlds[0].b.x.castle.filter((c) => c.side === 0)).toEqual([])
	})
})

describe('W2: castlingMoves with toRook', () => {
	it('uses the rook square as to with the option and the king destination without it', () => {
		for (const placement of [
			{ a1: '0:r', e1: '0:k', h1: '0:r', e8: '1:k' },
			{ a1: '0:r', c1: '0:k', h1: '0:r', e8: '1:k' },
			{ b1: '0:r', g1: '0:k', h1: '0:r', e8: '1:k' },
		]) {
			const w = withRights(V, placement)
			const rights = w.x.castle.filter((c) => c.side === 0)
			const plain = castlingMoves(V, w, 0)
			const onRook = castlingMoves(V, w, 0, { toRook: true })
			expect(plain.map((m) => m.key)).toEqual(onRook.map((m) => m.key))
			expect(plain.map((m) => m.key).sort()).toEqual(['O-O', 'O-O-O'])
			rights.forEach((c, i) => {
				expect(onRook[i]).toMatchObject({
					kind: 'castle',
					from: c.king,
					to: c.rook,
					extra: { kingTo: c.kingTo },
				})
				expect(plain[i]).toMatchObject({
					kind: 'castle',
					from: c.king,
					to: c.kingTo === c.king ? c.rook : c.kingTo,
					extra: { kingTo: c.kingTo },
				})
			})
		}
	})

	it('keeps the orthodox moves unchanged by default', () => {
		const w = withRights(V, { a1: '0:r', e1: '0:k', h1: '0:r', e8: '1:k' })
		const byKey = Object.fromEntries(castlingMoves(V, w, 0).map((m) => [m.key, m]))
		expect(byKey['O-O'].to).toBe(sq(V, 'g1'))
		expect(byKey['O-O-O'].to).toBe(sq(V, 'c1'))
		expect(generate(V, w, 0).get('O-O')).toMatchObject({ kind: 'castle', to: sq(V, 'g1') })
	})
})

describe('W3: orthodox helpers on files and more coordinates', () => {
	it('finds the squares between two squares on any straight line', () => {
		const names = (a, b) => between(V.topology, sq(V, a), sq(V, b)).map((s) => V.topology.names[s])
		expect(names('a1', 'e1')).toEqual(['b1', 'c1', 'd1'])
		expect(names('h1', 'e1')).toEqual(['g1', 'f1'])
		expect(names('a1', 'a5')).toEqual(['a2', 'a3', 'a4'])
		expect(names('a1', 'd4')).toEqual(['b2', 'c3'])
		expect(names('a1', 'b3')).toEqual([])
		expect(names('a1', 'b1')).toEqual([])
		expect(names('a1', 'a1')).toEqual([])
		const W = twoBoards()
		const inB = (a, b) => between(W.topology, sq(W, a), sq(W, b)).map((s) => W.topology.names[s])
		expect(inB('B:a1', 'B:e1')).toEqual(['B:b1', 'B:c1', 'B:d1'])
		expect(inB('A:a1', 'B:a1')).toEqual([])
	})

	it('castles along a file on a narrow board', () => {
		const board = standardBoard(2, 8)
		const spec = {
			id: 'file-castle',
			category: 'rules',
			sides: whiteBlack(),
			topology: board.topology,
			types: orthodoxTypes({ lastRank: board.lastRank }),
			setup: () => emptyWorld(spec),
			extraMoves: (w, side) => castlingMoves(spec, w, side),
		}
		const W = defineVariant(spec)
		const rights = [
			{ flag: 'Q', side: 0, king: sq(W, 'a5'), rook: sq(W, 'a1'), kingTo: sq(W, 'a3'), rookTo: sq(W, 'a4') },
			{ flag: 'K', side: 0, king: sq(W, 'a5'), rook: sq(W, 'a8'), kingTo: sq(W, 'a7'), rookTo: sq(W, 'a6') },
		]
		const w = worldFrom(W, { a5: '0:k', a1: '0:r', a8: '0:r', b8: '1:k' }, { castle: rights })
		const moves = generate(W, w, 0)
		expect(moves.get('O-O-O')).toMatchObject({ kind: 'castle', to: sq(W, 'a3') })
		expect(moves.get('O-O')).toMatchObject({ kind: 'castle', to: sq(W, 'a7') })
		expect(placementOf(W, applyClassical(W, w, moves.get('O-O-O'))))
			.toEqual({ a3: '0:k', a4: '0:r', a8: '0:r', b8: '1:k' })
		expect(placementOf(W, applyClassical(W, w, moves.get('O-O'))))
			.toEqual({ a7: '0:k', a6: '0:r', a1: '0:r', b8: '1:k' })
		const blocked = worldFrom(W, { a5: '0:k', a1: '0:r', a2: '1:n', a8: '0:r', b8: '1:k' }, { castle: rights })
		expect(generate(W, blocked, 0).has('O-O-O')).toBe(false)
		expect(generate(W, blocked, 0).has('O-O')).toBe(true)
	})

	it('builds castling rights on one board of a [file, rank, board] topology', () => {
		const W = twoBoards()
		const w = worldFrom(W, {
			'B:e1': '0:k',
			'B:h1': '0:r',
			'B:b1': '0:r',
			'A:a1': '0:r',
			'B:e8': '1:k',
			'B:a8': '1:r',
			'A:h8': '1:r',
		})
		const rights = castlingRights(W, w).map((c) => ({
			...c,
			king: W.topology.names[c.king],
			rook: W.topology.names[c.rook],
			kingTo: W.topology.names[c.kingTo],
			rookTo: W.topology.names[c.rookTo],
		}))
		expect(rights).toEqual([
			{ flag: 'K', side: 0, king: 'B:e1', rook: 'B:h1', kingTo: 'B:g1', rookTo: 'B:f1' },
			{ flag: 'Q', side: 0, king: 'B:e1', rook: 'B:b1', kingTo: 'B:c1', rookTo: 'B:d1' },
			{ flag: 'q', side: 1, king: 'B:e8', rook: 'B:a8', kingTo: 'B:c8', rookTo: 'B:d8' },
		])
		w.x = { ep: -1, epVictim: -1, castle: castlingRights(W, w) }
		const moves = generate(W, w, 0)
		expect(moves.has('O-O')).toBe(true)
		expect(placementOf(W, applyClassical(W, w, moves.get('O-O-O')))).toMatchObject({
			'B:c1': '0:k',
			'B:d1': '0:r',
			'A:a1': '0:r',
		})
		expect(generate(W, w, 1).has('O-O-O')).toBe(true)
	})

	it('sets the en passant square to the midpoint of a double step in every coordinate', () => {
		const w = worldFrom(V, { e1: '0:k', a3: '0:p', e8: '1:k' }, { ep: -1, epVictim: -1, castle: [] })
		const next = cloneWorld(w)
		orthodoxAfterMove(V, next, { kind: 'double', from: sq(V, 'a3'), to: sq(V, 'c3') })
		expect([next.x.ep, next.x.epVictim]).toEqual([sq(V, 'b3'), sq(V, 'c3')])
		orthodoxAfterMove(V, next, { kind: 'double', from: sq(V, 'e2'), to: sq(V, 'e4') })
		expect([next.x.ep, next.x.epVictim]).toEqual([sq(V, 'e3'), sq(V, 'e4')])
		orthodoxAfterMove(V, next, { kind: 'normal', from: sq(V, 'e4'), to: sq(V, 'e5') })
		expect([next.x.ep, next.x.epVictim]).toEqual([-1, -1])

		const W = twoBoards()
		const b = worldFrom(W, { 'B:e2': '0:p', 'B:d4': '1:p', 'A:e2': '0:p' }, { ep: -1, epVictim: -1, castle: [] })
		const after = applyClassical(W, b, generate(W, b, 0).get('B:e2-B:e4'))
		expect([after.x.ep, after.x.epVictim]).toEqual([sq(W, 'B:e3'), sq(W, 'B:e4')])
		expect(generate(W, after, 1).get('B:d4-B:e3')).toMatchObject({ kind: 'ep', capture: b.board[sq(W, 'B:e2')] })
	})

	it('generates double steps and en passant captures with custom pawn vectors', () => {
		const sideways = { forward: [1, 0], captures: [[1, 1], [1, -1]] }
		const w = worldFrom(V, { a4: '0:p', b3: '0:p', c5: '1:p', h8: '1:k' }, {
			ep: sq(V, 'c4'),
			epVictim: sq(V, 'c5'),
			castle: [],
		})
		const always = () => true
		const out = pawnExtras(V, w, 0, always, sideways)
		expect(out.map((m) => [m.key, m.kind])).toEqual([['a4-c4', 'double'], ['b3-d3', 'double'], ['b3-c4', 'ep']])
		expect(out[2].capture).toBe(w.board[sq(V, 'c5')])
		// the default geometry: straight up, captures on the diagonals (b3xc4 is one of them)
		expect(pawnExtras(V, w, 0, always).map((m) => [m.key, m.kind]))
			.toEqual([['a4-a6', 'double'], ['b3-b5', 'double'], ['b3-c4', 'ep']])
		expect(pawnExtras(V, w, 0, always, 'p')).toEqual(pawnExtras(V, w, 0, always))
		expect(pawnExtras(V, w, 0, always, { pawn: 'x' })).toEqual([])

		// a hexagonal-style pawn whose single step skips a coordinate value: e2-e4, double e2-e6
		const hex = worldFrom(V, { e2: '0:p', d5: '1:p', h8: '1:k' }, { ep: -1, epVictim: -1, castle: [] })
		const double = pawnExtras(V, hex, 0, always, { forward: [0, 2] })
		expect(double.map((m) => m.key)).toEqual(['e2-e6'])
		const next = cloneWorld(hex)
		orthodoxAfterMove(V, next, double[0])
		expect(V.topology.names[next.x.ep]).toBe('e4')
		// side 1 turns the vectors: its pawn on d5 moves down the board
		expect(pawnExtras(V, hex, 1, always, { forward: [0, 2] }).map((m) => m.key)).toEqual(['d5-d1'])
	})

	it('keeps the orthodox start: 20 moves for each side', () => {
		const start = V.setup()
		expect(generate(V, start, 0).size).toBe(20)
		expect(generate(V, start, 1).size).toBe(20)
		expect(start.x.castle).toHaveLength(4)
	})
})

describe('W4: en passant expiry', () => {
	it('returns the same world when there is nothing to clear', () => {
		const w = worldFrom(V, { e1: '0:k', e8: '1:k' }, { ep: -1, epVictim: -1, castle: [] })
		expect(clearEnPassant(w)).toBe(w)
		const bare = worldFrom(V, { e1: '0:k', e8: '1:k' })
		expect(clearEnPassant(bare)).toBe(bare)
		expect(bare.x).toEqual({})
	})

	it('clears both fields in a copy and leaves the input unchanged', () => {
		const castle = [{ flag: 'K', side: 0, king: 4, rook: 7, kingTo: 6, rookTo: 5 }]
		const w = worldFrom(V, { e1: '0:k', h1: '0:r', e4: '0:p', e8: '1:k' }, {
			ep: sq(V, 'e3'),
			epVictim: sq(V, 'e4'),
			castle,
			n: 3,
		})
		const before = JSON.stringify(w)
		const out = clearEnPassant(w)
		expect(out).not.toBe(w)
		expect(out.x).toEqual({ ep: -1, epVictim: -1, castle, n: 3 })
		expect(worldKey({ ...out, x: w.x })).toBe(worldKey(w))
		expect(JSON.stringify(w)).toBe(before)
		const onlyVictim = worldFrom(V, { e1: '0:k', e8: '1:k' }, { epVictim: sq(V, 'e4') })
		expect(clearEnPassant(onlyVictim).x).toEqual({ ep: -1, epVictim: -1 })
	})

	it('is the applyMiss hook of orthodoxSpec', () => {
		expect(typeof orthodoxSpec().applyMiss).toBe('function')
		const w = worldFrom(V, { e1: '0:k', e8: '1:k' }, { ep: sq(V, 'e3'), epVictim: sq(V, 'e4'), castle: [] })
		const action = { type: 'measure', code: '?e1', id: 0, from: [sq(V, 'e1')], to: [] }
		expect(V.applyMiss(w, action, 1, { hit: false }).x).toMatchObject({ ep: -1, epVictim: -1 })
		const clean = clearEnPassant(w)
		expect(V.applyMiss(clean, { type: 'pass', code: null, from: [], to: [] }, 0, { hit: false })).toBe(clean)
	})
})

describe('W5: castling rights follow the state', () => {
	const K = { flag: 'K', side: 0, king: 4, rook: 7, kingTo: 6, rookTo: 5 }
	const Q = { flag: 'Q', side: 0, king: 4, rook: 0, kingTo: 2, rookTo: 3 }
	const k = { flag: 'k', side: 1, king: 60, rook: 63, kingTo: 62, rookTo: 61 }
	const q = { flag: 'q', side: 1, king: 60, rook: 56, kingTo: 58, rookTo: 59 }

	/**
	 * A world with the given castling rights and a tag.
	 *
	 * @param {string} tag marker
	 * @param {object[]|undefined} castle rights
	 * @return {object}
	 */
	function world(tag, castle) {
		const x = castle === undefined ? { tag } : { ep: -1, epVictim: -1, castle, tag }
		return worldFrom(V, { e1: '0:k', a1: '0:r', h1: '0:r', e8: '1:k', a8: '1:r', h8: '1:r' }, x)
	}

	it('keeps in every world only the rights that every world has, in order, without mutating', () => {
		const bs = [world('a', [K, Q, k]), world('b', [k, K]), world('c', [K, q, k])]
		const before = JSON.stringify(bs)
		const out = unifyCastling(bs)
		expect(out).not.toBe(bs)
		expect(out).toHaveLength(3)
		expect(out.map((b) => b.x.tag)).toEqual(['a', 'b', 'c'])
		expect(out.map((b) => b.x.castle)).toEqual([[K, k], [k, K], [K, k]])
		expect(out[0]).not.toBe(bs[0])
		expect(out[1]).toBe(bs[1])
		expect(out[2]).not.toBe(bs[2])
		expect(out[0].board).toEqual(bs[0].board)
		expect(JSON.stringify(bs)).toBe(before)
	})

	it('returns the same array when all worlds agree', () => {
		const bs = [world('a', [K, Q]), world('b', [{ ...Q }, { ...K }]), world('c', [K, Q])]
		expect(unifyCastling(bs)).toBe(bs)
		const none = [world('a', []), world('b', undefined)]
		expect(unifyCastling(none)).toBe(none)
		const one = [world('a', [K])]
		expect(unifyCastling(one)).toBe(one)
	})

	it('compares every field of a right, and a world without rights removes them everywhere', () => {
		const moved = { ...K, rook: 6, rookTo: 5 }
		const out = unifyCastling([world('a', [K, k]), world('b', [moved, k])])
		expect(out.map((b) => b.x.castle)).toEqual([[k], [k]])
		const bs = [world('a', [K]), world('b', undefined)]
		const cleared = unifyCastling(bs)
		expect(cleared[0].x.castle).toEqual([])
		expect(cleared[1]).toBe(bs[1])
	})

	it('is the unifyWorlds hook of orthodoxSpec', () => {
		expect(typeof orthodoxSpec().unifyWorlds).toBe('function')
		const bs = [world('a', [K, Q]), world('b', [K])]
		expect(V.unifyWorlds(bs, 0).map((b) => b.x.castle)).toEqual([[K], [K]])
	})
})

describe('W6: attacks without royal attackers', () => {
	it('lets a king attack by default but not with royal: false, and a rook in both cases', () => {
		const w = worldFrom(V, { e1: '0:k', e2: '1:k' })
		expect(attacks(V, w, 0, sq(V, 'e2'))).toBe(true)
		expect(attacks(V, w, 0, sq(V, 'e2'), { royal: false })).toBe(false)
		expect(givesCheck(V, w, 0, 1)).toBe(true)
		expect(givesCheck(V, w, 0, 1, { royal: false })).toBe(false)
		const withRook = worldFrom(V, { e1: '0:k', a2: '0:r', e2: '1:k' })
		expect(attacks(V, withRook, 0, sq(V, 'e2'), { royal: false })).toBe(true)
		expect(givesCheck(V, withRook, 0, 1, { royal: false })).toBe(true)
	})
})

describe('W7: board options of orthodoxSpec', () => {
	it('passes shade and layout to the board and keeps the game unchanged', () => {
		const hill = new Set(['d4', 'e4', 'd5', 'e5'])
		const outlines = [{ x1: 3, y1: 3, x2: 5, y2: 3 }]
		const spec = orthodoxSpec({
			boardOpts: {
				shade: (f, r) => (hill.has(FILE_LETTERS[f] + (r + 1)) ? 'hill' : (f + r) % 2 === 0 ? 'dark' : 'light'),
				layout: { outlines },
			},
		})
		const H = defineVariant(Object.assign(spec, { id: 'world-hill', category: 'rules' }))
		const shade = (name) => H.topology.cells[sq(H, name)].shade
		expect(['d4', 'e4', 'd5', 'e5'].map(shade)).toEqual(['hill', 'hill', 'hill', 'hill'])
		expect([shade('a1'), shade('b1')]).toEqual(['dark', 'light'])
		expect(H.topology.layout.outlines).toEqual(outlines)
		expect(H.topology.layout.labels).toHaveLength(16)
		expect(H.board.lastRank(0, sq(H, 'e8'))).toBe(true)
		expect(H.board.lastRank(1, sq(H, 'e1'))).toBe(true)
		expect(worldKey(H.setup())).toBe(worldKey(V.setup()))
		expect(generate(H, H.setup(), 0).size).toBe(20)
		expect(V.topology.cells.map((c) => c.shade)).not.toContain('hill')
	})
})

describe('topology and types: unknown type fields are kept', () => {
	it('keeps resetsQuiet and other variant fields of a type', () => {
		expect(normaliseType({ moves: [], resetsQuiet: false, custom: 1 }))
			.toMatchObject({ resetsQuiet: false, custom: 1 })
		const spec = orthodoxSpec()
		spec.types.k.resetsQuiet = false
		const W = defineVariant(Object.assign(spec, { id: 'world-types', category: 'rules' }))
		expect(W.types.k).toMatchObject({ resetsQuiet: false, royal: true, solid: true })
		expect(W.types.p.resetsQuiet).toBeUndefined()
	})
})
