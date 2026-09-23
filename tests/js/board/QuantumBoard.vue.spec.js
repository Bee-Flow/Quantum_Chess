// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * QuantumBoard (SPEC §14.6.1): the accessible grid and its labels, markers per resolution, badges, the DOM budget,
 * keyboard flows with the roving focus, the move event and the Animator at speed Off.
 */

import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import QuantumBoard from '../../../src/components/board/QuantumBoard.vue'
import { clearBoardPreferenceOverrides, overrideBoardPreferences } from '../../../src/components/board/boardPreferences.js'
import { E, S } from './helpers.js'

/**
 * Mount a playable board.
 *
 * @param {object} state engine state
 * @param {object} [props] more props
 * @return {import('@vue/test-utils').VueWrapper}
 */
function board(state, props = {}) {
	return mount(QuantumBoard, {
		props: {
			state,
			legalMoves: E.generateMoves(state),
			interactive: true,
			movableColor: state.turn,
			squareSize: 48,
			...props,
		},
		attachTo: document.body,
	})
}

/**
 * The grid cell of a square.
 *
 * @param {import('@vue/test-utils').VueWrapper} w wrapper
 * @param {string} name square name
 * @return {import('@vue/test-utils').DOMWrapper}
 */
function cell(w, name) {
	return w.findAll('[role="gridcell"]').find((c) => c.attributes('aria-label').startsWith(name + ','))
}

beforeEach(() => {
	overrideBoardPreferences({ animationSpeed: 'off', sound: false, confirmMoves: 'never', safetyNet: false })
})
afterEach(() => {
	clearBoardPreferenceOverrides()
	document.body.innerHTML = ''
})

describe('QuantumBoard', () => {
	it('renders an 8 × 8 grid with square labels and one tab stop', () => {
		const s = S('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1', ['g1-f3|h3'])
		const w = board(s)
		const cells = w.findAll('[role="gridcell"]')
		expect(cells).toHaveLength(64)
		expect(w.findAll('[role="row"]')).toHaveLength(8)
		expect(cells.filter((c) => c.attributes('tabindex') === '0')).toHaveLength(1)
		expect(cell(w, 'f3').attributes('aria-label')).toBe('f3, white knight, 50 percent, also on h3')
		// two ghost parts: two badges with ring arcs; the kings are solid
		expect(w.findAll('.qc-badge').map((b) => b.text())).toEqual(['50%', '50%'])
		expect(w.findAll('.qc-piece__arc')).toHaveLength(2)
		expect(w.findAll('.qc-piece').length).toBe(4)
		w.unmount()
	})

	it('keeps the DOM within 64 pieces in the start position', () => {
		const w = board(E.initialState())
		expect(w.findAll('.qc-piece').length).toBe(32)
		expect(w.findAll('.qc-badge')).toHaveLength(0)
		w.unmount()
	})

	it('draws a marker per resolution and commits a move with the keyboard', async () => {
		const s = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		const w = board(s)
		const c1 = cell(w, 'c1')
		await c1.trigger('focus')
		await c1.trigger('keydown', { key: 'Enter' })
		expect(w.findAll('.qc-mk--certain').length).toBeGreaterThan(0)
		expect(w.findAll('.qc-mk--roll-capture')).toHaveLength(1)
		expect(cell(w, 'h6').attributes('aria-label')).toContain('Roll')
		// arrows from c1 to h6: up 5, right 5
		for (let i = 0; i < 5; i++) {
			await w.find('[role="grid"]').trigger('keydown', { key: 'ArrowUp' })
			await w.find('[role="grid"]').trigger('keydown', { key: 'ArrowRight' })
		}
		await w.find('[role="grid"]').trigger('keydown', { key: 'Enter' })
		const moves = w.emitted('move')
		expect(moves).toHaveLength(1)
		expect(moves[0][0].code).toBe('c1-h6')
		w.unmount()
	})

	it('switches the move type with number keys and shows split targets', async () => {
		const s = S('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1')
		const w = board(s)
		const grid = w.find('[role="grid"]')
		await cell(w, 'g1').trigger('focus')
		await grid.trigger('keydown', { key: '2' })
		await grid.trigger('keydown', { key: 'Enter' })
		expect(w.findAll('.qc-mk--split').length).toBe(3)
		w.unmount()
	})

	it('resolves play() immediately at speed Off and announces the move', async () => {
		const s = S('4k3/8/8/8/8/8/8/4K1N1 w - - 0 1')
		const w = board(s)
		const r = E.applyMove(s, 'g1-f3')
		await w.vm.play({ before: s, after: r.state, move: r.move, measurement: null, actor: 'self' })
		await nextTick()
		await nextTick()
		expect(w.find('[aria-live="polite"]').text()).toContain('White knight moves from g1 to f3')
		w.unmount()
	})

	it('shows a result chip after a roll', async () => {
		const s = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		const w = board(s)
		const r = E.applyMove(s, 'c1-h6', { outcome: 'capture' })
		await w.vm.play({ before: s, after: r.state, move: r.move, measurement: r.measurement, actor: 'self' })
		await nextTick()
		expect(w.find('.qc-board__chip').text()).toContain('Captured')
		w.unmount()
	})
})
