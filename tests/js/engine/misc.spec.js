/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * SHA-256, rescale, randomness, pct, roll display details, setup errors, describeForLlm, serialisation.
 */

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { E, play, S, T } from './helpers.js'

describe('sha256hex (pure JS, synchronous)', () => {
	it('FIPS 180-4 vectors', () => {
		expect(E.sha256hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
		expect(E.sha256hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
		expect(E.sha256hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))
			.toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
		expect(E.sha256hex('a'.repeat(1000000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0')
	})

	it('agrees with node:crypto on UTF-8 and every length around the block size', () => {
		const texts = ['ü', '日本語', '😀 emoji', 'useré|42']
		for (let n = 0; n < 140; n++) {
			texts.push('x'.repeat(n))
		}
		for (const t of texts) {
			expect(E.sha256hex(t)).toBe(createHash('sha256').update(t, 'utf8').digest('hex'))
		}
	})
})

describe('rescale (§5.3)', () => {
	it('vector and ties to the lower index', () => {
		expect(E.rescaleWeights([8388608, 4194304])).toEqual([11184811, 5592405])
		expect(E.rescaleWeights([1, 1, 1])).toEqual([5592406, 5592405, 5592405])
		expect(E.rescaleWeights([T])).toEqual([T])
		expect(() => E.rescaleWeights([T, 1])).toThrow(RangeError)
	})

	it('random weights: exact total, never below the old weight, error below one unit', () => {
		const rng = E.seededRng(7)
		for (let i = 0; i < 3000; i++) {
			const m = 1 + Math.floor(rng() * 64)
			const w = Array.from({ length: m }, () => 1 + Math.floor(rng() * (T / m - 1)))
			const S0 = w.reduce((a, b) => a + b, 0)
			if (S0 >= T) {
				continue
			}
			const r = E.rescaleWeights(w)
			expect(r.reduce((a, b) => a + b, 0)).toBe(T)
			for (let j = 0; j < m; j++) {
				expect(r[j]).toBeGreaterThanOrEqual(w[j])
				expect(Math.abs(r[j] - w[j] * T / S0)).toBeLessThan(1)
			}
		}
	})
})

describe('randomness (§5.2, §9.1)', () => {
	it('u, rng and outcome precedence', () => {
		const w2 = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		expect(E.applyMove(w2, 'c1-h6', { outcome: 'move', u: 16000000 }).measurement).toMatchObject({ key: 'move', u: null })
		expect(E.applyMove(w2, 'c1-h6', { u: 16000000, rng: () => 0 }).measurement).toMatchObject({ key: 'capture', u: 16000000 })
		expect(E.applyMove(w2, 'c1-h6', { rng: () => 0 }).measurement).toMatchObject({ key: 'move', u: 0 })
		const r = E.applyMove(w2, 'c1-h6')
		expect(r.measurement.u).toBeGreaterThanOrEqual(0)
		expect(r.measurement.u).toBeLessThan(T)
	})

	it('invalid u and rng throw argument errors, not IllegalMove', () => {
		const w2 = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		for (const u of [-1, T, 1.5, '5', NaN]) {
			expect(() => E.applyMove(w2, 'c1-h6', { u })).toThrowError(expect.objectContaining({ name: 'EngineArgumentError' }))
		}
		for (const r of [1, -0.1, NaN, Infinity, '0.5']) {
			expect(() => E.applyMove(w2, 'c1-h6', { rng: () => r })).toThrowError(expect.objectContaining({ name: 'EngineArgumentError' }))
		}
		expect(() => E.applyMove(w2, 'c1-h6', { rng: 5 })).toThrowError(expect.objectContaining({ name: 'EngineArgumentError' }))
	})

	it('the rng is consulted exactly once per rolled move and never otherwise', () => {
		let calls = 0
		const rng = () => {
			calls++
			return 0.25
		}
		const w2 = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		E.applyMove(w2, 'c1-h6', { rng })
		expect(calls).toBe(1)
		E.applyMove(w2, 'e1-e2', { rng })
		E.applyMove(E.initialState(), 'g1-f3|h3', { rng })
		expect(calls).toBe(1)
	})

	it('keyForU uses half-open intervals', () => {
		const o = [{ key: 'miss', weight: 3 }, { key: 'capture', weight: T - 3 }]
		expect(E.keyForU(o, 0)).toBe('miss')
		expect(E.keyForU(o, 2)).toBe('miss')
		expect(E.keyForU(o, 3)).toBe('capture')
		expect(E.randomU()).toBeLessThan(T)
	})
})

describe('pct and roll display', () => {
	it('pct never shows an uncertain event as 0% or 100%', () => {
		expect([0, 1, T / 200, T / 2, T - 1, T].map(E.pct)).toEqual([0, 1, 1, 50, 99, 100])
		expect(E.pct(Math.floor(T * 0.125))).toBe(13)
		expect(E.pct(Math.floor(T * 0.745))).toBe(74)
	})

	it('forced outcomes, Measures and translated labels', () => {
		expect(E.rollDisplay({ key: 'capture', u: null, outcomes: [{ key: 'move', weight: T / 2 }, { key: 'capture', weight: T / 2 }] }))
			.toBe('Moved [0.0000, 0.5000) · Captured [0.5000, 1.0000) · forced → Captured')
		expect(E.rollDisplay({ key: 'c4', u: 9000000, outcomes: [{ key: 'a4', weight: T / 2 }, { key: 'c4', weight: T / 2 }] }))
			.toBe('a4 [0.0000, 0.5000) · c4 [0.5000, 1.0000) · rolled 0.5364 → c4')
		expect(E.rollDisplay({ key: 'move', u: 1, outcomes: [{ key: 'miss', weight: 1 }, { key: 'move', weight: T - 1 }] }, { miss: 'Gemist', move: 'Gezet', rolled: 'geworpen' }))
			.toBe('Gemist [0.00000000, 0.00000005) · Gezet [0.00000005, 1.00000000) · geworpen 0.00000005 → Gezet')
		const i = E.rollIntervals({ key: 'move', u: 6227703, outcomes: [{ key: 'move', weight: T / 2 }, { key: 'capture', weight: T / 2 }] })
		expect(i.decimals).toBe(4)
		expect(i.intervals[0]).toEqual({ key: 'move', start: 0, end: T / 2, startText: '0.0000', endText: '0.5000', chosen: true })
		expect(E.decimalOfWeight(8388607, 4)).toBe('0.4999')
		expect(E.decimalOfWeight(T, 8)).toBe('1.00000000')
	})
})

describe('setupPosition errors (Appendix A)', () => {
	const err = (fn) => {
		try {
			fn()
		} catch (e) {
			return [e.name, e.code, e.detail]
		}
		return null
	}

	it('FEN errors', () => {
		for (const fen of ['', 'x', '8/8/8 w - - 0 1', '9/8/8/8/8/8/8/8 w - - 0 1', '4k3/8/8/8/8/8/8/4K2 w - - 0 1', '4k3/8/8/8/8/8/8/4K3 x - - 0 1', '4k3/8/8/8/8/8/8/4K3 w KK - 0 1', '4k3/8/8/8/8/8/8/4K3 w - e4 0 1', '4k3/8/8/8/8/8/8/4K3 w - - 100 1', '4k3/8/8/8/8/8/8/4K3 w - - 0 0', '4k3/8/8/8/8/8/8/4X3 w - - 0 1', '4k3/8/8/8/8/8/8/4K3 w - - -1 1', 42]) {
			expect(err(() => E.setupPosition({ fen }))[1]).toBe('bad_fen')
		}
		// halfmove and fullmove may be omitted (0 and 1)
		const short = E.setupPosition({ fen: '4k3/8/8/8/8/8/8/4K3 w - -' })
		expect([short.halfmove, short.fullmove]).toEqual([0, 1])
	})

	it('king count, too many pieces, invalid state', () => {
		expect(err(() => E.setupPosition({ fen: '8/8/8/8/8/8/8/4K3 w - - 0 1' }))[1]).toBe('king_count')
		expect(err(() => E.setupPosition({ fen: '4k3/8/8/8/8/8/8/3KK3 w - - 0 1' }))[1]).toBe('king_count')
		expect(err(() => E.setupPosition({ fen: '4k3/8/8/8/8/NNNNNNNN/NNNN4/4K3 w - - 0 1' }))[1]).toBe('too_many_pieces')
		expect(err(() => E.setupPosition({ fen: '4k3/8/8/8/8/8/8/P3K3 w - - 0 1' }))[1]).toBe('invalid_state')
		expect(err(() => E.setupPosition({ fen: '4k3/8/8/8/8/8/8/4K3 w - e6 0 1' }))[1]).toBe('invalid_state')
		expect(err(() => E.setupPosition({ state: { v: 1 } }))[1]).toBe('invalid_state')
		expect(E.setupPosition({ state: E.initialState() })).toEqual(E.initialState())
	})

	it('prelude errors', () => {
		const fen = '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1'
		expect(err(() => E.setupPosition({ fen, prelude: ['nonsense'] }))[1]).toBe('prelude_bad_code')
		expect(err(() => E.setupPosition({ fen, prelude: ['O-O'] }))[1]).toBe('prelude_bad_code')
		expect(err(() => E.setupPosition({ fen, prelude: [42] }))[1]).toBe('prelude_bad_code')
		expect(err(() => E.setupPosition({ fen, prelude: 'g8-f6' }))[1]).toBe('prelude_bad_code')
		expect(err(() => E.setupPosition({ fen, prelude: ['a1-a2'] }))).toEqual(['SetupError', 'prelude_illegal', 'no_piece'])
		expect(err(() => E.setupPosition({ fen, prelude: ['c1-c2'] }))).toEqual(['SetupError', 'prelude_illegal', 'unreachable'])
		expect(err(() => E.setupPosition({ fen: '4k3/8/8/8/8/8/8/2B1K2k w - - 0 1', prelude: [] }))[1]).toBe('king_count')
		expect(err(() => E.setupPosition({ fen: '8/8/8/8/8/8/3k4/4K3 w - - 0 1', prelude: ['e1-d2'] }))[1]).toBe('prelude_king_captured')
		expect(E.setupPosition({ fen, prelude: [{ code: 'g8-f6|h6' }, { code: 'c1-h6', outcome: 'capture' }] }).captured).toContain(23)
	})

	it('certainFen', () => {
		const s = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		expect(E.certainFen(s)).toBe('4k3/8/8/8/8/8/8/2B1K3 w - - 0 1')
		expect(E.certainFen(E.initialState())).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
	})
})

describe('serialisation and views', () => {
	it('serializeState rebuilds the canonical key order', () => {
		const s = E.initialState()
		const odd = { result: null, v: 1, ...s }
		expect(E.serializeState(odd)).toBe(E.START_JSON)
		expect(E.positionHashInput(s)).toBe('w|KQkq|-|' + s.types + '|' + s.worlds[0][0] + ':16777216')
		expect(E.gameResult(s)).toBe(null)
	})

	it('squareView, pieceLocations and conditionalView agree', () => {
		const s = play(play(S('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), 'b6-a4|c4'), 'a1-a8')
		const sv = E.squareView(s)
		expect(sv[24]).toEqual({ piece: 22, type: 'n', color: 'b', weight: 8388608, probability: 0.5 })
		expect(sv[28]).toBe(null)
		const locs = E.pieceLocations(s)
		expect(locs[2].map((l) => l.square)).toEqual([0, 56])
		expect(locs[1]).toEqual([])
		expect(E.conditionalView(s, 28)).toBe(null)
		const cv = E.conditionalView(s, 0)
		expect(cv[0]).toEqual({ piece: 2, weight: 8388608, probability: 1 })
		expect(cv[26]).toBe(null)
		expect(cv[4]).toEqual({ piece: 0, weight: 8388608, probability: 1 })
		expect(E.worldCount(s)).toBe(2)
	})

	it('links need a real correlation', () => {
		const s = S('4k3/8/3b4/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3', 'd6-c7|e5'])
		expect(E.links(s)).toEqual([])
		expect(E.linkGroups(s)).toEqual([])
	})

	it('describeForLlm', () => {
		const s = play(play(S('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), 'b6-a4|c4'), 'a1-a8')
		const text = E.describeForLlm(s)
		expect(text).toContain('Quantum Chess (rules v1). You are Black. Move 2, Black to move.')
		expect(text).toContain('Certain pieces (FEN, uncertain pieces removed): 4k3/8/8/8/8/8/8/4K3 b - - 2 2')
		expect(text).toContain('- White rook: a1 50%, a8 50%')
		expect(text).toContain('- Black knight: a4 50%, c4 50%')
		expect(text).toContain('Links: white rook a8 <-> black knight c4 (knight on c4 in 100% of the cases where the rook is on a8)')
		expect(text).toContain('Possibilities: 2. Budget: White 2/8, Black 2/8. King danger: White 0%, Black 50%.')
		expect(text).toContain('?a4 (measure: a4 50%, c4 50%)')
		expect(text).toContain('Na4 may split to two of:')
		expect(E.describeForLlm(E.initialState(), { color: 'w' })).toContain('Uncertain pieces: none')
	})
})
