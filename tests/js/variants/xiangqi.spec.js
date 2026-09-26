/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Xiangqi (Chinese chess): the point board, the WXF start array, the move of every piece (checked against
 * Fairy-Stockfish by perft), the flying general, the loss without a move, the draws, and how they meet the quantum
 * rules.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { glyphOf, typeName } from '../../../src/variantplay/glyphs.js'
import { reasonText, resultText, sharedRules } from '../../../src/variantplay/texts.js'
import { chooseMove, LEVELS } from '../../../src/variants/core/ai.js'
import {
	applyMove,
	branches,
	budget,
	legalMoves,
	mergesFrom,
	newGame,
	outcomes,
	pieceLocations,
	royalDanger,
	splitsFrom,
	T,
} from '../../../src/variants/core/quantum.js'
import { applyClassical, generate, nameOf, OFF, placePiece, worldFrom } from '../../../src/variants/core/world.js'
import V, { facing, inPalace, ownHalf } from '../../../src/variants/xiangqi.js'
import { play, stateOf, stopwatch, workClock } from './helpers.js'

/**
 * The index of a point.
 *
 * @param {string} name point name
 * @return {number}
 */
const sq = (name) => V.topology.byName(name)

/**
 * A state from explicit worlds with xiangqi's empty extra state.
 *
 * @param {Array<[Record<string, string>, number]>} worlds placements with relative weights (pieces in the same
 *   order in every world, so a ghost keeps one id)
 * @param {number} [turn] side to move
 * @param {(w: object) => void} [edit] change every world after it is built
 * @return {object}
 */
function S(worlds, turn = 0, edit = () => {}) {
	return stateOf(V, worlds, turn, edit)
}

/**
 * The targets of the ordinary moves from a point, sorted by name.
 *
 * @param {object} s state
 * @param {string} from point name
 * @return {string[]}
 */
function targets(s, from) {
	return legalMoves(V, s)
		.filter((m) => m.code.startsWith(from + '-') && !m.code.includes('|'))
		.map((m) => m.code.split('-')[1])
		.sort()
}

/**
 * Outcomes as `key p` strings, `R` marking a roll and the follow-up notes in brackets; null when illegal.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {string[]|null}
 */
function outs(s, code) {
	const list = outcomes(V, s, code)
	if (!list) {
		return null
	}
	return list.map((o) => {
		const notes = o.notes.length ? ' [' + o.notes.join(';') + ']' : ''
		return o.key + ' ' + o.p + (o.rolled ? ' R' : '') + notes
	})
}

/**
 * The worlds of a state as text: weight, then the pieces on the board in id order (Red upper case).
 *
 * @param {object} s state
 * @return {string[]}
 */
function show(s) {
	return s.worlds.map(({ b, w }) => {
		const pieces = []
		b.sq.forEach((q, id) => {
			if (q >= 0) {
				pieces.push((b.sd[id] === 0 ? b.ty[id].toUpperCase() : b.ty[id]) + nameOf(V, q))
			}
		})
		return w / T + ' ' + pieces.join(' ')
	})
}

/**
 * Where the piece that stands on a point (in some world) is, over all worlds: `e5 0.5, d7 0.5`.
 *
 * @param {object} s state
 * @param {string} name point name
 * @return {string}
 */
function locs(s, name) {
	const id = s.worlds.find(({ b }) => b.board[sq(name)] >= 0).b.board[sq(name)]
	return pieceLocations(s, id).map((l) => (l.sq >= 0 ? nameOf(V, l.sq) : 'off') + ' ' + l.p).join(', ')
}

/**
 * Play several moves, each with its first outcome.
 *
 * @param {object} s state
 * @param {string[]} list move codes
 * @return {object}
 */
function playAll(s, list) {
	return list.reduce((st, c) => play(V, st, c), s)
}

/**
 * A classical world from a Fairy-Stockfish FEN (letters r n b a k c p, upper case = Red).
 *
 * @param {string} fen FEN
 * @return {{world: object, turn: number}}
 */
function fromFen(fen) {
	const letters = { r: 'r', n: 'h', b: 'e', a: 'a', k: 'k', c: 'c', p: 'p' }
	const [rows, turn] = fen.split(' ')
	const placement = {}
	rows.split('/').forEach((row, i) => {
		let f = 0
		for (const m of row.matchAll(/(\d)|([a-zA-Z])/g)) {
			if (m[1]) {
				f += Number(m[1])
				continue
			}
			const side = m[2] === m[2].toUpperCase() ? 0 : 1
			placement['abcdefghi'[f] + (10 - i)] = side + ':' + letters[m[2].toLowerCase()]
			f++
		}
	})
	return { world: worldFrom(V, placement, {}), turn: turn === 'b' ? 1 : 0 }
}

/**
 * The pieces of a world as a placement map `{ point: 'side:type' }`.
 *
 * @param {object} w world
 * @return {Record<string, string>}
 */
function placementOf(w) {
	const out = {}
	w.board.forEach((id, q) => {
		if (id >= 0) {
			out[nameOf(V, q)] = w.sd[id] + ':' + w.ty[id]
		}
	})
	return out
}

/**
 * Legal-move perft of real xiangqi on one world: a move is legal when the opponent cannot capture the mover's
 * general after it (flying general included), as in Fairy-Stockfish.
 *
 * @param {object} w world
 * @param {number} side side to move
 * @param {number} depth depth
 * @return {number}
 */
function perft(w, side, depth) {
	let n = 0
	for (const m of generate(V, w, side).values()) {
		const next = applyClassical(V, w, m)
		let safe = true
		for (const r of generate(V, next, 1 - side).values()) {
			if (r.capture >= 0 && next.ty[r.capture] === 'k') {
				safe = false
				break
			}
		}
		if (safe) {
			n += depth === 1 ? 1 : perft(next, 1 - side, depth - 1)
		}
	}
	return n
}

describe('xiangqi: board and setup', () => {
	it('starts from the WXF array on the 90 points, Red to move', () => {
		expect(V.id).toBe('xiangqi')
		expect(V.category).toBe('regional')
		expect(V.topology.size).toBe(90)
		expect([V.topology.names[0], V.topology.names[89]]).toEqual(['a1', 'i10'])
		const s = newGame(V)
		expect(s.turn).toBe(0)
		expect(s.worlds[0].b.x).toEqual({})
		// every piece on its start point, in id order
		expect(show(s)).toEqual([
			'1 Ra1 Hb1 Ec1 Ad1 Ke1 Af1 Eg1 Hh1 Ri1 Cb3 Ch3 Pa4 Pc4 Pe4 Pg4 Pi4 '
			+ 'pa7 pc7 pe7 pg7 pi7 cb8 ch8 ra10 hb10 ec10 ad10 ke10 af10 eg10 hh10 ri10',
		])
		expect(V.sides.map((sd) => [sd.name(), sd.color])).toEqual([['Red', 'red'], ['Black', 'black']])
	})

	it('draws points on a wooden board with the grid, the river, the palaces and the coordinates', () => {
		const { cells, layout } = V.topology
		expect(cells.every((c) => c.shape === 'point' && c.shade === 'light')).toBe(true)
		expect(cells[sq('a1')]).toMatchObject({ x: 0.5, y: 9.5 })
		expect(cells[sq('i10')]).toMatchObject({ x: 8.5, y: 0.5 })
		expect([layout.width, layout.height]).toEqual([9, 10])
		expect(layout.areas.map((a) => a.shade)).toEqual(['wood', 'river'])
		expect(layout.areas[1]).toEqual({ x: 0.5, y: 4.5, w: 8, h: 1, shade: 'river' })
		// 10 ranks, files a and i, the seven inner files in two halves, four palace diagonals
		const grid = layout.lines.filter((l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1) >= 1)
		expect(grid).toHaveLength(10 + 2 + 14 + 4)
		expect(grid).toContainEqual({ x1: 3.5, y1: 9.5, x2: 5.5, y2: 7.5 })
		expect(grid).toContainEqual({ x1: 5.5, y1: 2.5, x2: 3.5, y2: 0.5 })
		// no inner file line crosses the river band
		const inner = grid.filter((l) => l.x1 === l.x2 && l.x1 > 0.5 && l.x1 < 8.5)
		expect(inner.every((l) => Math.max(l.y1, l.y2) <= 4.5 || Math.min(l.y1, l.y2) >= 5.5)).toBe(true)
		// the corner marks: 2 segments per quarter, 10 points with 4 quarters and 4 edge points with 2
		expect(layout.lines.length - grid.length).toBe(2 * (10 * 4 + 4 * 2))
		const ranks = Array.from({ length: 10 }, (_, r) => String(r + 1))
		expect(layout.labels.filter((l) => !l.kind).map((l) => l.text)).toEqual([...'abcdefghi', ...ranks])
		// the river's inscription, in the middle of the river band
		expect(layout.labels.filter((l) => l.kind === 'river')).toEqual([
			{ x: 2.5, y: 5, text: '楚河', kind: 'river' },
			{ x: 6.5, y: 5, text: '漢界', kind: 'river' },
		])
		// no zoom controls: 9 × 10 is below the threshold
		expect(layout.width * layout.height).toBeLessThanOrEqual(200)
	})

	it('names every piece and writes it with a different character for each side', () => {
		const want = {
			k: ['General', '帥', '將'],
			a: ['Advisor', '仕', '士'],
			e: ['Elephant', '相', '象'],
			h: ['Horse', '傌', '馬'],
			r: ['Chariot', '俥', '車'],
			c: ['Cannon', '炮', '砲'],
			p: ['Soldier', '兵', '卒'],
		}
		expect(Object.keys(V.types).sort()).toEqual(Object.keys(want).sort())
		for (const [type, [name, red, black]] of Object.entries(want)) {
			expect(typeName(V, type)).toBe(name)
			expect(glyphOf(V, type, 0)).toMatchObject({ kind: 'text', shape: 'xiangqi', text: red, ink: '#b71c1c' })
			expect(glyphOf(V, type, 1)).toMatchObject({ kind: 'text', shape: 'xiangqi', text: black, ink: '#1b1b1b' })
		}
		expect([...V.solidTypes].sort()).toEqual(['k', 'p'])
		expect(Object.keys(V.types).filter((ty) => V.types[ty].splittable).sort()).toEqual(['a', 'c', 'e', 'h', 'r'])
		// only captures reset the 50-move count
		expect([...V.quietTypes]).toEqual([])
		const rules = V.rules()
		expect(rules.length).toBeGreaterThanOrEqual(3)
		expect(rules.length).toBeLessThanOrEqual(8)
		expect(rules.every((r) => typeof r === 'string' && r.length > 20)).toBe(true)
		// the card names the escape rule of the core, which ends checkmates and WXF stalemates
		expect(rules[6]).toContain('every move you have would let your general be captured for certain')
		// no castling and no en passant: the shared rules card leaves out its sentence about them
		expect(V.specialMoves).toBe(false)
		// the classic end rules of docs/rules.md 5 and 6 all apply
		expect([V.escapeRule, V.bareKingsDraw, V.drawsWait]).toEqual([true, true, true])
		expect(sharedRules(V).some((r) => r.includes('Castling') || r.includes('en passant'))).toBe(false)
	})

	it('knows the palaces and the halves of the board', () => {
		const palace = (side) => V.topology.names.filter((n) => inPalace(side, sq(n))).sort()
		expect(palace(0)).toEqual(['d1', 'd2', 'd3', 'e1', 'e2', 'e3', 'f1', 'f2', 'f3'])
		expect(palace(1)).toEqual(['d10', 'd8', 'd9', 'e10', 'e8', 'e9', 'f10', 'f8', 'f9'])
		expect([ownHalf(0, sq('a5')), ownHalf(0, sq('a6')), ownHalf(1, sq('a6')), ownHalf(1, sq('a5'))])
			.toEqual([true, false, true, false])
	})
})

describe('xiangqi: the pieces', () => {
	it('has 44 moves at the start, piece by piece (T1)', () => {
		const s = newGame(V)
		expect(legalMoves(V, s)).toHaveLength(44)
		expect(targets(s, 'b1')).toEqual(['a3', 'c3'])
		expect(targets(s, 'c1')).toEqual(['a3', 'e3'])
		expect(targets(s, 'd1')).toEqual(['e2'])
		expect(targets(s, 'e1')).toEqual(['e2'])
		expect(targets(s, 'e4')).toEqual(['e5'])
		expect(targets(s, 'a1')).toEqual(['a2', 'a3'])
		expect(targets(s, 'b3')).toEqual(['a3', 'b10', 'b2', 'b4', 'b5', 'b6', 'b7', 'c3', 'd3', 'e3', 'f3', 'g3'])
		// the cannon captures the horse over the black cannon, but cannot take the cannon itself without a screen
		expect(outs(s, 'b3-b10')).toEqual(['capture 1'])
		expect(outs(s, 'b3-b8')).toBeNull()
		expect([budget(s, 0), budget(s, 1)]).toEqual([1, 1])
	})

	it('generates the legal moves of Fairy-Stockfish (perft of the start position to depth 3)', () => {
		const { world, turn } = fromFen('rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w')
		expect(placementOf(world)).toEqual(placementOf(newGame(V).worlds[0].b))
		expect([1, 2, 3].map((d) => perft(world, turn, d))).toEqual([44, 1920, 79666])
	}, 30000)

	it('generates the legal moves of Fairy-Stockfish in its test positions', () => {
		const cases = [
			['1rbaka2R/5r3/6n2/2p1p1p2/4P1bP1/PpC3Bc1/1nPR2P2/2N2AN2/1c2K1p2/2BAC4 w', 2, 2265],
			['4kcP1N/8n/3rb4/9/9/9/9/3p1A3/4K4/5CB2 w', 3, 3707],
			['3k5/9/9/9/9/9/9/9/9/4K4 w', 3, 6],
			['4k4/4a4/9/9/9/9/9/9/4A4/3K5 b', 3, 89],
			['3akab2/9/4b4/9/2p1c1p2/9/9/4C4/4A4/3AK4 w', 3, 179],
			['4k4/9/9/9/9/9/9/9/2p1p1p2/3K5 w', 1, 0],
		]
		for (const [fen, depth, nodes] of cases) {
			const { world, turn } = fromFen(fen)
			expect(perft(world, turn, depth), fen).toBe(nodes)
		}
	}, 30000)

	it('hobbles the horse on its leg (T2)', () => {
		const pos = { d1: '0:k', e5: '0:h', d6: '0:p', f10: '1:k', d7: '1:h' }
		const s = S([[pos, 1]])
		expect(targets(s, 'e5')).toEqual(['c4', 'c6', 'd3', 'd7', 'f3', 'f7', 'g4', 'g6'])
		expect(outs(s, 'e5-d7')).toEqual(['capture 1'])
		// the leg d6 blocks both c5 and e5: only one horse can capture the other
		const b = S([[pos, 1]], 1)
		expect(targets(b, 'd7')).toEqual(['b6', 'b8', 'c9', 'e9', 'f6', 'f8'])
		expect(outs(b, 'd7-e5')).toBeNull()
		const c = S([[{ d1: '0:k', e5: '0:h', e6: '1:p', d5: '0:c', f10: '1:k' }, 1]])
		expect(targets(c, 'e5')).toEqual(['d3', 'f3', 'g4', 'g6'])
	})

	it('keeps the elephant on its own half and blocks it on its eye (T3)', () => {
		expect(targets(S([[{ d1: '0:k', c5: '0:e', f10: '1:k' }, 1]]), 'c5')).toEqual(['a3', 'e3'])
		const eye = S([[{ d1: '0:k', c5: '0:e', f10: '1:k', d4: '1:p', a3: '1:r' }, 1]])
		expect(targets(eye, 'c5')).toEqual(['a3'])
		expect(outs(eye, 'c5-a3')).toEqual(['capture 1'])
		expect(targets(S([[{ d1: '0:k', e3: '0:e', f10: '1:k' }, 1]]), 'e3')).toEqual(['c1', 'c5', 'g1', 'g5'])
		// Black's elephant on its own half
		expect(targets(S([[{ d1: '0:k', f10: '1:k', c6: '1:e' }, 1]], 1), 'c6')).toEqual(['a8', 'e8'])
	})

	it('lets the cannon capture over exactly one screen of either colour (T4)', () => {
		const s = playAll(newGame(V), ['h3-e3', 'h10-g8'])
		expect(outs(s, 'e3-e7')).toEqual(['capture 1'])
		expect(outs(s, 'e3-e10')).toBeNull()
		expect(outs(s, 'e3-e5')).toBeNull()
		// the chariot of the same line captures the first piece only
		const r = S([[{ d1: '0:k', e3: '0:r', f10: '1:k', e7: '1:p', e9: '1:h' }, 1]])
		expect(targets(r, 'e3')).toContain('e7')
		expect(targets(r, 'e3')).not.toContain('e9')
	})

	it('moves soldiers forward, sideways only across the river, never back (T5)', () => {
		const pos = { d1: '0:k', e4: '0:p', a6: '0:p', i10: '0:p', f10: '1:k', e5: '1:p' }
		const s = S([[pos, 1]])
		expect(targets(s, 'e4')).toEqual(['e5'])
		expect(targets(s, 'a6')).toEqual(['a7', 'b6'])
		expect(targets(s, 'i10')).toEqual(['h10'])
		expect(targets(S([[{ d1: '0:k', e4: '0:p', f10: '1:k', e5: '1:p' }, 1]], 1), 'e5')).toEqual(['d5', 'e4', 'f5'])
	})

	it('keeps the general and the advisors in the palace (T6)', () => {
		const s = S([[{ d3: '0:k', e2: '0:a', f10: '1:k' }, 1]])
		expect(targets(s, 'd3')).toEqual(['d2', 'e3'])
		expect(targets(s, 'e2')).toEqual(['d1', 'f1', 'f3'])
	})
})

describe('xiangqi: winning, losing and drawing', () => {
	it('lets the general fly along an open file to capture the other general (T7)', () => {
		const s = S([[{ d1: '0:k', a1: '0:r', d10: '1:k', i10: '1:r' }, 1]])
		expect(outs(s, 'd1-d10')).toEqual(['capture 1'])
		const after = play(V, s, 'd1-d10')
		expect(after.result).toEqual({ winner: 0, reason: 'general' })
		expect(reasonText(V, after.result.reason)).toBe('a general was captured')
		expect(outs(S([[{ d1: '0:k', a1: '0:r', d5: '1:c', d10: '1:k', i10: '1:r' }, 1]]), 'd1-d10')).toBeNull()
	})

	it('allows opening the file between the generals, which loses (T8)', () => {
		let s = S([[{ d1: '0:k', d5: '0:r', a1: '0:r', d10: '1:k', i10: '1:r' }, 1]])
		expect(royalDanger(V, s, 0)).toBe(0)
		s = play(V, s, 'd5-h5')
		expect(facing(s.worlds[0].b)).toBe(true)
		expect(royalDanger(V, s, 0)).toBe(1)
		expect(outs(s, 'd10-d1')).toEqual(['capture 1'])
		expect(play(V, s, 'd10-d1').result).toEqual({ winner: 1, reason: 'general' })
	})

	it('makes a side without any move lose (T9)', () => {
		const red = { e1: '0:k', d1: '0:a', f1: '0:a', e2: '0:c', d10: '1:k', d2: '1:p', f2: '1:p' }
		const s = play(V, S([[{ ...red, e4: '1:p' }, 1]], 1), 'e4-e3')
		expect(s.result).toEqual({ winner: 1, reason: 'noMoves' })
		expect(legalMoves(V, s)).toEqual([])
		// control: with the soldier one point further back, Red still has e2-e3
		expect(play(V, S([[{ ...red, e5: '1:p' }, 1]], 1), 'e5-e4').result).toBeNull()
	})

	it('draws when no piece that can cross the river is left, unless the generals face (T10)', () => {
		const s = S([[{ f2: '0:k', d1: '0:a', d9: '1:k', e2: '1:p' }, 1]])
		expect(outs(s, 'f2-e2')).toEqual(['capture 1'])
		const draw = play(V, s, 'f2-e2')
		expect(draw.result).toEqual({ winner: null, reason: 'noAttackers' })
		expect(reasonText(V, 'noAttackers')).toBe('no piece left that can cross the river')
		const open = play(V, S([[{ f2: '0:k', d1: '0:a', e9: '1:k', e2: '1:p' }, 1]]), 'f2-e2')
		expect(open.result).toBeNull()
		expect(outs(open, 'e9-e2')).toEqual(['capture 1'])
		// only the two generals left: the xiangqi reason, not the generic bare-kings draw
		const bare = play(V, S([[{ d2: '0:k', d9: '1:k', e2: '1:p' }, 1]]), 'd2-e2')
		expect(bare.result).toEqual({ winner: null, reason: 'noAttackers' })
		// facing on an open file: no draw while the flying capture is certain
		const facingBare = play(V, S([[{ d2: '0:k', e9: '1:k', e2: '1:p' }, 1]]), 'd2-e2')
		expect([facingBare.result, facingBare.turn]).toEqual([null, 1])
		expect(play(V, facingBare, 'e9-e2').result).toEqual({ winner: 1, reason: 'general' })
	})

	it('counts 50 moves by each side without a capture; soldier moves do not reset it (T11)', () => {
		let s = S([[{ f1: '0:k', a9: '0:r', e9: '0:p', d10: '1:k' }, 1]])
		s = play(V, s, 'e9-d9')
		expect(targets(s, 'd10')).toEqual(['d9', 'e10'])
		s = playAll(s, ['d10-e10', 'd9-e9'])
		expect(targets(s, 'e10')).toEqual(['d10', 'e9', 'f10'])
		s = playAll(s, ['e10-d10', 'e9-d9', 'd10-e10', 'd9-e9', 'e10-d10'])
		expect([s.ply, s.quiet, s.result]).toEqual([8, 8, null])
		// the 100th quiet ply draws; a capture resets the count
		const late = { ...S([[{ f1: '0:k', a9: '0:r', e9: '0:p', d10: '1:k', h10: '1:h' }, 1]]), quiet: 99 }
		const quiet = play(V, late, 'e9-e10')
		expect(quiet.result).toEqual({ winner: null, reason: 'quiet' })
		expect(reasonText(V, 'quiet')).toBe('50 moves by each side without a capture')
		// a quiet move that gives no check: Black could go on with h10-g8, but the count ends the game
		expect(play(V, late, 'f1-f2').result).toEqual({ winner: null, reason: 'quiet' })
		// a mate given on the 100th quiet ply wins, as in Fairy-Stockfish (R2k3n1/4P4/9/9/9/9/9/9/9/5K3 b: no move)
		expect(play(V, late, 'a9-a10').result).toEqual({ winner: 0, reason: 'cannotEscape' })
		expect(play(V, { ...late, quiet: 50 }, 'e9-e10').quiet).toBe(51)
		expect(play(V, S([[{ f1: '0:k', a9: '0:r', d10: '1:k', h9: '1:h' }, 1]]), 'a9-h9').quiet).toBe(0)
		// the draw waits while Black can fly to the red general for certain (docs/rules.md 6)
		const open = play(V, { ...S([[{ e1: '0:k', a1: '0:r', d10: '1:k', h10: '1:h' }, 1]]), quiet: 99 }, 'e1-d1')
		expect([open.result, open.quiet]).toEqual([null, 100])
		expect(play(V, open, 'd10-d1').result).toEqual({ winner: 1, reason: 'general' })
		// a ghost chariot on the file makes the flying capture uncertain: the draw comes
		const ghost = S([
			[{ e1: '0:k', d5: '0:r', d10: '1:k', h10: '1:h' }, 1],
			[{ e1: '0:k', a5: '0:r', d10: '1:k', h10: '1:h' }, 1],
		])
		expect(play(V, { ...ghost, quiet: 99 }, 'e1-d1').result).toEqual({ winner: null, reason: 'quiet' })
	})

	it('ends a checkmate or a WXF stalemate at once: the general could not escape', () => {
		// the chariot mates with the flying general's help: e10 faces the red general, d9 is on the chariot's file
		const mate = S([[{ e1: '0:k', a5: '0:r', d10: '1:k' }, 1]])
		const won = play(V, mate, 'a5-d5')
		expect(won.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		expect(legalMoves(V, won)).toEqual([])
		expect(reasonText(V, 'cannotEscape')).toBe('the general could not escape')
		expect(resultText(V, won.result)).toBe('Red wins (the general could not escape)')
		// control: a red soldier on e6 closes the file, so d10-e10 escapes
		expect(play(V, S([[{ e1: '0:k', a5: '0:r', e6: '0:p', d10: '1:k' }, 1]]), 'a5-d5').result).toBeNull()
		// WXF stalemate (3.1.A): the red general is not attacked, but d2 and e1 are, so Red loses
		const lost = play(V, S([[{ d1: '0:k', c2: '1:p', e3: '1:p', e10: '1:k' }, 1]], 1), 'e3-e2')
		expect(royalDanger(V, lost, 0)).toBe(0)
		expect(lost.result).toEqual({ winner: 1, reason: 'cannotEscape' })
		expect(resultText(V, lost.result)).toBe('Black wins (the general could not escape)')
		// a ghost chariot covers d9 in half of the possibilities only: d10-d9 is an escape
		const half = play(V, mate, 'a5-d5|h5')
		expect(royalDanger(V, half, 1)).toBe(0.5)
		expect(half.result).toBeNull()
		expect(outs(half, 'd10-d9')).toEqual(['move 1'])
	})

	it('ends the double cannon mate; a split onto the file makes each cannon capture in one possibility only', () => {
		// e5 captures over the screen e4, and a piece put on e2 or e3 becomes the screen of e4 (Fairy-Stockfish: no
		// move in 4k4/9/9/9/9/4c4/4c4/9/9/3AKA3 w, also with an elephant on c1)
		const pos = { e1: '0:k', d1: '0:a', f1: '0:a', e10: '1:k', e4: '1:c', h5: '1:c' }
		expect(play(V, S([[pos, 1]], 1), 'h5-e5').result).toEqual({ winner: 1, reason: 'cannotEscape' })
		const s = play(V, S([[{ ...pos, c1: '0:e' }, 1]], 1), 'h5-e5')
		expect([s.result, royalDanger(V, s, 0)]).toEqual([null, 1])
		expect(royalDanger(V, play(V, s, 'c1-e3'), 0)).toBe(1)
		// the elephant as a ghost a3 / e3: e4 captures where it is on e3, e5 where it is on a3, neither for certain
		const split = play(V, s, 'c1-a3|e3')
		expect(royalDanger(V, split, 0)).toBe(0.5)
		expect(outs(split, 'e4-e1')).toEqual(['miss 0.5 R', 'capture 0.5 R'])
		expect(outs(split, 'e5-e1')).toEqual(['miss 0.5 R', 'capture 0.5 R'])
	})
})

describe('xiangqi: quantum interactions', () => {
	it('uses a ghost as a cannon screen only where it stands; a quiet cannon move past it links (Q1)', () => {
		const s = S([
			[{ d1: '0:k', b3: '0:c', f10: '1:k', b6: '1:h', b9: '1:r' }, 1],
			[{ d1: '0:k', b3: '0:c', f10: '1:k', d6: '1:h', b9: '1:r' }, 1],
		])
		expect(outs(s, 'b3-b9')).toEqual(['miss 0.5 R', 'capture 0.5 R'])
		expect(show(play(V, s, 'b3-b9', 1))).toEqual(['1 Kd1 Cb9 kf10 hb6'])
		expect(show(play(V, s, 'b3-b9', 0))).toEqual(['1 Kd1 Cb3 kf10 hd6 rb9'])
		// pass = link: no roll, the cannon becomes a ghost linked to the horse
		expect(outs(s, 'b3-b8')).toEqual(['move 1'])
		const linked = play(V, s, 'b3-b8')
		expect(locs(linked, 'b8')).toBe('b3 0.5, b8 0.5')
		expect(budget(linked, 0)).toBe(2)
		expect(outs(s, 'b3-b6')).toEqual(['miss 0.5 R', 'move 0.5 R'])
		// a ghost that is a screen in every possibility (b5 or b6) makes the capture certain: no roll
		const both = S([
			[{ d1: '0:k', b3: '0:c', f10: '1:k', b5: '1:h', b9: '1:r' }, 1],
			[{ d1: '0:k', b3: '0:c', f10: '1:k', b6: '1:h', b9: '1:r' }, 1],
		])
		expect(outs(both, 'b3-b9')).toEqual(['capture 1'])
	})

	it('never lets a ghost be its own screen (Q2)', () => {
		const s = S([
			[{ d1: '0:k', b3: '0:c', f10: '1:k', b6: '1:h' }, 1],
			[{ d1: '0:k', b3: '0:c', f10: '1:k', b9: '1:h' }, 1],
		])
		expect(outs(s, 'b3-b9')).toBeNull()
		expect(outs(s, 'b3-b6')).toEqual(['miss 0.5 R', 'move 0.5 R'])
	})

	it('flies across a ghost blocker only where the file is open (Q3)', () => {
		const s = S([
			[{ d1: '0:k', d5: '0:r', a1: '0:r', d10: '1:k', i10: '1:r' }, 1],
			[{ d1: '0:k', h5: '0:r', a1: '0:r', d10: '1:k', i10: '1:r' }, 1],
		], 1)
		expect(royalDanger(V, s, 0)).toBe(0.5)
		expect(outs(s, 'd10-d1')).toEqual(['miss 0.5 R', 'capture 0.5 R'])
		expect(play(V, s, 'd10-d1', 1).result).toEqual({ winner: 1, reason: 'general' })
		// the miss settles the chariot on the file
		expect(show(play(V, s, 'd10-d1', 0))).toEqual(['1 Kd1 Rd5 Ra1 kd10 ri10'])
	})

	it('links a horse to a ghost on its leg, and a split half that is blocked stays home (Q4)', () => {
		const s = S([
			[{ d1: '0:k', e5: '0:h', f10: '1:k', e6: '1:r' }, 1],
			[{ d1: '0:k', e5: '0:h', f10: '1:k', a6: '1:r' }, 1],
		])
		expect(outs(s, 'e5-d7')).toEqual(['move 1'])
		expect(locs(play(V, s, 'e5-d7'), 'd7')).toBe('e5 0.5, d7 0.5')
		const split = play(V, s, 'e5-d7|f7')
		expect(locs(split, 'd7')).toBe('e5 0.5, d7 0.25, f7 0.25')
		expect(budget(split, 0)).toBe(3)
	})

	it('keeps soldiers and generals solid: a soldier step onto a ghost rolls (Q5, Q6)', () => {
		const s = S([
			[{ d1: '0:k', e6: '0:p', e5: '0:p', f10: '1:k', d6: '1:h' }, 1],
			[{ d1: '0:k', e6: '0:p', e5: '0:p', f10: '1:k', d8: '1:h' }, 1],
		])
		expect(outs(s, 'e6-d6')).toEqual(['move 0.5 R', 'capture 0.5 R'])
		expect(outs(s, 'e5-d5')).toBeNull()
		expect(splitsFrom(V, s, sq('e6'))).toEqual([])
		expect(splitsFrom(V, s, sq('d1'))).toEqual([])
		// the advisor splits inside the palace only
		const a = S([[{ e1: '0:k', e2: '0:a', f10: '1:k', a10: '1:r' }, 1]])
		expect(splitsFrom(V, a, sq('e2')).map((m) => m.code).sort())
			.toEqual(['e2-d1|d3', 'e2-d1|f1', 'e2-d1|f3', 'e2-d3|f3', 'e2-f1|d3', 'e2-f1|f3'])
		expect(splitsFrom(V, a, sq('e1'))).toEqual([])
	})

	it('splits an elephant on its own half; the half through a blocked eye stays home (Q7)', () => {
		const s = S([
			[{ d1: '0:k', e3: '0:e', f10: '1:k', d4: '1:h' }, 1],
			[{ d1: '0:k', e3: '0:e', f10: '1:k', i6: '1:h' }, 1],
		])
		const after = play(V, s, 'e3-c5|g5')
		expect(locs(after, 'g5')).toBe('e3 0.25, c5 0.25, g5 0.5')
		expect(budget(after, 0)).toBe(3)
		for (const m of splitsFrom(V, s, sq('e3'))) {
			expect(m.to.every((q) => ownHalf(0, q)), m.code).toBe(true)
		}
	})

	it('captures the general for certain with a converging merge (Q8)', () => {
		const s = S([
			[{ d1: '0:k', a9: '0:r', e9: '1:k' }, 1],
			[{ d1: '0:k', e5: '0:r', e9: '1:k' }, 1],
		])
		expect(outs(s, 'a9|e5-e9')).toEqual(['capture 1'])
		expect(play(V, s, 'a9|e5-e9').result).toEqual({ winner: 0, reason: 'general' })
		expect(outs(s, 'a9-e9')).toEqual(['miss 0.5 R', 'capture 0.5 R'])
		expect(royalDanger(V, s, 1)).toBe(1)
	})

	it('rolls whether the game ends when the last attacker is gone in some possibilities only (Q9)', () => {
		// the black horse was captured in the second world earlier: it keeps its id, off the board
		const s = S([
			[{ e2: '0:k', d1: '0:a', d9: '1:k', e3: '1:h', a8: '1:r' }, 1],
			[{ e2: '0:k', d1: '0:a', d9: '1:k', g8: '1:h', e3: '1:r' }, 1],
		], 0, (b) => {
			const id = b.board[sq('g8')]
			if (id >= 0) {
				placePiece(b, id, OFF)
			}
		})
		expect(outs(s, 'e2-e3')).toEqual([
			'capture 0.5 R [end:null]',
			'capture 0.5 R [end:{"winner":null,"reason":"noAttackers"}]',
		])
		expect(play(V, s, 'e2-e3', 0).result).toBeNull()
		expect(play(V, s, 'e2-e3', 1).result).toEqual({ winner: null, reason: 'noAttackers' })
	})

	it('rolls between the draw and facing generals when a ghost may block the file (Q10)', () => {
		const s = S([
			[{ d1: '0:k', e2: '0:a', e10: '1:k', e1: '1:p' }, 1],
			[{ d1: '0:k', f3: '0:a', e10: '1:k', e1: '1:p' }, 1],
		])
		expect(royalDanger(V, s, 0)).toBe(1)
		expect(outs(s, 'd1-e1')).toEqual([
			'capture 0.5 R [end:{"winner":null,"reason":"noAttackers"}]',
			'capture 0.5 R [end:null]',
		])
		const draw = play(V, s, 'd1-e1', 0)
		expect(show(draw)).toEqual(['1 Ke1 Ae2 ke10'])
		expect(draw.result).toEqual({ winner: null, reason: 'noAttackers' })
		const open = play(V, s, 'd1-e1', 1)
		expect(show(open)).toEqual(['1 Ke1 Af3 ke10'])
		expect([open.result, open.turn, royalDanger(V, open, 0)]).toEqual([null, 1, 1])
		expect(outs(open, 'e10-e1')).toEqual(['capture 1'])
		expect(play(V, open, 'e10-e1').result).toEqual({ winner: 1, reason: 'general' })
	})

	it('needs a screen for each part of a converging cannon capture (Q11)', () => {
		const a = S([
			[{ d1: '0:k', e5: '0:p', e3: '0:c', e8: '1:k', d8: '1:a' }, 1],
			[{ d1: '0:k', e5: '0:p', a8: '0:c', e8: '1:k', d8: '1:a' }, 1],
		])
		expect(mergesFrom(V, a, sq('e3')).map((m) => m.code).sort()).toEqual(['e3|a8-a3', 'e3|a8-e8'])
		expect(outs(a, 'e3|a8-e8')).toEqual(['capture 1'])
		expect(play(V, a, 'e3|a8-e8').result).toEqual({ winner: 0, reason: 'general' })
		expect(outs(a, 'e3-e8')).toEqual(['miss 0.5 R', 'capture 0.5 R'])
		expect(royalDanger(V, a, 1)).toBe(1)
		// a black horse ghost e6 / g6 is the only e-file screen
		const b = S([
			[{ d1: '0:k', e3: '0:c', e8: '1:k', d8: '1:a', e6: '1:h' }, 1],
			[{ d1: '0:k', e3: '0:c', e8: '1:k', d8: '1:a', g6: '1:h' }, 1],
			[{ d1: '0:k', a8: '0:c', e8: '1:k', d8: '1:a', e6: '1:h' }, 1],
			[{ d1: '0:k', a8: '0:c', e8: '1:k', d8: '1:a', g6: '1:h' }, 1],
		])
		expect([budget(b, 0), budget(b, 1)]).toEqual([2, 2])
		expect(outs(b, 'e3|a8-e8')).toEqual(['miss 0.25 R', 'capture 0.75 R'])
		expect(show(play(V, b, 'e3|a8-e8', 0))).toEqual(['1 Kd1 Ce3 ke8 ad8 hg6'])
		expect(outs(b, 'e3-e8')).toEqual(['miss 0.75 R', 'capture 0.25 R'])
		expect(outs(b, 'a8-e8')).toEqual(['miss 0.5 R', 'capture 0.5 R'])
		expect(royalDanger(V, b, 1)).toBe(0.75)
	})

	it('rolls a horse move with a ghost on its leg and a ghost on its target (Q12)', () => {
		const s = S([
			[{ d1: '0:k', e5: '0:h', f10: '1:k', e6: '1:r', d7: '1:h' }, 1],
			[{ d1: '0:k', e5: '0:h', f10: '1:k', e6: '1:r', b8: '1:h' }, 1],
			[{ d1: '0:k', e5: '0:h', f10: '1:k', a6: '1:r', d7: '1:h' }, 1],
			[{ d1: '0:k', e5: '0:h', f10: '1:k', a6: '1:r', b8: '1:h' }, 1],
		])
		expect(outs(s, 'e5-d7')).toEqual(['miss 0.5 R', 'move 0.25 R', 'capture 0.25 R'])
		expect(show(play(V, s, 'e5-d7', 1))).toEqual(['1 Kd1 Hd7 kf10 ra6 hb8'])
		expect(play(V, s, 'e5-d7', 0).worlds.every(({ b }) => b.board[sq('e6')] >= 0)).toBe(true)
		// the same leg towards a point that is certainly empty: pass = link
		expect(outs(s, 'e5-f7')).toEqual(['move 1'])
		expect(locs(play(V, s, 'e5-f7'), 'f7')).toBe('e5 0.5, f7 0.5')
	})
})

describe('xiangqi: the computer and random games', () => {
	it('values crossed soldiers and central horses', () => {
		expect(V.evaluate(newGame(V).worlds[0].b, 0)).toBe(0)
		const w = worldFrom(V, { d1: '0:k', e6: '0:p', f10: '1:k', a4: '1:p' }, {})
		expect(V.evaluate(w, 0)).toBe(0)
		const crossed = worldFrom(V, { d1: '0:k', e7: '0:p', f10: '1:k' }, {})
		expect(V.evaluate(crossed, 0)).toBe(120)
		expect(V.evaluate(crossed, 1)).toBe(-120)
		const horse = worldFrom(V, { d1: '0:k', e5: '0:h', f10: '1:k', a10: '1:h' }, {})
		expect(V.evaluate(horse, 0)).toBe(24 + 20)
	})

	it('takes a free chariot and flies to win (the spec\'s computer cases)', async () => {
		const free = S([[{ d1: '0:k', a1: '0:r', f10: '1:k', a7: '1:r', i10: '1:h' }, 1]])
		expect(await chooseMove(V, free, { level: 'normal', rng: () => 0.5, now: workClock() })).toBe('a1-a7')
		const fly = S([[{ d1: '0:k', a1: '0:r', d10: '1:k', a7: '1:r' }, 1]])
		expect(await chooseMove(V, fly, { level: 'easy', rng: () => 0.5, now: workClock() })).toBe('d1-d10')
	})

	it('makes a legal move from the start at every level within its time budget', async () => {
		for (const level of LEVELS) {
			const s = newGame(V)
			const elapsed = stopwatch()
			const code = await chooseMove(V, s, { level: level.id, rng: seededRng(3) })
			expect(elapsed()).toBeLessThan(level.timeMs + 500)
			expect(branches(V, s, code), level.id + ': ' + code).not.toBeNull()
		}
	}, 20000)

	it('keeps every piece on its points and both generals on the board in random games', () => {
		const allowed = {
			k: (side, q) => inPalace(side, q),
			a: (side, q) => inPalace(side, q),
			e: (side, q) => ownHalf(side, q),
			p: (side, q) => (side === 0 ? q >= sq('a4') : q <= sq('i7')),
		}
		let ended = 0
		for (let game = 0; game < 12; game++) {
			const rng = seededRng(500 + game)
			let s = newGame(V)
			for (let ply = 0; ply < 80 && !s.result; ply++) {
				const list = legalMoves(V, s, { splits: rng() < 0.3 })
				expect(list.length).toBeGreaterThan(0)
				s = applyMove(V, s, list[Math.floor(rng() * list.length)].code, rng).state
				expect(budget(s, 0)).toBeLessThanOrEqual(8)
				expect(budget(s, 1)).toBeLessThanOrEqual(8)
				for (const { b } of s.worlds) {
					b.sq.forEach((q, id) => {
						if (q >= 0 && allowed[b.ty[id]]) {
							expect(allowed[b.ty[id]](b.sd[id], q), b.ty[id] + nameOf(V, q)).toBe(true)
						}
					})
					const result = V.worldResult(b)
					if (!s.result) {
						// a running game has both generals in every possibility
						expect(result).toBeNull()
					} else if (['general', 'noAttackers'].includes(s.result.reason)) {
						expect(result).toEqual(s.result)
					}
				}
			}
			if (s.result) {
				ended++
			}
		}
		expect(ended).toBeGreaterThan(0)
	}, 60000)
})
