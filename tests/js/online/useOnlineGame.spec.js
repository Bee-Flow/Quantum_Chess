// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * useOnlineGame (SPEC §14.4.5, GAME-DESIGN §7.5): optimistic certain/quantum moves, rolled moves through startRoll
 * landing on the server's roll, retries with the same clientId, the sticky failure banner, conflict adoption,
 * polled moves replayed with their recorded u (only the last one animated), the chain alarm and chat.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyMove, serializeState } from '../../../src/engine/index.js'
import { useOnlineGame } from '../../../src/online/useOnlineGame.js'
import { live, makeGame } from './fixtures.js'

vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn(), showInfo: vi.fn(), showSuccess: vi.fn() }))

const OPENING = ['g1-f3|h3', 'e7-e5']

/**
 * A move answer of the server after `list`.
 *
 * @param {Array} list all moves including the new one
 * @param {boolean} [replayed] a retry answer
 * @return {object}
 */
function moveAnswer(list, replayed = false) {
	const after = makeGame(list)
	const move = after.moves[after.moves.length - 1]
	return { game: live(after), move, measurement: move.measurement, chain: after.chain, rev: after.rev, now: after.now, replayed }
}

/**
 * A fake API around a GameFull.
 *
 * @param {object} full GameFull
 * @return {object}
 */
function fakeApi(full) {
	return {
		getGame: vi.fn(async () => structuredClone(full)),
		pollGame: vi.fn(async () => ({ changed: false, rev: full.rev, now: full.now })),
		sendMove: vi.fn(),
		sendChat: vi.fn(),
		muteChat: vi.fn(async (id, muted) => ({ muted })),
		resignGame: vi.fn(),
		abortGame: vi.fn(),
		drawAction: vi.fn(),
		requestRematch: vi.fn(),
		acceptGame: vi.fn(),
		declineGame: vi.fn(),
		cancelGame: vi.fn(),
		joinGame: vi.fn(),
	}
}

/**
 * A recording animator.
 *
 * @return {object}
 */
function fakeAnimator() {
	const a = {
		played: [],
		rolls: [],
		play: vi.fn(async (event) => {
			a.played.push(event)
		}),
		startRoll: vi.fn((input) => {
			const handle = { input, resolved: null, failed: false }
			handle.resolve = vi.fn(async (arg) => {
				handle.resolved = arg
			})
			handle.fail = vi.fn(async () => {
				handle.failed = true
			})
			a.rolls.push(handle)
			return handle
		}),
		finish: vi.fn(),
	}
	return a
}

/**
 * A controller for a game, loaded, with the animator attached.
 *
 * @param {object} full GameFull
 * @param {object} [overrides] deps
 * @return {Promise<object>} {c, api, animator, notify}
 */
async function setup(full, overrides = {}) {
	const api = fakeApi(full)
	const notify = { error: vi.fn(), info: vi.fn() }
	const c = useOnlineGame(full.id, { api, me: 'alice', notify, sleep: vi.fn(async () => {}), ...overrides })
	const animator = fakeAnimator()
	c.attachAnimator(animator)
	await c.load()
	return { c, api, animator, notify }
}

beforeEach(() => {
	localStorage.clear()
})

describe('useOnlineGame', () => {
	it('loads, verifies the chain and lets the side to move play', async () => {
		const { c } = await setup(makeGame(OPENING))
		expect(c.error.value).toBeNull()
		expect(c.moves.value.map((m) => m.code)).toEqual(OPENING)
		expect(c.altered.value).toBeNull()
		expect(c.myColor.value).toBe('w')
		expect(c.interactive.value).toBe(true)
		expect(c.fairPlayLock.value).toBe(true)
		expect(c.can.value).toMatchObject({ resign: true, abort: false, offerDraw: true, coach: false })
		expect(c.players.value.w.statusText).toContain('Your move')
		expect(c.players.value.b).toMatchObject({ name: 'Bob', rating: 1210, provisional: true })
	})

	it('shows a certain move at once and confirms it with the server', async () => {
		const { c, api, animator } = await setup(makeGame())
		let answer
		api.sendMove.mockImplementation(() => new Promise((resolve) => {
			answer = resolve
		}))
		const move = c.legalMoves.value.find((m) => m.code === 'e2-e4')
		const done = c.submitMove(move)
		await vi.waitFor(() => expect(api.sendMove).toHaveBeenCalled())
		// optimistic: the board already shows the move, input is locked
		expect(c.state.value.ply).toBe(1)
		expect(c.pending.value.phase).toBe('sending')
		expect(c.interactive.value).toBe(false)
		expect(animator.played[0]).toMatchObject({ actor: 'self', measurement: null })
		const body = api.sendMove.mock.calls[0][1]
		expect(body).toMatchObject({ code: 'e2-e4', ply: 0 })
		expect(body.clientId).toMatch(/^[0-9a-f-]{36}$/)
		answer(moveAnswer(['e2-e4']))
		await done
		expect(c.pending.value).toBeNull()
		expect(c.moves.value).toHaveLength(1)
		expect(c.game.value.turn).toBe('b')
		expect(c.altered.value).toBeNull()
		expect(animator.played).toHaveLength(1)
	})

	it('starts the roll for a rolled move and lands on the server roll', async () => {
		const { c, api, animator } = await setup(makeGame(OPENING))
		const before = c.state.value
		api.sendMove.mockResolvedValue(moveAnswer([...OPENING, { code: 'f3-e5', u: 16777215 }]))
		await c.submitMove(c.legalMoves.value.find((m) => m.code === 'f3-e5'))
		expect(animator.startRoll).toHaveBeenCalledTimes(1)
		expect(animator.play).not.toHaveBeenCalled()
		const handle = animator.rolls[0]
		expect(handle.resolved.measurement.u).toBe(16777215)
		const expected = applyMove(before, 'f3-e5', { u: 16777215 }).state
		expect(serializeState(c.state.value)).toBe(serializeState(expected))
		expect(c.moves.value[2].u).toBe(16777215)
		expect(c.altered.value).toBeNull()
	})

	it('retries with the same clientId and shows a sticky banner after the last try', async () => {
		const sleep = vi.fn(async () => {})
		const { c, api, animator } = await setup(makeGame(OPENING), { sleep })
		api.sendMove.mockRejectedValue(Object.assign(new Error('offline'), { status: 0, code: 'network' }))
		await c.submitMove(c.legalMoves.value.find((m) => m.code === 'f3-e5'))
		expect(api.sendMove).toHaveBeenCalledTimes(4)
		expect(sleep.mock.calls.map((x) => x[0])).toEqual([1000, 3000, 9000])
		const ids = new Set(api.sendMove.mock.calls.map((x) => x[1].clientId))
		expect(ids.size).toBe(1)
		expect(c.pending.value.phase).toBe('failed')
		expect(animator.rolls[0].failed).toBe(true)
		const banner = c.banners.value.find((b) => b.id === 'pending')
		expect(banner.actions.map((a) => a.label)).toEqual(['Retry', 'Undo'])
		// Retry succeeds with the same clientId (the server may have stored it already: replayed)
		api.sendMove.mockResolvedValue(moveAnswer([...OPENING, { code: 'f3-e5', u: 1 }], true))
		await banner.actions[0].handler()
		expect(new Set(api.sendMove.mock.calls.map((x) => x[1].clientId)).size).toBe(1)
		expect(c.pending.value).toBeNull()
		expect(c.moves.value).toHaveLength(3)
		expect(animator.played.at(-1).measurement.u).toBe(1)
	})

	it('Undo of a failed optimistic move restores the position', async () => {
		const { c, api } = await setup(makeGame(OPENING))
		const before = c.state.value
		api.sendMove.mockRejectedValue(Object.assign(new Error('boom'), { status: 502 }))
		await c.submitMove(c.legalMoves.value.find((m) => m.code === 'b1-c3'))
		expect(c.state.value.ply).toBe(3)
		await c.discardPending()
		expect(c.pending.value).toBeNull()
		expect(c.state.value).toBe(before)
		expect(c.interactive.value).toBe(true)
	})

	it('adopts the opponent move on a conflict', async () => {
		// another tab of ours already moved and Black replied: our ply is stale
		const { c, api, notify, animator } = await setup(makeGame(['g1-f3|h3', 'e7-e5']))
		const server = makeGame(['g1-f3|h3', 'e7-e5', 'b1-c3', 'd7-d6'])
		api.sendMove.mockRejectedValue(Object.assign(new Error('conflict'), { status: 409, code: 'conflict', data: { game: server } }))
		await c.submitMove(c.legalMoves.value.find((m) => m.code === 'b1-a3'))
		expect(notify.info).toHaveBeenCalledWith('Your opponent moved first')
		expect(c.moves.value.map((m) => m.code)).toEqual(['g1-f3|h3', 'e7-e5', 'b1-c3', 'd7-d6'])
		expect(c.pending.value).toBeNull()
		// only the last adopted move is animated
		expect(animator.played.filter((e) => e.actor === 'opponent')).toHaveLength(1)
		expect(serializeState(c.state.value)).toBe(serializeState(server.state))
	})

	it('replays polled moves with their recorded roll and animates only the last', async () => {
		const start = makeGame(['g1-f3|h3'], { myColor: 'b' })
		const { c, api, animator } = await setup(start, { me: 'bob' })
		const later = makeGame(['g1-f3|h3', 'e7-e5', { code: 'f3-e5', u: 5 }], { myColor: 'b' })
		api.pollGame.mockResolvedValue({ changed: true, rev: later.rev, now: later.now, game: live(later), moves: later.moves.slice(1), chat: [] })
		await c.start()
		c.pollNow()
		await vi.waitFor(() => expect(c.moves.value).toHaveLength(3))
		expect(animator.played).toHaveLength(1)
		expect(animator.played[0]).toMatchObject({ actor: 'opponent' })
		expect(animator.played[0].measurement.u).toBe(5)
		expect(c.altered.value).toBeNull()
		expect(serializeState(c.state.value)).toBe(serializeState(later.state))
		c.dispose()
	})

	it('raises the altered-history banner when a polled move does not match its chain', async () => {
		const { c, api } = await setup(makeGame(['g1-f3|h3']))
		const later = makeGame(['g1-f3|h3', 'e7-e5'])
		const bad = { ...later.moves[1], chain: '0'.repeat(64) }
		api.pollGame.mockResolvedValue({ changed: true, rev: later.rev, now: later.now, game: live(later), moves: [bad], chat: [] })
		await c.start()
		c.pollNow()
		await vi.waitFor(() => expect(c.altered.value).toEqual({ ply: 1 }))
		expect(c.banners.value[0]).toMatchObject({ id: 'altered', type: 'error', text: 'Game history was altered on the server' })
		c.dispose()
	})

	it('sends quick phrases as keys and text as text, and counts unread messages', async () => {
		const full = makeGame([], {
			chat: [{ id: 1, kind: 'text', userId: 'bob', displayName: 'Bob', message: 'hi', params: null, createdAt: 1 }],
		})
		const { c, api } = await setup(full)
		expect(c.unread.value).toBe(0)
		api.sendChat.mockResolvedValueOnce({ message: { id: 2, kind: 'phrase', userId: 'alice', displayName: 'Alice', message: 'good_luck', params: null, createdAt: 2 }, rev: 12 })
		await c.sendChat('good_luck')
		expect(api.sendChat).toHaveBeenLastCalledWith(42, { phrase: 'good_luck' })
		api.sendChat.mockResolvedValueOnce({ message: { id: 3, kind: 'text', userId: 'alice', displayName: 'Alice', message: '<b>x</b>', params: null, createdAt: 3 }, rev: 13 })
		await c.sendChat('<b>x</b>')
		expect(api.sendChat).toHaveBeenLastCalledWith(42, { message: '<b>x</b>' })
		expect(c.chat.value.map((m) => m.id)).toEqual([1, 2, 3])
		api.pollGame.mockResolvedValue({ changed: true, rev: 14, now: 1, game: live(full), moves: [], chat: [{ id: 4, kind: 'text', userId: 'bob', displayName: 'Bob', message: 'gl', params: null, createdAt: 4 }] })
		await c.start()
		c.pollNow()
		await vi.waitFor(() => expect(c.unread.value).toBe(1))
		c.markChatSeen()
		expect(c.unread.value).toBe(0)
		c.dispose()
	})

	it('shows the result and the rematch state of a finished game', async () => {
		const full = makeGame(OPENING, { status: 'finished', result: '0-1', resultReason: 'resignation', winner: 'b', canRematch: true, ratingChange: { w: -20, b: 20 } })
		const { c, api } = await setup(full)
		expect(c.result.value).toEqual({ result: '0-1', reason: 'resignation', winner: 'b', source: 'server' })
		expect(c.interactive.value).toBe(false)
		expect(c.fairPlayLock.value).toBe(false)
		api.requestRematch.mockResolvedValue({ ...live(makeGame([], { id: 43, status: 'pending', creator: { userId: 'alice', displayName: 'Alice' } })), moves: [], chat: [] })
		await c.rematch()
		expect(c.rematchState.value).toBe('pending')
	})
})
