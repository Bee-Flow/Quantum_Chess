/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Playing on the board of the app: clicking squares, waiting for the player's turn, reading the stored local game
 * and forcing the rolls of local games.
 */
import { applyMove, T } from '../../../src/engine/index.js'

const FILES = 'abcdefgh'

/**
 * An element by its data-test attribute.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} id data-test value
 * @return {import('@playwright/test').Locator}
 */
export function byTestId(page, id) {
	return page.locator(`[data-test="${id}"]`)
}

/**
 * Click a square of the (first) board on the page.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} square square name, e.g. 'e2'
 * @param {'w'|'b'} [orientation] the colour at the bottom of the board
 * @return {Promise<void>}
 */
export async function clickSquare(page, square, orientation = 'w') {
	const board = page.locator('.qc-board').first()
	await board.scrollIntoViewIfNeeded()
	const box = await board.boundingBox()
	const size = box.width / 8
	let file = FILES.indexOf(square[0])
	let rank = Number(square[1]) - 1
	if (orientation === 'b') {
		file = 7 - file
		rank = 7 - rank
	}
	await page.mouse.click(box.x + (file + 0.5) * size, box.y + (7 - rank + 0.5) * size)
}

/**
 * Wait until the board accepts input.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {number} [timeout] how long to wait, in milliseconds
 * @return {Promise<void>}
 */
export async function waitForTurn(page, timeout = 30_000) {
	await page.locator('.qc-board--interactive:not(.qc-board--busy)').waitFor({ timeout })
}

/**
 * The stored record of the local game that is open on the page (null when there is none).
 *
 * @param {import('@playwright/test').Page} page the page
 * @return {Promise<object|null>}
 */
export async function localGameRecord(page) {
	return page.evaluate(() => {
		const id = window.location.hash.split('/').pop()
		return JSON.parse(window.localStorage.getItem(`quantumchess/${document.head.dataset.user}/localGame.v1.` + id)
			?? 'null')
	})
}

/**
 * Let the page's rolls come from a queue: local games draw a roll as one Uint32 from crypto.getRandomValues and
 * shift it right by 8. Push 24-bit values with `page.evaluate((u) => window.__qcRolls.push(u), u)`; when the queue
 * is empty, rolls are random again. Call it before the page loads.
 *
 * @param {import('@playwright/test').Page} page the page
 * @return {Promise<void>}
 */
export async function installRollQueue(page) {
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

/**
 * A roll value that gives the wanted outcome of a move, computed with the rules engine.
 *
 * @param {object} state engine state before the move
 * @param {string} code move code
 * @param {string} key the wanted outcome key, for example 'capture', 'miss' or a square name for Measure
 * @return {number}
 */
export function rollFor(state, code, key) {
	for (const u of [0, T / 4, T / 2, (3 * T) / 4, T - 1]) {
		if ((applyMove(state, code, { u }).measurement?.key ?? null) === key) {
			return u
		}
	}
	throw new Error(`no roll gives ${key} for ${code}`)
}
