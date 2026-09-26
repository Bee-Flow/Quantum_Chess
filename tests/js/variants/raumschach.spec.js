/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Raumschach (5 × 5 × 5): the cube and its drawing, the start array, the movement of every piece, the pawn's five
 * capture directions and its orientation for Black, promotion, the classic end rules of the core (capture the king,
 * the king that cannot escape, the bare-kings draw, draws that wait), the quantum rules on 3D lines and the computer
 * player. The cases R1-R11 and RQ1-RQ13 are those of handoff/research/raumschach.md, section 7.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { rollMemoKey } from '../../../src/variantplay/rolls.js'
import { sharedRules } from '../../../src/variantplay/texts.js'
import { aiSplits, chooseMove, LEVELS } from '../../../src/variants/core/ai.js'
import {
	applyMove,
	applyOutcome,
	budget,
	legalMoves,
	newGame,
	outcomes,
	royalDanger,
	splitsFrom,
	splitTargets,
	squareView,
	T,
	worldResult,
} from '../../../src/variants/core/quantum.js'
import { applyClassical, generate, worldFrom } from '../../../src/variants/core/world.js'
import V from '../../../src/variants/raumschach.js'
import { play, stateOf, stopwatch, workClock } from './helpers.js'

/** The default kings of the spec's test positions. */
const KINGS = { Ae3: '0:k', Ee3: '1:k' }
const PROMOTIONS = ['q', 'r', 'b', 'n', 'u']

/**
 * The square index of a cell name.
 *
 * @param {string} name cell name
 * @return {number}
 */
function sq(name) {
	return V.topology.byName(name)
}

/**
 * The name of a square index.
 *
 * @param {number} s square index
 * @return {string}
 */
function nameOf(s) {
	return V.topology.names[s]
}

/**
 * A one-world state with the default kings added.
 *
 * @param {Record<string, string>} placement pieces besides the kings
 * @param {number} [turn] side to move
 * @return {object}
 */
function position(placement, turn = 0) {
	return stateOf(V, [[{ ...KINGS, ...placement }, 1]], turn)
}

/**
 * The sorted codes of the ordinary legal moves from a cell.
 *
 * @param {object} s state
 * @param {string} from cell name
 * @return {string[]}
 */
function movesFrom(s, from) {
	return legalMoves(V, s)
		.filter((m) => m.type === 'move' && m.from === sq(from))
		.map((m) => m.code)
		.sort()
}

/**
 * The sorted target cells of the ordinary legal moves from a cell.
 *
 * @param {object} s state
 * @param {string} from cell name
 * @return {string[]}
 */
function targetsFrom(s, from) {
	return [...new Set(legalMoves(V, s)
		.filter((m) => m.type === 'move' && m.from === sq(from))
		.map((m) => nameOf(m.to)))].sort()
}

/**
 * The outcomes of a move as `[key, p]` pairs in the core's order, with an `R` after the key when it is rolled.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {Array<[string, number]>|null}
 */
function odds(s, code) {
	const list = outcomes(V, s, code)
	return list ? list.map((o) => [o.key + (o.rolled ? 'R' : ''), o.p]) : null
}

/**
 * Who may stand on a cell, as `side + type + ' ' + p` strings (most likely first).
 *
 * @param {object} s state
 * @param {string} name cell name
 * @return {string[]}
 */
function on(s, name) {
	return squareView(s, sq(name)).map((o) => o.side + o.type + ' ' + o.p)
}

/**
 * The cells a lone piece of a type reaches on an otherwise empty board, from a start cell and all cells reached.
 *
 * @param {string} type piece type
 * @param {string} from start cell
 * @return {Set<string>}
 */
function reach(type, from) {
	const seen = new Set([sq(from)])
	const todo = [sq(from)]
	while (todo.length) {
		const s = todo.pop()
		const w = worldFrom(V, { [nameOf(s)]: '0:' + type })
		for (const m of generate(V, w, 0).values()) {
			if (!seen.has(m.to)) {
				seen.add(m.to)
				todo.push(m.to)
			}
		}
	}
	return new Set([...seen].map(nameOf))
}

describe('Raumschach: the cube, its drawing and the start array', () => {
	it('has 125 cells named level, file, rank, dark where x + y + z is even', () => {
		expect(V.id).toBe('raumschach')
		expect(V.category).toBe('dimensions')
		expect(V.topology.size).toBe(125)
		expect([nameOf(0), nameOf(62), nameOf(124)]).toEqual(['Aa1', 'Cc3', 'Ee5'])
		expect(V.topology.coords[sq('Bd4')]).toEqual([3, 3, 1])
		for (const name of V.topology.names) {
			expect(name).toMatch(/^[A-E][a-e][1-5]$/)
		}
		const cell = (name) => V.topology.cells[sq(name)]
		expect([cell('Aa1').shade, cell('Ab1').shade, cell('Ba1').shade, cell('Cc3').shade]).toEqual([
			'dark',
			'light',
			'light',
			'dark',
		])
		expect(V.topology.cells.filter((c) => c.shade === 'dark')).toHaveLength(63)
	})

	it('draws the levels as a grid of five boards labelled A to E, White\'s home at the bottom', () => {
		const { boards, labels, width, height, zoomable } = V.topology.layout
		expect(boards.map((b) => b.label)).toEqual(['A', 'B', 'C', 'D', 'E'])
		expect(zoomable).toBe(true)
		const inside = (c, b) => c.x >= b.x && c.x + c.w <= b.x + b.w && c.y >= b.y && c.y + c.h <= b.y + b.h
		V.topology.coords.forEach(([, , z], s) => {
			const c = V.topology.cells[s]
			expect(inside(c, boards[z])).toBe(true)
			expect(c.x + c.w <= width && c.y + c.h <= height).toBe(true)
		})
		// A and B at the bottom, C and D above them, E on top; rank 5 at the top of each board
		const y = (name) => V.topology.cells[sq(name)].y
		expect(y('Aa1')).toBe(y('Ba1'))
		expect(y('Aa1')).toBeGreaterThan(y('Ca1'))
		expect(y('Ca1')).toBeGreaterThan(y('Ea1'))
		expect(y('Aa1')).toBeGreaterThan(y('Aa5'))
		expect(V.topology.cells[sq('Ba1')].x).toBeGreaterThan(V.topology.cells[sq('Ae1')].x)
		// every file letter lies inside its board's frame, under the cells: in Black's turned view the frame's label
		// (drawn above the frame) cannot meet the letters, which the turn puts above the cells
		const letters = labels.filter((l) => /^[a-e]$/.test(l.text))
		expect(letters).toHaveLength(25)
		for (const l of letters) {
			const b = boards.find((bd) => l.x > bd.x && l.x < bd.x + bd.w && l.y > bd.y + 5 && l.y < bd.y + bd.h)
			expect(b, l.text).toBeDefined()
		}
		expect(labels.filter((l) => /^[1-5]$/.test(l.text))).toHaveLength(25)
		// as VariantBoard.vue draws them (fonts 0.32 and 0.36, frames 0.06 wider, the level label 0.22 above the turned
		// frame, 0.7 of padding): no level label meets a frame or another label, in White's view or Black's
		const overlap = (a, b) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2
		for (const turned of [false, true]) {
			const at = (x, y) => (turned ? [width - x, height - y] : [x, y])
			const frames = boards.map((b) => {
				const [x1, y1] = at(b.x, b.y)
				const [x2, y2] = at(b.x + b.w, b.y + b.h)
				const [left, right] = [Math.min(x1, x2), Math.max(x1, x2)]
				const [top, bottom] = [Math.min(y1, y2), Math.max(y1, y2)]
				return { x1: left - 0.06, x2: right + 0.06, y1: top - 0.06, y2: bottom + 0.06 }
			})
			const texts = labels.map((l) => {
				const [x, y] = at(l.x, l.y)
				return { x1: x - 0.1, x2: x + 0.1, y1: y - 0.16, y2: y + 0.16 }
			})
			for (const f of frames) {
				const x = (f.x1 + f.x2) / 2
				const base = f.y1 + 0.06 - 0.22
				const caption = { x1: x - 0.11, x2: x + 0.11, y1: base - 0.27, y2: base }
				expect(frames.some((g) => overlap(caption, g)), 'frame, turned ' + turned).toBe(false)
				expect(texts.some((l) => overlap(caption, l)), 'label, turned ' + turned).toBe(false)
				expect(caption.y1 > -0.7 && caption.x1 > -0.7 && caption.x2 < width + 0.7).toBe(true)
			}
		}
	})

	it('starts with the 40 pieces of the IRF array, Black turned through the centre of the cube', () => {
		const b = newGame(V).worlds[0].b
		const placed = {}
		b.sq.forEach((s, id) => {
			placed[nameOf(s)] = b.sd[id] + ':' + b.ty[id]
		})
		const expected = {
			Aa1: '0:r',
			Ab1: '0:n',
			Ac1: '0:k',
			Ad1: '0:n',
			Ae1: '0:r',
			Ba1: '0:b',
			Bb1: '0:u',
			Bc1: '0:q',
			Bd1: '0:b',
			Be1: '0:u',
			Ea5: '1:r',
			Eb5: '1:n',
			Ec5: '1:k',
			Ed5: '1:n',
			Ee5: '1:r',
			Da5: '1:u',
			Db5: '1:b',
			Dc5: '1:q',
			Dd5: '1:u',
			De5: '1:b',
		}
		for (const f of 'abcde') {
			Object.assign(expected, { ['A' + f + '2']: '0:p', ['B' + f + '2']: '0:p' })
			Object.assign(expected, { ['D' + f + '4']: '1:p', ['E' + f + '4']: '1:p' })
		}
		expect(placed).toEqual(expected)
		expect(Object.keys(placed)).toHaveLength(40)
		expect(b.x).toEqual({})
		// one bishop of each colour per side
		const shade = (name) => V.topology.cells[sq(name)].shade
		expect([shade('Ba1'), shade('Bd1'), shade('Db5'), shade('De5')]).toEqual(['light', 'dark', 'dark', 'light'])
	})

	it('declares every piece with a name, a glyph and a value, and a rules card of 7 sentences', () => {
		expect(Object.keys(V.types).sort()).toEqual(['b', 'k', 'n', 'p', 'q', 'r', 'u'])
		for (const [id, type] of Object.entries(V.types)) {
			expect(type.name().length, id).toBeGreaterThan(0)
			expect(type.glyph, id).toBeDefined()
		}
		// the unicorn is a knight with a horn
		expect(V.types.u.glyph).toEqual({ sprite: 'n', horn: true })
		expect([...V.solidTypes].sort()).toEqual(['k', 'p'])
		expect(Object.keys(V.types).filter((id) => V.types[id].splittable).sort()).toEqual(['b', 'n', 'q', 'r', 'u'])
		// the IRF's order: Q > B > N > R > U > P
		const v = (id) => V.types[id].value
		expect(v('q') > v('b') && v('b') > v('n') && v('n') > v('r') && v('r') > v('u') && v('u') > v('p')).toBe(true)
		const rules = V.rules()
		expect(rules).toHaveLength(7)
		for (const r of rules) {
			expect(typeof r).toBe('string')
		}
	})

	it('uses the core\'s classic end rules and leaves castling out of the shared card (LEAD-DECISIONS L1, L2)', () => {
		expect([V.escapeRule, V.bareKingsDraw, V.drawsWait]).toEqual([true, true, true])
		// the bare-kings draw is the core's, not a copy in the variant
		expect(V.worldResult).toBeUndefined()
		// no castling and no en passant, so the shared card does not contradict "There is no castling, ..."
		expect(V.specialMoves).toBe(false)
		const shared = sharedRules(V)
		expect(shared.some((r) => /Castling/.test(r))).toBe(false)
		expect(V.rules().some((r) => /no castling, no double step and no en passant/.test(r))).toBe(true)
		// the shared card explains the escape rule; the variant card must not deny it
		expect(shared.some((r) => /cannot escape/.test(r))).toBe(true)
		expect(V.rules().some((r) => /checkmate|only by capturing/.test(r))).toBe(false)
	})
})

describe('Raumschach: movement', () => {
	it('gives each side 61 moves at the start; perft 2 = 3,735 and perft 3 = 253,705 (R1)', () => {
		const s = newGame(V)
		const b = s.worlds[0].b
		const byType = {}
		for (const m of legalMoves(V, s)) {
			const type = b.ty[b.board[m.from]]
			byType[type] = (byType[type] ?? 0) + 1
		}
		expect(byType).toEqual({ p: 15, q: 14, b: 13, n: 12, u: 7 })
		expect(legalMoves(V, { ...s, turn: 1 })).toHaveLength(61)
		let perft2 = 0
		let perft3 = 0
		for (const m of generate(V, b, 0).values()) {
			const w1 = applyClassical(V, b, m)
			const replies = generate(V, w1, 1)
			perft2 += replies.size
			for (const r of replies.values()) {
				perft3 += generate(V, applyClassical(V, w1, r), 0).size
			}
		}
		expect([perft2, perft3]).toEqual([3735, 253705])
	})

	it('has the moves of the start array (R2)', () => {
		const s = newGame(V)
		expect(movesFrom(s, 'Ac2')).toEqual(['Ac2-Ac3'])
		expect(movesFrom(s, 'Bc2')).toEqual(['Bc2-Bc3', 'Bc2-Cc2'])
		expect(movesFrom(s, 'Bd2')).toEqual(['Bd2-Bd3', 'Bd2-Cd2'])
		expect(targetsFrom(s, 'Ab1')).toEqual(['Aa3', 'Ac3', 'Bb3', 'Ca1', 'Cb2', 'Cc1'])
		expect(targetsFrom(s, 'Bb1')).toEqual(['Ca2', 'Cc2', 'Dd3', 'Ee4'])
		expect(targetsFrom(s, 'Be1')).toEqual(['Cd2', 'Dc3', 'Eb4'])
		for (const from of ['Ac1', 'Aa1', 'Ae1']) {
			expect(movesFrom(s, from), from).toEqual([])
		}
		const black = { ...s, turn: 1 }
		expect(targetsFrom(black, 'Dd5')).toEqual(['Aa2', 'Bb3', 'Cc4', 'Ce4'])
		// the captures of the unicorns
		const b = s.worlds[0].b
		expect(generate(V, b, 0).get('Bb1-Ee4').capture).toBe(b.board[sq('Ee4')])
		expect(generate(V, b, 1).get('Dd5-Aa2').capture).toBe(b.board[sq('Aa2')])
	})

	it('moves knights and unicorns through the cube (R3, R4)', () => {
		expect(targetsFrom(position({ Aa1: '0:n' }), 'Aa1')).toEqual(['Ab3', 'Ac2', 'Ba3', 'Bc1', 'Ca2', 'Cb1'])
		expect(movesFrom(position({ Cc3: '0:n' }), 'Cc3')).toHaveLength(24)
		const u = position({ Cc3: '0:u' })
		expect(targetsFrom(u, 'Cc3')).toEqual([
			'Aa1',
			'Aa5',
			'Ae1',
			'Ae5',
			'Bb2',
			'Bb4',
			'Bd2',
			'Bd4',
			'Db2',
			'Db4',
			'Dd2',
			'Dd4',
			'Ea1',
			'Ea5',
			'Ee1',
			'Ee5',
		])
		for (const code of ['Cc3-Cc4', 'Cc3-Cd4', 'Cc3-Dc4']) {
			expect(outcomes(V, u, code), code).toBeNull()
		}
	})

	it('moves bishops, rooks, queens and kings along 12, 6 and 26 directions (R5)', () => {
		expect(targetsFrom(position({ Aa1: '0:b' }), 'Aa1')).toEqual([
			'Ab2',
			'Ac3',
			'Ad4',
			'Ae5',
			'Ba2',
			'Bb1',
			'Ca3',
			'Cc1',
			'Da4',
			'Dd1',
			'Ea5',
			'Ee1',
		])
		expect(targetsFrom(position({ Dc4: '0:b' }), 'Dc4')).toEqual([
			'Ac1',
			'Ba4',
			'Bc2',
			'Be4',
			'Cb4',
			'Cc3',
			'Cc5',
			'Cd4',
			'Da2',
			'Db3',
			'Db5',
			'Dd3',
			'Dd5',
			'De2',
			'Eb4',
			'Ec3',
			'Ec5',
			'Ed4',
		])
		expect(targetsFrom(position({ Aa1: '0:r' }), 'Aa1')).toEqual([
			'Aa2',
			'Aa3',
			'Aa4',
			'Aa5',
			'Ab1',
			'Ac1',
			'Ad1',
			'Ae1',
			'Ba1',
			'Ca1',
			'Da1',
			'Ea1',
		])
		expect(movesFrom(position({ Aa1: '0:q' }), 'Aa1')).toHaveLength(28)
		// the line Cc3-Bd3-Ae3 ends on White's own king, the line Cc3-Dd3-Ee3 captures Black's
		const q = position({ Cc3: '0:q' })
		expect(movesFrom(q, 'Cc3')).toHaveLength(51)
		expect(movesFrom(q, 'Cc3')).toContain('Cc3-Ee3')
		expect(generate(V, worldFrom(V, { Cc3: '0:q' }), 0).size).toBe(52)
		expect(movesFrom(stateOf(V, [[{ Cc3: '0:k', Ee3: '1:k' }, 1]]), 'Cc3')).toHaveLength(26)
	})

	it('moves pawns forward or up and captures in five directions, for Black down and towards rank 1 (R6)', () => {
		const white = position({ Cc3: '0:p', Cb4: '1:n', Cd4: '1:n', Db3: '1:n', Dd3: '1:n', Dc4: '1:n' })
		expect(targetsFrom(white, 'Cc3')).toEqual(['Cb4', 'Cc4', 'Cd4', 'Db3', 'Dc3', 'Dc4', 'Dd3'])
		expect(movesFrom(white, 'Cc3')).toHaveLength(7)
		const black = position({ Cc3: '1:p', Cb2: '0:n', Cd2: '0:n', Bb3: '0:n', Bd3: '0:n', Bc2: '0:n' }, 1)
		expect(targetsFrom(black, 'Cc3')).toEqual(['Bb3', 'Bc2', 'Bc3', 'Bd3', 'Cb2', 'Cc2', 'Cd2'])
		expect(V.orient(1, [0, 1, 1])).toEqual([0, -1, -1])
	})

	it('never lets a pawn capture straight ahead, straight up or backwards, nor step twice (R7)', () => {
		expect(movesFrom(position({ Ac2: '0:p', Ac3: '1:n', Bc2: '1:n', Bc1: '1:n' }), 'Ac2')).toEqual([])
		const alone = position({ Ac2: '0:p' })
		expect(movesFrom(alone, 'Ac2')).toEqual(['Ac2-Ac3', 'Ac2-Bc2'])
		expect(outcomes(V, alone, 'Ac2-Ac4')).toBeNull()
	})

	it('promotes on rank 5 of level E (White) and rank 1 of level A (Black), unicorn included (R8)', () => {
		const top = position({ Dc5: '0:p' })
		expect(movesFrom(top, 'Dc5')).toEqual(PROMOTIONS.map((p) => 'Dc5-Ec5=' + p).sort())
		expect(outcomes(V, top, 'Dc5-Ec5')).toBeNull()
		expect(movesFrom(position({ Cc5: '0:p' }), 'Cc5')).toEqual(['Cc5-Dc5'])
		expect(movesFrom(position({ Dd4: '0:p', Ed5: '1:n' }), 'Dd4')).toEqual([
			...PROMOTIONS.map((p) => 'Dd4-Ed5=' + p),
			'Dd4-Ed4',
			'Dd4-Dd5',
		].sort())
		const last = position({ Ec4: '0:p' })
		expect(outcomes(V, last, 'Ec4-Ec5=k')).toBeNull()
		expect(play(V, last, 'Ec4-Ec5=u').worlds[0].b.ty[last.worlds[0].b.board[sq('Ec4')]]).toBe('u')
		expect(movesFrom(position({ Ba2: '1:p' }, 1), 'Ba2')).toEqual(['Ba2-Aa2', 'Ba2-Ba1'])
		expect(movesFrom(position({ Ab2: '1:p' }, 1), 'Ab2')).toEqual(PROMOTIONS.map((p) => 'Ab2-Ab1=' + p).sort())
		// Black's "up" is down a level: from rank 1 of level B its only moves are the promotions on Ab1
		expect(movesFrom(position({ Bb1: '1:p' }, 1), 'Bb1')).toEqual(PROMOTIONS.map((p) => 'Bb1-Ab1=' + p).sort())
	})

	it('has no castling, and bishops and unicorns keep their colour and class (R9, R10)', () => {
		const s = stateOf(V, [[{ Ac1: '0:k', Aa1: '0:r', Ae1: '0:r', Ee3: '1:k' }, 1]])
		expect(targetsFrom(s, 'Ac1')).toEqual([
			'Ab1',
			'Ab2',
			'Ac2',
			'Ad1',
			'Ad2',
			'Bb1',
			'Bb2',
			'Bc1',
			'Bc2',
			'Bd1',
			'Bd2',
		])
		expect(legalMoves(V, s).filter((m) => m.kind !== 'normal')).toEqual([])
		const light = reach('b', 'Ba1')
		expect(light.size).toBe(62)
		for (const name of light) {
			expect(V.topology.cells[sq(name)].shade, name).toBe('light')
		}
		expect(reach('b', 'Bd1').has('Ba1')).toBe(false)
		const b1 = reach('u', 'Bb1')
		expect(b1.size).toBe(30)
		expect(b1.has('Be1')).toBe(false)
		expect(reach('u', 'Aa1').size).toBe(35)
	})
})

describe('Raumschach: how the game ends', () => {
	it('draws when only two kings that do not touch are left, and plays on while they touch (R11)', () => {
		const drawn = play(V, stateOf(V, [[{ Cc3: '0:k', Ee5: '1:k', Dc3: '1:n' }, 1]]), 'Cc3-Dc3')
		expect(drawn.result).toEqual({ winner: null, reason: 'bareKings' })
		expect(legalMoves(V, drawn)).toEqual([])
		let s = play(V, stateOf(V, [[{ Cc3: '0:k', Ed4: '1:k', Dc3: '1:n' }, 1]]), 'Cc3-Dc3')
		expect(s.result).toBeNull()
		expect(s.turn).toBe(1)
		s = play(V, s, 'Ed4-Dc3')
		expect(s.result).toEqual({ winner: 1, reason: 'king' })
		const pawn = play(V, stateOf(V, [[{ Cc3: '0:k', Ee5: '1:k', Dc3: '1:n', Aa2: '0:p' }, 1]]), 'Cc3-Dc3')
		expect(pawn.result).toBeNull()
	})

	it('is won by capturing the king, also into danger, and drawn by the quiet rule', () => {
		const s = play(V, position({ Cc3: '0:q' }), 'Cc3-Ee3')
		expect(s.result).toEqual({ winner: 0, reason: 'king' })
		// a king may step next to the enemy king: there is no check rule
		const step = play(V, stateOf(V, [[{ Cc3: '0:k', Ee3: '1:k' }, 1]]), 'Cc3-Dd3')
		expect(step.result).toBeNull()
		expect(play(V, step, 'Ee3-Dd3').result).toEqual({ winner: 1, reason: 'king' })
		const quiet = { ...position({ Cc3: '0:n' }), quiet: 99 }
		expect(play(V, quiet, 'Cc3-Ca4').result).toEqual({ winner: null, reason: 'quiet' })
		expect(play(V, { ...position({ Cc3: '0:p' }), quiet: 99 }, 'Cc3-Cc4').result).toBeNull()
	})

	it('waits with the quiet draw while the player to move can capture a king for certain', () => {
		// the Black rook on Ec3 takes the White king on Cc3 down the column: the draw waits and Black wins
		const s = { ...stateOf(V, [[{ Cc3: '0:k', Aa1: '0:n', Ee5: '1:k', Ec3: '1:r' }, 1]]), quiet: 99 }
		const waited = play(V, s, 'Aa1-Ab3')
		expect([waited.result, waited.quiet, waited.turn]).toEqual([null, 100, 1])
		expect(play(V, waited, 'Ec3-Cc3').result).toEqual({ winner: 1, reason: 'king' })
	})

	it('is won at once when the enemy king cannot escape, a 3D checkmate', () => {
		// the queen on Dd4, guarded by the king on Cc3, covers Ee5 and all 7 cells around it
		const mate = play(V, stateOf(V, [[{ Cc3: '0:k', Ad4: '0:q', Ee5: '1:k' }, 1]]), 'Ad4-Dd4')
		expect([mate.result, mate.turn]).toEqual([{ winner: 0, reason: 'cannotEscape' }, 1])
		expect(royalDanger(V, { ...mate, result: null }, 1)).toBe(1)
		// a Black rook on Dd1 can take the queen up the rank: the game goes on
		const escape = play(V, stateOf(V, [[{ Cc3: '0:k', Ad4: '0:q', Ee5: '1:k', Dd1: '1:r' }, 1]]), 'Ad4-Dd4')
		expect(escape.result).toBeNull()
		expect(play(V, escape, 'Dd1-Dd4').result).toBeNull()
		// the queen from Bd2, the knight on Bd3 guarding Dd4 (the verifiers' second position)
		const s0 = stateOf(V, [[{ Ee5: '1:k', Bd2: '0:q', Bd3: '0:n', Ae1: '0:k', Aa5: '1:r' }, 1]])
		expect(play(V, s0, 'Bd2-Dd4').result).toEqual({ winner: 0, reason: 'cannotEscape' })
	})

	it('is won at once by a 3D stalemate too, which the IRF scores as a draw (LEAD-DECISIONS L1)', () => {
		// the queen on Ed3 and the king on Cd4 cover the 7 cells around Ee5 without attacking the king itself
		const s = play(V, stateOf(V, [[{ Cd4: '0:k', Ad3: '0:q', Ee5: '1:k' }, 1]]), 'Ad3-Ed3')
		expect(s.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		const open = { ...s, result: null }
		expect([royalDanger(V, open, 1), legalMoves(V, open).length]).toEqual([0, 7])
	})
})

describe('Raumschach: quantum rules on 3D lines', () => {
	it('links a rook sliding up a column past a ghost (RQ1)', () => {
		const s = stateOf(V, [
			[{ ...KINGS, Aa1: '0:r', Ca1: '1:n' }, 1],
			[{ ...KINGS, Aa1: '0:r', Ce4: '1:n' }, 1],
		])
		expect(odds(s, 'Aa1-Ea1')).toEqual([['move', 1]])
		const after = play(V, s, 'Aa1-Ea1')
		expect(on(after, 'Aa1')).toEqual(['0r 0.5'])
		expect(on(after, 'Ea1')).toEqual(['0r 0.5'])
		for (const { b } of after.worlds) {
			expect(b.board[sq('Aa1')] >= 0).toBe(b.board[sq('Ca1')] >= 0)
		}
		expect(budget(after, 0)).toBe(2)
	})

	it('splits unicorns across levels until the budget of 8 is full (RQ2)', () => {
		let s = newGame(V)
		expect(odds(s, 'Bb1-Ca2|Cc2')).toEqual([['split', 1]])
		s = play(V, s, 'Bb1-Ca2|Cc2')
		expect(budget(s, 0)).toBe(2)
		s = play(V, s, 'Ea4-Ea3')
		// the merges of the unicorn: both parts reach Db3, Db1, Bb3 and Bb1
		const merges = legalMoves(V, s).filter((m) => m.type === 'merge')
		expect(merges.map((m) => m.code).sort()).toEqual(['Ca2|Cc2-Bb1', 'Ca2|Cc2-Bb3', 'Ca2|Cc2-Db1', 'Ca2|Cc2-Db3'])
		s = play(V, s, 'Be1-Cd2|Dc3')
		expect(budget(s, 0)).toBe(4)
		s = play(V, s, 'Eb4-Eb3')
		expect(outcomes(V, s, 'Bd1-Cd2|Ce1')).toBeNull()
		s = play(V, s, 'Bd1-Ce1|Db1')
		expect(budget(s, 0)).toBe(8)
		expect(s.worlds).toHaveLength(8)
		s = play(V, s, 'Ec4-Ec3')
		expect(outcomes(V, s, 'Bc1-Cc1|Dc1')).toBeNull()
		expect(splitsFrom(V, s, sq('Bc1'))).toEqual([])
	})

	it('rolls a pawn push onto a ghost, even onto its own side\'s ghost (RQ3)', () => {
		const s = { ...stateOf(V, [
			[{ ...KINGS, Bc2: '0:p', Bc3: '1:n' }, 1],
			[{ ...KINGS, Bc2: '0:p', Cc2: '1:n' }, 1],
		]), quiet: 40 }
		expect(odds(s, 'Bc2-Cc2')).toEqual([['missR', 0.5], ['moveR', 0.5]])
		const missed = applyOutcome(V, s, 'Bc2-Cc2', 0)
		expect(on(missed, 'Bc2')).toEqual(['0p 1'])
		expect(on(missed, 'Cc2')).toEqual(['1n 1'])
		expect(missed.quiet).toBe(41)
		const moved = applyOutcome(V, s, 'Bc2-Cc2', 1)
		expect(on(moved, 'Cc2')).toEqual(['0p 1'])
		expect(on(moved, 'Bc3')).toEqual(['1n 1'])
		expect(moved.quiet).toBe(0)
		expect(odds(s, 'Bc2-Bc3')).toEqual([['missR', 0.5], ['moveR', 0.5]])
		const own = stateOf(V, [
			[{ ...KINGS, Bc2: '0:p', Cc2: '0:u' }, 1],
			[{ ...KINGS, Bc2: '0:p', Aa4: '0:u' }, 1],
		])
		expect(budget(own, 0)).toBe(2)
		expect(odds(own, 'Bc2-Cc2')).toEqual([['missR', 0.5], ['moveR', 0.5]])
		const blocked = applyOutcome(V, own, 'Bc2-Cc2', 0)
		expect(on(blocked, 'Cc2')).toEqual(['0u 1'])
		expect(budget(blocked, 0)).toBe(1)
		const pushed = applyOutcome(V, own, 'Bc2-Cc2', 1)
		expect(on(pushed, 'Cc2')).toEqual(['0p 1'])
		expect(on(pushed, 'Aa4')).toEqual(['0u 1'])
		expect(budget(pushed, 0)).toBe(1)
	})

	it('rolls the forward-and-up pawn capture onto a ghost (RQ4)', () => {
		const s = stateOf(V, [
			[{ ...KINGS, Bc2: '0:p', Cc3: '1:b' }, 1],
			[{ ...KINGS, Bc2: '0:p', Ce5: '1:b' }, 1],
		])
		expect(odds(s, 'Bc2-Cc3')).toEqual([['missR', 0.5], ['captureR', 0.5]])
		const missed = applyOutcome(V, s, 'Bc2-Cc3', 0)
		expect(on(missed, 'Bc2')).toEqual(['0p 1'])
		expect(on(missed, 'Ce5')).toEqual(['1b 1'])
		const captured = applyOutcome(V, s, 'Bc2-Cc3', 1)
		expect(on(captured, 'Cc3')).toEqual(['0p 1'])
		expect(captured.worlds).toHaveLength(1)
		expect(captured.worlds[0].b.sq.filter((x, id) => x >= 0 && captured.worlds[0].b.ty[id] === 'b')).toEqual([])
	})

	it('promotes only in the worlds where the pawn arrives (RQ5)', () => {
		const s = stateOf(V, [
			[{ ...KINGS, Dc5: '0:p', Ec5: '1:n' }, 1],
			[{ ...KINGS, Dc5: '0:p', Eb3: '1:n' }, 1],
		])
		expect(outcomes(V, s, 'Dc5-Ec5')).toBeNull()
		expect(odds(s, 'Dc5-Ec5=u')).toEqual([['missR', 0.5], ['moveR', 0.5]])
		const moved = applyOutcome(V, s, 'Dc5-Ec5=u', 1)
		expect(on(moved, 'Ec5')).toEqual(['0u 1'])
		expect(on(moved, 'Eb3')).toEqual(['1n 1'])
		const missed = applyOutcome(V, s, 'Dc5-Ec5=u', 0)
		expect(on(missed, 'Dc5')).toEqual(['0p 1'])
		expect(on(missed, 'Ec5')).toEqual(['1n 1'])
		// undo and another choice, the unicorn included, replays the same roll (LEAD-DECISIONS L3)
		for (const p of PROMOTIONS) {
			expect(rollMemoKey(s, 'Dc5-Ec5=' + p)).toBe(rollMemoKey(s, 'Dc5-Ec5'))
		}
	})

	it('captures for certain by a merge along two 3D diagonals, and rolls when one lane may be blocked (RQ6)', () => {
		const queen = (q, extra = {}) => ({ ...KINGS, [q]: '0:q', Cc1: '1:r', ...extra })
		const s = stateOf(V, [[queen('Aa1'), 1], [queen('Ee1'), 1]])
		expect(odds(s, 'Aa1|Ee1-Cc1')).toEqual([['capture', 1]])
		const after = play(V, s, 'Aa1|Ee1-Cc1')
		expect(after.worlds).toHaveLength(1)
		expect(on(after, 'Cc1')).toEqual(['0q 1'])
		const blocked = stateOf(V, [
			[queen('Aa1', { Bb1: '1:n' }), 1],
			[queen('Aa1', { Ab3: '1:n' }), 1],
			[queen('Ee1', { Bb1: '1:n' }), 1],
			[queen('Ee1', { Ab3: '1:n' }), 1],
		])
		expect(odds(blocked, 'Aa1|Ee1-Cc1')).toEqual([['missR', 0.25], ['captureR', 0.75]])
		const missed = applyOutcome(V, blocked, 'Aa1|Ee1-Cc1', 0)
		expect([on(missed, 'Aa1'), on(missed, 'Bb1'), on(missed, 'Cc1')]).toEqual([['0q 1'], ['1n 1'], ['1r 1']])
	})

	it('lets Black promote by capturing a ghost forward and down (RQ7)', () => {
		const s = stateOf(V, [
			[{ ...KINGS, Bb2: '1:p', Ab1: '0:n' }, 1],
			[{ ...KINGS, Bb2: '1:p', Cc3: '0:n' }, 1],
		], 1)
		expect(movesFrom(s, 'Bb2')).toEqual([...PROMOTIONS.map((p) => 'Bb2-Ab1=' + p), 'Bb2-Ab2', 'Bb2-Bb1'].sort())
		expect(outcomes(V, s, 'Bb2-Ab1')).toBeNull()
		expect(odds(s, 'Bb2-Ab1=q')).toEqual([['missR', 0.5], ['captureR', 0.5]])
		const captured = applyOutcome(V, s, 'Bb2-Ab1=q', 1)
		expect(on(captured, 'Ab1')).toEqual(['1q 1'])
		expect(captured.worlds[0].b.ty.filter((ty, id) => ty === 'p' && captured.worlds[0].b.sq[id] >= 0)).toEqual([])
		expect(captured.turn).toBe(0)
		const missed = applyOutcome(V, s, 'Bb2-Ab1=q', 0)
		expect([on(missed, 'Bb2'), on(missed, 'Cc3')]).toEqual([['1p 1'], ['0n 1']])
	})

	it('splits along one unicorn line, the far half staying home where a ghost blocks it (RQ8)', () => {
		const s = stateOf(V, [
			[{ ...KINGS, Bb1: '0:u', Cc2: '1:n' }, 1],
			[{ ...KINGS, Bb1: '0:u', Ea5: '1:n' }, 1],
		])
		expect(splitTargets(V, s, sq('Bb1')).map(nameOf).sort()).toEqual(['Aa2', 'Ac2', 'Ca2', 'Dd3', 'Ee4'])
		expect(odds(s, 'Bb1-Ca2|Dd3')).toEqual([['split', 1]])
		const after = play(V, s, 'Bb1-Ca2|Dd3')
		expect([on(after, 'Bb1'), on(after, 'Ca2'), on(after, 'Dd3')]).toEqual([['0u 0.25'], ['0u 0.5'], ['0u 0.25']])
		expect(after.worlds).toHaveLength(4)
		expect(after.worlds.every(({ w }) => w === T / 4)).toBe(true)
		const pairs = after.worlds.map(({ b }) => ['Bb1', 'Ca2', 'Dd3'].find((n) => b.board[sq(n)] >= 0)
			+ '/' + ['Cc2', 'Ea5'].find((n) => b.board[sq(n)] >= 0)).sort()
		expect(pairs).toEqual(['Bb1/Cc2', 'Ca2/Cc2', 'Ca2/Ea5', 'Dd3/Ea5'])
		expect([budget(after, 0), budget(after, 1)]).toEqual([3, 2])
		expect(outcomes(V, position({ Bb1: '0:u', Cc2: '1:n' }), 'Bb1-Ca2|Dd3')).toBeNull()
	})

	it('shows full danger for a king that a split unicorn can take by a merge from two levels (RQ9)', () => {
		const s = stateOf(V, [[{ ...KINGS, Cc1: '0:u' }, 1], [{ ...KINGS, Cc5: '0:u' }, 1]])
		expect(royalDanger(V, s, 1)).toBe(1)
		expect(royalDanger(V, { ...s, turn: 1 }, 1)).toBe(1)
		expect(odds(s, 'Cc1-Ee3')).toEqual([['missR', 0.5], ['captureR', 0.5]])
		const won = applyOutcome(V, s, 'Cc1-Ee3', 1)
		expect(won.result).toEqual({ winner: 0, reason: 'king' })
		const missed = applyOutcome(V, s, 'Cc1-Ee3', 0)
		expect([missed.result, missed.turn, on(missed, 'Cc5')]).toEqual([null, 1, ['0u 1']])
		expect(odds(s, 'Cc1|Cc5-Ee3')).toEqual([['capture', 1]])
		expect(play(V, s, 'Cc1|Cc5-Ee3').result).toEqual({ winner: 0, reason: 'king' })
		const lane = stateOf(V, [
			[{ ...KINGS, Cc1: '0:u', Dd2: '1:n' }, 1],
			[{ ...KINGS, Cc5: '0:u', Ab3: '1:n' }, 1],
		])
		expect(royalDanger(V, lane, 1)).toBe(0.5)
		expect(outcomes(V, lane, 'Cc1|Cc5-Ee3')).toBeNull()
		expect(odds(lane, 'Cc5-Ee3')).toEqual([['missR', 0.5], ['captureR', 0.5]])
		expect(odds(lane, 'Cc1-Dd2')).toEqual([['missR', 0.5], ['captureR', 0.5]])
	})

	it('is won at once when a split unicorn can take a boxed king by a merge, unless a knight can block', () => {
		// Black's own pieces box its king on Ee5; the unicorn's parts on Aa1 and Cc3 take it by a merge for certain
		const box = { Ee5: '1:k', Ed5: '1:p', Ee4: '1:p', De5: '1:p', De4: '1:p', Dd5: '1:n', Ed4: '1:n', Ae5: '0:k' }
		const s = stateOf(V, [[{ ...box, Aa1: '0:u' }, 1], [{ ...box, Cc3: '0:u' }, 1]])
		const mate = play(V, s, 'Ae5-Ae4')
		expect(mate.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		expect(royalDanger(V, { ...mate, result: null }, 1)).toBe(1)
		// a Black knight on Ab4 can jump into the Aa1 part's lane on Bb2: the danger drops to 50 % and play goes on
		const knight = stateOf(V, [[{ ...box, Aa1: '0:u', Ab4: '1:n' }, 1], [{ ...box, Cc3: '0:u', Ab4: '1:n' }, 1]])
		const goesOn = play(V, knight, 'Ae5-Ae4')
		expect(goesOn.result).toBeNull()
		const blocked = play(V, goesOn, 'Ab4-Bb2')
		expect([blocked.result, royalDanger(V, blocked, 1)]).toEqual([null, 0.5])
		expect(outcomes(V, blocked, 'Aa1|Cc3-Ee5')).toBeNull()
	})

	it('escapes a double attack along two 3D lines only by splitting a knight onto both lines', () => {
		// Black's pawns box its king on Ee5; the rook on Ae5 attacks it up the column, the bishop from Ec3 on level E
		const box = { Ee5: '1:k', Ed5: '1:p', Ee4: '1:p', Dd5: '1:p', De4: '1:p', Dd4: '1:p' }
		const white = { Aa1: '0:k', Ae5: '0:r', Cc5: '0:b' }
		expect(play(V, stateOf(V, [[{ ...box, ...white }, 1]]), 'Cc5-Ec3').result)
			.toEqual({ winner: 0, reason: 'cannotEscape' })
		// with a knight on Cd3, any ordinary move blocks at most one line and the other attacker takes the king for
		// certain; split onto both lines, the knight blocks each in half the possibilities, and the game goes on
		const s = play(V, stateOf(V, [[{ ...box, ...white, Cd3: '1:n' }, 1]]), 'Cc5-Ec3')
		expect(s.result).toBeNull()
		for (const m of legalMoves(V, s)) {
			expect(royalDanger(V, play(V, s, m.code), 1), m.code).toBe(1)
		}
		const split = play(V, s, 'Cd3-Ce5|Ed4')
		expect([split.result, royalDanger(V, split, 1)]).toEqual([null, 0.5])
		expect(odds(split, 'Ae5-Ee5')).toEqual([['missR', 0.5], ['captureR', 0.5]])
		expect(odds(split, 'Ec3-Ee5')).toEqual([['missR', 0.5], ['captureR', 0.5]])
	})

	it('lets a knight leap over a ghost without a roll (RQ10)', () => {
		const s = stateOf(V, [
			[{ ...KINGS, Aa1: '0:n', Ba1: '1:r' }, 1],
			[{ ...KINGS, Aa1: '0:n', Ee5: '1:r' }, 1],
		])
		expect(odds(s, 'Aa1-Ca2')).toEqual([['move', 1]])
		const after = play(V, s, 'Aa1-Ca2')
		expect([on(after, 'Ca2'), on(after, 'Ba1'), on(after, 'Ee5')]).toEqual([['0n 1'], ['1r 0.5'], ['1r 0.5']])
		expect(budget(after, 0)).toBe(1)
	})

	it('joins a part to another part of the same piece without a roll (RQ11)', () => {
		const s = stateOf(V, [
			[{ ...KINGS, Aa1: '0:q', Ca1: '1:n' }, 1],
			[{ ...KINGS, Ae1: '0:q', Ce4: '1:n' }, 1],
		])
		expect(odds(s, 'Aa1-Ae1')).toEqual([['move', 1]])
		expect(outcomes(V, s, 'Aa1|Ae1-Ae1')).toBeNull()
		const after = play(V, s, 'Aa1-Ae1')
		expect([on(after, 'Ae1'), on(after, 'Ca1'), on(after, 'Ce4')]).toEqual([['0q 1'], ['1n 0.5'], ['1n 0.5']])
		expect([after.worlds.length, budget(after, 0), budget(after, 1)]).toEqual([2, 1, 2])
		const path = stateOf(V, [
			[{ ...KINGS, Aa1: '0:q', Ac1: '1:n' }, 1],
			[{ ...KINGS, Aa1: '0:q', Ce4: '1:n' }, 1],
			[{ ...KINGS, Ae1: '0:q', Ce4: '1:n' }, 1],
		])
		expect(odds(path, 'Aa1-Ae1')).toEqual([['move', 1]])
		const linked = play(V, path, 'Aa1-Ae1')
		expect(linked.worlds).toHaveLength(2)
		const third = (x) => Math.round(x * 3)
		expect(squareView(linked, sq('Aa1')).map((o) => third(o.p))).toEqual([1])
		expect(squareView(linked, sq('Ae1')).map((o) => third(o.p))).toEqual([2])
		expect(squareView(linked, sq('Ac1')).map((o) => third(o.p))).toEqual([1])
	})

	it('rolls a vertical slide instead of linking it when the budget is full (RQ12)', () => {
		const worlds = (unicorn) => {
			const out = []
			for (let bits = 0; bits < 16; bits++) {
				const pick = (i, a, c) => ((bits >> i) & 1 ? c : a)
				out.push([{
					...KINGS,
					Aa1: '0:r',
					[pick(0, 'Bb2', 'Bd2')]: '0:n',
					[pick(1, 'Db2', 'Dd2')]: '0:b',
					...(unicorn ? { Cc1: '0:u' } : { [pick(2, 'Cb1', 'Cd1')]: '0:u' }),
					[pick(3, 'Ca1', 'Ce5')]: '1:n',
				}, 1])
			}
			return out
		}
		const s = stateOf(V, worlds(false))
		expect([s.worlds.length, budget(s, 0), budget(s, 1)]).toEqual([16, 8, 2])
		expect(odds(s, 'Aa1-Ea1')).toEqual([['missR', 0.5], ['moveR', 0.5]])
		const missed = applyOutcome(V, s, 'Aa1-Ea1', 0)
		expect([on(missed, 'Aa1'), on(missed, 'Ca1'), missed.worlds.length, budget(missed, 0)])
			.toEqual([['0r 1'], ['1n 1'], 8, 8])
		const moved = applyOutcome(V, s, 'Aa1-Ea1', 1)
		expect([on(moved, 'Ea1'), on(moved, 'Ce5'), moved.worlds.length, budget(moved, 0)])
			.toEqual([['0r 1'], ['1n 1'], 8, 8])
		// with the unicorn solid on Cc1 (duplicate placements merge into 8 worlds), the slide links
		const solid = stateOf(V, worlds(true).filter((e, i) => !(i & 4)))
		expect([solid.worlds.length, budget(solid, 0)]).toEqual([8, 4])
		expect(odds(solid, 'Aa1-Ea1')).toEqual([['move', 1]])
		expect(budget(play(V, solid, 'Aa1-Ea1'), 0)).toBe(8)
	})

	it('reaches bare kings through a roll, a draw only while the kings do not touch (RQ13)', () => {
		const s = stateOf(V, [
			[{ Ac1: '0:k', Ee5: '1:k', Dd4: '0:q' }, 1],
			[{ Ac1: '0:k', Ee5: '1:k', Aa5: '0:q' }, 1],
		], 1)
		const list = outcomes(V, s, 'Ee5-Dd4')
		expect(list.map((o) => [o.key, o.p, o.rolled, o.notes])).toEqual([
			['move', 0.5, true, []],
			['capture', 0.5, true, []],
		])
		const moved = applyOutcome(V, s, 'Ee5-Dd4', 0)
		expect([moved.result, moved.turn, on(moved, 'Aa5'), on(moved, 'Dd4')]).toEqual([null, 0, ['0q 1'], ['1k 1']])
		expect(applyOutcome(V, s, 'Ee5-Dd4', 1).result).toEqual({ winner: null, reason: 'bareKings' })
		const touching = stateOf(V, [
			[{ Cc3: '0:k', Ee5: '1:k', Dd4: '0:q' }, 1],
			[{ Cc3: '0:k', Ee5: '1:k', Aa5: '0:q' }, 1],
		], 1)
		const taken = applyOutcome(V, touching, 'Ee5-Dd4', 1)
		expect([taken.result, taken.turn]).toEqual([null, 0])
		expect(play(V, taken, 'Cc3-Dd4').result).toEqual({ winner: 0, reason: 'king' })
	})

	it('never needs the solid or the game-end roll in random games with splits', () => {
		for (const seed of [3, 4, 5]) {
			const rng = seededRng(seed)
			let s = newGame(V)
			for (let ply = 0; ply < 80 && !s.result; ply++) {
				let codes = legalMoves(V, s).map((m) => m.code)
				if (ply % 3 === 0) {
					// a split of a random own piece that can split, when it has one
					const b = s.worlds[0].b
					const own = b.sq.filter((x, id) => x >= 0 && b.sd[id] === s.turn && V.types[b.ty[id]].splittable)
					const f = own[Math.floor(rng() * own.length)]
					const splits = f === undefined ? [] : splitsFrom(V, s, f)
					codes = splits.length ? splits.map((m) => m.code) : codes
				}
				const code = codes[Math.floor(rng() * codes.length)]
				s = applyMove(V, s, code, rng).state
				expect(s.history.at(-1).notes, code).toEqual([])
				const counts = s.worlds.map(({ b }) => [0, 1].map((side) => b.sd.filter((d, id) => d === side
					&& b.sq[id] >= 0).length).join(':'))
				expect(new Set(counts).size).toBe(1)
				const results = s.worlds.map(({ b }) => JSON.stringify(worldResult(V, b, 1 - s.turn)))
				expect(new Set(results).size).toBe(1)
				expect(s.worlds.every(({ b }) => JSON.stringify(b.x) === '{}')).toBe(true)
				expect(Math.max(budget(s, 0), budget(s, 1))).toBeLessThanOrEqual(8)
			}
		}
	}, 30000)
})

describe('Raumschach: the computer player', () => {
	it('makes a legal move from the start at every level within its time', async () => {
		const s = newGame(V)
		for (const L of LEVELS) {
			const elapsed = stopwatch()
			const code = await chooseMove(V, s, { level: L.id, rng: seededRng(11) })
			expect(outcomes(V, s, code), L.id + ': ' + code).not.toBeNull()
			expect(elapsed()).toBeLessThan(L.timeMs + 1500)
		}
	}, 20000)

	it('does not give a unicorn for a pawn at the start, and splits the queen towards the centre', async () => {
		const s = newGame(V)
		for (const level of ['normal', 'hard']) {
			const code = await chooseMove(V, s, { level, rng: seededRng(5), now: workClock() })
			expect(['Bb1-Ee4', 'Be1-Eb4'], level).not.toContain(code)
		}
		for (const seed of [1, 2, 3]) {
			const splits = aiSplits(V, s, sq('Bc1'), seededRng(seed))
			expect(splits.length).toBeGreaterThan(0)
			for (const code of splits) {
				expect(code.includes('Dc3') || code.includes('Cc2'), code).toBe(true)
			}
		}
		expect(V.evaluate(s.worlds[0].b, 0)).toBe(0)
		const centred = play(V, s, 'Ab1-Cb2').worlds[0].b
		expect(V.evaluate(centred, 0)).toBeGreaterThan(0)
		expect(V.evaluate(centred, 1)).toBe(-V.evaluate(centred, 0))
	})
})
