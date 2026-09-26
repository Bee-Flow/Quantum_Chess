/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Package "ai" of the final reviews of the variants: the computer sees the escape rule (A1: the real outcomes of its
 * own moves, certain captures and mates after an answer, quiet mates included, checks and boxing moves as forcing
 * moves), breaks exact ties at random (A2) and tells `aiView` the level (A5); the hard level looks a move deeper than
 * the normal level. The stand-pat option of the normal level (A3) is tested in horde.spec.js.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import atomic from '../../../src/variants/atomic.js'
import { chooseMove, LEVELS, mightForce } from '../../../src/variants/core/ai.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import {
	applyMove,
	applyOutcome,
	branches,
	legalMoves,
	newGame,
	royalDanger,
} from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { addPiece, HAND } from '../../../src/variants/core/world.js'
import horde from '../../../src/variants/horde.js'
import shogi from '../../../src/variants/shogi.js'
import { play, stateOf, workClock } from './helpers.js'

/**
 * An orthodox test variant with extra fields.
 *
 * @param {object} [extra] fields and hooks to add
 * @return {object}
 */
function orthodox(extra = {}) {
	return defineVariant(Object.assign(orthodoxSpec(), { id: 'test-ai2', category: 'rules' }, extra))
}

const V = orthodox()

/**
 * The codes the computer chooses at a level for a few seeds, each search with the same budget of work on any machine
 * (`workClock`).
 *
 * @param {object} W variant
 * @param {object} s state
 * @param {string} level level id
 * @param {number} seeds how many seeds (1, 2, ...)
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
 * The legal codes of a state that end the game at once with a win for the side to move, in every outcome.
 *
 * @param {object} W variant
 * @param {object} s state
 * @return {string[]}
 */
function winsAtOnce(W, s) {
	return legalMoves(W, s).map((m) => m.code).filter((code) => branches(W, s, code)
		.every((br, i) => applyOutcome(W, s, code, i).result?.winner === s.turn))
}

// White: Kg1 Ra1 Ne3 Pf2 Ph2; Black: Kg8 Qh3 Bb7 Rc4 Pf7 Pg7 Ph7. The knight guards g2; Nxc4 wins a rook but lets
// Qg2 (guarded by the bishop) leave the White king no escape.
const LURE = {
	g1: '0:k',
	a1: '0:r',
	e3: '0:n',
	f2: '0:p',
	h2: '0:p',
	g8: '1:k',
	h3: '1:q',
	b7: '1:b',
	c4: '1:r',
	f7: '1:p',
	g7: '1:p',
	h7: '1:p',
}

describe('A1: the computer sees the escape rule', () => {
	it('(a) wins at once when the enemy cannot escape: the shogi gold drop', async () => {
		// Sente K5i G2c with a pawn and a gold in hand; Gote K1a N2a. g@1b (and g@2b) leave the king no escape
		const s = stateOf(shogi, [[{ '5i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:n' }, 1]], 0, (b) => {
			b.x = {}
			addPiece(b, 'p', 0, HAND)
			addPiece(b, 'g', 0, HAND)
		})
		expect(play(shogi, s, 'g@1b').result).toEqual({ winner: 0, reason: 'cannotEscape' })
		const wins = winsAtOnce(shogi, s)
		expect(wins).toContain('g@1b')
		for (const level of LEVELS) {
			for (const code of await picks(shogi, s, level.id, 3)) {
				expect(wins, level.id + ' ' + code).toContain(code)
			}
		}
	})

	it('(a) wins at once when the enemy cannot escape: horde, even with the king not attacked', async () => {
		// Qa4 Rg7 Pd5 against kd8: a4-a8, a4-d7 and the quiet a4-c6 leave every Black move walking into a capture
		const s = stateOf(horde, [[{ a4: '0:q', g7: '0:r', d5: '0:p', d8: '1:k' }, 1]])
		expect(winsAtOnce(horde, s).sort()).toEqual(['a4-a8', 'a4-c6', 'a4-d7'])
		for (const level of LEVELS) {
			for (const code of await picks(horde, s, level.id, 5)) {
				const result = play(horde, s, code).result
				expect(result, level.id + ' ' + code).toEqual({ winner: 0, reason: 'cannotEscape' })
			}
		}
	})

	it('(a) wins at once when the enemy cannot escape a blow-up: atomic Ne5', async () => {
		// 1.Nf3 a6 2.Ne5: every Black move leaves the king to be blown up for certain (Nxf7 or Nxd7)
		let s = newGame(atomic)
		for (const code of ['g1-f3', 'a7-a6']) {
			s = play(atomic, s, code)
		}
		expect(winsAtOnce(atomic, s)).toEqual(['f3-e5'])
		for (const level of LEVELS) {
			expect(await picks(atomic, s, level.id, 3), level.id).toEqual(['f3-e5', 'f3-e5', 'f3-e5'])
		}
	})

	it('(a) avoids a move whose real outcome loses: here a side without a move wins', async () => {
		// a wall has no moves; Black's only move is h7xg6. Rg6xh6 takes a wall worth 300 but leaves Black without a
		// move, and in this test variant the side that cannot move wins (the core finds that only in the real state)
		const spec = orthodoxSpec()
		const W = defineVariant(Object.assign(spec, {
			id: 'test-ai2-stuck',
			category: 'rules',
			types: { ...spec.types, w: { moves: [], value: 300 } },
			noMoves: (state) => ({ winner: state.turn, reason: 'noMoves' }),
		}))
		const walls = { a7: '1:w', b7: '1:w', b8: '1:w', h6: '1:w' }
		const s = stateOf(W, [[{ c1: '0:k', g6: '0:r', a8: '1:k', h7: '1:p', ...walls }, 1]])
		expect(play(W, s, 'g6-h6').result).toEqual({ winner: 1, reason: 'noMoves' })
		for (const level of LEVELS) {
			for (const code of await picks(W, s, level.id, 3)) {
				expect(play(W, s, code).result, level.id + ' ' + code).toBeNull()
			}
		}
	})

	it('finds a mate in one at every level, the hard level with every seed', async () => {
		const s = play(V, stateOf(V, [[LURE, 1]]), 'e3-c4')
		expect(winsAtOnce(V, s)).toEqual(['h3-g2'])
		expect(await picks(V, s, 'hard', 5)).toEqual(['h3-g2', 'h3-g2', 'h3-g2', 'h3-g2', 'h3-g2'])
		for (const level of ['easy', 'normal']) {
			expect(await picks(V, s, level, 3), level).toEqual(['h3-g2', 'h3-g2', 'h3-g2'])
		}
	})

	it('does not step into a mate in one at the normal and hard levels', async () => {
		const s = stateOf(V, [[LURE, 1]])
		expect(play(V, play(V, s, 'e3-c4'), 'h3-g2').result).toEqual({ winner: 1, reason: 'cannotEscape' })
		for (const level of ['normal', 'hard']) {
			for (const code of await picks(V, s, level, 5)) {
				expect(code, level).not.toBe('e3-c4')
				expect(winsAtOnce(V, play(V, s, code)), level + ' ' + code).toEqual([])
			}
		}
	})

	it('(b) does not fear an answer that leaves the answering king to be captured for certain', async () => {
		// Qxd5 wins a rook: the knight on e7 could take the queen back, but it is pinned against its king by Re1
		const pinned = { g1: '0:k', d1: '0:q', e1: '0:r', e8: '1:k', e7: '1:n', d5: '1:r', a7: '1:p', h7: '1:p' }
		const s = stateOf(V, [[pinned, 1]])
		for (const level of ['normal', 'hard']) {
			expect(await picks(V, s, level, 5), level).toEqual(['d1-d5', 'd1-d5', 'd1-d5', 'd1-d5', 'd1-d5'])
		}
	})

	it('(c) counts a move that leaves an enemy royal piece 100 % capturable as forcing', () => {
		const s = stateOf(V, [[{ e1: '0:k', d1: '0:q', e8: '1:k' }, 1]])
		expect(mightForce(V, s, 'd1-e2')).toBe(true)
		expect(mightForce(V, s, 'd1-d2')).toBe(false)
		// the queen is a ghost on d1 or h1: after d1-e2 the king can be captured in one possibility only
		const ghost = stateOf(V, [[{ e1: '0:k', d1: '0:q', e8: '1:k' }, 1], [{ e1: '0:k', h1: '0:q', e8: '1:k' }, 1]])
		expect(branches(V, ghost, 'd1-e2')).toHaveLength(1)
		expect(mightForce(V, ghost, 'd1-e2')).toBe(false)
		// a variant without the escape rule keeps the old meaning
		const W = orthodox({ escapeRule: false })
		expect(mightForce(W, stateOf(W, [[{ e1: '0:k', d1: '0:q', e8: '1:k' }, 1]]), 'd1-e2')).toBe(false)
	})
})

describe('A1: quiet mates in one (the king is not attacked, but every move walks into a capture)', () => {
	// Black to move; the Black king can take a knight (the lure), after which White has only quiet wins at once
	const LURES = [
		[{ b1: '0:k', d5: '0:q', h8: '0:n', g8: '1:k' }, 'g8-h8'],
		[{ d2: '0:k', c4: '0:q', a1: '0:n', a2: '1:k' }, 'a2-a1'],
		[{ b3: '0:k', g5: '0:q', d1: '0:n', c1: '1:k' }, 'c1-d1'],
		[{ b2: '0:k', c5: '0:q', a8: '0:n', b7: '1:k' }, 'b7-a8'],
		[{ d7: '0:k', c4: '0:q', b8: '0:n', b7: '1:k' }, 'b7-b8'],
	]

	it('are quiet: the escape rule ends the game with the Black king not attacked, and they count as forcing', () => {
		for (const [placement, lure] of LURES) {
			const after = play(V, stateOf(V, [[placement, 1]], 1), lure)
			const wins = winsAtOnce(V, after)
			expect(wins.length, lure).toBeGreaterThan(0)
			for (const code of wins) {
				const next = play(V, after, code)
				expect(next.result, lure + ' ' + code).toEqual({ winner: 0, reason: 'cannotEscape' })
				expect(royalDanger(V, { ...next, result: null }, 1), lure + ' ' + code).toBe(0)
				expect(mightForce(V, after, code), lure + ' ' + code).toBe(true)
			}
		}
		// a quiet move that leaves the enemy king a safe step does not count
		const s = stateOf(V, [[{ b1: '0:k', d5: '0:q', e8: '1:k' }, 1]])
		expect(mightForce(V, s, 'd5-d4')).toBe(false)
	})

	it('are not walked into at the normal and hard levels', async () => {
		for (const [placement, lure] of LURES) {
			const s = stateOf(V, [[placement, 1]], 1)
			for (const level of ['normal', 'hard']) {
				for (const code of await picks(V, s, level, 5)) {
					expect(code, level).not.toBe(lure)
					expect(winsAtOnce(V, play(V, s, code)), level + ' ' + code).toEqual([])
				}
			}
		}
	})
})

describe('the hard level looks a move deeper than the normal level', () => {
	it('finds a knight fork of king and rook with every seed (the rook falls on the third move)', async () => {
		const s = stateOf(V, [[{ g1: '0:k', a2: '0:p', b5: '0:n', e8: '1:k', a8: '1:r', h7: '1:p' }, 1]])
		expect(await picks(V, s, 'hard', 5)).toEqual(['b5-c7', 'b5-c7', 'b5-c7', 'b5-c7', 'b5-c7'])
	})

	/**
	 * Six White pieces in two places each: 2 ** 6 worlds.
	 *
	 * @return {object}
	 */
	function sixtyFour() {
		const pairs = [['b1', 'c3'], ['g1', 'f3'], ['d1', 'd3'], ['a1', 'a3'], ['h1', 'h3'], ['c1', 'e3']]
		const types = ['n', 'n', 'q', 'r', 'r', 'b']
		const placements = []
		for (let mask = 0; mask < 64; mask++) {
			const p = { e1: '0:k', f2: '0:p', g2: '0:p', e8: '1:k', d7: '1:p', e7: '1:p', f7: '1:p', d8: '1:q' }
			pairs.forEach(([a, b], i) => {
				p[mask & (1 << i) ? b : a] = '0:' + types[i]
			})
			placements.push([{ ...p, b8: '1:n', g8: '1:n', a8: '1:r', h8: '1:r' }, 1])
		}
		return stateOf(V, placements)
	}

	it('ends in time when the third move does not fit in the budget (64 worlds)', async () => {
		const s = sixtyFour()
		const hard = LEVELS.find((l) => l.id === 'hard')
		// a check every 0.12 ms, the pace of a desktop here: the two-move pass fits (about 18,000 checks, 2.2 s), the
		// third move does not, and stops at nine tenths of the budget
		const now = workClock(0.12)
		const code = await chooseMove(V, s, { level: 'hard', rng: seededRng(3), now })
		expect(now.elapsed()).toBeGreaterThanOrEqual(hard.timeMs * 0.9)
		expect(now.elapsed()).toBeLessThan(hard.timeMs)
		expect(branches(V, s, code)).not.toBeNull()
	})

	// on the wall clock, as in the app: only on an idle machine, since a busy one (vitest runs many files at once)
	// can slow the two-move pass past the deadline, and the search then stops one step after it
	it.runIf(process.env.QC_PERF === '1')('ends in time on the wall clock too (QC_PERF=1)', async () => {
		const s = sixtyFour()
		const hard = LEVELS.find((l) => l.id === 'hard')
		const started = Date.now()
		const code = await chooseMove(V, s, { level: 'hard', rng: seededRng(3) })
		expect(Date.now() - started).toBeLessThan(hard.timeMs)
		expect(branches(V, s, code)).not.toBeNull()
	})
})

describe('A2: exact ties are broken at random', () => {
	it('lets the hard level open with different moves for different seeds, the same for the same seed', async () => {
		const s = newGame(V)
		const first = await picks(V, s, 'hard', 6)
		expect(new Set(first).size).toBeGreaterThan(1)
		expect(await picks(V, s, 'hard', 6)).toEqual(first)
	})

	it('no longer shuffles one rook back and forth at the hard level', async () => {
		// before, both sides played b1-c3 b8-c6 and then a1-b1 a8-b8 b1-a1 b8-a8 ... until the 50-move draw
		const rng = seededRng(1)
		let s = newGame(V)
		const white = []
		for (let ply = 0; ply < 12 && !s.result; ply++) {
			const code = await chooseMove(V, s, { level: 'hard', rng, now: workClock() })
			if (s.turn === 0) {
				white.push(code)
			}
			s = applyMove(V, s, code, rng).state
		}
		expect(new Set(white).size, white.join(' ')).toBeGreaterThan(3)
	})
})

describe('A5: the level of the computer', () => {
	it('is passed to aiView as its third argument', async () => {
		const seen = []
		const W = orthodox({
			aiView(state, side, level) {
				seen.push([side, level])
				return state
			},
		})
		const s = newGame(W)
		for (const level of LEVELS) {
			const code = await chooseMove(W, s, { level: level.id, rng: seededRng(1), now: workClock() })
			expect(branches(W, s, code)).not.toBeNull()
		}
		expect(seen).toEqual([[0, 'easy'], [0, 'normal'], [0, 'hard']])
	})
})
