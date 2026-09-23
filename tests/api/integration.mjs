/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * End-to-end check of the integration routes against a running Nextcloud (docs/SPEC.md §7.4.6, §13): the app page
 * (initial states, CSP, share link), statistics, local statistics, leaderboard, preferences and trainer progress.
 * Run tests/api/games.mjs first so that bob has rated games.
 *
 * Usage: node tests/api/integration.mjs   (QC_BASE_URL defaults to http://127.0.0.1:8080)
 */
import { api, ApiError } from '../e2e/helpers/api.mjs'
import { appUrl, env, getUser } from '../e2e/helpers/env.mjs'

let passed = 0

/**
 * @param {any} condition must be truthy
 * @param {string} message what was checked
 */
function check(condition, message) {
	if (!condition) {
		throw new Error('FAILED: ' + message)
	}
	passed++
	process.stdout.write(`  ✓ ${message}\n`)
}

/**
 * @param {Promise<any>} promise the call
 * @param {number} status expected HTTP status
 * @param {string} code expected error code
 */
async function expectError(promise, status, code) {
	try {
		await promise
	} catch (error) {
		if (error instanceof ApiError) {
			check(error.status === status && error.body?.error === code, `answers ${status} ${code}`)
			return
		}
		throw error
	}
	throw new Error(`FAILED: expected ${status} ${code}`)
}

const bob = getUser('bob')
const auth = 'Basic ' + Buffer.from(`${bob.uid}:${bob.password}`).toString('base64')

console.log(`Quantum Chess integration check against ${env.baseURL}`)

console.log('Page')
const page = await fetch(appUrl(''), { headers: { Authorization: auth } })
const html = await page.text()
check(page.status === 200, 'app page answers 200')
check(/worker-src[^;]*'self'/.test(page.headers.get('content-security-policy') ?? ''), 'CSP allows same-origin workers')
const states = {}
for (const match of html.matchAll(/id="initial-state-quantumchess-(\w+)" value="([^"]*)"/g)) {
	states[match[1]] = JSON.parse(Buffer.from(match[2], 'base64').toString('utf8'))
}
check(['user', 'features', 'preferences', 'lobby', 'trainerProgress', 'appVersion'].every((k) => k in states), `initial states ${Object.keys(states).join(', ')}`)
check(states.user.uid === bob.uid && states.features.multiplayer === true && Array.isArray(states.lobby.yourTurn), 'user, features and lobby have the SPEC shape')
check(!Array.isArray(states.preferences) && !Array.isArray(states.trainerProgress), 'preferences and trainer progress are objects')
const share = await fetch(appUrl('g/42'), { headers: { Authorization: auth }, redirect: 'manual' })
check(share.status === 303 && share.headers.get('location').endsWith('/apps/quantumchess/#/game/42'), 'share link redirects to #/game/42')

console.log('Statistics')
const stats = await api('bob', 'GET', 'api/stats')
check(Number.isInteger(stats.online.rating) && 'askListing' in stats.online && Array.isArray(stats.ratingHistory), `online stats (rating ${stats.online.rating}, ${stats.online.ratedGames} rated games)`)
check(stats.local.engine['1'] && stats.local.hotseat && typeof stats.local.llm === 'object' && !Array.isArray(stats.local.llm), 'local stats shape')
const before = stats.local.engine['3'].w
const local = await api('bob', 'POST', 'api/stats/local', { opponent: 'engine', level: 3, result: 'win', color: 'w' })
check(local.local.engine['3'].w === before + 1, 'recording a local win against level 3')
await api('bob', 'POST', 'api/stats/local', { opponent: 'llm', persona: 'professor', result: 'draw', color: 'b' })
check((await api('bob', 'GET', 'api/stats')).local.llm.professor.d >= 1, 'recording an AI opponent draw')
await expectError(api('bob', 'POST', 'api/stats/local', { opponent: 'engine', level: 9, result: 'win' }), 400, 'invalid_argument')
const board = await api('bob', 'GET', 'api/leaderboard')
check(['off', 'opt-in', 'opt-out'].includes(board.mode) && Array.isArray(board.entries) && Array.isArray(board.groups), `leaderboard (${board.mode}, ${board.entries.length} entries)`)
await expectError(api('bob', 'GET', 'api/leaderboard?group=not-my-group'), 400, 'invalid_argument')

console.log('Preferences and trainer progress')
const prefs = await api('bob', 'PUT', 'api/settings/preferences', { preferences: { v: 1, boardTheme: 'quantum', future: { x: 1 } } })
check(prefs.preferences.boardTheme === 'quantum' && prefs.preferences.future.x === 1, 'preferences stored verbatim')
await expectError(api('bob', 'PUT', 'api/settings/preferences', { preferences: { blob: 'x'.repeat(17000) } }), 413, 'too_large')
await api('bob', 'PUT', 'api/trainer/progress', { progress: { v: 1, lessons: { L01: { done: true, stars: 2, at: 200 } }, xp: 50, streak: { last: '2026-09-20', days: 2, best: 4 } } })
const merged = await api('bob', 'PUT', 'api/trainer/progress', { progress: { v: 1, lessons: { L01: { done: false, stars: 3, at: 100 }, L02: { done: true, stars: 1, at: 300 } }, xp: 40, streak: { last: '2026-09-22', days: 1, best: 1 } } })
const l01 = merged.progress.lessons.L01
check(l01.done === true && l01.stars === 3 && l01.at === 100 && merged.progress.lessons.L02.done === true, 'lessons merge: done OR, stars max, earliest at')
check(merged.progress.xp === 50 && merged.progress.streak.last === '2026-09-22' && merged.progress.streak.best === 4, 'xp max, later streak wins with best max')
check((await api('bob', 'GET', 'api/trainer/progress')).progress.lessons.L02.stars === 1, 'progress is stored')
await api('bob', 'PUT', 'api/settings/preferences', { preferences: {} })

console.log(`\nAll ${passed} checks passed.`)
