/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Self-play: level n + 1 must beat level n more often than not. Slow (several minutes per
 * pair), so it runs only with `QC_SLOW=1`:
 *
 *     QC_SLOW=1 npx vitest run tests/js/ai/tournament.spec.js
 *
 * Every game is reproducible: node budgets instead of clocks, seeded level noise and seeded rolls. Colours alternate.
 * Games that reach the ply cap are adjudicated by the static evaluation (≥ 75 % a win, ≤ 25 % a loss, else a draw).
 */

import { describe, expect, it } from 'vitest'
import { bestMove } from '../../../src/ai/bestMove.js'
import { evaluate, toE } from '../../../src/ai/evaluate.js'
import { E } from './helpers.js'

const SLOW = Boolean(process.env.QC_SLOW)
const GAMES = Number(process.env.QC_GAMES || 4)
const MAX_PLY = 120
/** Node budgets per level (scaled down from `LEVELS[].nodeBudget` for levels 4 and 5 to keep the run bearable). */
const BUDGETS = [5000, 15000, 30000, 60000, 120000]

/**
 * Play one game.
 *
 * @param {number} white level of White
 * @param {number} black level of Black
 * @param {number} seed seed of the rolls and the noise
 * @return {number} White's score (1, ½ or 0)
 */
function play(white, black, seed) {
	let state = E.initialState()
	const rolls = E.seededRng(1000 + seed)
	while (state.result === null && state.ply < MAX_PLY) {
		const level = state.turn === 'w' ? white : black
		const r = bestMove(state, { level, seed: seed * 7919 + state.ply, deterministic: true, nodeBudget: BUDGETS[level - 1] })
		state = E.applyMove(state, r.code, { rng: rolls }).state
	}
	if (state.result !== null) {
		return state.result.result === '1-0' ? 1 : state.result.result === '0-1' ? 0 : 0.5
	}
	const e = toE(evaluate(state))
	return e >= 0.75 ? 1 : e <= 0.25 ? 0 : 0.5
}

describe.runIf(SLOW)('self-play: each level beats the one below', () => {
	for (let low = 1; low <= 4; low++) {
		it(`level ${low + 1} beats level ${low}`, () => {
			let score = 0
			for (let g = 0; g < GAMES; g++) {
				score += g % 2 === 0 ? play(low + 1, low, g) : 1 - play(low, low + 1, g)
			}
			expect(score).toBeGreaterThan(GAMES / 2)
		}, 3600000)
	}
})
