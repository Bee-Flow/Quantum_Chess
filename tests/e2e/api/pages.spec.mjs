/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The app page and the per-user routes against a running Nextcloud: the page with its initial states, content
 * security policy and share link, the statistics, local results, the leaderboard, the preferences and the trainer
 * progress. Bob's preferences are reset at the end.
 */
import { api, appUrl, authHeaders, expect, expectApiError, getUser, apiTest as test } from '../helpers/index.mjs'

test.describe.configure({ mode: 'serial' })

const bob = getUser('bob')

test.afterAll(async () => {
	await api('bob', 'PUT', 'api/settings/preferences', { preferences: {} }).catch(() => {})
})

test('the app page carries the initial states, and the share link redirects', async () => {
	const { Authorization } = authHeaders('bob')
	const page = await fetch(appUrl(''), { headers: { Authorization } })
	const html = await page.text()
	expect(page.status, 'app page answers 200').toBe(200)
	expect(
		page.headers.get('content-security-policy') ?? '',
		'CSP allows same-origin workers',
	).toMatch(/worker-src[^;]*'self'/)
	const states = {}
	for (const match of html.matchAll(/id="initial-state-quantumchess-(\w+)" value="([^"]*)"/g)) {
		states[match[1]] = JSON.parse(Buffer.from(match[2], 'base64').toString('utf8'))
	}
	expect(
		Object.keys(states),
		'initial states',
	).toEqual(expect.arrayContaining(['user', 'features', 'preferences', 'lobby', 'trainerProgress', 'appVersion']))
	expect(
		states.user.uid === bob.uid && states.features.multiplayer === true && Array.isArray(states.lobby.yourTurn),
		'user, features and lobby have the documented shape',
	).toBe(true)
	expect(
		!Array.isArray(states.preferences) && !Array.isArray(states.trainerProgress),
		'preferences and trainer progress are objects',
	).toBe(true)
	const share = await fetch(appUrl('g/42'), { headers: { Authorization }, redirect: 'manual' })
	expect(
		share.status === 303 && share.headers.get('location').endsWith('/apps/quantumchess/#/game/42'),
		'share link redirects to #/game/42',
	).toBe(true)
})

test('statistics, local results and the leaderboard', async () => {
	const stats = await api('bob', 'GET', 'api/stats')
	expect(
		Number.isInteger(stats.online.rating) && 'askListing' in stats.online && Array.isArray(stats.ratingHistory),
		`online stats (rating ${stats.online.rating}, ${stats.online.ratedGames} rated games)`,
	).toBe(true)
	expect(
		stats.local.engine['1']
		&& stats.local.hotseat
		&& typeof stats.local.llm === 'object'
		&& !Array.isArray(stats.local.llm),
		'local stats shape',
	).toBeTruthy()
	const before = stats.local.engine['3'].w
	const local = await api('bob', 'POST', 'api/stats/local', {
		opponent: 'engine',
		level: 3,
		result: 'win',
		color: 'w',
	})
	expect(local.local.engine['3'].w, 'recording a local win against level 3').toBe(before + 1)
	await api('bob', 'POST', 'api/stats/local', { opponent: 'llm', persona: 'professor', result: 'draw', color: 'b' })
	expect(
		(await api('bob', 'GET', 'api/stats')).local.llm.professor.d,
		'recording an AI opponent draw',
	).toBeGreaterThanOrEqual(1)
	await expectApiError(
		api('bob', 'POST', 'api/stats/local', { opponent: 'engine', level: 9, result: 'win' }),
		400,
		'invalid_argument',
	)
	const board = await api('bob', 'GET', 'api/leaderboard')
	expect(
		['off', 'opt-in', 'opt-out'].includes(board.mode)
		&& Array.isArray(board.entries)
		&& Array.isArray(board.groups),
		`leaderboard (${board.mode}, ${board.entries.length} entries)`,
	).toBe(true)
	await expectApiError(api('bob', 'GET', 'api/leaderboard?group=not-my-group'), 400, 'invalid_argument')
})

test('preferences are stored as they are, and trainer progress merges', async () => {
	const prefs = await api('bob', 'PUT', 'api/settings/preferences', {
		preferences: { v: 1, boardTheme: 'quantum', future: { x: 1 } },
	})
	expect(
		prefs.preferences.boardTheme === 'quantum' && prefs.preferences.future.x === 1,
		'preferences stored verbatim',
	).toBe(true)
	await expectApiError(
		api('bob', 'PUT', 'api/settings/preferences', { preferences: { blob: 'x'.repeat(17000) } }),
		413,
		'too_large',
	)
	await api('bob', 'PUT', 'api/trainer/progress', {
		progress: {
			v: 1,
			lessons: { L01: { done: true, stars: 2, at: 200 } },
			xp: 50,
			streak: { last: '2026-09-20', days: 2, best: 4 },
		},
	})
	const merged = await api('bob', 'PUT', 'api/trainer/progress', {
		progress: {
			v: 1,
			lessons: { L01: { done: false, stars: 3, at: 100 }, L02: { done: true, stars: 1, at: 300 } },
			xp: 40,
			streak: { last: '2026-09-22', days: 1, best: 1 },
		},
	})
	const l01 = merged.progress.lessons.L01
	expect(
		l01.done === true && l01.stars === 3 && l01.at === 100 && merged.progress.lessons.L02.done === true,
		'lessons merge: done OR, stars max, earliest at',
	).toBe(true)
	expect(
		merged.progress.xp === 50 && merged.progress.streak.last === '2026-09-22' && merged.progress.streak.best === 4,
		'xp max, later streak wins with best max',
	).toBe(true)
	expect((await api('bob', 'GET', 'api/trainer/progress')).progress.lessons.L02.stars, 'progress is stored').toBe(1)
})
