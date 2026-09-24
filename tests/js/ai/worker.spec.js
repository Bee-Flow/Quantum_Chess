/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The Web Worker protocol of the computer player: the worker entry, the client with a fake Worker (priorities,
 * cancellation, errors), the main-thread fallbacks, and the device benchmark.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { BENCH_KEY } from '../../../src/ai/benchmark.js'
import * as client from '../../../src/ai/client.js'
import { createTask, errorPayload, JOB_TYPES } from '../../../src/ai/jobs.js'
import { E, POS } from './helpers.js'

/**
 * Wait until a condition holds (polling the event loop).
 *
 * @param {() => boolean} cond condition
 * @param {number} [ms] timeout
 * @return {Promise<void>}
 */
async function until(cond, ms = 20000) {
	const end = Date.now() + ms
	while (!cond()) {
		if (Date.now() > end) {
			throw new Error('timeout')
		}
		await new Promise((resolve) => setTimeout(resolve, 5))
	}
}

/**
 * A stand-in for the module worker that speaks the worker protocol (see src/ai/worker.js) with the real job code,
 * in slices so that `terminate()` stops it like a real worker.
 */
class FakeWorker {
	static instances = []

	constructor() {
		FakeWorker.instances.push(this)
		this.received = []
		this.terminated = false
		this.onmessage = null
		this.onerror = null
	}

	postMessage(msg) {
		this.received.push(structuredClone(msg))
		if (msg.type !== 'cancel') {
			setTimeout(() => this.run(structuredClone(msg)), 0)
		}
	}

	async run(msg) {
		if (this.terminated) {
			return
		}
		const ctx = {
			slice: () => performance.now() + 15,
			progress: (p) => this.emit({ id: msg.id, type: 'progress', payload: p }),
		}
		try {
			const task = createTask(msg.type, msg.payload, ctx)
			let r = task.next()
			while (!r.done) {
				await new Promise((resolve) => setTimeout(resolve, 0))
				if (this.terminated) {
					return
				}
				r = task.next()
			}
			this.emit({ id: msg.id, type: 'result', payload: structuredClone(r.value) })
		} catch (e) {
			this.emit({ id: msg.id, type: 'error', payload: errorPayload(e) })
		}
	}

	emit(data) {
		if (!this.terminated && this.onmessage) {
			this.onmessage({ data })
		}
	}

	terminate() {
		this.terminated = true
	}
}

const QUICK = { timeMs: 200, nodeBudget: 3000 }

afterEach(() => {
	client.cancelAll()
})

describe('worker entry (src/ai/worker.js)', () => {
	const posted = []
	let saved

	beforeAll(async () => {
		saved = { self: globalThis.self, postMessage: globalThis.postMessage, onmessage: globalThis.onmessage }
		globalThis.self = globalThis
		globalThis.postMessage = (m) => posted.push(structuredClone(m))
		await import('../../../src/ai/worker.js')
	})

	afterAll(() => {
		globalThis.self = saved.self
		globalThis.postMessage = saved.postMessage
		globalThis.onmessage = saved.onmessage
	})

	const send = (msg) => globalThis.onmessage({ data: msg })
	const resultOf = (id) => posted.find((m) => m.id === id && m.type !== 'progress')

	it('answers every job type with result or error messages', async () => {
		send({ id: 1, type: 'solve', payload: { state: POS.w14(), options: { goal: 'forced' } } })
		send({
			id: 2,
			type: 'bestMove',
			payload: { state: POS.w6(), options: { level: 3, seed: 1, deterministic: true, nodeBudget: 500 } },
		})
		send({ id: 3, type: 'analyze', payload: { state: 'not a state', options: {} } })
		await until(() => resultOf(1) && resultOf(2) && resultOf(3))
		expect(resultOf(1)).toMatchObject({ type: 'result', payload: { accepted: ['a1-a8'], value: 1 } })
		expect(resultOf(2)).toMatchObject({ type: 'result', payload: { code: 'd4|h5-h8', E: 1 } })
		expect(resultOf(3)).toMatchObject({ type: 'error', payload: { name: 'InvalidStateError' } })
	})

	it('sends progress for iterative searches and drops cancelled jobs', async () => {
		send({
			id: 10,
			type: 'bestMove',
			payload: { state: POS.start(), options: { level: 3, seed: 2, deterministic: true, nodeBudget: 2000 } },
		})
		send({ id: 11, type: 'evaluateMove', payload: { state: POS.start(), code: 'e2-e4', options: QUICK } })
		send({ id: 11, type: 'cancel', payload: { id: 11 } })
		send({ id: 12, type: 'nonsense', payload: {} })
		await until(() => resultOf(10) && resultOf(12))
		expect(posted.some((m) => m.id === 10 && m.type === 'progress' && m.payload.depth === 1)).toBe(true)
		expect(resultOf(11)).toBeUndefined()
		expect(resultOf(12)).toMatchObject({ type: 'error', payload: { name: 'TypeError' } })
	})

	it('stops a running game analysis between plies on cancel', async () => {
		const moves = [
			{ code: 'g1-f3', u: null },
			{ code: 'g8-f6', u: null },
			{ code: 'b1-c3', u: null },
			{ code: 'b8-c6', u: null },
		]
		send({
			id: 20,
			type: 'analyzeGame',
			payload: { record: { startState: null, moves }, options: { msPerPly: 1e9, nodeBudget: 800 } },
		})
		await until(() => posted.some((m) => m.id === 20 && m.type === 'progress'))
		send({ id: 21, type: 'cancel', payload: { id: 20 } })
		await new Promise((resolve) => setTimeout(resolve, 300))
		expect(resultOf(20)).toBeUndefined()
		expect(posted.filter((m) => m.id === 20 && m.type === 'progress').length).toBeLessThan(4)
	})

	it('knows the job types of the protocol', () => {
		expect(JOB_TYPES).toEqual([
			'bestMove',
			'analyze',
			'evaluateMove',
			'candidates',
			'solve',
			'analyzeGame',
			'benchmark',
		])
	})
})

describe('client (src/ai/client.js) with a fake Worker', () => {
	beforeAll(() => {
		client.setWorkerFactory(() => new FakeWorker())
	})

	afterAll(() => {
		client.setWorkerFactory(null)
	})

	it('plays a legal computer move and reports "Thinking… depth n"', async () => {
		const depths = []
		const r = await client.bestMove(POS.middlegame(), {
			level: 3,
			rng: E.seededRng(1),
			fast: true,
			onProgress: (p) => depths.push(p.depth),
			...QUICK,
		})
		expect(E.isLegal(POS.middlegame(), r.code)).toBe(true)
		expect(r.displayMs).toBe(0)
		expect(depths[0]).toBe(1)
		expect(client.engineMode()).toBe('worker')
		// The rng is turned into a seed before the job crosses the worker boundary.
		const last = FakeWorker.instances.at(-1).received.at(-1)
		expect(Number.isInteger(last.payload.options.seed)).toBe(true)
		expect(last.payload.options.rng).toBeUndefined()
	})

	it('runs every job type', async () => {
		const [a, ev, cands, sol] = await Promise.all([
			client.analyze(POS.w2(), { ...QUICK, channel: null }),
			client.evaluateMove(POS.w2(), 'c1-h6', QUICK),
			client.candidates(POS.w6(), { strength: 'balanced', tolerance: 0.05, ...QUICK }),
			client.solve(POS.w14(), { goal: 'forced', horizon: 1 }),
		])
		expect(a.best[0].code).toBe('c1-h6')
		expect(ev.outcomes).toHaveLength(2)
		expect(cands[0]).toMatchObject({ code: 'd4|h5-h8', E: 1, ok: true })
		expect(sol.accepted).toEqual(['a1-a8'])
		const plies = []
		const g = await client.analyzeGame(
			{ startState: POS.w2(), moves: [{ code: 'c1-h6', u: 1 }, { code: 'e8-e7', u: null }] },
			{ msPerPly: 100, nodeBudget: 800, onProgress: (p) => plies.push(p) },
		)
		expect(g.plies).toHaveLength(2)
		expect(plies.map((p) => p.code)).toEqual(['c1-h6', 'e8-e7'])
	})

	it('rejects with AbortError and stops the worker when the signal fires', async () => {
		const ac = new AbortController()
		const before = FakeWorker.instances.length
		const p = client.analyze(POS.middlegame(), {
			timeMs: 20000,
			signal: ac.signal,
			channel: null,
			onProgress: () => ac.abort(),
		})
		await expect(p).rejects.toMatchObject({ name: 'AbortError' })
		expect(FakeWorker.instances.at(-1).terminated).toBe(true)
		// The next job gets a fresh worker.
		const r = await client.bestMove(POS.w6(), { level: 1, seed: 1, deterministic: true })
		expect(r.code).toBe('d4|h5-h8')
		expect(FakeWorker.instances.length).toBeGreaterThan(before)
		const done = new AbortController()
		done.abort()
		await expect(client.solve(POS.w14(), { goal: 'forced', signal: done.signal }))
			.rejects.toMatchObject({ name: 'AbortError' })
	})

	it('supersedes older coach analyses and runs the computer\'s move first', async () => {
		const blocker = client.analyzeGame(
			{ startState: null, moves: [{ code: 'e2-e4', u: null }] },
			{ msPerPly: 150, nodeBudget: 600 },
		)
		const first = client.analyze(POS.start(), QUICK)
		const second = client.analyze(POS.middlegame(), QUICK)
		const move = client.bestMove(POS.w6(), { level: 2, seed: 3, deterministic: true })
		await expect(first).rejects.toMatchObject({ name: 'AbortError' })
		const order = []
		await Promise.all([
			blocker.then(() => order.push('game')),
			second.then(() => order.push('analyze')),
			move.then(() => order.push('bestMove')),
		])
		expect(order).toEqual(['game', 'bestMove', 'analyze'])
	})

	it('propagates engine errors and cancels everything on cancelAll', async () => {
		await expect(client.evaluateMove(POS.start(), 'e2-e5', QUICK))
			.rejects.toMatchObject({ name: 'IllegalMoveError' })
		const a = client.analyze(POS.middlegame(), { timeMs: 20000, channel: null })
		const b = client.analyze(POS.middlegame(), { timeMs: 20000, channel: null })
		client.cancelAll()
		await expect(a).rejects.toMatchObject({ name: 'AbortError' })
		await expect(b).rejects.toMatchObject({ name: 'AbortError' })
	})
})

describe('client fallbacks', () => {
	afterAll(() => {
		client.setWorkerFactory(null)
	})

	it('runs on the main thread when no worker can be created', async () => {
		client.setWorkerFactory(() => {
			throw new Error('Workers blocked by the content security policy')
		})
		const r = await client.bestMove(POS.w6(), { level: 3, seed: 1, deterministic: true })
		expect(r.code).toBe('d4|h5-h8')
		expect(client.engineMode()).toBe('main-thread')
	})

	it('moves to the main thread when the worker fails to load', async () => {
		client.setWorkerFactory(() => {
			const w = new FakeWorker()
			w.postMessage = () => setTimeout(
				() => w.onerror({ message: 'Failed to load module script', preventDefault() {} }),
				0,
			)
			return w
		})
		const r = await client.solve(POS.w14(), { goal: 'forced' })
		expect(r.accepted).toEqual(['a1-a8'])
		expect(client.engineMode()).toBe('main-thread')
	})

	it('rejects a job whose worker crashes, and uses a fresh worker next time', async () => {
		let n = 0
		client.setWorkerFactory(() => {
			const w = new FakeWorker()
			n++
			if (n === 1) {
				const post = w.postMessage.bind(w)
				let calls = 0
				w.postMessage = (msg) => {
					calls++
					if (calls === 1) {
						post(msg)
					} else {
						w.onmessage({ data: { id: -1, type: 'progress', payload: {} } }) // alive
						setTimeout(() => w.onerror({ message: 'boom', preventDefault() {} }), 0)
					}
				}
			}
			return w
		})
		await client.solve(POS.w14(), { goal: 'forced' })
		await expect(client.solve(POS.w14(), { goal: 'forced' })).rejects.toThrow('boom')
		const ok = await client.solve(POS.w14(), { goal: 'forced' })
		expect(ok.accepted).toEqual(['a1-a8'])
		expect(n).toBe(2)
	})

	it('measures the device once and caches it in localStorage', async () => {
		const store = new Map()
		globalThis.localStorage = {
			getItem: (k) => (store.has(k) ? store.get(k) : null),
			setItem: (k, v) => store.set(k, String(v)),
		}
		try {
			client.setWorkerFactory(() => new FakeWorker())
			const b = await client.getBenchmark()
			expect(b.nodesPerSecond).toBeGreaterThan(0)
			expect(typeof b.slow).toBe('boolean')
			expect(JSON.parse(store.get(BENCH_KEY))).toMatchObject({ nodesPerSecond: b.nodesPerSecond })
			const count = FakeWorker.instances.length
			const again = await client.getBenchmark()
			expect(again.nodesPerSecond).toBe(b.nodesPerSecond)
			expect(FakeWorker.instances.length).toBe(count) // served from the cache
		} finally {
			delete globalThis.localStorage
		}
	})
})
