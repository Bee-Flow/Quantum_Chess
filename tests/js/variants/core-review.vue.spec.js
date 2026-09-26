// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The fixes of the second visual review of the variant screens, on the components: a move waiting for confirmation
 * keeps its squares marked and is named in its box, and the hint then says to confirm or cancel it (the hint is no
 * longer part of the controls that stay at the bottom of a phone screen, which scroll the move's squares out from
 * under them); the notices are readable warning notes; a new game that the browser storage refuses keeps the New game
 * dialog open with the notice; the move list is numbered, oldest first, in long algebraic notation; bughouse shows
 * the hands under their boards; Kriegspiel heads its announcements "Umpire" and keeps only the informative lines in
 * the move list; King of the Hill explains its hill; the board draws threat lines with a halo and an arrowhead, keeps
 * the zoomed part in view when it turns, ends a mouse pan whose button was let go outside it, pins the names of the
 * boards in a zoomed view and offers "Recentre"; the pieces draw compound pieces, the unicorn and the met, and put the
 * badge of a text token in the corner of its square.
 */

import { flushPromises, mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import VariantBoard from '../../../src/variantplay/components/VariantBoard.vue'
import VariantPiece from '../../../src/variantplay/components/VariantPiece.vue'
import VariantGameView from '../../../src/views/VariantGameView.vue'
import VariantsView from '../../../src/views/VariantsView.vue'
import { glyphOf } from '../../../src/variantplay/glyphs.js'
import {
	createVariantGame,
	listVariantGames,
	loadVariantGame,
	saveVariantGame,
} from '../../../src/variantplay/variantGames.js'
import bughouse from '../../../src/variants/bughouse.js'
import capablanca from '../../../src/variants/capablanca.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import { applyOutcome, newGame } from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import hyper4d from '../../../src/variants/hyper4d.js'
import koth from '../../../src/variants/koth.js'
import kriegspiel from '../../../src/variants/kriegspiel.js'
import makruk from '../../../src/variants/makruk.js'
import raumschach from '../../../src/variants/raumschach.js'
import shogi from '../../../src/variants/shogi.js'
import { stateOf } from './helpers.js'

const registry = vi.hoisted(() => ({ variants: {}, full: false }))

vi.mock('../../../src/variants/index.js', async (importOriginal) => {
	const mod = await importOriginal()
	return { ...mod, loadVariant: async (id) => registry.variants[id] ?? mod.loadVariant(id) }
})

vi.mock('../../../src/services/storage.js', async (importOriginal) => {
	const mod = await importOriginal()
	// a full browser storage: nothing can be written
	return { ...mod, writeJson: (key, value) => (registry.full ? false : mod.writeJson(key, value)) }
})

// the same module objects as the game view loads
for (const V of [bughouse, koth, kriegspiel]) {
	registry.variants[V.id] = V
}

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

const V = orthodox('test-review')

/** How long to wait for the New game dialog (its variant loads asynchronously). */
const WAIT = { timeout: 3000, interval: 5 }

/**
 * A router with the routes the views link to.
 *
 * @return {import('vue-router').Router}
 */
function testRouter() {
	const stub = { render: () => null }
	return createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/variants', name: 'variants', component: stub },
			{ path: '/variants/:variant/:id', name: 'variant-game', component: stub },
			{ path: '/new', name: 'new-game', component: stub },
		],
	})
}

/**
 * Mount the game view of a game stored on this device.
 *
 * @param {object} variant variant
 * @param {object} initial start state
 * @param {object} [more] `kinds` (`human` or `computer` per side), `moves` already played (outcome 0 each)
 * @return {Promise<import('@vue/test-utils').VueWrapper>}
 */
async function mountGame(variant, initial, { kinds = variant.sides.map(() => 'human'), moves = [] } = {}) {
	const players = kinds.map((kind) => (kind === 'human' ? { kind } : { kind, level: 'easy' }))
	const rec = createVariantGame({ variant: variant.id, options: {}, players, initial })
	if (moves.length) {
		let s = initial
		for (const code of moves) {
			s = applyOutcome(variant, s, code, 0)
		}
		saveVariantGame({ ...rec, moves: moves.map((code) => ({ code, i: 0 })), current: s })
	}
	const router = testRouter()
	router.push('/variants/' + variant.id + '/' + rec.id)
	await router.isReady()
	const w = mount(VariantGameView, { global: { plugins: [router] }, attachTo: document.body })
	await flushPromises()
	return w
}

/**
 * The button with a text.
 *
 * @param {import('@vue/test-utils').VueWrapper} w wrapper
 * @param {string} text button text
 * @return {import('@vue/test-utils').DOMWrapper<HTMLButtonElement>|undefined}
 */
function button(w, text) {
	return w.findAll('button').find((b) => b.text() === text)
}

/**
 * Click a square.
 *
 * @param {import('@vue/test-utils').VueWrapper} w wrapper
 * @param {string} name square name
 */
async function click(w, name) {
	await w.find(`[data-square="${name}"]`).trigger('click')
}

/**
 * The squares that carry a mark class.
 *
 * @param {import('@vue/test-utils').VueWrapper} w wrapper
 * @param {string} mark mark name
 * @return {string[]}
 */
function marked(w, mark) {
	return w.findAll('.qc-vboard__cell--' + mark).map((e) => e.attributes('data-square')).sort()
}

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
 * Mount a board whose drawing measures `width` × `height` CSS pixels on screen.
 *
 * @param {object} variant variant
 * @param {object} state state
 * @param {object} [props] more props
 * @param {number} [width] width on screen
 * @param {number} [height] height on screen
 * @return {Promise<import('@vue/test-utils').VueWrapper>}
 */
async function measuredBoard(variant, state, props = {}, width = 360, height = 360) {
	const rect = { left: 0, top: 0, x: 0, y: 0, width, height, right: width, bottom: height }
	vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue(rect)
	const w = mount(VariantBoard, { props: { variant, state, ...props }, attachTo: document.body })
	await flushPromises()
	return w
}

/**
 * The viewBox of a board as numbers.
 *
 * @param {import('@vue/test-utils').VueWrapper} w wrapper
 * @return {number[]}
 */
function viewBox(w) {
	return w.find('svg.qc-vboard').attributes('viewBox').split(' ').map(Number)
}

/**
 * Whether the shown part of the drawing holds a point.
 *
 * @param {number[]} vb viewBox
 * @param {number} x x
 * @param {number} y y
 * @return {boolean}
 */
function shows(vb, x, y) {
	return x >= vb[0] && x <= vb[0] + vb[2] && y >= vb[1] && y <= vb[1] + vb[3]
}

beforeEach(() => {
	localStorage.clear()
	registry.full = false
})

afterEach(() => {
	vi.restoreAllMocks()
	document.body.innerHTML = ''
})

describe('a move waiting for confirmation', () => {
	const W = orthodox('test-review-warn', { moveWarning: () => 'After this move you lose' })

	it('keeps its squares marked, is named in its box, and the hint says to confirm or cancel it', async () => {
		const s = stateOf(W, [[{ e1: '0:k', g1: '0:n', e8: '1:k', f3: '1:p' }, 1]])
		const w = await mountGame(W, s)
		await click(w, 'g1')
		await click(w, 'f3')
		const box = w.find('.qc-vgame__box--pending')
		expect(box.find('.qc-vgame__pending-move').text()).toBe('Ng1xf3')
		expect(marked(w, 'selected')).toEqual(['g1'])
		expect(marked(w, 'target')).toEqual(['f3'])
		expect(w.find('.qc-vgame__hint--mode').text()).toBe('Confirm or cancel the move.')
		// the hint is not in the controls that stay at the bottom of a phone screen
		expect(w.find('.qc-vgame__controls .qc-vgame__hint--mode').exists()).toBe(false)
		await button(w, 'Cancel').trigger('click')
		expect(marked(w, 'selected')).toEqual([])
		expect(marked(w, 'target')).toEqual([])
		expect(w.find('.qc-vgame__hint--mode').text()).toBe('Choose a piece, then its target square.')
		w.unmount()
	})

	it('scrolls the page so that the marked squares are not under the controls at the bottom of a phone', async () => {
		const box = { top: 0, bottom: 800 }
		const rects = {
			'qc-vgame__controls': { top: 600, bottom: 800 },
			'qc-vboard__cell--selected': { top: 640, bottom: 680 },
			'qc-vboard__cell--target': { top: 560, bottom: 600 },
		}
		const real = window.getComputedStyle
		vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
			const style = real(el)
			if (el.classList?.contains('qc-vgame__controls')) {
				return { ...style, position: 'sticky' }
			}
			return el.classList?.contains('qc-vgame') ? style : { ...style, overflowY: 'visible' }
		})
		vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function() {
			const key = Object.keys(rects).find((k) => this.classList.contains(k))
			const r = key ? rects[key] : box
			return { left: 0, right: 360, x: 0, y: r.top, width: 360, height: r.bottom - r.top, ...r }
		})
		const by = vi.spyOn(Element.prototype, 'scrollBy').mockImplementation(() => {})
		const w = await mountGame(W, newGame(W))
		await click(w, 'e2')
		await click(w, 'e4')
		await flushPromises()
		// the lowest marked square ends 80 px below the top of the controls: 88 px with a margin of 8
		expect(by).toHaveBeenCalledWith({ top: 88 })
		w.unmount()
	})
})

describe('the notices', () => {
	it('are warning notes: the main text colour on a light tint of the warning colour', () => {
		const here = dirname(fileURLToPath(import.meta.url))
		const source = readFileSync(resolve(here, '../../../src/views/VariantGameView.vue'), 'utf8')
		const rule = /\n\.qc-vgame__notice \{([^}]*)\}/.exec(source)[1]
		expect(rule).toContain('color: var(--color-main-text)')
		expect(rule).toMatch(/background: rgba\(var\(--color-warning-rgb[^)]*\), 0\.1\)/)
		// the warning text colour is made for the page background: on the warning colour it cannot be read
		expect(rule).not.toContain('--color-warning-text')
	})
})

describe('a new game that the storage refuses', () => {
	it('keeps the New game dialog open with a notice, and opens the game once it can be saved', async () => {
		const router = testRouter()
		router.push('/variants')
		await router.isReady()
		const w = mount(VariantsView, { global: { plugins: [router] }, attachTo: document.body })
		await w.find('[data-test="variant-koth"]').trigger('click')
		const form = () => document.querySelector('form.qc-variants__form')
		await vi.waitFor(() => expect(form()).not.toBeNull(), WAIT)
		registry.full = true
		form().dispatchEvent(new Event('submit'))
		await flushPromises()
		expect(router.currentRoute.value.name).toBe('variants')
		expect(document.querySelector('.qc-variants__not-saved').textContent.trim())
			.toBe('This game could not be saved on this device.')
		expect(listVariantGames()).toEqual([])
		registry.full = false
		form().dispatchEvent(new Event('submit'))
		await flushPromises()
		expect(router.currentRoute.value.name).toBe('variant-game')
		expect(listVariantGames()).toHaveLength(1)
		w.unmount()
	})
})

describe('the move list', () => {
	it('is numbered, oldest first, a column per side, with the piece letters and x for a capture', async () => {
		const w = await mountGame(V, newGame(V))
		for (const [from, to] of [['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5'], ['d8', 'd5'], ['g1', 'f3']]) {
			await click(w, from)
			await click(w, to)
		}
		const rows = w.findAll('.qc-vgame__move-row')
		expect(rows.map((r) => r.find('.qc-vgame__move-number').text())).toEqual(['1.', '2.', '3.'])
		expect(rows.map((r) => r.findAll('.qc-vgame__move-cell').map((c) => c.text()))).toEqual([
			['e2-e4', 'd7-d5'],
			['e4xd5', 'Qd8xd5'],
			['Ng1-f3', ''],
		])
		// the saved moves keep the piece that moved
		const saved = loadVariantGame(listVariantGames()[0].id)
		expect(saved.moves.map((m) => m.t)).toEqual(['p', 'p', 'p', 'q', 'n'])
		w.unmount()
	})

	it('writes a move saved without its piece type without a letter; four sides have a row per turn', async () => {
		const old = await mountGame(V, newGame(V), { moves: ['g1-f3'] })
		expect(old.find('.qc-vgame__move-cell').text()).toBe('g1-f3')
		old.unmount()
		const w = await mountGame(bughouse, newGame(bughouse), { moves: ['A:e2-A:e4', 'B:e2-B:e4'] })
		const rows = w.findAll('.qc-vgame__move-row')
		expect(rows.map((r) => [r.find('.qc-vgame__move-number').text(), r.find('.qc-vgame__code').text()]))
			.toEqual([['1.', 'A: e2-e4'], ['2.', 'B: e2-e4']])
		// with four sides each move carries its side's swatch
		expect(rows.every((r) => r.find('.qc-vgame__swatch').exists())).toBe(true)
		w.unmount()
	})
})

describe('the hands of bughouse', () => {
	it('sit under their boards in fixed halves, the seat at the top first, and follow Flip board', async () => {
		const w = await mountGame(bughouse, newGame(bughouse))
		const groups = () => w.findAll('.qc-vgame__hands--board')
			.map((g) => g.findAll('.qc-vgame__hand-title').map((t) => t.text()))
		expect(groups()).toEqual([
			['In hand: Black A', 'In hand: White A'],
			['In hand: White B', 'In hand: Black B'],
		])
		await button(w, 'Flip board').trigger('click')
		expect(groups()).toEqual([
			['In hand: Black B', 'In hand: White B'],
			['In hand: White A', 'In hand: Black A'],
		])
		w.unmount()
	})
})

describe('Kriegspiel', () => {
	it('heads the announcements "Umpire" and keeps only the informative lines in the move list', async () => {
		const w = await mountGame(kriegspiel, newGame(kriegspiel), { moves: ['e2-e4', 'd7-d5', 'e4-d5'] })
		await button(w, 'I am Black: show my board').trigger('click')
		const report = w.find('.qc-vgame__box--report')
		expect(report.find('.qc-vgame__box-title').text()).toBe('Umpire')
		expect(report.text()).toContain('White moved.')
		const lines = w.findAll('.qc-vgame__move-line').map((l) => l.text())
		expect(lines).toContain('Capture on d5: a pawn.')
		expect(lines.some((l) => /moved\.|No pawn tries\./.test(l))).toBe(false)
		w.unmount()
	})
})

describe('the legends under the board', () => {
	it('explain the hill of King of the Hill, with a swatch', async () => {
		const w = await mountGame(koth, newGame(koth))
		const legend = w.findAll('.qc-vgame__legend').find((l) => l.find('.qc-vgame__legend-swatch--hill').exists())
		expect(legend.text()).toBe('Hill: a king that reaches it wins.')
		expect(w.findAll('.qc-vboard__outline--hill')).toHaveLength(4)
		w.unmount()
	})
})

describe('the board', () => {
	it('draws a threat line on a halo, with an arrowhead that stops before the threatened square', () => {
		const O = orthodox('test-review-threat')
		O.topology = {
			...O.topology,
			layout: { ...O.topology.layout, outlines: [{ x1: 0.5, y1: 7.5, x2: 4.5, y2: 7.5, kind: 'threat' }] },
		}
		const w = mount(VariantBoard, { props: { variant: O, state: newGame(O) }, attachTo: document.body })
		const halo = w.find('.qc-vboard__halo')
		const line = w.find('.qc-vboard__outline--threat')
		const head = w.find('.qc-vboard__head')
		const tip = head.attributes('points').split(' ')[0].split(',').map(Number)
		expect(tip[0]).toBeCloseTo(4.5 - 0.22, 3)
		expect(tip[1]).toBeCloseTo(7.5, 3)
		expect(Number(halo.attributes('x2'))).toBeCloseTo(tip[0], 3)
		// the shaft ends under the head, the halo is drawn first
		expect(Number(line.attributes('x2'))).toBeLessThan(tip[0] - 0.3)
		const children = [...w.find('svg.qc-vboard').element.children]
		expect(children.indexOf(halo.element)).toBeLessThan(children.indexOf(line.element))
		expect(children.indexOf(line.element)).toBeLessThan(children.indexOf(head.element))
		w.unmount()
	})

	it('keeps the part it shows in view when it turns while zoomed in', async () => {
		pointer(true)
		const s = newGame(hyper4d)
		const w = await measuredBoard(hyper4d, s)
		// the focus: the block of boards B1, C1, B2, C2 around (9.2, 14)
		const { x, y } = hyper4d.layoutOf(s).layout.focus
		expect(shows(viewBox(w), x, y)).toBe(true)
		const { width: W, height: H } = hyper4d.topology.layout
		await w.setProps({ rotation: 180 })
		expect(shows(viewBox(w), W - x, H - y)).toBe(true)
		expect(shows(viewBox(w), x, y)).toBe(false)
		await w.setProps({ rotation: 0 })
		expect(shows(viewBox(w), x, y)).toBe(true)
		w.unmount()
	})

	it('ends a mouse pan whose button was let go outside the board: moving the mouse then does not pan', async () => {
		pointer(false)
		const L = orthodox('test-review-pan', {
			layoutOf() {
				return { ...L.topology, layout: { ...L.topology.layout, width: 30, height: 30, zoomable: true } }
			},
		})
		const w = await measuredBoard(L, newGame(L))
		await w.find('button[aria-label="Zoom in"]').trigger('click')
		const svg = w.find('svg.qc-vboard')
		const mouse = (type, x, buttons) => svg.trigger(type, {
			pointerId: 1,
			pointerType: 'mouse',
			isPrimary: true,
			clientX: x,
			clientY: 200,
			button: 0,
			buttons,
		})
		const start = viewBox(w)
		await mouse('pointerdown', 300, 1)
		await mouse('pointermove', 303, 1)
		// the button is let go outside the board: no pointerup reaches it
		await mouse('pointermove', 150, 0)
		expect(viewBox(w)).toEqual(start)
		// a real drag still pans
		await mouse('pointerdown', 300, 1)
		await mouse('pointermove', 250, 1)
		await mouse('pointerup', 250, 0)
		expect(viewBox(w)[0]).toBeGreaterThan(start[0])
		w.unmount()
	})

	it('pins the names of the boards in view to the top of a zoomed view, and offers Recentre', async () => {
		pointer(true)
		const s = newGame(hyper4d)
		const w = await measuredBoard(hyper4d, s)
		const recentre = () => w.findAll('button').find((b) => b.text() === 'Recentre')
		expect(recentre().attributes('disabled')).toBeDefined()
		// the view opens on the block of B1, C1, B2 and C2 and shows the lower half of B3 and C3, whose names are
		// above it: they are pinned to the top of the view
		const vb = viewBox(w)
		const pinned = () => w.findAll('.qc-vboard__pin').map((p) => p.text()).sort()
		expect(pinned()).toEqual(['B3', 'C3'])
		const svg = w.find('svg.qc-vboard')
		const touch = (type, y) => svg.trigger(type, {
			pointerId: 1,
			pointerType: 'touch',
			isPrimary: true,
			clientX: 180,
			clientY: y,
			button: 0,
		})
		// panned up by 4 units (28 px each): the names of B3 and C3 are in view, and B4 and C4 show only a sliver
		await touch('pointerdown', 100)
		await touch('pointermove', 212)
		await touch('pointerup', 212)
		const moved = viewBox(w)
		expect(moved[1]).toBeCloseTo(vb[1] - 4, 6)
		expect(pinned()).toEqual([])
		expect(recentre().attributes('disabled')).toBeUndefined()
		await recentre().trigger('click')
		expect(viewBox(w)).toEqual(vb)
		expect(pinned()).toEqual(['B3', 'C3'])
		w.unmount()
		// with a mouse the focus shows the whole drawing: nothing to recentre
		vi.restoreAllMocks()
		pointer(false)
		const desk = await measuredBoard(hyper4d, s)
		expect(desk.findAll('button').some((b) => b.text() === 'Recentre')).toBe(false)
		desk.unmount()
	})

	it('draws the bughouse names bold and larger', () => {
		const w = mount(VariantBoard, { props: { variant: bughouse, state: newGame(bughouse) } })
		const names = w.findAll('.qc-vboard__label--strong').map((l) => l.text()).sort()
		expect(names).toEqual(['Black A', 'Black B', 'White A', 'White B'])
		expect(w.findAll('.qc-vboard__board-label')).toHaveLength(0)
		w.unmount()
	})
})

describe('the pieces', () => {
	it('draw a compound piece as its two pieces side by side, the second in front', () => {
		const glyph = glyphOf(capablanca, 'a', 0)
		expect(glyph).toEqual({
			kind: 'compound',
			parts: [{ symbol: 'qc-piece-cburnett-wB' }, { symbol: 'qc-piece-cburnett-wN' }],
			tint: null,
		})
		const w = mount(VariantPiece, { props: { glyph, size: 1 } })
		const uses = w.findAll('use')
		expect(uses.map((u) => u.attributes('href'))).toEqual(['#qc-piece-cburnett-wB', '#qc-piece-cburnett-wN'])
		expect(Number(uses[0].attributes('x'))).toBeLessThan(Number(uses[1].attributes('x')))
		expect(glyphOf(capablanca, 'c', 1).parts.map((p) => p.symbol))
			.toEqual(['qc-piece-cburnett-bR', 'qc-piece-cburnett-bN'])
	})

	it('draw the unicorn as a knight with a horn, the met as a small queen and the khon as a bishop', () => {
		const unicorn = glyphOf(raumschach, 'u', 1)
		expect(unicorn).toMatchObject({ kind: 'sprite', symbol: 'qc-piece-cburnett-bN', horn: 'black' })
		const w = mount(VariantPiece, { props: { glyph: unicorn, size: 1 } })
		expect(w.find('.qc-vpiece__horn path').attributes('fill')).toBe('#000')
		const met = glyphOf(makruk, 'm', 0)
		expect(met).toMatchObject({ symbol: 'qc-piece-cburnett-wQ', scale: 0.8 })
		const small = mount(VariantPiece, { props: { glyph: met, size: 1 } }).find('use')
		expect(Number(small.attributes('width'))).toBeCloseTo(0.8, 9)
		// its base stays on the base line of the full-size pieces (39 of 45 down the sprite's box)
		const base = (y, w) => y + (w * 39) / 45
		expect(base(Number(small.attributes('y')), 0.8)).toBeCloseTo(base(-0.5, 1), 2)
		expect(glyphOf(makruk, 's', 0)).toMatchObject({ symbol: 'qc-piece-cburnett-wB' })
	})

	it('put the badge of a text token in the corner of its square, without the % sign', () => {
		const token = glyphOf(shogi, 'r', 0)
		expect(token.kind).toBe('text')
		const w = mount(VariantPiece, { props: { glyph: token, size: 1, p: 0.5, unit: 1 / 90 } })
		const badge = w.find('.qc-vpiece__badge')
		expect(badge.find('text').text()).toBe('50')
		const rect = badge.find('rect')
		const [tx, ty] = /translate\(([-\d.]+), ([-\d.]+)\)/.exec(badge.attributes('transform')).slice(1).map(Number)
		// the badge's bottom right is the square's corner
		expect(tx + Number(rect.attributes('x')) + Number(rect.attributes('width'))).toBeCloseTo(0.53, 6)
		expect(ty + Number(rect.attributes('y')) + Number(rect.attributes('height'))).toBeCloseTo(0.53, 6)
		// a sprite keeps its badge with the sign, over the piece's bottom right
		const knight = mount(VariantPiece, { props: { glyph: glyphOf(V, 'n', 0), size: 1, p: 0.5, unit: 1 / 90 } })
		expect(knight.find('.qc-vpiece__badge text').text()).toBe('50%')
	})
})
