// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The generic board and view items of the multiverse app review, on inline test variants: the danger line of pass &
 * play (for the side to move) and the view that follows the turn when the board is never turned, the mode that goes
 * back to Move within a turn, the notices that name the real reason, the end of a game (no mode hint or buttons, the
 * variant's end note), the warning box with Cancel first, Undo beside the turn actions, the variant's texts (danger
 * line, turn hint, outcome squares, report headed per turn), the move list's lines under the row and its break
 * points; on the board: pins on chips that replace the label, full names when zoomed, the height-filling board, the
 * focus frames (`alt`, `maxPx`, `stops`), the held focus while the computer plays, the move targets outside the view,
 * travel arrows, labels that keep 11 px, and the size of a CSS pixel only for ghost pieces.
 */

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import VariantBoard from '../../../src/variantplay/components/VariantBoard.vue'
import VariantPiece from '../../../src/variantplay/components/VariantPiece.vue'
import VariantGameView from '../../../src/views/VariantGameView.vue'
import VariantsView from '../../../src/views/VariantsView.vue'
import { useVariantGame } from '../../../src/variantplay/composables/useVariantGame.js'
import { createVariantGame, saveVariantGame } from '../../../src/variantplay/variantGames.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import { applyOutcome, newGame } from '../../../src/variants/core/quantum.js'
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

const V = orthodox('test-mv')

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
 * @param {import('@vue/test-utils').VueWrapper|import('@vue/test-utils').DOMWrapper} w wrapper
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
 * A variant whose layout is a large drawing (`width` × `height` units) with the 8 × 8 cells in its corner, and more
 * layout fields.
 *
 * @param {string} id variant id
 * @param {number} width layout width
 * @param {number} height layout height
 * @param {object} more more layout fields (a focus, boards …), or a function of the state that returns them
 * @return {object}
 */
function wide(id, width, height, more) {
	const L = orthodox(id, {
		layoutOf(state) {
			const extra = typeof more === 'function' ? more(state) : more
			return { ...L.topology, layout: { ...L.topology.layout, width, height, zoomable: true, ...extra } }
		},
	})
	return L
}

beforeEach(() => {
	localStorage.clear()
})

afterEach(() => {
	vi.restoreAllMocks()
	document.body.innerHTML = ''
})

describe('the danger line and the view in pass & play', () => {
	it('speaks for the side to move, not for White', async () => {
		// Black to move, its king in check from the rook: pass & play shows Black's danger
		const s = stateOf(V, [[{ a1: '0:k', e2: '0:r', e8: '1:k' }, 1]], 1)
		const game = await startGame(V, s)
		expect(game.viewer.value).toBe(0)
		expect(game.dangerSide.value).toBe(1)
		expect(game.danger.value).toBe(1)
		// White's king attacked while Black is to move: nothing to say to Black
		const t = stateOf(V, [[{ a1: '0:k', h8: '1:k', a8: '1:r' }, 1]], 1)
		const other = await startGame(V, t)
		expect(other.danger.value).toBe(0)
		// against the computer the line is the human's
		const vs = await startGame(V, t, { kinds: ['human', 'computer'] })
		expect(vs.dangerSide.value).toBe(0)
		vs.stop()
	})

	it('follows the side to move with a board that is never turned', async () => {
		const N = orthodox('test-mv-noflip', { flipBoard: false })
		const game = await startGame(N, stateOf(N, [[{ a1: '0:k', h8: '1:k' }, 1]], 1))
		expect(game.viewer.value).toBe(1)
		expect(game.rotation.value).toBe(180)
		const plain = await startGame(V, stateOf(V, [[{ a1: '0:k', h8: '1:k' }, 1]], 1))
		expect(plain.viewer.value).toBe(0)
	})

	it('names the danger in the variant\'s words, and hides the turning switch for a board never turned', async () => {
		const D = orthodox('test-mv-danger', {
			dangerText: (state, side, percent) => `Danger for side ${side} on the board: ${percent}`,
		})
		const w = await mountGame(D, stateOf(D, [[{ a1: '0:k', e2: '0:r', e8: '1:k' }, 1]], 1))
		expect(w.find('.qc-vgame__danger').text()).toBe('Danger for side 1 on the board: 100 %')
		w.unmount()
	})
})

describe('the New game dialog', () => {
	it('offers "Turn the board to the player to move" only for a board that can be turned', async () => {
		const stub = { render: () => null }
		const router = createRouter({
			history: createMemoryHistory(),
			routes: [
				{ path: '/variants', name: 'variants', component: stub },
				{ path: '/variants/:variant/:id', name: 'variant-game', component: stub },
				{ path: '/new', name: 'new-game', component: stub },
			],
		})
		const switchShown = async (extra) => {
			orthodox('multiverse', extra)
			router.push('/variants')
			await router.isReady()
			const w = mount(VariantsView, { global: { plugins: [router] }, attachTo: document.body })
			await w.find('[data-test="variant-multiverse"]').trigger('click')
			await flushPromises()
			const opponent = () => document.querySelector('input[name="qc-variant-opponent"]')
			await vi.waitFor(() => expect(opponent()).not.toBeNull(), { timeout: 3000, interval: 5 })
			const input = document.querySelector('input[name="qc-variant-opponent"][value="local"]')
			input.checked = true
			input.dispatchEvent(new Event('change'))
			await flushPromises()
			const shown = document.body.textContent.includes('Turn the board to the player to move')
			w.unmount()
			document.body.innerHTML = ''
			return shown
		}
		expect(await switchShown({ flipBoard: false })).toBe(false)
		expect(await switchShown({})).toBe(true)
	})
})

describe('moves and notices', () => {
	it('goes back to Move after a split when the same side moves again', async () => {
		const base = orthodoxSpec().afterMove
		// White moves twice in its first turn: `x.k` counts the moves
		const M = orthodox('test-mv-twice', {
			afterMove(next, m, prev) {
				base(next, m, prev)
				next.x = { ...next.x, k: (prev.x.k ?? 0) + 1 }
			},
			nextSide: (b, side) => (side === 0 && b.x.k === 1 ? 0 : 1 - side),
		})
		const game = await startGame(M, newGame(M))
		game.setMode('split')
		game.attempt('g1-f3|h3')
		expect(game.state.value.turn).toBe(0)
		expect(game.mode.value).toBe('move')
		// a split that ends the turn keeps the mode, as before
		game.setMode('split')
		game.attempt('b1-a3|c3')
		expect(game.state.value.turn).toBe(1)
		expect(game.mode.value).toBe('split')
	})

	it('says "Choose one of your pieces" for an enemy piece in Split, and the variant\'s own words', async () => {
		const game = await startGame(V, newGame(V))
		game.setMode('split')
		game.click(sq('b8'))
		expect(game.notice.value).toEqual({ kind: 'notYours' })
		const R = orthodox('test-mv-refusal', {
			refusalText: (state, kind, at) => (kind === 'noMove' ? 'No move from ' + R.topology.names[at] : null),
		})
		const w = await mountGame(R, newGame(R))
		// the rook in its corner has no move: the variant says why
		await click(w, 'a1')
		expect(w.find('.qc-vgame__notice').text()).toBe('No move from a1')
		// a piece that has moves is selected as before, without a notice
		await click(w, 'e2')
		expect(w.find('.qc-vgame__notice').exists()).toBe(false)
		w.unmount()
		// without the hook a tap on a piece without moves says nothing
		const plain = await startGame(V, newGame(V))
		plain.click(sq('a1'))
		expect(plain.notice.value).toBeNull()
	})

	it('says that the square is the reason when a part of an own ghost may not merge', async () => {
		const G = orthodox('test-mv-nomerge', { allowQuantum: (state, action) => action.type !== 'merge' })
		const s = stateOf(G, [
			[{ e1: '0:k', f3: '0:n', e8: '1:k' }, 1],
			[{ e1: '0:k', h3: '0:n', e8: '1:k' }, 1],
		])
		const game = await startGame(G, s)
		game.setMode('merge')
		game.click(G.topology.byName('f3'))
		expect(game.notice.value).toEqual({ kind: 'mergeHere' })
		game.click(G.topology.byName('a4'))
		expect(game.notice.value).toEqual({ kind: 'noMerge' })
	})
})

describe('the game view', () => {
	it('shows neither the move types nor their hint once the game is over, and the variant\'s end note', async () => {
		const E = orthodox('test-mv-end', { endNote: (state) => (state.result ? 'Decided on e8.' : null) })
		const over = { ...newGame(E), result: { winner: 0, reason: 'resign' } }
		const w = await mountGame(E, over)
		expect(w.find('.qc-vgame__modes').exists()).toBe(false)
		expect(w.find('.qc-vgame__hint--mode').exists()).toBe(false)
		expect(w.find('.qc-vgame__end-note').text()).toBe('Decided on e8.')
		w.unmount()
		const running = await mountGame(E, newGame(E))
		expect(running.find('.qc-vgame__modes').exists()).toBe(true)
		expect(running.find('.qc-vgame__end-note').exists()).toBe(false)
		running.unmount()
	})

	it('puts Cancel first and as the main button in the box of a move the variant warns about', async () => {
		const W = orthodox('test-mv-warn', { moveWarning: (state, code) => (code === 'e2-e4' ? 'You lose' : null) })
		const w = await mountGame(W, newGame(W))
		await click(w, 'e2')
		await click(w, 'e4')
		const buttons = w.findAll('.qc-vgame__box--pending .qc-vgame__choices button')
		expect(buttons.map((b) => b.text())).toEqual(['Cancel', 'Play anyway'])
		w.unmount()
	})

	it('puts Undo beside the turn actions, heads the report per turn and uses the turn hint', async () => {
		const A = orthodox('test-mv-actions', {
			actions: () => [{ code: 'submit', label: 'Submit turn' }],
			infoText: (record) => [record.code + ' done'],
			turnHint: () => 'Move on, or submit.',
		})
		const w = await mountGame(A, newGame(A), { moves: ['e2-e4'] })
		const choices = w.find('.qc-vgame__controls .qc-vgame__choices')
		expect(choices.findAll('button').map((b) => b.text())).toEqual(['Submit turn', 'Undo'])
		expect(button(w.find('.qc-vgame__actions'), 'Undo')).toBeUndefined()
		expect(w.find('.qc-vgame__hint--mode').text()).toBe('Move on, or submit.')
		const report = w.find('.qc-vgame__box--report')
		expect(report.find('.qc-vgame__box-title').text()).toBe('Last turn of White')
		expect(report.find('.qc-vgame__report-line').text()).toBe('e2-e4 done')
		// in the move list the line stands under the row, across both columns
		const row = w.find('.qc-vgame__move-row')
		expect(row.find('.qc-vgame__move-cell .qc-vgame__move-line').exists()).toBe(false)
		expect(row.find('.qc-vgame__move-notes').text()).toBe('e2-e4 done')
		w.unmount()
	})

	it('writes the square of an outcome in the variant\'s words; a long code breaks between squares', async () => {
		const O = orthodox('test-mv-outcome', {
			outcomeSquare: (key, { state }) => (state ? 'board 1, ' + key : null),
			codeText: (code) => (code === 'e2-e4' ? '(0T1)e2>>(0T1)e4|e5' : null),
		})
		const s = stateOf(O, [
			[{ e1: '0:k', f3: '0:n', e8: '1:k' }, 1],
			[{ e1: '0:k', h3: '0:n', e8: '1:k' }, 1],
		])
		const w = await mountGame(O, s)
		await button(w, 'Measure').trigger('click')
		await click(w, 'f3')
		const outcomes = w.findAll('.qc-vgame__outcomes li').map((li) => li.text())
		expect(outcomes).toEqual(['50 % On board 1, f3', '50 % On board 1, h3'])
		w.unmount()
		const list = await mountGame(O, newGame(O), { moves: ['e2-e4'] })
		const code = list.find('.qc-vgame__move .qc-vgame__code')
		expect(code.text()).toBe('(0T1)e2>>(0T1)e4|e5')
		// a break point after `>>` and after `|` (and after the last part)
		expect(code.findAll('wbr')).toHaveLength(3)
		list.unmount()
	})
})

describe('the board', () => {
	/** A board with a label and a pin, 5 units high, whose label is above a view zoomed in at its middle. */
	const pinned = (id) => wide(id, 40, 40, {
		fill: true,
		boards: [{ x: 10, y: 10, w: 5, h: 5, label: 'T2 ○', pin: 'L0 T2 ○', frame: 'light' }],
		focus: { x: 12.5, y: 14, zoom: 5, key: 'k' },
	})

	it('pins the full name on a chip and leaves its own label out; zoomed in, labels say the full name', async () => {
		pointer(false)
		const P = pinned('test-mv-pin')
		const w = await measuredBoard(P, newGame(P))
		expect(w.findAll('.qc-vboard__pin').map((p) => p.text())).toEqual(['L0 T2 ○'])
		expect(w.findAll('.qc-vboard__chip--pin')).toHaveLength(1)
		expect(w.findAll('.qc-vboard__board-label')).toHaveLength(0)
		// the band of the side to move there
		expect(w.find('.qc-vboard__band--light').exists()).toBe(true)
		// panned up, the label shows itself again: the full name, 11 to 15 px on screen, on a chip
		await w.find('button[aria-label="Zoom out"]').trigger('click')
		await w.find('button[aria-label="Zoom out"]').trigger('click')
		await w.find('button[aria-label="Zoom out"]').trigger('click')
		const labels = w.findAll('.qc-vboard__board-label')
		expect(w.findAll('.qc-vboard__pin')).toHaveLength(0)
		expect(labels.map((l) => l.text())).toEqual(['L0 T2 ○'])
		const [, , vw] = viewBox(w)
		const px = Number.parseFloat(labels[0].attributes('style').match(/font-size: ([\d.]+)px/)[1]) * (360 / vw)
		expect(px).toBeGreaterThanOrEqual(11 - 1e-6)
		expect(px).toBeLessThanOrEqual(15 + 1e-6)
		w.unmount()
	})

	it('fills the screen\'s height: a zoomed view has the aspect of the board on screen', async () => {
		pointer(false)
		const P = pinned('test-mv-fill')
		const w = await measuredBoard(P, newGame(P), {}, 300, 600)
		expect(w.find('svg.qc-vboard').classes()).toContain('qc-vboard--fill')
		const [, , vw, vh] = viewBox(w)
		expect(vh / vw).toBeCloseTo(2, 6)
		w.unmount()
	})

	it('takes the smaller frame when the large one would be too small, and never more than maxPx', async () => {
		pointer(false)
		const focus = {
			x: 20,
			y: 20,
			key: 'f',
			box: { w: 36, h: 36 },
			alt: { x: 5, y: 5, box: { w: 8, h: 8 } },
			minPx: 32,
			fineMinPx: 26,
			maxPx: 40,
		}
		const F = wide('test-mv-alt', 40, 40, { focus })
		const w = await measuredBoard(F, newGame(F))
		// 360 px for a box of 36 units is 10 px per unit: the smaller frame, at 40 px per unit at most
		const [x, y, vw, vh] = viewBox(w)
		expect(360 / Math.max(vw, vh)).toBeCloseTo(40, 3)
		expect(x + vw / 2).toBeCloseTo(5, 3)
		expect(y + vh / 2).toBeCloseTo(5, 3)
		w.unmount()
	})

	it('steps through the stops with "previous / next board" beside the caption', async () => {
		pointer(true)
		const focus = { x: 10, y: 10, key: 's', box: { w: 8, h: 8 }, stops: [{ x: 10, y: 10 }, { x: 30, y: 30 }] }
		const S = wide('test-mv-stops', 40, 40, { focus, caption: 'Header' })
		const w = await measuredBoard(S, newGame(S))
		expect(w.find('.qc-vboard__caption').text()).toBe('Header')
		const centre = () => {
			const [x, y, vw, vh] = viewBox(w)
			return [x + vw / 2, y + vh / 2]
		}
		await w.find('button[aria-label="Next board to play"]').trigger('click')
		expect(centre()[0]).toBeCloseTo(10, 6)
		await w.find('button[aria-label="Next board to play"]').trigger('click')
		expect(centre()).toEqual([expect.closeTo(30, 3), expect.closeTo(30, 3)])
		await w.find('button[aria-label="Previous board to play"]').trigger('click')
		expect(centre()[0]).toBeCloseTo(10, 6)
		w.unmount()
	})

	it('holds a new focus while the computer plays, and applies it once the turn comes back', async () => {
		pointer(true)
		const F = wide('test-mv-hold', 40, 40, (state) => ({
			focus: state.history.length
				? { x: 30, y: 30, key: 'later', box: { w: 8, h: 8 } }
				: { x: 10, y: 10, key: 'first', box: { w: 8, h: 8 } },
		}))
		const s = newGame(F)
		const w = await measuredBoard(F, s, { hold: false })
		const centre = () => {
			const [x, y, vw, vh] = viewBox(w)
			return [x + vw / 2, y + vh / 2]
		}
		expect(centre()[0]).toBeCloseTo(10, 6)
		await w.setProps({ hold: true, state: applyOutcome(F, s, 'e2-e4', 0) })
		expect(centre()[0]).toBeCloseTo(10, 6)
		await w.setProps({ hold: false })
		expect(centre()[0]).toBeCloseTo(30, 6)
		w.unmount()
	})

	it('counts the move targets outside a zoomed view at their edge, and pans there on a tap', async () => {
		pointer(true)
		const F = wide('test-mv-off', 40, 40, { focus: { x: 30, y: 30, key: 'o', box: { w: 8, h: 8 } } })
		const marks = { [sq('a8')]: ['target'], [sq('b8')]: ['target'] }
		const w = await measuredBoard(F, newGame(F), { marks })
		const markers = w.findAll('.qc-vboard__offscreen')
		expect(markers).toHaveLength(1)
		expect(markers[0].text()).toMatch(/^[←↑] 2$/)
		expect(markers[0].attributes('aria-label')).toBe('2 targets outside the view')
		await markers[0].trigger('click')
		expect(w.findAll('.qc-vboard__offscreen')).toHaveLength(0)
		w.unmount()
	})

	it('draws a travel arrow as a bowed path with its own head, and gives a label its fit', async () => {
		pointer(false)
		const T = wide('test-mv-travel', 40, 40, {
			outlines: [{ x1: 30, y1: 5, x2: 10, y2: 30, cx: 30, cy: 30, kind: 'travel' }],
			labels: [{ x: 1.5, y: 20, text: 'L+1', fit: 2.6, kind: 'row' }],
		})
		const w = await measuredBoard(T, newGame(T))
		const path = w.find('.qc-vboard__outline--travel')
		expect(path.attributes('d')).toMatch(/^M 30\.000 5\.250 Q 30\.000 30\.000 /)
		const head = w.find('.qc-vboard__head--travel').attributes('points').split(' ')[0].split(',').map(Number)
		// the head points along the curve's end (from the control point): it stops before the square's centre
		expect(head).toEqual([expect.closeTo(10.35, 3), expect.closeTo(30, 3)])
		const label = w.find('.qc-vboard__label--row')
		const [, , vw] = viewBox(w)
		const px = Number.parseFloat(label.attributes('style').match(/font-size: ([\d.]+)px/)[1]) * (360 / vw)
		expect(px).toBeCloseTo(11, 3)
		w.unmount()
	})

	it('gives the size of a CSS pixel to the ghost pieces only (a pinch redraws only them)', async () => {
		const s = stateOf(V, [
			[{ e1: '0:k', f3: '0:n', e8: '1:k' }, 1],
			[{ e1: '0:k', h3: '0:n', e8: '1:k' }, 1],
		])
		const w = await measuredBoard(V, s)
		const units = w.findAllComponents(VariantPiece).map((p) => [p.props('p') < 1, p.props('unit') > 0])
		expect(units.filter(([ghost]) => ghost).every(([, unit]) => unit)).toBe(true)
		expect(units.filter(([ghost]) => !ghost).every(([, unit]) => !unit)).toBe(true)
		w.unmount()
	})
})
