/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Computer-player benchmarks (`npm run bench`). Each level must keep to its think time within about 10 %.
 *
 * - "think": the search alone, on a middlegame with ghosts on both sides. Levels 4 and 5 search for their full think
 *   time (2.5 s, 5 s); levels 1–3 stop at their depth and are usually faster.
 * - "move shown after": think time plus the display delay the UI waits out — the time the player sees (50 ms shown
 *   as 0.7–1.2 s, 250 ms as 0.6–0.9 s, 1 s, 2.5 s, 5 s).
 * - "coach analysis" and "review ply": the fixed analysis budgets (600 ms, 400 ms).
 */

import { bench, describe } from 'vitest'
import { analyze } from '../../../src/ai/analyze.js'
import { benchmark } from '../../../src/ai/benchmark.js'
import { bestMove } from '../../../src/ai/bestMove.js'
import { LEVELS } from '../../../src/ai/levels.js'
import { E } from './helpers.js'

const POSITION = E.setupPosition({
	fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1',
	prelude: ['f3-g5|h4', 'c6-a5|b4'],
})
const JSON_POSITION = JSON.stringify(POSITION)
let seed = 1

describe('computer player: think time per level', () => {
	for (const level of LEVELS) {
		const iterations = level.level >= 4 ? 2 : 5
		bench(`level ${level.level} ${level.name}: think (budget ${level.timeMs} ms)`, () => {
			bestMove(JSON.parse(JSON_POSITION), { level: level.level, seed: seed++, fast: true })
		}, { iterations, time: 0, warmupIterations: 0, warmupTime: 0 })
		bench(`level ${level.level} ${level.name}: move shown after (${level.displayMs.join('–')} ms)`, async () => {
			const r = bestMove(JSON.parse(JSON_POSITION), { level: level.level, seed: seed++ })
			await new Promise((resolve) => setTimeout(resolve, r.displayMs))
		}, { iterations, time: 0, warmupIterations: 0, warmupTime: 0 })
	}
})

describe('computer player: analysis budgets', () => {
	bench('coach analysis (600 ms, multiPV 3)', () => {
		analyze(JSON.parse(JSON_POSITION), { timeMs: 600 })
	}, { iterations: 3, time: 0, warmupIterations: 0, warmupTime: 0 })
	bench('first-launch benchmark (300 ms)', () => {
		benchmark()
	}, { iterations: 3, time: 0, warmupIterations: 0, warmupTime: 0 })
})
