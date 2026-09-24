// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The lobby store: seeded from initial state, a 304 summary costs nothing, a changed token reloads the lobby, actions
 * reload it too, and Home makes the polling faster.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLobby } from '../../../src/online/composables/useLobby.js'

vi.mock('@nextcloud/dialogs', () => ({ showError: vi.fn() }))

const SEED = {
	rev: 'u1.o1',
	now: 1,
	yourTurn: [{ id: 1 }],
	waiting: [],
	invitations: [{ id: 2 }],
	outgoing: [],
	open: [],
	recent: [],
	counts: { yourTurn: 1, invitations: 1 },
}

/**
 * @return {object} fake API
 */
function fakeApi() {
	return {
		getSummary: vi.fn(async () => ({ status: 304, data: null, etag: '"u1.o1"' })),
		getLobby: vi.fn(async () => ({ ...SEED, rev: 'u2.o1', yourTurn: [], counts: { yourTurn: 0, invitations: 1 } })),
		acceptGame: vi.fn(async (id) => ({ id, status: 'active' })),
		declineGame: vi.fn(async () => {
			throw Object.assign(new Error('Not found'), { status: 404 })
		}),
	}
}

beforeEach(() => {
	vi.useFakeTimers()
})
afterEach(() => {
	vi.useRealTimers()
})

describe('lobby store', () => {
	it('paints from initial state and counts what waits for the user', () => {
		const lobby = createLobby({ api: fakeApi(), initialLobby: SEED })
		expect(lobby.lobby.value.yourTurn).toHaveLength(1)
		expect(lobby.counts.value).toEqual({ yourTurn: 1, invitations: 1, total: 2 })
	})

	it('sends the ETag, ignores 304 and reloads on a new token', async () => {
		const api = fakeApi()
		const env = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }
		const lobby = createLobby({ api, initialLobby: SEED, poller: { doc: env, win: env } })
		lobby.start()
		await vi.advanceTimersByTimeAsync(30000)
		expect(api.getSummary).toHaveBeenCalledWith('"u1.o1"')
		expect(api.getLobby).not.toHaveBeenCalled()
		api.getSummary.mockResolvedValueOnce({
			status: 200,
			data: { rev: 'u2.o1', yourTurn: 0, invitations: 1 },
			etag: '"u2.o1"',
		})
		await vi.advanceTimersByTimeAsync(30000)
		expect(api.getLobby).toHaveBeenCalledTimes(1)
		expect(lobby.counts.value.total).toBe(1)
		// Home polls every 15 s
		const release = lobby.watchFast()
		await vi.advanceTimersByTimeAsync(0)
		const calls = api.getSummary.mock.calls.length
		await vi.advanceTimersByTimeAsync(15000)
		expect(api.getSummary.mock.calls.length).toBe(calls + 1)
		release()
		lobby.stop()
	})

	it('reloads after an action and reports failures', async () => {
		const api = fakeApi()
		const notify = vi.fn()
		const lobby = createLobby({ api, initialLobby: SEED, notify })
		expect(await lobby.accept(2)).toEqual({ id: 2, status: 'active' })
		expect(api.getLobby).toHaveBeenCalledTimes(1)
		expect(await lobby.decline(2)).toBeNull()
		expect(notify).toHaveBeenCalledWith('Not found')
	})
})
