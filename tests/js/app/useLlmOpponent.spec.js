/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * useLlmOpponent (GAME-DESIGN §6.4): retry with feedback, Balanced rejects non-✓ moves, Relaxed accepts any legal
 * move, fallback marking, index mode after 3 fallbacks in 5 AI moves, Nextcloud AI polling, errors.
 */

import { describe, expect, it, vi } from 'vitest'
import { fallbackCandidate, moveKind, useLlmOpponent } from '../../../src/composables/useLlmOpponent.js'
import { applyMove, initialState } from '../../../src/engine/index.js'
import { personaById } from '../../../src/personas/index.js'

vi.mock('../../../src/services/api.js', () => ({ requestAiMove: vi.fn(), cancelAiTask: vi.fn(async () => ({})) }))
vi.mock('../../../src/services/aiTasks.js', () => ({ waitForAiTask: vi.fn() }))

const state = applyMove(initialState(), 'e2-e4').state // Black to move
const CANDS = [
	{ code: 'e7-e5', E: 0.52, tags: ['safe'], ok: true },
	{ code: 'b8-a6|c6', E: 0.51, tags: ['split', 'safe'], ok: true },
	{ code: 'a7-a6', E: 0.4, tags: [], ok: false },
]

/**
 * A fresh opponent with scripted answers.
 *
 * @param {object[]} answers answers of requestAiMove, in order
 * @param {object} [options] strength, persona
 * @return {object}
 */
function setup(answers, { strength = 'balanced', persona = 'professor', record = null } = {}) {
	const rec = record ?? { ai: { answerMode: 'code', fallbackPlies: [], chat: [] } }
	const bodies = []
	const requestAiMove = vi.fn(async (body) => {
		bodies.push(body)
		const a = answers.shift()
		if (a instanceof Error) {
			throw a
		}
		return a
	})
	const opp = useLlmOpponent({ record: rec, persona: personaById(persona), source: 'personal', strength }, {
		candidates: async () => CANDS,
		requestAiMove,
		waitForAiTask: async () => ({ status: 'done', kind: 'move', move: 'e7-e5', comment: 'Queued answer', mood: 'happy' }),
		cancelAiTask: async () => ({}),
	})
	return { opp, bodies, rec }
}

describe('useLlmOpponent', () => {
	it('plays a valid ✓ answer with its comment', async () => {
		const { opp, bodies } = setup([{ status: 'done', move: 'e7-e5', comment: 'Classic!', mood: 'confident' }])
		const r = await opp.chooseMove(state)
		expect(r).toEqual({ code: 'e7-e5', by: 'ai', comment: 'Classic!', mood: 'confident' })
		expect(bodies[0]).toMatchObject({ persona: 'professor', color: 'b', feedback: null, answerMode: 'code', candidates: CANDS })
	})

	it('accepts lenient input through findMove', async () => {
		const { opp } = setup([{ status: 'done', move: ' Nb8-c6/a6 ', comment: '' }])
		expect((await opp.chooseMove(state)).code).toBe('b8-a6|c6')
	})

	it('retries once with feedback for an illegal answer', async () => {
		const { opp, bodies } = setup([
			{ status: 'done', move: 'e7-e4', comment: 'x' },
			{ status: 'done', move: 'b8-a6|c6', comment: 'Two futures.' },
		])
		const r = await opp.chooseMove(state)
		expect(r.code).toBe('b8-a6|c6')
		expect(bodies).toHaveLength(2)
		expect(bodies[1].feedback).toEqual({ answer: 'e7-e4', reason: expect.any(String) })
	})

	it('rejects a legal move without ✓ under Balanced, accepts it under Relaxed', async () => {
		const balanced = setup([{ status: 'done', move: 'a7-a6' }, { status: 'done', move: 'a7-a6' }])
		const r1 = await balanced.opp.chooseMove(state)
		expect(balanced.bodies[1].feedback).toEqual({ answer: 'a7-a6', reason: 'not_recommended' })
		expect(r1.by).toBe('ai-fallback')
		expect(r1.code).toBe('e7-e5')

		const relaxed = setup([{ status: 'done', move: 'a7-a6', comment: 'Hm' }], { strength: 'relaxed' })
		expect((await relaxed.opp.chooseMove(state)).code).toBe('a7-a6')
	})

	it('falls back to the best ✓ candidate with the style bonus and a canned line', async () => {
		const { opp, rec } = setup([{ status: 'done', move: 'zz' }, { status: 'done', move: 'zz' }], { persona: 'superposa' })
		const r = await opp.chooseMove(state)
		// Madame Superposa likes splits: 0.51 + 0.03 beats 0.52
		expect(r).toMatchObject({ code: 'b8-a6|c6', by: 'ai-fallback', mood: 'thinking' })
		expect(r.comment.length).toBeGreaterThan(0)
		expect(rec.ai.fallbackPlies).toEqual([state.ply])
	})

	it('switches to index mode after 3 fallbacks within 5 AI moves', async () => {
		const rec = { ai: { answerMode: 'code', fallbackPlies: [1, 3], chat: [] } }
		const { opp, bodies } = setup([{ status: 'done', move: 'zz' }, { status: 'done', move: 'zz' }, { status: 'done', pick: 2, comment: 'two' }], { record: rec })
		await opp.chooseMove(state)
		expect(rec.ai.answerMode).toBe('index')
		expect(opp.answerMode.value).toBe('index')
		const r = await opp.chooseMove(state)
		expect(bodies[2].answerMode).toBe('index')
		expect(r).toMatchObject({ code: 'b8-a6|c6', by: 'ai' })
	})

	it('waits for Nextcloud AI tasks', async () => {
		const { opp } = setup([{ status: 'pending', taskId: 5 }])
		expect(await opp.chooseMove(state)).toMatchObject({ code: 'e7-e5', by: 'ai', comment: 'Queued answer' })
	})

	it('falls back on API errors and reports them', async () => {
		const err = Object.assign(new Error('Rate limited'), { name: 'ApiError', code: 'ai_rate_limited' })
		const { opp } = setup([err])
		const r = await opp.chooseMove(state)
		expect(r).toMatchObject({ by: 'ai-fallback', error: 'ai_rate_limited' })
	})

	it('lets the engine move while waiting', async () => {
		const rec = { ai: { answerMode: 'code', fallbackPlies: [], chat: [] } }
		let release
		const opp = useLlmOpponent({ record: rec, persona: personaById('q7'), source: 'nextcloud' }, {
			candidates: async () => CANDS,
			requestAiMove: (body, { signal }) => new Promise((resolve, reject) => {
				release = resolve
				signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
			}),
		})
		const p = opp.chooseMove(state)
		await vi.waitFor(() => expect(release).toBeTypeOf('function'))
		opp.letEngineMove()
		expect(await p).toMatchObject({ code: 'e7-e5', by: 'ai-fallback' })
	})

	it('keeps the message for the next request', async () => {
		const { opp, bodies, rec } = setup([{ status: 'done', move: 'e7-e5' }])
		opp.say('nice   opening!\u0007', 1)
		await opp.chooseMove(state)
		expect(bodies[0].message).toBe('nice   opening!')
		expect(rec.ai.chat).toEqual([{ from: 'me', text: 'nice   opening!', ply: 1 }])
	})

	it('classifies moves for the style bonus', () => {
		expect(moveKind(null)).toBe('standard')
		expect(fallbackCandidate(state, CANDS, personaById('q7')).code).toBe('e7-e5')
	})
})
