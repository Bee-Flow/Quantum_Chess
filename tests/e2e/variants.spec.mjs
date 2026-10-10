/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The chess variants: the catalogue lists all twenty, a game of multiverse chess (5D) against the computer plays a
 * multi-board turn that ends with "Submit turn" and continues after a reload, and every variant tile starts a game
 * against the computer in which the player splits a piece and the computer answers. Variant games live in the
 * browser storage, so these tests need no server data of their own. The moves are picked in Node from the same rules
 * modules the page runs (helpers/variants.mjs) and played by clicking the board.
 */
import { CATALOG } from '../../src/variants/catalog.js'
import { applyMove, legalMoves, loadVariant, outcomes, royalDanger, VARIANT_IDS } from '../../src/variants/index.js'
import { expect, openApp, test } from './helpers/index.mjs'
import { playVariantMove, variantRecord, waitForVariantTurn } from './helpers/variants.mjs'

test.use({ user: 'carol' })

/** The side the player takes in the smoke test: White's horde is pawns only, which never split. */
const PLAYER_SIDE = { horde: 1 }

/** Number options set in the New game dialog instead of their random value: a start position with a split. */
const NUMBER_OPTIONS = { chess960: { 'Start position (0–959)': '518' } }

/**
 * Open the catalogue, choose a variant and start a game against the computer from its New game dialog.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} id variant id
 * @param {object} [options] options
 * @param {number} [options.side] the side the player takes
 * @param {string} [options.level] easy, normal or hard
 * @return {Promise<void>}
 */
async function startAgainstComputer(page, id, { side = 0, level = 'easy' } = {}) {
	await openApp(page, '/variants', { ready: `[data-test="variant-${id}"]` })
	await page.locator(`[data-test="variant-${id}"]`).click()
	const dialog = page.getByRole('dialog', { name: CATALOG.find((e) => e.id === id).name() })
	// the dialog shows the form once the rules module has loaded
	const start = dialog.getByRole('button', { name: 'Start game' })
	await expect(start).toBeVisible()
	await expect(dialog.locator('input[name=qc-variant-opponent][value=computer]')).toBeChecked()
	await dialog.locator(`input[name=qc-variant-level][value=${level}]`).check({ force: true })
	await dialog.locator(`input[name=qc-variant-side][value="${side}"]`).check({ force: true })
	for (const [label, value] of Object.entries(NUMBER_OPTIONS[id] ?? {})) {
		await dialog.getByLabel(label).fill(value)
	}
	await start.click()
	await expect(page).toHaveURL(new RegExp(`#/variants/${id}/[^/]+$`))
	await expect(page.locator('svg.qc-vboard')).toBeVisible()
}

/**
 * Whether a move is certain (no roll) and the variant has no warning for it, so it is played without a question.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {string} code move code
 * @return {boolean}
 */
function plain(V, state, code) {
	return outcomes(V, state, code)?.length === 1 && !V.moveWarning?.(state, code)
}

/**
 * The ordinary moves of the side to move that are played at once: no roll, no warning, no promotion choice, no drop.
 *
 * @param {object} V variant
 * @param {object} state state
 * @return {object[]}
 */
function plainMoves(V, state) {
	return legalMoves(V, state)
		.filter((m) => m.type === 'move' && !m.drop && !m.code.includes('=') && plain(V, state, m.code))
}

/**
 * Whether "Submit turn" is legal in a multiverse state.
 *
 * @param {object} V variant
 * @param {object} state state
 * @return {boolean}
 */
function canSubmit(V, state) {
	return legalMoves(V, state).some((m) => m.code === 'submit')
}

/**
 * The moves that leave the mover's royal pieces least in danger (a move that wins comes first, one that loses last),
 * so the player's side does not walk into a lost game while the test waits for its turns.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {object[]} moves candidate moves
 * @return {object[]}
 */
function safest(V, state, moves) {
	const side = state.turn
	const scored = moves.map((m) => {
		const next = applyMove(V, state, m.code, 0.5).state
		if (next.result) {
			return { m, danger: next.result.winner === side ? -1 : 2 }
		}
		return { m, danger: royalDanger(V, next, side) }
	})
	const best = Math.min(...scored.map((e) => e.danger))
	return scored.filter((e) => e.danger === best).map((e) => e.m)
}

/**
 * A move of the side to move after which it is still its turn and it may submit: it has played its must-move boards
 * and has an optional board left.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {object[]} moves candidate moves
 * @return {object|undefined}
 */
function moveBeforeSubmit(V, state, moves) {
	return moves.find((m) => {
		const next = applyMove(V, state, m.code, 0.5)?.state
		return next && !next.result && next.turn === state.turn && canSubmit(V, next)
	})
}

/**
 * Play the player's turn of multiverse chess through the board, with the moves that leave its kings least in danger.
 * With `submit`, the player moves on its must-move boards (a time travel when nothing better is there, which opens a
 * timeline) and ends the turn with "Submit turn" as soon as a board is left to play; returns whether it did. Without,
 * it plays until the turn passes (and submits only when no move is left).
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {object} V the multiverse
 * @param {object} rec the record at the start of the turn
 * @param {boolean} submit end the turn with "Submit turn" when possible
 * @return {Promise<{rec: object, submitted: boolean}>}
 */
async function multiverseTurn(page, V, rec, submit) {
	const side = rec.current.turn
	let moved = 0
	while (!rec.current.result && rec.current.turn === side) {
		const state = rec.current
		const moves = plainMoves(V, state)
		if (moved && canSubmit(V, state) && (submit || !moves.length)) {
			const button = page.getByRole('button', { name: /^Submit turn/ })
			await expect(button).toBeEnabled()
			await button.click()
			await expect.poll(async () => (await variantRecord(page)).moves.at(-1)?.code).toBe('submit')
			return { rec: await variantRecord(page), submitted: true }
		}
		const safe = moves.length ? safest(V, state, moves) : []
		const pick = (submit && moveBeforeSubmit(V, state, safe))
			|| (submit && safe.find((m) => m.code.includes('>>')))
			|| safe[0]
		expect(pick, 'the player has a move').toBeTruthy()
		rec = await playVariantMove(page, V, state, pick)
		moved++
	}
	return { rec, submitted: false }
}

test('the catalogue lists the twenty variants', async ({ page }) => {
	await openApp(page, '/variants', { ready: '.qc-variants' })
	await expect(page.getByRole('heading', { name: 'Chess variants', level: 2 })).toBeVisible()
	const tiles = page.locator('button.qc-variants__tile')
	await expect(tiles).toHaveCount(VARIANT_IDS.length)
	expect(VARIANT_IDS).toHaveLength(20)
	for (const e of CATALOG) {
		await expect(page.locator(`[data-test="variant-${e.id}"]`)).toContainText(e.name())
	}
	await expect(page.locator('[data-test=variant-classic]')).toBeVisible()
})

test('5D against the computer: Submit turn, then the game goes on after a reload @phone', async ({ page }) => {
	test.setTimeout(240_000)
	const V = await loadVariant('multiverse')
	await startAgainstComputer(page, 'multiverse')
	let rec = await variantRecord(page)
	expect(rec.options.setup, 'a new game starts on Small').toBe('small')
	expect(rec.players.map((p) => p.kind)).toEqual(['human', 'computer'])

	// White moves (a time travel opens a timeline once it can) until a turn leaves an optional board: then it
	// ends the turn with Submit turn
	let submitted = false
	for (let turn = 0; turn < 8 && !submitted; turn++) {
		rec = await waitForVariantTurn(page, 0, { minMoves: rec.moves.length })
		;({ rec, submitted } = await multiverseTurn(page, V, rec, true))
	}
	expect(submitted, 'a turn ended with Submit turn').toBe(true)

	// the computer answers
	rec = await waitForVariantTurn(page, 0, { minMoves: rec.moves.length + 1 })
	const saved = rec.moves.map((m) => m.code)
	expect(saved.some((code) => code.includes('>')), 'a piece travelled in time').toBe(true)

	// a reload opens the same game where it was
	await page.reload()
	await expect(page.locator('svg.qc-vboard')).toBeVisible()
	rec = await waitForVariantTurn(page, 0, { minMoves: saved.length })
	expect(rec.moves.map((m) => m.code)).toEqual(saved)
	await expect(page.locator('.qc-vgame__status')).toContainText('White to move')

	// the catalogue offers it under "Continue on this device", and it goes on from there
	await openApp(page, '/variants', { ready: '.qc-variants__saved' })
	const link = page.locator('.qc-variants__saved-link', { hasText: 'Multiverse chess (5D)' })
	await expect(link).toHaveCount(1)
	await link.click()
	await expect(page).toHaveURL(new RegExp(`#/variants/multiverse/${rec.id}$`))
	rec = await waitForVariantTurn(page, 0, { minMoves: saved.length })
	;({ rec } = await multiverseTurn(page, V, rec, false))
	rec = await waitForVariantTurn(page, 0, { minMoves: rec.moves.length + 1 })
	expect(rec.moves.length).toBeGreaterThan(saved.length + 1)
	expect(rec.moves.slice(0, saved.length).map((m) => m.code)).toEqual(saved)
})

test.describe('every variant tile starts a game', () => {
	for (const id of VARIANT_IDS) {
		const name = CATALOG.find((e) => e.id === id)?.name() ?? id
		test(`${name}: a split against the computer, and the computer answers`, async ({ page }) => {
			test.setTimeout(180_000)
			const V = await loadVariant(id)
			const side = PLAYER_SIDE[id] ?? 0
			await startAgainstComputer(page, id, { side })
			let rec = await waitForVariantTurn(page, side)
			const before = rec.moves.length
			expect(before, 'the computer sides before the player have moved').toBe(side)

			const state = rec.current
			const split = legalMoves(V, state, { splits: true })
				.find((m) => m.type === 'split' && plain(V, state, m.code))
			expect(split, 'a split is possible').toBeTruthy()
			rec = await playVariantMove(page, V, state, split)
			expect(rec.moves[before].code).toBe(split.code)
			expect(rec.moves[before].code).toContain('|')

			// the computer (every other side) answers and the turn comes back
			rec = await waitForVariantTurn(page, side, { minMoves: before + 2, timeout: 120_000 })
			expect(rec.players[side].kind).toBe('human')
			expect(rec.players.filter((p) => p.kind === 'computer')).toHaveLength(V.sides.length - 1)
			await expect(page.locator('.qc-vgame__status')).toContainText('to move')
		})
	}
})
