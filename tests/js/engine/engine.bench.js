/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Rules-engine benchmarks (`npm run bench`). The budgets: generateMoves on a 64-world midgame < 5 ms, applyMove and
 * getOutcomes < 2 ms, kingDanger + moveRisk for the whole legal list < 8 ms.
 */

import { bench, describe } from 'vitest'
import * as E from '../../../src/engine/index.js'

const MIDGAME = E.setupPosition({
	fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1',
	prelude: ['f3-g5|h4', 'c4-b5|d5', 'd1-d2|e2', 'f6-g4|h5', 'c6-a5|b4', 'd8-e7|f6'],
})
const OPEN = E.setupPosition({
	fen: '3qk2r/pp3ppp/8/8/8/8/PP3PPP/R2QK2R w - - 0 1',
	prelude: ['d1-d4|g4', 'a1-b1|c1', 'd8-d5|a5', 'h8-g8|f8'],
})
const MID_JSON = JSON.stringify(MIDGAME)
const OPEN_JSON = JSON.stringify(OPEN)
const MID_MOVES = E.generateMoves(MIDGAME).map((m) => m.code)
let i = 0

describe('engine (64 worlds, cold cache per call)', () => {
	bench('generateMoves 64 worlds (< 5 ms)', () => {
		E.generateMoves(JSON.parse(MID_JSON))
	})

	bench('generateMoves open board with ~350 splits (< 5 ms)', () => {
		E.generateMoves(JSON.parse(OPEN_JSON))
	})

	bench('applyMove 64 worlds (< 2 ms)', () => {
		E.applyMove(JSON.parse(MID_JSON), MID_MOVES[i++ % MID_MOVES.length], { u: 4242 })
	})

	bench('getOutcomes 64 worlds (< 2 ms)', () => {
		E.getOutcomes(JSON.parse(MID_JSON), MID_MOVES[i++ % MID_MOVES.length])
	})

	bench('kingDanger ×2 + moveRisk for the whole list (< 8 ms)', () => {
		const s = JSON.parse(OPEN_JSON)
		E.kingDanger(s, 'w')
		E.kingDanger(s, 'b')
		for (const m of E.generateMoves(s)) {
			E.moveRisk(s, m)
		}
	})

	bench('validateState 64 worlds', () => {
		E.validateState(MID_JSON)
	})
})
