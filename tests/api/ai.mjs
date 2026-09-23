/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * End-to-end check of the AI and settings routes against a running Nextcloud (docs/SPEC.md §7.4.7, §7.4.8, §12.2)
 * with the fake OpenAI-compatible server of tests/api/fake-openai.mjs on 127.0.0.1:
 *
 * - sources for bob (Nextcloud AI unavailable with a reason when no provider is installed);
 * - a personal provider on a local address is refused until the admin adds it to `local_allowlist`;
 * - `POST /api/ai/move` returns `done` with the parsed move, comment and mood; retry feedback and index mode;
 * - `POST /api/ai/coach` returns an answer; test connection and models; the unsupported-temperature retry;
 * - validation errors, a wrong key (502 upstream invalid_key), and keys never appear in responses or prompts;
 * - admin settings validation and the shared key behind the password confirmation.
 *
 * The script restores bob's AI settings and the allow-list at the end.
 * Usage: node tests/api/ai.mjs   (QC_BASE_URL defaults to http://127.0.0.1:8080)
 */
import { applyMove, generateMoves, initialState } from '../../src/engine/index.js'
import { api, ApiError } from '../e2e/helpers/api.mjs'
import { env } from '../e2e/helpers/env.mjs'
import { occ } from '../e2e/helpers/occ.mjs'
import { startFakeOpenAi } from './fake-openai.mjs'

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
 * @param {string} what description
 * @return {Promise<any>} the error body
 */
async function expectError(promise, status, code, what) {
	try {
		await promise
	} catch (error) {
		if (error instanceof ApiError) {
			check(error.status === status && error.body?.error === code, `${what}: ${status} ${code} (got ${error.status} ${error.body?.error})`)
			return error.body
		}
		throw error
	}
	throw new Error(`FAILED: ${what}: expected ${status} ${code}`)
}

const BOB_KEY = 'sk-fake-bob-secret-7Q2x'
const SHARED_KEY = 'sk-fake-shared-secret-9Zk4'

console.log(`Quantum Chess AI check against ${env.baseURL}`)
const fake = await startFakeOpenAi()
const before = await api('admin', 'GET', 'api/settings/admin')
try {
	console.log('Sources')
	await api('admin', 'PUT', 'api/settings/admin', { local_allowlist: [], allow_personal_keys: true, shared_enabled: false })
	await api('bob', 'PUT', 'api/settings/personal', { provider: null, apiKey: '', defaultSource: null })
	let sources = await api('bob', 'GET', 'api/ai/providers')
	const nextcloud = sources.sources.find((s) => s.id === 'nextcloud')
	check(nextcloud.available || nextcloud.reason === 'no_provider', `Nextcloud AI reflects the instance (${nextcloud.available ? 'available' : nextcloud.reason})`)
	check(sources.sources.find((s) => s.id === 'personal').reason === 'not_configured', 'personal source is not configured yet')

	console.log('Local address guard')
	const provider = { preset: 'custom', kind: 'openai', baseUrl: fake.baseUrl + '/', model: 'fake-chess-1' }
	await expectError(api('bob', 'PUT', 'api/settings/personal', { provider, apiKey: BOB_KEY }), 400, 'url_not_allowed', 'local base URL refused without allow-list')
	await expectError(api('bob', 'PUT', 'api/settings/personal', { provider: { ...provider, baseUrl: 'http://ai.example.com/v1' } }), 400, 'url_not_allowed', 'plain http to a public host refused')
	await expectError(api('bob', 'PUT', 'api/settings/personal', { provider: { ...provider, baseUrl: 'https://user:pw@ai.example.com/v1' } }), 400, 'url_not_allowed', 'credentials in URLs refused')
	const admin = await api('admin', 'PUT', 'api/settings/admin', { local_allowlist: [fake.baseUrl + '/'] })
	check(admin.local_allowlist[0] === fake.baseUrl, 'allow-list entries are normalised (no trailing slash)')
	const personal = await api('bob', 'PUT', 'api/settings/personal', { provider, apiKey: BOB_KEY, defaultSource: 'personal' })
	check(personal.provider?.baseUrl === fake.baseUrl && personal.hasKey && personal.keyHint === '7Q2x', 'provider saved with the exact allow-listed URL; key hint only')
	check(!JSON.stringify(personal).includes(BOB_KEY), 'the key is not returned')
	sources = await api('bob', 'GET', 'api/ai/providers')
	check(sources.default === 'personal' && sources.sources.find((s) => s.id === 'personal').available, 'personal source available and default')

	console.log('Test connection and models')
	const test = await api('bob', 'POST', 'api/settings/test', { scope: 'personal', ...provider, apiKey: null })
	check(test.ok === true && test.modelCount === 3, `test connection ok with 3 chat models (embedding filtered): ${JSON.stringify(test)}`)
	const bad = await api('bob', 'POST', 'api/settings/test', { scope: 'personal', ...provider, apiKey: 'sk-bad-key-1234' })
	check(bad.ok === false && bad.code === 'invalid_key', 'test connection with a wrong key → invalid_key')
	await expectError(api('bob', 'POST', 'api/settings/test', { scope: 'shared', ...provider }), 404, 'not_found', 'shared scope test is admin only')
	const models = await api('bob', 'GET', 'api/ai/models?source=personal')
	check(models.models.some((m) => m.id === 'fake-chess-1') && models.chosenByAdmin === false, 'model list for the personal source')

	console.log('Move')
	await api('bob', 'POST', 'api/ai/notice', { source: 'personal' })
	let state = initialState()
	state = applyMove(state, 'e2-e4').state
	const legal = generateMoves(state)
	const candidates = legal.slice(0, 3).map((m, i) => ({ code: m.code, E: 0.55 - i * 0.02, tags: i === 0 ? ['split', 'safe'] : ['capture:50:p', 'risky'], ok: i < 2 }))
	const body = {
		source: 'personal', model: null, persona: 'captain', color: 'b', language: 'nl', state,
		history: [{ ply: 0, code: 'e2-e4', key: null, weight: null }], candidates,
		message: 'Good luck «pirate»!', feedback: null, answerMode: 'code',
	}
	const move = await api('bob', 'POST', 'api/ai/move', body)
	check(move.status === 'done' && move.move === candidates[0].code && move.mood === 'confident' && move.comment.length > 0, `move answer parsed: ${JSON.stringify(move)}`)
	const prompt = fake.requests.at(-1)
	const userText = prompt.body.messages.find((m) => m.role === 'user').content
	const systemText = prompt.body.messages.find((m) => m.role === 'system').content
	check(prompt.headers.authorization === `Bearer ${BOB_KEY}`, 'the key is sent to the provider as Bearer token')
	check(systemText.includes('You are Captain Collapse') && systemText.includes('in Dutch') && systemText.includes('Pieces move like chess'), 'system prompt: persona, language and rules summary')
	check(userText.includes(`LEGAL MOVES (${legal.length})`) && userText.includes('1. e2-e4') && userText.includes('OPPONENT SAYS: «Good luck pirate!»'), 'user prompt: legal moves, history and quoted message')
	check(/ 1 ✓ \S+\s+55%\s+split, safe/.test(userText) && userText.includes('capture 50% pawn, risky'), 'candidates rendered with ✓, percentage and English tags')
	check(prompt.body.temperature === 0.7 && prompt.body.max_tokens === 800, 'temperature 0.7 and the output token limit')
	const all = JSON.stringify(prompt.body)
	check(!/bob|admin|127\.0\.0\.1:8080|localhost:8080/i.test(all), 'no user ids or instance URL in the prompt')

	const retry = await api('bob', 'POST', 'api/ai/move', { ...body, message: null, feedback: { answer: 'e7-e4', reason: 'unreachable' } })
	check(retry.status === 'done', 'retry with feedback answers')
	check(fake.requests.at(-1).body.messages[1].content.includes('Your answer «e7-e4» was not accepted: unreachable'), 'retry line in the prompt')
	const index = await api('bob', 'POST', 'api/ai/move', { ...body, answerMode: 'index' })
	check(index.status === 'done' && index.pick === 1 && index.move === null, 'index mode returns pick')

	console.log('Coach')
	const coach = await api('bob', 'POST', 'api/ai/coach', {
		source: 'personal', model: null, language: 'en', state,
		history: [{ ply: 0, code: 'e2-e4', key: null, weight: null }],
		analysis: { E: 0.52, best: [{ code: candidates[0].code, E: 0.5, line: [candidates[0].code] }], threats: ['Nothing yet'], lastMove: { code: 'e2-e4', label: 'good', deltaE: 0.01 } },
		context: { kind: 'game', title: null, goal: null, ply: 1 },
		player: { color: 'b', skill: 'beginner' },
		chat: [{ role: 'user', text: 'Hi' }, { role: 'coach', text: 'Hello!' }],
		question: 'What is the plan?',
	})
	check(coach.status === 'done' && coach.answer.includes('**Plan:**'), 'coach answer returned as Markdown')
	const coachPrompt = fake.requests.at(-1).body
	check(coachPrompt.temperature === 0.3 && coachPrompt.messages[0].content.includes('helping a beginner player'), 'coach prompt: temperature 0.3 and skill')
	check(coachPrompt.messages[1].content.includes('QUESTION: «What is the plan?»') && coachPrompt.messages[1].content.includes('White\'s winning chance: 52%'), 'coach prompt: question and engine analysis')

	console.log('Unsupported parameter retry')
	await api('bob', 'PUT', 'api/settings/personal', { provider: { ...provider, model: 'fake-reasoning' } })
	const reasoning = await api('bob', 'POST', 'api/ai/move', body)
	const last2 = fake.requests.slice(-2)
	check(reasoning.status === 'done' && last2[0].body.temperature === 0.7 && last2[1].body.temperature === undefined, 'a 400 naming temperature is retried once without it')
	await api('bob', 'PUT', 'api/settings/personal', { provider })

	console.log('Validation and errors')
	await expectError(api('bob', 'POST', 'api/ai/move', { ...body, color: 'w' }), 400, 'invalid_argument', 'turn must equal colour')
	await expectError(api('bob', 'POST', 'api/ai/move', { ...body, state: { ...state, turn: 'x' } }), 400, 'invalid_state', 'invalid state')
	await expectError(api('bob', 'POST', 'api/ai/move', { ...body, candidates: [{ code: 'e2-e5', E: 0.5, tags: [], ok: true }] }), 400, 'invalid_argument', 'illegal candidate')
	await expectError(api('bob', 'POST', 'api/ai/move', { ...body, persona: 'nobody' }), 400, 'invalid_argument', 'unknown persona')
	await expectError(api('bob', 'POST', 'api/ai/move', { ...body, source: 'shared' }), 403, 'ai_unavailable', 'unavailable source')
	await expectError(api('bob', 'GET', 'api/ai/task/999999'), 404, 'not_found', 'unknown task')
	await api('bob', 'PUT', 'api/settings/personal', { apiKey: 'sk-bad-key-5678' })
	const upstream = await expectError(api('bob', 'POST', 'api/ai/move', body), 502, 'upstream', 'wrong key')
	check(upstream.upstream === 'invalid_key' && !JSON.stringify(upstream).includes('Incorrect API key'), 'upstream code invalid_key, upstream body not passed on')

	console.log('Admin settings')
	await expectError(api('admin', 'PUT', 'api/settings/admin', { invite_expiry_days: 0 }), 400, 'invalid_argument', 'out of range value')
	await expectError(api('admin', 'PUT', 'api/settings/admin', { unknown_key: true }), 400, 'invalid_argument', 'unknown key')
	try {
		await api('bob', 'GET', 'api/settings/admin')
		check(false, 'admin settings are admin only')
	} catch (error) {
		check(error instanceof ApiError && error.status === 403, 'admin settings are admin only (403 for bob)')
	}
	const secret = await api('admin', 'PUT', 'api/settings/admin/secret', { key: 'shared_api_key', value: SHARED_KEY })
	check(secret.hasKey === true && secret.keyHint === '9Zk4', 'shared key stored (basic auth counts as a fresh password confirmation)')
	if (env.occ) {
		const list = (await occ(['config:list', 'quantumchess'])).stdout
		const key = JSON.parse(list).apps.quantumchess.shared_api_key ?? ''
		check(!list.includes(SHARED_KEY) && !list.includes('7Q2x') && /sensitive/i.test(key), `occ config:list hides the shared key (${key})`)
		const privateList = (await occ(['config:list', 'quantumchess', '--private'])).stdout
		check(!privateList.includes(SHARED_KEY), 'even --private shows only the encrypted key')
	}
	const shared = await api('admin', 'PUT', 'api/settings/admin', { shared_enabled: true, shared_allow_local: true, shared_provider: { preset: 'custom', baseUrl: fake.baseUrl, model: 'fake-chess-1', label: 'Company AI' } })
	check(shared.shared_provider.label === 'Company AI' && !JSON.stringify(shared).includes(SHARED_KEY), 'organisation provider saved, key not returned')
	const viaShared = await api('bob', 'POST', 'api/ai/move', { ...body, source: 'shared' })
	check(viaShared.status === 'done' && fake.requests.at(-1).headers.authorization === `Bearer ${SHARED_KEY}`, 'organisation provider answers with the shared key')
	const usage = (await api('admin', 'GET', 'api/settings/admin')).status.diagnostics.aiRequestsToday
	check(usage.personal > 0 && usage.shared > 0, `usage counted per source: ${JSON.stringify(usage)}`)
} finally {
	console.log('Cleanup')
	await api('bob', 'PUT', 'api/settings/personal', { provider: null, apiKey: '', defaultSource: null }).catch((e) => console.error(e.message))
	await api('admin', 'PUT', 'api/settings/admin/secret', { key: 'shared_api_key', value: '' }).catch((e) => console.error(e.message))
	await api('admin', 'PUT', 'api/settings/admin', {
		local_allowlist: before.local_allowlist, shared_enabled: before.shared_enabled, shared_allow_local: before.shared_allow_local,
		shared_provider: before.shared_provider ?? {},
	}).catch((e) => console.error(e.message))
	await fake.close()
}
console.log(`${passed} checks passed`)
