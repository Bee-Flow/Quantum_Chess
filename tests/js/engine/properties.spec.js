/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Property tests (§12) over thousands of seeded random playouts: I1–I12 after every move, conservation
 * of T, the budget, B(¬mover) never grows, notation round trip, determinism, immutability, and cross-checks of the
 * fast implementations against naive transcriptions of the definitions (kingDanger, kingTrapped, legality).
 *
 * Section numbers (§) refer to docs/engine-rules.md.
 */

import { describe, expect, it } from 'vitest'
import { E, T } from './helpers.js'
import { check, choose, START_POSITIONS } from './playout.js'

/**
 * Naive kingDanger: flip the turn and take the best capture weight on the king square among the opponent's legal
 * standard moves and merges.
 *
 * @param {object} state state
 * @param {'w'|'b'} color king colour
 * @return {number}
 */
function naiveDanger(state, color) {
	const k = E.pieceLocations(state)[color === 'w' ? 0 : 16]
	if (k.length === 0) {
		return 0
	}
	const flipped = { ...state, turn: color === 'w' ? 'b' : 'w', ep: '-', castling: '-', result: null }
	flipped.history = [E.positionHash(flipped)]
	const v = E.validateState(flipped)
	if (!v.ok) {
		throw new Error(v.message)
	}
	let best = 0
	for (const m of E.generateMoves(v.state)) {
		if (m.type !== 'split' && m.type !== 'measure' && m.to[0] === k[0].square) {
			const cap = m.outcomes.find((o) => o.key === 'capture')
			if (cap && cap.weight > best) {
				best = cap.weight
			}
		}
	}
	return best
}

/**
 * Naive kingTrapped (§6): every outcome of every legal move (E1b skipped) keeps the game running with the mover's
 * king certainly capturable.
 *
 * @param {object} state state
 * @return {boolean}
 */
function naiveTrapped(state) {
	const moves = E.generateMoves(state)
	if (state.result !== null || moves.length === 0) {
		return false
	}
	return moves.every((m) => E.outcomesForSearch(state, m).every((o) => o.state.result === null && E.kingDanger(o.state, state.turn) === T))
}

/**
 * Naive moveRisk (§8) from getOutcomes.
 *
 * @param {object} state state
 * @param {object} move legal move
 * @return {number}
 */
function naiveRisk(state, move) {
	const enemyKing = state.turn === 'w' ? 16 : 0
	let risk = 0
	for (const o of E.getOutcomes(state, move)) {
		if (o.captured !== enemyKing) {
			risk += (o.weight / T) * (E.kingDanger(o.state, state.turn) / T)
		}
	}
	return risk
}

/**
 * Play seeded games and check every step.
 *
 * @param {object} opts options
 * @return {object} counters
 */
function playouts({ seed, games, maxPlies, policy, heavyEvery = 0 }) {
	const rng = E.seededRng(seed)
	const count = { plies: 0, rolled: 0, splits: 0, merges: 0, measures: 0, fallbacks: 0, results: {}, trappedChecks: 0, dangerChecks: 0 }
	for (let g = 0; g < games; g++) {
		let s = START_POSITIONS[g % START_POSITIONS.length]()
		for (let p = 0; p < maxPlies && s.result === null; p++) {
			const moves = E.generateMoves(s)
			check(moves.length > 0 && E.hasAnyLegalMove(s), 'no moves in a running game')
			const m = choose(moves, rng, policy)
			const u = Math.floor(rng() * T)
			const beforeJson = JSON.stringify(s)
			const r = E.applyMove(s, m, { u })
			const afterJson = JSON.stringify(r.state)
			const where = ' after ' + m.code + ' (game ' + g + ', ply ' + p + ')'
			// immutability and determinism
			check(JSON.stringify(s) === beforeJson, 'input mutated' + where)
			const again = E.applyMove(JSON.parse(beforeJson), m.code, { u })
			check(JSON.stringify(again.state) === afterJson, 'not deterministic' + where)
			check(JSON.stringify(again.measurement) === JSON.stringify(r.measurement), 'record not deterministic' + where)
			// I1–I12 and canonical bytes
			const v = E.validateState(JSON.parse(afterJson))
			check(v.ok, 'invalid' + where + ': ' + v.error + ' ' + v.message)
			check(JSON.stringify(v.state) === afterJson, 'not canonical' + where)
			check(r.state.worlds.reduce((acc, w) => acc + w[1], 0) === T, 'sum' + where)
			check(r.state.worlds.length <= 64, 'worlds' + where)
			// budget: both sides ≤ 8, and the opponent of the mover never gains
			const other = s.turn === 'w' ? 'b' : 'w'
			check(E.budget(r.state, 'w') <= 8 && E.budget(r.state, 'b') <= 8, 'budget' + where)
			check(E.budget(r.state, other) <= E.budget(s, other), 'opponent budget grew' + where)
			// measurement record
			if (m.resolution === 'rolled') {
				count.rolled++
				const rec = r.measurement
				check(rec.u === u && rec.key === E.keyForU(m.outcomes, u) && rec.fallback === m.fallback, 'record' + where)
				check(JSON.stringify(rec.outcomes) === JSON.stringify(m.outcomes), 'record outcomes' + where)
				const o = E.getOutcomes(s, m).find((x) => x.key === rec.key)
				check(JSON.stringify(o.state) === afterJson, 'getOutcomes differs from applyMove' + where)
				if (m.fallback) {
					count.fallbacks++
				}
			} else {
				check(r.measurement === null, 'record on an unrolled move' + where)
			}
			count.splits += m.type === 'split' ? 1 : 0
			count.merges += m.type === 'merge' ? 1 : 0
			count.measures += m.type === 'measure' ? 1 : 0
			// notation round trip
			const text = E.moveNotation(s, m, r.measurement, r.state)
			check(E.findMove(s, text) === m, 'notation does not parse back' + where + ': ' + text)
			check(text.endsWith(' #') === (r.state.result !== null && ['king_captured', 'king_trapped'].includes(r.state.result.reason)), 'mark' + where)
			// cross-checks against naive definitions on a sample
			if (heavyEvery > 0 && count.plies % heavyEvery === 0 && r.state.captured.indexOf(0) < 0 && r.state.captured.indexOf(16) < 0) {
				for (const c of ['w', 'b']) {
					check(E.kingDanger(r.state, c) === naiveDanger(r.state, c), 'kingDanger differs' + where)
				}
				count.dangerChecks++
				if (r.state.result === null) {
					check(E.kingTrapped(r.state) === naiveTrapped(r.state), 'kingTrapped differs' + where)
					for (const lm of E.generateMoves(r.state).slice(0, 80)) {
						check(Math.abs(E.moveRisk(r.state, lm) - naiveRisk(r.state, lm)) < 1e-12, 'moveRisk differs for ' + lm.code + where)
					}
					count.trappedChecks++
				}
			}
			s = r.state
			count.plies++
		}
		const reason = s.result ? s.result.reason : 'unfinished'
		count.results[reason] = (count.results[reason] ?? 0) + 1
	}
	return count
}

describe('random playouts', () => {
	it('uniform policy', () => {
		const c = playouts({ seed: 1, games: 300, maxPlies: 50, policy: 'uniform', heavyEvery: 97 })
		expect(c.plies).toBeGreaterThan(8000)
	})

	it('quantum-heavy policy', () => {
		const c = playouts({ seed: 2, games: 250, maxPlies: 50, policy: 'quantum', heavyEvery: 89 })
		expect(c.splits).toBeGreaterThan(1000)
		expect(c.fallbacks).toBeGreaterThan(0)
	})

	it('aggressive policy', () => {
		const c = playouts({ seed: 3, games: 400, maxPlies: 80, policy: 'aggressive', heavyEvery: 61 })
		expect(c.results.king_captured).toBeGreaterThan(50)
	})

	it('merge and measure policy', () => {
		const c = playouts({ seed: 4, games: 250, maxPlies: 50, policy: 'merge', heavyEvery: 83 })
		expect(c.merges + c.measures).toBeGreaterThan(1000)
	})

	it('long games reach the draw rules', () => {
		const c = playouts({ seed: 5, games: 30, maxPlies: 600, policy: 'uniform' })
		expect(Object.keys(c.results).length).toBeGreaterThan(1)
	})

	it('same seed, same game', () => {
		const run = () => {
			const rng = E.seededRng(99)
			let s = E.initialState()
			for (let p = 0; p < 120 && s.result === null; p++) {
				const moves = E.generateMoves(s)
				const m = choose(moves, rng, 'quantum')
				s = E.applyMove(s, m.code, { u: Math.floor(rng() * T) }).state
			}
			return JSON.stringify(s)
		}
		expect(run()).toBe(run())
	})
})
