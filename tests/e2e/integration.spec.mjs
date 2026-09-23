/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Integration checks across modules (package D1, docs/LEAN-1.0.md):
 *
 * - pass & play through every move type: split, merge, Measure and a rolled capture (rolls forced through the page's
 *   random source, the outcome computed with the real engine);
 * - a game against an AI opponent answered by a local fake OpenAI-compatible server (tests/api/fake-openai.mjs);
 * - an online invitation accepted from the Nextcloud notification, followed by the first move;
 * - the browser tab title and the page in another language.
 *
 * The other main flows have their own specs: computer game and undo (frontend-app), the full online game
 * (frontend-online), trainer lessons (trainer), coach and review (coach-review), settings pages (backend-ai).
 */
import { applyMove, initialState, T } from '../../src/engine/index.js'
import { startFakeOpenAi } from '../api/fake-openai.mjs'
import { api, expect, getUser, occ, openApp, test } from './helpers/index.mjs'

const FILES = 'abcdefgh'

/**
 * Click a square of the white-oriented board.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} square square name, e.g. 'e2'
 */
async function clickSquare(page, square) {
	const box = await page.locator('.qc-board').first().boundingBox()
	const s = box.width / 8
	const f = FILES.indexOf(square[0])
	const r = Number(square[1]) - 1
	await page.mouse.click(box.x + (f + 0.5) * s, box.y + (7 - r + 0.5) * s)
}

/**
 * Wait until the board accepts input.
 *
 * @param {import('@playwright/test').Page} page the page
 */
async function waitForTurn(page) {
	await page.locator('.qc-board--interactive:not(.qc-board--busy)').waitFor({ timeout: 30_000 })
}

/**
 * The move codes of the open local game.
 *
 * @param {import('@playwright/test').Page} page the page
 * @return {Promise<string[]>}
 */
async function localMoves(page) {
	return page.evaluate(() => {
		const id = window.location.hash.split('/').pop()
		const rec = JSON.parse(window.localStorage.getItem(`quantumchess/${document.head.dataset.user}/localGame.v1.` + id) ?? 'null')
		return rec ? rec.moves.map((m) => m.code) : []
	})
}

/**
 * A roll value that gives the wanted outcome for a move in a position.
 *
 * @param {object} state engine state before the move
 * @param {string} code move code
 * @param {string} key wanted outcome key (for example 'capture', 'miss' or a square name for Measure)
 * @return {number}
 */
function uFor(state, code, key) {
	for (const u of [0, T / 4, T / 2, (3 * T) / 4, T - 1]) {
		const res = applyMove(state, code, { u })
		if ((res.measurement?.key ?? null) === key) {
			return u
		}
	}
	throw new Error(`no roll gives ${key} for ${code}`)
}

/**
 * Make the page's next 24-bit roll values come from a queue (localGames.drawU reads one Uint32 from
 * crypto.getRandomValues and shifts it right by 8).
 *
 * @param {import('@playwright/test').Page} page the page
 */
async function installRollQueue(page) {
	await page.addInitScript(() => {
		const original = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
		window.__qcRolls = []
		globalThis.crypto.getRandomValues = (array) => {
			if (array instanceof Uint32Array && array.length === 1 && window.__qcRolls.length > 0) {
				array[0] = (window.__qcRolls.shift() << 8) >>> 0
				return array
			}
			return original(array)
		}
	})
}

test.describe('pass & play', () => {
	test.use({ user: 'carol' })

	test.afterAll(async () => {
		await api('carol', 'PUT', 'api/settings/preferences', { preferences: {} }).catch(() => {})
	})

	test('split, merge, Measure and a rolled capture @phone', async ({ page }, testInfo) => {
		// the same moves in the engine, to know which roll values give which outcome
		const codes = ['g1-f3|h3', 'e7-e5', 'f3|h3-g1', 'b8-a6|c6', 'g1-f3|h3', '?a6', 'f3-e5']
		const states = [initialState()]
		for (const code of codes.slice(0, -1)) {
			states.push(applyMove(states.at(-1), code, { u: 0 }).state)
		}
		const measureU = uFor(states[5], '?a6', 'a6')
		const captureU = uFor(states[6], 'f3-e5', 'capture')

		await installRollQueue(page)
		// Confirm moves off, so a rolled move is played by the click on its target also on touch screens
		await api('carol', 'PUT', 'api/settings/preferences', { preferences: { confirmMoves: 'never' } })
		await openApp(page, '/new?mode=local', { ready: '[data-test=start-game]' })
		await page.locator('[data-test=start-game]').click()
		await waitForTurn(page)

		// 1. White splits the knight
		await page.keyboard.press('2')
		await clickSquare(page, 'g1')
		await clickSquare(page, 'f3')
		await clickSquare(page, 'h3')
		await expect.poll(() => localMoves(page)).toEqual(codes.slice(0, 1))
		await expect(page.locator('.qc-board')).toContainText('50')
		await waitForTurn(page)

		// 1… a pawn move
		await page.keyboard.press('1')
		await clickSquare(page, 'e7')
		await clickSquare(page, 'e5')
		await expect.poll(() => localMoves(page)).toEqual(codes.slice(0, 2))
		await waitForTurn(page)

		// 2. White merges the two parts back on g1
		await page.keyboard.press('3')
		await clickSquare(page, 'f3')
		await clickSquare(page, 'g1')
		await expect.poll(() => localMoves(page)).toEqual(codes.slice(0, 3))
		await waitForTurn(page)

		// 2… Black splits, 3. White splits again
		await page.keyboard.press('2')
		await clickSquare(page, 'b8')
		await clickSquare(page, 'a6')
		await clickSquare(page, 'c6')
		await expect.poll(() => localMoves(page)).toEqual(codes.slice(0, 4))
		await waitForTurn(page)
		await page.keyboard.press('2')
		await clickSquare(page, 'g1')
		await clickSquare(page, 'f3')
		await clickSquare(page, 'h3')
		await expect.poll(() => localMoves(page)).toEqual(codes.slice(0, 5))
		await waitForTurn(page)

		// 3… Black measures the knight: it is on a6
		await page.evaluate((u) => window.__qcRolls.push(u), measureU)
		await page.keyboard.press('4')
		await clickSquare(page, 'a6')
		await clickSquare(page, 'a6')
		await expect.poll(() => localMoves(page)).toEqual(codes.slice(0, 6))
		await waitForTurn(page)

		// 4. White's half-knight on f3 takes on e5: a rolled capture, forced to succeed
		await page.evaluate((u) => window.__qcRolls.push(u), captureU)
		await page.keyboard.press('1')
		await clickSquare(page, 'f3')
		await clickSquare(page, 'e5')
		await expect.poll(() => localMoves(page), { timeout: 15_000 }).toEqual(codes)
		await expect(page.locator('.qc-board')).toContainText(/Captured/i, { timeout: 15_000 })
		await testInfo.attach('pass-and-play', { body: await page.screenshot(), contentType: 'image/png' })

		// the roll log lists the Measure and the capture
		const log = page.locator('[data-test=tab-log]')
		if (await log.isVisible()) {
			await log.click()
			await expect(page.locator('.qc-rolls')).toContainText(/Captured/i)
			await expect(page.locator('.qc-rolls')).toContainText(/Measure/i)
		}
	})
})

test.describe('AI opponent', () => {
	test.use({ user: 'bob' })
	/** @type {Awaited<ReturnType<typeof startFakeOpenAi>>} */
	let fake
	let adminBefore

	test.beforeAll(async () => {
		fake = await startFakeOpenAi()
		adminBefore = await api('admin', 'GET', 'api/settings/admin')
		await api('admin', 'PUT', 'api/settings/admin', { local_allowlist: [fake.baseUrl], allow_personal_keys: true })
		await api('bob', 'PUT', 'api/settings/personal', {
			provider: { preset: 'custom', baseUrl: fake.baseUrl, model: 'fake-chess-1' },
			apiKey: 'sk-test-e2e-1234',
			defaultSource: 'personal',
		})
		await api('bob', 'POST', 'api/ai/notice', { source: 'personal' })
	})

	test.afterAll(async () => {
		await api('bob', 'PUT', 'api/settings/personal', { provider: null, apiKey: '', defaultSource: null }).catch(() => {})
		if (adminBefore) {
			await api('admin', 'PUT', 'api/settings/admin', {
				local_allowlist: adminBefore.local_allowlist,
				allow_personal_keys: adminBefore.allow_personal_keys,
			}).catch(() => {})
		}
		await fake?.close()
	})

	test('the persona answers with the provider\'s move and comment', async ({ page }, testInfo) => {
		await openApp(page, '/new?mode=ai', { ready: '[data-test=start-game]' })
		await page.locator('.qc-new-game__persona', { hasText: 'Professor Qubit' }).click()
		await page.locator('input[name=qc-ai-color][value=w]').check({ force: true })
		await page.locator('[data-test=start-game]').click()
		await waitForTurn(page)
		await clickSquare(page, 'e2')
		await clickSquare(page, 'e4')
		// the fake model plays the engine's first candidate and says so in the chat
		await expect(page.locator('.qc-moves__move')).toHaveCount(2, { timeout: 45_000 })
		await expect(page.getByText('A fine, solid move to start with!').first()).toBeVisible({ timeout: 15_000 })
		const chats = fake.requests.filter((r) => r.path.endsWith('/chat/completions'))
		expect(chats.length).toBeGreaterThan(0)
		expect(JSON.stringify(chats[0].body)).toContain('Professor Qubit')
		await testInfo.attach('ai-opponent', { body: await page.screenshot(), contentType: 'image/png' })
	})
})

test.describe('online invitation from a notification', () => {
	test.use({ user: 'bob' })

	test('bob accepts in the notification panel and the game opens', async ({ page }) => {
		// no open invitation between the two (one per pair)
		const lobby = await api('admin', 'GET', 'api/games')
		for (const g of lobby.outgoing ?? []) {
			if (g.opponent?.userId === getUser('bob').uid) {
				await api('admin', 'POST', `api/games/${g.id}/cancel`)
			}
		}
		const { game } = await api('admin', 'POST', 'api/games', { opponent: getUser('bob').uid, rated: false, timeControl: 'corr:3d', color: 'b' })
		await openApp(page, '/', { ready: '.qc-home' })
		await page.locator('#notifications .header-menu__trigger, #notifications button').first().click()
		const item = page.locator('.notification', { hasText: /invited you/ }).first()
		await expect(item).toBeVisible({ timeout: 15_000 })
		await item.getByRole('button', { name: 'Accept' }).click()
		await expect.poll(async () => {
			const res = await api('bob', 'GET', `api/games/${game.id}`)
			return (res.game ?? res).status
		}).toBe('active')
		await openApp(page, `/game/${game.id}`, { ready: '.qc-board' })
		await waitForTurn(page)
		await clickSquare(page, 'd2')
		await clickSquare(page, 'd4')
		await expect.poll(async () => {
			const res = await api('admin', 'GET', `api/games/${game.id}`)
			return (res.game ?? res).moves?.length ?? 0
		}, { timeout: 15_000 }).toBe(1)
		await api('bob', 'POST', `api/games/${game.id}/abort`).catch(() => {})
	})
})

test.describe('title and languages', () => {
	test.use({ user: 'carol' })

	test.afterEach(async () => {
		await occ(['user:setting', getUser('carol').uid, 'core', 'lang', 'en'])
	})

	test('the tab title names the app and the lobby speaks Dutch', async ({ page }) => {
		await openApp(page, '/', { ready: '.qc-home' })
		await expect(page).toHaveTitle(/^(\(\d+\) )?Quantum Chess - /)
		expect(await page.title()).not.toContain('[object')
		await occ(['user:setting', getUser('carol').uid, 'core', 'lang', 'nl'])
		await page.reload()
		await page.locator('.qc-home').waitFor()
		await expect(page.locator('[data-test=tile-computer]')).toContainText('Computer')
		await expect(page.locator('.qc-home')).toContainText('Samen spelen')
	})
})
