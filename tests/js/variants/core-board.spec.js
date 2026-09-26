/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The generic board and view features added for multiverse chess, pure parts; the components and
 * the composable are in core-board.vue.spec.js: the move record reaches the variant's `codeText` (H5) and the
 * variant's `lastMoveMarks` replaces the last record's squares, but not in a hidden game (H11). Then the pure parts of
 * the second visual review: the move list's notation and rows, the hands grouped at the board and the squares of a
 * move waiting for confirmation.
 */

import { describe, expect, it } from 'vitest'
import { pieceSpin } from '../../../src/variantplay/glyphs.js'
import { lastMoveMarks, moveSquares } from '../../../src/variantplay/marks.js'
import { handGroups, moveRows } from '../../../src/variantplay/panel.js'
import { codeText, moveText } from '../../../src/variantplay/texts.js'
import bughouse from '../../../src/variants/bughouse.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import { newGame } from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { sideName } from '../../../src/variants/index.js'
import raumschach from '../../../src/variants/raumschach.js'
import { play } from './helpers.js'

/**
 * An orthodox test variant with extra fields.
 *
 * @param {string} id variant id
 * @param {object} [extra] fields and hooks to add
 * @return {object}
 */
function orthodox(id, extra = {}) {
	return defineVariant(Object.assign(orthodoxSpec(), { id, category: 'rules', rules: () => [] }, extra))
}

const V = orthodox('test-board-pure')

/**
 * The square index of a name.
 *
 * @param {string} name square name
 * @return {number}
 */
function sq(name) {
	return V.topology.byName(name)
}

describe('H5: codeText with the history record', () => {
	it('passes the record to the variant\'s hook, and null without one', () => {
		const seen = []
		const W = orthodox('test-board-code', {
			codeText(code, record) {
				seen.push(record)
				return record?.info?.text ?? null
			},
		})
		const record = { code: 'b1-a3|c3', side: 0, info: { text: '(0T1)b1 split (0T1)a3 | (0T1)c3' } }
		expect(codeText(W, record.code, record)).toBe('(0T1)b1 split (0T1)a3 | (0T1)c3')
		expect(codeText(W, 'e2-e4')).toBe('e2-e4')
		expect(codeText(W, 'p@e4', { code: 'p@e4' })).toBe('P@e4')
		expect(seen).toEqual([record, null, { code: 'p@e4' }])
	})
})

describe('H11: the last-move marks', () => {
	const s = play(V, newGame(V), 'e2-e4')

	it('are the last record\'s squares by default', () => {
		expect(lastMoveMarks(V, s, 0)).toEqual([sq('e2'), sq('e4')])
		expect(lastMoveMarks(V, newGame(V), 0)).toEqual([])
	})

	it('come from the variant\'s hook when it has one, without repeats or invalid squares', () => {
		const W = orthodox('test-board-marks', { lastMoveMarks: () => [sq('a1'), -1, sq('h8'), sq('a1'), 2.5] })
		expect(lastMoveMarks(W, s, 1)).toEqual([sq('a1'), sq('h8')])
		const none = orthodox('test-board-marks-none', { lastMoveMarks: () => null })
		expect(lastMoveMarks(none, s, 1)).toEqual([])
	})

	it('in a hidden game show only the viewer\'s own last move and never ask the hook', () => {
		let asked = false
		const H = orthodox('test-board-marks-hidden', {
			hidden: true,
			visibility: () => new Set(),
			lastMoveMarks: () => {
				asked = true
				return [sq('a1')]
			},
		})
		expect(lastMoveMarks(H, s, 0)).toEqual([sq('e2'), sq('e4')])
		expect(lastMoveMarks(H, s, 1)).toEqual([])
		expect(asked).toBe(false)
	})
})

describe('the move list', () => {
	it('writes moves in long algebraic notation with the piece letter and x for a capture', () => {
		expect(moveText(V, 'g1-f3', { type: 'n' })).toBe('Ng1-f3')
		expect(moveText(V, 'e4-d5', { type: 'p', record: { code: 'e4-d5', captures: [sq('d5')] } })).toBe('e4xd5')
		// a capture that missed took nothing
		expect(moveText(V, 'e4-d5', { type: 'p', record: { code: 'e4-d5', captures: [] } })).toBe('e4-d5')
		expect(moveText(V, 'e7-e8=q', { type: 'p' })).toBe('e7-e8=Q')
		expect(moveText(V, 'g1-f3|h3', { type: 'n' })).toBe('Ng1-f3|h3')
		expect(moveText(V, 'f3|h3-g5', { type: 'n' })).toBe('Nf3|h3-g5')
		expect(moveText(V, 'd1-d4', { type: 'q', capture: true })).toBe('Qd1xd4')
		expect(moveText(V, 'n@f3')).toBe('N@f3')
		// without the piece type (games saved before), a measurement and castling: the code as it is
		expect(moveText(V, 'g1-f3')).toBe('g1-f3')
		expect(moveText(V, '?f3', { type: 'n' })).toBe('?f3')
		expect(moveText(V, 'O-O', { type: 'k' })).toBe('O-O')
	})

	it('writes the board of a bughouse move once, and keeps a space after the letter before a capital', () => {
		expect(moveText(bughouse, 'A:g1-A:f3|A:h3', { type: 'n' })).toBe('A: Ng1-f3|h3')
		expect(moveText(bughouse, 'p@B:d2')).toBe('B: P@d2')
		expect(moveText(raumschach, 'Ab1-Aa3|Cb2', { type: 'n' })).toBe('N Ab1-Aa3|Cb2')
	})

	it('lets the variant\'s own codeText win', () => {
		const W = orthodox('test-board-own-text', { codeText: (code) => (code === 'g1-f3' ? 'mine' : null) })
		expect(moveText(W, 'g1-f3', { type: 'n' })).toBe('mine')
		expect(moveText(W, 'b1-c3', { type: 'n' })).toBe('Nb1-c3')
	})

	it('numbers the rows oldest first: two sides in pairs (one cell per turn), else a row per turn', () => {
		const h = (sides) => sides.map((side) => ({ side }))
		expect(moveRows(h([0, 1, 0]), 2)).toEqual([
			{ n: 1, cells: [{ side: 0, items: [0] }, { side: 1, items: [1] }] },
			{ n: 2, cells: [{ side: 0, items: [2] }, null] },
		])
		// a game begun by the second side, and a multiverse turn of two moves
		expect(moveRows(h([1, 0, 0, 1]), 2)).toEqual([
			{ n: 1, cells: [null, { side: 1, items: [0] }] },
			{ n: 2, cells: [{ side: 0, items: [1, 2] }, { side: 1, items: [3] }] },
		])
		expect(moveRows(h([0, 1, 2, 3, 0]), 4).map((r) => [r.n, r.cells[0].side])).toEqual([
			[1, 0],
			[2, 1],
			[3, 2],
			[4, 3],
			[5, 0],
		])
	})
})

describe('the hands at the board', () => {
	const top = (rotation) => (side) => pieceSpin(bughouse, side, rotation) === 180

	it('put the hand of the side at the top above a two-player board and the other below it', () => {
		const onTop = (side) => side === 1
		expect(handGroups(V, 0, onTop).map((g) => [g.place, g.sides])).toEqual([['bottom', [0]], ['top', [1]]])
	})

	it('group the bughouse hands under their boards, left to right as drawn, the seat at the top first', () => {
		expect(handGroups(bughouse, 0, top(0)).map((g) => [g.key, g.board, g.sides.map((s) => sideName(bughouse, s))]))
			.toEqual([['board0', true, ['Black A', 'White A']], ['board1', true, ['White B', 'Black B']]])
		expect(handGroups(bughouse, 180, top(180)).map((g) => g.sides.map((s) => sideName(bughouse, s))))
			.toEqual([['Black B', 'White B'], ['White A', 'Black A']])
	})
})

describe('the squares of a move waiting for confirmation', () => {
	it('come from the listed move, else from the code, and never throw', () => {
		const moves = [{ code: 'e2-e4', from: sq('e2'), to: sq('e4') }]
		expect(moveSquares(V, 'e2-e4', moves)).toEqual({ from: [sq('e2')], to: [sq('e4')] })
		expect(moveSquares(V, 'g1-f3|h3')).toEqual({ from: [sq('g1')], to: [sq('f3'), sq('h3')] })
		expect(moveSquares(V, 'n@f3')).toEqual({ from: [], to: [sq('f3')] })
		expect(moveSquares(V, 'submit')).toEqual({ from: [], to: [] })
	})
})
