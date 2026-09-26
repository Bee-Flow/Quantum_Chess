/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Multiverse chess against 5d-chess-js 1.2.1, an independent implementation of 5D chess: random classical games on
 * every setup (fixtures/multiverse-cross.json, written by fixtures/multiverse-cross.mjs), replayed with the real
 * module through the core. At every position the legal moves of the side to move must be exactly 5d-chess-js's (their
 * number and the hash of the sorted list), and so must the boards that must move, whether the turn may be submitted,
 * and the 5D check (the opponent's captures of a royal piece after the must-move boards are passed).
 *
 * Only the deliberate differences of the app (docs/variants.md, "Multiverse chess (5D)") are excluded, each checked
 * on the position (`ONLY_REFERENCE`, `ONLY_APP`):
 *
 * - `cap`: the app lets each player open only the timelines the game allows. The test lifts the cap and adds the
 *   branches it gets back; each must be a branch of a player that has opened all its timelines, and such a player
 *   has no branch of its own but one that captures a royal piece.
 * - `reach`, `reachPath`: the app seals boards older than the travel reach. The fixture lists 5d-chess-js's moves
 *   onto such a board (`r`; `kr` for the check) or, for a rider or a double step, through one; each is checked.
 * - `castle`: the app allows castling out of, through and into danger (there is no check rule). The fixture lists
 *   the castling moves 5d-chess-js refuses for that reason (`o`); each must be a castling move of the app.
 * - `epOccupied`, `epNoBoard`: the app keeps the en passant cell of the double step itself, while 5d-chess-js infers
 *   the double step from the board one turn earlier, so it misses en passant when that board does not exist or held a
 *   piece on the victim's cell (`o`); each must be an en passant capture of the app in that situation.
 *
 * A position is `{ i, n, h, m, s?, k?, r?, kr?, o? }`: the number of codes played, the count and hash of 5d-chess-js's
 * moves (see fixtures/multiverse-cross-lib.mjs for the form of a move), the must-move timelines, `s: 1` when the turn
 * may be submitted, the count and hash of the check moves, and the listed differences.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyMove, legalMoves, newGame } from '../../../src/variants/core/quantum.js'
import V from '../../../src/variants/multiverse.js'
import { phantomPass } from '../../../src/variants/multiverse/moves.js'
import { ROYAL } from '../../../src/variants/multiverse/pieces.js'
import { SETUP_ORDER } from '../../../src/variants/multiverse/setup.js'
import { canSubmit, decode, lOf, mandatory, slotAt, sqOf } from '../../../src/variants/multiverse/skeleton.js'
import { appMoves, digest, reachCut } from './fixtures/multiverse-cross-lib.mjs'

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/multiverse-cross.json', import.meta.url), 'utf8'))

/**
 * The deliberate differences of a move that only 5d-chess-js has, with the check that it really has one.
 *
 * @type {Record<string, (w: object, m: object|null, s: string, pass?: boolean[]|null) => boolean>}
 */
const ONLY_REFERENCE = {
	// a branch of a player who has opened all the timelines the game allows (the app's move with the cap lifted)
	cap: (w, m) => m !== null && m.kind === 'branch' && w.x.c[w.x.s] >= w.x.m,
	// a move onto a board older than the travel reach, or a ride or double step through one (listed in the fixture)
	reach: (w, m, s, pass = null) => m === null && reachCut(w, s, pass) !== null,
}

/**
 * The deliberate differences of a move that only the app has, with the check that it really has one.
 *
 * @type {Record<string, (w: object, m: object) => boolean>}
 */
const ONLY_APP = {
	// castling, allowed in danger
	castle: (w, m) => m.kind === 'castle',
	// en passant whose row has no board one turn earlier
	epNoBoard: (w, m) => m.kind === 'ep' && w.x.tl[m.extra.u][1] - 2 < w.x.tl[m.extra.u][0],
	// en passant where the victim's cell was occupied one turn earlier
	epOccupied: (w, m) => {
		const x = w.x
		const e = m.extra
		const v = x.tl[e.u][1]
		return m.kind === 'ep' && v - 2 >= x.tl[e.u][0]
			&& w.board[sqOf(e.u, slotAt(x, e.u, v - 2), e.tx, decode(m.from).y)] >= 0
	},
}

/**
 * The moves of the side to move as 5d-chess-js has them, from the app's moves and the listed differences.
 *
 * @param {object} state state
 * @param {object} pos the position of the fixture
 * @return {string[]} signatures
 */
function expectedMoves(state, pos) {
	const w = state.worlds[0].b
	const side = state.turn
	const mine = appMoves(w, side)
	const lifted = appMoves(w, side, { lift: true })
	// the app's generation, its keys and the core's legal moves agree (one world, no ghosts)
	const codes = legalMoves(V, state).map((m) => m.code).filter((c) => c !== 'submit')
	expect(codes.sort()).toEqual([...mine.values()].map((m) => m.key).sort())
	for (const [s, m] of lifted) {
		if (!mine.has(s)) {
			expect(ONLY_REFERENCE.cap(w, m, s), s).toBe(true)
		}
	}
	// and at the cap the app opens no timeline: a branch then captures a royal piece, which ends the game
	for (const [s, m] of mine) {
		if (m.kind === 'branch' && !m.extra.noRow) {
			expect(w.x.c[state.turn], s).toBeLessThan(w.x.m)
		}
	}
	const out = new Set(lifted.keys())
	for (const [s, why] of pos.o ?? []) {
		expect(out.has(s), s).toBe(true)
		expect(ONLY_APP[why](w, lifted.get(s)), s + ' ' + why).toBe(true)
		out.delete(s)
	}
	for (const s of pos.r ?? []) {
		expect(ONLY_REFERENCE.reach(w, lifted.get(s) ?? null, s), s).toBe(true)
		out.add(s)
	}
	return [...out]
}

/**
 * The 5D check of the side to move as 5d-chess-js has it: the opponent's royal captures after the must-move boards are
 * passed, with the cap lifted, and the listed captures through sealed boards.
 *
 * @param {object} state state
 * @param {object} pos the position of the fixture
 * @return {string[]} signatures
 */
function expectedChecks(state, pos) {
	const w = state.worlds[0].b
	const pass = phantomPass(w.x)
	const phantom = appMoves(w, 1 - state.turn, { lift: true, pass })
	const out = [...phantom.entries()].filter(([, m]) => m.capture >= 0 && ROYAL.has(w.ty[m.capture])).map(([s]) => s)
	for (const s of pos.kr ?? []) {
		expect(ONLY_REFERENCE.reach(w, phantom.get(s) ?? null, s, pass), s).toBe(true)
		out.push(s)
	}
	return out
}

describe('multiverse chess against 5d-chess-js', () => {
	it('covers every setup, with the moves and the differences that matter', () => {
		expect(FIXTURE.reference).toBe('5d-chess-js 1.2.1')
		expect(new Set(FIXTURE.games.map((g) => g.setup))).toEqual(new Set(SETUP_ORDER))
		const positions = FIXTURE.games.flatMap((g) => g.positions)
		expect(positions.length).toBeGreaterThan(1000)
		const codes = FIXTURE.games.flatMap((g) => g.codes)
		// travel, new timelines, promotion, castling and en passant are all played
		expect(codes.filter((c) => c.includes('>>')).length).toBeGreaterThan(100)
		expect(codes.filter((c) => /[^>]>\(/.test(c)).length).toBeGreaterThan(100)
		expect(codes.some((c) => c.endsWith('=Q'))).toBe(true)
		const listed = positions.flatMap((p) => (p.o ?? []).map(([, why]) => why))
		expect(new Set(listed)).toEqual(new Set(Object.keys(ONLY_APP)))
		expect(positions.filter((p) => p.r).length).toBeGreaterThan(50)
		expect(positions.filter((p) => p.k).length).toBeGreaterThan(100)
		expect(FIXTURE.games.map((g) => g.reach + '/' + g.timelines)).toEqual(expect.arrayContaining(['2/2', '4/1']))
	})

	for (const setup of SETUP_ORDER) {
		it('plays ' + setup + ' as 5d-chess-js does', () => {
			for (const game of FIXTURE.games.filter((g) => g.setup === setup)) {
				let state = newGame(V, { setup, timelines: game.timelines, reach: game.reach, view: 'white' })
				let played = 0
				for (const pos of game.positions) {
					for (; played < pos.i; played++) {
						const res = applyMove(V, state, game.codes[played], 0)
						expect(res, game.codes[played]).not.toBeNull()
						state = res.state
					}
					const where = setup + ' after ' + pos.i + ' codes'
					expect(state.result, where).toBeNull()
					const x = state.worlds[0].b.x
					expect(digest(expectedMoves(state, pos)), where).toEqual([pos.n, pos.h])
					expect(mandatory(x).map((u) => lOf(u, x.md)).sort((a, b) => a - b), where).toEqual(pos.m)
					expect(canSubmit(x), where).toBe(pos.s === 1)
					expect(digest(expectedChecks(state, pos)), where).toEqual(pos.k ?? [0, ''])
				}
			}
		})
	}
})
