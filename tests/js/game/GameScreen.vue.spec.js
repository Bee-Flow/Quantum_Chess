// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * GameScreen with a fake GameController: cards, panel tabs (chat only with a slot), the history view and the animator
 * handshake.
 */

import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, h, ref, shallowRef } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import GameScreen from '../../../src/game/components/GameScreen.vue'
import { applyMove, generateMoves, initialState, moveNotation } from '../../../src/engine/index.js'
import { NO_CAPABILITIES } from '../../../src/game/gameController.js'

vi.mock('../../../src/services/sound.js', () => ({ playSound: vi.fn(), configureSound: vi.fn(), startSuspense: () => () => {}, unlockAudio: vi.fn() }))

/**
 * A fake controller after e2-e4 e7-e5.
 *
 * @return {object}
 */
function fakeController() {
	const s0 = initialState()
	const r1 = applyMove(s0, 'e2-e4')
	const r2 = applyMove(r1.state, 'e7-e5')
	const states = [s0, r1.state, r2.state]
	const entry = (before, r, color) => ({ ply: before.ply, color, code: r.move.code, notation: moveNotation(before, r.move, null), measurement: null, u: null, by: 'human' })
	const state = shallowRef(r2.state)
	const attach = vi.fn(() => () => {})
	return {
		kind: 'local',
		id: ref('lg_test'),
		loading: ref(false),
		error: ref(null),
		state,
		startState: ref(null),
		legalMoves: computed(() => generateMoves(state.value)),
		moves: ref([entry(s0, r1, 'w'), entry(r1.state, r2, 'b')]),
		players: computed(() => ({ w: { color: 'w', kind: 'local', name: 'Ann' }, b: { color: 'b', kind: 'local', name: 'Ben' } })),
		myColor: computed(() => null),
		movableColor: computed(() => 'w'),
		orientation: ref('w'),
		interactive: computed(() => true),
		result: computed(() => null),
		pending: ref(null),
		can: computed(() => ({ ...NO_CAPABILITIES, undo: true, resign: true })),
		fairPlayLock: computed(() => false),
		banners: ref([]),
		lastMove: shallowRef(null),
		submitMove: vi.fn(),
		stateAt: (n) => states[n],
		attachAnimator: attach,
		flip: vi.fn(),
		undo: vi.fn(),
		resign: vi.fn(),
	}
}

/**
 * Mount the screen.
 *
 * @param {object} controller controller
 * @param {object} [slots] slots
 * @return {Promise<import('@vue/test-utils').VueWrapper>}
 */
async function mountScreen(controller, slots = {}) {
	const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] })
	router.push('/')
	await router.isReady()
	const w = mount(GameScreen, { props: { controller }, slots, global: { plugins: [router] }, attachTo: document.body })
	await flushPromises()
	return w
}

describe('GameScreen', () => {
	it('renders both players, attaches the animator and lists the moves', async () => {
		const c = fakeController()
		const w = await mountScreen(c)
		expect(w.find('[data-test=player-w]').text()).toContain('Ann')
		expect(w.find('[data-test=player-b]').text()).toContain('Ben')
		expect(c.attachAnimator).toHaveBeenCalledTimes(1)
		expect(w.find('.qc-moves__table').text()).toContain('e2')
		expect(w.findAll('[role=tab]').map((t) => t.text())).toEqual(['Moves', 'Log'])
		w.unmount()
	})

	it('shows the Chat tab only with a chat slot', async () => {
		const w = await mountScreen(fakeController(), { chat: () => h('p', { class: 'chat-slot' }, 'hello') })
		expect(w.findAll('[role=tab]').map((t) => t.text())).toEqual(['Moves', 'Log', 'Chat'])
		await w.find('[data-test=tab-chat]').trigger('click')
		expect(w.find('.chat-slot').exists()).toBe(true)
		w.unmount()
	})

	it('opens the history view from the move list and goes back to live', async () => {
		const w = await mountScreen(fakeController())
		await w.findAll('.qc-moves__move')[0].trigger('click')
		expect(w.text()).toContain('Viewing move 1 of 2')
		expect(w.find('.qc-board').exists()).toBe(true)
		await w.find('[data-test=back-to-live]').trigger('click')
		expect(w.text()).not.toContain('Viewing move')
		w.unmount()
	})

	it('shows the log with an empty state when nothing was rolled', async () => {
		const w = await mountScreen(fakeController())
		await w.find('[data-test=tab-log]').trigger('click')
		expect(w.find('.qc-rolls__empty').exists()).toBe(true)
		expect(w.find('.qc-rolls__header').text()).toContain('0 rolls')
		w.unmount()
	})
})
