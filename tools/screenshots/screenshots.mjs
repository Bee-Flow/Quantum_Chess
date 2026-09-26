/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Produces the App Store screenshots listed in screenshots/README.md from a running Nextcloud:
 *
 *   QC_BASE_URL=http://127.0.0.1:8080 QC_NC_ROOT=/path/to/nextcloud npm run screenshots [-- <name> ...] [--out=<dir>]
 *
 * Local games are played through the board with forced rolls (the page's random source is replaced by a queue), the
 * online lobby is seeded through the API (seed-demo.mjs) and the AI opponent answers through the local fake
 * OpenAI-compatible server of the end-to-end tests. The variant games are pass & play games written into the browser
 * storage as the game screen saves them (tests/e2e/helpers/variants.mjs), then opened in the game screen. Every image
 * is written to screenshots/, replacing the old one. Names limit the run to the images whose file names start with
 * them (`08 09`; `variants` stands for 08 to 10), and `--out` writes the images into another directory, to review
 * them before they replace the old ones (select.mjs; a name that matches no image stops the run).
 */
/* eslint-disable no-console -- a command-line tool */
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'
import { applyMove, initialState, T } from '../../src/engine/index.js'
import { CATALOG } from '../../src/variants/catalog.js'
import { api } from '../../tests/e2e/helpers/api.mjs'
import { authFile, hasSavedLogin, saveLogin } from '../../tests/e2e/helpers/auth.mjs'
import { appRoot, appUrl, env, getUser } from '../../tests/e2e/helpers/env.mjs'
import { startFakeOpenAi } from '../../tests/e2e/helpers/fake-openai.mjs'
import { occ } from '../../tests/e2e/helpers/occ.mjs'
import { seedVariantGame } from '../../tests/e2e/helpers/variants.mjs'
import { seedDemo } from './seed-demo.mjs'
import { parseScreenshotArgs } from './select.mjs'

/** Where the images go, and whether this run makes one of the images named (file names without extension). */
const { out: OUT, wanted } = parseScreenshotArgs(process.argv.slice(2), join(appRoot, 'screenshots'))
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const FILES = 'abcdefgh'

/** The demo position of 01, 06 and 07: split knights, a queen linked to the knight, Black's king in danger. */
const DEMO_MOVES = ['e2-e4', 'e7-e5', 'g1-f3|h3', 'b8-a6|c6', 'd1-h5', 'f7-f6']
/** 02: the f3 part of the knight takes on e5, which also settles the linked queen. */
const ROLL_MOVE = 'f3-e5'

/**
 * The variant games of 09 and 10, pass & play: the moves (codes of the rules modules, each with outcome 0), then what
 * the player does before the shot: `whole` shows the whole board, `select` taps a square (a piece, whose targets and
 * other parts are then marked), `navigation: false` closes the app navigation to give the board the room.
 */
const MULTIVERSE_SCENE = {
	// Small (5 × 5): White's knight splits, one part travels into the past with a second split (timeline +1), the
	// other travels two turns back (timeline +2, still inactive). Black must move on +1 (gold) and may move on L0
	// (blue); ghosts on the boards of every timeline, the travel arrows and the 5D check lines.
	variant: 'multiverse',
	moves: [
		'(0)d1-(0)c3|(0)e3',
		'(0T1)a4-a3',
		'(0)c3-(0)~3a3|(0)~3e3',
		'(+1T1)c4-c3',
		'(0T2)b4-b3',
		'(+1T2)b2-c3',
		'(0T3)e3>>(0T1)d3',
	],
	navigation: false,
	whole: true,
}

/** The two boards of 10, side by side: in each game both sides have split a piece. */
const BOARD_SCENES = [
	{
		// the bishops are exchanged (Sente keeps one in hand, Gote drops its own), both rooks are split
		variant: 'shogi',
		moves: ['7g-7f', '3c-3d', '8h-2b=+b', '3a-2b', '2h-5h|4h', 'b@5e', '6i-7h', '8b-6b|4b'],
		select: '5h',
	},
	{
		// White's knight and Black's queen are split; the selected knight part shows its targets and its other part
		variant: 'hexagonal',
		moves: ['e4-e5', 'e7-e6', 'd1-c3|f4', 'e10-c6|e8'],
		select: 'c3',
	},
]

/**
 * A new logged-in page.
 *
 * @param {import('@playwright/test').Browser} browser the browser
 * @param {string} who test user
 * @param {object} [options] options
 * @param {boolean} [options.phone] phone size
 * @param {boolean} [options.dark] dark colour scheme
 * @param {number} [options.scale] device scale factor of a desktop page (for parts of the page shown smaller)
 * @return {Promise<import('@playwright/test').Page>}
 */
async function newPage(browser, who, { phone = false, dark = false, scale = 1 } = {}) {
	if (!hasSavedLogin(who)) {
		await saveLogin(browser, who)
	}
	const context = await browser.newContext({
		...(phone ? PHONE : { ...DESKTOP, deviceScaleFactor: scale }),
		storageState: authFile(who),
		colorScheme: dark ? 'dark' : 'light',
		locale: 'en-US',
		timezoneId: 'Europe/Amsterdam',
		reducedMotion: 'no-preference',
	})
	const page = await context.newPage()
	// Rolls of local games come from crypto.getRandomValues (one Uint32, shifted right by 8): a queue forces them
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
	return page
}

/**
 * Open a client-side route and wait for a selector.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} route route
 * @param {string} ready selector
 */
async function open(page, route, ready) {
	await page.goto(appUrl(`#/${route.replace(/^\//, '')}`))
	await page.locator(ready).first().waitFor({ state: 'visible', timeout: 30_000 })
}

/**
 * The centre of a square of the white-oriented board.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} square square name
 * @return {Promise<{x: number, y: number}>}
 */
async function squareCenter(page, square) {
	const box = await page.locator('.qc-board').first().boundingBox()
	const s = box.width / 8
	return { x: box.x + (FILES.indexOf(square[0]) + 0.5) * s, y: box.y + (8 - Number(square[1]) + 0.5) * s }
}

/**
 * Click (or tap) a square.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} square square name
 */
async function clickSquare(page, square) {
	const { x, y } = await squareCenter(page, square)
	await page.mouse.click(x, y)
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
 * Enter a move through the board: `a-b`, `a-b|c` (split), `a|b-c` (merge) or `?a` (Measure).
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} code move code
 */
async function enterMove(page, code) {
	await waitForTurn(page)
	let m
	if ((m = code.match(/^\?([a-h][1-8])$/))) {
		await page.keyboard.press('4')
		await clickSquare(page, m[1])
		await clickSquare(page, m[1])
	} else if ((m = code.match(/^([a-h][1-8])\|([a-h][1-8])-([a-h][1-8])$/))) {
		await page.keyboard.press('3')
		await clickSquare(page, m[1])
		await clickSquare(page, m[3])
	} else if ((m = code.match(/^([a-h][1-8])-([a-h][1-8])\|([a-h][1-8])$/))) {
		await page.keyboard.press('2')
		await clickSquare(page, m[1])
		await clickSquare(page, m[2])
		await clickSquare(page, m[3])
	} else if ((m = code.match(/^([a-h][1-8])-([a-h][1-8])$/))) {
		await page.keyboard.press('1')
		await clickSquare(page, m[1])
		await clickSquare(page, m[2])
	} else {
		throw new Error('unsupported move code ' + code)
	}
	// the king safety net asks before a move that exposes the king (the demo does that on purpose)
	const playAnyway = page.getByRole('button', { name: 'Play anyway' })
	if (await playAnyway.isVisible({ timeout: 700 }).catch(() => false)) {
		await playAnyway.click()
	}
}

/**
 * A roll value that gives the wanted outcome.
 *
 * @param {object} state engine state before the move
 * @param {string} code move code
 * @param {string} key outcome key
 * @return {number}
 */
function uFor(state, code, key) {
	for (const u of [0, T / 4, T / 2, (3 * T) / 4, T - 1]) {
		if (applyMove(state, code, { u }).measurement?.key === key) {
			return u
		}
	}
	throw new Error(`no roll gives ${key} for ${code}`)
}

/**
 * Start a pass & play game and play the demo position.
 *
 * @param {import('@playwright/test').Page} page the page
 */
async function playDemo(page) {
	await open(page, '/new?mode=local', '[data-test=start-game]')
	await page.locator('[data-test=start-game]').click()
	for (const code of DEMO_MOVES) {
		await enterMove(page, code)
	}
	await waitForTurn(page)
	await page.mouse.move(0, 0)
	await page.waitForTimeout(800)
}

/**
 * Save a screenshot.
 *
 * @param {import('@playwright/test').Page} page the page
 * @param {string} name file name without extension
 */
async function save(page, name) {
	// focusing a square can scroll the page on small screens: show the top
	await page.evaluate(() => document.querySelectorAll('*').forEach((el) => {
		if (el.scrollTop > 0) {
			el.scrollTop = 0
		}
	}))
	await page.waitForTimeout(200)
	await page.screenshot({ path: join(OUT, name + '.png') })
	console.info('✓ ' + relative(appRoot, join(OUT, name + '.png')))
}

/**
 * Render HTML at a size and save it (composites and the thumbnail).
 *
 * @param {import('@playwright/test').Browser} browser the browser
 * @param {string} html page content
 * @param {{width: number, height: number}} size size
 * @param {string} name file name without extension
 */
async function renderHtml(browser, html, size, name) {
	const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 })
	await page.setContent(html)
	await page.waitForLoadState('load')
	await save(page, name)
	await page.close()
}

const dataUrl = (file) => 'data:image/png;base64,' + readFileSync(file).toString('base64')

/**
 * Store a pass & play variant game for carol, open it in the game screen and do what the scene asks before the shot.
 *
 * @param {import('@playwright/test').Browser} browser the browser
 * @param {object} scene the game (`seedVariantGame`) and `navigation`, `whole` and `select` (see `MULTIVERSE_SCENE`)
 * @param {object} [options] options of `newPage`
 * @return {Promise<import('@playwright/test').Page>} the page, ready for the shot
 */
async function openVariantScene(browser, scene, options = {}) {
	const page = await newPage(browser, 'carol', options)
	await open(page, '/variants', '.qc-variants__tile')
	const id = await seedVariantGame(page, scene)
	await open(page, `/variants/${scene.variant}/${id}`, 'svg.qc-vboard')
	if (scene.navigation === false) {
		await page.locator('button.app-navigation-toggle').first().click()
		await page.waitForTimeout(600)
	}
	if (scene.whole) {
		await page.getByRole('button', { name: 'Whole board' }).click()
	}
	if (scene.select) {
		await page.locator(`.qc-vboard__cell[data-square="${scene.select}"]`).click()
	}
	await page.mouse.move(0, 0)
	await page.waitForTimeout(800)
	return page
}

/**
 * Preferences for clean demo boards: the defaults, and no confirmation step for rolled moves.
 *
 * @param {string} who test user
 */
async function demoPreferences(who) {
	await api(who, 'PUT', 'api/settings/preferences', { preferences: { confirmMoves: 'never', coachLevel: 'off' } })
}

const browser = await chromium.launch(env.chromium ? { executablePath: env.chromium } : {})
mkdirSync(OUT, { recursive: true })
try {
	for (const who of ['admin', 'bob', 'carol']) {
		await occ(['user:setting', getUser(who).uid, 'core', 'lang', 'en'], { allowFailure: true })
	}
	await demoPreferences('carol')
	await demoPreferences('bob')

	// 01 (+ small), 06, 07: the demo position; the h5 part of the queen is selected, so its thread and link show
	for (const [name, options] of [
		['01-game-ghosts', {}],
		['06-dark', { dark: true }],
		['07-phone', { phone: true }],
	].filter(([name]) => wanted(name, name + '-small'))) {
		const page = await newPage(browser, 'carol', options)
		await playDemo(page)
		await clickSquare(page, 'h5')
		await page.waitForTimeout(600)
		await save(page, name)
		await page.context().close()
	}
	if (wanted('01-game-ghosts', '01-game-ghosts-small')) {
		await renderHtml(
			browser,
			`<body style="margin:0"><img src="${dataUrl(join(OUT, '01-game-ghosts.png'))}" style="width:720px;height:450px;display:block"></body>`,
			{ width: 720, height: 450 },
			'01-game-ghosts-small',
		)
	}

	// 02: the roll of f3-e5, forced to capture; the log tab shows the roll bar
	if (wanted('02-roll')) {
		const page = await newPage(browser, 'carol')
		await playDemo(page)
		let state = initialState()
		for (const code of DEMO_MOVES) {
			state = applyMove(state, code, { u: 0 }).state
		}
		await page.evaluate((u) => window.__qcRolls.push(u), uFor(state, ROLL_MOVE, 'capture'))
		await page.locator('[data-test=tab-log]').click()
		await enterMove(page, ROLL_MOVE)
		await page.waitForTimeout(2600)
		await page.mouse.move(0, 0)
		await save(page, '02-roll')
		await page.context().close()
	}

	// 04: lesson 4 with its task and all three hints (text, highlight, arrow)
	if (wanted('04-trainer')) {
		const page = await newPage(browser, 'carol')
		await open(page, '/trainer/lesson/L04', '[data-test=lesson-card]')
		for (let i = 0; i < 3; i++) {
			await page.locator('[data-test=lesson-hint]').click()
			await page.waitForTimeout(300)
		}
		await page.waitForTimeout(600)
		await save(page, '04-trainer')
		await page.context().close()
	}

	// 03 and 05 with an AI source for bob: the fake OpenAI-compatible server plays Captain Collapse
	if (wanted('03-lobby-dashboard', '05-ai-opponent')) {
		const fake = await startFakeOpenAi({
			comment: [
				'Arr, the centre be mine! Watch me knight, matey.',
				'Two knights where there was one? Ye cannot fool an old sea dog!',
			],
		})
		const before = await api('admin', 'GET', 'api/settings/admin')
		try {
			await api('admin', 'PUT', 'api/settings/admin', {
				local_allowlist: [fake.baseUrl],
				allow_personal_keys: true,
			})
			await api('bob', 'PUT', 'api/settings/personal', {
				provider: { preset: 'custom', baseUrl: fake.baseUrl, model: 'fake-chess-1' },
				apiKey: 'sk-demo-0000',
				defaultSource: 'personal',
			})
			await api('bob', 'POST', 'api/ai/notice', { source: 'personal' })

			// 03: bob's lobby next to his dashboard widget
			if (wanted('03-lobby-dashboard')) {
				await seedDemo()
				const home = await newPage(browser, 'bob')
				await open(home, '/', '.qc-home')
				await home.waitForTimeout(1500)
				const lobby = join(OUT, '.lobby.png')
				await home.screenshot({ path: lobby })
				await home.goto(`${env.baseURL}${env.indexPhp}/apps/dashboard/`)
				const panel = home.locator('.panel', { hasText: 'Quantum Chess' }).first()
				await panel.waitFor({ timeout: 30_000 })
				await home.waitForTimeout(1500)
				const widget = join(OUT, '.widget.png')
				await panel.screenshot({ path: widget })
				await home.context().close()
				const body = 'margin:0;width:1440px;height:900px;overflow:hidden;'
					+ 'background:linear-gradient(135deg,#0082c9,#1cafff);'
					+ 'display:flex;align-items:center;justify-content:center;gap:40px'
				const card = 'border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.35)'
				await renderHtml(browser, `<body style="${body}">
					<img src="${dataUrl(lobby)}" style="width:1000px;${card}">
					<img src="${dataUrl(widget)}" style="width:320px;${card};background:#fff">
				</body>`, { width: 1440, height: 900 }, '03-lobby-dashboard')
				rmSync(lobby)
				rmSync(widget)
			}

			// 05: a game against Captain Collapse with the persona's comments
			if (wanted('05-ai-opponent')) {
				const page = await newPage(browser, 'bob')
				await open(page, '/new?mode=ai', '[data-test=start-game]')
				await page.locator('[data-test=persona-captain]').click()
				await page.locator('input[name=qc-ai-color][value=w]').check({ force: true })
				await page.locator('[data-test=start-game]').click()
				await enterMove(page, 'e2-e4')
				await page.locator('.qc-moves__move').nth(1).waitFor({ timeout: 45_000 })
				await waitForTurn(page)
				await enterMove(page, 'g1-f3|h3')
				await page.locator('.qc-moves__move').nth(3).waitFor({ timeout: 45_000 })
				await waitForTurn(page)
				await page.locator('[data-test=tab-chat]').click()
				await page.mouse.move(0, 0)
				await page.waitForTimeout(800)
				await save(page, '05-ai-opponent')
				await page.context().close()
			}
		} finally {
			await api('bob', 'PUT', 'api/settings/personal', { provider: null, apiKey: '', defaultSource: null })
				.catch(() => {})
			await api('admin', 'PUT', 'api/settings/admin', {
				local_allowlist: before.local_allowlist,
				allow_personal_keys: before.allow_personal_keys,
			}).catch(() => {})
			await fake.close()
		}
	}

	// 08: the catalogue of the variants
	if (wanted('08-variants')) {
		const page = await newPage(browser, 'carol')
		await open(page, '/variants', '.qc-variants__tile')
		await page.mouse.move(0, 0)
		await page.waitForTimeout(800)
		await save(page, '08-variants')
		await page.context().close()
	}

	// 09: multiverse chess in the game screen
	if (wanted('09-multiverse')) {
		const page = await openVariantScene(browser, MULTIVERSE_SCENE)
		await save(page, '09-multiverse')
		await page.context().close()
	}

	// 10: the boards of two more variants, each taken from its game screen (at scale 2, as they are shown smaller)
	if (wanted('10-variant-boards')) {
		const cards = []
		for (const scene of BOARD_SCENES) {
			const page = await openVariantScene(browser, scene, { scale: 2 })
			// the navigation toggle floats over the top left corner of the content
			await page.addStyleTag({ content: '.app-navigation-toggle-wrapper { visibility: hidden !important }' })
			const file = join(OUT, `.${scene.variant}.png`)
			await page.locator('.qc-vgame__board').screenshot({ path: file })
			cards.push({ name: CATALOG.find((e) => e.id === scene.variant).name(), file })
			await page.context().close()
		}
		const body = 'margin:0;width:1440px;height:900px;overflow:hidden;box-sizing:border-box;padding:0 48px;'
			+ 'background:linear-gradient(135deg,#0082c9,#1cafff);font-family:sans-serif;'
			+ 'display:flex;align-items:center;justify-content:center;gap:48px'
		const card = 'flex:1;height:820px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;'
			+ 'gap:12px;padding:20px 24px;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.35);background:#fff'
		await renderHtml(browser, `<body style="${body}">${cards.map((c) => `<div style="${card}">
			<div style="font-size:28px;font-weight:bold;color:#222">${c.name}</div>
			<img src="${dataUrl(c.file)}" style="flex:1;min-height:0;width:100%;object-fit:contain">
		</div>`).join('')}</body>`, { width: 1440, height: 900 }, '10-variant-boards')
		cards.forEach((c) => rmSync(c.file))
	}
} finally {
	// back to the defaults, so that later end-to-end runs find the users as the global setup left them
	for (const who of ['bob', 'carol']) {
		await api(who, 'PUT', 'api/settings/preferences', { preferences: {} }).catch(() => {})
	}
	await browser.close()
}
