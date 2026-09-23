/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * format.js (GAME-DESIGN §3.9 reason copy), move-list helpers and the board size formula (GAME-DESIGN §3.1).
 */

import { describe, expect, it } from 'vitest'
import { gameSummary, moveRows } from '../../../src/components/game/moveRows.js'
import { boardSizeFor, layoutFor } from '../../../src/composables/useBoardSize.js'
import { RESULT_REASONS } from '../../../src/engine/index.js'
import { formatDeadline, formatRating, kingCaptureContext, reasonCopy, resultText, winnerOf } from '../../../src/services/format.js'

const names = { w: 'Alice', b: 'Bob' }

describe('game over copy', () => {
	it('has a sentence for every engine and server reason', () => {
		const server = ['resignation', 'agreement', 'timeout', 'timeout_draw', 'aborted', 'abandoned', 'player_deleted']
		for (const reason of [...RESULT_REASONS, ...server]) {
			expect(reasonCopy(reason, { winner: 'w', names }), reason).not.toBe('')
		}
	})

	it('words the reasons from GAME-DESIGN §3.9', () => {
		expect(reasonCopy('king_captured', { winner: 'w', names, captureProbability: 0.625, square: 'e8' })).toBe('King captured on e8 by a 63% roll')
		expect(reasonCopy('king_captured', { winner: 'w', names, captureProbability: 1 })).toBe('King captured for certain')
		expect(reasonCopy('king_captured', { winner: 'w', names }), 'final move unknown: no claim about the roll').toBe('King captured')
		const rolled = { code: 'f3-g5', measurement: { key: 'capture', outcomes: [{ key: 'capture', weight: 8388608 }, { key: 'miss', weight: 8388608 }] } }
		expect(kingCaptureContext(rolled)).toEqual({ captureProbability: 0.5, square: 'g5' })
		expect(reasonCopy('king_captured', { winner: 'w', names, ...kingCaptureContext(rolled) })).toBe('King captured on g5 by a 50% roll')
		expect(kingCaptureContext({ code: 'e7-e8=q', measurement: null })).toEqual({ captureProbability: 1, square: 'e8' })
		expect(reasonCopy('king_trapped', { winner: 'w', names })).toBe('Bob’s king cannot escape: every move would let Alice capture it')
		expect(reasonCopy('timeout', { winner: 'w', names })).toBe('Bob ran out of time')
		expect(reasonCopy('bare_kings', {})).toBe('Only the kings are left')
	})

	it('builds headlines', () => {
		expect(resultText('1-0', 'king_captured', names)).toMatchObject({ title: 'Alice won', winner: 'w' })
		expect(resultText('1/2-1/2', 'repetition', names)).toMatchObject({ title: 'Draw', winner: null })
		expect(resultText('0-1', 'aborted', names).title).toBe('Game aborted')
		expect(winnerOf('0-1')).toBe('b')
	})

	it('formats ratings and deadlines', () => {
		expect(formatRating(1284.4, true)).toBe('1284?')
		expect(formatRating(null)).toBe('')
		expect(formatDeadline(1000 + 18 * 3600, 1000)).toBe('18 h left')
		expect(formatDeadline(1000 + 3 * 86400, 1000)).toBe('3 days left')
		expect(formatDeadline(null, 0)).toBe('')
	})
})

describe('move list helpers', () => {
	it('groups moves into rows, also when Black moves first', () => {
		const e = (color) => ({ color, code: 'a', notation: 'a' })
		expect(moveRows([e('w'), e('b'), e('w')]).map((r) => [r.number, !!r.w, !!r.b])).toEqual([[1, true, true], [2, true, false]])
		expect(moveRows([e('b'), e('w')]).map((r) => [r.number, !!r.w, !!r.b])).toEqual([[1, false, true], [2, true, false]])
	})

	it('summarises a game', () => {
		const m = (code, notation, key, weight) => ({ code, notation, measurement: key ? { key, outcomes: [{ key, weight }] } : null })
		const s = gameSummary([m('e2-e4', 'e2-e4'), m('c1-h6', 'Bc1xh6 {capture 12%}', 'capture', 2097152), m('d4|h5-h8', 'Qd4|h5xh8 #')])
		expect(s).toEqual({ moves: 2, rolls: 1, rare: 1, converging: 1 })
	})
})

describe('board size (GAME-DESIGN §3.1)', () => {
	it('uses integer squares of at least 36 px, capped at 880 px', () => {
		const desktop = boardSizeFor({ width: 1140, height: 900 })
		expect(desktop.layout).toBe('desktop')
		expect(Number.isInteger(desktop.squareSize)).toBe(true)
		expect(desktop.boardPx).toBe(8 * desktop.squareSize)
		expect(desktop.boardPx).toBeLessThanOrEqual(900 - 50 - 150)
		const phone = boardSizeFor({ width: 360, height: 740 })
		expect(phone).toMatchObject({ layout: 'phone', squareSize: 43 })
		expect(boardSizeFor({ width: 200, height: 300 }).squareSize).toBe(36)
		expect(boardSizeFor({ width: 4000, height: 3000 }).boardPx).toBeLessThanOrEqual(880)
	})

	it('picks the layout from the container', () => {
		expect(layoutFor(390, 844)).toBe('phone')
		expect(layoutFor(700, 1000)).toBe('tablet')
		expect(layoutFor(800, 400)).toBe('phone-landscape')
		expect(layoutFor(1600, 1000)).toBe('wide')
	})
})
