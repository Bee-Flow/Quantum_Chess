/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The banners of an online game: a changed history outranks an unverifiable one, a move that could not be sent offers
 * Retry and Undo, and the connection state has one banner at a time.
 */

import { describe, expect, it, vi } from 'vitest'
import { onlineBanners } from '../../../src/online/onlineBanners.js'

const actions = { retry: vi.fn(), undo: vi.fn(), reload: vi.fn() }
const quiet = { altered: null, unverifiable: false, pendingPhase: null, connection: 'ok' }

describe('online banners', () => {
	it('shows nothing while all is well', () => {
		expect(onlineBanners(quiet, actions)).toEqual([])
	})

	it('warns about a changed history before an unverifiable one', () => {
		expect(onlineBanners({ ...quiet, altered: { ply: 3 }, unverifiable: true }, actions).map((b) => [b.id, b.type]))
			.toEqual([['altered', 'error']])
		expect(onlineBanners({ ...quiet, unverifiable: true }, actions).map((b) => [b.id, b.type]))
			.toEqual([['unverifiable', 'info']])
	})

	it('offers Retry and Undo for a move that was not sent', () => {
		const [banner] = onlineBanners({ ...quiet, pendingPhase: 'failed' }, actions)
		expect(banner.actions.map((a) => a.label)).toEqual(['Retry', 'Undo'])
		banner.actions[0].handler()
		expect(actions.retry).toHaveBeenCalled()
	})

	it('reports the connection', () => {
		const one = (state) => onlineBanners({ ...quiet, ...state }, actions).map((b) => [b.id, b.type, b.text])
		expect(one({ connection: 'expired' }))
			.toEqual([['connection', 'error', 'Your session expired. Reload the page.']])
		expect(one({ connection: 'maintenance' }))
			.toEqual([['connection', 'warning', 'Nextcloud is in maintenance mode']])
		expect(one({ connection: 'offline' })).toEqual([['connection', 'warning', 'Connection lost, retrying…']])
		expect(one({ pendingPhase: 'retrying' })).toEqual([['connection', 'warning', 'Connection lost, retrying…']])
	})
})
