// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * OnlineVariantPanel in a game of four: the seats that are out are marked, the end names the player who resigned or ran
 * out of time, Accept and Decline show only to a seat that may still answer the draw offer, and Abort asks first.
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref, shallowRef } from 'vue'
import OnlineVariantPanel from '../../../src/online/components/OnlineVariantPanel.vue'

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

const V = {
	sides: ['White', 'Red', 'Black', 'Blue'].map((name) => ({ name })),
}

/**
 * The panel of a game of four, the viewer on seat 1.
 *
 * @param {object} [patch] fields of the game
 * @param {object} [can] the controller's permissions
 * @return {{wrapper: object, c: object}}
 */
function panel(patch = {}, can = {}) {
	const game = shallowRef({
		status: 'active',
		turn: '2',
		myColor: '1',
		seats: [0, 1, 2, 3].map((seat) => ({ seat, player: { userId: 'u' + seat } })),
		...patch,
	})
	const c = {
		game,
		myColor: computed(() => '1'),
		names: computed(() => ({ 0: 'Alice', 1: 'Bob', 2: 'Carol', 3: 'Dave' })),
		participant: computed(() => false),
		can: computed(() => ({ answerDraw: false, offerDraw: false, abort: false, rematch: false, ...can })),
		drawOffer: computed(() => game.value.drawOffer ?? null),
		rematchGame: ref(null),
		rematchState: ref(null),
		answerDraw: vi.fn(async () => {}),
		offerDraw: vi.fn(async () => {}),
		abort: vi.fn(async () => {}),
	}
	const online = { game: { V: shallowRef(V) }, mySeat: computed(() => 1), problem: ref(null) }
	const wrapper = mount(OnlineVariantPanel, {
		props: { controller: c, online },
		global: { stubs: { NcDialog: DialogStub } },
	})
	return { wrapper, c }
}

describe('OnlineVariantPanel', () => {
	it('marks the seats that are out', () => {
		const { wrapper } = panel({ outSeats: [3] })
		const rows = wrapper.findAll('.qc-vonline__players li')
		expect(rows[3].text()).toContain('(out)')
		expect(rows[0].text()).not.toContain('(out)')
	})

	it('names the player who resigned or ran out of time', () => {
		const end = { status: 'finished', variantResult: 'win:0/resign' }
		const resigned = panel({ ...end, resultReason: 'resignation', endedBySeat: 2 })
		expect(resigned.wrapper.text()).toContain('Carol resigned')
		const flagged = panel({ status: 'finished', resultReason: 'timeout', turn: '3', variantResult: 'win:0/time' })
		expect(flagged.wrapper.text()).toContain('Dave ran out of time')
		const unknown = panel({ status: 'finished', resultReason: 'resignation', variantResult: 'win:0/resign' })
		expect(unknown.wrapper.text()).toContain('A player resigned')
	})

	it('shows Accept and Decline only to a seat that may still answer the draw offer', () => {
		const offer = { drawOffer: { by: '0' }, drawVotes: [0] }
		expect(panel(offer, { answerDraw: true }).wrapper.text()).toContain('Accept draw')
		const closed = panel({ ...offer, canAnswerDraw: false }, { answerDraw: true })
		expect(closed.wrapper.text()).not.toContain('Accept draw')
		expect(panel({ ...offer, drawVotes: [0, 1] }, { answerDraw: true }).wrapper.text()).not.toContain('Accept draw')
	})

	it('asks before aborting', async () => {
		const { wrapper, c } = panel({}, { abort: true })
		await wrapper.find('[data-test=variant-abort]').trigger('click')
		expect(c.abort).not.toHaveBeenCalled()
		expect(wrapper.text()).toContain('Abort this game?')
		await wrapper.find('[data-test=confirm-abort]').trigger('click')
		expect(c.abort).toHaveBeenCalled()
		expect(wrapper.find('[data-test=dialog]').exists()).toBe(false)
	})
})
