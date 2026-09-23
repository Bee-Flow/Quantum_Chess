/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Every lesson goal and puzzle solution checked with the real engine (replaces the deferred validator script,
 * docs/LEAN-1.0.md): setups are legal, accepted moves pass their predicates, lesson rolls name real outcomes, and each
 * puzzle's accepted set equals the set the engine computes for its goal.
 */

import { describe, expect, it } from 'vitest'
import { budget, findMove, generateMoves, getOutcomes, moveRisk, pieceLocations, squareIndex, T, validateState } from '../../../src/engine/index.js'
import { LESSONS } from '../../../src/trainer/lessons/index.js'
import { check } from '../../../src/trainer/predicates.js'
import { PUZZLES } from '../../../src/trainer/puzzles/index.js'
import { lessonOutcome, movesForModes, playMove, scriptedReply, stepState, winChance, wonBy } from '../../../src/trainer/runner.js'

/**
 * The opponent's best chance to win at once after each outcome of a move, weighted.
 *
 * @param {object} state position
 * @param {string} code move
 * @return {number}
 */
function opponentWinChance(state, code) {
	let sum = 0
	for (const o of getOutcomes(state, code)) {
		if (o.state.result) {
			sum += wonBy(o.state, state.turn) ? 0 : o.weight
			continue
		}
		let best = 0
		for (const r of generateMoves(o.state)) {
			best = Math.max(best, winChance(o.state, r.code))
		}
		sum += o.weight * best
	}
	return sum / T
}

const sorted = (a) => [...a].sort()

describe('lessons', () => {
	it('has eleven lessons in order with titles and goals', () => {
		expect(LESSONS.map((l) => l.id)).toEqual(['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10', 'L11'])
		for (const l of LESSONS) {
			expect(l.title()).toBeTruthy()
			expect(l.goal()).toBeTruthy()
		}
	})

	for (const lesson of LESSONS.filter((l) => l.id !== 'L11')) {
		it(`${lesson.id}: every step is playable and every accepted move reaches the goal`, () => {
			let current = null
			lesson.steps.forEach((step, i) => {
				const before = stepState(step, current)
				if (step.type === 'explain' || step.type === 'quiz') {
					if (before) {
						expect(validateState(before).ok).toBe(true)
					}
					if (step.type === 'quiz') {
						expect(step.correct).toBeGreaterThanOrEqual(0)
						expect(step.correct).toBeLessThan(step.answers.length)
					}
					current = before
					return
				}
				expect(before, `${lesson.id} step ${i} has a position`).toBeTruthy()
				if (step.type === 'watch') {
					const m = findMove(before, step.code)
					expect(m).toBeTruthy()
					const keys = m.outcomes.map((o) => o.key)
					for (const k of step.roll) {
						expect(keys).toContain(k)
					}
					current = playMove(before, m.code, lessonOutcome(m, step.roll)).state
					return
				}
				const allowed = movesForModes(generateMoves(before), step.modes)
				const codes = step.accepted ?? allowed.map((m) => m.code).filter((c) => {
					const m = findMove(before, c)
					return check(step.success, before, m, playMove(before, c, lessonOutcome(m, step.roll)).state)
				})
				expect(codes.length, `${lesson.id} step ${i} has solutions`).toBeGreaterThan(0)
				const rollKeys = new Set()
				for (const code of codes) {
					const m = findMove(before, code)
					expect(m, `${lesson.id} step ${i}: ${code} legal`).toBeTruthy()
					expect(allowed).toContain(m)
					m.outcomes.forEach((o) => rollKeys.add(o.key))
					const after = playMove(before, m.code, lessonOutcome(m, step.roll)).state
					expect(check(step.success, before, m, after), `${lesson.id} step ${i}: ${code} succeeds`).toBe(true)
				}
				for (const k of step.roll ?? []) {
					if (step.accepted) {
						expect(rollKeys.has(k), `${lesson.id} step ${i}: roll key ${k}`).toBe(true)
					}
				}
				// some allowed move fails, so the task is a real choice
				const wrong = allowed.filter((m) => !codes.includes(m.code))
				if (step.accepted && wrong.length) {
					const m = wrong[0]
					expect(check(step.success, before, m, playMove(before, m.code, lessonOutcome(m, step.roll)).state)).toBe(false)
				}
				const first = findMove(before, codes[0])
				current = playMove(before, first.code, lessonOutcome(first, step.roll)).state
				const reply = scriptedReply(step.reply, current)
				if (step.reply?.scripted) {
					expect(reply, `${lesson.id} step ${i}: scripted reply legal`).toBeTruthy()
					current = playMove(current, reply).state
				}
				if (step.reply?.engine) {
					current = null // the engine's reply is not scripted: the next step must set up its own position
				}
			})
		})
	}

	it('L1.2: exactly the blocks make the king safe', () => {
		const step = LESSONS[0].steps[2]
		const s = stepState(step, null)
		const safe = generateMoves(s).filter((m) => moveRisk(s, m.code) === 0).map((m) => m.code)
		expect(sorted(safe)).toEqual(sorted(step.accepted))
	})

	it('L1.3: a1-a8 is the unique immediate win', () => {
		const s = stepState(LESSONS[0].steps[3], null)
		expect(generateMoves(s).filter((m) => winChance(s, m.code) === 1).map((m) => m.code)).toEqual(['a1-a8'])
	})

	it('L2.2: fifteen splits from f3', () => {
		const l = LESSONS[1]
		let s = playMove(stepState(l.steps[0], null), 'g1-f3|h3').state
		s = playMove(s, 'e7-e6').state
		const splits = generateMoves(s).filter((m) => check(l.steps[1].success, s, m, s))
		expect(splits).toHaveLength(15)
	})

	it('L3.2: merging on b5 is safe, on b1 the bishop captures', () => {
		const s = stepState(LESSONS[2].steps[1], null)
		const knight = pieceLocations(s).findIndex((l) => l.some((x) => x.square === squareIndex('a3')))
		expect(check({ captureRisk: { id: knight, max: 0 } }, s, findMove(s, 'a3|c3-b5'), playMove(s, 'a3|c3-b5').state)).toBe(true)
		expect(check({ captureRisk: { id: knight, max: 0.5 } }, s, findMove(s, 'a3|c3-b1'), playMove(s, 'a3|c3-b1').state)).toBe(false)
	})

	it('L3.3: only the converging capture is certain', () => {
		const s = stepState(LESSONS[2].steps[2], null)
		expect(winChance(s, 'h5-h8')).toBe(0.5)
		expect(winChance(s, 'd4-h8')).toBe(0.5)
		expect(winChance(s, 'd4|h5-h8')).toBe(1)
	})

	it('L4 and L6: the quoted odds', () => {
		const pctOf = (s, code) => Object.fromEntries(findMove(s, code).outcomes.map((o) => [o.key, (100 * o.weight) / T]))
		expect(pctOf(stepState(LESSONS[3].steps[0], null), 'd1-d5')).toEqual({ move: 50, capture: 50 })
		expect(pctOf(stepState(LESSONS[3].steps[1], null), 'e4-d5')).toEqual({ miss: 50, capture: 50 })
		expect(pctOf(stepState(LESSONS[5].steps[0], null), 'f3-e5')).toEqual({ miss: 50, move: 25, capture: 25 })
		const q = stepState(LESSONS[5].steps[2], null)
		expect(pctOf(q, 'c1-c6').capture).toBe(50)
		expect(pctOf(q, 'b3-e6').capture).toBe(25)
		expect(pctOf(q, 'h4-g6').capture).toBe(25)
		expect(pctOf(stepState(LESSONS[5].steps[3], null), 'c1-g5')).toEqual({ miss: 50, move: 50 })
	})

	it('L5.1: passing the knight is quantum, not rolled', () => {
		expect(findMove(stepState(LESSONS[4].steps[0], null), 'a1-a8').resolution).toBe('quantum')
	})

	it('L8.2: the budget is full, no split is legal and h1-h8 is a fallback roll', () => {
		const s = stepState(LESSONS[7].steps[1], null)
		expect(budget(s, 'w')).toBe(8)
		expect(generateMoves(s).some((m) => m.type === 'split')).toBe(false)
		expect(findMove(s, 'h1-h8').fallback).toBe(true)
	})

	it('L10.1: the split is the only move that saves the knight half of the time', () => {
		const s = stepState(LESSONS[9].steps[0], null)
		const knight = pieceLocations(s).findIndex((l) => l.some((x) => x.square === squareIndex('a1')))
		const risk = (code) => {
			const after = playMove(s, code).state
			return check({ captureRisk: { id: knight, max: 0.5 } }, s, findMove(s, code), after)
		}
		expect(risk('a1-c2|b3')).toBe(true)
		expect(risk('a1-c2')).toBe(false)
		expect(risk('a1-b3')).toBe(false)
	})
})

describe('puzzles', () => {
	it('has the eleven 1.0 puzzles', () => {
		expect(PUZZLES.map((p) => p.id)).toEqual(['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10', 'P11'])
	})

	for (const p of PUZZLES) {
		it(`${p.id} ${p.name()}: the accepted set is the engine's solution`, () => {
			const s = stepState(p, null)
			expect(s.turn).toBe(p.side)
			const moves = generateMoves(s)
			let solution
			if (p.type === 'forced' || p.type === 'max') {
				const chance = new Map(moves.map((m) => [m.code, winChance(s, m.code)]))
				const best = Math.max(...chance.values())
				if (p.type === 'forced') {
					expect(best).toBe(1)
				} else {
					expect(best * 100).toBeCloseTo(p.value, 6)
				}
				solution = moves.filter((m) => chance.get(m.code) >= best - 0.005).map((m) => m.code)
				for (const trap of p.traps.filter((x) => x.value !== null)) {
					expect(chance.get(findMove(s, trap.code).code) * 100, trap.code).toBeCloseTo(trap.value, 6)
				}
			} else if (p.type === 'survive') {
				const risk = new Map(moves.map((m) => [m.code, opponentWinChance(s, m.code)]))
				const best = Math.min(...risk.values())
				expect(best * 100).toBeCloseTo(p.value, 6)
				solution = moves.filter((m) => risk.get(m.code) <= best + 0.005).map((m) => m.code)
				for (const trap of p.traps.filter((x) => x.value !== null)) {
					expect(risk.get(findMove(s, trap.code).code) * 100, trap.code).toBeCloseTo(trap.value, 6)
				}
			} else {
				const knight = pieceLocations(s).findIndex((l) => l.some((x) => x.square === squareIndex('h8')))
				const loss = new Map(moves.map((m) => {
					const after = playMove(s, m.code).state
					let lost = 1
					for (const max of [0, 0.5]) {
						if (check({ captureRisk: { id: knight, max } }, s, m, after)) {
							lost = max
							break
						}
					}
					return [m.code, lost]
				}))
				const best = Math.min(...loss.values())
				expect(best * 100).toBe(p.value)
				solution = moves.filter((m) => loss.get(m.code) === best).map((m) => m.code)
			}
			expect(sorted(solution)).toEqual(sorted(p.accepted.map((c) => findMove(s, c).code)))
		})
	}
})
