// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * useLocalGame: the computer reply with a mocked engine, the animation handshake, pass & play turns, undo with the roll
 * memo (assisted, same result), resignation and statistics only for unassisted games.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateMoves, setupPosition } from '../../../src/engine/index.js'
import { useLocalGame } from '../../../src/game/composables/useLocalGame.js'
import { createLocalGame, loadLocalGame } from '../../../src/game/localGames.js'

vi.mock('../../../src/services/sound.js', () => ({ playSound: vi.fn() }))
vi.mock('../../../src/services/api.js', () => ({ recordLocalResult: vi.fn(async () => ({})), requestAiMove: vi.fn(), cancelAiTask: vi.fn() }))

beforeEach(() => {
	localStorage.clear()
})

/**
 * Wait until a condition holds.
 *
 * @param {() => boolean} fn condition
 */
async function until(fn) {
	await vi.waitFor(() => expect(fn()).toBe(true), { timeout: 3000, interval: 5 })
}

describe('useLocalGame', () => {
	it('plays the computer reply after the animation of the own move', async () => {
		const rec = createLocalGame({ mode: 'computer', players: { w: { kind: 'human' }, b: { kind: 'engine', level: 2 } }, humanColor: 'w' })
		const bestMove = vi.fn(async (state) => ({ code: generateMoves(state)[0].code, displayMs: 0, depth: 2 }))
		const g = useLocalGame(rec.id, { bestMove })
		const events = []
		g.attachAnimator({
			play: async (e) => {
				events.push(e.actor)
			},
		})
		expect(g.interactive.value).toBe(true)
		expect(g.myColor.value).toBe('w')
		await g.submitMove(g.legalMoves.value.find((m) => m.code === 'e2-e4'))
		await until(() => g.moves.value.length === 2)
		expect(bestMove).toHaveBeenCalledWith(expect.objectContaining({ turn: 'b' }), expect.objectContaining({ level: 2 }))
		expect(events).toEqual(['self', 'opponent'])
		expect(g.moves.value.map((m) => m.by)).toEqual(['human', 'engine'])
		expect(g.state.value.turn).toBe('w')
		expect(loadLocalGame(rec.id).moves).toHaveLength(2)
		g.dispose()
	})

	it('starts with the engine when the human plays Black', async () => {
		const rec = createLocalGame({ mode: 'computer', players: { w: { kind: 'engine', level: 1 }, b: { kind: 'human' } }, humanColor: 'b' })
		const bestMove = vi.fn(async (state) => ({ code: generateMoves(state)[0].code, displayMs: 0 }))
		const g = useLocalGame(rec.id, { bestMove })
		expect(g.interactive.value).toBe(false)
		g.start()
		await until(() => g.moves.value.length === 1)
		expect(g.interactive.value).toBe(true)
		expect(g.orientation.value).toBe('b')
		g.dispose()
	})

	it('lets both sides move in pass & play and flips only with auto-flip', async () => {
		const rec = createLocalGame({ mode: 'local', players: { w: { kind: 'local', name: 'Ann' }, b: { kind: 'local', name: 'Ben' } }, options: { autoFlip: true } })
		const g = useLocalGame(rec.id)
		expect(g.myColor.value).toBeNull()
		expect(g.names.value).toEqual({ w: 'Ann', b: 'Ben' })
		await g.submitMove(g.legalMoves.value.find((m) => m.code === 'e2-e4'))
		expect(g.movableColor.value).toBe('b')
		expect(g.orientation.value).toBe('b')
		await g.submitMove(g.legalMoves.value.find((m) => m.code === 'e7-e5'))
		expect(g.orientation.value).toBe('w')
		expect(g.can.value.undo).toBe(true)
	})

	it('undo keeps the roll memo: the same move gives the same result and marks the game assisted', async () => {
		const start = setupPosition({ fen: '4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', prelude: ['e1-d1', 'g8-f6|h6'] })
		const rec = createLocalGame({ mode: 'local', players: {}, startState: start })
		let draws = 0
		const g = useLocalGame(rec.id, { draw: () => (draws++ % 2 === 0 ? 1 : 16000000) })
		const roll = () => g.legalMoves.value.find((m) => m.code === 'c1-h6')
		await g.submitMove(roll())
		const first = g.moves.value[0].measurement.key
		await g.undo()
		expect(g.moves.value).toHaveLength(0)
		expect(g.record.value.assisted).toBe(true)
		await g.submitMove(roll())
		expect(g.moves.value[0].measurement.key).toBe(first)
		expect(draws).toBe(1)
	})

	it('reports unassisted results once and never assisted ones', async () => {
		const { recordLocalResult } = await import('../../../src/services/api.js')
		recordLocalResult.mockClear()
		const kingShot = setupPosition({ fen: '4k3/8/8/8/8/8/8/3QK3 w - - 0 1' })
		const rec = createLocalGame({ mode: 'computer', players: { w: { kind: 'human' }, b: { kind: 'engine', level: 3 } }, humanColor: 'w', startState: kingShot })
		const g = useLocalGame(rec.id, { bestMove: vi.fn() })
		await g.submitMove(g.legalMoves.value.find((m) => m.code === 'd1-d8'))
		expect(g.result.value).toBeNull()
		await g.resign()
		expect(g.result.value).toMatchObject({ result: '0-1', reason: 'resignation', winner: 'b' })
		expect(recordLocalResult).toHaveBeenCalledTimes(1)
		expect(recordLocalResult).toHaveBeenCalledWith({ opponent: 'engine', level: 3, result: 'loss', color: 'w' })

		const rec2 = createLocalGame({ mode: 'local', players: {}, startState: kingShot })
		const g2 = useLocalGame(rec2.id)
		await g2.submitMove(g2.legalMoves.value.find((m) => m.code === 'd1-d8'))
		await g2.undo()
		await g2.resign()
		expect(recordLocalResult).toHaveBeenCalledTimes(1)
	})

	it('ends the game with the engine result and counts pass & play games', async () => {
		const { recordLocalResult } = await import('../../../src/services/api.js')
		recordLocalResult.mockClear()
		const start = setupPosition({ fen: '4k3/8/8/8/8/8/4Q3/4K3 w - - 0 1' })
		const rec = createLocalGame({ mode: 'local', players: {}, startState: start })
		const g = useLocalGame(rec.id)
		await g.submitMove(g.legalMoves.value.find((m) => m.code === 'e2-e8'))
		expect(g.result.value).toMatchObject({ result: '1-0', reason: 'king_captured', winner: 'w', source: 'engine' })
		expect(g.can.value).toMatchObject({ rematch: true, resign: false, undo: true })
		expect(loadLocalGame(rec.id).result).toEqual({ result: '1-0', reason: 'king_captured' })
		expect(recordLocalResult).toHaveBeenCalledWith({ opponent: 'hotseat', result: 'win', color: 'w' })
		expect(g.interactive.value).toBe(false)
	})

	it('shows an error for an unknown id', () => {
		const g = useLocalGame('lg_missing')
		expect(g.error.value).toBeInstanceOf(Error)
		expect(g.interactive.value).toBe(false)
	})
})
