// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The board of an online variant game: it replays the stored moves with the server's rolls, sends a move and plays it
 * with the roll that comes back, settles it, plays and settles the other player's moves, disputes a claim that does
 * not agree, refuses a game of other rules and notices a changed history.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref, shallowRef } from 'vue'
import { useOnlineVariantGame } from '../../../src/online/composables/useOnlineVariantGame.js'
import { vchainNext, vchainStart } from '../../../src/online/vchain.js'
import { ONLINE_RULES_VERSION } from '../../../src/variants/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = JSON.parse(readFileSync(join(HERE, '../../fixtures/online-variants.json'), 'utf8'))
const ATOMIC = FIXTURE.replays.find((r) => r.variant === 'atomic').moves

/**
 * Stored moves with their chain, as the server sends them.
 *
 * @param {object[]} moves moves of the fixture
 * @return {object[]}
 */
function stored(moves) {
	let chain = vchainStart(7, 'atomic', {}, ['alice', 'bob'], 1000)
	return moves.map((m) => {
		chain = vchainNext(chain, m.ply, m.seat, m.code, m.u)
		return { ...m, chain }
	})
}

/**
 * The online controller of an Atomic game of alice (White) against bob, with `moves` stored.
 *
 * @param {object[]} moves stored moves
 * @param {object} [fields] other fields of the game
 * @return {object}
 */
function controller(moves = [], fields = {}) {
	return {
		game: ref({
			id: 7,
			status: 'active',
			variant: 'atomic',
			variantOptions: {},
			variantRules: ONLINE_RULES_VERSION,
			myColor: 'w',
			turn: 'w',
			white: { userId: 'alice' },
			black: { userId: 'bob' },
			createdAt: 1000,
			chain: 'head',
			...fields,
		}),
		variantMoves: shallowRef(moves),
		noteActivity: vi.fn(),
		resign: vi.fn(),
	}
}

/**
 * A fake API that records its calls; a move gets the roll `u`.
 *
 * @param {number} [u] the roll of every move
 * @return {object}
 */
function fakeApi(u = 5) {
	return {
		sendVariantMove: vi.fn(async (id, body) => ({ move: { ply: body.ply, u } })),
		settleVariantMove: vi.fn(async () => ({})),
		disputeVariantGame: vi.fn(async () => ({})),
	}
}

describe('useOnlineVariantGame', () => {
	it('replays the stored moves with their rolls', async () => {
		const c = controller(stored(ATOMIC.slice(0, 4)))
		const api = fakeApi()
		const online = useOnlineVariantGame(c, { api })
		await online.start()
		const game = online.game
		expect(game.state.value.ply).toBe(4)
		expect(game.record.value.players.map((p) => p.kind)).toEqual(['human', 'remote'])
		expect(game.record.value.moves.map((m) => m.code)).toEqual(['b1-c3', 'h7-h5', 'a2-a4', 'd7-d6'])
		expect(game.isHumanTurn.value).toBe(true)
		expect(online.problem.value).toBeNull()
		expect(api.settleVariantMove).not.toHaveBeenCalled()
		expect(game.canUndo.value).toBe(false)
	})

	it('sends a move, plays it with the roll from the server and settles it', async () => {
		const c = controller()
		const api = fakeApi(4242)
		const online = useOnlineVariantGame(c, { api, uuid: () => 'client-1', now: () => 0 })
		await online.start()
		await online.game.attempt('b1-c3')
		expect(api.sendVariantMove).toHaveBeenCalledWith(7, { code: 'b1-c3', ply: 0, clientId: 'client-1', thinkMs: 0 })
		expect(online.game.state.value.ply).toBe(1)
		expect(api.settleVariantMove).toHaveBeenCalledWith(7, 0, {
			nextSeat: 1,
			result: '',
			stateHash: ATOMIC[0].stateHash,
		})
		expect(online.game.isHumanTurn.value).toBe(false)
	})

	it('keeps the position when the server refuses a move', async () => {
		const c = controller()
		const api = fakeApi()
		api.sendVariantMove.mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }))
		const online = useOnlineVariantGame(c, { api })
		await online.start()
		await online.game.attempt('b1-c3')
		expect(online.game.state.value.ply).toBe(0)
		expect(online.game.notice.value).toEqual({ kind: 'sendFailed', code: 'b1-c3' })
		expect(api.sendVariantMove).toHaveBeenCalledTimes(1)
		expect(api.settleVariantMove).not.toHaveBeenCalled()
	})

	it('sends a move again after a network error', async () => {
		const c = controller()
		const api = fakeApi()
		api.sendVariantMove.mockRejectedValueOnce(new Error('offline'))
		const online = useOnlineVariantGame(c, { api, sleep: async () => {} })
		await online.start()
		await online.game.attempt('b1-c3')
		expect(api.sendVariantMove).toHaveBeenCalledTimes(2)
		expect(api.sendVariantMove.mock.calls[0][1].clientId).toBe(api.sendVariantMove.mock.calls[1][1].clientId)
		expect(online.game.state.value.ply).toBe(1)
	})

	it('plays the other player\'s moves and settles one its mover left open', async () => {
		const moves = stored(ATOMIC.slice(0, 2))
		const c = controller(moves.slice(0, 1))
		const api = fakeApi()
		const online = useOnlineVariantGame(c, { api })
		await online.start()
		expect(online.game.state.value.ply).toBe(1)
		c.variantMoves.value = [moves[0], { ...moves[1], nextSeat: null, result: null, stateHash: null }]
		await nextTick()
		expect(online.game.state.value.ply).toBe(2)
		expect(api.settleVariantMove).toHaveBeenCalledWith(7, 1, {
			nextSeat: 0,
			result: '',
			stateHash: ATOMIC[1].stateHash,
		})
		expect(online.game.isHumanTurn.value).toBe(true)
	})

	it('disputes a move whose claim does not agree', async () => {
		const moves = stored(ATOMIC.slice(0, 2))
		const c = controller(moves.slice(0, 1))
		const api = fakeApi()
		const online = useOnlineVariantGame(c, { api })
		await online.start()
		c.variantMoves.value = [moves[0], { ...moves[1], stateHash: '0000000000000000' }]
		await nextTick()
		expect(api.disputeVariantGame).toHaveBeenCalledWith(7, 1)
		expect(online.problem.value).toBe('disputed')
		expect(online.game.state.value.ply).toBe(1)
	})

	it('disputes a settlement that arrives later and does not agree', async () => {
		const moves = stored(ATOMIC.slice(0, 1))
		const open = { ...moves[0], nextSeat: null, result: null, stateHash: null }
		const c = controller([open])
		const api = fakeApi()
		const online = useOnlineVariantGame(c, { api })
		await online.start()
		expect(api.settleVariantMove).toHaveBeenCalledWith(7, 0, expect.objectContaining({ nextSeat: 1 }))
		c.variantMoves.value = [{ ...open, nextSeat: 0, result: '', stateHash: ATOMIC[0].stateHash }]
		await nextTick()
		expect(api.disputeVariantGame).toHaveBeenCalledWith(7, 0)
	})

	it('disputes an illegal stored move while loading', async () => {
		const c = controller(stored([{ ...ATOMIC[0], code: 'a1-a8' }]))
		const api = fakeApi()
		const online = useOnlineVariantGame(c, { api })
		await online.start()
		expect(api.disputeVariantGame).toHaveBeenCalledWith(7, 0)
		expect(online.game.state.value.ply).toBe(0)
	})

	it('does not replay a game of other rules', async () => {
		const c = controller(stored(ATOMIC.slice(0, 2)), { variantRules: ONLINE_RULES_VERSION + 1 })
		const online = useOnlineVariantGame(c, { api: fakeApi() })
		await online.start()
		expect(online.problem.value).toBe('rules')
		expect(online.game.missing.value).toBe(true)
	})

	it('notices a changed history', async () => {
		const moves = stored(ATOMIC.slice(0, 2))
		moves[1] = { ...moves[1], chain: 'f'.repeat(64) }
		const online = useOnlineVariantGame(controller(moves), { api: fakeApi() })
		await online.start()
		expect(online.problem.value).toBe('altered')
	})

	it('plays a game of four from the seat of the viewer', async () => {
		const game = FIXTURE.replays.find((r) => r.variant === 'fourplayer' && r.options.mode === 'ffa')
		const uids = ['alice', 'bob', 'carol', 'dave']
		let chain = vchainStart(9, 'fourplayer', { mode: 'ffa' }, uids, 1000)
		const moves = game.moves.slice(0, 6).map((m) => {
			chain = vchainNext(chain, m.ply, m.seat, m.code, m.u)
			return { ...m, chain }
		})
		const c = controller(moves.slice(0, 5), {
			id: 9,
			variant: 'fourplayer',
			variantOptions: { mode: 'ffa' },
			myColor: '2',
			turn: '1',
			seats: uids.map((userId, seat) => ({ seat, player: { userId }, accepted: true, team: null })),
		})
		const api = fakeApi()
		const online = useOnlineVariantGame(c, { api })
		await online.start()
		expect(online.mySeat.value).toBe(2)
		expect(online.problem.value).toBeNull()
		expect(online.game.record.value.players.map((p) => p.kind)).toEqual(['remote', 'remote', 'human', 'remote'])
		expect(online.game.state.value.turn).toBe(moves[5].seat)
		c.variantMoves.value = moves
		await nextTick()
		expect(online.game.state.value.ply).toBe(6)
		expect(online.game.isHumanTurn.value).toBe(online.game.state.value.turn === 2)
	})

	it('stops the board when the game ends on the server', async () => {
		const c = controller()
		const online = useOnlineVariantGame(c, { api: fakeApi() })
		await online.start()
		expect(online.game.isHumanTurn.value).toBe(true)
		c.game.value = { ...c.game.value, status: 'finished', result: '0-1', resultReason: 'resignation' }
		await nextTick()
		expect(online.game.isHumanTurn.value).toBe(false)
		online.game.resign()
		expect(c.resign).toHaveBeenCalled()
	})
})
