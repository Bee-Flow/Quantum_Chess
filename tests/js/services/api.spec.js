/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * api.js: URLs, verbs and bodies, unwrapping, and the ApiError mapping including Retry-After.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = []
let next = null

vi.mock('@nextcloud/axios', () => {
	const request = vi.fn(async (config) => {
		calls.push(config)
		if (next instanceof Error) {
			throw next
		}
		return { data: next, status: 200, headers: {} }
	})
	const get = vi.fn(async (url, config = {}) => {
		calls.push({ method: 'get', url, ...config })
		if (next instanceof Error) {
			throw next
		}
		return next?.status ? next : { data: next, status: 200, headers: {} }
	})
	return { default: { request, get } }
})
vi.mock('@nextcloud/router', () => ({
	generateUrl: (p) => '/index.php' + p,
	generateOcsUrl: (p) => '/ocs/v2.php/' + p,
}))
vi.mock('@nextcloud/password-confirmation', () => ({ confirmPassword: vi.fn(async () => {}) }))

const api = await import('../../../src/services/api.js')

beforeEach(() => {
	calls.length = 0
	next = null
})

describe('api.js', () => {
	it('builds URLs, verbs and bodies', async () => {
		next = { game: { id: 7 } }
		expect(await api.createGame({ opponent: 'bob', color: 'r' })).toEqual({ id: 7 })
		expect(calls[0]).toMatchObject({
			method: 'post',
			url: '/index.php/apps/quantumchess/api/games',
			data: { opponent: 'bob', color: 'r' },
		})

		next = { game: { id: 7, moves: [] } }
		await api.getGame(7)
		expect(calls[1]).toMatchObject({ method: 'get', url: '/index.php/apps/quantumchess/api/games/7' })

		next = { changed: false, rev: 3 }
		expect(await api.pollGame(7, { rev: 3, ply: 2 })).toEqual({ changed: false, rev: 3 })
		expect(calls[2].params).toEqual({ rev: 3, ply: 2, chat: 0, watching: 0 })

		next = { game: {} }
		await api.sendMove(7, { code: 'e2-e4', ply: 0, clientId: 'abcdefgh', thinkMs: 10 })
		expect(calls[3]).toMatchObject({
			method: 'post',
			url: '/index.php/apps/quantumchess/api/games/7/moves',
			data: { code: 'e2-e4', ply: 0, clientId: 'abcdefgh', thinkMs: 10 },
		})

		next = { game: {} }
		await api.drawAction(7, 'offer')
		expect(calls[4]).toMatchObject({
			url: '/index.php/apps/quantumchess/api/games/7/draw',
			data: { action: 'offer' },
		})

		next = { preferences: { v: 1, sound: false } }
		expect(await api.savePreferences({ v: 1, sound: false })).toEqual({ v: 1, sound: false })
		expect(calls[5]).toMatchObject({
			method: 'put',
			url: '/index.php/apps/quantumchess/api/settings/preferences',
			data: { preferences: { v: 1, sound: false } },
		})

		next = { local: {} }
		await api.recordLocalResult({ opponent: 'engine', level: 2, result: 'win', color: 'w' })
		expect(calls[6]).toMatchObject({ method: 'post', url: '/index.php/apps/quantumchess/api/stats/local' })

		next = { status: 'pending', taskId: 12 }
		await api.requestAiMove({ persona: 'q7' })
		expect(calls[7]).toMatchObject({
			method: 'post',
			url: '/index.php/apps/quantumchess/api/ai/move',
			data: { persona: 'q7' },
		})

		next = { status: 'cancelled' }
		await api.cancelAiTask(12)
		expect(calls[8]).toMatchObject({ method: 'delete', url: '/index.php/apps/quantumchess/api/ai/task/12' })
	})

	it('unwraps list bodies', async () => {
		next = { games: [{ id: 1 }] }
		expect(await api.getOpenChallenges()).toEqual([{ id: 1 }])
		next = { users: [{ userId: 'bob' }] }
		expect(await api.getRecentOpponents()).toEqual([{ userId: 'bob' }])
		next = { progress: { lessons: {} } }
		expect(await api.getTrainerProgress()).toEqual({ lessons: {} })
	})

	it('maps errors to ApiError with Retry-After', async () => {
		const err = new Error('Request failed')
		err.response = {
			status: 429,
			data: { error: 'ai_rate_limited', message: 'Slow down' },
			headers: { 'retry-after': '30' },
		}
		next = err
		const e = await api.requestAiMove({}).catch((x) => x)
		expect(e).toBeInstanceOf(api.ApiError)
		expect(e).toMatchObject({
			name: 'ApiError',
			status: 429,
			code: 'ai_rate_limited',
			retryAfter: 30,
			message: 'Slow down',
		})
		expect(e.data).toEqual({ error: 'ai_rate_limited', message: 'Slow down' })

		const plain = new Error('boom')
		plain.response = { status: 502, data: '<html>', headers: {} }
		next = plain
		expect(await api.getLobby().catch((x) => x)).toMatchObject({
			status: 502,
			code: 'http_502',
			data: null,
			retryAfter: null,
		})

		const net = new Error('Network Error')
		net.code = 'ERR_NETWORK'
		next = net
		expect(await api.getLobby().catch((x) => x)).toMatchObject({ status: 0, code: 'network' })

		const timeout = new Error('timeout')
		timeout.code = 'ECONNABORTED'
		next = timeout
		expect(await api.getLobby().catch((x) => x)).toMatchObject({ status: 0, code: 'timeout' })

		const cancel = new Error('canceled')
		cancel.name = 'CanceledError'
		next = cancel
		expect((await api.getLobby().catch((x) => x)).name).toBe('AbortError')
	})

	it('does not throw on a 304 summary', async () => {
		next = { status: 304, data: '', headers: {} }
		expect(await api.getSummary('u1')).toEqual({ status: 304, data: null, etag: 'u1' })
		expect(calls[0].headers).toEqual({ 'If-None-Match': 'u1' })
	})

	it('removes the current user from user searches', async () => {
		globalThis.OC = { getCurrentUser: () => ({ uid: 'admin' }) }
		next = {
			status: 200,
			headers: {},
			data: { ocs: { data: [{ id: 'admin', label: 'Alice' }, { id: 'bob', label: 'Bob', subline: 'x' }] } },
		}
		expect(await api.searchUsers('b')).toEqual([{ userId: 'bob', displayName: 'Bob', subline: 'x', status: null }])
		expect(calls[0].url).toBe('/ocs/v2.php/core/autocomplete/get')
		delete globalThis.OC
	})
})
