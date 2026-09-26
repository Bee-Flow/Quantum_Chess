// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The computer and view helpers of the core, components and the game composable: the focus of a layout recentres
 * only when its key changes (U2), plain hidden squares (U10 c), the promoted marker (U13), outlines above the cells
 * (U15); in `useVariantGame` the binding attempts of an umpire (U10 d), the hidden hand-over (U10 f), no undo or
 * danger while a hidden game runs (U10 e), the own view (U10 b), compulsory captures (U8) and the resign hook (U12);
 * the game view with budget pips (U5), the variant's player text (U6), record lines (U9) and options (U11); and the
 * option description in the New game dialog (U11).
 */

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import VariantBoard from '../../../src/variantplay/components/VariantBoard.vue'
import VariantPiece from '../../../src/variantplay/components/VariantPiece.vue'
import VariantGameView from '../../../src/views/VariantGameView.vue'
import VariantsView from '../../../src/views/VariantsView.vue'
import { useVariantGame } from '../../../src/variantplay/composables/useVariantGame.js'
import { glyphOf } from '../../../src/variantplay/glyphs.js'
import { createVariantGame } from '../../../src/variantplay/variantGames.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import { newGame } from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { stateOf } from './helpers.js'

const registry = vi.hoisted(() => ({ variants: {} }))

vi.mock('../../../src/variants/index.js', async (importOriginal) => {
	const mod = await importOriginal()
	return { ...mod, loadVariant: async (id) => registry.variants[id] ?? mod.loadVariant(id) }
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

const V = orthodox('test-ui')

/**
 * The square index of a name.
 *
 * @param {string} name square name
 * @return {number}
 */
function sq(name) {
	return V.topology.byName(name)
}

/**
 * Mount a board.
 *
 * @param {object} variant variant
 * @param {object} state state
 * @param {object} [props] more props
 * @return {import('@vue/test-utils').VueWrapper}
 */
function board(variant, state, props = {}) {
	return mount(VariantBoard, { props: { variant, state, ...props }, attachTo: document.body })
}

/**
 * Start a stored game and its composable (with the curtain of hidden pass & play lifted).
 *
 * @param {object} variant variant
 * @param {object} initial start state
 * @param {string[]} kinds `human` or `computer` per side
 * @return {Promise<object>} the game API
 */
async function startGame(variant, initial, kinds = ['human', 'human']) {
	const rec = createVariantGame({
		variant: variant.id,
		options: {},
		players: kinds.map((kind) => (kind === 'human' ? { kind } : { kind, level: 'easy' })),
		initial,
	})
	const game = useVariantGame(rec.id)
	await game.load()
	// hidden pass & play starts behind the curtain: the first player shows their board
	game.curtain.value = false
	return game
}

beforeEach(() => {
	localStorage.clear()
})

afterEach(() => {
	document.body.innerHTML = ''
})

describe('U2: the focus of a layout', () => {
	const F = orthodox('test-focus', {
		layoutOf(state) {
			const layout = { ...F.topology.layout, zoomable: true, focus: { x: 2, y: 6, zoom: 2, key: state.fk } }
			return { ...F.topology, layout }
		},
	})

	it('recentres on mount and when the key changes, not for an equal new focus object', async () => {
		const s = newGame(F)
		const w = board(F, { ...s, fk: 'a' })
		const svg = () => w.find('svg.qc-vboard').attributes('viewBox')
		const start = svg()
		expect(start).not.toBe('-0.7 -0.7 9.4 9.4')
		await w.find('button[aria-label="Zoom in"]').trigger('click')
		const zoomed = svg()
		expect(zoomed).not.toBe(start)
		await w.setProps({ state: { ...s, fk: 'a' } })
		expect(svg()).toBe(zoomed)
		await w.setProps({ state: { ...s, fk: 'b' } })
		expect(svg()).toBe(start)
	})

	it('compares a focus without a key by its point and zoom', async () => {
		const G = orthodox('test-focus-nokey', {
			layoutOf(state) {
				const focus = { x: state.fx, y: 6, zoom: 2 }
				return { ...G.topology, layout: { ...G.topology.layout, zoomable: true, focus } }
			},
		})
		const s = newGame(G)
		const w = board(G, { ...s, fx: 2 })
		const svg = () => w.find('svg.qc-vboard').attributes('viewBox')
		const start = svg()
		await w.find('button[aria-label="Zoom in"]').trigger('click')
		const zoomed = svg()
		await w.setProps({ state: { ...s, fx: 2 } })
		expect(svg()).toBe(zoomed)
		await w.setProps({ state: { ...s, fx: 6 } })
		expect(svg()).not.toBe(zoomed)
		expect(svg()).not.toBe(start)
	})
})

describe('U10(c): hidden squares', () => {
	const s = stateOf(V, [[{ e1: '0:k', e8: '1:k' }, 1]])

	it('are fog by default', () => {
		const w = board(V, s, { hidden: new Set([sq('e8')]), viewer: 0 })
		expect(w.find('[data-square="e8"]').classes()).toContain('qc-vboard__cell--fog')
		expect(w.find('[data-square="e8"] .qc-vboard__hatch').exists()).toBe(true)
	})

	it('look like ordinary squares with the plain style, and keep their accessible name', () => {
		const P = orthodox('test-plain', { hidden: true, hiddenStyle: 'plain' })
		const w = board(P, stateOf(P, [[{ e1: '0:k', e8: '1:k' }, 1]]), { hidden: new Set([sq('e8')]), viewer: 0 })
		expect(w.findAll('.qc-vboard__cell--fog')).toHaveLength(0)
		expect(w.findAll('.qc-vboard__hatch')).toHaveLength(0)
		expect(w.find('[data-square="e8"] use').exists()).toBe(false)
		expect(w.find('[data-square="e8"]').attributes('aria-label')).toBe('e8: hidden')
	})
})

describe('U13: the promoted marker', () => {
	it('is drawn on a promoted sprite piece only', () => {
		const W = orthodox('test-promoted', {
			types: { ...orthodoxSpec().types, '+q': { moves: [], value: 900, glyph: { sprite: 'q', promoted: true } } },
		})
		const on = mount(VariantPiece, { props: { glyph: glyphOf(W, '+q', 0), size: 1 } })
		const marker = on.find('.qc-vpiece__promoted')
		expect(marker.exists()).toBe(true)
		expect(marker.find('circle').attributes('fill')).toBe('#b71c1c')
		expect(Number(marker.find('circle').attributes('r'))).toBeCloseTo(0.11)
		const off = mount(VariantPiece, { props: { glyph: glyphOf(W, 'q', 0), size: 1 } })
		expect(off.find('.qc-vpiece__promoted').exists()).toBe(false)
	})
})

describe('U15: layout outlines', () => {
	it('are drawn after the cells', () => {
		const O = orthodox('test-outline', {})
		O.topology = { ...O.topology, layout: { ...O.topology.layout, outlines: [{ x1: 3, y1: 3, x2: 5, y2: 3 }] } }
		const w = board(O, newGame(O))
		const outlines = w.findAll('.qc-vboard__outline')
		expect(outlines).toHaveLength(1)
		const svg = w.find('svg.qc-vboard').element
		const children = [...svg.children]
		const lastCell = children.findLastIndex((el) => el.classList.contains('qc-vboard__cell'))
		expect(children.indexOf(outlines[0].element)).toBeGreaterThan(lastCell)
	})
})

describe('useVariantGame', () => {
	// a Black knight on d5 or b6: e4-d5 is a roll (miss or capture)
	const ghost = (W) => stateOf(W, [
		[{ e1: '0:k', e4: '0:p', e8: '1:k', d5: '1:n' }, 1],
		[{ e1: '0:k', e4: '0:p', e8: '1:k', b6: '1:n' }, 1],
	])

	it('asks to confirm a move that rolls', async () => {
		const game = await startGame(V, ghost(V))
		game.attempt('e4-d5')
		expect(game.pending.value?.code).toBe('e4-d5')
		expect(game.state.value.history).toHaveLength(0)
	})

	it('(U10 d, f) plays an umpire attempt at once, holding the mover\'s view until the device is passed', async () => {
		const K = orthodox('test-umpire', {
			hidden: true,
			umpire: true,
			visibility(state, side) {
				const out = new Set()
				for (const { b } of state.worlds) {
					b.board.forEach((id, square) => id >= 0 && b.sd[id] === side && out.add(square))
				}
				return out
			},
		})
		const game = await startGame(K, ghost(K))
		expect(game.viewer.value).toBe(0)
		game.attempt('e4-d5')
		expect(game.pending.value).toBeNull()
		expect(game.state.value.history).toHaveLength(1)
		expect(game.state.value.turn).toBe(1)
		expect(game.lastRoll.value.side).toBe(0)
		expect(game.handover.value).toEqual(expect.objectContaining({ side: 0, code: 'e4-d5' }))
		expect(game.viewer.value).toBe(0)
		expect(game.curtain.value).toBe(false)
		game.click(sq('e8'))
		expect(game.sel.value).toEqual([])
		game.passDevice()
		expect(game.handover.value).toBeNull()
		expect(game.curtain.value).toBe(true)
		expect(game.viewer.value).toBe(1)
	})

	it('(U10 d) records a refused umpire attempt and says why', async () => {
		const K = orthodox('test-umpire-refused', { hidden: true, umpire: true, visibility: () => new Set() })
		const game = await startGame(K, ghost(K))
		game.attempt('e4-e6')
		expect(game.notice.value).toEqual({ kind: 'umpire', code: 'e4-e6' })
		expect(game.refused.value).toEqual(['e4-e6'])
		game.attempt('e4-e5')
		expect(game.refused.value).toEqual([])
	})

	it('(U10 e) offers no undo and no danger while a hidden game runs', async () => {
		const H = orthodox('test-hidden', { hidden: true, visibility: () => new Set() })
		const s = stateOf(H, [[{ e1: '0:k', a2: '0:p', e8: '1:k', e5: '1:r' }, 1]])
		const game = await startGame(H, s)
		expect(game.secret.value).toBe(true)
		expect(game.danger.value).toBe(0)
		game.attempt('a2-a3')
		expect(game.state.value.history).toHaveLength(1)
		game.passDevice()
		game.curtain.value = false
		expect(game.thinking.value).toBe(false)
		expect(game.canUndo.value).toBe(false)
		const open = await startGame(V, stateOf(V, [[{ e1: '0:k', a2: '0:p', e8: '1:k', e5: '1:r' }, 1]]))
		expect(open.danger.value).toBe(1)
		open.attempt('a2-a3')
		expect(open.canUndo.value).toBe(true)
	})

	it('(U10 a, b) selects and marks only the viewer\'s pieces, on the own view', async () => {
		const views = []
		const K = orthodox('test-own', {
			hidden: true,
			visibility: () => new Set(),
			ownView(state, side) {
				views.push(side)
				return state
			},
		})
		const s = stateOf(K, [
			[{ e1: '0:k', g1: '0:n', e8: '1:k', d5: '1:n' }, 1],
			[{ e1: '0:k', g1: '0:n', e8: '1:k', b6: '1:n' }, 1],
		])
		const game = await startGame(K, s)
		game.setMode('merge')
		game.click(sq('d5'))
		expect(game.sel.value).toEqual([])
		expect(game.notice.value).toEqual({ kind: 'noMerge' })
		game.setMode('split')
		game.click(sq('g1'))
		expect(game.sel.value).toEqual([sq('g1')])
		expect(Object.keys(game.marks.value).map(Number)).toContain(sq('f3'))
		expect(views.length).toBeGreaterThan(0)
		const before = views.length
		game.click(sq('f3'))
		expect(game.marks.value[sq('f3')]).toContain('pick')
		expect(views.length).toBe(before)
	})

	it('(U8) keeps Split and Measure off while a capture is compulsory', async () => {
		const A = orthodox('test-must', {
			compulsoryCapture: true,
			filterMoves(w, side, list) {
				const captures = list.filter((m) => m.capture >= 0)
				return captures.length ? captures : list
			},
		})
		const s = stateOf(A, [[{ e1: '0:k', a1: '0:r', c2: '0:p', e8: '1:k', a8: '1:n' }, 1]])
		const game = await startGame(A, s)
		expect(game.compulsory.value).toBe(true)
		game.setMode('split')
		expect(game.mode.value).toBe('move')
		game.setMode('measure')
		expect(game.mode.value).toBe('move')
		game.setMode('merge')
		expect(game.mode.value).toBe('merge')
	})

	it('(U12) resigns with the variant\'s result', async () => {
		const R = orthodox('test-resign', {
			resignResult: (state, loser) => ({ winner: null, winners: [1 - loser], reason: 'resign' }),
		})
		const game = await startGame(R, newGame(R))
		game.resign()
		expect(game.state.value.result).toEqual({ winner: null, winners: [1], reason: 'resign' })
	})

	it('(U1) marks the squares of the last move from the record', async () => {
		const game = await startGame(V, newGame(V))
		game.attempt('g1-f3|h3')
		const marks = game.marks.value
		for (const name of ['g1', 'f3', 'h3']) {
			expect(marks[sq(name)]).toContain('last')
		}
	})
})

/**
 * Mount the game view of a stored game.
 *
 * @param {object} variant variant
 * @param {object} initial start state
 * @param {object} [more] more record fields (`options`, `players`)
 * @return {Promise<import('@vue/test-utils').VueWrapper>}
 */
async function mountGame(variant, initial, more = {}) {
	const rec = createVariantGame({
		variant: variant.id,
		options: {},
		players: [{ kind: 'human' }, { kind: 'human' }],
		initial,
		...more,
	})
	const stub = { render: () => null }
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [
			{ path: '/variants', name: 'variants', component: stub },
			{ path: '/variants/:variant/:id', name: 'variant-game', component: stub },
		],
	})
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
 * @return {import('@vue/test-utils').DOMWrapper<HTMLButtonElement>}
 */
function button(w, text) {
	return w.findAll('button').find((b) => b.text() === text)
}

describe('VariantGameView', () => {
	it('(U5, U10 e, f) hides the other budget, undo and the danger, and hands over in two steps', async () => {
		const K = orthodox('test-view-hidden', {
			hidden: true,
			umpire: true,
			visibility(state, side) {
				const out = new Set()
				for (const { b } of state.worlds) {
					b.board.forEach((id, square) => id >= 0 && b.sd[id] === side && out.add(square))
				}
				return out
			},
		})
		// the bishop on h4 could take the king: an open game would show the danger line
		const s = stateOf(K, [
			[{ e1: '0:k', e4: '0:p', e8: '1:k', d5: '1:n', h4: '1:b' }, 1],
			[{ e1: '0:k', e4: '0:p', e8: '1:k', b6: '1:n', h4: '1:b' }, 1],
		])
		const w = await mountGame(K, s)
		expect(w.find('.qc-vgame__panel').exists()).toBe(false)
		await button(w, 'I am White: show my board').trigger('click')
		const rows = w.findAll('.qc-vgame__player')
		expect(rows[0].findAll('.qc-vgame__pip')).toHaveLength(8)
		// an empty track with a question mark, captioned like the known budgets
		expect(rows[1].find('.qc-vgame__budget--unknown .qc-vgame__unknown-track').text()).toBe('?')
		expect(rows[1].find('.qc-vgame__budget--unknown .qc-vgame__budget-count').text()).toBe('Budget hidden')
		expect(rows[1].findAll('.qc-vgame__pip')).toHaveLength(0)
		expect(w.find('.qc-vgame__danger').exists()).toBe(false)
		expect(button(w, 'Undo').attributes('disabled')).toBeDefined()
		await w.find('[data-square="e4"]').trigger('click')
		await w.find('[data-square="d5"]').trigger('click')
		expect(w.find('.qc-vgame__box--pending').exists()).toBe(false)
		// in the move list's notation: x for a capture
		expect(w.find('.qc-vgame__box--handover').text()).toMatch(/^Your move: e4(-d5 · Missed|xd5 · Captured)/)
		expect(w.find('.qc-vgame__box--roll').exists()).toBe(false)
		await button(w, 'Pass the device').trigger('click')
		expect(w.find('.qc-vgame__panel').exists()).toBe(false)
		expect(w.find('.qc-vgame__curtain').text()).toContain('Pass the device to Black.')
		w.unmount()
	})

	it('(U8) says that a capture is compulsory and turns Split and Measure off', async () => {
		const A = orthodox('test-view-must', {
			compulsoryCapture: true,
			filterMoves(b, side, list) {
				const captures = list.filter((m) => m.capture >= 0)
				return captures.length ? captures : list
			},
		})
		const w = await mountGame(A, stateOf(A, [[{ e1: '0:k', a1: '0:r', e8: '1:k', a8: '1:n' }, 1]]))
		expect(w.find('.qc-vgame__compulsory').text())
			.toBe('You must capture: only moves that might capture are allowed.')
		for (const name of ['Split', 'Measure']) {
			const b = button(w, name)
			expect(b.attributes('disabled')).toBeDefined()
			expect(b.element.parentElement.getAttribute('title')).toBe('Not now: a capture is compulsory.')
		}
		expect(button(w, 'Merge').attributes('disabled')).toBeUndefined()
		w.unmount()
	})

	it('(U6, U9, U11, U5) shows the player text, the record lines, the options and the budget limit', async () => {
		const I = orthodox('test-view-info', {
			options: [{
				id: 'pos',
				type: 'number',
				label: () => 'Start position',
				min: 0,
				max: 959,
				default: 518,
				describe: (v) => 'Position ' + v,
			}],
			budgetRule: () => ({ limit: 4 }),
			sideInfo: (state, side) => ({ text: 'Checks: ' + side, title: 'Checks given' }),
			infoText: (record) => ['Info of ' + record.code],
		})
		const w = await mountGame(I, newGame(I), { options: { pos: 7 } })
		expect(w.find('.qc-vgame__options').text()).toBe('Start position: Position 7')
		const rows = w.findAll('.qc-vgame__player')
		expect(rows[1].find('.qc-vgame__side-info').text()).toBe('Checks: 1')
		expect(rows[1].find('.qc-vgame__side-info').attributes('title')).toBe('Checks given')
		expect(rows[0].findAll('.qc-vgame__pip')).toHaveLength(4)
		expect(rows[0].find('.qc-vgame__budget').attributes('title')).toBe('Quantum budget: 1 of 4')
		await w.find('[data-square="e2"]').trigger('click')
		await w.find('[data-square="e4"]').trigger('click')
		expect(w.find('.qc-vgame__move-line').text()).toBe('Info of e2-e4')
		expect(w.find('.qc-vgame__box--report').text()).toBe('Info of e2-e4')
		expect(w.find('[data-square="e2"]').classes()).toContain('qc-vboard__cell--last')
		w.unmount()
	})
})

describe('VariantsView', () => {
	it('(U11) describes the chosen option value in the New game dialog', async () => {
		orthodox('chess960', {
			options: [{
				id: 'pos',
				type: 'number',
				label: () => 'Start position',
				min: 0,
				max: 959,
				default: 518,
				describe: (v) => (v === 518 ? 'RNBQKBNR' : 'Back rank ' + v),
			}],
		})
		const stub = { render: () => null }
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/variants', name: 'variants', component: stub },
				{ path: '/variants/:variant/:id', name: 'variant-game', component: stub },
				{ path: '/new', name: 'new-game', component: stub },
			],
		})
		router.push('/variants')
		await router.isReady()
		const w = mount(VariantsView, { global: { plugins: [router] }, attachTo: document.body })
		await w.find('[data-test="variant-chess960"]').trigger('click')
		await flushPromises()
		const describe = () => document.querySelector('[data-test="option-describe-pos"]')?.textContent.trim()
		await vi.waitFor(() => expect(describe()).toBe('RNBQKBNR'), { timeout: 3000, interval: 5 })
		const input = document.querySelector('input[type="number"]')
		input.value = '12'
		input.dispatchEvent(new Event('input'))
		await flushPromises()
		expect(describe()).toBe('Back rank 12')
		input.value = '5000'
		input.dispatchEvent(new Event('input'))
		await flushPromises()
		expect(describe()).toBeUndefined()
		w.unmount()
	})
})
