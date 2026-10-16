// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The variant game view and its composable in online games and on this device (issue #23 and the multiplayer audit):
 * the online opponent named in the player rows (not "You" for every seat), Resign confirmed and not offered to a side
 * that is out, the notices of a move the server did not take (with a reload of the game), no danger line for a
 * spectator, and the sounds of moves and of the end.
 */

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import VariantGameView from '../../../src/views/VariantGameView.vue'
import { overrideBoardPreferences } from '../../../src/board/boardPreferences.js'
import { ApiError } from '../../../src/services/api.js'
import { sendNotice, useVariantGame } from '../../../src/variantplay/composables/useVariantGame.js'
import { endSound, moveSound } from '../../../src/variantplay/sounds.js'
import { createVariantGame } from '../../../src/variantplay/variantGames.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { stateOf } from './helpers.js'

const registry = vi.hoisted(() => ({ variants: {}, sounds: [] }))

vi.mock('../../../src/variants/index.js', async (importOriginal) => {
	const mod = await importOriginal()
	return { ...mod, loadVariant: async (id) => registry.variants[id] ?? mod.loadVariant(id) }
})

vi.mock('../../../src/services/sound.js', async (importOriginal) => {
	const mod = await importOriginal()
	return {
		...mod,
		playSound: (name) => {
			registry.sounds.push(name)
			return true
		},
	}
})

/**
 * An orthodox test variant with extra fields, registered for `loadVariant`.
 *
 * @param {string} id variant id
 * @param {object} [extra] fields and hooks to add
 * @return {object}
 */
function orthodox(id, extra = {}) {
	const V = defineVariant(Object.assign(orthodoxSpec(), { id, category: 'rules', rules: () => [] }, extra))
	registry.variants[id] = V
	return V
}

const V = orthodox('test-online-ui')
/** A variant in which Black is out of the game. */
const OUT = orthodox('test-online-out', { isOut: (b, side) => side === 1 })

/** White to move: the rook on e2 can take the knight on e7 or move quietly; Black's king on e8. */
const START = stateOf(V, [[{ a1: '0:k', e2: '0:r', e7: '1:n', h8: '1:k' }, 1]], 0)
/** Black to move, its king in check from the rook on e2. */
const CHECK = stateOf(V, [[{ a1: '0:k', e2: '0:r', e8: '1:k' }, 1]], 1)

/** A dialog that shows its content and actions at once. */
const DialogStub = defineComponent({
	name: 'NcDialog',
	props: { name: { type: String, default: '' } },
	setup: (props, { slots }) => () => h('div', { 'data-test': 'dialog' }, [
		props.name,
		slots.default?.(),
		slots.actions?.(),
	]),
})

/**
 * A fake online host.
 *
 * @param {object[]} players the players by seat
 * @param {object} [initial] the start state
 * @param {object} [extra] fields of the host to replace
 * @param {object} [variant] the variant
 * @return {object}
 */
function host(players, initial = START, extra = {}, variant = V) {
	return {
		load: async () => ({
			id: 'online',
			variant: variant.id,
			options: {},
			players,
			initial,
			current: initial,
			moves: [],
		}),
		send: vi.fn(async () => 0),
		played: vi.fn(),
		resign: vi.fn(),
		recover: vi.fn(async () => {}),
		...extra,
	}
}

/**
 * A loaded online game.
 *
 * @param {object} h the host
 * @return {Promise<object>}
 */
async function online(h) {
	const game = useVariantGame('online', h)
	await game.load()
	return game
}

/**
 * A router at a local game's page.
 *
 * @param {string} [id] game id
 * @return {Promise<object>}
 */
async function routerAt(id = 'x') {
	const stub = { render: () => null }
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/', name: 'home', component: stub },
			{ path: '/variants', name: 'variants', component: stub },
			{ path: '/variants/:variant/:id', name: 'variant-game', component: stub },
		],
	})
	router.push('/variants/' + V.id + '/' + id)
	await router.isReady()
	return router
}

/**
 * Mount the view of an online game.
 *
 * @param {object} game the game (useVariantGame with a host)
 * @return {Promise<object>}
 */
async function mountOnline(game) {
	const w = mount(VariantGameView, {
		props: { controller: game },
		global: { plugins: [await routerAt()], stubs: { NcDialog: DialogStub } },
		attachTo: document.body,
	})
	await flushPromises()
	return w
}

beforeEach(() => {
	registry.sounds.length = 0
	overrideBoardPreferences({ sound: true })
})

afterEach(() => {
	overrideBoardPreferences({ sound: true })
	document.body.innerHTML = ''
})

describe('the players of an online game', () => {
	it('names the opponent and says "You" only for the viewer\'s seat', async () => {
		const game = await online(host([{ kind: 'human' }, { kind: 'remote', name: 'Bob' }]))
		const w = await mountOnline(game)
		const rows = w.findAll('.qc-vgame__player-name small').map((s) => s.text())
		expect(rows).toEqual(['You', 'Bob'])
		w.unmount()
	})

	it('falls back to "Player" for a remote seat without a name', async () => {
		const game = await online(host([{ kind: 'remote' }, { kind: 'human' }]))
		const w = await mountOnline(game)
		expect(w.findAll('.qc-vgame__player-name small').map((s) => s.text())).toEqual(['Player', 'You'])
		w.unmount()
	})
})

describe('Resign', () => {
	it('asks first online, then resigns on the server', async () => {
		const h = host([{ kind: 'human' }, { kind: 'remote', name: 'Bob' }])
		const w = await mountOnline(await online(h))
		await w.find('[data-test=variant-resign]').trigger('click')
		expect(h.resign).not.toHaveBeenCalled()
		expect(w.text()).toContain('Resign this game?')
		await w.find('[data-test=confirm-resign]').trigger('click')
		expect(h.resign).toHaveBeenCalledTimes(1)
		expect(w.find('[data-test=dialog]').exists()).toBe(false)
		w.unmount()
	})

	it('asks first on this device too', async () => {
		const players = [{ kind: 'human' }, { kind: 'human' }]
		const rec = createVariantGame({ variant: V.id, options: {}, players, initial: START })
		const w = mount(VariantGameView, {
			global: { plugins: [await routerAt(rec.id)], stubs: { NcDialog: DialogStub } },
			attachTo: document.body,
		})
		await flushPromises()
		await w.find('[data-test=variant-resign]').trigger('click')
		expect(w.text()).not.toContain('wins')
		await w.find('[data-test=confirm-resign]').trigger('click')
		await flushPromises()
		expect(w.text()).toContain('Black wins')
		w.unmount()
	})

	it('is not offered to a side that is out, nor to a spectator', async () => {
		const out = await online(host([{ kind: 'remote', name: 'Ann' }, { kind: 'human' }], START, {}, OUT))
		expect(out.canResign.value).toBe(false)
		out.resign()
		const w = await mountOnline(out)
		expect(w.find('[data-test=variant-resign]').exists()).toBe(false)
		w.unmount()
		const playing = await online(host([{ kind: 'human' }, { kind: 'remote', name: 'Bob' }], START, {}, OUT))
		expect(playing.canResign.value).toBe(true)
		const spectator = await online(host([{ kind: 'remote' }, { kind: 'remote' }]))
		expect(spectator.canResign.value).toBe(false)
	})
})

describe('a move the server did not take', () => {
	it('maps the error to a notice', () => {
		expect(sendNotice(new ApiError({ status: 409, code: 'conflict' }))).toBe('conflict')
		expect(sendNotice(new ApiError({ status: 409, code: 'http_409' }))).toBe('conflict')
		expect(sendNotice(new ApiError({ status: 409, code: 'game_over' }))).toBe('gameOver')
		expect(sendNotice(new ApiError({ status: 409, code: 'not_your_turn' }))).toBe('notYourTurn')
		expect(sendNotice(new ApiError({ status: 403, code: 'not_your_turn' }))).toBe('notYourTurn')
		expect(sendNotice(new ApiError({ status: 0, code: 'network' }))).toBe('sendFailed')
		expect(sendNotice(new Error('boom'))).toBe('sendFailed')
	})

	it('says why, and reloads the game when the board is behind the server', async () => {
		const conflict = new ApiError({ status: 409, code: 'conflict', message: 'x' })
		const h = host([{ kind: 'human' }, { kind: 'remote', name: 'Bob' }], START, {
			send: vi.fn(async () => {
				throw conflict
			}),
		})
		const game = await online(h)
		const w = await mountOnline(game)
		await game.attempt('e2-e3')
		await flushPromises()
		expect(game.notice.value.kind).toBe('conflict')
		expect(h.recover).toHaveBeenCalledWith(conflict)
		expect(w.text()).toContain('Another move was played first; the board was updated.')
		w.unmount()
	})

	it('keeps the old notice for a network failure, without a reload', async () => {
		const h = host([{ kind: 'human' }, { kind: 'remote' }], START, {
			send: vi.fn(async () => {
				throw new ApiError({ status: 0, code: 'network' })
			}),
		})
		const game = await online(h)
		await game.attempt('e2-e3')
		expect(game.notice.value.kind).toBe('sendFailed')
		expect(h.recover).not.toHaveBeenCalled()
	})

	it('names the game over and the turn of another seat', async () => {
		for (const [code, kind, text] of [
			['game_over', 'gameOver', 'This game has already ended'],
			['not_your_turn', 'notYourTurn', 'It is not your turn'],
		]) {
			const h = host([{ kind: 'human' }, { kind: 'remote' }], START, {
				send: vi.fn(async () => {
					throw new ApiError({ status: 400, code })
				}),
			})
			const game = await online(h)
			const w = await mountOnline(game)
			await game.attempt('e2-e3')
			await flushPromises()
			expect(game.notice.value.kind).toBe(kind)
			expect(h.recover).toHaveBeenCalled()
			expect(w.text()).toContain(text)
			w.unmount()
		}
	})
})

describe('the danger line of a spectator', () => {
	it('is not shown to a spectator, but to the player of the side in danger', async () => {
		const spectator = await online(host([{ kind: 'remote' }, { kind: 'remote' }], CHECK))
		expect(spectator.danger.value).toBe(0)
		const player = await online(host([{ kind: 'remote' }, { kind: 'human' }], CHECK))
		expect(player.danger.value).toBe(1)
	})
})

describe('sounds', () => {
	it('chooses the move, capture and end sounds', () => {
		expect(moveSound(null, START)).toBe(null)
		expect(moveSound({ history: [] }, { history: [{ captures: [] }] })).toBe('move')
		expect(moveSound({ history: [] }, { history: [{ captures: [12] }] })).toBe('capture')
		expect(moveSound({ history: [{}, {}] }, { history: [{}] })).toBe(null)
		expect(endSound({ winner: 0 }, [0])).toBe('win')
		expect(endSound({ winner: 1 }, [0])).toBe('loss')
		expect(endSound({ winners: [1, 3] }, [1])).toBe('win')
		expect(endSound({ winner: null }, [0])).toBe('win')
		expect(endSound({ winner: 1 }, [0, 1])).toBe('win')
	})

	it('plays the own move, the opponent\'s move arriving and the end, with the sound preference', async () => {
		const game = await online(host([{ kind: 'human' }, { kind: 'remote', name: 'Bob' }]))
		const w = await mountOnline(game)
		await game.attempt('e2-e7')
		await flushPromises()
		expect(registry.sounds).toEqual(['capture'])
		game.playRemote('h8-h7', 0)
		await flushPromises()
		expect(registry.sounds).toEqual(['capture', 'move'])
		overrideBoardPreferences({ sound: false })
		await game.attempt('e7-e6')
		await flushPromises()
		expect(registry.sounds).toEqual(['capture', 'move'])
		overrideBoardPreferences({ sound: true })
		game.state.value = { ...game.state.value, result: { winner: 1, reason: 'resign' } }
		await flushPromises()
		expect(registry.sounds).toEqual(['capture', 'move', 'loss'])
		w.unmount()
	})
})
