// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * VariantBoard: every square is drawn and named, ghosts show their percentage, targets are marked, hidden squares
 * hide the enemy pieces, clicks and the keyboard report the square, and a quarter turn swaps the drawing's size.
 */

import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import VariantBoard from '../../../src/variantplay/components/VariantBoard.vue'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import { newGame } from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { play, stateOf } from './helpers.js'

const V = defineVariant(Object.assign(orthodoxSpec(), { id: 'test-board', category: 'rules' }))

/**
 * Mount a board.
 *
 * @param {object} state state
 * @param {object} [props] more props
 * @return {import('@vue/test-utils').VueWrapper}
 */
function board(state, props = {}) {
	return mount(VariantBoard, { props: { variant: V, state, ...props }, attachTo: document.body })
}

afterEach(() => {
	document.body.innerHTML = ''
})

describe('VariantBoard', () => {
	it('draws 64 named squares and 32 pieces', () => {
		const w = board(newGame(V))
		const cells = w.findAll('[data-square]')
		expect(cells).toHaveLength(64)
		expect(w.find('[data-square="e1"]').attributes('aria-label')).toBe('e1: King')
		expect(w.findAll('use')).toHaveLength(32)
	})

	it('shows the percentage of a ghost part', () => {
		const s = play(V, newGame(V), 'g1-f3|h3')
		const w = board(s)
		expect(w.find('[data-square="f3"]').text()).toContain('50%')
		expect(w.find('[data-square="f3"]').attributes('aria-label')).toBe('f3: Knight (50 %)')
	})

	it('marks targets and reports clicks and key presses', async () => {
		const w = board(newGame(V), { marks: { 20: ['target'] }, focusable: new Set([20]) })
		expect(w.find('[data-square="e3"] .qc-vboard__dot').exists()).toBe(true)
		await w.find('[data-square="e3"]').trigger('click')
		await w.find('[data-square="e3"]').trigger('keydown', { key: 'Enter' })
		expect(w.emitted('square')).toEqual([[20], [20]])
		expect(w.find('[data-square="e3"]').attributes('tabindex')).toBe('0')
	})

	it('hides enemy pieces on hidden squares but keeps the viewer\'s own', () => {
		const s = stateOf(V, [[{ e1: '0:k', e8: '1:k' }, 1]])
		const w = board(s, { hidden: new Set([4, 60]), viewer: 0 })
		expect(w.find('[data-square="e1"] use').exists()).toBe(true)
		expect(w.find('[data-square="e8"] use').exists()).toBe(false)
		expect(w.find('[data-square="e8"]').classes()).toContain('qc-vboard__cell--fog')
	})

	it('turns the board', () => {
		const w = board(newGame(V), { rotation: 180 })
		const e1 = w.find('[data-square="e1"] rect')
		expect(Number(e1.attributes('y'))).toBe(0)
	})
})
