/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Random games in every variant: ordinary moves, splits, merges and measurements with random outcomes, and random
 * values for the options marked random (the start position of Chess960). After every move the invariants of the
 * quantum layer must hold: the weights sum to T, the budget and the world bound hold, solid pieces are in the same
 * place in every world, every world is a consistent position, and a finished game has no legal move.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import {
	applyMove,
	BUDGET,
	budget,
	legalMoves,
	loadVariant,
	MAX_WORLDS,
	newGame,
	optionValues,
	splitsFrom,
	T,
	VARIANT_IDS,
} from '../../../src/variants/index.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLIES = 60

/**
 * Check the invariants of a state.
 *
 * @param {object} V variant
 * @param {object} s state
 */
function checkInvariants(V, s) {
	expect(s.worlds.length).toBeGreaterThan(0)
	expect(s.worlds.length).toBeLessThanOrEqual(MAX_WORLDS)
	expect(s.worlds.reduce((a, e) => a + e.w, 0)).toBe(T)
	for (const { b, w } of s.worlds) {
		expect(Number.isInteger(w) && w > 0).toBe(true)
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sq[id] >= 0) {
				expect(b.board[b.sq[id]]).toBe(id)
			}
		}
		b.board.forEach((id, sq) => {
			if (id >= 0) {
				expect(b.sq[id]).toBe(sq)
			}
		})
	}
	for (let side = 0; side < V.sideCount; side++) {
		expect(budget(s, side)).toBeLessThanOrEqual(BUDGET)
	}
	const solid = (b) => b.board
		.map((id) => (id >= 0 && V.solidTypes.has(b.ty[id]) ? b.sd[id] + b.ty[id] : '.'))
		.join(',')
	const first = solid(s.worlds[0].b)
	for (const { b } of s.worlds) {
		expect(solid(b)).toBe(first)
	}
	if (s.result) {
		expect(legalMoves(V, s)).toEqual([])
	}
}

/**
 * The options of a random game: every option marked `random` gets a value drawn with the game's seeded numbers (a
 * whole number between its bounds, one of its choices, yes or no), every other option its default. So Chess960 plays
 * random start positions, the same ones for the same seed.
 *
 * @param {object} V variant
 * @param {() => number} rng random numbers
 * @return {object}
 */
function randomOptions(V, rng) {
	const given = {}
	for (const o of V.options) {
		if (!o.random) {
			continue
		}
		if (o.type === 'number') {
			given[o.id] = o.min + Math.floor(rng() * (o.max - o.min + 1))
		} else if (o.type === 'choice') {
			given[o.id] = o.values[Math.floor(rng() * o.values.length)].id
		} else if (o.type === 'boolean') {
			given[o.id] = rng() < 0.5
		}
	}
	return optionValues(V, given)
}

/**
 * Play one random game.
 *
 * @param {object} V variant
 * @param {number} seed seed
 */
function randomGame(V, seed) {
	const rng = seededRng(seed)
	let s = newGame(V, randomOptions(V, rng), rng)
	checkInvariants(V, s)
	for (let ply = 0; ply < PLIES && !s.result; ply++) {
		let codes = legalMoves(V, s).map((m) => m.code)
		if (ply % 4 === 1) {
			const froms = new Set()
			for (const { b } of s.worlds) {
				for (let id = 0; id < b.sq.length; id++) {
					if (b.sd[id] === s.turn && b.sq[id] >= 0 && V.types[b.ty[id]]?.splittable) {
						froms.add(b.sq[id])
					}
				}
			}
			const list = [...froms]
			const f = list[Math.floor(rng() * list.length)]
			const splits = f === undefined ? [] : splitsFrom(V, s, f).map((m) => m.code)
			if (splits.length) {
				codes = splits
			}
		}
		expect(codes.length, 'a side to move without a result has a legal move').toBeGreaterThan(0)
		const code = codes[Math.floor(rng() * codes.length)]
		const res = applyMove(V, s, code, rng)
		expect(res, code).not.toBeNull()
		s = res.state
		checkInvariants(V, s)
	}
}

describe('the options of a random game', () => {
	it('draws the options marked random with the seed (Chess960 start positions)', async () => {
		const V = await loadVariant('chess960')
		const option = V.options.find((o) => o.random)
		expect(option.id).toBe('position')
		const draw = (seed) => randomOptions(V, seededRng(seed)).position
		const seeds = [1, 2, 3, 4, 5, 6]
		const positions = seeds.map(draw)
		expect(seeds.map(draw)).toEqual(positions)
		for (const p of positions) {
			expect(Number.isInteger(p) && p >= option.min && p <= option.max).toBe(true)
		}
		expect(new Set(positions).size).toBeGreaterThan(3)
		// the game starts from the drawn position
		const s = newGame(V, randomOptions(V, seededRng(1)), seededRng(1))
		expect(s.options.position).toBe(positions[0])
		expect(s.worlds[0].b).toEqual(newGame(V, { position: positions[0] }).worlds[0].b)
	})

	it('keeps the defaults of the options that are not random', async () => {
		const V = await loadVariant('fourplayer')
		expect(V.options.some((o) => o.random)).toBe(false)
		expect(randomOptions(V, seededRng(1))).toEqual(optionValues(V, {}))
	})
})

describe('random games in every variant', () => {
	for (const id of VARIANT_IDS) {
		const present = existsSync(join(HERE, '../../../src/variants', id + '.js'))
		it.skipIf(!present)(id, async () => {
			const V = await loadVariant(id)
			expect(V.id).toBe(id)
			for (const seed of [1, 2]) {
				randomGame(V, seed * 7919 + id.length)
			}
		}, 120000)
	}
})
