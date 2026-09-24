// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * GameChat: text is rendered as text (an HTML payload stays text), phrases and system lines are translated keys, the
 * opponent's messages collapse while muted, and quick phrases send their key.
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, h, ref, shallowRef } from 'vue'
import GameChat from '../../../src/online/components/GameChat.vue'

// The emoji picker is loaded lazily; a stub keeps that import from finishing after the test environment is torn down.
vi.mock('@nextcloud/vue/components/NcEmojiPicker', () => ({
	__esModule: true,
	default: defineComponent({ name: 'NcEmojiPicker', setup: (props, { slots }) => () => h('div', slots.default?.()) }),
}))

/**
 * A minimal online controller for the chat.
 *
 * @param {object} [options] {muted, chatOpen}
 * @return {object}
 */
function controller({ muted = false, chatOpen = true } = {}) {
	const game = shallowRef({ myColor: 'w', white: { userId: 'alice' }, black: { userId: 'bob' }, muted })
	return {
		game,
		myColor: computed(() => 'w'),
		names: computed(() => ({ w: 'Alice', b: 'Bob' })),
		participant: computed(() => true),
		can: computed(() => ({ chat: chatOpen })),
		chat: ref([
			{
				id: 1,
				kind: 'system',
				userId: null,
				displayName: null,
				message: 'draw_offered',
				params: { color: 'b' },
				createdAt: 1,
			},
			{
				id: 2,
				kind: 'text',
				userId: 'bob',
				displayName: 'Bob',
				message: '<img src=x onerror=alert(1)>hi',
				params: null,
				createdAt: 2,
			},
			{
				id: 3,
				kind: 'phrase',
				userId: 'alice',
				displayName: 'Alice',
				message: 'good_game',
				params: null,
				createdAt: 3,
			},
			{ id: 4, kind: 'text', userId: 'bob', displayName: 'Bob', message: 'second', params: null, createdAt: 4 },
		]),
		sendChat: vi.fn(async () => true),
		setMuted: vi.fn(),
		markChatSeen: vi.fn(),
	}
}

describe('GameChat', () => {
	it('renders text as text, translates phrases and system lines', () => {
		const c = controller()
		const wrapper = mount(GameChat, { props: { controller: c } })
		expect(wrapper.find('img').exists()).toBe(false)
		expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>hi')
		expect(wrapper.text()).toContain('Bob offered a draw')
		expect(wrapper.text()).toContain('Good game')
		expect(c.markChatSeen).toHaveBeenCalled()
	})

	it('collapses the opponent while muted', () => {
		const wrapper = mount(GameChat, { props: { controller: controller({ muted: true }) } })
		expect(wrapper.text().match(/1 hidden message/g)).toHaveLength(2)
		expect(wrapper.text()).not.toContain('second')
		expect(wrapper.text()).toContain('Good game')
	})

	it('sends a quick phrase as its key, and hides the input when the chat is closed', async () => {
		const c = controller()
		const wrapper = mount(GameChat, { props: { controller: c } })
		await wrapper.find('[data-test=phrase-good_luck]').trigger('click')
		expect(c.sendChat).toHaveBeenCalledWith('good_luck')
		const closed = mount(GameChat, { props: { controller: controller({ chatOpen: false }) } })
		expect(closed.find('[data-test=chat-send]').exists()).toBe(false)
		expect(closed.text()).toContain('The chat of this game is closed.')
	})
})
