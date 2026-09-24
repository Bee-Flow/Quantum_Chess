/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The worked examples W1–W17 of §10 with their exact vectors.
 *
 * Section numbers (§) refer to docs/engine-rules.md.
 */

import { describe, expect, it } from 'vitest'
import { E, H, locOf, play, S, T, W } from './helpers.js'

describe('W1 the start, a split and a merge back', () => {
	it('start JSON and hash', () => {
		const s = E.initialState()
		expect(JSON.stringify(s)).toBe(E.START_JSON)
		expect(E.positionHash(s)).toBe('80c209d9560802c2')
		expect(E.validateState(s).ok).toBe(true)
	})

	it('1. g1-f3|h3, 1... e7-e5, 2. f3|h3-g1', () => {
		const s0 = E.initialState()
		const m = E.findMove(s0, 'g1-f3|h3')
		expect(m.resolution).toBe('quantum')
		expect([m.type, m.from, m.to]).toEqual(['split', [6], [21, 23]])
		const s1 = play(s0, 'g1-f3|h3')
		expect(JSON.stringify(s1)).toBe('{"v":1,"types":"kqrrbbnnppppppppkqrrbbnnpppppppp","worlds":[["CGEBAF.DIJKLMNOP.......H........................ijklmnopcgebafhd",8388608],["CGEBAF.DIJKLMNOP.....H..........................ijklmnopcgebafhd",8388608]],"turn":"b","castling":"KQkq","ep":"-","halfmove":1,"fullmove":1,"ply":1,"captured":[],"history":["80c209d9560802c2","483a99c829aee5ce"],"result":null}')
		expect(E.budget(s1, 'w')).toBe(2)
		expect(E.budget(s1, 'b')).toBe(1)
		const r2 = E.applyMove(s1, 'e7-e5')
		expect(r2.move.resolution).toBe('certain')
		expect(r2.measurement).toBe(null)
		expect(r2.state.ep).toBe('-')
		expect(r2.state.halfmove).toBe(0)
		expect(r2.state.history).toEqual(['62e1e066b0926df1'])
		const r3 = E.applyMove(r2.state, 'f3|h3-g1')
		expect(r3.move.resolution).toBe('certain')
		expect(r3.move.outcomes).toEqual([{ key: 'move', weight: T }])
		expect(r3.state.worlds.length).toBe(1)
		expect(r3.state.worlds[0][1]).toBe(T)
		expect(H(r3.state)).toBe('49192f86bee5e059')
		expect(r3.state.castling).toBe('KQkq')
	})
})

describe('W2 a solid piece attacks a ghost', () => {
	const w2 = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])

	it('position', () => {
		expect(W(w2)).toEqual([
			['..E.A..........................................h............a...', 8388608],
			['..E.A........................................h..............a...', 8388608],
		])
	})

	it('c1-h6 is rolled move/capture 50/50', () => {
		const m = E.findMove(w2, 'c1-h6')
		expect(m.resolution).toBe('rolled')
		expect(m.outcomes).toEqual([{ key: 'move', weight: 8388608 }, { key: 'capture', weight: 8388608 }])
	})

	it('move branch (r = 0.3, u = 5033164)', () => {
		expect(E.uFromRandom(0.3)).toBe(5033164)
		const r = E.applyMove(w2, 'c1-h6', { rng: () => 0.3 })
		expect(r.measurement.key).toBe('move')
		expect(r.measurement.u).toBe(5033164)
		expect(W(r.state)).toEqual([['....A........................................h.E............a...', T]])
		expect(r.state.halfmove).toBe(w2.halfmove + 1)
		for (const u of [0, 8388607]) {
			expect(E.applyMove(w2, 'c1-h6', { u }).measurement.key).toBe('move')
		}
	})

	it('capture branch (u = 8388608), record and notation', () => {
		const r = E.applyMove(w2, 'c1-h6', { u: 8388608 })
		expect(W(r.state)).toEqual([['....A..........................................E............a...', T]])
		expect(r.state.captured[r.state.captured.length - 1]).toBe(23)
		expect(r.state.halfmove).toBe(0)
		expect(JSON.stringify(r.measurement)).toBe('{"key":"capture","u":8388608,"captured":23,"outcomes":[{"key":"move","weight":8388608},{"key":"capture","weight":8388608}],"fallback":false}')
		expect(E.moveNotation(w2, 'c1-h6', r.measurement)).toBe('Bc1xh6 {capture 50%}')
		expect(E.applyMove(w2, 'c1-h6', { u: 16777215 }).measurement.key).toBe('capture')
	})

	it('with the knight split g4-e3|h6 the lane can be blocked: miss/capture', () => {
		const s = S('4k3/8/8/8/6n1/8/8/2B1K3 w - - 0 1', ['g4-e3|h6'])
		expect(E.findMove(s, 'c1-h6').outcomes).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'capture', weight: 8388608 }])
	})
})

describe('W3 a ghost attacks a ghost (three outcomes)', () => {
	const s = S('4k3/8/3b4/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3', 'd6-c7|e5'])

	it('four independent worlds', () => {
		expect(W(s)).toEqual([
			['....A..................H..........................e.........a...', 4194304],
			['....A..................H............e.......................a...', 4194304],
			['....A................H............................e.........a...', 4194304],
			['....A................H..............e.......................a...', 4194304],
		])
	})

	it('f3-e5 outcomes and every branch', () => {
		const m = E.findMove(s, 'f3-e5')
		expect(m.outcomes).toEqual([
			{ key: 'miss', weight: 8388608 },
			{ key: 'move', weight: 4194304 },
			{ key: 'capture', weight: 4194304 },
		])
		const miss = play(s, 'f3-e5', { u: 8388607 })
		expect(W(miss)).toEqual([
			['....A..................H..........................e.........a...', 8388608],
			['....A..................H............e.......................a...', 8388608],
		])
		expect(locOf(miss, 7)).toEqual({ h3: T })
		const move = play(s, 'f3-e5', { u: 8388608 })
		expect(W(move)).toEqual([['....A...............................H.............e.........a...', T]])
		expect(play(s, 'f3-e5', { u: 12582911 }).worlds).toEqual(move.worlds)
		const cap = E.applyMove(s, 'f3-e5', { u: 12582912 })
		expect(W(cap.state)).toEqual([['....A...............................H.......................a...', T]])
		expect(cap.measurement.captured).toBe(20)
	})
})

describe('W4 a blocked slide creates a link, then a Measure collapses both', () => {
	const s0 = S('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1')
	const s1 = play(s0, 'b6-a4|c4')
	const s2 = play(s1, 'a1-a8')

	it('split', () => {
		expect(W(s1)).toEqual([
			['C...A.....................g.................................a...', 8388608],
			['C...A...................g...................................a...', 8388608],
		])
	})

	it('a1-a8 is quantum and links the rook to the knight', () => {
		const m = E.findMove(s1, 'a1-a8')
		expect(m.resolution).toBe('quantum')
		expect(m.fallback).toBe(false)
		expect(m.outcomes).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'move', weight: 8388608 }])
		expect(W(s2)).toEqual([
			['....A.....................g.............................C...a...', 8388608],
			['C...A...................g...................................a...', 8388608],
		])
		expect(E.budget(s2, 'w')).toBe(2)
		expect(E.links(s2)).toEqual([[2, 22]])
		expect(E.linkGroups(s2)).toEqual([[2, 22]])
		expect(E.conditionalView(s2, 24)[0]).toEqual({ piece: 2, weight: 8388608, probability: 1 })
		expect(E.conditionalView(s2, 56)[26]).toEqual({ piece: 22, weight: 8388608, probability: 1 })
	})

	it('?a4 collapses both pieces', () => {
		const m = E.findMove(s2, '?c4')
		expect(m.code).toBe('?a4')
		expect(m.outcomes).toEqual([{ key: 'a4', weight: 8388608 }, { key: 'c4', weight: 8388608 }])
		const a = play(s2, '?a4', { u: 3 })
		expect(W(a)).toEqual([['C...A...................g...................................a...', T]])
		const c = play(s2, '?a4', { u: 9000000 })
		expect(W(c)).toEqual([['....A.....................g.............................C...a...', T]])
		expect(c.halfmove).toBe(s2.halfmove + 1)
	})
})

describe('W5 a split with one lane blocked in some worlds', () => {
	it('d1-h1|d5', () => {
		const s1 = play(S('4k3/8/8/8/8/6n1/8/1K1R4 b - - 0 1'), 'g3-f1|h5')
		const m = E.findMove(s1, 'd1-h1|d5')
		expect(m.code).toBe('d1-h1|d5')
		expect(m.to).toEqual([7, 35])
		const s2 = play(s1, m)
		expect(W(s2)).toEqual([
			['.A.................................C...g....................a...', 4194304],
			['.A.....C...............................g....................a...', 4194304],
			['.A...g.............................C........................a...', 4194304],
			['.A.C.g......................................................a...', 4194304],
		])
		expect(locOf(s2, 2)).toEqual({ d1: 4194304, h1: 4194304, d5: 8388608 })
		expect(E.budget(s2, 'w')).toBe(3)
		expect(E.budget(s2, 'b')).toBe(2)
		expect(E.links(s2)).toEqual([[2, 22]])
	})
})

describe('W6 converging capture and certain danger', () => {
	const s = S('7k/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1-d4|h5'])

	it('position and danger', () => {
		expect(W(s)).toEqual([
			['....A..................................B.......................a', 8388608],
			['....A......................B...................................a', 8388608],
		])
		expect(E.kingDanger(s, 'b')).toBe(T)
		expect(E.kingDanger(s, 'w')).toBe(0)
	})

	it('d4|h5-h8 is a certain converging capture of the king', () => {
		const r = E.applyMove(s, 'd4|h5-h8', { outcome: 'miss' })
		expect(r.move.resolution).toBe('certain')
		expect(r.move.outcomes).toEqual([{ key: 'capture', weight: T }])
		expect(r.measurement).toBe(null)
		expect(W(r.state)).toEqual([['....A..........................................................B', T]])
		expect(r.state.captured).toContain(16)
		expect(r.state.result).toEqual({ result: '1-0', reason: 'king_captured' })
		expect(E.moveNotation(s, 'd4|h5-h8', null, r.state)).toBe('Qd4|h5xh8 #')
		expect(E.moveNotation(s, 'd4|h5-h8')).toBe('Qd4|h5xh8 #')
	})

	it('h5-h8 is a 50/50 shot', () => {
		expect(E.findMove(s, 'h5-h8').outcomes).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'capture', weight: 8388608 }])
		const miss = play(s, 'h5-h8', { u: 100 })
		expect(locOf(miss, 1)).toEqual({ d4: T })
		expect(miss.result).toBe(null)
	})
})

describe('W7 largest-remainder rescale after a missed pawn capture', () => {
	const s = [
		'g8-f6|h6',
		'e1-e2',
		'f6-d5|e4',
	].reduce((st, c) => play(st, c), S('4k1n1/8/8/8/8/3P4/8/4K3 b - - 0 1'))

	it('the knight is on three squares', () => {
		expect(W(s)).toEqual([
			['............A......I...........................h............a...', 8388608],
			['............A......I...............h........................a...', 4194304],
			['............A......I........h...............................a...', 4194304],
		])
	})

	it('d3-e4 misses (u = 3000000) and rescales to (11184811, 5592405)', () => {
		expect(E.findMove(s, 'd3-e4').outcomes).toEqual([{ key: 'miss', weight: 12582912 }, { key: 'capture', weight: 4194304 }])
		const r = E.applyMove(s, 'd3-e4', { u: 3000000 })
		expect(W(r.state)).toEqual([
			['............A......I...........................h............a...', 11184811],
			['............A......I...............h........................a...', 5592405],
		])
		expect(E.pct(11184811)).toBe(67)
		expect(E.pct(5592405)).toBe(33)
		expect(r.state.halfmove).toBe(s.halfmove + 1)
		expect(E.moveNotation(s, 'd3-e4', r.measurement)).toBe('d3-e4 {miss 75%}')
	})

	it('d3-e4 captures (u = 13000000)', () => {
		const r = E.applyMove(s, 'd3-e4', { u: 13000000 })
		expect(W(r.state)).toEqual([['............A...............I...............................a...', T]])
		expect(r.measurement.captured).toBe(23)
		expect(r.state.halfmove).toBe(0)
	})

	it('rescale vector', () => {
		expect(E.rescaleWeights([8388608, 4194304])).toEqual([11184811, 5592405])
	})
})

describe('W8 budget fallback', () => {
	const s = S('4k3/8/6n1/8/8/8/8/1NBQK2R w - - 0 1', ['b1-a3|c3', 'c1-d2|e3', 'd1-b3|a4', 'g6-f4|h4'])

	it('position', () => {
		expect(E.budget(s, 'w')).toBe(8)
		expect(E.budget(s, 'b')).toBe(2)
		expect(s.worlds.length).toBe(16)
		expect(s.worlds.every((w) => w[1] === 1048576)).toBe(true)
	})

	it('h1-h8 falls back to a roll', () => {
		const m = E.findMove(s, 'h1-h8')
		expect(m.resolution).toBe('rolled')
		expect(m.fallback).toBe(true)
		expect(m.outcomes).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'move', weight: 8388608 }])
		const r = E.applyMove(s, 'h1-h8', { u: 9000000 })
		expect(r.measurement.key).toBe('move')
		expect(r.measurement.fallback).toBe(true)
		expect(r.state.worlds.length).toBe(8)
		expect(r.state.worlds.every((w) => w[1] === 2097152)).toBe(true)
		expect(locOf(r.state, 3)).toEqual({ h8: T })
		expect(locOf(r.state, 22)).toEqual({ f4: T })
		expect(E.budget(r.state, 'w')).toBe(8)
		expect(E.budget(r.state, 'b')).toBe(1)
	})
})

describe('W9 a pawn probe, a double push and en passant', () => {
	const s = S('4k3/8/8/8/3p2n1/8/4P3/4K3 w - - 0 1', ['g4-e3|h6'])

	it('e2-e4 outcomes', () => {
		expect(E.findMove(s, 'e2-e4').outcomes).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'move', weight: 8388608 }])
	})

	it('miss keeps the pawn home', () => {
		const r = play(s, 'e2-e4', { u: 1 })
		expect(locOf(r, 12)).toEqual({ e2: T })
		expect(locOf(r, 22)).toEqual({ e3: T })
		expect(r.ep).toBe('-')
		expect(r.halfmove).toBe(s.halfmove + 1)
	})

	it('move sets ep, then d4-e3 is a certain en-passant capture', () => {
		const r = play(s, 'e2-e4', { u: 16000000 })
		expect(locOf(r, 12)).toEqual({ e4: T })
		expect(locOf(r, 22)).toEqual({ h6: T })
		expect(r.ep).toBe('e3')
		expect(r.halfmove).toBe(0)
		const m = E.findMove(r, 'd4-e3')
		expect(m.resolution).toBe('certain')
		expect(m.outcomes).toEqual([{ key: 'capture', weight: T }])
		const r2 = E.applyMove(r, 'd4-e3')
		expect(r2.measurement).toBe(null)
		expect(r2.state.captured[r2.state.captured.length - 1]).toBe(12)
		expect(r2.state.halfmove).toBe(0)
		expect(r2.state.ep).toBe('-')
	})
})

describe('W10 castling rights follow the state', () => {
	it('a split loses the right, merging back does not restore it', () => {
		const s = S('4k3/8/8/8/8/8/8/4K2R w K - 0 1')
		expect(s.castling).toBe('K')
		const s1 = play(s, 'h1-h3|h5')
		expect(s1.castling).toBe('-')
		const s2 = play(play(s1, 'e8-d8'), 'h3|h5-h1')
		expect(locOf(s2, 3)).toEqual({ h1: T })
		expect(s2.castling).toBe('-')
	})

	it('a missed king attempt keeps the right', () => {
		const s = S('4k3/8/8/8/8/8/8/4K1NR w K - 0 1', ['g1-e2|f3'])
		expect(s.castling).toBe('K')
		const m = E.findMove(s, 'e1-e2')
		expect(m.outcomes).toEqual([{ key: 'miss', weight: 8388608 }, { key: 'move', weight: 8388608 }])
		expect(play(s, 'e1-e2', { outcome: 'miss' }).castling).toBe('K')
		expect(play(s, 'e1-e2', { outcome: 'move' }).castling).toBe('-')
	})
})

describe('W11 randomness vectors', () => {
	it('r → u', () => {
		expect(E.uFromRandom(0.5)).toBe(8388608)
		expect(E.uFromRandom(0.999999999)).toBe(16777215)
		expect(E.uFromRandom(0)).toBe(0)
	})

	it('roll memo identity', () => {
		const w2 = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		expect(E.positionHash(w2)).toBe('8f9af7718bec3d8a')
		expect(E.rollIdentity(w2, 'c1-h6')).toBe('0/8f9af7718bec3d8a/c1-h6')
		expect(E.rollIdentity(w2, 'e7-e8=Q')).toBe(E.rollIdentity(w2, 'e7-e8=N'))
	})

	it('chain vector', () => {
		const w2 = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		const c0 = E.chainStart(42, 'alice', 'bob', 1790000000)
		expect(c0).toBe('049816ae57365c0bfe28b2358e4ff9b460d91765ee10fcbc8714a3a0d2163c75')
		const r = E.applyMove(w2, 'c1-h6', { u: 8388608 })
		const json = E.serializeState(r.state)
		expect(json).toBe('{"v":1,"types":"kqrrbbnnppppppppkqrrbbnnpppppppp","worlds":[["....A..........................................E............a...",16777216]],"turn":"b","castling":"-","ep":"-","halfmove":0,"fullmove":1,"ply":1,"captured":[1,2,3,5,6,7,8,9,10,11,12,13,14,15,17,18,19,20,21,22,24,25,26,27,28,29,30,31,23],"history":["15ec044c3e248721"],"result":null}')
		expect(E.sha256hex(json)).toBe('b4b4d83ee34de58f4039ea6b4a6ffe08c84f95a850b2396bc18f0d23ed6234eb')
		expect(E.chainNext(c0, 0, 'c1-h6', 8388608, 'capture', r.state)).toBe('23c84483be0638e3765cec8a1f46c3ed84d01806ad05c3598ebd9355fa8d6608')
		expect(E.chainNext(c0, 0, 'c1-h6', 8388608, 'capture', json)).toBe('23c84483be0638e3765cec8a1f46c3ed84d01806ad05c3598ebd9355fa8d6608')
	})

	it('roll display vectors', () => {
		const w2 = [{ key: 'move', weight: 8388608 }, { key: 'capture', weight: 8388608 }]
		const w3 = [{ key: 'miss', weight: 8388608 }, { key: 'move', weight: 4194304 }, { key: 'capture', weight: 4194304 }]
		const thirds = [{ key: 'miss', weight: 11184811 }, { key: 'capture', weight: 5592405 }]
		expect(E.rollDisplay({ key: 'move', u: 6227703, outcomes: w2 }))
			.toBe('Moved [0.0000, 0.5000) · Captured [0.5000, 1.0000) · rolled 0.3712 → Moved')
		expect(E.rollDisplay({ key: 'move', u: 8388607, outcomes: w2 }))
			.toBe('Moved [0.0000, 0.5000) · Captured [0.5000, 1.0000) · rolled 0.4999 → Moved')
		expect(E.rollDisplay({ key: 'move', u: 10368000, outcomes: w3 }))
			.toBe('Missed [0.0000, 0.5000) · Moved [0.5000, 0.7500) · Captured [0.7500, 1.0000) · rolled 0.6179 → Moved')
		expect(E.rollDisplay({ key: 'miss', u: 11184810, outcomes: thirds }))
			.toBe('Missed [0.00000000, 0.66666668) · Captured [0.66666668, 1.00000000) · rolled 0.66666662 → Missed')
		expect(E.rollDisplay({ key: 'capture', u: 11184811, outcomes: thirds }))
			.toBe('Missed [0.0000, 0.6666) · Captured [0.6666, 1.0000) · rolled 0.6666 → Captured')
	})
})

describe('W12 index order, not name order (odd weights)', () => {
	const s = S('4k1n1/8/8/8/7R/3P4/8/4K3 w - - 0 1', ['g8-f6|h6', 'f6-d5|e4', 'd3-e4@miss'])

	it('position', () => {
		expect(H(s)).toBe('1059583f07581935')
		expect(W(s)).toEqual([
			['....A..............I...........C...............h............a...', 11184811],
			['....A..............I...........C...h........................a...', 5592405],
		])
	})

	it('h4-h3|a4 split with odd weights', () => {
		const m = E.findMove(s, 'h4-a4|h3')
		expect(m.code).toBe('h4-h3|a4')
		expect(m.to).toEqual([23, 24])
		expect(E.parseMoveCode('h4-a4|h3')).toEqual({ type: 'split', from: [31], to: [23, 24] })
		const s1 = play(s, 'h4-h3|a4')
		expect(W(s1)).toEqual([
			['....A..............I....C......................h............a...', 5592405],
			['....A..............I....C..........h........................a...', 2796202],
			['....A..............I...C.......................h............a...', 5592406],
			['....A..............I...C...........h........................a...', 2796203],
		])
		expect(E.budget(s1, 'w')).toBe(2)
		expect(H(s1)).toBe('e64c1d334ceeb8af')
		const s2 = play(s1, 'e8-d8')
		expect(H(s2)).toBe('fa1e4e870feb98ca')
		const mm = E.findMove(s2, '?a4')
		expect(mm.code).toBe('?h3')
		expect(mm.outcomes).toEqual([{ key: 'h3', weight: 8388609 }, { key: 'a4', weight: 8388607 }])
		for (const u of [0, 8388608]) {
			const r = E.applyMove(s2, '?h3', { u })
			expect(r.measurement.key).toBe('h3')
			expect(r.state.worlds.map((w) => w[1])).toEqual([11184811, 5592405])
			expect(H(r.state)).toBe('221bc0511bf8b8f6')
		}
		const r = E.applyMove(s2, '?h3', { u: 8388609 })
		expect(r.measurement.key).toBe('a4')
		expect(H(r.state)).toBe('c8c6e6a2d75059ea')
	})
})

describe('W13 the budget fast accept must count blocked lanes', () => {
	it('d1-h1|d5 is budget_full', () => {
		const s = S('4k3/8/8/8/8/6n1/8/KNBR4 w - - 0 1', ['g3-f1|h5', 'b1-a3|c3', 'c1-b2|e3'])
		expect(s.worlds.length).toBe(8)
		expect(s.worlds.every((w) => w[1] === 2097152)).toBe(true)
		expect(E.budget(s, 'w')).toBe(4)
		expect(E.budget(s, 'b')).toBe(2)
		expect(H(s)).toBe('0c9886eceb87b80e')
		expect(E.whyIllegal(s, 'd1-h1|d5')).toBe('budget_full')
		expect(E.findMove(s, 'd1-h1|d5')).toBe(null)
		expect(E.legalCodes(s)).not.toContain('d1-h1|d5')
	})
})

describe('W14 a trapped king ends the game', () => {
	it('a1-a8 is king_trapped', () => {
		const s = S('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1')
		const r = E.applyMove(s, 'a1-a8')
		expect(r.move.resolution).toBe('certain')
		expect(r.state.result).toEqual({ result: '1-0', reason: 'king_trapped' })
		expect(H(r.state)).toBe('7166d3cef5551f3c')
		expect(E.moveNotation(s, 'a1-a8', null, r.state)).toBe('Ra1-a8 #')
		expect(E.generateMoves(r.state)).toEqual([])
	})

	it('with a black knight on d7 play goes on', () => {
		const s = S('6k1/3n1ppp/8/8/8/8/8/R3K3 w - - 0 1')
		const r = E.applyMove(s, 'a1-a8')
		expect(r.state.result).toBe(null)
		expect(E.kingTrapped(r.state)).toBe(false)
	})
})

describe('W15 en passant adjacency uses files, not index ± 1', () => {
	it('h2-h4 does not set ep', () => {
		const r = play(S('4k3/8/8/p7/8/8/7P/4K3 w - - 0 1'), 'h2-h4')
		expect(r.ep).toBe('-')
		expect(H(r)).toBe('7630184fdd9223c9')
		expect(E.fnv1a64(E.positionHashInput({ ...r, ep: 'h3' }))).toBe('be9e53289ababfcb')
	})

	it('mirror a7-a5', () => {
		const r = play(S('4k3/p7/8/8/7P/8/8/4K3 b - - 0 1'), 'a7-a5')
		expect(r.ep).toBe('-')
		expect(H(r)).toBe('67d9307690c4f1b5')
	})
})

describe('W16 draws yield to a certain king capture (D18)', () => {
	it('bare kings adjacent do not draw, then the king is captured', () => {
		const s = S('8/8/4k3/3n4/4K3/8/8/8 w - - 0 1')
		const r = E.applyMove(s, 'e4-d5')
		expect(r.move.outcomes).toEqual([{ key: 'capture', weight: T }])
		expect(r.state.captured.length).toBe(30)
		expect(r.state.result).toBe(null)
		expect(H(r.state)).toBe('3bdffd05d877049c')
		const r2 = E.applyMove(r.state, 'e6-d5')
		expect(r2.state.result).toEqual({ result: '0-1', reason: 'king_captured' })
	})
})

describe('W17 setup vectors', () => {
	it('two queens', () => {
		const s = S('4k3/8/8/8/8/8/8/2QQK3 w - - 0 1')
		expect(W(s)).toEqual([['..IBA.......................................................a...', T]])
		expect(s.types).toBe('kqrrbbnnqpppppppkqrrbbnnpppppppp')
		expect(s.captured).toEqual([2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31])
		expect(H(s)).toBe('3a386523ce53fad7')
	})

	it('ghost plus en passant', () => {
		const s = S('4k3/8/8/8/3pP3/8/8/4K1N1 b - e3 0 1', ['g1-f3|h3'])
		expect(s.turn).toBe('b')
		expect(s.ep).toBe('e3')
		expect(H(s)).toBe('e2f094948d875644')
		expect(E.isLegal(s, 'd4-e3')).toBe(true)
		expect(E.findMove(s, 'd4-e3').outcomes).toEqual([{ key: 'capture', weight: T }])
	})

	it('rolled prelude move without an outcome', () => {
		expect(() => S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6', 'c1-h6'])).toThrowError(expect.objectContaining({ code: 'prelude_needs_outcome' }))
		const s = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6', 'c1-h6@capture'])
		expect(locOf(s, 4)).toEqual({ h6: T })
	})
})
