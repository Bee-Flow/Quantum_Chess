// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * SeatPicker: a row per seat named after its side, the viewer in exactly one seat ("You" elsewhere opens the seat the
 * viewer left), and a chosen user in the model.
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import SeatPicker from '../../../src/online/components/SeatPicker.vue'
import { features } from '../../../src/services/initialState.js'

vi.mock('../../../src/services/api.js', () => ({
	getRecentOpponents: vi.fn(async () => []),
	searchUsers: vi.fn(async () => []),
}))

/**
 * Mount the picker with a model that follows its updates.
 *
 * @param {Array} players the model
 * @return {{wrapper: object, model: () => Array}}
 */
function mountPicker(players) {
	let model = players
	const wrapper = mount(SeatPicker, {
		props: {
			modelValue: players,
			sides: ['Red', 'Blue', 'Yellow', 'Green'],
			'onUpdate:modelValue': (v) => {
				model = v
				wrapper.setProps({ modelValue: v })
			},
		},
	})
	return { wrapper, model: () => model }
}

/**
 * The select of a seat's kind (You, Invite a player, Open seat), the first select of its row.
 *
 * @param {object} wrapper the mounted picker
 * @param {number} seat seat
 * @return {object}
 */
function kindSelect(wrapper, seat) {
	return wrapper.findAll('.qc-seat-picker__row')[seat].findComponent({ name: 'NcSelect' })
}

describe('SeatPicker', () => {
	it('shows a row per seat with its side', () => {
		const { wrapper } = mountPicker(['me', null, null, null])
		const rows = wrapper.findAll('.qc-seat-picker__row')
		expect(rows.map((r) => r.find('.qc-seat-picker__side').text())).toEqual(['Red', 'Blue', 'Yellow', 'Green'])
	})

	it('moves the viewer to another seat and opens the one left', async () => {
		features.openChallenges = true
		const { wrapper, model } = mountPicker(['me', null, { id: 'bob' }, null])
		kindSelect(wrapper, 3).vm.$emit('update:modelValue', { id: 'me', label: 'You' })
		await nextTick()
		expect(model()).toEqual([null, null, { id: 'bob' }, 'me'])
	})

	it('keeps the viewer in a seat when another kind is chosen for it', async () => {
		const { wrapper, model } = mountPicker(['me', null, null, null])
		kindSelect(wrapper, 0).vm.$emit('update:modelValue', { id: 'open' })
		await nextTick()
		expect(model()).toEqual(['me', null, null, null])
	})

	it('stores the invited user of a seat', async () => {
		const { wrapper, model } = mountPicker(['me', null, null, null])
		kindSelect(wrapper, 1).vm.$emit('update:modelValue', { id: 'user' })
		await nextTick()
		const users = wrapper.findAllComponents({ name: 'NcSelectUsers' })
		expect(users).toHaveLength(1)
		users[0].vm.$emit('update:modelValue', { id: 'carol', displayName: 'Carol' })
		await nextTick()
		expect(model()[1]).toEqual({ id: 'carol', displayName: 'Carol' })
	})
})
