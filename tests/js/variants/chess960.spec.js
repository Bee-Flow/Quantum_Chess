/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Chess960 (src/variants/chess960.js): the numbering and every start position, the option, the moves of every piece
 * (checked against Fairy-Stockfish), the four castling shapes with the king moved onto its rook (also by clicking the
 * board), the castling rights, castling and en passant in quantum positions (certain, never rolled, blocked by ghosts),
 * the classic end rules of the core (bare kings, "cannot escape" with castling as an escape, waiting draws), random
 * games from start positions with every castling shape, and the computer player. The cases are numbered C1-C20.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { useVariantGame } from '../../../src/variantplay/composables/useVariantGame.js'
import { optionLines, sharedRules } from '../../../src/variantplay/texts.js'
import { createVariantGame } from '../../../src/variantplay/variantGames.js'
import { catalogEntry } from '../../../src/variants/catalog.js'
import V, { backRank960, isPosition, positionNumber } from '../../../src/variants/chess960.js'
import { chooseMove, LEVELS } from '../../../src/variants/core/ai.js'
import { castlingRights } from '../../../src/variants/core/orthodox.js'
import {
	applyMove,
	branches,
	BUDGET,
	budget,
	budgetInfo,
	legalMoves,
	MAX_WORLDS,
	newGame,
	outcomes,
	splitsFrom,
	T,
} from '../../../src/variants/core/quantum.js'
import { optionValues } from '../../../src/variants/core/variant.js'
import { applyClassical, generate, nameOf } from '../../../src/variants/core/world.js'
import { play, stateOf, stopwatch } from './helpers.js'

/**
 * The index of a square.
 *
 * @param {string} name square name
 * @return {number}
 */
function sq(name) {
	return V.topology.byName(name)
}

/**
 * A state from equally likely placements, in the order written, with the castling rights of the position.
 *
 * @param {Array<Record<string, string>>} placements one placement per world
 * @param {object} [opts] options
 * @param {number} [opts.turn] side to move
 * @param {boolean} [opts.castle] give the castling rights of the position (default true)
 * @param {number} [opts.quiet] plies since the last capture or pawn move
 * @return {object}
 */
function st(placements, { turn = 0, castle = true, quiet = 0 } = {}) {
	const s = stateOf(V, placements.map((p) => [p, 1]), turn, (b) => {
		b.x = { ep: -1, epVictim: -1, castle: castle ? castlingRights(V, b) : [] }
	})
	return { ...s, quiet }
}

/**
 * The pieces of a world as sorted text, White upper case: `Kg1 Ra1 Rf1 ke8`.
 *
 * @param {object} b world
 * @return {string}
 */
function pieces(b) {
	return b.sq
		.map((q, id) => (q >= 0 ? (b.sd[id] ? b.ty[id] : b.ty[id].toUpperCase()) + nameOf(V, q) : null))
		.filter(Boolean)
		.sort()
		.join(' ')
}

/**
 * The castling rights of a world as sorted flags (`KQkq`, `''` for none).
 *
 * @param {object} b world
 * @return {string}
 */
function rights(b) {
	return (b.x.castle ?? []).map((c) => c.flag).sort().join('')
}

/**
 * The worlds of a state as sorted `[probability, pieces, rights]` entries (a new state sorts its worlds by key).
 *
 * @param {object} s state
 * @return {Array<[number, string, string]>}
 */
function worlds(s) {
	return s.worlds
		.map(({ b, w }) => [w / T, pieces(b), rights(b)])
		.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
}

/**
 * The outcomes of a move as text: `miss 0.5 rolled, capture 0.5 rolled`, or null when the move is illegal.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {string|null}
 */
function outs(s, code) {
	const list = outcomes(V, s, code)
	return list ? list.map((o) => o.key + ' ' + o.p + (o.rolled ? ' rolled' : '')).join(', ') : null
}

/**
 * Play a move and take the outcome with the given key (default the only one).
 *
 * @param {object} s state
 * @param {string} code move code
 * @param {string} [key] outcome key
 * @return {object}
 */
function after(s, code, key) {
	const list = outcomes(V, s, code)
	expect(list, 'legal: ' + code).not.toBeNull()
	const index = key === undefined ? 0 : list.findIndex((o) => o.key === key)
	expect(index, code + ' has outcome ' + key).toBeGreaterThanOrEqual(0)
	return play(V, s, code, index)
}

/**
 * The legal castling moves as `code>square clicked`, sorted.
 *
 * @param {object} s state
 * @return {string[]}
 */
function castles(s) {
	return legalMoves(V, s).filter((m) => m.kind === 'castle').map((m) => m.code + '>' + nameOf(V, m.to)).sort()
}

/**
 * Whether a move is legal (listed and playable).
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {boolean}
 */
function legal(s, code) {
	return legalMoves(V, s).some((m) => m.code === code) && branches(V, s, code) !== null
}

/**
 * The legal ordinary moves from a square as `code>to`, sorted.
 *
 * @param {object} s state
 * @param {string} from square name
 * @return {string[]}
 */
function movesFrom(s, from) {
	return legalMoves(V, s)
		.filter((m) => m.type === 'move' && m.from === sq(from))
		.map((m) => m.code + '>' + nameOf(V, m.to))
		.sort()
}

/**
 * The pieces on one rank of a world, from file a, White upper case, `.` for an empty square.
 *
 * @param {object} b world
 * @param {number} r rank number (1-8)
 * @return {string}
 */
function rank(b, r) {
	return [...'abcdefgh'].map((f) => {
		const id = b.board[sq(f + r)]
		return id < 0 ? '.' : b.sd[id] ? b.ty[id] : b.ty[id].toUpperCase()
	}).join('')
}

/**
 * Classical move counts (perft) with the variant's own generator; without check this equals the legal count of an
 * ordinary engine as long as no king can step into attack within the depth.
 *
 * @param {object} w world
 * @param {number} side side to move
 * @param {number} depth plies
 * @return {number}
 */
function perft(w, side, depth) {
	if (depth === 0) {
		return 1
	}
	let n = 0
	for (const m of generate(V, w, side).values()) {
		n += perft(applyClassical(V, w, m), 1 - side, depth - 1)
	}
	return n
}

/** White's king and rooks on e1, a1 and h1, the Black king on e8, plus more pieces. */
const home = (extra = {}) => ({ a1: '0:r', e1: '0:k', h1: '0:r', e8: '1:k', ...extra })

/**
 * Two equally likely placements that share `base` and differ in the pieces of `a` and `b`.
 *
 * @param {Record<string, string>} base the pieces of both worlds
 * @param {Record<string, string>} a the other pieces of world A
 * @param {Record<string, string>} b the other pieces of world B
 * @return {Array<Record<string, string>>}
 */
function pair(base, a, b) {
	return [{ ...base, ...a }, { ...base, ...b }]
}

/**
 * Run a check on the game composable of a stored pass & play game from a state, with an in-memory
 * `window.localStorage` (this file runs without a DOM), which is removed again afterwards.
 *
 * @param {object} initial the start state of the game
 * @param {(game: object) => void} check the check, given the loaded game API
 * @return {Promise<void>}
 */
async function withGame(initial, check) {
	const had = Object.hasOwn(globalThis, 'window')
	const old = globalThis.window
	const mem = new Map()
	globalThis.window = {
		localStorage: {
			getItem: (k) => (mem.has(k) ? mem.get(k) : null),
			setItem: (k, v) => mem.set(k, String(v)),
			removeItem: (k) => mem.delete(k),
		},
	}
	try {
		const players = [{ kind: 'human' }, { kind: 'human' }]
		const rec = createVariantGame({ variant: V.id, options: initial.options, players, initial })
		const game = useVariantGame(rec.id)
		await game.load()
		check(game)
	} finally {
		if (had) {
			globalThis.window = old
		} else {
			delete globalThis.window
		}
	}
}

describe('chess960: declaration, numbering and setup', () => {
	it('is declared as in the catalogue, with 3 to 8 rules, every piece named and drawn, and the start option', () => {
		expect(V.id).toBe('chess960')
		expect(V.category).toBe(catalogEntry('chess960').category)
		const rules = V.rules()
		expect(rules.length).toBeGreaterThanOrEqual(3)
		expect(rules.length).toBeLessThanOrEqual(8)
		expect(rules.every((r) => typeof r === 'string' && r.length > 10)).toBe(true)
		expect(Object.keys(V.types).sort()).toEqual(['b', 'k', 'n', 'p', 'q', 'r'])
		for (const [id, type] of Object.entries(V.types)) {
			expect(type.name()).toMatch(/^[A-Z]/)
			expect(type.glyph).toEqual({ sprite: id })
			expect(type.value).toBeGreaterThan(0)
		}
		expect([...V.royalTypes]).toEqual(['k'])
		expect([...V.solidTypes].sort()).toEqual(['k', 'p'])
		expect(V.sides.map((s) => s.color)).toEqual(['white', 'black'])
		// the ordinary board: a1 dark, White at the bottom, file letters and rank numbers
		expect(V.topology.size).toBe(64)
		expect(V.topology.cells[sq('a1')]).toMatchObject({ x: 0, y: 7, shade: 'dark' })
		expect(V.topology.cells[sq('h1')].shade).toBe('light')
		expect(V.topology.layout.labels).toHaveLength(16)
		const [o] = V.options
		expect(o).toMatchObject({ id: 'position', type: 'number', min: 0, max: 959, random: true, default: 518 })
		expect(o.label()).toBe('Start position (0–959)')
		expect(o.describe(518)).toBe('RNBQKBNR (518)')
		expect(o.describe(0)).toBe('BBQNNRKR (0)')
		expect(o.describe(960)).toBeNull()
		expect(o.describe(12.5)).toBeNull()
		// the game view keeps the number next to the back rank
		expect(optionLines(V, { position: 518 })).toEqual(['Start position (0–959): RNBQKBNR (518)'])
		expect(optionLines(V, { position: 959 })).toEqual(['Start position (0–959): RKRNNQBB (959)'])
	})

	it('keeps the classic end rules of the core; its card says only what is special', () => {
		// the core's capture-the-king, escape rule, bare-kings draw and waiting draws, with no copy of its own
		expect(V.worldResult).toBeUndefined()
		const flags = ['escapeRule', 'bareKingsDraw', 'drawsWait', 'specialMoves']
		expect(flags.map((f) => V[f])).toEqual([true, true, true, true])
		// no sentence repeats the opening of a sentence of the shared card shown next to it ("There is no check:")
		const rules = V.rules()
		const openings = sharedRules(V).map((r) => r.split(':')[0])
		for (const r of rules) {
			expect(openings, r).not.toContain(r.split(':')[0])
			expect(r).not.toMatch(/no check|checkmate|only by capturing/i)
		}
		expect(rules).toContain('Castling ignores attacks: you may castle out of, through or into attack.')
		// percentages keep the space of the other texts ("50 %"), as in Capablanca's card
		expect(rules.join(' ')).not.toMatch(/\d%/)
		expect(rules.join(' ')).toContain('is not 100 % on its starting square.')
	})

	it('numbers the 960 back ranks as lichess and FIDE do (C1)', () => {
		const vectors = {
			0: 'BBQNNRKR',
			1: 'BQNBNRKR',
			2: 'BQNNRBKR',
			3: 'BQNNRKRB',
			4: 'QBBNNRKR',
			12: 'QBNNRKBR',
			20: 'NBBQNRKR',
			74: 'NNRKBBQR',
			95: 'NNRKRQBB',
			249: 'NRKBBQNR',
			310: 'NQBRKBRN',
			518: 'RNBQKBNR',
			534: 'RNBKQBNR',
			709: 'RKBBQNNR',
			959: 'RKRNNQBB',
		}
		for (const [n, r] of Object.entries(vectors)) {
			expect(backRank960(Number(n)).toUpperCase(), n).toBe(r)
			expect(positionNumber(r)).toBe(Number(n))
		}
		const seen = new Set()
		const kingFiles = {}
		for (let n = 0; n < 960; n++) {
			const r = backRank960(n)
			seen.add(r)
			expect([...r].sort().join('')).toBe('bbknnqrr')
			const bishops = [...r].flatMap((p, f) => (p === 'b' ? [f] : []))
			const rooks = [...r].flatMap((p, f) => (p === 'r' ? [f] : []))
			const king = r.indexOf('k')
			expect(bishops[0] % 2, 'bishops on both colours: ' + r).not.toBe(bishops[1] % 2)
			expect(rooks[0] < king && king < rooks[1], 'king between the rooks: ' + r).toBe(true)
			expect(positionNumber(r)).toBe(n)
			kingFiles['abcdefgh'[king]] = (kingFiles['abcdefgh'[king]] ?? 0) + 1
		}
		expect(seen.size).toBe(960)
		expect(kingFiles).toEqual({ b: 108, c: 168, d: 204, e: 204, f: 168, g: 108 })
		expect(positionNumber('RNBQKBRN')).toBe(614)
		expect(positionNumber('KRBBNNQR')).toBe(-1)
		expect(positionNumber('RBKBNNQR')).toBe(-1)
		expect(positionNumber('RNBQKBNQ')).toBe(-1)
		expect(positionNumber('RKRNNQB')).toBe(-1)
		expect(isPosition(959) && !isPosition(960) && !isPosition(-1) && !isPosition('77')).toBe(true)
		expect(() => backRank960(960)).toThrow()
	})

	it('sets up every start square of all 960 positions, mirrored, with the rights of the two rooks (C1)', () => {
		for (let n = 0; n < 960; n++) {
			const s = newGame(V, { position: n })
			const b = s.worlds[0].b
			const back = backRank960(n)
			expect(rank(b, 1), 'SP ' + n).toBe(back.toUpperCase())
			expect(rank(b, 8), 'SP ' + n).toBe(back)
			expect([rank(b, 2), rank(b, 7)]).toEqual(['PPPPPPPP', 'pppppppp'])
			expect([3, 4, 5, 6].every((r) => rank(b, r) === '........')).toBe(true)
			expect(b.x.ep).toBe(-1)
			const king = back.indexOf('k')
			const rooks = [back.indexOf('r'), back.lastIndexOf('r')]
			const want = []
			for (const [side, r] of [[0, 1], [1, 8]]) {
				const at = (f) => sq('abcdefgh'[f] + r)
				want.push(
					{ flag: side ? 'k' : 'K', side, king: at(king), rook: at(rooks[1]), kingTo: at(6), rookTo: at(5) },
					{ flag: side ? 'q' : 'Q', side, king: at(king), rook: at(rooks[0]), kingTo: at(2), rookTo: at(3) },
				)
			}
			expect(b.x.castle, 'SP ' + n).toEqual(want)
		}
	})

	it('takes the start position from the option, else from the random numbers (C2)', () => {
		expect(optionValues(V, { position: 1000 })).toEqual({ position: 518 })
		expect(optionValues(V, { position: 77 })).toEqual({ position: 77 })
		expect(optionValues(V, {})).toEqual({ position: 518 })
		expect(rank(V.setup({}, () => 0.54), 1)).toBe('RNBQKBNR')
		expect(rank(V.setup({ position: -1 }, () => 0), 1)).toBe('BBQNNRKR')
		expect(rank(V.setup({ position: 12.5 }, () => 0.999), 1)).toBe('RKRNNQBB')
		expect(rank(V.setup({ position: '77' }, () => 0), 1)).toBe('BBQNNRKR')
		expect(rank(V.setup({ position: 959 }, () => 0), 1)).toBe('RKRNNQBB')
		// newGame keeps the number chosen in the dialog, which is what the game view shows
		const s = newGame(V, optionValues(V, { position: 74 }))
		expect(s.options).toEqual({ position: 74 })
		expect(V.options[0].describe(s.options.position)).toBe('NNRKBBQR (74)')
	})
})

describe('chess960: moves of the pieces', () => {
	it('has the first-move counts of the spec and castling on move 1 in 162 positions (C3)', () => {
		const counts = (n) => legalMoves(V, newGame(V, { position: n })).length
		expect([518, 0, 3, 20, 310].map(counts)).toEqual([20, 20, 21, 19, 18])
		const dist = {}
		const first = { any: 0, short: 0, long: 0 }
		for (let n = 0; n < 960; n++) {
			const list = legalMoves(V, newGame(V, { position: n }))
			dist[list.length] = (dist[list.length] ?? 0) + 1
			const codes = list.filter((m) => m.kind === 'castle').map((m) => m.code)
			first.any += codes.length ? 1 : 0
			first.short += codes.includes('O-O') ? 1 : 0
			first.long += codes.includes('O-O-O') ? 1 : 0
		}
		expect(dist).toEqual({ 18: 22, 19: 336, 20: 540, 21: 62 })
		expect(first).toEqual({ any: 162, short: 90, long: 72 })
	})

	it('counts the same moves as Fairy-Stockfish from shuffled start positions', () => {
		// "go perft 2" (and 3 where no king can step into attack) with UCI_Chess960 in Fairy-Stockfish
		const reference = { 0: [20, 400], 3: [21, 441], 959: [20, 400] }
		Object.assign(reference, { 74: [20, 400, 8876], 310: [18, 324, 6672], 518: [20, 400, 8902] })
		for (const [n, want] of Object.entries(reference)) {
			const w = V.setup({ position: Number(n) })
			expect(want.map((c, d) => perft(w, 0, d + 1)), 'SP ' + n).toEqual(want)
		}
	})

	it('moves every piece type as in orthodox chess', () => {
		const kings = { b1: '0:k', h7: '1:k' }
		const count = (placement, from, turn = 0) => movesFrom(st([placement], { turn, castle: false }), from).length
		expect(count({ ...kings, d4: '0:q' }, 'd4')).toBe(27)
		expect(count({ ...kings, d4: '0:r' }, 'd4')).toBe(14)
		expect(count({ ...kings, d4: '0:b' }, 'd4')).toBe(13)
		expect(count({ ...kings, d4: '0:n' }, 'd4')).toBe(8)
		expect(count({ ...kings, e4: '0:k' }, 'e4')).toBe(8)
		expect(movesFrom(st([{ ...kings, a1: '0:n' }], { castle: false }), 'a1')).toEqual(['a1-b3>b3', 'a1-c2>c2'])
		// a slider stops at the first piece and captures only enemies
		expect(count({ ...kings, d4: '0:r', d6: '1:n', f4: '0:p' }, 'd4')).toBe(9)
		// pawns: single and double step, diagonal captures, Black downwards, promotion to four pieces
		expect(movesFrom(st([{ ...kings, e2: '0:p', d3: '1:n', f3: '1:p' }], { castle: false }), 'e2')
			.map((m) => m.split('>')[0])).toEqual(['e2-d3', 'e2-e3', 'e2-e4', 'e2-f3'])
		expect(count({ ...kings, e2: '0:p', e3: '1:n' }, 'e2')).toBe(0)
		expect(movesFrom(st([{ ...kings, c7: '1:p' }], { turn: 1, castle: false }), 'c7').map((m) => m.split('>')[0]))
			.toEqual(['c7-c5', 'c7-c6'])
		const promo = st([{ a1: '0:k', e7: '0:p', h8: '1:k' }], { castle: false })
		expect(movesFrom(promo, 'e7').map((m) => m.split('>')[0]))
			.toEqual(['e7-e8=b', 'e7-e8=n', 'e7-e8=q', 'e7-e8=r'])
	})
})

describe('chess960: castling', () => {
	it('moves the king onto its rook, with the same squares as Fairy-Stockfish in every castling shape', () => {
		// Fairy-Stockfish (UCI_Chess960, "go perft 1") writes castling as the king onto the rook, as here
		const cases = [
			[{ a1: '0:r', b1: '0:k', h1: '0:r' }, 'b1a1 b1a2 b1b2 b1c1 b1c2 b1h1'],
			[{ a1: '0:r', f1: '0:k', g1: '0:r' }, 'f1a1 f1e1 f1e2 f1f2 f1g1 f1g2'],
			[{ d1: '0:r', e1: '0:k', h1: '0:r' }, 'e1d1 e1d2 e1e2 e1f1 e1f2 e1h1'],
			[{ a1: '0:r', g1: '0:k', h1: '0:r' }, 'g1a1 g1f1 g1f2 g1g2 g1h1 g1h2'],
			[{ c1: '0:r', d1: '0:k', h1: '0:r' }, 'd1c1 d1c2 d1d2 d1e1 d1e2 d1h1'],
		]
		for (const [placement, fsf] of cases) {
			const s = st([{ ...placement, e8: '1:k' }])
			expect(legalMoves(V, s)).toHaveLength(25)
			const king = Object.keys(placement).find((k) => placement[k] === '0:k')
			const got = legalMoves(V, s)
				.filter((m) => m.from === sq(king))
				.map((m) => nameOf(V, m.from) + nameOf(V, m.to))
			expect(got.sort().join(' ')).toBe(fsf)
		}
	})

	it('only the rook moves when the king already stands on g1 or castles to c1 from there (C4)', () => {
		const s = st([{ a1: '0:r', g1: '0:k', h1: '0:r', e8: '1:k' }])
		expect(castles(s)).toEqual(['O-O-O>a1', 'O-O>h1'])
		expect(outs(s, 'O-O')).toBe('move 1')
		const short = after(s, 'O-O')
		expect(worlds(short)).toEqual([[1, 'Kg1 Ra1 Rf1 ke8', '']])
		const rec = short.history.at(-1)
		expect([rec.from.map((q) => nameOf(V, q)), rec.to.map((q) => nameOf(V, q)), rec.key, rec.rolled])
			.toEqual([['g1'], ['h1'], 'move', false])
		const long = after(s, 'O-O-O')
		expect(worlds(long)).toEqual([[1, 'Kc1 Rd1 Rh1 ke8', '']])
		expect(long.history.at(-1).to).toEqual([sq('a1')])
	})

	it('keeps a one-square king step apart from castling, swaps king and rook, and lets the rook stay (C5-C7)', () => {
		const s = st([{ a1: '0:r', b1: '0:k', h1: '0:r', e8: '1:k' }])
		expect(movesFrom(s, 'b1')).toEqual(['O-O-O>a1', 'O-O>h1', 'b1-a2>a2', 'b1-b2>b2', 'b1-c1>c1', 'b1-c2>c2'])
		expect(worlds(after(s, 'O-O-O'))).toEqual([[1, 'Kc1 Rd1 Rh1 ke8', '']])
		expect(worlds(after(s, 'O-O'))).toEqual([[1, 'Kg1 Ra1 Rf1 ke8', '']])
		expect(worlds(after(s, 'b1-c1'))).toEqual([[1, 'Kc1 Ra1 Rh1 ke8', '']])
		// swaps (C6)
		expect(worlds(after(st([{ a1: '0:r', f1: '0:k', g1: '0:r', e8: '1:k' }]), 'O-O')))
			.toEqual([[1, 'Kg1 Ra1 Rf1 ke8', '']])
		const swap = st([{ c1: '0:r', d1: '0:k', h1: '0:r', e8: '1:k' }])
		expect(castles(swap)).toEqual(['O-O-O>c1', 'O-O>h1'])
		expect(worlds(after(swap, 'O-O-O'))).toEqual([[1, 'Kc1 Rd1 Rh1 ke8', '']])
		// only the king moves (C7): needs only c1 empty
		const stays = st([{ d1: '0:r', e1: '0:k', h1: '0:r', e8: '1:k', a1: '0:n', b1: '0:b' }])
		expect(castles(stays)).toEqual(['O-O-O>d1', 'O-O>h1'])
		const done = after(stays, 'O-O-O')
		expect(worlds(done)).toEqual([[1, 'Bb1 Kc1 Na1 Rd1 Rh1 ke8', '']])
		expect([done.history.at(-1).from, done.history.at(-1).to]).toEqual([[sq('e1')], [sq('d1')]])
		// Black castles the same way on rank 8
		const black = st([{ a8: '1:r', f8: '1:k', g8: '1:r', e1: '0:k' }], { turn: 1 })
		expect(castles(black)).toEqual(['O-O-O>a8', 'O-O>g8'])
		expect(worlds(after(black, 'O-O-O'))).toEqual([[1, 'Ke1 kc8 rd8 rg8', '']])
	})

	it('needs every square the king or the rook crosses or lands on empty (C8)', () => {
		const s = st([home({ b1: '0:n' })])
		expect([legal(s, 'O-O-O'), legal(s, 'O-O')]).toEqual([false, true])
		// an enemy piece blocks as well, and the king's end square counts
		expect(castles(st([home({ g1: '1:n' })]))).toEqual(['O-O-O>a1'])
		// SP 0: O-O is blocked by the other rook on f1, O-O-O by the queen and the knights, for both sides
		let sp0 = newGame(V, { position: 0 })
		expect(castles(sp0)).toEqual([])
		sp0 = after(sp0, 'a2-a3')
		expect(castles(sp0)).toEqual([])
	})

	it('loses a right for good when its rook or the king moves (C9)', () => {
		let s = newGame(V, { position: 518 })
		for (const code of ['a2-a4', 'a7-a5', 'a1-a3', 'h7-h6', 'a3-a1', 'h6-h5']) {
			s = after(s, code)
		}
		expect(rights(s.worlds[0].b)).toBe('Kkq')
		s = newGame(V, { position: 518 })
		for (const code of ['e2-e4', 'e7-e5', 'e1-e2']) {
			s = after(s, code)
		}
		expect(rights(s.worlds[0].b)).toBe('kq')
		// capturing a rook on its start square takes that right away
		const cap = after(st([home({ c3: '1:b' })], { turn: 1 }), 'c3-a1')
		expect(rights(cap.worlds[0].b)).toBe('K')
	})

	it('allows castling on the very first move and then for Black at once (C12)', () => {
		let s = newGame(V, { position: 3 })
		expect(castles(s)).toEqual(['O-O>g1'])
		s = after(s, 'O-O')
		expect([rank(s.worlds[0].b, 1), rights(s.worlds[0].b)]).toEqual(['BQNNRRKB', 'kq'])
		expect(castles(s)).toEqual(['O-O>g8'])
		s = after(s, 'O-O')
		expect([rank(s.worlds[0].b, 8), rights(s.worlds[0].b)]).toEqual(['bqnnrrkb', ''])
		s = newGame(V, { position: 74 })
		expect(castles(s)).toEqual(['O-O-O>c1'])
		s = after(s, 'O-O-O')
		expect(rank(s.worlds[0].b, 1)).toBe('NNKRBBQR')
		s = after(s, 'O-O-O')
		expect([rank(s.worlds[0].b, 8), rights(s.worlds[0].b)]).toEqual(['nnkrbbqr', ''])
	})

	it('has no check conditions, and castling does not reset the quiet counter (C16)', () => {
		const s = st([{ a1: '0:r', e1: '0:k', h1: '0:r', a8: '1:k', e6: '1:r', f6: '1:r', g6: '1:r' }], { quiet: 7 })
		expect(outs(s, 'O-O')).toBe('move 1')
		const short = after(s, 'O-O')
		expect([worlds(short), short.quiet, short.result]).toEqual([[[1, 'Kg1 Ra1 Rf1 ka8 re6 rf6 rg6', '']], 8, null])
		const long = after(s, 'O-O-O')
		expect([worlds(long), long.quiet]).toEqual([[[1, 'Kc1 Rd1 Rh1 ka8 re6 rf6 rg6', '']], 8])
	})

	it('on the board, king then own rook castles; king then the next square is the king step (C5, C13)', async () => {
		const click = (game, ...names) => names.forEach((n) => game.click(sq(n)))
		const last = (game) => game.state.value.history.at(-1).code
		// SP 3: the rook on g1 is a target of the king on f1, and clicking it castles at once (no box)
		await withGame(newGame(V, { position: 3 }), (game) => {
			click(game, 'f1')
			expect(game.marks.value[sq('g1')]).toContain('target')
			click(game, 'g1')
			expect([last(game), game.pending.value, game.promoChoices.value]).toEqual(['O-O', null, null])
			expect(rank(game.state.value.worlds[0].b, 1)).toBe('BQNNRRKB')
		})
		const s = st([{ a1: '0:r', b1: '0:k', h1: '0:r', e8: '1:k' }])
		await withGame(s, (game) => {
			click(game, 'b1', 'c1')
			expect([last(game), game.promoChoices.value]).toEqual(['b1-c1', null])
		})
		await withGame(s, (game) => {
			click(game, 'b1', 'a1')
			expect(last(game)).toBe('O-O-O')
		})
		// C13: the rook on c1 is a ghost, so d1 then c1 is the king step that rolls (confirmation), not a choice box
		const start = st(pair({ c1: '0:r', d1: '0:k', h1: '0:r', e8: '1:k' }, { c3: '1:n' }, { a6: '1:n' }))
		const ghost = after(after(start, 'c1-c5'), 'e8-f8')
		await withGame(ghost, (game) => {
			click(game, 'd1', 'c1')
			expect([game.pending.value?.code, game.promoChoices.value]).toEqual(['d1-c1', null])
		})
	})
})

describe('chess960: castling and en passant in quantum positions', () => {
	it('a ghost on a square the castling needs makes it illegal, not a roll (C10, C17)', () => {
		const s = st([home({ g1: '1:n' }), home({ h3: '1:n' })])
		expect(s.worlds.map(({ b }) => rights(b))).toEqual(['KQ', 'KQ'])
		expect([legal(s, 'O-O'), branches(V, s, 'O-O')]).toEqual([false, null])
		expect(outs(s, 'O-O-O')).toBe('move 1')
		expect(worlds(after(s, 'O-O-O'))).toEqual([[0.5, 'Kc1 Rd1 Rh1 ke8 ng1', ''], [0.5, 'Kc1 Rd1 Rh1 ke8 nh3', '']])
		// only the vacancy set counts: a ghost on b1 does not block Ke1 Rd1 O-O-O, one on c1 does
		const base = { d1: '0:r', e1: '0:k', h1: '0:r', e8: '1:k' }
		const rookStays = (at) => st(pair(base, { [at]: '1:n' }, { a3: '1:n' }))
		expect(outs(rookStays('b1'), 'O-O-O')).toBe('move 1')
		expect(worlds(after(rookStays('b1'), 'O-O-O')).map((e) => e[1]))
			.toEqual(['Kc1 Rd1 Rh1 ke8 na3', 'Kc1 Rd1 Rh1 ke8 nb1'])
		expect(legal(rookStays('c1'), 'O-O-O')).toBe(false)
		// the swap needs no square at all; the same ghost on e1 blocks the king's way to c1
		const swap = st(pair({ a1: '0:r', f1: '0:k', g1: '0:r', e8: '1:k' }, { h1: '1:n' }, { e1: '1:n' }))
		expect(outs(swap, 'O-O')).toBe('move 1')
		expect(legal(swap, 'O-O-O')).toBe(false)
	})

	it('a slide that happened in some worlds only (pass = link) loses the right everywhere (C11)', () => {
		const s = st([home({ h3: '1:n' }), home({ a6: '1:n' })])
		expect(outs(s, 'h1-h5')).toBe('move 1')
		let s2 = after(s, 'h1-h5')
		expect(worlds(s2)).toEqual([[0.5, 'Ke1 Ra1 Rh1 ke8 nh3', 'Q'], [0.5, 'Ke1 Ra1 Rh5 ke8 na6', 'Q']])
		s2 = after(s2, 'e8-d8')
		expect(legal(s2, 'O-O')).toBe(false)
		// a measurement that finds the rook at home does not bring the right back
		expect(outs(s2, '?h1')).toBe('h1 0.5 rolled, h5 0.5 rolled')
		let s3 = after(s2, '?h1', 'h1')
		expect(worlds(s3)).toEqual([[1, 'Ke1 Ra1 Rh1 kd8 nh3', 'Q']])
		s3 = after(s3, 'd8-e8')
		expect(legal(s3, 'O-O')).toBe(false)
		expect(castles(s3)).toEqual(['O-O-O>a1'])
	})

	it('a rolled rook move that missed keeps the right, one that captured loses it (C11)', () => {
		const s = st([home({ h2: '1:n' }), home({ h3: '1:n' })])
		expect(outs(s, 'h1-h3')).toBe('miss 0.5 rolled, capture 0.5 rolled')
		let missed = after(s, 'h1-h3', 'miss')
		expect(worlds(missed)).toEqual([[1, 'Ke1 Ra1 Rh1 ke8 nh2', 'KQ']])
		missed = after(missed, 'e8-d8')
		expect(outs(missed, 'O-O')).toBe('move 1')
		expect(worlds(after(missed, 'O-O'))).toEqual([[1, 'Kg1 Ra1 Rf1 kd8 nh2', '']])
		let hit = after(s, 'h1-h3', 'capture')
		expect(worlds(hit)).toEqual([[1, 'Ke1 Ra1 Rh3 ke8', 'Q']])
		hit = after(hit, 'e8-d8')
		expect(legal(hit, 'O-O')).toBe(false)
	})

	it('king onto rook stays unambiguous: the king step and castling never share their squares (C13)', () => {
		const s = st(pair({ c1: '0:r', d1: '0:k', h1: '0:r', e8: '1:k' }, { c3: '1:n' }, { a6: '1:n' }))
		expect(outs(s, 'c1-c5')).toBe('move 1')
		let s2 = after(s, 'c1-c5')
		expect(s2.worlds.map(({ b }) => rights(b))).toEqual(['K', 'K'])
		s2 = after(s2, 'e8-f8')
		expect(legalMoves(V, s2).filter((m) => m.from === sq('d1') && m.to === sq('c1')).map((m) => m.code))
			.toEqual(['d1-c1'])
		expect(legal(s2, 'O-O-O')).toBe(false)
		expect(outs(s2, 'd1-c1')).toBe('miss 0.5 rolled, move 0.5 rolled')
		expect(worlds(after(s2, 'd1-c1', 'miss'))).toEqual([[1, 'Kd1 Rc1 Rh1 kf8 nc3', 'K']])
		expect(worlds(after(s2, 'd1-c1', 'move'))).toEqual([[1, 'Kc1 Rc5 Rh1 kf8 na6', '']])
	})

	it('an own ghost rook on the end square blocks castling until a measurement clears it (C14)', () => {
		const s = st(pair({ f1: '0:r', g1: '0:k', h1: '0:r', e8: '1:k' }, { d1: '1:n' }, { a6: '1:n' }))
		expect(outs(s, 'f1-a1')).toBe('move 1')
		let s2 = after(s, 'f1-a1')
		expect(s2.worlds.map(({ b }) => rights(b))).toEqual(['K', 'K'])
		expect(budget(s2, 0)).toBe(2)
		s2 = after(s2, 'e8-f8')
		expect([legal(s2, 'O-O'), legal(s2, 'O-O-O')]).toEqual([false, false])
		expect(outs(s2, '?a1')).toBe('a1 0.5 rolled, f1 0.5 rolled')
		let home1 = after(s2, '?a1', 'a1')
		expect(worlds(home1)).toEqual([[1, 'Kg1 Ra1 Rh1 kf8 na6', 'K']])
		home1 = after(home1, 'f8-e8')
		expect(outs(home1, 'O-O')).toBe('move 1')
		expect(worlds(after(home1, 'O-O'))).toEqual([[1, 'Kg1 Ra1 Rf1 ke8 na6', '']])
		const blocked = after(after(s2, '?a1', 'f1'), 'f8-e8')
		expect(worlds(blocked)).toEqual([[1, 'Kg1 Rf1 Rh1 ke8 nd1', 'K']])
		expect(legal(blocked, 'O-O')).toBe(false)
	})

	it('a split rook loses its right at once, merging back does not restore it (C15)', () => {
		const s = st([home()])
		expect(outs(s, 'h1-h4|h6')).toBe('split 1')
		let s2 = after(s, 'h1-h4|h6')
		expect(worlds(s2)).toEqual([[0.5, 'Ke1 Ra1 Rh4 ke8', 'Q'], [0.5, 'Ke1 Ra1 Rh6 ke8', 'Q']])
		expect(budgetInfo(V, s2, 0)).toMatchObject({ used: 2, limit: BUDGET })
		expect(legal(s2, 'O-O')).toBe(false)
		// castling is never the path of a split or a merge, and the king cannot split
		expect(splitsFrom(V, s, sq('e1'))).toEqual([])
		expect(branches(V, s, 'e1-g1|h1')).toBeNull()
		s2 = after(s2, 'e8-d8')
		expect(outs(s2, 'h4|h6-h1')).toBe('move 1')
		s2 = after(s2, 'h4|h6-h1')
		expect(worlds(s2)).toEqual([[1, 'Ke1 Ra1 Rh1 kd8', 'Q']])
		s2 = after(s2, 'd8-e8')
		expect(castles(s2)).toEqual(['O-O-O>a1'])
		// a split with one path blocked in some worlds: the rook stays home there, the right is lost everywhere
		const part = after(st([home({ h3: '1:n' }), home({ a6: '1:n' })]), 'h1-h2|h5')
		expect(worlds(part).map((e) => [e[0], e[2]])).toEqual([[0.25, 'Q'], [0.25, 'Q'], [0.25, 'Q'], [0.25, 'Q']])
		expect(worlds(part).map((e) => e[1])).toEqual([
			'Ke1 Ra1 Rh1 ke8 nh3',
			'Ke1 Ra1 Rh2 ke8 na6',
			'Ke1 Ra1 Rh2 ke8 nh3',
			'Ke1 Ra1 Rh5 ke8 na6',
		])
		expect(castles(after(part, 'e8-d8'))).toEqual(['O-O-O>a1'])
	})

	it('enemy moves: a rolled capture of the rook, and a linked slide that blocks the path (C20)', () => {
		const s = st([home({ e4: '1:b' }), home({ a6: '1:b' })], { turn: 1 })
		expect(outs(s, 'e4-h1')).toBe('miss 0.5 rolled, capture 0.5 rolled')
		const missed = after(s, 'e4-h1', 'miss')
		expect(worlds(missed)).toEqual([[1, 'Ke1 Ra1 Rh1 ba6 ke8', 'KQ']])
		expect(outs(missed, 'O-O')).toBe('move 1')
		const hit = after(s, 'e4-h1', 'capture')
		expect(worlds(hit)).toEqual([[1, 'Ke1 Ra1 bh1 ke8', 'Q']])
		expect(castles(hit)).toEqual(['O-O-O>a1'])
		const slide = st([home({ c8: '1:r', c4: '0:n' }), home({ c8: '1:r', a3: '0:n' })], { turn: 1 })
		expect(outs(slide, 'c8-c1')).toBe('move 1')
		const linked = after(slide, 'c8-c1')
		expect(linked.worlds.map(({ b }) => rights(b))).toEqual(['KQ', 'KQ'])
		expect(castles(linked)).toEqual(['O-O>h1'])
		expect(outs(linked, 'O-O')).toBe('move 1')
	})

	it('en passant is certain and possible only on the ply right after the double step', () => {
		// a White knight 50 % a3 / c3 and a Black knight 50 % a6 / h6, independent: four worlds
		const placements = []
		for (const white of ['a3', 'c3']) {
			for (const black of ['a6', 'h6']) {
				placements.push({ e1: '0:k', e5: '0:p', d7: '1:p', e8: '1:k', [white]: '0:n', [black]: '1:n' })
			}
		}
		const ep = after(st(placements, { turn: 1, castle: false }), 'd7-d5')
		expect(ep.worlds).toHaveLength(4)
		expect(ep.worlds.every(({ b }) => b.x.ep === sq('d6') && b.x.epVictim === sq('d5'))).toBe(true)
		expect(outs(ep, 'e5-d6')).toBe('capture 1')
		expect(worlds(after(ep, 'e5-d6')).map((e) => e[1])).toEqual([
			'Ke1 Na3 Pd6 ke8 na6',
			'Ke1 Na3 Pd6 ke8 nh6',
			'Ke1 Nc3 Pd6 ke8 na6',
			'Ke1 Nc3 Pd6 ke8 nh6',
		])
		// one ply later it is gone, also when both plies in between were measurements
		expect(legal(after(after(ep, 'e1-e2'), 'e8-f8'), 'e5-d6')).toBe(false)
		const measured = after(after(ep, '?a3', 'a3'), '?a6', 'a6')
		expect(worlds(measured)).toEqual([[1, 'Ke1 Na3 Pe5 ke8 na6 pd5', '']])
		expect(measured.worlds[0].b.x.ep).toBe(-1)
		expect(legal(measured, 'e5-d6')).toBe(false)
	})
})

describe('chess960: winning and drawing', () => {
	it('capturing the king wins; a roll decides a capture that is possible in some worlds only', () => {
		const s = st(pair({ g1: '0:k', e1: '0:r', e8: '1:k' }, { e5: '1:n' }, { a6: '1:n' }), { castle: false })
		expect(outs(s, 'e1-e8')).toBe('miss 0.5 rolled, capture 0.5 rolled')
		expect(after(s, 'e1-e8', 'capture').result).toEqual({ winner: 0, reason: 'king' })
		const missed = after(s, 'e1-e8', 'miss')
		expect(missed.result).toBeNull()
		expect(worlds(missed)).toEqual([[1, 'Kg1 Re1 ke8 ne5', '']])
	})

	it('only the two kings left is a draw, unless the side to move can take the king (C19)', () => {
		const bare = after(st([{ e4: '0:k', h8: '1:k', d5: '1:p' }], { castle: false }), 'e4-d5')
		expect(bare.result).toEqual({ winner: null, reason: 'bareKings' })
		expect(legalMoves(V, bare)).toEqual([])
		const next = after(st([{ e5: '0:k', f7: '1:k', e6: '1:p' }], { castle: false }), 'e5-e6')
		expect(next.result).toBeNull()
		expect(after(next, 'f7-e6').result).toEqual({ winner: 1, reason: 'king' })
		// the capture roll alone decides; no game-end roll follows
		const s = st([{ e4: '0:k', h8: '1:k', d5: '1:n' }, { e4: '0:k', h8: '1:k', a8: '1:n' }], { castle: false })
		expect(outs(s, 'e4-d5')).toBe('move 0.5 rolled, capture 0.5 rolled')
		expect(branches(V, s, 'e4-d5').every((br) => br.notes.length === 0)).toBe(true)
		expect(after(s, 'e4-d5', 'move').result).toBeNull()
		expect(after(s, 'e4-d5', 'capture').result).toEqual({ winner: null, reason: 'bareKings' })
		// a king and a minor piece against a king is no draw
		expect(after(st([{ e4: '0:k', a1: '0:n', h8: '1:k', d5: '1:p' }], { castle: false }), 'e4-d5').result)
			.toBeNull()
	})

	it('100 plies without a capture or a pawn move is a draw', () => {
		const s = st([home()], { quiet: 99 })
		expect(after(s, 'O-O').result).toEqual({ winner: null, reason: 'quiet' })
		expect(after({ ...s, quiet: 98 }, 'O-O').result).toBeNull()
	})

	it('the 100-ply draw waits while the side to move can take the king for certain (drawsWait)', () => {
		const s = st([{ e1: '0:k', a1: '0:r', e8: '1:r', h8: '1:k' }], { castle: false, quiet: 99 })
		const waiting = after(s, 'a1-a2')
		expect([waiting.quiet, waiting.result]).toEqual([100, null])
		expect(after(waiting, 'e8-e1').result).toEqual({ winner: 1, reason: 'king' })
	})

	it('wins at once when the enemy king cannot escape, from the core default (cannotEscape)', () => {
		// Qb7 with the king on c7: every move of the king on a8 lets it be captured for certain
		const s = st([{ c7: '0:k', b1: '0:q', a8: '1:k' }], { castle: false })
		expect(after(s, 'b1-b7').result).toEqual({ winner: 0, reason: 'cannotEscape' })
		// a queen that the king can take without being taken back leaves it an escape
		expect(after(st([{ e1: '0:k', b1: '0:q', a8: '1:k' }], { castle: false }), 'b1-b7').result).toBeNull()
	})

	it('castling onto the rook is an escape, unless a ghost that might stand in the way makes it illegal', () => {
		// e8, d7, d8, e7, f7 and f8 are all attacked, and so is e8 after any rook move; only O-O (Kg8 Rf8) is safe
		const pos = { e8: '1:k', h8: '1:r', b1: '0:k', a4: '0:q', d1: '0:r', e6: '0:p', g6: '0:n' }
		const saved = after(st([pos]), 'b1-a1')
		expect(saved.result).toBeNull()
		expect(castles(saved)).toEqual(['O-O>h8'])
		expect(after(saved, 'O-O').result).toBeNull()
		// without the right, or with a White bishop 50 % on g8, the Black king cannot escape
		expect(after(st([pos], { castle: false }), 'b1-a1').result).toEqual({ winner: 0, reason: 'cannotEscape' })
		const ghost = st([{ ...pos, g8: '0:b' }, { ...pos, a2: '0:b' }])
		expect(after(ghost, 'b1-a1').result).toEqual({ winner: 0, reason: 'cannotEscape' })
	})
})

/**
 * Check the invariants of the quantum layer and of Chess960 castling after a move (spec C18).
 *
 * @param {object} s state
 */
function checkState(s) {
	expect(s.worlds.length).toBeGreaterThan(0)
	expect(s.worlds.length).toBeLessThanOrEqual(MAX_WORLDS)
	expect(s.worlds.reduce((a, e) => a + e.w, 0)).toBe(T)
	const solid = (b) => b.board.map((id) => (id >= 0 && V.solidTypes.has(b.ty[id]) ? b.sd[id] + b.ty[id] : '.')).join()
	const count = (b) => [0, 1].map((side) => b.sq.filter((q, id) => q >= 0 && b.sd[id] === side).length).join('/')
	const first = s.worlds[0].b
	for (const { b, w } of s.worlds) {
		expect(Number.isInteger(w) && w > 0).toBe(true)
		b.sq.forEach((q, id) => q >= 0 && expect(b.board[q]).toBe(id))
		expect(solid(b)).toBe(solid(first))
		expect(count(b)).toBe(count(first))
		expect(JSON.stringify(b.x.castle)).toBe(JSON.stringify(first.x.castle))
		expect(b.x.ep).toBe(first.x.ep)
		for (const c of b.x.castle) {
			const [k, r] = [b.board[c.king], b.board[c.rook]]
			expect(k >= 0 && b.ty[k] === 'k' && b.sd[k] === c.side && r >= 0 && b.ty[r] === 'r' && b.sd[r] === c.side)
				.toBe(true)
		}
	}
	for (const side of [0, 1]) {
		expect(budget(s, side)).toBeLessThanOrEqual(BUDGET)
	}
	if (s.result) {
		expect(legalMoves(V, s)).toEqual([])
		return
	}
	const listed = new Set(legalMoves(V, s).filter((m) => m.kind === 'castle').map((m) => m.code))
	for (const key of ['O-O', 'O-O-O']) {
		const everywhere = s.worlds.every(({ b }) => generate(V, b, s.turn).has(key))
		expect(listed.has(key), key).toBe(everywhere)
	}
}

/**
 * The move a random game plays (spec C18): a castling whenever one is legal, a split on every fourth ply, and on
 * other plies preferably a move of a back-rank piece that is not a king or a rook, to open the castling paths.
 *
 * @param {object} s state
 * @param {number} ply ply of the game
 * @param {() => number} rng random numbers
 * @return {string}
 */
function randomCode(s, ply, rng) {
	const all = legalMoves(V, s)
	let list = all.filter((m) => m.kind === 'castle')
	if (!list.length && ply % 4 === 1) {
		const froms = new Set()
		for (const { b } of s.worlds) {
			b.sq.forEach((q, id) => q >= 0 && b.sd[id] === s.turn && V.types[b.ty[id]].splittable && froms.add(q))
		}
		const f = [...froms][Math.floor(rng() * froms.size)]
		list = f === undefined ? [] : splitsFrom(V, s, f)
	} else if (!list.length && rng() < 0.6) {
		const minor = (m) => s.worlds.some(({ b }) => b.board[m.from] >= 0 && !'kr'.includes(b.ty[b.board[m.from]]))
		list = all.filter((m) => m.type === 'move' && [0, 7].includes(V.topology.coords[m.from][1]) && minor(m))
	}
	const codes = (list.length ? list : all).map((m) => m.code)
	return codes[Math.floor(rng() * codes.length)]
}

/**
 * The shape of a castling right: `king stays`, `rook stays`, `swap` or `both move`.
 *
 * @param {object} c right `{ king, rook, kingTo, rookTo }`
 * @return {string}
 */
function shapeOf(c) {
	if (c.king === c.kingTo) {
		return 'king stays'
	}
	if (c.rook === c.rookTo) {
		return 'rook stays'
	}
	return c.king === c.rookTo ? 'swap' : 'both move'
}

/**
 * Check a castling that was just played: one outcome, never rolled, king and rook on their end squares in every
 * world, no right left for that side, and the record marks the king's and the rook's start squares.
 *
 * @param {object} s state before the castling
 * @param {string} code `O-O` or `O-O-O`
 * @param {object} res the result of `applyMove`
 * @return {string} the castling shape, e.g. `O-O swap`
 */
function checkCastling(s, code, res) {
	const right = s.worlds[0].b.x.castle
		.find((c) => c.side === s.turn && (code === 'O-O') === (c.flag.toLowerCase() === 'k'))
	expect(res.outcomes).toHaveLength(1)
	expect([res.branch.key, res.branch.rolled]).toEqual(['move', false])
	for (const { b } of res.state.worlds) {
		expect([b.ty[b.board[right.kingTo]], b.ty[b.board[right.rookTo]]]).toEqual(['k', 'r'])
		expect(b.x.castle.some((c) => c.side === s.turn)).toBe(false)
	}
	const rec = res.state.history.at(-1)
	expect([rec.from, rec.to]).toEqual([[right.king], [right.rook]])
	return code + ' ' + shapeOf(right)
}

describe('chess960: random games and the computer player', () => {
	it('plays random games from start positions with every castling shape without breaking an invariant (C18)', () => {
		const shapes = new Set()
		let castlings = 0
		for (const position of [0, 3, 10, 15, 74, 95, 249, 291, 518, 534, 959]) {
			for (let seed = 1; seed <= 5; seed++) {
				const rng = seededRng(seed * 7919 + position)
				let s = newGame(V, { position }, rng)
				checkState(s)
				for (let ply = 0; ply < 90 && !s.result; ply++) {
					const code = randomCode(s, ply, rng)
					const res = applyMove(V, s, code, rng)
					expect(res, code).not.toBeNull()
					if (code.startsWith('O-O')) {
						castlings++
						shapes.add(checkCastling(s, code, res))
					}
					s = res.state
					checkState(s)
				}
			}
		}
		expect(castlings).toBeGreaterThan(40)
		expect([...shapes].sort()).toEqual([
			'O-O both move',
			'O-O king stays',
			'O-O rook stays',
			'O-O swap',
			'O-O-O both move',
			'O-O-O king stays',
			'O-O-O rook stays',
			'O-O-O swap',
		])
	}, 60000)

	it('scores development and a sheltered king, the same for both sides', () => {
		const b = newGame(V, { position: 518 }).worlds[0].b
		expect(V.evaluate(b, 0)).toBe(0)
		const developed = after(newGame(V, { position: 518 }), 'g1-f3').worlds[0].b
		expect(V.evaluate(developed, 0)).toBe(12)
		expect(V.evaluate(developed, 1)).toBe(-12)
		// a king that left its back rank while the enemy queen is on the board, against a sheltered king
		const placement = { e2: '0:k', a2: '0:p', g8: '1:k', f7: '1:p', g7: '1:p', h6: '1:p', d8: '1:q' }
		const exposed = st([placement], { castle: false }).worlds[0].b
		expect(V.evaluate(exposed, 1)).toBe(30 + 15 + 10 + 10 + 4)
		expect(V.evaluate(exposed, 0)).toBe(-V.evaluate(exposed, 1))
	})

	it('plays a legal move at every level within its time budget, from a shuffled and a superposed start', async () => {
		const swap = st(pair({ a1: '0:r', f1: '0:k', g1: '0:r', e8: '1:k' }, { h1: '1:n' }, { e1: '1:n' }))
		for (const level of LEVELS) {
			for (const s of [newGame(V, optionValues(V, {})), newGame(V, { position: 3 }), swap]) {
				const elapsed = stopwatch()
				const code = await chooseMove(V, s, { level: level.id, rng: seededRng(7) })
				expect(elapsed()).toBeLessThan(level.timeMs + 500)
				expect(branches(V, s, code), level.id + ': ' + code).not.toBeNull()
			}
		}
	}, 30000)
})
