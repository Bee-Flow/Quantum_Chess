/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * validateState (§2.7) rejects every broken invariant and malicious input, and never throws.
 *
 * Section numbers (§) refer to docs/engine-rules.md.
 */

import { describe, expect, it } from 'vitest'
import { craft, E, play, S, T } from './helpers.js'

const base = () => JSON.parse(JSON.stringify(S('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1')))
const ghosty = play(play(S('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), 'b6-a4|c4'), 'a1-a8')

/**
 * Re-hash a state after a mutation so that only the mutated invariant fails.
 *
 * @param {object} s state
 * @return {object}
 */
function rehash(s) {
	try {
		s.history = [...s.history.slice(0, -1), E.positionHash(s)]
	} catch {
		// the mutation broke the hash input itself
	}
	return s
}

/**
 * Validate and return the error code (or 'ok').
 *
 * @param {unknown} x input
 * @return {string}
 */
function code(x) {
	const r = E.validateState(x)
	return r.ok ? 'ok' : r.error
}

describe('validateState accepts valid states', () => {
	it('start, setups and a ghost position; returns a fresh canonical copy', () => {
		for (const s of [E.initialState(), base(), ghosty]) {
			const r = E.validateState(s)
			expect(r.ok).toBe(true)
			expect(r.state).not.toBe(s)
			expect(JSON.stringify(r.state)).toBe(JSON.stringify(s))
			expect(E.validateState(JSON.stringify(s)).ok).toBe(true)
		}
	})

	it('keys in another order are canonicalised', () => {
		const s = E.initialState()
		const shuffled = {}
		for (const k of Object.keys(s).reverse()) {
			shuffled[k] = s[k]
		}
		expect(JSON.stringify(E.validateState(shuffled).state)).toBe(E.START_JSON)
	})

	it('the copy does not share arrays with the input', () => {
		const s = JSON.parse(JSON.stringify(ghosty))
		const r = E.validateState(s)
		s.worlds[0][1] = 5
		s.captured.push(3)
		expect(E.validateState(r.state).ok).toBe(true)
	})
})

describe('validateState rejects broken invariants', () => {
	const cases = {
		'not an object': [
			[null, 'shape'],
			[undefined, 'shape'],
			[42, 'shape'],
			[[], 'shape'],
			['{', 'shape'],
			['"x"', 'shape'],
			[() => 1, 'shape'],
		],
	}
	for (const [name, list] of Object.entries(cases)) {
		it(name, () => {
			for (const [x, err] of list) {
				expect(code(x)).toBe(err)
			}
		})
	}

	const mutations = [
		['missing key', (s) => delete s.ep, 'shape'],
		['extra key', (s) => (s.extra = 1), 'shape'],
		['__proto__ key', (s) => Object.defineProperty(s, '__proto__', { value: {}, enumerable: true }), 'shape'],
		['I12 v = 2', (s) => (s.v = 2), 'I12'],
		['I12 v = "1"', (s) => (s.v = '1'), 'I12'],
		['I8 short types', (s) => (s.types = s.types.slice(1)), 'I8'],
		['I8 bad type letter', (s) => (s.types = 'x' + s.types.slice(1)), 'I8'],
		['I8 queen id changes type', (s) => (s.types = s.types.slice(0, 1) + 'r' + s.types.slice(2)), 'I8'],
		['I8 pawn id becomes a king', (s) => (s.types = s.types.slice(0, 8) + 'k' + s.types.slice(9)), 'I8'],
		['turn', (s) => (s.turn = 'x'), 'shape'],
		['castling order', (s) => (s.castling = 'QK'), 'shape'],
		['castling empty', (s) => (s.castling = ''), 'shape'],
		['ep name', (s) => (s.ep = 'e9'), 'shape'],
		['I11 ply too high', (s) => (s.ply = 1201), 'I11'],
		['I11 ply float', (s) => (s.ply = 1.5), 'I11'],
		['I11 halfmove above 99 + ply', (s) => (s.halfmove = 100), 'I11'],
		['I11 negative halfmove', (s) => (s.halfmove = -1), 'I11'],
		['I11 fullmove 0', (s) => (s.fullmove = 0), 'I11'],
		['I11 empty history', (s) => (s.history = []), 'I11', true],
		['I11 bad history entry', (s) => (s.history = ['XYZ']), 'I11', true],
		['I11 wrong last hash', (s) => (s.history = ['0123456789abcdef']), 'I11', true],
		['I11 history longer than halfmove + 1', (s) => (s.history = ['0123456789abcdef', s.history[0]]), 'I11'],
		['I11 result shape', (s) => (s.result = { result: '1-0' }), 'I11'],
		['I11 result value', (s) => (s.result = { result: '2-0', reason: 'king_trapped' }), 'I11'],
		['I11 result reason', (s) => (s.result = { result: '1-0', reason: 'resigned' }), 'I11'],
		['I11 result mismatch', (s) => (s.result = { result: '1/2-1/2', reason: 'king_trapped' }), 'I11'],
		['I4 king_captured with both kings', (s) => (s.result = { result: '1-0', reason: 'king_captured' }), 'I4'],
		['I7 no worlds', (s) => (s.worlds = []), 'I7'],
		['I7 too many worlds', (s) => (s.worlds = new Array(65).fill(s.worlds[0])), 'I7'],
		['world shape', (s) => (s.worlds = [[s.worlds[0][0]]]), 'shape'],
		['board length', (s) => (s.worlds[0][0] = s.worlds[0][0].slice(1)), 'shape'],
		['board character', (s) => (s.worlds[0][0] = 'Z' + s.worlds[0][0].slice(1)), 'shape'],
		['I5 weight 0', (s) => (s.worlds[0][1] = 0), 'I5'],
		['I5 weight float', (s) => (s.worlds[0][1] = T - 0.5), 'I5'],
		['I5 weight string', (s) => (s.worlds[0][1] = String(T)), 'I5'],
		['I5 weight too large', (s) => (s.worlds[0][1] = T + 1), 'I5'],
		['I5 sum', (s) => (s.worlds[0][1] = T - 1), 'I5'],
		['I2 captured duplicate', (s) => (s.captured = [...s.captured, s.captured[0]]), 'I2'],
		['I2 captured out of range', (s) => (s.captured = [...s.captured.slice(1), 32]), 'I2'],
		['I2 captured live piece', (s) => (s.captured = [...s.captured, 2]), 'I2'],
		['I2 live piece missing', (s) => (s.captured = s.captured.slice(1)), 'I2'],
		[
			'I2 piece twice',
			(s) => (s.worlds[0][0] = 'C' + s.worlds[0][0].slice(1, 7) + 'C' + s.worlds[0][0].slice(8)),
			'I2',
		],
		[
			'I3 pawn on rank 1',
			(s) => (s.worlds[0][0] = s.worlds[0][0].slice(0, 7) + 'I' + s.worlds[0][0].slice(8))
				&& (s.captured = s.captured.filter((x) => x !== 8)),
			'I3',
		],
		['I9 castling without king and rook', (s) => (s.castling = 'K'), 'I9'],
		['I10 ep without a pawn', (s) => (s.ep = 'e3'), 'I10'],
		['I10 ep wrong rank', (s) => (s.ep = 'e6'), 'I10'],
	]
	for (const [name, mutate, err, keepHistory] of mutations) {
		it(name, () => {
			const s = base()
			mutate(s)
			if (!keepHistory) {
				rehash(s)
			}
			expect(code(s)).toBe(err)
		})
	}

	it('I1 two pieces share a square across worlds', () => {
		expect(code(rehash({
			...JSON.parse(JSON.stringify(ghosty)),
			worlds: [
				['....A.....................g.............................C...a...', 8388608],
				['C...A...................................................g...a...', 8388608],
			],
		}))).toBe('I1')
	})

	it('I3 and I4: pawns and kings are classical', () => {
		const pawn = (a, b) => craft([[{ e1: 'A', e8: 'a', [a]: 'I' }, T / 2], [{ e1: 'A', e8: 'a', [b]: 'I' }, T / 2]])
		expect(() => pawn('a2', 'a3')).toThrow(/I3/)
		expect(() => craft([[{ e1: 'A', e8: 'a' }, T / 2], [{ e2: 'A', e8: 'a' }, T / 2]])).toThrow(/I4/)
	})

	it('I6 unsorted and duplicate boards', () => {
		const s = JSON.parse(JSON.stringify(ghosty))
		s.worlds.reverse()
		expect(code(rehash(s))).toBe('I6')
		const d = JSON.parse(JSON.stringify(ghosty))
		d.worlds[1][0] = d.worlds[0][0]
		expect(code(rehash(d))).toBe('I6')
	})

	it('I7 budget above 8', () => {
		const worlds = []
		const files = 'abc'
		for (let i = 0; i < 3; i++) {
			for (let j = 0; j < 3; j++) {
				worlds.push([{ e1: 'A', e8: 'a', [files[i] + '3']: 'G', [files[j] + '6']: 'H' }, 1])
			}
		}
		worlds[0][1] = T - 8
		expect(() => craft(worlds)).toThrow(/I7/)
	})

	it('I10 en passant details, including no wrap-around', () => {
		const ok = S('4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1')
		expect(ok.ep).toBe('e3')
		const wrap = JSON.parse(JSON.stringify(S('4k3/8/8/8/p6P/8/8/4K3 b - - 0 1')))
		wrap.ep = 'h3'
		expect(code(rehash(wrap))).toBe('I10')
		const noBeside = JSON.parse(JSON.stringify(S('4k3/8/8/8/4P3/8/8/4K3 b - - 0 1')))
		noBeside.ep = 'e3'
		expect(code(rehash(noBeside))).toBe('I10')
		const occupied = JSON.parse(JSON.stringify(S('4k3/8/8/8/3pP3/4N3/8/4K3 b - - 0 1')))
		occupied.ep = 'e3'
		expect(code(rehash(occupied))).toBe('I10')
	})
})

describe('validateState never throws', () => {
	it('hostile objects', () => {
		const s = base()
		const boom = () => {
			throw new Error('boom')
		}
		const getterBomb = { ...s }
		Object.defineProperty(getterBomb, 'worlds', { enumerable: true, get: boom })
		expect(code(getterBomb)).toBe('shape')
		const proxy = new Proxy(s, { ownKeys: boom })
		expect(code(proxy)).toBe('shape')
		const deep = base()
		deep.worlds = [[{ toString: boom }, T]]
		expect(code(deep)).toBe('shape')
		const huge = base()
		huge.worlds = new Array(1e6)
		expect(code(huge)).toBe('I7')
		expect(code('x'.repeat(2e6))).toBe('shape')
		expect(code(JSON.stringify(s).replace('"v":1', '"__proto__":{"polluted":1},"v":1'))).toBe('shape')
		expect({}.polluted).toBe(undefined)
	})

	it('random mutations of valid states', () => {
		const rng = E.seededRng(2024)
		const pool = [E.initialState(), base(), ghosty, S('3qk3/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1-d4|h5', 'd8-a5|d5'])]
		const values = [
			null,
			undefined,
			0,
			-1,
			1,
			1.5,
			T,
			T + 1,
			'',
			'w',
			'-',
			'e3',
			'K',
			[],
			[[]],
			{},
			{ result: '1-0' },
			NaN,
			Infinity,
			true,
			'x'.repeat(64),
		]
		let accepted = 0
		for (let i = 0; i < 4000; i++) {
			const s = JSON.parse(JSON.stringify(pool[i % pool.length]))
			const keys = Object.keys(s)
			const kind = Math.floor(rng() * 5)
			if (kind === 0) {
				s[keys[Math.floor(rng() * keys.length)]] = values[Math.floor(rng() * values.length)]
			} else if (kind === 1) {
				const w = s.worlds[Math.floor(rng() * s.worlds.length)]
				const pos = Math.floor(rng() * 64)
				const chars = '.ABCDEFGHIJKLMNOPabcdefghijklmnop0'
				w[0] = w[0].slice(0, pos) + chars[Math.floor(rng() * chars.length)] + w[0].slice(pos + 1)
			} else if (kind === 2) {
				const w = s.worlds[Math.floor(rng() * s.worlds.length)]
				w[1] += Math.floor(rng() * 5) - 2
			} else if (kind === 3) {
				s.captured.push(Math.floor(rng() * 34) - 1)
			} else {
				s.types = s.types.slice(0, 8) + 'kqrbnpx'[Math.floor(rng() * 7)] + s.types.slice(9)
			}
			if (rng() < 0.5) {
				rehash(s)
			}
			let r
			expect(() => {
				r = E.validateState(s)
			}).not.toThrow()
			if (r.ok) {
				accepted++
				expect(E.validateState(r.state).ok).toBe(true)
				expect(E.generateMoves(r.state)).toBeInstanceOf(Array)
			} else {
				expect(typeof r.error).toBe('string')
				expect(typeof r.message).toBe('string')
			}
		}
		expect(accepted).toBeGreaterThan(0)
	})
})
