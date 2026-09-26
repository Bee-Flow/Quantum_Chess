// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The phone layouts of the multi-board variants (the visual review's "too small to play on a phone" findings), on
 * the real board component with a touch screen 366 px wide (a 390 px phone): Tri-D shows its whole drawing at more
 * than 28 px per square, 4D chess opens on the 2 × 2 boards of the side to move and bughouse on the board of the seat
 * to move, whole with its players' names, both at 28 px per square. With a mouse all three show the whole drawing.
 */

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VariantBoard from '../../../src/variantplay/components/VariantBoard.vue'
import bughouse from '../../../src/variants/bughouse.js'
import { newGame } from '../../../src/variants/core/quantum.js'
import hyper4d from '../../../src/variants/hyper4d.js'
import trid from '../../../src/variants/trid.js'
import { play } from './helpers.js'

/** The width of the drawing on a 390 px phone, in CSS pixels. */
const PHONE = 366

/**
 * Pretend the main pointer is coarse (a touch screen) or fine.
 *
 * @param {boolean} coarse coarse
 */
function pointer(coarse) {
	vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
		matches: coarse && query === '(pointer: coarse)',
		media: query,
		addEventListener() {},
		removeEventListener() {},
	}))
}

/**
 * The viewBox of a board as numbers `[x, y, w, h]`.
 *
 * @param {import('@vue/test-utils').VueWrapper} w wrapper
 * @return {number[]}
 */
function viewBox(w) {
	return w.find('svg.qc-vboard').attributes('viewBox').split(' ').map(Number)
}

/**
 * Mount the board with its drawing measured on screen at a given size.
 *
 * @param {object} variant variant
 * @param {object} state state
 * @param {number} width width in CSS pixels
 * @param {number} height height in CSS pixels
 * @return {Promise<import('@vue/test-utils').VueWrapper>}
 */
async function measured(variant, state, width, height) {
	const rect = { left: 0, top: 0, x: 0, y: 0, width, height, right: width, bottom: height }
	vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue(rect)
	const w = mount(VariantBoard, { props: { variant, state }, attachTo: document.body })
	await flushPromises()
	return w
}

/**
 * The board as a phone shows it: the drawing is as wide as the phone and, as in a browser, as high as the shape of
 * the whole drawing makes it (the zoomed view keeps that shape). Also returns the whole drawing's viewBox.
 *
 * @param {object} variant variant
 * @param {object} state state
 * @return {Promise<{w: import('@vue/test-utils').VueWrapper, full: number[]}>}
 */
async function onPhone(variant, state) {
	pointer(false)
	const probe = await measured(variant, state, PHONE, PHONE)
	const full = viewBox(probe)
	probe.unmount()
	vi.restoreAllMocks()
	pointer(true)
	const w = await measured(variant, state, PHONE, (PHONE * full[3]) / full[2])
	return { w, full }
}

/**
 * Whether the shown part of the drawing holds a rectangle.
 *
 * @param {number[]} vb viewBox
 * @param {number[]} r rectangle `[x1, y1, x2, y2]`
 * @return {boolean}
 */
function holds(vb, [x1, y1, x2, y2]) {
	const e = 1e-6
	return vb[0] <= x1 + e && vb[1] <= y1 + e && vb[0] + vb[2] >= x2 - e && vb[1] + vb[3] >= y2 - e
}

afterEach(() => {
	vi.restoreAllMocks()
	document.body.innerHTML = ''
})

describe('phone layouts of the multi-board variants', () => {
	it('shows the whole Tri-D drawing on a phone at more than 28 px per square, without zoom buttons', async () => {
		const { w, full } = await onPhone(trid, newGame(trid))
		expect(viewBox(w)).toEqual(full)
		expect(PHONE / full[2]).toBeGreaterThan(28)
		expect(w.find('.qc-vboard__zoom').exists()).toBe(false)
		w.unmount()
	})

	it('opens 4D chess on the side to move\'s 2 × 2 boards at 28 px per square on a touch screen', async () => {
		const start = newGame(hyper4d)
		const { w, full } = await onPhone(hyper4d, start)
		let vb = viewBox(w)
		expect(PHONE / vb[2]).toBeCloseTo(28, 1)
		expect(vb[2]).toBeLessThan(full[2] * 0.7)
		// B1, C1, B2 and C2 hold White's king, queen and most pawns
		expect(holds(vb, [4.8, 9.6, 13.6, 18.4])).toBe(true)
		// Black to move: the view recentres on Black's boards B3, C3, B4 and C4
		await w.setProps({ state: play(hyper4d, start, 'B2b2-B2b3') })
		vb = viewBox(w)
		expect(holds(vb, [4.8, 0, 13.6, 8.8])).toBe(true)
		expect(PHONE / vb[2]).toBeCloseTo(28, 1)
		w.unmount()
		// with a mouse the whole hypercube stays in view
		pointer(false)
		const desk = await measured(hyper4d, start, 700, 700)
		expect(desk.find('button[aria-label="Zoom out"]').attributes('disabled')).toBeDefined()
		desk.unmount()
	})

	it('opens bughouse on the whole board of the seat to move at 28 px per square on a touch screen', async () => {
		const start = newGame(bughouse)
		const { w, full } = await onPhone(bughouse, start)
		let vb = viewBox(w)
		expect(PHONE / vb[2]).toBeCloseTo(28, 1)
		// board A (frame 0-8 × 2.3-10.9) with the names of its players above and below the frame (at 2 and 11.2)
		expect(holds(vb, [0, 2 - 0.2, 8, 11.2 + 0.2])).toBe(true)
		// White B to move: board B
		await w.setProps({ state: play(bughouse, start, 'A:e2-A:e4') })
		vb = viewBox(w)
		expect(holds(vb, [8.8, 2 - 0.2, 16.8, 11.2 + 0.2])).toBe(true)
		expect(vb[2]).toBeLessThan(full[2] * 0.75)
		w.unmount()
		// with a mouse both boards stay in view
		pointer(false)
		const desk = await measured(bughouse, start, 700, 700)
		expect(desk.find('button[aria-label="Zoom out"]').attributes('disabled')).toBeDefined()
		desk.unmount()
	})
})
