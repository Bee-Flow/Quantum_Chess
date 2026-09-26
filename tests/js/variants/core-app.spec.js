/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Package "app" of the multiverse changes to the generic app and computer (multiverse-final.md 7.2): the computer
 * yields to the browser throughout its search, also in the pre-pass, and stops at once when aborted (H2); it checks
 * only its chosen move on the real state when the view is exact (`aiViewExact`, H2) and keeps to a share of the level
 * time (`aiTimeShare`, H3); saved games pack their worlds (record version 2), still read version 1 and report a full
 * storage (H8).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import {
	createVariantGame,
	INDEX_KEY,
	listVariantGames,
	loadVariantGame,
	MAX_GAMES,
	packWorlds,
	RECORD_PREFIX,
	RECORD_VERSION,
	saveVariantGame,
	unpackWorlds,
} from '../../../src/variantplay/variantGames.js'
import { chooseMove, LEVELS } from '../../../src/variants/core/ai.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import { branches, legalMoves, newGame, T } from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { cloneWorld, placePiece } from '../../../src/variants/core/world.js'
import hyper4d from '../../../src/variants/hyper4d.js'
import { cpuMs, stateOf, stopwatch, workClock } from './helpers.js'

const V = defineVariant(Object.assign(orthodoxSpec(), { id: 'test-app', category: 'rules' }))

/**
 * A state of 64 worlds from the start position: six pieces of White (no pawns, no king) each stand on an empty square
 * of the middle of the board in half of the worlds.
 *
 * @param {object} W variant
 * @return {object}
 */
function sixtyFour(W) {
	const s = newGame(W, {}, seededRng(1))
	const b0 = s.worlds[0].b
	const ids = []
	for (let id = 0; id < b0.sq.length && ids.length < 6; id++) {
		if (b0.sd[id] === 0 && b0.sq[id] >= 0 && !W.royalTypes.has(b0.ty[id]) && b0.ty[id] !== 'p') {
			ids.push(id)
		}
	}
	const empty = []
	for (let sq = Math.floor(b0.board.length / 3); sq < b0.board.length && empty.length < 6; sq += 3) {
		if (b0.board[sq] === -1) {
			empty.push(sq)
		}
	}
	const worlds = []
	for (let mask = 0; mask < 64; mask++) {
		const b = cloneWorld(b0)
		ids.forEach((id, i) => {
			if (mask & (1 << i)) {
				placePiece(b, id, empty[i])
			}
		})
		worlds.push({ b, w: T / 64 })
	}
	return { ...s, worlds }
}

/**
 * Run a search (on the wall clock, as in the app, unless `opts.now` is another clock) and measure it: how long it took
 * and the longest stretch in which a 1 ms timer could not run (the longest synchronous block). Both count only the
 * processor time this thread used (`cpuMs`, `stopwatch`), so that a busy machine that holds the whole process back
 * (other test files run in parallel) does not look like a slow search or a block.
 *
 * @param {object} W variant
 * @param {object} s state
 * @param {object} opts `chooseMove` options
 * @return {Promise<{code: string|null, ms: number, block: number, ticks: number}>}
 */
async function measured(W, s, opts) {
	let last = performance.now()
	let lastCpu = cpuMs()
	let block = 0
	let ticks = 0
	const tick = () => {
		const t = performance.now()
		const c = cpuMs()
		block = Math.max(block, Math.min(t - last, c - lastCpu))
		last = t
		lastCpu = c
		ticks++
	}
	const timer = setInterval(tick, 1)
	const elapsed = stopwatch()
	const code = await chooseMove(W, s, opts)
	const ms = elapsed()
	tick()
	clearInterval(timer)
	return { code, ms, block, ticks }
}

/**
 * The best of a few runs of a timed check: a busy machine may hold one run back, never all of them.
 *
 * @param {() => Promise<object>} run one measured run
 * @param {(r: object) => number} cost what to keep small
 * @param {number} [times] how many runs at most
 * @param {number} [enough] stop as soon as a run costs less than this
 * @return {Promise<object>} the run with the least cost
 */
async function bestOf(run, cost, times = 3, enough = 0) {
	let best = null
	for (let i = 0; i < times && !(best && cost(best) < enough); i++) {
		const r = await run()
		if (!best || cost(r) < cost(best)) {
			best = r
		}
	}
	return best
}

describe('H2: the computer yields to the browser throughout its search', () => {
	const big = sixtyFour(hyper4d)
	const easy = LEVELS.find((l) => l.id === 'easy')

	it('has no stretch over 75 ms at 64 worlds on a 4 x 4 x 4 x 4 board, and keeps to its time', async () => {
		// before, the forcing pre-pass alone was one block of 200 ms here (400 ms and more on other positions)
		// a check every half millisecond (800 checks, about 0.6 s on a desktop): the same work on a busy machine,
		// where the search yields more often rather than less, since it yields by the wall clock
		const run = async () => {
			const now = workClock(0.5)
			const r = await measured(hyper4d, big, { level: 'easy', rng: seededRng(1), now })
			return { ...r, counted: now.elapsed() }
		}
		const r = await bestOf(run, (x) => x.block, 3, 75)
		expect(branches(hyper4d, big, r.code)).not.toBeNull()
		expect(r.block).toBeLessThan(75)
		expect(r.ticks).toBeGreaterThan(10)
		expect(r.counted).toBeLessThan(easy.timeMs + 10)
		// on the wall clock, as in the app, it keeps to its time too (processor time, `stopwatch`)
		const wall = await measured(hyper4d, big, { level: 'easy', rng: seededRng(1) })
		expect(branches(hyper4d, big, wall.code)).not.toBeNull()
		expect(wall.ms).toBeLessThan(easy.timeMs + 300)
	})

	it('stops soon after it is aborted, also inside the pre-pass and an evaluation', async () => {
		for (const level of ['easy', 'normal']) {
			const run = async () => {
				const controller = new AbortController()
				// the time from the abort to the end of the search (processor time, `stopwatch`)
				let sinceAbort = null
				setTimeout(() => {
					sinceAbort = stopwatch()
					controller.abort()
				}, 30)
				const r = await measured(hyper4d, big, { level, rng: seededRng(1), signal: controller.signal })
				return { ...r, late: sinceAbort ? sinceAbort() : Infinity }
			}
			const r = await bestOf(run, (x) => x.late, 3, 100)
			expect(r.code).toBeNull()
			expect(r.late).toBeLessThan(100)
		}
	})
})

describe('H3: aiTimeShare', () => {
	const big = sixtyFour(hyper4d)

	it('gives the search that share of the level time, asked with the real state', async () => {
		const seen = []
		const W = {
			...hyper4d,
			/**
			 * A tenth of the level time, and the state it was asked with.
			 *
			 * @param {object} state state
			 * @return {number}
			 */
			aiTimeShare(state) {
				seen.push(state)
				return 0.1
			},
			aiView: (state) => ({ ...state }),
			aiViewExact: true,
		}
		const hard = LEVELS.find((l) => l.id === 'hard')
		// a check per millisecond: at 64 worlds the search runs until the end of its share
		const now = workClock(1)
		const code = await chooseMove(W, big, { level: 'hard', rng: seededRng(2), now })
		expect(branches(hyper4d, big, code)).not.toBeNull()
		expect(now.elapsed()).toBeGreaterThanOrEqual(hard.timeMs / 10)
		expect(now.elapsed()).toBeLessThan(hard.timeMs / 10 + 10)
		expect(seen).toEqual([big])
		expect(seen[0]).toBe(big)
	})

	it('counts a share outside (0, 1] as the whole level time', async () => {
		const easy = LEVELS.find((l) => l.id === 'easy')
		for (const share of [0, -1, Number.NaN, 7]) {
			const W = { ...hyper4d, aiTimeShare: () => share }
			const now = workClock(1)
			await chooseMove(W, sixtyFour(hyper4d), { level: 'easy', rng: seededRng(3), now })
			expect(now.elapsed(), String(share)).toBeGreaterThanOrEqual(easy.timeMs)
			expect(now.elapsed(), String(share)).toBeLessThan(easy.timeMs + 10)
		}
	})
})

describe('H2: the end of the time', () => {
	it('does not play a move that loses while a move not yet judged may not', async () => {
		// the side whose king leaves e1 loses at once; the king's moves come first
		const W = defineVariant(Object.assign(orthodoxSpec(), {
			id: 'test-app-grace',
			category: 'rules',
			aiTimeShare: () => 1e-9,
			/**
			 * White loses once its king (piece 0) has left e1.
			 *
			 * @param {object} s state
			 * @return {object|null}
			 */
			stateResult(s) {
				return s.worlds[0].b.sq[0] === W.topology.byName('e1') ? null : { winner: 1, reason: 'test' }
			},
		}))
		const s = stateOf(W, [[{ e1: '0:k', a2: '0:p', e8: '1:k' }, 1]])
		expect(legalMoves(W, s)[0].code).toMatch(/^e1-/)
		for (const level of ['easy', 'normal', 'hard']) {
			for (let seed = 1; seed <= 3; seed++) {
				// a check per millisecond: the search looks on for at most 100 checks after its time
				const now = workClock(1)
				const code = await chooseMove(W, s, { level, rng: seededRng(seed), now })
				expect(code, level + ' ' + seed).toMatch(/^a2-/)
				expect(now.elapsed()).toBeLessThan(150)
			}
		}
	})

	it('keeps a probable loss rather than a move judged without its answer that loses at once', async () => {
		// the clock of the search runs out right after the evaluation call number `at` (the time is then within the
		// grace period)
		const clock = { now: 1e12, calls: 0, at: -1 }
		const W = defineVariant(Object.assign(orthodoxSpec(), {
			id: 'test-app-grace-answer',
			category: 'rules',
			allowQuantum: (s, a) => a.type !== 'split',
			/**
			 * No positional terms; counts the calls and spends the time at call `at`.
			 *
			 * @return {number}
			 */
			evaluate() {
				clock.calls++
				if (clock.calls === clock.at) {
					clock.now += LEVELS[1].timeMs + 1
				}
				return 0
			},
		}))
		// a Black rook ghost on e7 (60 %) or b7 (40 %) and a bishop on h3: after a2-a3 the rook takes the king on e1
		// in 60 % of the worlds (a probable loss, which only the answer shows); e1-f1 walks into the bishop (a certain
		// loss by the answer, but no loss without it)
		const s = stateOf(W, [
			[{ a2: '0:p', e1: '0:k', e7: '1:r', h3: '1:b', h8: '1:k' }, 3],
			[{ a2: '0:p', e1: '0:k', b7: '1:r', h3: '1:b', h8: '1:k' }, 2],
		])
		expect(legalMoves(W, s).map((m) => m.code).slice(0, 2)).toEqual(['a2-a3', 'e1-f1'])
		const now = () => clock.now
		const picks = new Set()
		for (let at = 1; at <= 60; at++) {
			clock.now = 1e12
			clock.calls = 0
			clock.at = at
			picks.add(await chooseMove(W, s, { level: 'normal', rng: () => 0.5, now }))
		}
		expect(picks.has('e1-f1')).toBe(false)
		// with the whole time the computer steps aside to d1
		clock.at = -1
		expect(await chooseMove(W, s, { level: 'normal', rng: () => 0.5, now })).toBe('e1-d1')
	})
})

describe('H2: aiViewExact', () => {
	// the real position: the pawn on e2 blocks the queen; the view has no pawn there and a Black queen on h5, so its
	// best move d1-h5 is not legal on the real state
	const real = stateOf(V, [[{ g1: '0:k', d1: '0:q', e2: '0:p', a2: '0:p', g8: '1:k', a7: '1:p' }, 1]])
	const seen = stateOf(V, [[{ g1: '0:k', d1: '0:q', a2: '0:p', g8: '1:k', a7: '1:p', h5: '1:q' }, 1]])

	/**
	 * A variant whose computer searches the view above, and the real state wrapped so that the reads of its worlds
	 * after `aiView` are counted (each move checked on the real state reads them).
	 *
	 * @param {boolean} exact the declaration flag `aiViewExact`
	 * @return {{W: object, state: object, reads: () => number}}
	 */
	function counted(exact) {
		let counting = false
		let reads = 0
		const state = new Proxy(real, {
			get(target, key) {
				if (counting && key === 'worlds') {
					reads++
				}
				return target[key]
			},
		})
		const W = defineVariant(Object.assign(orthodoxSpec(), {
			id: 'test-app-view',
			category: 'rules',
			aiViewExact: exact,
			/**
			 * The view: the position `seen`, counted from here on.
			 *
			 * @return {object}
			 */
			aiView() {
				counting = true
				return seen
			},
		}))
		return { W, state, reads: () => reads }
	}

	it('plays a legal move when the best move of the view is not legal on the real state', async () => {
		expect(branches(V, seen, 'd1-h5')).not.toBeNull()
		expect(branches(V, real, 'd1-h5')).toBeNull()
		for (const exact of [true, false]) {
			for (const level of ['easy', 'normal']) {
				const { W, state } = counted(exact)
				const code = await chooseMove(W, state, { level, rng: seededRng(1), now: workClock() })
				expect(code, `${exact} ${level}`).not.toBe('d1-h5')
				expect(branches(V, real, code), `${exact} ${level}: ${code}`).not.toBeNull()
			}
		}
	})

	it('checks only the chosen move (and the next best) on the real state instead of every candidate', async () => {
		const exact = counted(true)
		await chooseMove(exact.W, exact.state, { level: 'normal', rng: seededRng(1), now: workClock() })
		const each = counted(false)
		await chooseMove(each.W, each.state, { level: 'normal', rng: seededRng(1), now: workClock() })
		expect(exact.reads()).toBeGreaterThan(0)
		expect(exact.reads() * 5).toBeLessThan(each.reads())
	})
})

/**
 * A `localStorage` stand-in with a quota (in characters of keys and values, as browsers count it) and keys whose
 * writes fail.
 */
class QuotaStorage {
	/**
	 * @param {number} [quota] characters the storage holds
	 */
	constructor(quota = Infinity) {
		this.quota = quota
		this.data = new Map()
		this.failing = new Set()
	}

	/**
	 * The characters in use.
	 *
	 * @return {number}
	 */
	used() {
		let n = 0
		for (const [k, v] of this.data) {
			n += k.length + v.length
		}
		return n
	}

	/**
	 * @param {string} key key
	 * @return {string|null}
	 */
	getItem(key) {
		return this.data.has(key) ? this.data.get(key) : null
	}

	/**
	 * @param {string} key key
	 * @param {string} value value
	 */
	setItem(key, value) {
		const text = String(value)
		const old = this.data.has(key) ? key.length + this.data.get(key).length : 0
		if (this.failing.has(key) || this.used() - old + key.length + text.length > this.quota) {
			throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
		}
		this.data.set(key, text)
	}

	/**
	 * @param {string} key key
	 */
	removeItem(key) {
		this.data.delete(key)
	}
}

/**
 * The stored JSON of a key.
 *
 * @param {QuotaStorage} storage storage
 * @param {string} key key
 * @return {unknown}
 */
function stored(storage, key) {
	const raw = storage.getItem(key)
	return raw === null ? null : JSON.parse(raw)
}

/**
 * Plain JSON data, as a state reads back from the storage.
 *
 * @param {unknown} v value
 * @return {unknown}
 */
function plain(v) {
	return JSON.parse(JSON.stringify(v))
}

describe('H8: saved records of version 2', () => {
	let storage

	beforeEach(() => {
		storage = new QuotaStorage()
		vi.stubGlobal('window', { localStorage: storage })
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	const players = [{ kind: 'human' }, { kind: 'computer', level: 'normal' }]

	it('packs the worlds of a state into a small part of their size and unpacks them exactly', () => {
		const s = sixtyFour(hyper4d)
		const packed = packWorlds(s.worlds)
		expect(packed[0]).toEqual({ b: s.worlds[0].b, w: T / 64 })
		expect(packed.slice(1).every((e) => e.d && !e.b && !e.f && !e.n)).toBe(true)
		const text = JSON.stringify(packed)
		expect(text.length * 5).toBeLessThan(JSON.stringify(s.worlds).length)
		expect(unpackWorlds(JSON.parse(text))).toEqual(plain(s.worlds))
	})

	it('keeps the extra state and the array lengths that differ, and a world of another shape in full', () => {
		const b0 = { sq: [0, 1, -1], ty: ['k', 'q', 'n'], sd: [0, 1, 0], board: [0, 1, -1, -1], x: { ep: -1, n: [1] } }
		const b1 = { sq: [0, 2, -1, -2], ty: ['k', 'q', 'n', 'p'], sd: [0, 1, 0, 1], board: [0, -1, 1, -1], x: b0.x }
		const b2 = { sq: [0, 1], ty: ['k', 'q'], sd: [0, 1], board: [0, 1, -1, -1], x: { ep: 3, n: [1] } }
		const b3 = { sq: [0, 1], ty: ['k', 'q'], sd: [0, 1], board: [0, 1, -1, -1], x: {}, more: 1 }
		const worlds = [b0, b1, b2, b3].map((b) => ({ b, w: T / 4 }))
		const packed = plain(packWorlds(worlds))
		expect(packed[1]).toEqual({
			w: T / 4,
			d: { sq: [1, 2, 3, -2], ty: [3, 'p'], sd: [3, 1], board: [1, -1, 2, 1] },
			n: { sq: 4, ty: 4, sd: 4 },
		})
		expect(packed[2]).toEqual({ w: T / 4, d: {}, n: { sq: 2, ty: 2, sd: 2 }, f: { x: { ep: 3, n: [1] } } })
		expect(packed[3]).toEqual({ b: b3, w: T / 4 })
		const back = unpackWorlds(packed)
		expect(back).toEqual(plain(worlds))
		// every unpacked world has its own extra state
		expect(back[1].b.x).not.toBe(back[0].b.x)
	})

	it('saves a record as version 2 with packed worlds and loads it with every world in full', () => {
		const initial = newGame(hyper4d)
		const rec = createVariantGame({ variant: hyper4d.id, options: {}, players, initial })
		const current = sixtyFour(hyper4d)
		const worlds = current.worlds
		const next = { ...rec, moves: [{ code: 'x', i: 0 }], current }
		expect(saveVariantGame(next)).toBe(true)
		// the record in memory keeps its worlds
		expect(next.current.worlds).toBe(worlds)
		expect(next.current.worlds[5].b).toBe(worlds[5].b)
		const raw = stored(storage, RECORD_PREFIX + rec.id)
		expect(raw.v).toBe(RECORD_VERSION)
		expect(raw.current.worlds).toHaveLength(64)
		expect(raw.current.worlds[1].b).toBeUndefined()
		expect(raw.current.worlds[1].d).toBeDefined()
		const loaded = loadVariantGame(rec.id)
		expect(loaded.v).toBe(RECORD_VERSION)
		expect(loaded.current).toEqual(plain(current))
		expect(loaded.initial).toEqual(plain(initial))
		expect(loaded.moves).toEqual([{ code: 'x', i: 0 }])
		expect(listVariantGames()).toEqual([expect.objectContaining({ id: rec.id, variant: hyper4d.id, ply: 0 })])
	})

	it('still reads a record of version 1 and saves it again as version 2', () => {
		const current = sixtyFour(hyper4d)
		const v1 = {
			v: 1,
			id: 'vg_old',
			variant: hyper4d.id,
			options: {},
			players,
			autoFlip: false,
			initial: newGame(hyper4d),
			moves: [],
			rolls: { '0:abc:e2-e4': 0.5 },
			current,
			created: 1,
			updated: 2,
		}
		storage.setItem(RECORD_PREFIX + v1.id, JSON.stringify(v1))
		const loaded = loadVariantGame(v1.id)
		expect(loaded).toEqual({ ...plain(v1), v: RECORD_VERSION })
		expect(saveVariantGame(loaded)).toBe(true)
		expect(stored(storage, RECORD_PREFIX + v1.id).v).toBe(RECORD_VERSION)
		expect(loadVariantGame(v1.id).current).toEqual(plain(current))
	})

	it('reads nothing from a record of an unknown version or without worlds', () => {
		const good = { v: 1, current: newGame(V), initial: newGame(V) }
		storage.setItem(RECORD_PREFIX + 'a', JSON.stringify({ ...good, v: 3 }))
		storage.setItem(RECORD_PREFIX + 'b', JSON.stringify({ ...good, current: { ...good.current, worlds: [] } }))
		storage.setItem(RECORD_PREFIX + 'c', JSON.stringify({ ...good, v: 2, initial: null }))
		storage.setItem(RECORD_PREFIX + 'd', '{broken')
		for (const id of ['a', 'b', 'c', 'd', 'missing']) {
			expect(loadVariantGame(id), id).toBeNull()
		}
		storage.setItem(RECORD_PREFIX + 'e', JSON.stringify(good))
		expect(loadVariantGame('e')).not.toBeNull()
	})

	it('returns false when the storage is full, and keeps the stored copy and the index as they were', () => {
		const rec = createVariantGame({ variant: hyper4d.id, options: {}, players, initial: newGame(hyper4d) })
		const big = sixtyFour(hyper4d)
		// room for the packed record, not for the plain one
		storage.quota = storage.used() + JSON.stringify(packWorlds(big.worlds)).length + 20000
		expect(JSON.stringify(big).length).toBeGreaterThan(storage.quota)
		expect(saveVariantGame({ ...rec, current: big })).toBe(true)
		const index = stored(storage, INDEX_KEY)
		// a state that does not fit even packed: nothing changes
		const huge = { ...big, ply: 7, history: new Array(2000).fill({ code: 'e2-e4', note: 'x'.repeat(40) }) }
		expect(saveVariantGame({ ...rec, current: huge })).toBe(false)
		expect(loadVariantGame(rec.id).current).toEqual(plain(big))
		expect(stored(storage, INDEX_KEY)).toEqual(index)
		// a storage that is not available at all
		vi.stubGlobal('window', {})
		expect(saveVariantGame({ ...rec, current: big })).toBe(false)
	})

	it('removes a new game again when its index entry cannot be written, and keeps a listed one', () => {
		const rec = createVariantGame({ variant: V.id, options: {}, players, initial: newGame(V) })
		storage.failing.add(INDEX_KEY)
		const fresh = { ...rec, id: 'vg_new' }
		expect(saveVariantGame(fresh)).toBe(false)
		expect(storage.getItem(RECORD_PREFIX + 'vg_new')).toBeNull()
		// the game already listed is saved: its entry is only out of date
		const moved = { ...rec, moves: [{ code: 'e2-e4', i: 0 }] }
		expect(saveVariantGame(moved)).toBe(true)
		expect(loadVariantGame(rec.id).moves).toEqual(moved.moves)
		expect(listVariantGames().map((e) => e.id)).toEqual([rec.id])
	})

	it('creates no game that the storage refuses, and makes room by removing finished games, the oldest first', () => {
		const initial = newGame(V)
		const running = createVariantGame({ variant: V.id, options: {}, players, initial })
		const done = { ...initial, result: { winner: 0, reason: 'king' } }
		const old = createVariantGame({ variant: V.id, options: {}, players, initial: done })
		const recent = createVariantGame({ variant: V.id, options: {}, players, initial: done })
		// room for one more game once the older finished game is gone
		const size = storage.getItem(RECORD_PREFIX + old.id).length
		storage.quota = storage.used() + size / 2
		const next = createVariantGame({ variant: V.id, options: {}, players, initial })
		expect(next).not.toBeNull()
		expect(loadVariantGame(next.id)).not.toBeNull()
		expect(loadVariantGame(old.id)).toBeNull()
		expect(loadVariantGame(recent.id)).not.toBeNull()
		expect(listVariantGames().map((e) => e.id)).toEqual([next.id, recent.id, running.id])
		// a larger game that does not fit even then: the finished game goes, the running ones stay, nothing is created
		storage.quota = storage.used()
		expect(createVariantGame({ variant: hyper4d.id, options: {}, players, initial: newGame(hyper4d) })).toBeNull()
		expect(listVariantGames().map((e) => e.id)).toEqual([next.id, running.id])
		expect(loadVariantGame(running.id)).not.toBeNull()
		expect(storage.getItem(RECORD_PREFIX + recent.id)).toBeNull()
	})

	it('keeps at most MAX_GAMES games, dropping the oldest finished one first', () => {
		const ids = []
		for (let i = 0; i <= MAX_GAMES; i++) {
			const initial = i === 1 ? { ...newGame(V), result: { winner: 0, reason: 'king' } } : newGame(V)
			ids.push(createVariantGame({ variant: V.id, options: {}, players, initial }).id)
		}
		const listed = listVariantGames().map((e) => e.id)
		expect(listed).toHaveLength(MAX_GAMES)
		expect(listed).not.toContain(ids[1])
		expect(storage.getItem(RECORD_PREFIX + ids[1])).toBeNull()
		expect(loadVariantGame(ids[0])).not.toBeNull()
		// a new game that is already finished, while no listed game is: the oldest game goes, not the new one
		const initial = { ...newGame(V), result: { winner: 1, reason: 'king' } }
		const done = createVariantGame({ variant: V.id, options: {}, players, initial })
		expect(loadVariantGame(done.id)).not.toBeNull()
		expect(listVariantGames().map((e) => e.id)).toEqual([done.id, ...listed.slice(0, -1)])
		expect(loadVariantGame(ids[0])).toBeNull()
	})
})
