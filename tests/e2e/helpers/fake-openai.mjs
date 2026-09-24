/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * A tiny fake OpenAI-compatible server for the end-to-end tests of the LLM routes. It listens on 127.0.0.1 only and
 * answers like a well-behaved chess model:
 *
 * - `GET /v1/models` → three chat models and one embedding model (which the app filters out);
 * - `POST /v1/chat/completions` → for a move prompt the first ENGINE CANDIDATE (or, in index mode, `pick: 1`) as JSON
 *   with a comment and a mood; for a coach prompt a short Markdown answer naming that candidate;
 * - the key `sk-bad…` gets 401, the model `fake-reasoning` rejects `temperature` once per request like OpenAI's
 *   reasoning models, and `fake-slow` waits `slowMs`.
 *
 * Every request is recorded in `server.requests` (method, path, headers, body) for assertions.
 *
 * Usage: `const fake = await startFakeOpenAi()`; `fake.baseUrl` is `http://127.0.0.1:<port>/v1`; `await fake.close()`.
 * Standalone: `node tests/e2e/helpers/fake-openai.mjs [port]` keeps it running (for manual tests).
 */
import { createServer } from 'node:http'

/**
 * The answer for one chat request.
 *
 * @param {object} body request body
 * @param {string} [comment] the opponent's comment on its move
 * @return {string}
 */
function answerFor(body, comment = 'A fine, solid move to start with!') {
	const messages = Array.isArray(body.messages) ? body.messages : []
	const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')
	const user = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n')
	const candidate = /^\s*1 [✓ ] (\S+)/m.exec(user)?.[1] ?? null
	if (system.includes('Quantum Chess coach')) {
		return `**Plan:** develop your pieces first.\n\n- The engine likes \`${candidate ?? 'e2-e4'}\`.\n- Keep your king safe.`
	}
	if (user.includes('"pick"') || system.includes('"pick"')) {
		return '{"pick": 1, "comment": "Candidate one, as computed.", "mood": "confident"}'
	}
	return '```json\n' + JSON.stringify({ move: candidate ?? 'e2-e4', comment, mood: 'confident' }) + '\n```'
}

/**
 * @param {object} [options] options
 * @param {number} [options.port] port (0 = random)
 * @param {number} [options.slowMs] delay of the model `fake-slow`
 * @param {string|string[]} [options.comment] the comment of the move answers (a list is used in turn)
 * @return {Promise<{baseUrl: string, port: number, requests: object[], close: () => Promise<void>}>}
 */
export async function startFakeOpenAi({ port = 0, slowMs = 3000, comment } = {}) {
	let answers = 0
	const nextComment = () => (Array.isArray(comment) ? comment[answers++ % comment.length] : comment)
	const requests = []
	const server = createServer((req, res) => {
		let raw = ''
		req.on('data', (chunk) => {
			raw += chunk
		})
		req.on('end', async () => {
			let body
			try {
				body = raw === '' ? null : JSON.parse(raw)
			} catch {
				body = raw
			}
			requests.push({ method: req.method, path: req.url, headers: req.headers, body })
			const send = (status, data) => {
				res.writeHead(status, { 'Content-Type': 'application/json' })
				res.end(JSON.stringify(data))
			}
			const auth = req.headers.authorization ?? ''
			if (auth.startsWith('Bearer sk-bad')) {
				send(401, {
					error: {
						message: 'Incorrect API key provided',
						type: 'invalid_request_error',
						code: 'invalid_api_key',
					},
				})
				return
			}
			if (req.method === 'GET' && req.url === '/v1/models') {
				send(200, {
					object: 'list',
					data: ['fake-chess-1', 'fake-reasoning', 'fake-slow', 'text-embedding-3-small'].map((id) => ({
						id,
						object: 'model',
					})),
				})
				return
			}
			if (req.method === 'POST' && req.url === '/v1/chat/completions' && body && typeof body === 'object') {
				if (body.model === 'fake-reasoning' && body.temperature !== undefined) {
					send(400, {
						error: {
							message: "Unsupported value: 'temperature' does not support 0.7 with this model.",
							type: 'invalid_request_error',
							param: 'temperature',
							code: 'unsupported_value',
						},
					})
					return
				}
				if (!['fake-chess-1', 'fake-reasoning', 'fake-slow'].includes(body.model)) {
					send(404, {
						error: { message: `The model \`${body.model}\` does not exist`, code: 'model_not_found' },
					})
					return
				}
				if (body.model === 'fake-slow') {
					await new Promise((resolve) => setTimeout(resolve, slowMs))
				}
				send(200, {
					id: 'chatcmpl-fake',
					object: 'chat.completion',
					model: body.model,
					choices: [
						{
							index: 0,
							finish_reason: 'stop',
							message: { role: 'assistant', content: answerFor(body, nextComment()) },
						},
					],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				})
				return
			}
			send(404, { error: { message: 'Not found' } })
		})
	})
	await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
	const actual = server.address().port
	return {
		baseUrl: `http://127.0.0.1:${actual}/v1`,
		port: actual,
		requests,
		close: () => new Promise((resolve) => server.close(() => resolve())),
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const fake = await startFakeOpenAi({ port: Number(process.argv[2] ?? 0) })
	console.log(`Fake OpenAI-compatible server at ${fake.baseUrl}`)
}
