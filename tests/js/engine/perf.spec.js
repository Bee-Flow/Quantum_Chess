/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Performance smoke tests. Budgets are for Chrome on a mid-range laptop; the assertions here are loose (×10) so CI
 * noise never fails them. Set `QC_PERF_REPORT=1` to print the measured timings.
 */

import { afterAll, describe, expect, it } from 'vitest'
import { E, S } from './helpers.js'

const rows = []

/**
 * Average milliseconds per call.
 *
 * @param {string} name label
 * @param {(i: number) => void} fn body (receives the iteration index)
 * @param {number} n iterations
 * @param {number} budget budget in ms (reported)
 * @return {number}
 */
function time(name, fn, n, budget) {
	for (let i = 0; i < Math.min(20, n); i++) {
		fn(i)
	}
	const t0 = performance.now()
	for (let i = 0; i < n; i++) {
		fn(i)
	}
	const ms = (performance.now() - t0) / n
	rows.push({ name, ms: Number(ms.toFixed(3)), budget })
	return ms
}

afterAll(() => {
	if (process.env.QC_PERF_REPORT !== '1') {
		return
	}
	const lines = rows.map((r) => r.name.padEnd(44) + String(r.ms).padStart(9) + ' ms'
		+ (r.budget === null ? '' : '   (budget ' + r.budget + ' ms)'))
	console.log('Engine timings (Node ' + process.version + '):\n' + lines.join('\n'))
})

// 64 worlds: three independent ghosts per side (B = 8 / 8).
const MIDGAME = S('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 0 1', [
	'f3-g5|h4',
	'c4-b5|d5',
	'd1-d2|e2',
	'f6-g4|h5',
	'c6-a5|b4',
	'd8-e7|f6',
])
// 16 worlds, queens and rooks on an open board: hundreds of splits.
const OPEN = S('3qk2r/pp3ppp/8/8/8/8/PP3PPP/R2QK2R w - - 0 1', ['d1-d4|g4', 'a1-b1|c1', 'd8-d5|a5', 'h8-g8|f8'])

describe('performance', () => {
	it('fixture positions are what they claim', () => {
		expect(MIDGAME.worlds.length).toBe(64)
		expect(E.budget(OPEN, 'w')).toBe(4)
		expect(E.generateMoves(OPEN).filter((m) => m.type === 'split').length).toBeGreaterThan(300)
	})

	it('generateMoves (cold cache)', () => {
		for (const [name, s] of [['64 worlds', MIDGAME], ['open board, splits', OPEN], ['start', E.initialState()]]) {
			const json = JSON.stringify(s)
			const ms = time('generateMoves ' + name, () => E.generateMoves(JSON.parse(json)), 200, 5)
			expect(ms).toBeLessThan(50)
		}
	})

	it('applyMove and getOutcomes', () => {
		const moves = E.generateMoves(MIDGAME)
		const json = JSON.stringify(MIDGAME)
		expect(time('applyMove 64 worlds (cold state)', (i) => {
			const s = JSON.parse(json)
			E.applyMove(s, moves[(i * 7) % moves.length].code, { u: 12345 })
		}, 300, 2)).toBeLessThan(20)
		expect(time(
			'applyMove 64 worlds (warm)',
			(i) => E.applyMove(MIDGAME, moves[(i * 7) % moves.length], { u: 12345 }),
			500,
			2,
		)).toBeLessThan(20)
		expect(time('getOutcomes 64 worlds', (i) => E.getOutcomes(MIDGAME, moves[(i * 11) % moves.length]), 300, 2))
			.toBeLessThan(20)
		const open = E.generateMoves(OPEN)
		expect(time('applyForSearch open board', (i) => {
			const m = open[(i * 13) % open.length]
			E.applyForSearch(OPEN, m, m.resolution === 'rolled' ? m.outcomes[0].key : null)
		}, 500, 1)).toBeLessThan(20)
	})

	it('king safety for the whole legal list', () => {
		const json = JSON.stringify(OPEN)
		expect(time('kingDanger ×2 + moveRisk for every move', () => {
			const s = JSON.parse(json)
			E.kingDanger(s, 'w')
			E.kingDanger(s, 'b')
			for (const m of E.generateMoves(s)) {
				E.moveRisk(s, m)
			}
		}, 10, 8)).toBeLessThan(150)
	})

	it('validation, hashing, views', () => {
		const json = JSON.stringify(MIDGAME)
		expect(time('validateState 64 worlds', () => E.validateState(JSON.parse(json)), 300, 1)).toBeLessThan(10)
		expect(time('positionHash 64 worlds', () => E.positionHash(MIDGAME), 1000, 0.1)).toBeLessThan(2)
		expect(time('squareView + links 64 worlds', () => {
			const s = JSON.parse(json)
			E.squareView(s)
			E.links(s)
		}, 300, 1)).toBeLessThan(10)
	})

	it('random playout throughput', () => {
		const rng = E.seededRng(5)
		let plies = 0
		const t0 = performance.now()
		for (let g = 0; g < 40; g++) {
			let s = E.initialState()
			for (let p = 0; p < 80 && s.result === null; p++) {
				const moves = E.generateMoves(s)
				const m = moves[Math.floor(rng() * moves.length)]
				s = E.applyMove(s, m, { u: Math.floor(rng() * E.T) }).state
				plies++
			}
		}
		const ms = (performance.now() - t0) / plies
		rows.push({ name: 'playout ply (generate + apply)', ms: Number(ms.toFixed(3)), budget: null })
		expect(ms).toBeLessThan(10)
	})
})
