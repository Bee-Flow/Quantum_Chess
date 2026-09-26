/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The computer plays quantum moves (the quantum terms of core/ai.js, `QUANTUM`): a split that threatens two pieces,
 * a split that dodges a capture or closes both lines of a double attack on the king, merges and measurements that
 * free the budget or capture, and what a measurement shows when the turn goes on after it. The terms never buy a
 * quantum move with material. In self-play the normal level plays quantum moves in orthodox chess, and the hard
 * level still beats the normal level (atomic chess and antichess, whose games are short).
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import antichess from '../../../src/variants/antichess.js'
import atomic from '../../../src/variants/atomic.js'
import { chooseMove, measureInsight, QUANTUM, quantumTerms, splitIdeas } from '../../../src/variants/core/ai.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import {
	applyMove,
	branches,
	legalMoves,
	newGame,
	parseCode,
	royalDanger,
	splitCode,
} from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { cloneWorld } from '../../../src/variants/core/world.js'
import { play, stateOf, workClock } from './helpers.js'

const V = defineVariant(Object.assign(orthodoxSpec(), { id: 'test-ai3', category: 'rules' }))

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
 * The code of the split of the piece on `f` onto `a` and `b`.
 *
 * @param {string} f from square
 * @param {string} a first target
 * @param {string} b second target
 * @return {string}
 */
function split(f, a, b) {
	return splitCode(V, sq(f), sq(a), sq(b))
}

/**
 * The codes the computer chooses at a level for the seeds 1 … `seeds`, each search with the same budget of work.
 *
 * @param {object} W variant
 * @param {object} s state
 * @param {string} level level id
 * @param {number} seeds how many seeds
 * @return {Promise<string[]>}
 */
async function picks(W, s, level, seeds) {
	const out = []
	for (let seed = 1; seed <= seeds; seed++) {
		out.push(await chooseMove(W, s, { level, rng: seededRng(seed), now: workClock() }))
	}
	return out
}

/**
 * The squares a move or split code puts its piece on.
 *
 * @param {string} code move or split code
 * @return {string[]}
 */
function targets(code) {
	return code.split('-')[1].split('|')
}

// White: Kb1, Nd4; Black: Kh8, Qc7, Rh6. From b5 the knight attacks the queen, from f5 the rook; no single square
// attacks both, and b5, f5 are safe (e6 is not: the rook covers it).
const FORK = { b1: '0:k', d4: '0:n', h8: '1:k', c7: '1:q', h6: '1:r' }

// The same with black pawns on a6, d7 and g6: every square from which the knight would attack is covered by a pawn.
const COVERED = { ...FORK, a6: '1:p', d7: '1:p', g6: '1:p' }

// The rook on e8 and the bishop on h4 both attack the White king, which cannot move: only the knight split onto e3
// (the e-file) and g3 (the diagonal) leaves neither capture certain.
const DOUBLE = { e1: '0:k', f1: '0:n', d1: '0:r', d2: '0:p', a5: '0:q', h8: '1:k', e8: '1:r', h4: '1:b' }

/**
 * A two-world state: the White knight on f3 or h3 (50/50), a black rook on g5 that both parts attack.
 *
 * @return {object}
 */
function ghostKnight() {
	const at = (n) => ({ a1: '0:k', [n]: '0:n', h8: '1:k', g5: '1:r' })
	return stateOf(V, [[at('f3'), 1], [at('h3'), 1]])
}

/**
 * An orthodox variant in which a measurement does not end the turn: the side that measured moves again, and the
 * search looks at no answer inside such a turn (as in the multiverse, `replySide` null).
 *
 * @param {boolean} [ownSearch] leave out `replySide`: the search then looks at the next move itself
 * @return {object}
 */
function measureAgain(ownSearch = false) {
	const spec = orthodoxSpec()
	const after = spec.afterMove
	return defineVariant(Object.assign(spec, {
		id: 'test-ai3-again',
		category: 'rules',
		afterMove(next, m, w) {
			after(next, m, w)
			next.x = { ...next.x, again: false }
		},
		applyMiss(b, action) {
			const again = action.type === 'measure'
			if (Boolean(b.x.again) === again) {
				return b
			}
			const n = cloneWorld(b)
			n.x = { ...n.x, again }
			return n
		},
		nextSide(b, side) {
			return b.x.again ? side : 1 - side
		},
	}, ownSearch ? {} : { replySide: (s, me) => (s.turn === me ? null : s.turn) }))
}

describe('the quantum terms', () => {
	it('give a split that threatens two pieces more than a quiet split, and never more than the cap', () => {
		const s = stateOf(V, [[FORK, 1]])
		const fork = quantumTerms(V, s, split('d4', 'b5', 'f5'))
		const quiet = quantumTerms(V, s, split('d4', 'b3', 'e2'))
		expect(fork).toMatchObject({ total: QUANTUM.cap, purpose: true })
		expect(quiet.purpose).toBe(false)
		expect(quiet.total).toBeGreaterThan(0)
		expect(quiet.total).toBeLessThan(10)
		// the spread part stays when a deeper search replaces the threats
		expect(fork.style).toBeCloseTo(quiet.style, 6)
		// the same threats from one certain piece count too, so a split never wins by being quantum
		expect(quantumTerms(V, s, 'd4-b5').total).toBeCloseTo(QUANTUM.attack * 900, 6)
		// e6 stands where the rook takes it: no terms at all
		expect(quantumTerms(V, s, split('d4', 'c6', 'e6')).total).toBe(0)
		expect(splitIdeas(V, s, sq('d4'))[0]).toBe(split('d4', 'b5', 'f5'))
	})

	it('give nothing to a split whose part a pawn could take', () => {
		const s = stateOf(V, [[COVERED, 1]])
		for (const code of [split('d4', 'b5', 'f5'), split('d4', 'c6', 'e6'), split('d4', 'b5', 'b3')]) {
			expect(quantumTerms(V, s, code), code).toEqual({ total: 0, style: 0, purpose: false })
		}
	})

	it('reward a piece that dodges a capture by splitting onto two safe squares', () => {
		const s = stateOf(V, [[{ h2: '0:k', d4: '0:n', h8: '1:k', e5: '1:p' }, 1]])
		const dodge = quantumTerms(V, s, split('d4', 'b3', 'f3'))
		expect(dodge.purpose).toBe(true)
		expect(dodge.style).toBeGreaterThanOrEqual(QUANTUM.dodge)
		expect(quantumTerms(V, s, 'd4-f3').style).toBe(0)
	})

	it('look first at the split that closes both lines of a double attack on the king', () => {
		const s = stateOf(V, [[DOUBLE, 1]])
		expect(royalDanger(V, s, 0)).toBe(1)
		expect(splitIdeas(V, s, sq('f1'))[0]).toBe(split('f1', 'e3', 'g3'))
		expect(quantumTerms(V, s, split('f1', 'e3', 'g3'))).toMatchObject({ style: QUANTUM.block, purpose: true })
	})

	it('reward a merge or a measurement that frees the budget, and a merge that captures', () => {
		const s = ghostKnight()
		const relief = QUANTUM.relief / 8
		expect(legalMoves(V, s).filter((m) => m.type !== 'move').map((m) => m.code).sort())
			.toEqual(['?f3', 'f3|h3-g1', 'f3|h3-g5'])
		expect(quantumTerms(V, s, '?f3').total).toBeCloseTo(relief, 6)
		expect(quantumTerms(V, s, 'f3|h3-g1').total).toBeCloseTo(relief, 6)
		expect(branches(V, s, 'f3|h3-g5').map((br) => br.key)).toEqual(['capture'])
		expect(quantumTerms(V, s, 'f3|h3-g5').total).toBeCloseTo(relief + QUANTUM.capture, 6)
		// a part's own capture is an ordinary capture: its material counts in the search, no terms
		expect(quantumTerms(V, s, 'f3-g5').total).toBe(0)
	})

	it('see what a measurement shows when the turn goes on after it', async () => {
		// the knight is on c3 (it attacks the queen on e4) or on h3 (the rook on g5): once measured, the next move
		// takes the one it attacks for certain; without the measurement one capture must serve both possibilities
		const W = measureAgain()
		const at = (n) => ({ a1: '0:k', [n]: '0:n', h8: '1:k', e4: '1:q', g5: '1:r' })
		const edit = (b) => {
			b.x = { ep: -1, epVictim: -1, castle: [], again: false }
		}
		const s = stateOf(W, [[at('c3'), 1], [at('h3'), 1]], 0, edit)
		expect(legalMoves(W, s).filter((m) => m.type === 'measure').map((m) => m.code)).toEqual(['?c3'])
		expect(play(W, s, '?c3').turn).toBe(0)
		// informed 0.5 · 900 + 0.5 · 500, blind 0.5 · 900 (c3-e4 misses where the knight is on h3)
		for (const level of ['easy', 'normal', 'hard']) {
			expect(await measureInsight(W, s, '?c3', level), level).toBeCloseTo(250, 6)
		}
		// no value of its own where the turn passes, or where the search looks at the next move itself
		expect(await measureInsight(V, stateOf(V, [[at('c3'), 1], [at('h3'), 1]]), '?c3')).toBe(0)
		const X = measureAgain(true)
		expect(await measureInsight(X, stateOf(X, [[at('c3'), 1], [at('h3'), 1]], 0, edit), '?c3')).toBe(0)
	})
})

describe('the computer plays quantum moves', () => {
	it('splits to threaten the queen and the rook at the normal level', async () => {
		const s = stateOf(V, [[FORK, 1]])
		const codes = await picks(V, s, 'normal', 6)
		const threats = codes.filter((c) => parseCode(V, c).type === 'split' && targets(c).includes('b5'))
		expect(threats.length, codes.join(' ')).toBeGreaterThanOrEqual(3)
		expect(codes, codes.join(' ')).toContain(split('d4', 'b5', 'f5'))
	})

	it('never puts a part where a pawn takes it for the sake of a threat', async () => {
		const s = stateOf(V, [[COVERED, 1]])
		const covered = ['b5', 'c6', 'e6', 'f5', 'h5']
		for (const level of ['normal', 'hard']) {
			for (const code of await picks(V, s, level, 4)) {
				expect(code.startsWith('d4-') && targets(code).some((t) => covered.includes(t)), level + ' ' + code)
					.toBe(false)
			}
		}
	})

	it('takes free material before it plays a quantum move', async () => {
		const s = stateOf(V, [[{ ...FORK, e2: '1:b' }, 1]])
		for (const level of ['easy', 'normal', 'hard']) {
			expect(await picks(V, s, level, 3), level).toEqual(['d4-e2', 'd4-e2', 'd4-e2'])
		}
	})

	it('finds the split that is the only escape from a double attack', async () => {
		const s = stateOf(V, [[DOUBLE, 1]])
		for (const level of ['normal', 'hard']) {
			const codes = await picks(V, s, level, 4)
			expect(codes, level).toEqual(Array(4).fill(split('f1', 'e3', 'g3')))
		}
		const after = play(V, s, split('f1', 'e3', 'g3'))
		expect([after.result, royalDanger(V, after, 0)]).toEqual([null, 0.5])
	})

	it('plays quantum moves in orthodox self-play at the normal level', async () => {
		const tally = { split: 0, merge: 0, measure: 0 }
		for (let g = 1; g <= 2; g++) {
			const rng = seededRng(g)
			let s = newGame(V)
			let quantum = 0
			for (let ply = 0; ply < 30 && !s.result; ply++) {
				const code = await chooseMove(V, s, { level: 'normal', rng, now: workClock() })
				const type = parseCode(V, code).type
				if (type !== 'move') {
					tally[type]++
					quantum++
				}
				s = applyMove(V, s, code, rng).state
			}
			// before the quantum terms: 1 quantum move in these two games (11 and 12 with them)
			expect(quantum, 'game ' + g).toBeGreaterThanOrEqual(6)
		}
		expect(tally.split).toBeGreaterThanOrEqual(10)
		expect(tally.merge + tally.measure).toBeGreaterThanOrEqual(2)
	}, 60000)

	it('still loses to the hard level in a small match on two variants', async () => {
		// atomic chess (with the quantum terms) and antichess (without most of them): short games
		for (const W of [atomic, antichess]) {
			const wins = { hard: 0, normal: 0 }
			for (let g = 1; g <= 4; g++) {
				const rng = seededRng(g)
				const hard = g % 2
				let s = newGame(W)
				while (!s.result && s.ply < 80) {
					const level = s.turn === hard ? 'hard' : 'normal'
					s = applyMove(W, s, await chooseMove(W, s, { level, rng, now: workClock() }), rng).state
				}
				if (s.result?.winner === hard) {
					wins.hard++
				} else if (s.result?.winner === 1 - hard) {
					wins.normal++
				}
			}
			expect(wins.hard, W.id + ' ' + JSON.stringify(wins)).toBeGreaterThan(wins.normal)
		}
	}, 120000)
})
