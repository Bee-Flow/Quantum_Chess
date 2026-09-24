/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The LLM and settings API against a running Nextcloud, with the fake OpenAI-compatible server of
 * helpers/fake-openai.mjs on 127.0.0.1:
 *
 * - the LLM sources of bob (Nextcloud AI is unavailable, with a reason, when no provider is installed);
 * - a personal provider on a local address is refused until the admin adds it to `local_allowlist`;
 * - `POST /api/ai/move` answers `done` with the parsed move, comment and mood; retry feedback and index mode;
 * - `POST /api/ai/coach` answers; the connection test and the model list; the retry without an unsupported
 *   temperature;
 * - validation errors, a wrong key (502 upstream invalid_key), and keys never appear in responses or prompts;
 * - the validation of the admin settings, and the shared key behind the password confirmation.
 *
 * The tests run in order. Bob's LLM settings and the admin settings they change are restored at the end.
 */
import { applyMove, generateMoves, initialState } from '../../../src/engine/index.js'
import { api, env, expect, expectApiError, occ, startFakeOpenAi, apiTest as test } from '../helpers/index.mjs'

test.describe.configure({ mode: 'serial' })

const BOB_KEY = 'sk-fake-bob-secret-7Q2x'
const SHARED_KEY = 'sk-fake-shared-secret-9Zk4'

/** @type {Awaited<ReturnType<typeof startFakeOpenAi>>} */
let fake
let adminBefore
let provider
let body
let candidates
let state

test.beforeAll(async () => {
	fake = await startFakeOpenAi()
	adminBefore = await api('admin', 'GET', 'api/settings/admin')
	provider = { preset: 'custom', kind: 'openai', baseUrl: fake.baseUrl + '/', model: 'fake-chess-1' }
})

test.afterAll(async () => {
	await api('bob', 'PUT', 'api/settings/personal', { provider: null, apiKey: '', defaultSource: null }).catch((e) => console.error(e.message))
	await api('admin', 'PUT', 'api/settings/admin/secret', { key: 'shared_api_key', value: '' }).catch((e) => console.error(e.message))
	await api('admin', 'PUT', 'api/settings/admin', {
		local_allowlist: adminBefore.local_allowlist,
		shared_enabled: adminBefore.shared_enabled,
		shared_allow_local: adminBefore.shared_allow_local,
		shared_provider: adminBefore.shared_provider ?? {},
	}).catch((e) => console.error(e.message))
	await fake?.close()
})

test('the sources of a user without a provider', async () => {
	await api('admin', 'PUT', 'api/settings/admin', { local_allowlist: [], allow_personal_keys: true, shared_enabled: false })
	await api('bob', 'PUT', 'api/settings/personal', { provider: null, apiKey: '', defaultSource: null })
	const sources = await api('bob', 'GET', 'api/ai/providers')
	const nextcloud = sources.sources.find((s) => s.id === 'nextcloud')
	expect(nextcloud.available || nextcloud.reason === 'no_provider', `Nextcloud AI reflects the instance (${nextcloud.available ? 'available' : nextcloud.reason})`).toBe(true)
	expect(sources.sources.find((s) => s.id === 'personal').reason, 'personal source is not configured yet').toBe('not_configured')
})

test('a local provider address needs the allow-list', async () => {
	await expectApiError(api('bob', 'PUT', 'api/settings/personal', { provider, apiKey: BOB_KEY }), 400, 'url_not_allowed', 'local base URL refused without allow-list')
	await expectApiError(api('bob', 'PUT', 'api/settings/personal', { provider: { ...provider, baseUrl: 'http://ai.example.com/v1' } }), 400, 'url_not_allowed', 'plain http to a public host refused')
	await expectApiError(api('bob', 'PUT', 'api/settings/personal', { provider: { ...provider, baseUrl: 'https://user:pw@ai.example.com/v1' } }), 400, 'url_not_allowed', 'credentials in URLs refused')
	const admin = await api('admin', 'PUT', 'api/settings/admin', { local_allowlist: [fake.baseUrl + '/'] })
	expect(admin.local_allowlist[0], 'allow-list entries are normalised (no trailing slash)').toBe(fake.baseUrl)
	const personal = await api('bob', 'PUT', 'api/settings/personal', { provider, apiKey: BOB_KEY, defaultSource: 'personal' })
	expect(personal.provider?.baseUrl === fake.baseUrl && personal.hasKey && personal.keyHint === '7Q2x', 'provider saved with the exact allow-listed URL; key hint only').toBe(true)
	expect(JSON.stringify(personal), 'the key is not returned').not.toContain(BOB_KEY)
	const sources = await api('bob', 'GET', 'api/ai/providers')
	expect(sources.default === 'personal' && sources.sources.find((s) => s.id === 'personal').available, 'personal source available and default').toBe(true)
})

test('the connection test and the model list', async () => {
	const result = await api('bob', 'POST', 'api/settings/test', { scope: 'personal', ...provider, apiKey: null })
	expect(result.ok === true && result.modelCount === 3, `test connection ok with 3 chat models (embedding filtered): ${JSON.stringify(result)}`).toBe(true)
	const bad = await api('bob', 'POST', 'api/settings/test', { scope: 'personal', ...provider, apiKey: 'sk-bad-key-1234' })
	expect(bad.ok === false && bad.code === 'invalid_key', 'test connection with a wrong key → invalid_key').toBe(true)
	await expectApiError(api('bob', 'POST', 'api/settings/test', { scope: 'shared', ...provider }), 404, 'not_found', 'shared scope test is admin only')
	const models = await api('bob', 'GET', 'api/ai/models?source=personal')
	expect(models.models.some((m) => m.id === 'fake-chess-1') && models.chosenByAdmin === false, 'model list for the personal source').toBe(true)
})

test('the LLM opponent answers with a move', async () => {
	await api('bob', 'POST', 'api/ai/notice', { source: 'personal' })
	state = applyMove(initialState(), 'e2-e4').state
	const legal = generateMoves(state)
	candidates = legal.slice(0, 3).map((m, i) => ({ code: m.code, E: 0.55 - i * 0.02, tags: i === 0 ? ['split', 'safe'] : ['capture:50:p', 'risky'], ok: i < 2 }))
	body = {
		source: 'personal',
		model: null,
		persona: 'captain',
		color: 'b',
		language: 'nl',
		state,
		history: [{ ply: 0, code: 'e2-e4', key: null, weight: null }],
		candidates,
		message: 'Good luck «pirate»!',
		feedback: null,
		answerMode: 'code',
	}
	const move = await api('bob', 'POST', 'api/ai/move', body)
	expect(move.status === 'done' && move.move === candidates[0].code && move.mood === 'confident' && move.comment.length > 0, `move answer parsed: ${JSON.stringify(move)}`).toBe(true)
	const prompt = fake.requests.at(-1)
	const userText = prompt.body.messages.find((m) => m.role === 'user').content
	const systemText = prompt.body.messages.find((m) => m.role === 'system').content
	expect(prompt.headers.authorization, 'the key is sent to the provider as Bearer token').toBe(`Bearer ${BOB_KEY}`)
	expect(systemText.includes('You are Captain Collapse') && systemText.includes('in Dutch') && systemText.includes('Pieces move like chess'), 'system prompt: persona, language and rules summary').toBe(true)
	expect(userText.includes(`LEGAL MOVES (${legal.length})`) && userText.includes('1. e2-e4') && userText.includes('OPPONENT SAYS: «Good luck pirate!»'), 'user prompt: legal moves, history and quoted message').toBe(true)
	expect(/ 1 ✓ \S+\s+55%\s+split, safe/.test(userText) && userText.includes('capture 50% pawn, risky'), 'candidates rendered with ✓, percentage and English tags').toBe(true)
	expect(prompt.body.temperature === 0.7 && prompt.body.max_tokens === 800, 'temperature 0.7 and the output token limit').toBe(true)
	expect(JSON.stringify(prompt.body), 'no user ids or instance URL in the prompt').not.toMatch(/bob|admin|127\.0\.0\.1:8080|localhost:8080/i)

	const retry = await api('bob', 'POST', 'api/ai/move', { ...body, message: null, feedback: { answer: 'e7-e4', reason: 'unreachable' } })
	expect(retry.status, 'retry with feedback answers').toBe('done')
	expect(fake.requests.at(-1).body.messages[1].content, 'retry line in the prompt').toContain('Your answer «e7-e4» was not accepted: unreachable')
	const index = await api('bob', 'POST', 'api/ai/move', { ...body, answerMode: 'index' })
	expect(index.status === 'done' && index.pick === 1 && index.move === null, 'index mode returns pick').toBe(true)
})

test('the coach answers a question', async () => {
	const coach = await api('bob', 'POST', 'api/ai/coach', {
		source: 'personal',
		model: null,
		language: 'en',
		state,
		history: [{ ply: 0, code: 'e2-e4', key: null, weight: null }],
		analysis: { E: 0.52, best: [{ code: candidates[0].code, E: 0.5, line: [candidates[0].code] }], threats: ['Nothing yet'], lastMove: { code: 'e2-e4', label: 'good', deltaE: 0.01 } },
		context: { kind: 'game', title: null, goal: null, ply: 1 },
		player: { color: 'b', skill: 'beginner' },
		chat: [{ role: 'user', text: 'Hi' }, { role: 'coach', text: 'Hello!' }],
		question: 'What is the plan?',
	})
	expect(coach.status === 'done' && coach.answer.includes('**Plan:**'), 'coach answer returned as Markdown').toBe(true)
	const coachPrompt = fake.requests.at(-1).body
	expect(coachPrompt.temperature === 0.3 && coachPrompt.messages[0].content.includes('helping a beginner player'), 'coach prompt: temperature 0.3 and skill').toBe(true)
	expect(coachPrompt.messages[1].content.includes('QUESTION: «What is the plan?»') && coachPrompt.messages[1].content.includes('White\'s winning chance: 52%'), 'coach prompt: question and engine analysis').toBe(true)
})

test('an unsupported temperature is retried once without it', async () => {
	await api('bob', 'PUT', 'api/settings/personal', { provider: { ...provider, model: 'fake-reasoning' } })
	const reasoning = await api('bob', 'POST', 'api/ai/move', body)
	const last2 = fake.requests.slice(-2)
	expect(reasoning.status === 'done' && last2[0].body.temperature === 0.7 && last2[1].body.temperature === undefined, 'a 400 naming temperature is retried once without it').toBe(true)
	await api('bob', 'PUT', 'api/settings/personal', { provider })
})

test('invalid requests and provider errors', async () => {
	await expectApiError(api('bob', 'POST', 'api/ai/move', { ...body, color: 'w' }), 400, 'invalid_argument', 'turn must equal colour')
	await expectApiError(api('bob', 'POST', 'api/ai/move', { ...body, state: { ...state, turn: 'x' } }), 400, 'invalid_state', 'invalid state')
	await expectApiError(api('bob', 'POST', 'api/ai/move', { ...body, candidates: [{ code: 'e2-e5', E: 0.5, tags: [], ok: true }] }), 400, 'invalid_argument', 'illegal candidate')
	await expectApiError(api('bob', 'POST', 'api/ai/move', { ...body, persona: 'nobody' }), 400, 'invalid_argument', 'unknown persona')
	await expectApiError(api('bob', 'POST', 'api/ai/move', { ...body, source: 'shared' }), 403, 'ai_unavailable', 'unavailable source')
	await expectApiError(api('bob', 'GET', 'api/ai/task/999999'), 404, 'not_found', 'unknown task')
	await api('bob', 'PUT', 'api/settings/personal', { apiKey: 'sk-bad-key-5678' })
	const upstream = await expectApiError(api('bob', 'POST', 'api/ai/move', body), 502, 'upstream', 'wrong key')
	expect(upstream.upstream === 'invalid_key' && !JSON.stringify(upstream).includes('Incorrect API key'), 'upstream code invalid_key, upstream body not passed on').toBe(true)
})

test('the admin settings and the shared key', async () => {
	await expectApiError(api('admin', 'PUT', 'api/settings/admin', { invite_expiry_days: 0 }), 400, 'invalid_argument', 'out of range value')
	await expectApiError(api('admin', 'PUT', 'api/settings/admin', { unknown_key: true }), 400, 'invalid_argument', 'unknown key')
	await expectApiError(api('bob', 'GET', 'api/settings/admin'), 403, undefined, 'admin settings are admin only (403 for bob)')
	const shared = await api('admin', 'PUT', 'api/settings/admin', { shared_enabled: true, shared_allow_local: true, shared_provider: { preset: 'custom', baseUrl: fake.baseUrl, model: 'fake-chess-1', label: 'Company AI' } })
	expect(shared.shared_provider.label, 'organisation provider saved').toBe('Company AI')
	const secret = await api('admin', 'PUT', 'api/settings/admin/secret', { key: 'shared_api_key', value: SHARED_KEY })
	expect(secret.hasKey === true && secret.keyHint === '9Zk4', 'shared key stored (basic auth counts as a fresh password confirmation)').toBe(true)
	expect(JSON.stringify(await api('admin', 'GET', 'api/settings/admin')), 'the key is never returned').not.toContain(SHARED_KEY)
	const elsewhere = fake.baseUrl.replace('/v1', '/other/v1')
	const probe = await api('admin', 'POST', 'api/settings/test', { scope: 'shared', preset: 'custom', baseUrl: elsewhere })
	expect(!fake.requests.some((req) => req.headers.authorization === `Bearer ${SHARED_KEY}`) && probe.ok === false, 'the connection test never sends the saved key to another address').toBe(true)
	await api('admin', 'POST', 'api/settings/test', { scope: 'shared', preset: 'custom', baseUrl: fake.baseUrl })
	expect(fake.requests.at(-1).headers.authorization, 'the connection test of the saved address uses the saved key').toBe(`Bearer ${SHARED_KEY}`)
	if (env.occ) {
		const list = (await occ(['config:list', 'quantumchess'])).stdout
		const key = JSON.parse(list).apps.quantumchess.shared_api_key ?? ''
		expect(!list.includes(SHARED_KEY) && !list.includes('7Q2x') && /sensitive/i.test(key), `occ config:list hides the shared key (${key})`).toBe(true)
		const privateList = (await occ(['config:list', 'quantumchess', '--private'])).stdout
		expect(privateList, 'even --private shows only the encrypted key').not.toContain(SHARED_KEY)
	}
	const viaShared = await api('bob', 'POST', 'api/ai/move', { ...body, source: 'shared' })
	expect(viaShared.status === 'done' && fake.requests.at(-1).headers.authorization === `Bearer ${SHARED_KEY}`, 'organisation provider answers with the shared key').toBe(true)
	const usage = (await api('admin', 'GET', 'api/settings/admin')).status.diagnostics.aiRequestsToday
	expect(usage.personal > 0 && usage.shared > 0, `usage counted per source: ${JSON.stringify(usage)}`).toBe(true)
	const moved = await api('admin', 'PUT', 'api/settings/admin', { shared_provider: { preset: 'custom', baseUrl: elsewhere, model: 'fake-chess-1' } })
	expect(moved.shared_api_key.hasKey, 'a new organisation address drops the saved key (it needs the password again)').toBe(false)
})
