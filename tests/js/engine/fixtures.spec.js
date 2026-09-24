/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Replays tests/fixtures/engine/*.json with the JavaScript engine exactly as the PHP twin does. This guards the
 * committed parity fixtures against drift and documents the replay procedure.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { E } from './helpers.js'

const DIR = join(import.meta.dirname, '../../fixtures/engine')
const REQUIRED = ['vectors.json', 'parser.json', 'views.json', 'records.json', 'games-001.json']
const MISSING = ' is missing: run `npm run fixtures` to generate the parity fixtures'

/**
 * Read one fixture file. A missing file fails the test; it is never skipped.
 *
 * @param {string} name file name in tests/fixtures/engine
 * @return {unknown}
 */
function load(name) {
	const path = join(DIR, name)
	if (!existsSync(path)) {
		throw new Error(path + MISSING)
	}
	return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Replay one game fixture; returns the number of steps.
 *
 * @param {object} game game fixture
 * @return {number}
 */
function replay(game) {
	let s = JSON.parse(game.start)
	const v = E.validateState(s)
	if (!v.ok || E.serializeState(v.state) !== game.start) {
		throw new Error(game.name + ': start is not a canonical valid state')
	}
	if (game.setup !== null) {
		if (E.serializeState(E.setupPosition(game.setup)) !== game.start) {
			throw new Error(game.name + ': setup does not give start')
		}
	}
	game.steps.forEach((st, i) => {
		const where = game.name + ' step ' + i + ' ' + st.code
		const legal = E.legalCodes(s)
		if (legal.join(' ') !== st.legal.join(' ')) {
			throw new Error(where + ': legal list differs')
		}
		const opts = st.outcome !== null ? { outcome: st.outcome } : (st.u !== null ? { u: st.u } : {})
		const r = E.applyMove(s, st.code, opts)
		if (E.serializeState(r.state) !== st.after) {
			throw new Error(where + ': state differs')
		}
		if (JSON.stringify(r.measurement) !== JSON.stringify(st.measurement)) {
			throw new Error(where + ': measurement differs')
		}
		if (E.moveNotation(s, st.code, r.measurement) !== st.notation) {
			throw new Error(where + ': notation differs')
		}
		if (E.positionHash(r.state) !== st.hash) {
			throw new Error(where + ': hash differs')
		}
		const views = {
			kd: [E.kingDanger(r.state, 'w'), E.kingDanger(r.state, 'b')],
			budget: [E.budget(r.state, 'w'), E.budget(r.state, 'b')],
			worlds: E.worldCount(r.state),
			links: E.links(r.state),
			trapped: E.kingTrapped(r.state),
		}
		if (JSON.stringify(views) !== JSON.stringify(st.views)) {
			throw new Error(where + ': views differ')
		}
		s = JSON.parse(st.after)
	})
	return game.steps.length
}

describe('fixture replay', () => {
	it('files and sizes', () => {
		for (const f of REQUIRED) {
			expect(existsSync(join(DIR, f)), f + MISSING).toBe(true)
		}
		const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))
		expect(files).toEqual(expect.arrayContaining(REQUIRED))
		let total = 0
		for (const f of files) {
			const size = readFileSync(join(DIR, f)).length
			expect(size, f).toBeLessThanOrEqual(2 * 1024 * 1024)
			total += size
		}
		expect(total).toBeLessThanOrEqual(8 * 1024 * 1024)
	})

	it('games', () => {
		let steps = 0
		for (const f of readdirSync(DIR).filter((x) => x.startsWith('games-')).sort()) {
			const games = load(f)
			expect(Array.isArray(games) && games.length >= 1 && games.length <= 20).toBe(true)
			for (const g of games) {
				steps += replay(g)
			}
		}
		expect(steps).toBeGreaterThan(1500)
	}, 120000)

	it('vectors: start, rescale, r → u, pct, move order', () => {
		const v = load('vectors.json')
		expect(E.serializeState(E.initialState())).toBe(v.start.json)
		expect(E.positionHash(E.initialState())).toBe(v.start.hash)
		for (const x of v.rescale) {
			expect(E.rescaleWeights(x.weights)).toEqual(x.expect)
		}
		for (const x of v.rToU) {
			expect(E.uFromRandom(x.r)).toBe(x.u)
		}
		for (const x of v.pct) {
			expect(E.pct(x.weight)).toBe(x.expect)
		}
		expect(E.legalCodes(JSON.parse(v.moveOrder.state))).toEqual(v.moveOrder.legal)
	})

	it('vectors: scripted examples', () => {
		for (const g of load('vectors.json').examples) {
			replay(g)
		}
	})

	it('vectors: whyIllegal, setup and setup errors', () => {
		const v = load('vectors.json')
		for (const c of v.whyIllegal) {
			expect(E.whyIllegal(JSON.parse(c.state), c.input), c.name).toBe(c.expect)
		}
		for (const c of v.setup) {
			expect(E.serializeState(E.setupPosition(c.spec))).toBe(c.expect)
		}
		for (const c of v.setupErrors) {
			expect(() => E.setupPosition(c.spec)).toThrowError(expect.objectContaining({ code: c.expect }))
			if (c.detail !== null) {
				expect(() => E.setupPosition(c.spec)).toThrowError(expect.objectContaining({ detail: c.detail }))
			}
		}
	})

	it('parser', () => {
		for (const c of load('parser.json')) {
			expect(E.parseMoveCode(c.input), JSON.stringify(c.input)).toEqual(c.expect)
		}
	})

	it('views', () => {
		for (const c of load('views.json')) {
			const s = JSON.parse(c.state)
			expect(E.kingDanger(s, 'w')).toBe(c.kingDanger.w)
			expect(E.kingDanger(s, 'b')).toBe(c.kingDanger.b)
			expect(E.budget(s, 'w')).toBe(c.budget.w)
			expect(E.budget(s, 'b')).toBe(c.budget.b)
			expect(E.worldCount(s)).toBe(c.worlds)
			expect(E.links(s)).toEqual(c.links)
			expect(E.linkGroups(s)).toEqual(c.linkGroups)
			expect(E.kingTrapped(s)).toBe(c.kingTrapped)
			expect(JSON.stringify(E.squareView(s))).toBe(JSON.stringify(c.squareView))
			const risks = {}
			for (const m of E.generateMoves(s)) {
				risks[m.code] = E.moveRisk(s, m.code)
			}
			expect(risks).toEqual(c.moveRisk)
		}
	})

	it('records', () => {
		const r = load('records.json')
		for (const c of r.chain) {
			let prev = E.chainStart(c.gameId, c.whiteUid, c.blackUid, c.createdAt)
			expect(prev).toBe(c.chain0)
			for (const m of c.moves) {
				expect(E.sha256hex(m.after)).toBe(m.afterSha256)
				prev = E.chainNext(prev, m.ply, m.code, m.u, m.key, m.after)
				expect(prev).toBe(m.chain)
			}
		}
		for (const c of r.rollDisplay) {
			expect(E.rollDisplay(c.record, c.labels ?? undefined)).toBe(c.text)
			expect(E.rollIntervals(c.record)).toEqual(c.intervals)
		}
		for (const c of r.rollIdentity) {
			expect(E.rollIdentity(JSON.parse(c.state), c.code)).toBe(c.expect)
		}
		for (const c of r.supportKey) {
			expect(E.supportKey(JSON.parse(c.state))).toBe(c.key)
			expect(E.supportKeyMirror(JSON.parse(c.state))).toBe(c.mirror)
		}
		for (const c of r.certainFen) {
			expect(E.certainFen(JSON.parse(c.state))).toBe(c.fen)
		}
		for (const c of r.sha256) {
			expect(E.sha256hex(c.text)).toBe(c.hex)
		}
	})
})
