/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The legal move list (§4.10, §4.11): the generated list is sorted and unique, single-move evaluation agrees with the
 * generator, and a brute force over every candidate move agrees with whyIllegal and findMove.
 *
 * Section numbers (§) refer to docs/engine-rules.md.
 */

import { describe, expect, it } from 'vitest'
import { E, T } from './helpers.js'
import { choose, START_POSITIONS } from './playout.js'

describe('generator consistency', () => {
	/**
	 * States along a quantum-heavy game.
	 *
	 * @param {number} seed seed
	 * @param {number} n plies
	 * @return {object[]}
	 */
	function statesOf(seed, n) {
		const rng = E.seededRng(seed)
		const out = []
		let s = START_POSITIONS[seed % START_POSITIONS.length]()
		for (let p = 0; p < n && s.result === null; p++) {
			out.push(s)
			s = E.applyMove(s, choose(E.generateMoves(s), rng, 'quantum'), { u: Math.floor(rng() * T) }).state
		}
		return out
	}

	it('the list is sorted by the canonical tuple, unique, and equals single-move evaluation', () => {
		const tuple = (m) => {
			const kind = ['standard', 'split', 'merge', 'measure'].indexOf(m.type)
			if (m.type === 'standard') {
				return [0, m.from[0], m.to[0], m.promo ? ' qrbn'.indexOf(m.promo) : 0]
			}
			if (m.type === 'split') {
				return [1, m.from[0], m.to[0], m.to[1]]
			}
			if (m.type === 'merge') {
				return [2, m.from[0], m.from[1], m.to[0]]
			}
			return [kind, m.from[0], 0, 0]
		}
		for (let seed = 0; seed < 12; seed++) {
			for (const s of statesOf(seed, 40)) {
				const moves = E.generateMoves(s)
				const keys = moves.map((m) => tuple(m).reduce((acc, x) => acc * 64 + x, 0))
				for (let i = 1; i < keys.length; i++) {
					expect(keys[i]).toBeGreaterThan(keys[i - 1])
				}
				// A fresh object has a fresh analysis: findMove evaluates the move on its own.
				const fresh = JSON.parse(JSON.stringify(s))
				for (const m of moves) {
					expect(E.findMove(fresh, m.code)).toEqual(m)
				}
			}
		}
	})

	it('brute force: every candidate move is legal exactly when it is generated', () => {
		let checked = 0
		for (let seed = 20; seed < 24; seed++) {
			const states = statesOf(seed, 30)
			for (let i = 0; i < states.length; i += 9) {
				const s = states[i]
				const codes = new Set(E.legalCodes(s))
				const own = E.squareView(s).map((x) => x !== null && x.color === s.turn)
				let legal = 0
				for (let f = 0; f < 64; f++) {
					const cands = [{ type: 'measure', from: [f], to: [] }]
					for (let t = 0; t < 64; t++) {
						cands.push({ type: 'standard', from: [f], to: [t] })
						if (t < 8 || t >= 56) {
							for (const promo of ['q', 'r', 'b', 'n']) {
								cands.push({ type: 'standard', from: [f], to: [t], promo })
							}
						}
					}
					if (own[f]) {
						for (let a = 0; a < 64; a++) {
							for (let b = a + 1; b < 64; b++) {
								cands.push({ type: 'split', from: [f], to: [a, b] })
							}
						}
						for (let g = f + 1; g < 64; g++) {
							for (let t = 0; t < 64; t++) {
								cands.push({ type: 'merge', from: [f, g], to: [t] })
							}
						}
					}
					for (const c of cands) {
						const why = E.whyIllegal(s, c)
						const found = E.findMove(s, c)
						expect(why === null).toBe(found !== null)
						if (found !== null) {
							expect(codes.has(found.code)).toBe(true)
							if (c.type !== 'measure') {
								legal++
							}
						}
					}
				}
				const nonMeasure = [...codes].filter((c) => !c.startsWith('?')).length
				expect(legal).toBe(nonMeasure)
				checked++
			}
		}
		expect(checked).toBeGreaterThan(10)
	}, 120000)
})
