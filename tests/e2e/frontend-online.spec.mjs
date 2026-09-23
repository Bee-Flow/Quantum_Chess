/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Online games between two users in two browser contexts (frontend-online, IMPLEMENTATION-PLAN §5.9): admin invites
 * bob from the New game dialog, bob accepts in his lobby, both play a split and a rolled capture that the other side
 * sees through polling, chat both ways, a draw offer declined, resignation with the rating change on both sides and a
 * rematch that starts for both. Screenshots go to test-results/online/ (desktop 1440×900 and phone 390×844).
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { resultsDir } from './helpers/env.mjs'
import { api, expect, getUser, openApp, test } from './helpers/index.mjs'

const SHOTS = join(resultsDir, 'online')
const FILES = 'abcdefgh'
const PHONE = { width: 390, height: 844 }

test.use({ user: 'admin' })
test.setTimeout(240_000)

/**
 * Click a square of the board, whatever its orientation.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} square square name, e.g. 'e2'
 * @param {'w'|'b'} orientation colour at the bottom
 */
async function clickSquare(page, square, orientation) {
	const box = await page.locator('.qc-board').first().boundingBox()
	const s = box.width / 8
	let f = FILES.indexOf(square[0])
	let r = Number(square[1]) - 1
	if (orientation === 'b') {
		f = 7 - f
		r = 7 - r
	}
	await page.mouse.click(box.x + (f + 0.5) * s, box.y + (7 - r + 0.5) * s)
}

/**
 * Wait until the board accepts input.
 *
 * @param {import('@playwright/test').Page} page the page
 */
async function waitForTurn(page) {
	await page.locator('.qc-board--interactive:not(.qc-board--busy)').waitFor({ timeout: 60_000 })
}

/**
 * @param {import('@playwright/test').Page} page the page
 * @param {string} name file name without extension
 */
async function shot(page, name) {
	await page.waitForTimeout(300)
	await page.screenshot({ path: join(SHOTS, name + '.png') })
}

/**
 * End leftover games between the test users so that the lobby is tidy.
 */
async function tidy() {
	for (const who of ['admin', 'bob']) {
		const lobby = await api(who, 'GET', 'api/games')
		for (const g of lobby.outgoing) {
			await api(who, 'POST', `api/games/${g.id}/cancel`).catch(() => {})
		}
		for (const g of lobby.invitations) {
			await api(who, 'POST', `api/games/${g.id}/decline`).catch(() => {})
		}
		for (const g of [...lobby.yourTurn, ...lobby.waiting]) {
			await api(who, 'POST', `api/games/${g.id}/${g.ply < 2 ? 'abort' : 'resign'}`).catch(() => {})
		}
	}
}

test('two users play an online game end to end', async ({ page: alice, openAs }) => {
	mkdirSync(SHOTS, { recursive: true })
	await tidy()
	const { page: bob } = await openAs('bob')
	const bobUid = getUser('bob').uid

	// --- invitation from the New game dialog
	await openApp(alice, `/new?mode=online&opponent=${bobUid}`, { ready: '[data-test=start-game]' })
	await alice.getByLabel('Message (optional)').fill('Fancy a quantum game?')
	await alice.locator('[data-test=start-game]').click()
	await alice.waitForURL(/#\/game\/\d+$/)
	const id = Number(alice.url().split('/').pop())
	await expect(alice.locator('[data-test=invitation-panel]')).toContainText('Waiting for')
	await shot(alice, 'desktop-01-waiting-for-accept')

	// --- bob sees it in the lobby and the navigation, and accepts inline
	await openApp(bob, '/', { ready: '.qc-home' })
	await expect(bob.locator(`[data-test=lobby-game-${id}]`)).toContainText('Fancy a quantum game?')
	await shot(bob, 'desktop-02-lobby-invitation')
	await bob.locator(`[data-test=lobby-accept-${id}]`).click()
	await bob.waitForURL(new RegExp(`#/game/${id}$`))
	await expect(alice.locator('[data-test=invitation-panel]')).toHaveCount(0, { timeout: 30_000 })

	const game = (await api('admin', 'GET', `api/games/${id}`)).game
	const aliceIsWhite = game.white.userId === getUser('admin').uid
	const white = aliceIsWhite ? alice : bob
	const black = aliceIsWhite ? bob : alice

	// --- a split (quantum move) by White, seen by Black
	await waitForTurn(white)
	await white.keyboard.press('2')
	await clickSquare(white, 'g1', 'w')
	await clickSquare(white, 'f3', 'w')
	await clickSquare(white, 'h3', 'w')
	await expect(black.locator('.qc-moves__move')).toHaveCount(1, { timeout: 45_000 })
	await shot(black, 'desktop-03-opponent-split')

	// --- Black answers, White plays the rolled capture f3xe5
	await waitForTurn(black)
	await clickSquare(black, 'e7', 'b')
	await clickSquare(black, 'e5', 'b')
	await expect(white.locator('.qc-moves__move')).toHaveCount(2, { timeout: 45_000 })
	await waitForTurn(white)
	await white.keyboard.press('1')
	await clickSquare(white, 'f3', 'w')
	await clickSquare(white, 'e5', 'w')
	// Black sees the roll through polling (with the roll animation), both show the same result
	await expect(black.locator('.qc-moves__move')).toHaveCount(3, { timeout: 45_000 })
	await shot(black, 'desktop-04-opponent-rolled-capture')
	await expect(white.locator('.qc-moves__move')).toHaveCount(3)
	const moves = (await api('admin', 'GET', `api/games/${id}`)).game.moves
	expect(moves[2].measurement?.key).toMatch(/^(capture|miss)$/)
	const lastWhite = await white.locator('.qc-moves__move').nth(2).innerText()
	const lastBlack = await black.locator('.qc-moves__move').nth(2).innerText()
	expect(lastBlack).toBe(lastWhite)

	// --- chat both ways (quick phrase and plain text; HTML stays text)
	await white.locator('[data-test=tab-chat]').click()
	await white.locator('[data-test=phrase-nice_split]').click()
	await black.locator('[data-test=tab-chat]').click()
	await expect(black.locator('[data-test=game-chat]')).toContainText('Nice split!', { timeout: 45_000 })
	await black.locator('[data-test=game-chat]').getByRole('textbox', { name: 'Message' }).fill('<b>thanks</b> 🙂')
	await black.locator('[data-test=chat-send]').click()
	await expect(white.locator('[data-test=game-chat]')).toContainText('<b>thanks</b> 🙂', { timeout: 45_000 })
	await shot(white, 'desktop-05-chat')

	// --- draw offer declined
	await white.locator('[data-test=offer-draw]').click()
	await expect(white.locator('[data-test=draw-offer]')).toContainText('You offered a draw')
	await expect(black.locator('[data-test=draw-offer]')).toContainText('offers a draw', { timeout: 45_000 })
	await shot(black, 'desktop-06-draw-offer')
	await black.locator('[data-test=draw-decline]').click()
	await expect(black.locator('[data-test=draw-offer]')).toHaveCount(0)
	await expect(white.locator('[data-test=draw-offer]')).toHaveCount(0, { timeout: 45_000 })
	await expect(white.locator('[data-test=offer-draw]')).toBeDisabled()

	// --- Black resigns: game over with the rating change on both sides
	await black.locator('[data-test=resign]').click()
	await black.locator('[data-test=confirm-action]').click()
	await expect(black.locator('[data-test=game-over]')).toContainText('You lost', { timeout: 15_000 })
	await expect(black.locator('[data-test=game-over]')).toContainText('Rating')
	await expect(white.locator('[data-test=game-over]')).toContainText('You won!', { timeout: 45_000 })
	await expect(white.locator('[data-test=game-over]')).toContainText('Rating')
	await shot(white, 'desktop-07-game-over-winner')
	await shot(black, 'desktop-08-game-over-loser')

	// --- rematch: White offers, Black accepts from the banner, both land in the new game
	await white.locator('[data-test=game-over] [data-test=rematch]').click()
	await expect(white.locator('[data-test=rematch-pending]')).toContainText('Waiting for an answer', { timeout: 15_000 })
	await black.locator('[data-test=game-over] button').filter({ hasText: 'Close' }).click()
	await expect(black.locator('[data-test=rematch-offer]')).toBeVisible({ timeout: 45_000 })
	await shot(black, 'desktop-09-rematch-offer')
	await black.locator('[data-test=rematch-accept]').click()
	await black.waitForURL((url) => !url.hash.endsWith(`/game/${id}`), { timeout: 15_000 })
	const rematchId = Number(black.url().split('/').pop())
	await white.waitForURL(new RegExp(`#/game/${rematchId}$`), { timeout: 45_000 })
	const rematch = (await api('admin', 'GET', `api/games/${rematchId}`)).game
	expect(rematch.status).toBe('active')
	expect(rematch.white.userId).toBe(game.black.userId)
	await shot(black, 'desktop-10-rematch-started')

	// --- phone screenshots of the lobby and the running game
	const phone = await openAs('bob', { viewport: PHONE, isMobile: true, hasTouch: true })
	await openApp(phone.page, '/', { ready: '.qc-home' })
	await shot(phone.page, 'phone-01-lobby')
	await openApp(phone.page, `/game/${rematchId}`, { ready: '.qc-board' })
	await shot(phone.page, 'phone-02-game')
	await phone.page.locator('[data-test=tab-chat]').click()
	await phone.page.locator('[data-test=tab-chat]').scrollIntoViewIfNeeded()
	await shot(phone.page, 'phone-03-chat')
	await openApp(phone.page, `/game/${id}`, { ready: '.qc-board' })
	await shot(phone.page, 'phone-04-finished')
	await openApp(phone.page, '/stats', { ready: '[data-test=stats-online]' })
	await shot(phone.page, 'phone-05-stats')
	await openApp(alice, '/stats', { ready: '[data-test=stats-online]' })
	await shot(alice, 'desktop-11-stats')

	await api('bob', 'POST', `api/games/${rematchId}/abort`).catch(() => {})
})
