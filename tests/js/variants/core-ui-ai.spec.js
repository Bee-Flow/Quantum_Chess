/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Package "ui-ai" of the follow-up items, pure parts: the computer's fallback when no move of its view is legal (U1),
 * its time budget (U2), the roll memo key (U3), the miss text of a drop (U4), the shared rules without castling and
 * en passant (U5) and with capture-the-king and the escape rule (lead decision L1), no split candidates of the computer
 * with a full budget (R8, its `aiSplits` half) and the reason text of a king that cannot escape (U7).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { fnv1a64 } from '../../../src/engine/index.js'
import { positionHash, rollMemoKey } from '../../../src/variantplay/rolls.js'
import { outcomeText, reasonText, resultText, sharedRules } from '../../../src/variantplay/texts.js'
import { aiSplits, chooseMove } from '../../../src/variants/core/ai.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import { branches, budgetInfo, newGame, splitCode, splitTargets } from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { worldKey } from '../../../src/variants/core/world.js'
import { stateOf, workClock } from './helpers.js'

/**
 * An orthodox test variant with extra fields.
 *
 * @param {object} [extra] fields and hooks to add
 * @return {object}
 */
function orthodox(extra = {}) {
	return defineVariant(Object.assign(orthodoxSpec(), { id: 'test-ui-ai', category: 'rules' }, extra))
}

const V = orthodox()

/**
 * A seeded random number generator (mulberry32).
 *
 * @param {number} seed seed
 * @return {() => number}
 */
function seeded(seed) {
	let a = seed
	return () => {
		a = (a + 0x6D2B79F5) | 0
		let r = Math.imul(a ^ (a >>> 15), 1 | a)
		r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * The square index of a name.
 *
 * @param {string} name square name
 * @return {number}
 */
function sq(name) {
	return V.topology.byName(name)
}

afterEach(() => {
	vi.restoreAllMocks()
})

describe('U1: a computer with a view of the position always moves', () => {
	// kriegspiel.md K23: White is boxed in, every push is blocked, only the four pawn captures are legal
	const boxed = { a1: '0:k', b1: '0:b', a2: '0:p', b2: '0:p', c2: '0:p', e8: '1:k' }
	const real = { ...boxed, a3: '1:p', b3: '1:p', c3: '1:p' }
	// the view guesses the enemy pawns on their start squares: it offers only the pushes, which the umpire refuses
	const guess = { ...boxed, a7: '1:p', b7: '1:p', c7: '1:p' }
	const captures = ['a2-b3', 'b2-a3', 'b2-c3', 'c2-b3']

	it('tries the legal moves of the real state when the variant has no candidate moves', async () => {
		const K = orthodox({ aiView: () => stateOf(K, [[guess, 1]]) })
		const s = stateOf(K, [[real, 1]])
		for (const level of ['easy', 'normal', 'hard']) {
			for (let seed = 1; seed <= 4; seed++) {
				expect(captures).toContain(await chooseMove(K, s, { level, rng: seeded(seed), now: workClock() }))
			}
		}
	})

	it('tries the variant\'s candidate moves in random order until one is accepted', async () => {
		const tried = ['a2-a3', 'b2-b4', 'c2-c3', 'b2-c3', 'a1-b1'].map((code) => ({ code, type: 'move' }))
		const K = orthodox({
			aiView: () => stateOf(K, [[guess, 1]]),
			candidateMoves: () => tried,
		})
		const s = stateOf(K, [[real, 1]])
		for (let seed = 1; seed <= 4; seed++) {
			expect(await chooseMove(K, s, { level: 'normal', rng: seeded(seed), now: workClock() })).toBe('b2-c3')
		}
	})

	it('also tries the merges and measurements of the own view', async () => {
		// the knight is a ghost on f3 or h3; the candidates hold nothing legal
		const ghost = (n) => [{ ...boxed, [n]: '0:n' }, 1]
		const K = orthodox({
			aiView: () => stateOf(K, [[{ ...guess, a3: '1:p', b3: '1:p', c3: '1:p' }, 1]]),
			// a capture of nothing: never legal
			candidateMoves: () => [{ code: 'a2-b3', type: 'move' }],
			ownView: (state) => state,
		})
		const s = stateOf(K, [ghost('f3'), ghost('h3')])
		const seen = new Set()
		for (let seed = 1; seed <= 8; seed++) {
			const code = await chooseMove(K, s, { level: 'easy', rng: seeded(seed), now: workClock() })
			expect(code === '?f3' || code.includes('|')).toBe(true)
			expect(branches(K, s, code)).not.toBeNull()
			seen.add(code)
		}
		expect(seen.size).toBeGreaterThan(1)
	})

	it('gives null only when no attempt is legal, and leaves variants without a view alone', async () => {
		const K = orthodox({
			aiView: () => stateOf(K, [[guess, 1]]),
			candidateMoves: () => [{ code: 'a2-a3', type: 'move' }],
		})
		const opts = () => ({ level: 'easy', rng: seeded(1), now: workClock() })
		expect(await chooseMove(K, stateOf(K, [[real, 1]]), opts())).toBeNull()
		expect(captures).toContain(await chooseMove(V, stateOf(V, [[real, 1]]), opts()))
	})
})

describe('U2: the time budget of the computer', () => {
	/**
	 * A fake clock for the search (the option `now` of `chooseMove`), moved forward by the test variant's hooks.
	 *
	 * @return {{now: number, read: () => number}}
	 */
	function fakeClock() {
		const clock = { now: 1000000, read: () => clock.now }
		return clock
	}

	it('stops inside the evaluation of a candidate once the time is spent', async () => {
		const clock = fakeClock()
		// every world evaluation takes 10 ms: one candidate of the hard level (all 20 replies) takes about 400 ms
		const S = orthodox({
			evaluate() {
				clock.now += 10
				return 0
			},
		})
		const start = clock.now
		const code = await chooseMove(S, newGame(S), { level: 'hard', rng: seeded(1), now: clock.read })
		expect(branches(S, newGame(S), code)).not.toBeNull()
		// before, the search finished the candidate it had begun: up to 400 ms late
		expect(clock.now - start).toBeGreaterThan(4000)
		expect(clock.now - start).toBeLessThanOrEqual(4000 + 40)
	})

	it('counts the time from the call and still gives a move', async () => {
		const clock = fakeClock()
		let evaluations = 0
		const S = orthodox({
			// a slow view: the budget of the easy level is spent before the first candidate
			aiView(state) {
				clock.now += 1000
				return state
			},
			evaluate() {
				evaluations++
				return 0
			},
		})
		const code = await chooseMove(S, newGame(S), { level: 'easy', rng: seeded(2), now: clock.read })
		expect(branches(S, newGame(S), code)).not.toBeNull()
		// one quiet move in one world: one evaluation, and no split candidates were ranked
		expect(evaluations).toBe(1)
	})

	it('judges one candidate without the answer when the time is spent before any has a value', async () => {
		const clock = fakeClock()
		let evaluations = 0
		const S = orthodox({
			aiView(state) {
				clock.now += 5000
				return state
			},
			evaluate() {
				evaluations++
				return 0
			},
		})
		const start = clock.now
		const code = await chooseMove(S, newGame(S), { level: 'hard', rng: seeded(3), now: clock.read })
		expect(branches(S, newGame(S), code)).not.toBeNull()
		// the hard level would search all 20 answers (41 evaluations); late, it judges the position after the move
		expect(evaluations).toBe(1)
		expect(clock.now - start).toBe(5000)
	})

	it('stops inside the first candidate too, and still gives a move', async () => {
		const clock = fakeClock()
		// every world evaluation takes 300 ms: the first candidate of the hard level alone would take over 12 s
		const S = orthodox({
			evaluate() {
				clock.now += 300
				return 0
			},
		})
		const start = clock.now
		const code = await chooseMove(S, newGame(S), { level: 'hard', rng: seeded(4), now: clock.read })
		expect(branches(S, newGame(S), code)).not.toBeNull()
		// at most one answer (2 evaluations) after the deadline, then one quick judgement
		expect(clock.now - start).toBeGreaterThan(4000)
		expect(clock.now - start).toBeLessThanOrEqual(4000 + 3 * 300)
	})
})

describe('R8: no split candidates of the computer with a full budget', () => {
	// three White ghosts 50/50: 8 arrangements, the budget is full
	const worlds = []
	for (const n1 of ['a3', 'c3']) {
		for (const n2 of ['f3', 'h3']) {
			for (const r of ['a1', 'b1']) {
				worlds.push([{ e1: '0:k', [n1]: '0:n', [n2]: '0:n', [r]: '0:r', d4: '0:q', e8: '1:k' }, 1])
			}
		}
	}

	it('gives nothing at once, as the complete list does', () => {
		const s = stateOf(V, worlds)
		expect(budgetInfo(V, s, 0)).toEqual(expect.objectContaining({ used: 8, limit: 8 }))
		const targets = splitTargets(V, s, sq('d4'))
		expect(targets.length).toBeGreaterThan(10)
		const legal = []
		for (let i = 0; i < targets.length; i++) {
			for (let j = i + 1; j < targets.length; j++) {
				if (branches(V, s, splitCode(V, sq('d4'), targets[i], targets[j]))) {
					legal.push([i, j])
				}
			}
		}
		expect(legal).toEqual([])
		const rng = vi.fn(seeded(1))
		expect(aiSplits(V, s, sq('d4'), rng)).toEqual([])
		expect(rng).not.toHaveBeenCalled()
		// with one ghost less the queen splits as before
		const open = stateOf(V, worlds.filter(([p]) => p.a1))
		expect(aiSplits(V, open, sq('d4'), seeded(1)).length).toBeGreaterThan(0)
	})
})

describe('U3: the roll memo key', () => {
	const s = stateOf(V, [
		[{ e1: '0:k', e7: '0:p', a8: '1:k', e8: '1:n' }, 1],
		[{ e1: '0:k', e7: '0:p', a8: '1:k', c6: '1:n' }, 1],
	])

	it('is the ply, a hash of the position and the code without its promotion', () => {
		const key = rollMemoKey(s, 'e7-e8=q')
		expect(key).toMatch(/^0:[0-9a-f]{16}:e7-e8$/)
		expect(key).toBe('0:' + positionHash(s) + ':e7-e8')
		expect(rollMemoKey(s, 'e7-e8=n')).toBe(key)
		expect(rollMemoKey(s, 'e7-e8')).toBe(key)
		expect(rollMemoKey(s, 'e7-d8=q')).not.toBe(key)
		expect(rollMemoKey({ ...s, ply: 4 }, 'e7-e8=q')).toBe('4:' + positionHash(s) + ':e7-e8')
	})

	it('strips only a trailing promotion suffix', () => {
		expect(rollMemoKey(s, 'B4b3-B4b4=q').endsWith(':B4b3-B4b4')).toBe(true)
		expect(rollMemoKey(s, '6d-5c=+s').endsWith(':6d-5c')).toBe(true)
		expect(rollMemoKey(s, 'n@f3').endsWith(':n@f3')).toBe(true)
		expect(rollMemoKey(s, 'A:d1-A:d5').endsWith(':A:d1-A:d5')).toBe(true)
		expect(rollMemoKey(s, 'g1-f3|h3').endsWith(':g1-f3|h3')).toBe(true)
		expect(rollMemoKey(s, '?f3').endsWith(':?f3')).toBe(true)
	})

	it('hashes the side to move and every world as worldKey and weight, in the stored order', () => {
		const text = [String(s.turn), ...s.worlds.map(({ b, w }) => worldKey(b) + '@' + w)].join(';')
		expect(positionHash(s)).toBe(fnv1a64(text))
	})

	it('changes with the side to move, any world, a weight or the order of the worlds', () => {
		const h = positionHash(s)
		expect(positionHash({ ...s, history: [{ code: 'x' }], quiet: 7 })).toBe(h)
		expect(positionHash({ ...s, turn: 1 })).not.toBe(h)
		expect(positionHash({ ...s, worlds: [...s.worlds].reverse() })).not.toBe(h)
		const [a, b] = s.worlds
		expect(positionHash({ ...s, worlds: [{ ...a, w: a.w + 1 }, { ...b, w: b.w - 1 }] })).not.toBe(h)
		// the extra data of a world (en passant, castling rights) is part of the position
		const epWorld = { ...a.b, x: { ...a.b.x, ep: sq('e3') } }
		expect(positionHash({ ...s, worlds: [{ ...a, b: epWorld }, b] })).not.toBe(h)
	})
})

describe('U4, U5, U7: texts', () => {
	it('(U4) says that a missed drop stays in hand, without a reason', () => {
		expect(outcomeText('miss', 'n@f3')).toBe('Missed: the piece stays in hand')
		expect(outcomeText('miss', 'p@5e')).toBe('Missed: the piece stays in hand')
		expect(outcomeText('move', 'n@f3')).toBe('Dropped')
		expect(outcomeText('miss', 'e2-e4')).toBe('Missed')
		expect(outcomeText('miss')).toBe('Missed')
	})

	it('(U5) leaves castling and en passant out for a variant without them', () => {
		const sentence
			= 'Castling and en passant are allowed only when they are possible in every possibility; they are never rolled.'
		expect(sharedRules()).toContain(sentence)
		expect(sharedRules(V)).toContain(sentence)
		expect(sharedRules({ specialMoves: true })).toContain(sentence)
		const plain = sharedRules({ specialMoves: false })
		expect(plain).not.toContain(sentence)
		expect(plain).toHaveLength(sharedRules().length - 1)
		expect(plain).toEqual(sharedRules().filter((r) => r !== sentence))
	})

	it('(L1) explains capture-the-king and the escape rule where the variant has them', () => {
		const capture = 'Check does not limit your moves: you win by capturing the enemy king, '
			+ 'unless the variant has its own goal.'
		const escape = 'Your king cannot escape: if every move you could make would leave your king to be captured for certain, you lose at once, unless one of your moves could still capture the enemy king.'
		expect(V.escapeRule).toBe(true)
		expect(sharedRules(V).slice(-2)).toEqual([capture, escape])
		// no escape rule (four sides, compulsory capture, several moves a turn, or the variant's choice)
		const free = sharedRules(orthodox({ escapeRule: false }))
		expect(free).toContain(capture)
		expect(free).not.toContain(escape)
		// no royal piece (antichess): neither sentence
		const spec = Object.assign(orthodoxSpec({ royalKing: false }), { id: 'test-no-royal', category: 'rules' })
		const plain = defineVariant(spec)
		expect(sharedRules(plain)).not.toContain(capture)
		expect(sharedRules(plain)).not.toContain(escape)
		expect(sharedRules()).not.toContain(capture)
		// the variants without castling and en passant find no such word in the added sentences
		expect([capture, escape].some((r) => /castling|en passant/i.test(r))).toBe(false)
		// three-check counts checks and Kriegspiel announces them: the shared card never says there is no check
		expect(sharedRules(V).some((r) => /no check/i.test(r))).toBe(false)
	})

	it('(U7) explains a king that could not escape, unless the variant has its own text', () => {
		expect(reasonText(V, 'cannotEscape')).toBe('the king could not escape')
		expect(resultText(V, { winner: 0, reason: 'cannotEscape' })).toBe('White wins (the king could not escape)')
		const own = orthodox({ reasonText: (r) => (r === 'cannotEscape' ? 'the general was trapped' : null) })
		expect(reasonText(own, 'cannotEscape')).toBe('the general was trapped')
	})
})
