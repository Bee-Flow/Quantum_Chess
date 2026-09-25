/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The computer player of multiverse chess (handoff/research/multiverse-final.md section 6.15, tests A1 to A5): the 5D
 * terms of the evaluation, the pruned view of the must-move boards (exact, and keeping the branch that moves the
 * present back), no answer inside the own turn, the time share of a turn, and games: the computer plays whole legal
 * turns, never strands itself while a way out exists, takes a king, keeps its time budget and beats a random mover.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { chooseMove, evaluateState, LEVELS } from '../../../src/variants/core/ai.js'
import {
	applyMove,
	applyOutcome,
	branches,
	isLegal,
	legalMoves,
	newGame,
	ordinaryMoves,
	splitsFrom,
	stateAfter,
	T,
} from '../../../src/variants/core/quantum.js'
import V from '../../../src/variants/multiverse.js'
import { aiTimeShare, evaluate, replySide, scans, viewFilter, WEIGHTS } from '../../../src/variants/multiverse/ai.js'
import { SUBMIT } from '../../../src/variants/multiverse/moves.js'
import { buildWorld } from '../../../src/variants/multiverse/setup.js'
import { LAB, mandatory, playable, ROWS } from '../../../src/variants/multiverse/skeleton.js'

/**
 * A square by its static name.
 *
 * @param {string} name square name, e.g. `(0)c3`
 * @return {number}
 */
function sq(name) {
	const s = V.topology.byName(name)
	if (s < 0) {
		throw new Error('unknown square ' + name)
	}
	return s
}

/**
 * A new game.
 *
 * @param {string} [setup] setup id
 * @return {object}
 */
function start(setup = 'small') {
	return newGame(V, { setup, timelines: '3', reach: 'auto', view: 'white' })
}

/**
 * A one-world state from `buildWorld` options.
 *
 * @param {object} spec the world (see `buildWorld`)
 * @return {object}
 */
function one(spec) {
	const b = buildWorld(spec)
	return {
		v: 1,
		variant: 'multiverse',
		options: {},
		worlds: [{ b, w: T }],
		turn: b.x.s,
		ply: 0,
		quiet: 0,
		result: null,
		history: [],
	}
}

/**
 * Play codes with their first outcome; each must be legal.
 *
 * @param {object} s state
 * @param {string[]} codes codes
 * @return {object}
 */
function run(s, codes) {
	for (const code of codes) {
		expect(branches(V, s, code), 'legal: ' + code).not.toBeNull()
		s = applyOutcome(V, s, code, 0)
	}
	return s
}

/**
 * The ordinary move keys of the side to move.
 *
 * @param {object} s state
 * @return {string[]}
 */
function keys(s) {
	return ordinaryMoves(V, s).map((m) => m.code)
}

/**
 * The extra state of the first world.
 *
 * @param {object} s state
 * @return {object}
 */
function X(s) {
	return s.worlds[0].b.x
}

/**
 * The rows the side to move may play.
 *
 * @param {object} s state
 * @return {number}
 */
function playableRows(s) {
	let k = 0
	for (let u = 0; u < ROWS; u++) {
		if (playable(X(s), s.turn, u)) {
			k++
		}
	}
	return k
}

/**
 * The outcomes of a code as comparable text: key, weight and every world without the view mark.
 *
 * @param {object} s state
 * @param {string} code code
 * @return {string|null}
 */
function outcomeText(s, code) {
	const list = branches(V, s, code)
	const world = ({ b, w }) => w + JSON.stringify([b.sq, b.ty, b.sd, b.board, { ...b.x, ai: undefined }])
	return list && list.map((br) => br.key + ':' + br.weight + ':' + br.worlds.map(world).join('|')).join('/')
}

/**
 * Whether a move ends the game against the mover in some outcome (the real states of the game).
 *
 * @param {object} s state
 * @param {string} code code
 * @return {boolean}
 */
function losesSomewhere(s, code) {
	const list = branches(V, s, code)
	return list.some((br) => {
		const r = stateAfter(V, s, code, br, list).result
		return r !== null && r.winner !== s.turn
	})
}

/** The two-board turn of test A4: White must move on L0 (queen c1, pawns b5 and c4 of Black) and on L+1. */
const A4 = {
	s: 0,
	c: [1, 0],
	rows: {
		0: { st: 2, en: 10, boards: { 10: '1p3/2p1k/5/5/K1Q2' } },
		1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/3pp/5/5/K4' } },
	},
}

/** Test S9: a White knight on (0T5) e3, the Black king on d5 and in the past. */
const S9 = { s: 0, rows: { 0: { st: 6, en: 10, boards: { 10: '3k1/5/4N/5/K4', 8: '4k/5/5/5/K4', 6: '4k/5/5/5/K4' } } } }

/** Test A5: Timeline Marauders, Black must move on +2 and has no piece there; one branch moves the present back. */
const A5 = [
	'(+1T1)a1-a3',
	'(0T1)a1>(−1T1)a1',
	'(−1T1)b4>(+1T1)b4',
	'(0T1)c5-c3',
	'(+1T2)a3-b4',
	'(0T2)e1-e3',
	'(−1T2)a1-a2',
	'(0T2)c3>(+1T2)c2',
	'(−1T2)c5>>(0T2)d5',
	'(+1T3)c1-c2',
	'(0T3)c1-c3',
	'(−2T3)e3-e4',
	'(−1T3)a2-a3',
	'(−2T3)d5-e4',
	'(0T3)a5-a3',
	'(−1T3)b5>(+1T3)b5',
	'(+1T4)c2>>(+1T3)c2',
	SUBMIT,
]

/** After test S3's branch: Black must move on +1 and may play L0. */
const S3 = ['(0T1)d1-c3', '(0T1)a4-a3', '(0T2)c3>>(0T1)a3']

describe('the evaluation', () => {
	it('adds only the contempt at the start', () => {
		for (const setup of ['small', 'standard', 'marauders']) {
			const b = start(setup).worlds[0].b
			expect([evaluate(b, 0), evaluate(b, 1)]).toEqual([WEIGHTS.contempt, WEIGHTS.contempt])
		}
		// against a draw (0), playing on at equal material is better for both sides
		expect(evaluateState(V, start(), 0)).toBe(WEIGHTS.contempt)
		expect(evaluateState(V, start(), 1)).toBe(WEIGHTS.contempt)
	})

	it('counts 5D check against the side to move', () => {
		// test U4: Black to move, king c5; after passing (0T5) the knight b3 takes it
		const b = one({ s: 1, rows: { 0: { st: 6, en: 11, boards: { 11: '2k2/5/1N3/5/K4' } } } }).worlds[0].b
		expect(evaluate(b, 1)).toBe(200 - 3000)
		expect(evaluate(b, 0)).toBe(200 + 3000)
	})

	it('counts a threat on an enemy royal piece for the side to move', () => {
		const b = one(S9).worlds[0].b
		expect(evaluate(b, 0)).toBe(200 + 6000)
		expect(evaluate(b, 1)).toBe(200 - 6000)
	})

	it('counts a hanging piece only on a board the side to move has already played', () => {
		// White's queen on c4 of a board it must still play can move away: not hanging (one timeline behind: −100)
		const free = one({ ...A4, rows: { ...A4.rows, 0: { st: 2, en: 10, boards: { 10: '1p2k/2Q2/5/5/K4' } } } })
		expect(evaluate(free.worlds[0].b, 0)).toBe(200 - 100)
		// after (0T5)c1-c4 the queen stands on a board White no longer plays this turn, and b5 takes it
		const s = run(one(A4), ['(0T5)c1-c4'])
		expect([s.turn, mandatory(X(s)).map((u) => LAB[u])]).toEqual([0, ['+1']])
		expect(evaluate(s.worlds[0].b, 0)).toBe(200 - 0.8 * 1400 - 100)
		expect(evaluate(s.worlds[0].b, 1)).toBe(200 + 0.8 * 1400 + 100)
		// once the turn has passed the queen belongs to the waiting side: only the side to move's pieces hang
		expect(scans(run(s, ['(+1T5)a1-a2']).worlds[0].b)).toEqual({ check: true, threat: false, hang: 0 })
	})

	it('values the timeline advantage, at most two timelines', () => {
		const rows = { 0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/K4' } } }
		for (const l of [1, 2, 3]) {
			rows[l] = { st: 9, en: 9, parent: [0, 8], boards: { 9: '4k/5/5/5/K4' } }
		}
		const b = one({ s: 1, c: [3, 0], rows }).worlds[0].b
		expect([evaluate(b, 0), evaluate(b, 1)]).toEqual([200 - 200, 200 + 200])
	})

	it('ignores the pieces in the past (worth nothing)', () => {
		const s = one(S9)
		const material = evaluateState(V, s, 0) - evaluate(s.worlds[0].b, 0)
		// the knight (450) against nothing: the kings are worth 0, the history pieces too
		expect(material).toBe(450)
	})
})

describe('the view of the computer', () => {
	it('searches the must-move boards first (test A1)', () => {
		const s = run(start(), S3)
		expect(mandatory(X(s)).map((u) => LAB[u])).toEqual(['+1'])
		const view = V.aiView(s, s.turn, 'normal')
		expect(view).not.toBe(s)
		expect(view.worlds.every(({ b }) => b.x.ai === s.turn + 1)).toBe(true)
		const all = keys(s)
		const pruned = keys(view)
		expect(pruned.length).toBeLessThan(all.length)
		expect(pruned.every((k) => all.includes(k))).toBe(true)
		expect(pruned.every((k) => k.startsWith('(+1T1)') || k.includes('>(+1T1)'))).toBe(true)
		expect(pruned).toContain('(0T2)a3>(+1T1)a3')
		// the real state is untouched
		expect(s.worlds.every(({ b }) => b.x.ai === undefined)).toBe(true)
	})

	it('is the state itself without must-move or without optional boards', () => {
		const s = start()
		expect(V.aiView(s, 0, 'easy')).toBe(s)
		// test S4: Black has played its must-move board, L0 is left
		const t = run(start(), [...S3, '(+1T1)e4-e3'])
		expect([mandatory(X(t)), isLegal(V, t, SUBMIT)]).toEqual([[], true])
		expect(V.aiView(t, 1, 'normal')).toBe(t)
		// not the side to move
		const u = run(start(), S3)
		expect(V.aiView(u, 0, 'normal')).toBe(u)
	})

	it('keeps the branch that moves the present back (test A5)', () => {
		const s = run(start('marauders'), A5)
		expect([s.turn, mandatory(X(s)).map((u) => LAB[u]), isLegal(V, s, SUBMIT)]).toEqual([1, ['+2'], false])
		const view = V.aiView(s, 1, 'easy')
		expect(view).not.toBe(s)
		expect(keys(view)).toContain('(+1T4)b5>>(+1T2)b5')
		expect(keys(view)).not.toContain('(+1T4)b5>>(+1T3)b5')
		expect(keys(view).every((k) => keys(s).includes(k))).toBe(true)
	})

	it('is exact: every candidate is legal on the real state with the same outcomes', () => {
		expect(V.aiViewExact).toBe(true)
		// random play on Timeline Invasion with a split every third ply, so that the worlds multiply
		const rng = seededRng(2)
		let s = start('invasion')
		let seen = 0
		for (let ply = 0; ply < 60 && !s.result && seen < 12; ply++) {
			const view = V.aiView(s, s.turn, 'normal')
			if (view !== s && s.worlds.length > 1) {
				seen++
				const codes = legalMoves(V, view).map((m) => m.code)
				const froms = new Set()
				for (const { b } of s.worlds) {
					for (let id = 0; id < b.sq.length; id++) {
						if (b.sq[id] >= 0 && b.sd[id] === s.turn && V.types[b.ty[id]].splittable) {
							froms.add(b.sq[id])
						}
					}
				}
				for (const f of froms) {
					codes.push(...splitsFrom(V, view, f).slice(0, 3).map((m) => m.code))
				}
				for (const code of codes) {
					expect(outcomeText(view, code), code).toBe(outcomeText(s, code))
				}
			}
			let codes = legalMoves(V, s).map((m) => m.code)
			if (ply % 3 === 1) {
				const splits = s.worlds[0].b.sq
					.flatMap((q, id) => (q >= 0 && s.worlds[0].b.sd[id] === s.turn ? splitsFrom(V, s, q) : []))
				if (splits.length) {
					codes = splits.map((m) => m.code)
				}
			}
			s = applyMove(V, s, codes[Math.floor(rng() * codes.length)], rng).state
		}
		expect(seen).toBe(12)
	})

	it('prunes only the turn of the side it was made for', () => {
		const s = run(start(), S3)
		const b = s.worlds[0].b
		expect(viewFilter({ ...b, x: { ...b.x, ai: 2 } }, 1)).toBeTypeOf('function')
		expect(viewFilter({ ...b, x: { ...b.x, ai: 1 } }, 1)).toBeNull()
		// once Black has played +1, no must-move board is left: nothing is pruned
		const t = run(V.aiView(s, 1, 'normal'), ['(+1T1)e4-e3'])
		expect(viewFilter(t.worlds[0].b, 1)).toBeNull()
	})
})

describe('answers and time', () => {
	it('looks at no answer inside its own turn, the opponent after it', () => {
		const s = run(one(A4), ['(0T5)c1-c2'])
		expect([s.turn, V.replySide(s, 0)]).toEqual([0, null])
		const t = run(s, ['(+1T5)a1-a2'])
		expect([t.turn, V.replySide(t, 0)]).toEqual([1, 1])
		expect(replySide).toBe(V.replySide)
	})

	it('shares one level time among the boards of a turn', () => {
		expect(aiTimeShare(start())).toBe(1)
		expect(aiTimeShare(start('marauders'))).toBeCloseTo(1 / 3)
		const s = one(A4)
		expect(V.aiTimeShare(s)).toBe(1 / 2)
		expect(V.aiTimeShare(run(s, ['(0T5)c1-c2']))).toBe(1 / 2)
	})
})

describe('the computer player', () => {
	it('takes a king in the past or the present (test A2)', async () => {
		const s = one(S9)
		for (const level of ['easy', 'normal']) {
			const code = await chooseMove(V, s, { level, rng: seededRng(1) })
			expect(run(s, [code]).result, level + ': ' + code).toEqual({ winner: 0, reason: 'king' })
		}
	})

	it('does not leave its queen en prise inside a turn of two boards (test A4)', async () => {
		const queen = one(A4).worlds[0].b.board[sq('(0)c1')]
		for (let seed = 1; seed <= 6; seed++) {
			const rng = seededRng(seed)
			let s = one(A4)
			const codes = []
			while (!s.result && s.turn === 0) {
				const code = await chooseMove(V, s, { level: 'normal', rng })
				codes.push(code)
				s = applyMove(V, s, code, rng).state
			}
			const takes = !s.result && legalMoves(V, s)
				.some((m) => m.to >= 0 && s.worlds.some(({ b }) => b.board[m.to] === queen))
			expect(takes, 'seed ' + seed + ': ' + codes.join(' ')).toBe(false)
		}
	}, 30000)

	it('never strands itself when a way out exists (test A5)', async () => {
		const s = run(start('marauders'), A5)
		for (let seed = 1; seed <= 4; seed++) {
			const rng = seededRng(seed)
			const code = await chooseMove(V, s, { level: 'easy', rng })
			expect(applyMove(V, s, code, rng).state.result, 'seed ' + seed + ': ' + code).toBeNull()
		}
	}, 20000)

	it('plays whole legal turns and never strands itself (self-play)', async () => {
		const games = [['small', 2, 200], ['marauders', 4, 160], ['invasion', 2, 120]]
		for (const [setup, count, maxPly] of games) {
			for (let g = 1; g <= count; g++) {
				const rng = seededRng(100 * g + setup.length)
				let s = start(setup)
				let boards = playableRows(s)
				let plies = 0
				while (!s.result && s.ply < maxPly) {
					const code = await chooseMove(V, s, { level: 'easy', rng })
					const where = setup + ' ' + g + ' ply ' + s.ply + ': ' + code
					expect(code, where).not.toBeNull()
					expect(isLegal(V, s, code), where).toBe(true)
					const next = applyMove(V, s, code, rng).state
					if (next.result?.reason === 'stranded') {
						// only a choice between stranding and another loss
						const others = legalMoves(V, s).map((m) => m.code).filter((c) => c !== code)
						expect(others.every((c) => losesSomewhere(s, c)), where).toBe(true)
					}
					// a turn has at most one action per board it could play, plus Submit
					plies++
					expect(plies, where).toBeLessThanOrEqual(boards + 1)
					if (next.turn !== s.turn) {
						plies = 0
						boards = next.result ? 0 : playableRows(next)
					}
					s = next
				}
				if (s.result && ['checkmate', 'stalemate'].includes(s.result.reason)) {
					// the stuck side was stuck at the start of its turn
					expect(X(s).t, setup + ' ' + g).toBe(0)
				}
			}
		}
	}, 60000)

	it('keeps its time budget on Small and Standard', async () => {
		const measured = []
		for (const setup of ['small', 'standard']) {
			// a position of the middle game: 12 plies of the easy level
			const rng = seededRng(3)
			let mid = start(setup)
			for (let i = 0; i < 12 && !mid.result; i++) {
				mid = applyMove(V, mid, await chooseMove(V, mid, { level: 'easy', rng }), rng).state
			}
			for (const s of [start(setup), mid]) {
				for (const L of LEVELS) {
					const t0 = performance.now()
					const code = await chooseMove(V, s, { level: L.id, rng: seededRng(5) })
					const ms = performance.now() - t0
					measured.push(setup + ' ' + L.id + ' ' + Math.round(ms) + ' ms')
					expect(isLegal(V, s, code)).toBe(true)
					expect(ms, measured.join(', ')).toBeLessThan(L.timeMs + 500)
				}
			}
		}
	}, 60000)

	it('wins a small match against a random mover', async () => {
		let wins = 0
		for (let g = 1; g <= 6; g++) {
			const rng = seededRng(31 * g)
			const me = g % 2
			let s = start('small')
			while (!s.result && s.ply < 300) {
				let code
				if (s.turn === me) {
					code = await chooseMove(V, s, { level: 'easy', rng })
				} else {
					const list = legalMoves(V, s)
					code = list[Math.floor(rng() * list.length)].code
				}
				s = applyMove(V, s, code, rng).state
			}
			expect(s.result?.winner, 'game ' + g).not.toBe(1 - me)
			if (s.result?.winner === me) {
				wins++
			}
		}
		expect(wins).toBeGreaterThanOrEqual(5)
	}, 60000)
})
