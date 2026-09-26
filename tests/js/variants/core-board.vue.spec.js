// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The generic board and view features added for multiverse chess, on inline test variants: the
 * move warning (H4), the history record in the move list (H5), the focus box, the lifted zoom cap, touch panning and
 * the pinch (H6), Split and Measure checked against the variant (H7), undo with one replay (H9), the black view
 * preselected against the computer (H10), the variant's last-move marks (H11), no "Flip board" (H12), threat
 * outlines (H13) and the notice of a failed save. Then the phone fixes of the visual review: readable badges and the
 * probability ring, the fitted drawing, the hands at the board, the header outside the panel and hidden moves in
 * words.
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
import {
	createVariantGame,
	listVariantGames,
	loadVariantGame,
	saveVariantGame,
} from '../../../src/variantplay/variantGames.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import { applyOutcome, newGame } from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import crazyhouse from '../../../src/variants/crazyhouse.js'
import { play, stateOf } from './helpers.js'

const registry = vi.hoisted(() => ({ variants: {}, replays: { count: 0 }, saveFails: false }))

vi.mock('../../../src/variantplay/variantGames.js', async (importOriginal) => {
	const mod = await importOriginal()
	// a full browser storage: the record is not saved
	return { ...mod, saveVariantGame: (rec) => (registry.saveFails ? false : mod.saveVariantGame(rec)) }
})

vi.mock('../../../src/variants/index.js', async (importOriginal) => {
	const mod = await importOriginal()
	return {
		...mod,
		loadVariant: async (id) => registry.variants[id] ?? mod.loadVariant(id),
		// counts the moves replayed by undo
		applyOutcome: (...args) => {
			registry.replays.count++
			return mod.applyOutcome(...args)
		},
	}
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

const V = orthodox('test-board')

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
 * Store a game on this device.
 *
 * @param {object} variant variant
 * @param {object} initial start state
 * @param {object} [more] `kinds` (`human` or `computer` per side), `moves` already played (outcome 0 each)
 * @return {object} the record
 */
function store(variant, initial, { kinds = ['human', 'human'], moves = [] } = {}) {
	const rec = createVariantGame({
		variant: variant.id,
		options: {},
		players: kinds.map((kind) => (kind === 'human' ? { kind } : { kind, level: 'easy' })),
		initial,
	})
	if (moves.length) {
		let s = initial
		for (const code of moves) {
			s = applyOutcome(variant, s, code, 0)
		}
		saveVariantGame({ ...rec, moves: moves.map((code) => ({ code, i: 0 })), current: s })
	}
	return rec
}

/**
 * Start a stored game and its composable.
 *
 * @param {object} variant variant
 * @param {object} initial start state
 * @param {object} [more] see `store`
 * @return {Promise<object>} the game API
 */
async function startGame(variant, initial, more = {}) {
	const game = useVariantGame(store(variant, initial, more).id)
	await game.load()
	return game
}

/**
 * Mount the game view of a stored game.
 *
 * @param {object} variant variant
 * @param {object} initial start state
 * @param {object} [more] see `store`
 * @return {Promise<import('@vue/test-utils').VueWrapper>}
 */
async function mountGame(variant, initial, more = {}) {
	const rec = store(variant, initial, more)
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
 * @return {import('@vue/test-utils').DOMWrapper<HTMLButtonElement>|undefined}
 */
function button(w, text) {
	return w.findAll('button').find((b) => b.text() === text)
}

/**
 * Click a square of a mounted view or board.
 *
 * @param {import('@vue/test-utils').VueWrapper} w wrapper
 * @param {string} name square name
 */
async function click(w, name) {
	await w.find(`[data-square="${name}"]`).trigger('click')
}

/**
 * The squares of a view that carry a mark class.
 *
 * @param {import('@vue/test-utils').VueWrapper} w wrapper
 * @param {string} mark mark name
 * @return {string[]}
 */
function marked(w, mark) {
	return w.findAll('.qc-vboard__cell--' + mark).map((e) => e.attributes('data-square')).sort()
}

/**
 * Mount a board, with its drawing measured as `width` × `height` CSS pixels on screen.
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
 * A variant whose layout is a large drawing (`width` × `height` units) with the 8 × 8 cells in its corner and a focus.
 *
 * @param {string} id variant id
 * @param {number} width layout width
 * @param {number} height layout height
 * @param {object|null} focus the layout's focus
 * @return {object}
 */
function wide(id, width, height, focus) {
	const L = orthodox(id, {
		layoutOf() {
			return { ...L.topology, layout: { ...L.topology.layout, width, height, zoomable: true, focus } }
		},
	})
	return L
}

beforeEach(() => {
	localStorage.clear()
	registry.replays.count = 0
	registry.saveFails = false
})

afterEach(() => {
	vi.restoreAllMocks()
	document.body.innerHTML = ''
})

describe('H4: moveWarning', () => {
	const W = orthodox('test-board-warn', {
		moveWarning: (state, code) => (code === 'e2-e4' || code === 'e4-d5' ? 'After this move you lose' : null),
	})

	it('asks for confirmation of a certain move with the warning, and plays it only when confirmed', async () => {
		const game = await startGame(W, newGame(W))
		game.attempt('e2-e4')
		expect(game.pending.value).toEqual({
			code: 'e2-e4',
			outcomes: [],
			warning: 'After this move you lose',
			type: 'p',
			capture: false,
		})
		expect(game.state.value.history).toHaveLength(0)
		game.cancel()
		expect(game.pending.value).toBeNull()
		game.attempt('e2-e4')
		game.confirm()
		expect(game.state.value.history.map((h) => h.code)).toEqual(['e2-e4'])
		// a move without a warning is played at once
		game.attempt('e7-e5')
		expect(game.pending.value).toBeNull()
		expect(game.state.value.history).toHaveLength(2)
	})

	it('shows the warning in the roll box beside the odds of a move that rolls', async () => {
		const s = stateOf(W, [
			[{ e1: '0:k', e4: '0:p', e8: '1:k', d5: '1:n' }, 1],
			[{ e1: '0:k', e4: '0:p', e8: '1:k', b6: '1:n' }, 1],
		])
		const w = await mountGame(W, s)
		await click(w, 'e4')
		await click(w, 'd5')
		const box = w.find('.qc-vgame__box--pending')
		expect(box.classes()).toContain('qc-vgame__box--warning')
		expect(box.find('.qc-vgame__warning').text()).toBe('After this move you lose')
		expect(box.findAll('.qc-vgame__outcomes li')).toHaveLength(2)
		expect(button(w, 'Play and roll')).toBeDefined()
		w.unmount()
	})

	it('offers "Play anyway" for a certain move and plays it', async () => {
		const w = await mountGame(W, newGame(W))
		await click(w, 'e2')
		await click(w, 'e4')
		expect(w.find('.qc-vgame__warning').text()).toBe('After this move you lose')
		expect(w.find('.qc-vgame__outcomes').exists()).toBe(false)
		await button(w, 'Play anyway').trigger('click')
		await flushPromises()
		expect(w.find('.qc-vgame__box--pending').exists()).toBe(false)
		expect(w.find('.qc-vgame__code').text()).toBe('e2-e4')
		w.unmount()
	})
})

describe('H5: the move list writes a code with its record', () => {
	it('passes each history record to codeText', async () => {
		const C = orthodox('test-board-codetext', {
			codeText: (code, record) => (record ? code + ' by ' + (record.side === 0 ? 'White' : 'Black') : null),
		})
		const w = await mountGame(C, newGame(C), { moves: ['e2-e4', 'e7-e5'] })
		expect(w.findAll('.qc-vgame__code').map((e) => e.text())).toEqual(['e2-e4 by White', 'e7-e5 by Black'])
		w.unmount()
	})
})

describe('H6: focus box, zoom cap, touch panning and pinch', () => {
	it('fits the focus box and zooms to at least 28 px per unit on a touch screen', async () => {
		const F = wide('test-board-box', 40, 40, { x: 20, y: 20, zoom: 2, key: 'k', box: { w: 10, h: 10 } })
		pointer(false)
		const fine = await measuredBoard(F, newGame(F))
		const full = viewBox(fine)[2] * 2
		fine.unmount()
		pointer(true)
		const touch = await measuredBoard(F, newGame(F))
		const [, , w] = viewBox(touch)
		expect(360 / w).toBeCloseTo(28, 1)
		expect(w).toBeLessThan(full / 2)
		touch.unmount()
		// without a zoom of its own the focus fits its box
		const B = wide('test-board-box-fit', 40, 40, { x: 20, y: 20, key: 'k', box: { w: 12, h: 12 } })
		pointer(false)
		const fit = await measuredBoard(B, newGame(B))
		expect(viewBox(fit)[2]).toBeCloseTo(12, 1)
		fit.unmount()
	})

	it('lifts the zoom cap of a wide layout up to 40 px per unit', async () => {
		pointer(false)
		const L = wide('test-board-cap', 157, 60, null)
		const w = await measuredBoard(L, newGame(L), {}, 360, 140)
		for (let i = 0; i < 12; i++) {
			await w.find('button[aria-label="Zoom in"]').trigger('click')
		}
		expect(w.find('button[aria-label="Zoom in"]').attributes('disabled')).toBeDefined()
		const [, , vw] = viewBox(w)
		expect(360 / vw).toBeCloseTo(40, 0)
		// the old cap of 8 would have left about 18 px per unit
		expect(360 / vw).toBeGreaterThan(30)
		w.unmount()
	})

	it('lets the page scroll at zoom 1 and takes every touch gesture while zoomed', async () => {
		pointer(false)
		const L = wide('test-board-touch', 30, 30, null)
		const w = await measuredBoard(L, newGame(L))
		const svg = w.find('svg.qc-vboard')
		expect(svg.element.style.touchAction).toBe('pan-x pan-y')
		await w.find('button[aria-label="Zoom in"]').trigger('click')
		expect(svg.element.style.touchAction).toBe('none')
		w.unmount()
		const small = await measuredBoard(V, newGame(V))
		expect(small.find('svg.qc-vboard').element.style.touchAction).toBe('manipulation')
		small.unmount()
	})

	it('pans with one finger (the click that ends the pan is not a move) and pinches around the midpoint', async () => {
		pointer(true)
		const L = wide('test-board-pinch', 30, 30, null)
		const w = await measuredBoard(L, newGame(L))
		await w.find('button[aria-label="Zoom in"]').trigger('click')
		const svg = w.find('svg.qc-vboard')
		const start = viewBox(w)
		const touch = (type, id, x, y, primary = id === 1) => svg.trigger(type, {
			pointerId: id,
			pointerType: 'touch',
			isPrimary: primary,
			clientX: x,
			clientY: y,
			button: 0,
		})
		await touch('pointerdown', 1, 200, 200)
		await touch('pointermove', 1, 150, 180)
		await touch('pointerup', 1, 150, 180)
		const panned = viewBox(w)
		expect(panned[0]).toBeGreaterThan(start[0])
		expect(panned[2]).toBeCloseTo(start[2], 6)
		await click(w, 'a1')
		expect(w.emitted('square')).toBeUndefined()
		await click(w, 'a1')
		expect(w.emitted('square')).toEqual([[sq('a1')]])
		// the layout point under the midpoint of the fingers stays there while they spread
		const under = (v, x, y) => {
			const scale = Math.min(360 / v[2], 360 / v[3])
			return [v[0] + (x - (360 - v[2] * scale) / 2) / scale, v[1] + (y - (360 - v[3] * scale) / 2) / scale]
		}
		const before = viewBox(w)
		const anchor = under(before, 180, 180)
		await touch('pointerdown', 1, 150, 180)
		await touch('pointerdown', 2, 210, 180, false)
		await touch('pointermove', 2, 270, 180, false)
		await touch('pointermove', 1, 90, 180)
		const pinched = viewBox(w)
		expect(pinched[2]).toBeCloseTo(before[2] / 3, 4)
		const after = under(pinched, 180, 180)
		expect(after[0]).toBeCloseTo(anchor[0], 3)
		expect(after[1]).toBeCloseTo(anchor[1], 3)
		// one finger lifted: the other goes on panning without a jump
		await touch('pointerup', 2, 270, 180, false)
		await touch('pointermove', 1, 100, 180)
		const moved = viewBox(w)
		expect(moved[2]).toBeCloseTo(pinched[2], 6)
		expect(moved[0]).toBeLessThan(pinched[0])
		await touch('pointerup', 1, 100, 180)
		w.unmount()
	})
})

describe('H7: Split and Measure follow the variant\'s allowQuantum', () => {
	// splits only within one half of the board: both targets on ranks 1 to 4 or both on 5 to 8
	const half = (s) => (Math.floor(s / 8) < 4 ? 0 : 1)
	const Q = orthodox('test-board-allow', {
		allowQuantum(state, action) {
			if (action.type === 'split') {
				return half(action.to[0]) === half(action.to[1])
			}
			// a ghost may be measured only from h3
			return action.type !== 'measure' || action.from[0] === sq('h3')
		},
	})

	it('marks only the second targets that make a legal split with the first', async () => {
		const s = stateOf(Q, [[{ e1: '0:k', d4: '0:n', e8: '1:k' }, 1]])
		const game = await startGame(Q, s)
		game.setMode('split')
		game.click(sq('d4'))
		const targets = () => Object.entries(game.marks.value).filter(([, m]) => m.includes('target'))
			.map(([k]) => Q.topology.names[k]).sort()
		expect(targets()).toEqual(['b3', 'b5', 'c2', 'c6', 'e2', 'e6', 'f3', 'f5'])
		game.click(sq('b3'))
		expect(targets()).toEqual(['c2', 'e2', 'f3'])
		// a target of the piece that makes no legal split with b3 is not taken
		game.click(sq('b5'))
		expect(game.sel.value).toEqual([])
		expect(game.state.value.history).toHaveLength(0)
		game.click(sq('d4'))
		game.click(sq('b3'))
		game.click(sq('f3'))
		expect(game.state.value.history.map((h) => h.code)).toEqual(['d4-b3|f3'])
	})

	it('measures only a part the variant allows, from the tapped square', async () => {
		const s = stateOf(Q, [
			[{ e1: '0:k', f3: '0:n', e8: '1:k' }, 1],
			[{ e1: '0:k', h3: '0:n', e8: '1:k' }, 1],
		])
		const game = await startGame(Q, s)
		game.setMode('measure')
		game.click(sq('f3'))
		// a part of one of the player's own ghosts: the notice says that the square is the reason, not the piece
		expect(game.notice.value).toEqual({ kind: 'measureHere' })
		expect(game.pending.value).toBeNull()
		game.click(sq('e8'))
		expect(game.notice.value).toEqual({ kind: 'noMeasure' })
		game.click(sq('h3'))
		expect(game.notice.value).toBeNull()
		expect(game.pending.value?.code).toBe('?h3')
	})
})

describe('H9: undo', () => {
	it('takes back the computer\'s answer and the human\'s move with one replay', async () => {
		const game = await startGame(V, newGame(V), {
			kinds: ['human', 'computer'],
			moves: ['e2-e4', 'e7-e5', 'd2-d4', 'd7-d5'],
		})
		expect(game.canUndo.value).toBe(true)
		registry.replays.count = 0
		game.undo()
		expect(game.record.value.moves.map((m) => m.code)).toEqual(['e2-e4', 'e7-e5'])
		expect(game.state.value.turn).toBe(0)
		expect(registry.replays.count).toBe(2)
	})

	it('takes back a whole computer turn of several moves', async () => {
		const base = orthodoxSpec().afterMove
		// Black moves twice in a row: `x.k` counts the moves, and after the first of Black's two it is Black again
		const M = orthodox('test-board-multi', {
			afterMove(next, m, prev) {
				base(next, m, prev)
				next.x = { ...next.x, k: (prev.x.k ?? 0) + 1 }
			},
			nextSide: (b, side) => (side === 0 || b.x.k % 3 === 2 ? 1 : 0),
		})
		const moves = ['e2-e4', 'e7-e5', 'd7-d6', 'd2-d4', 'g8-f6', 'b8-c6']
		const game = await startGame(M, newGame(M), { kinds: ['human', 'computer'], moves })
		expect(game.state.value.history.map((h) => h.side)).toEqual([0, 1, 1, 0, 1, 1])
		expect(game.state.value.turn).toBe(0)
		registry.replays.count = 0
		game.undo()
		expect(game.record.value.moves.map((m) => m.code)).toEqual(['e2-e4', 'e7-e5', 'd7-d6'])
		expect(game.state.value.turn).toBe(0)
		expect(registry.replays.count).toBe(3)
	})

	it('is not offered when only the computer has moved', async () => {
		const game = await startGame(V, newGame(V), { kinds: ['computer', 'human'], moves: ['e2-e4'] })
		expect(game.canUndo.value).toBe(false)
		game.undo()
		expect(game.record.value.moves).toHaveLength(1)
	})
})

describe('H10: the view option in the New game dialog', () => {
	/**
	 * Mount the variants page and open the New game dialog of the multiverse tile.
	 *
	 * @return {Promise<import('@vue/test-utils').VueWrapper>}
	 */
	async function openDialog() {
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
		await w.find('[data-test="variant-multiverse"]').trigger('click')
		await flushPromises()
		const sides = () => document.querySelector('input[name="qc-variant-side"]')
		await vi.waitFor(() => expect(sides()).not.toBeNull(), { timeout: 3000, interval: 5 })
		return w
	}

	/**
	 * Choose a radio button of the dialog.
	 *
	 * @param {string} name radio group
	 * @param {string} value value
	 */
	async function choose(name, value) {
		const input = document.querySelector(`input[name="${name}"][value="${value}"]`)
		input.checked = true
		input.dispatchEvent(new Event('change'))
		await flushPromises()
	}

	/**
	 * The chosen view.
	 *
	 * @return {string|undefined}
	 */
	const view = () => document.querySelector('input[name="qc-variant-option-view"]:checked')?.value

	it('preselects the black view when the human plays Black against the computer', async () => {
		orthodox('multiverse', {
			options: [{
				id: 'view',
				type: 'choice',
				label: () => 'View',
				default: 'white',
				values: [
					{ id: 'white', label: () => 'White at the bottom' },
					{ id: 'black', label: () => 'Black at the bottom' },
				],
			}],
		})
		const w = await openDialog()
		expect(view()).toBe('white')
		await choose('qc-variant-side', '1')
		expect(view()).toBe('black')
		await choose('qc-variant-side', '0')
		expect(view()).toBe('white')
		await choose('qc-variant-side', '1')
		await choose('qc-variant-opponent', 'local')
		expect(view()).toBe('white')
		await choose('qc-variant-opponent', 'computer')
		expect(view()).toBe('black')
		// the player may still choose another view
		await choose('qc-variant-option-view', 'white')
		expect(view()).toBe('white')
		await choose('qc-variant-option-view', 'black')
		document.querySelector('form.qc-variants__form').dispatchEvent(new Event('submit'))
		await flushPromises()
		const saved = loadVariantGame(listVariantGames()[0].id)
		expect(saved.options.view).toBe('black')
		expect(saved.players.map((p) => p.kind)).toEqual(['computer', 'human'])
		w.unmount()
	})

	it('leaves a variant without such an option alone', async () => {
		orthodox('multiverse', {
			options: [{
				id: 'view',
				type: 'choice',
				label: () => 'View',
				default: 'a',
				values: [{ id: 'a', label: () => 'A' }],
			}],
		})
		const w = await openDialog()
		await choose('qc-variant-side', '1')
		expect(view()).toBe('a')
		w.unmount()
	})
})

describe('H11: the variant\'s last-move marks on the board', () => {
	it('marks the squares of lastMoveMarks instead of the last record\'s', async () => {
		const L = orthodox('test-board-last', {
			lastMoveMarks: (state) => (state.history.length ? [sq('a1'), sq('h8')] : []),
		})
		const w = await mountGame(L, newGame(L))
		expect(marked(w, 'last')).toEqual([])
		await click(w, 'e2')
		await click(w, 'e4')
		expect(marked(w, 'last')).toEqual(['a1', 'h8'])
		w.unmount()
	})
})

describe('H12: flipBoard: false', () => {
	it('hides "Flip board" and keeps the rotation', async () => {
		const N = orthodox('test-board-noflip', { flipBoard: false })
		const w = await mountGame(N, newGame(N))
		expect(button(w, 'Flip board')).toBeUndefined()
		w.unmount()
		const game = await startGame(N, newGame(N))
		game.flipped.value = true
		expect(game.rotation.value).toBe(0)
		const other = await startGame(V, newGame(V))
		other.flipped.value = true
		expect(other.rotation.value).toBe(180)
		const view = await mountGame(V, newGame(V))
		expect(button(view, 'Flip board')).toBeDefined()
		view.unmount()
	})
})

describe('H13: threat outlines', () => {
	it('draws an outline of kind threat in the danger class, above the cells', () => {
		const O = orthodox('test-board-threat')
		O.topology = {
			...O.topology,
			layout: {
				...O.topology.layout,
				outlines: [
					{ x1: 3, y1: 3, x2: 5, y2: 3, kind: 'threat' },
					{ x1: 1, y1: 1, x2: 2, y2: 2, kind: 'travel' },
					{ x1: 0, y1: 0, x2: 1, y2: 0 },
				],
			},
		}
		const props = { variant: O, state: newGame(O), rotation: 180 }
		const w = mount(VariantBoard, { props, attachTo: document.body })
		const outlines = w.findAll('.qc-vboard__outline')
		expect(outlines.map((o) => o.classes().includes('qc-vboard__outline--threat'))).toEqual([true, false, false])
		// turned with the board, and starting a little after the attacker's centre
		expect(Number(outlines[0].attributes('x1'))).toBeCloseTo(5 - 0.35, 6)
		// a travel arrow is a path with its own head
		expect(outlines[1].element.tagName.toLowerCase()).toBe('path')
		expect(outlines[1].classes()).toContain('qc-vboard__outline--travel')
		const children = [...w.find('svg.qc-vboard').element.children]
		const lastCell = children.findLastIndex((el) => el.classList.contains('qc-vboard__cell'))
		expect(children.indexOf(outlines[0].element)).toBeGreaterThan(lastCell)
		w.unmount()
	})
})

describe('a failed save', () => {
	it('tells the player that the game could not be saved, until a save works again', async () => {
		const w = await mountGame(V, newGame(V))
		expect(w.find('.qc-vgame__notice--save').exists()).toBe(false)
		registry.saveFails = true
		await click(w, 'e2')
		await click(w, 'e4')
		expect(w.find('.qc-vgame__notice--save').text()).toBe('This game could not be saved on this device.')
		expect(w.find('.qc-vgame__notice--save').attributes('role')).toBe('alert')
		registry.saveFails = false
		await click(w, 'e7')
		await click(w, 'e5')
		expect(w.find('.qc-vgame__notice--save').exists()).toBe(false)
		w.unmount()
	})
})

describe('the badges and the probability ring', () => {
	const glyph = glyphOf(V, 'n', 0)

	it('keeps the badge text at 11 px on a small board, without the % sign', () => {
		// 37 px per unit, a piece of 0.92 units: the natural text would be 6.8 px
		const unit = 1 / 37
		const w = mount(VariantPiece, { props: { glyph, size: 0.92, p: 0.5, unit } })
		const text = w.find('.qc-vpiece__badge text')
		expect(text.text()).toBe('50')
		expect(Number(text.attributes('font-size')) / unit).toBeCloseTo(11, 5)
		// the ring is at least 2 px wide on screen
		expect(Number(w.find('.qc-vpiece__arc').attributes('stroke-width')) / unit).toBeGreaterThanOrEqual(2 - 1e-9)
		// on a large board the badge scales with the piece and keeps its sign
		const big = mount(VariantPiece, { props: { glyph, size: 0.92, p: 0.25, unit: 1 / 90 } })
		expect(big.find('.qc-vpiece__badge text').text()).toBe('25%')
		expect(Number(big.find('.qc-vpiece__badge text').attributes('font-size'))).toBeCloseTo(0.184, 5)
		// a piece under 30 px gets a smaller badge (9.5 px), one under 24 px only its ring: a badge would cover it
		const small = mount(VariantPiece, { props: { glyph, size: 0.92, p: 0.5, unit: 1 / 30 } })
		expect(Number(small.find('.qc-vpiece__badge text').attributes('font-size')) * 30).toBeCloseTo(9.5, 5)
		const tiny = mount(VariantPiece, { props: { glyph, size: 0.92, p: 0.5, unit: 1 / 25 } })
		expect(tiny.find('.qc-vpiece__badge').exists()).toBe(false)
		expect(tiny.find('.qc-vpiece__arc').exists()).toBe(true)
	})

	it('draws the ring and the badge of a ghost above its fade, and nothing on a solid piece', () => {
		const ghost = mount(VariantPiece, { props: { glyph, size: 1, p: 0.5 } })
		expect(ghost.find('.qc-vpiece__arc').attributes('d')).toMatch(/^M 0 -0.48 A 0.48 0.48 0 0 1 /)
		expect(ghost.find('[opacity] .qc-vpiece__badge').exists()).toBe(false)
		expect(Number(ghost.find('[opacity]').attributes('opacity'))).toBeCloseTo(0.63, 5)
		const solid = mount(VariantPiece, { props: { glyph, size: 1, p: 1 } })
		expect(solid.find('.qc-vpiece__ring').exists()).toBe(false)
		expect(solid.find('.qc-vpiece__badge').exists()).toBe(false)
	})

	it('fades a piece in its side\'s own colour only a little', () => {
		const tinted = { ...glyph, tint: '#c62828' }
		const w = mount(VariantPiece, { props: { glyph: tinted, size: 1, p: 0.5 } })
		expect(Number(w.find('[opacity]').attributes('opacity'))).toBeCloseTo(0.9, 5)
	})

	it('are measured on the board: the pieces get the size of a CSS pixel', async () => {
		const s = play(V, newGame(V), 'g1-f3|h3')
		const w = await measuredBoard(V, s, {}, 350, 350)
		const [, , vw, vh] = viewBox(w)
		expect(w.find('[data-square="f3"] .qc-vpiece__badge text').text()).toBe('50')
		const font = Number(w.find('[data-square="f3"] .qc-vpiece__badge text').attributes('font-size'))
		expect(font * Math.min(350 / vw, 350 / vh)).toBeCloseTo(11, 5)
		w.unmount()
	})
})

describe('the drawing fits the board and its coordinates', () => {
	it('leaves no empty margin on the side without coordinates', () => {
		const w = mount(VariantBoard, { props: { variant: V, state: newGame(V) }, attachTo: document.body })
		const [x, y, vw, vh] = viewBox(w)
		// the rank numbers on the left and the file letters below, the board's own top and right edges
		expect(x).toBeLessThan(-0.5)
		expect(y).toBeCloseTo(-0.12, 5)
		expect(x + vw).toBeCloseTo(8.12, 5)
		expect(y + vh).toBeGreaterThan(8.5)
		expect(vw).toBeLessThan(9)
		const turned = mount(VariantBoard, { props: { variant: V, state: newGame(V), rotation: 180 } })
		const [tx, , tw] = viewBox(turned)
		expect(tx).toBeCloseTo(-0.12, 5)
		expect(tx + tw).toBeGreaterThan(8.5)
	})
})

describe('the hands of a drop variant', () => {
	it('are shown from the start, at the board: the opponent\'s above it and the viewer\'s below it', async () => {
		registry.variants.crazyhouse = crazyhouse
		const w = await mountGame(crazyhouse, newGame(crazyhouse))
		const hands = w.findAll('.qc-vgame__board .qc-vgame__hand')
		expect(hands.map((h) => h.text())).toEqual(['In hand: White', 'In hand: Black'])
		expect(hands.map((h) => h.classes().find((c) => /--(top|bottom)$/.test(c)))).toEqual([
			'qc-vgame__hand--bottom',
			'qc-vgame__hand--top',
		])
		expect(hands.every((h) => h.find('.qc-vgame__hand-empty').exists())).toBe(true)
		await button(w, 'Flip board').trigger('click')
		const flipped = w.findAll('.qc-vgame__hand').map((h) => h.classes().find((c) => /--(top|bottom)$/.test(c)))
		expect(flipped).toEqual(['qc-vgame__hand--top', 'qc-vgame__hand--bottom'])
		w.unmount()
	})
})

describe('the view', () => {
	it('keeps the title and the rules outside the panel, visible behind the curtain', async () => {
		const H = orthodox('test-board-hidden', {
			hidden: true,
			visibility(state, side) {
				const out = new Set()
				for (const { b } of state.worlds) {
					b.board.forEach((id, square) => id >= 0 && b.sd[id] === side && out.add(square))
				}
				return out
			},
		})
		const w = await mountGame(H, newGame(H))
		expect(w.find('.qc-vgame__curtain').exists()).toBe(true)
		expect(w.find('.qc-vgame__panel').exists()).toBe(false)
		expect(w.find('.qc-vgame__controls').exists()).toBe(false)
		expect(w.find('.qc-vgame__top .qc-vgame__head').exists()).toBe(true)
		await button(w, 'Rules').trigger('click')
		expect(w.find('.qc-vgame__rules').exists()).toBe(true)
		w.unmount()
	})

	it('writes the opponent\'s hidden move in words, not as a code', async () => {
		const H = orthodox('test-board-hidden-row', {
			hidden: true,
			visibility: (state, side) => new Set(state.worlds[0].b.board.flatMap((id, s) => (id >= 0
				&& state.worlds[0].b.sd[id] === side
				? [s]
				: []))),
		})
		const w = await mountGame(H, newGame(H), { kinds: ['human', 'computer'], moves: ['e2-e4', 'e7-e5'] })
		const rows = w.findAll('.qc-vgame__code')
		expect(rows.map((r) => r.text())).toEqual(['e2-e4', 'A move'])
		expect(rows.map((r) => r.classes().includes('qc-vgame__code--hidden'))).toEqual([false, true])
		w.unmount()
	})

	it('shows the budget with a visible count and an outline for every pip', async () => {
		const w = await mountGame(V, newGame(V))
		const row = w.findAll('.qc-vgame__player')[0]
		expect(row.find('.qc-vgame__budget-count').text()).toBe('Budget 1/8')
		expect(row.findAll('.qc-vgame__pip')).toHaveLength(8)
		w.unmount()
	})
})
