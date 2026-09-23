// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * NotationText (GAME-DESIGN §3.7): figurines, the quantum pipe and the result tag of rolled moves.
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import NotationText from '../../../src/components/board/NotationText.vue'
import { E, S } from './helpers.js'

describe('NotationText', () => {
	it('draws a split with a figurine and the quantum pipe', () => {
		const w = mount(NotationText, { props: { notation: 'Ng1-f3|h3' } })
		expect(w.findAll('.qc-piece-icon')).toHaveLength(1)
		expect(w.find('.qc-notation__pipe').exists()).toBe(true)
		expect(w.find('.qc-notation__head').text()).toBe('g1–f3|h3')
		expect(w.find('.qc-sr-only').text()).toBe('Ng1-f3|h3')
	})

	it('tags rolled results', () => {
		expect(mount(NotationText, { props: { notation: 'Bc1xh6 {capture 50%}' } }).find('.qc-notation__result').text()).toBe('✓ 50%')
		const miss = mount(NotationText, { props: { notation: 'd3-e4 {miss 75%}' } })
		expect(miss.find('.qc-notation__result').text()).toBe('○ Missed 75%')
		expect(miss.classes()).toContain('qc-notation--missed')
		expect(miss.findAll('.qc-piece-icon')).toHaveLength(0)
		expect(mount(NotationText, { props: { notation: '?Na4 {c4 50%}' } }).find('.qc-notation__result').text()).toBe('→ c4 50%')
		expect(mount(NotationText, { props: { notation: 'Ra1-a8 #' } }).find('.qc-notation__mark').exists()).toBe(true)
	})

	it('builds the notation from a move and its state', () => {
		const s = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		const r = E.applyMove(s, 'c1-h6', { outcome: 'move' })
		const w = mount(NotationText, { props: { move: r.move, stateBefore: s, measurement: r.measurement } })
		expect(w.find('.qc-sr-only').text()).toBe('Bc1-h6 {move 50%}')
		expect(w.find('.qc-notation__result').text()).toBe('○ Moved 50%')
	})
})
