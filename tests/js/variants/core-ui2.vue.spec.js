// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The final-review items of package "ui", on the game view: the board of a hidden game gives keyboard focus, move
 * targets and names of pieces only to the player to move, and never on a square that player cannot see unless the
 * target comes from what the player knows (U1, Kriegspiel and Dark chess); the roll preview and the roll result say
 * when an outcome ends the game (U2), the preview not in a hidden game, where it depends on hidden pieces; the pieces
 * in hand and in the promotion choice turn like their side's pieces on the board (U5).
 */

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import VariantGameView from '../../../src/views/VariantGameView.vue'
import { createVariantGame } from '../../../src/variantplay/variantGames.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import { newGame, outcomes } from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { addPiece, HAND } from '../../../src/variants/core/world.js'
import darkchess from '../../../src/variants/darkchess.js'
import kriegspiel from '../../../src/variants/kriegspiel.js'
import shogi from '../../../src/variants/shogi.js'
import { stateOf } from './helpers.js'

const registry = vi.hoisted(() => ({ variants: {} }))

vi.mock('../../../src/variants/index.js', async (importOriginal) => {
	const mod = await importOriginal()
	return { ...mod, loadVariant: async (id) => registry.variants[id] ?? mod.loadVariant(id) }
})

// the same module objects as the game view loads
registry.variants.kriegspiel = kriegspiel
registry.variants.darkchess = darkchess
registry.variants.shogi = shogi

/** The computer as the second player. */
const COMPUTER = { kind: 'computer', level: 'easy' }

/** Plain orthodox chess, for the roll boxes. */
const V = defineVariant(Object.assign(orthodoxSpec(), { id: 'test-ui2-view', category: 'rules', rules: () => [] }))
registry.variants[V.id] = V

/**
 * Mount the game view of a stored game on this device.
 *
 * @param {object} variant variant
 * @param {object} initial start state
 * @param {Array<object>} [players] one per side (default: two humans, pass & play)
 * @return {Promise<import('@vue/test-utils').VueWrapper>}
 */
async function mountGame(variant, initial, players = [{ kind: 'human' }, { kind: 'human' }]) {
	const rec = createVariantGame({ variant: variant.id, options: {}, players, initial })
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
 * Click a square of the board.
 *
 * @param {import('@vue/test-utils').VueWrapper} w wrapper
 * @param {string} name square name
 */
async function click(w, name) {
	await w.find('[data-square="' + name + '"]').trigger('click')
	await flushPromises()
}

/**
 * What the board tells about each square: its name, tab index, accessible name, classes, target dots or rings and
 * drawn pieces.
 *
 * @param {import('@vue/test-utils').VueWrapper} w wrapper
 * @return {Array<Array<string|number>>}
 */
function board(w) {
	return w.findAll('[data-square]').map((e) => [
		e.attributes('data-square'),
		e.attributes('tabindex'),
		e.attributes('aria-label'),
		e.classes().join(' '),
		e.findAll('.qc-vboard__dot, .qc-vboard__ring').length,
		e.findAll('.qc-vpiece').length,
	])
}

/**
 * The lines of the roll preview, with the white space of the template collapsed.
 *
 * @param {import('@vue/test-utils').VueWrapper} w wrapper
 * @return {string[]}
 */
function pendingLines(w) {
	return w.findAll('.qc-vgame__box--pending li').map((li) => li.text().replace(/\s+/g, ' '))
}

/**
 * The squares with keyboard focus.
 *
 * @param {import('@vue/test-utils').VueWrapper} w wrapper
 * @return {string[]}
 */
function focused(w) {
	return w.findAll('[data-square][tabindex="0"]').map((e) => e.attributes('data-square')).sort()
}

/**
 * The squares with a move target mark.
 *
 * @param {import('@vue/test-utils').VueWrapper} w wrapper
 * @return {string[]}
 */
function targets(w) {
	return w.findAll('.qc-vboard__cell--target').map((e) => e.attributes('data-square')).sort()
}

/**
 * Check the rule for squares the viewer cannot see: no keyboard focus unless marked as a target, no name of what
 * stands there.
 *
 * @param {import('@vue/test-utils').VueWrapper} w wrapper
 */
function expectHiddenSquaresQuiet(w) {
	for (const [name, tab, label, classes] of board(w)) {
		if (label === name + ': hidden') {
			expect(tab === '0' ? classes.includes('qc-vboard__cell--target') : true, name).toBe(true)
		}
	}
}

/**
 * The start position with the Black pieces rearranged on squares White cannot see (Black's knight on c6 instead of
 * b8, its e-pawn on e5 instead of e7), White to move.
 *
 * @param {object} W variant
 * @return {object}
 */
function rearranged(W) {
	const s = newGame(W)
	const b = structuredClone(s.worlds[0].b)
	const move = (from, to) => {
		const f = W.topology.byName(from)
		const t = W.topology.byName(to)
		const id = b.board[f]
		b.board[f] = -1
		b.board[t] = id
		b.sq[id] = t
	}
	move('b8', 'c6')
	move('e7', 'e5')
	return { ...s, worlds: [{ b, w: s.worlds[0].w }] }
}

beforeEach(() => {
	localStorage.clear()
})

afterEach(() => {
	vi.restoreAllMocks()
	document.body.innerHTML = ''
})

describe('U1: the board of a hidden game tells only the player to move, and nothing hidden', () => {
	it('Kriegspiel pass & play: focus and targets only for the player to move, none at the hand-over', async () => {
		const w = await mountGame(kriegspiel, newGame(kriegspiel))
		// the curtain before White shows the board
		expect(focused(w)).toEqual([])
		expect(targets(w)).toEqual([])
		await button(w, 'I am White: show my board').trigger('click')
		const white = ['a2', 'b1', 'b2', 'c2', 'd2', 'e2', 'f2', 'g1', 'g2', 'h2']
		expect(focused(w)).toEqual(white)
		expect(w.find('[data-square="e7"]').attributes('aria-label')).toBe('e7: hidden')
		expect(w.find('[data-square="e2"]').attributes('aria-label')).toBe('e2: Pawn')
		// the tries of the knight go to squares White cannot see: they come from White's own pieces only
		await click(w, 'g1')
		expect(targets(w)).toEqual(['f3', 'h3'])
		expect(focused(w)).toEqual([...white, 'f3', 'h3'].sort())
		expectHiddenSquaresQuiet(w)
		await click(w, 'f3')
		// step 1 of the hand-over: White still looks, Black is to move
		expect(w.find('.qc-vgame__box--handover').exists()).toBe(true)
		expect(focused(w)).toEqual([])
		expect(targets(w)).toEqual([])
		expectHiddenSquaresQuiet(w)
		await button(w, 'Pass the device').trigger('click')
		expect(focused(w)).toEqual([])
		await button(w, 'I am Black: show my board').trigger('click')
		const black = focused(w)
		expect(black).toContain('g8')
		expect(black.every((name) => /[78]$/.test(name))).toBe(true)
		expect(w.find('[data-square="f3"]').attributes('aria-label')).toBe('f3: hidden')
		w.unmount()
	})

	it('Kriegspiel against the computer: nothing to focus while the computer is to move', async () => {
		const w = await mountGame(kriegspiel, newGame(kriegspiel), [{ kind: 'human' }, COMPUTER])
		expect(focused(w).length).toBe(10)
		await click(w, 'e2')
		await click(w, 'e4')
		expect(w.vm.$.setupState.game.state.value.turn).toBe(1)
		expect(focused(w)).toEqual([])
		expect(targets(w)).toEqual([])
		expectHiddenSquaresQuiet(w)
		w.unmount()
	})

	it('Kriegspiel: the board is the same whatever stands on the squares White cannot see', async () => {
		const a = await mountGame(kriegspiel, newGame(kriegspiel))
		await button(a, 'I am White: show my board').trigger('click')
		const before = board(a)
		await click(a, 'g1')
		const selected = board(a)
		a.unmount()
		const b = await mountGame(kriegspiel, rearranged(kriegspiel))
		await button(b, 'I am White: show my board').trigger('click')
		expect(board(b)).toEqual(before)
		await click(b, 'g1')
		expect(board(b)).toEqual(selected)
		b.unmount()
	})

	it('Dark chess: no focus, target or name in the fog, and the same board whatever stands there', async () => {
		const a = await mountGame(darkchess, newGame(darkchess))
		expect(focused(a)).toEqual([])
		await button(a, 'I am White: show my board').trigger('click')
		const fogged = board(a).filter(([, , , classes]) => classes.includes('qc-vboard__cell--fog'))
		expect(fogged.length).toBe(32)
		for (const [name, tab, label, , marks, pieces] of fogged) {
			expect([tab, label, marks, pieces], name).toEqual(['-1', name + ': hidden', 0, 0])
		}
		const before = board(a)
		await click(a, 'b1')
		expect(targets(a)).toEqual(['a3', 'c3'])
		const selected = board(a)
		await click(a, 'c3')
		expect(a.find('.qc-vgame__box--handover').exists()).toBe(true)
		expect(focused(a)).toEqual([])
		expect(targets(a)).toEqual([])
		a.unmount()
		const b = await mountGame(darkchess, rearranged(darkchess))
		await button(b, 'I am White: show my board').trigger('click')
		expect(board(b)).toEqual(before)
		await click(b, 'b1')
		expect(board(b)).toEqual(selected)
		b.unmount()
	})

	it('Dark chess against the computer: nothing to focus while the computer is to move', async () => {
		const w = await mountGame(darkchess, newGame(darkchess), [{ kind: 'human' }, COMPUTER])
		expect(focused(w).length).toBeGreaterThan(0)
		await click(w, 'e2')
		await click(w, 'e4')
		expect(focused(w)).toEqual([])
		expect(targets(w)).toEqual([])
		expectHiddenSquaresQuiet(w)
		w.unmount()
	})
})

describe('U2: the roll boxes say when an outcome ends the game', () => {
	// the White queen is on d1 (the diagonal to the Black king on h5 is open) or on d3
	const ghost = () => stateOf(V, [
		[{ g1: '0:k', d1: '0:q', h5: '1:k', a7: '1:p' }, 1],
		[{ g1: '0:k', d3: '0:q', h5: '1:k', a7: '1:p' }, 1],
	])

	it('in the preview, only for the outcome that ends it', async () => {
		const w = await mountGame(V, ghost())
		await click(w, 'd1')
		await click(w, 'h5')
		const ends = '50 % Captured · The game ends: White wins (a king was captured)'
		expect(pendingLines(w)).toEqual(['50 % Missed', ends])
		w.unmount()
	})

	it('not in the preview of a hidden game, where it depends on hidden pieces (Dark chess)', async () => {
		// White Ka1 Nb1; Black Kh8, a knight on c3 or h6, and a rook in the fog: on a8 it could take the White king
		// for certain after b1-c3, so the 50-move draw of the Moved outcome would wait; on h7 it could not
		const fogged = (rook) => ({
			...stateOf(darkchess, [
				[{ a1: '0:k', b1: '0:n', h8: '1:k', c3: '1:n', [rook]: '1:r' }, 1],
				[{ a1: '0:k', b1: '0:n', h8: '1:k', h6: '1:n', [rook]: '1:r' }, 1],
			]),
			quiet: 99,
		})
		expect(outcomes(darkchess, fogged('a8'), 'b1-c3')[0].result).toBeUndefined()
		expect(outcomes(darkchess, fogged('h7'), 'b1-c3')[0].result).toEqual({ winner: null, reason: 'quiet' })
		const seen = []
		for (const rook of ['a8', 'h7']) {
			const w = await mountGame(darkchess, fogged(rook))
			await button(w, 'I am White: show my board').trigger('click')
			await click(w, 'b1')
			const shown = board(w)
			await click(w, 'c3')
			seen.push([shown, pendingLines(w)])
			w.unmount()
		}
		expect(seen[1]).toEqual(seen[0])
		expect(seen[0][1]).toEqual(['50 % Moved', '50 % Captured'])
	})

	it('in the result of the roll', async () => {
		const w = await mountGame(V, ghost())
		vi.spyOn(Math, 'random').mockReturnValue(0.9)
		await click(w, 'd1')
		await click(w, 'h5')
		await button(w, 'Play and roll').trigger('click')
		await flushPromises()
		const box = w.find('.qc-vgame__box--roll')
		expect(box.find('p').text()).toBe('Roll: Captured (50 %)')
		expect(box.find('.qc-vgame__ends').text()).toBe('The game ends: White wins (a king was captured)')
		w.unmount()
		const again = await mountGame(V, ghost())
		vi.spyOn(Math, 'random').mockReturnValue(0.1)
		await click(again, 'd1')
		await click(again, 'h5')
		await button(again, 'Play and roll').trigger('click')
		await flushPromises()
		expect(again.find('.qc-vgame__box--roll p').text()).toBe('Roll: Missed (50 %)')
		expect(again.find('.qc-vgame__ends').exists()).toBe(false)
		again.unmount()
	})
})

describe('U5: the pieces in hand and in the promotion choice turn with their side', () => {
	/**
	 * The rotation of the pentagon of each piece in a container.
	 *
	 * @param {import('@vue/test-utils').DOMWrapper<Element>} box container
	 * @return {Array<string|null>}
	 */
	const spins = (box) => box.findAll('polygon').map((p) => p.attributes('transform') ?? null)

	it('points Gote\'s pieces down in Sente\'s view, in the hands and in the promotion choice', async () => {
		const place = { '5i': '0:k', '5a': '1:k', '5f': '1:s' }
		const s = stateOf(shogi, [[place, 1]], 1, (b) => {
			b.x = {}
			addPiece(b, 'p', 0, HAND)
			addPiece(b, 'r', 1, HAND)
		})
		const w = await mountGame(shogi, s)
		const hands = w.findAll('.qc-vgame__hand')
		expect(hands).toHaveLength(2)
		expect(spins(hands[0])).toEqual([null])
		expect(spins(hands[1])).toEqual(['rotate(180)'])
		// Gote's silver enters Sente's camp and may promote
		await click(w, '5f')
		await click(w, '5g')
		const promo = w.findAll('.qc-vgame__box').find((b) => b.text().includes('Promote to'))
		expect(spins(promo)).toEqual(['rotate(180)', 'rotate(180)'])
		// on the board, Gote's pieces point down too
		expect(w.find('[data-square="5a"] polygon').attributes('transform')).toBe('rotate(180)')
		w.unmount()
	})
})
