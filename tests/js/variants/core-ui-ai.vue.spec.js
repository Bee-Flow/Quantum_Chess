// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Package "ui-ai" of the follow-up items, the game composable and the game view: the roll memo keyed by position and
 * without the promotion piece (U3), Split closed while the budget is full (U6) but never telling the mover of a hidden
 * pass & play game the opponent's budget, no keyboard focus on the opponent's hidden pieces, the shared rules without
 * castling and en passant (U5) and the result text of a king that cannot escape (U7).
 */

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import VariantGameView from '../../../src/views/VariantGameView.vue'
import { useVariantGame } from '../../../src/variantplay/composables/useVariantGame.js'
import { createVariantGame } from '../../../src/variantplay/variantGames.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import { branches, budgetInfo, newGame } from '../../../src/variants/core/quantum.js'
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

const V = orthodox('test-ui-ai')

/** A hidden-information test variant: each side sees only the squares where its own pieces may stand. */
const H = orthodox('test-ui-ai-hidden', {
	hidden: true,
	/**
	 * The squares where a piece of the side may stand.
	 *
	 * @param {object} state state
	 * @param {number} side side index
	 * @return {Set<number>}
	 */
	visibility(state, side) {
		const out = new Set()
		for (const { b } of state.worlds) {
			b.board.forEach((id, square) => {
				if (id >= 0 && b.sd[id] === side) {
					out.add(square)
				}
			})
		}
		return out
	},
})

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
 * Start a stored game of two players on this device and its composable.
 *
 * @param {object} variant variant
 * @param {object} initial start state
 * @return {Promise<object>} the game API
 */
async function startGame(variant, initial) {
	const rec = createVariantGame({
		variant: variant.id,
		options: {},
		players: [{ kind: 'human' }, { kind: 'human' }],
		initial,
	})
	const game = useVariantGame(rec.id)
	await game.load()
	return game
}

/**
 * Mount the game view of a stored game of two players on this device.
 *
 * @param {object} variant variant
 * @param {object} initial start state
 * @return {Promise<import('@vue/test-utils').VueWrapper>}
 */
async function mountGame(variant, initial) {
	const rec = createVariantGame({
		variant: variant.id,
		options: {},
		players: [{ kind: 'human' }, { kind: 'human' }],
		initial,
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

/**
 * Worlds in which one side has three ghosts 50/50 (8 arrangements: its budget is full).
 *
 * @param {number} side the side with the ghosts
 * @param {object} rest the other pieces
 * @return {Array<[object, number]>}
 */
function fullBudget(side, rest) {
	const [n1s, n2s, rs] = side === 0
		? [['a3', 'c3'], ['f3', 'h3'], ['a1', 'b1']]
		: [['a6', 'c6'], ['f6', 'h6'], ['a8', 'b8']]
	const out = []
	for (const n1 of n1s) {
		for (const n2 of n2s) {
			for (const r of rs) {
				out.push([{ ...rest, [n1]: side + ':n', [n2]: side + ':n', [r]: side + ':r' }, 1])
			}
		}
	}
	return out
}

beforeEach(() => {
	localStorage.clear()
})

afterEach(() => {
	vi.restoreAllMocks()
	document.body.innerHTML = ''
})

describe('U3: the roll memo', () => {
	// the Black knight is on e8 or c6: the promotion e7-e8 is a roll, 50 % Missed and 50 % Moved
	const promotion = (W) => stateOf(W, [
		[{ e1: '0:k', e7: '0:p', a8: '1:k', e8: '1:n' }, 1],
		[{ e1: '0:k', e7: '0:p', a8: '1:k', c6: '1:n' }, 1],
	])

	/**
	 * Try a move and confirm its roll.
	 *
	 * @param {object} game the game API
	 * @param {string} code move code
	 */
	function rollMove(game, code) {
		game.attempt(code)
		expect(game.pending.value?.code).toBe(code)
		game.confirm()
	}

	it('replays the roll after an undo whichever piece the pawn promotes to', async () => {
		const s = promotion(V)
		expect(new Set(branches(V, s, 'e7-e8=q').map((b) => b.key)).size).toBe(2)
		const game = await startGame(V, s)
		// a new number would give the other outcome
		const random = vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValue(0.9)
		rollMove(game, 'e7-e8=n')
		const first = game.state.value.history[0].key
		game.undo()
		expect(game.state.value.history).toHaveLength(0)
		rollMove(game, 'e7-e8=q')
		expect(game.state.value.history[0].key).toBe(first)
		expect(random).toHaveBeenCalledTimes(1)
		expect(Object.keys(game.record.value.rolls)).toEqual([expect.stringMatching(/^0:[0-9a-f]{16}:e7-e8$/)])
	})

	it('draws a new number for the same move at the same ply in another position', async () => {
		const game = await startGame(V, promotion(V))
		vi.spyOn(Math, 'random').mockReturnValue(0.5)
		for (const first of ['e1-d1', 'e1-f1']) {
			game.attempt(first)
			game.attempt('a8-b8')
			rollMove(game, 'e7-e8=q')
			expect(game.state.value.ply).toBe(3)
			game.undo()
			game.undo()
			game.undo()
		}
		const keys = Object.keys(game.record.value.rolls).filter((k) => /^2:[0-9a-f]{16}:e7-e8$/.test(k))
		expect(keys).toHaveLength(2)
	})

	it('does not reuse the key of a game saved before (ply and code only)', async () => {
		const s = promotion(V)
		const game = await startGame(V, s)
		game.record.value = { ...game.record.value, rolls: { '0:e7-e8=q': 0.1, '0:e7-e8': 0.1 } }
		const random = vi.spyOn(Math, 'random').mockReturnValue(0.9)
		rollMove(game, 'e7-e8=q')
		expect(random).toHaveBeenCalledTimes(1)
		expect(Object.keys(game.record.value.rolls)).toHaveLength(3)
		const list = branches(V, s, 'e7-e8=q')
		expect(game.state.value.history[0].key).toBe(list[list.length - 1].key)
	})
})

describe('U6: Split while the budget is full', () => {
	it('is not offered to the player to move, and a stale Split mode selects nothing', async () => {
		const s = stateOf(V, fullBudget(0, { e1: '0:k', d4: '0:q', e8: '1:k' }))
		expect(budgetInfo(V, s, 0).used).toBe(8)
		const game = await startGame(V, s)
		expect(game.budgetFull.value).toBe(true)
		game.setMode('split')
		expect(game.mode.value).toBe('move')
		game.setMode('measure')
		expect(game.mode.value).toBe('measure')
		game.setMode('merge')
		expect(game.mode.value).toBe('merge')
		game.mode.value = 'split'
		game.click(sq('d4'))
		expect(game.sel.value).toEqual([])
		expect(Object.values(game.marks.value).flat()).not.toContain('target')
	})

	it('closes the Split mode when the next player\'s budget is full', async () => {
		const s = stateOf(V, fullBudget(1, { e1: '0:k', g1: '0:n', e8: '1:k' }))
		const game = await startGame(V, s)
		expect(game.budgetFull.value).toBe(false)
		game.setMode('split')
		expect(game.mode.value).toBe('split')
		game.click(sq('g1'))
		game.click(sq('f3'))
		game.click(sq('h3'))
		expect(game.state.value.history.map((h) => h.code)).toEqual(['g1-f3|h3'])
		expect(game.state.value.turn).toBe(1)
		expect(game.budgetFull.value).toBe(true)
		expect(game.mode.value).toBe('move')
	})

	it('greys out the Split button with the budget hint', async () => {
		const w = await mountGame(V, stateOf(V, fullBudget(0, { e1: '0:k', d4: '0:q', e8: '1:k' })))
		const split = button(w, 'Split')
		expect(split.attributes('disabled')).toBeDefined()
		expect(split.element.parentElement.getAttribute('title')).toBe('Budget full: merge or measure a piece first.')
		for (const name of ['Move', 'Merge', 'Measure']) {
			expect(button(w, name).attributes('disabled')).toBeUndefined()
			expect(button(w, name).element.parentElement.getAttribute('title')).toBeNull()
		}
		w.unmount()
		const open = await mountGame(V, newGame(V))
		expect(button(open, 'Split').attributes('disabled')).toBeUndefined()
		expect(button(open, 'Split').element.parentElement.getAttribute('title')).toBeNull()
		open.unmount()
	})
})

describe('U6: the hidden hand-over tells the mover nothing about the opponent', () => {
	/**
	 * A hidden pass & play game in which White has just split g1-f3|h3 from the Split mode.
	 *
	 * @param {boolean} full whether Black's budget is full
	 * @return {Promise<object>} the game API, during the hand-over
	 */
	async function splitAndHandOver(full) {
		const rest = { e1: '0:k', g1: '0:n', e8: '1:k' }
		const worlds = full ? fullBudget(1, rest) : [[{ ...rest, a6: '1:n', f6: '1:n', a8: '1:r' }, 1]]
		const game = await startGame(H, stateOf(H, worlds))
		game.curtain.value = false
		game.setMode('split')
		game.attempt('g1-f3|h3')
		expect(game.handover.value?.side).toBe(0)
		expect(game.viewer.value).toBe(0)
		expect(game.budgetFull.value).toBe(full)
		return game
	}

	it('keeps the mover\'s mode until the device is passed', async () => {
		for (const full of [true, false]) {
			const game = await splitAndHandOver(full)
			expect(game.mode.value).toBe('split')
			game.passDevice()
			expect(game.curtain.value).toBe(true)
			expect(game.mode.value).toBe(full ? 'move' : 'split')
		}
	})

	it('shows no budget hint on Split during the hand-over', async () => {
		const w = await mountGame(H, stateOf(H, fullBudget(1, { e1: '0:k', g1: '0:n', e8: '1:k', e4: '0:p' })))
		await button(w, 'I am White: show my board').trigger('click')
		expect(button(w, 'Split').element.parentElement.getAttribute('title')).toBeNull()
		await w.find('[data-square="e4"]').trigger('click')
		await w.find('[data-square="e5"]').trigger('click')
		await flushPromises()
		expect(w.find('.qc-vgame__box--handover').exists()).toBe(true)
		expect(w.findAll('.qc-vgame__player')[1].find('.qc-vgame__unknown-track').text()).toBe('?')
		expect(button(w, 'Split').element.parentElement.getAttribute('title')).toBeNull()
		expect(w.find('.qc-vgame__compulsory').exists()).toBe(false)
		await button(w, 'Pass the device').trigger('click')
		await button(w, 'I am Black: show my board').trigger('click')
		// Black, now looking, is told that its own budget is full
		expect(button(w, 'Split').element.parentElement.getAttribute('title'))
			.toBe('Budget full: merge or measure a piece first.')
		w.unmount()
	})

	it('gives no keyboard focus to the opponent\'s hidden pieces', async () => {
		const w = await mountGame(H, stateOf(H, [[{ e1: '0:k', e4: '0:p', e8: '1:k', b8: '1:n', h7: '1:p' }, 1]]))
		const focused = () => w.findAll('[tabindex="0"]').map((e) => e.attributes('data-square'))
		await button(w, 'I am White: show my board').trigger('click')
		expect(focused().sort()).toEqual(['e1', 'e4'])
		await w.find('[data-square="e4"]').trigger('click')
		await w.find('[data-square="e5"]').trigger('click')
		await flushPromises()
		expect(w.find('.qc-vgame__box--handover').exists()).toBe(true)
		expect(focused()).toEqual([])
		await button(w, 'Pass the device').trigger('click')
		expect(focused()).toEqual([])
		await button(w, 'I am Black: show my board').trigger('click')
		expect(focused().sort()).toEqual(['b8', 'e8', 'h7'])
		w.unmount()
	})
})

describe('U5, U7: the game view', () => {
	/**
	 * The shared rules shown on the rules card.
	 *
	 * @param {import('@vue/test-utils').VueWrapper} w wrapper
	 * @return {Promise<string[]>}
	 */
	async function shownRules(w) {
		await button(w, 'Rules').trigger('click')
		return w.findAll('.qc-vgame__rules details li').map((li) => li.text())
	}

	it('(U5) leaves castling and en passant out of the shared rules of a variant without them', async () => {
		const castling
			= 'Castling and en passant are allowed only when they are possible in every possibility; they are never rolled.'
		const plain = orthodox('test-no-special', { specialMoves: false })
		const w = await mountGame(plain, newGame(plain))
		const rules = await shownRules(w)
		expect(rules.length).toBeGreaterThan(3)
		expect(rules).not.toContain(castling)
		w.unmount()
		const d = await mountGame(V, newGame(V))
		const all = await shownRules(d)
		expect(all).toContain(castling)
		// lead decision L1: the shared card explains the escape rule of a classic variant
		expect(all.some((r) => r.startsWith('Your king cannot escape: '))).toBe(true)
		d.unmount()
	})

	it('(U7) says that the king could not escape', async () => {
		const w = await mountGame(V, { ...newGame(V), result: { winner: 1, reason: 'cannotEscape' } })
		expect(w.find('.qc-vgame__status').text()).toBe('Black wins (the king could not escape)')
		w.unmount()
	})
})
