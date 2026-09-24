/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The texts of the game-over dialog: a plain-language sentence for every result reason, and the headlines.
 */

import { describe, expect, it } from 'vitest'
import { RESULT_REASONS } from '../../../src/engine/index.js'
import { toGameResult } from '../../../src/game/gameController.js'
import { kingCaptureContext, reasonCopy, resultText } from '../../../src/game/resultText.js'

const names = { w: 'Alice', b: 'Bob' }

describe('game over copy', () => {
	it('has a sentence for every engine and server reason', () => {
		const server = ['resignation', 'agreement', 'timeout', 'timeout_draw', 'aborted', 'abandoned', 'player_deleted']
		for (const reason of [...RESULT_REASONS, ...server]) {
			expect(reasonCopy(reason, { winner: 'w', names }), reason).not.toBe('')
		}
	})

	it('words each reason in plain language', () => {
		expect(reasonCopy('king_captured', { winner: 'w', names, captureProbability: 0.625, square: 'e8' }))
			.toBe('King captured on e8 by a 63% roll')
		expect(reasonCopy('king_captured', { winner: 'w', names, captureProbability: 1 }))
			.toBe('King captured for certain')
		expect(
			reasonCopy('king_captured', { winner: 'w', names }),
			'final move unknown: no claim about the roll',
		).toBe('King captured')
		const rolled = {
			code: 'f3-g5',
			measurement: {
				key: 'capture',
				outcomes: [{ key: 'capture', weight: 8388608 }, { key: 'miss', weight: 8388608 }],
			},
		}
		expect(kingCaptureContext(rolled)).toEqual({ captureProbability: 0.5, square: 'g5' })
		expect(reasonCopy('king_captured', { winner: 'w', names, ...kingCaptureContext(rolled) }))
			.toBe('King captured on g5 by a 50% roll')
		expect(kingCaptureContext({ code: 'e7-e8=q', measurement: null }))
			.toEqual({ captureProbability: 1, square: 'e8' })
		expect(reasonCopy('king_trapped', { winner: 'w', names }))
			.toBe('Bob’s king cannot escape: every move would let Alice capture it')
		expect(reasonCopy('timeout', { winner: 'w', names })).toBe('Bob ran out of time')
		expect(reasonCopy('bare_kings', {})).toBe('Only the kings are left')
	})

	it('builds headlines', () => {
		expect(resultText('1-0', 'king_captured', names)).toMatchObject({ title: 'Alice won', winner: 'w' })
		expect(resultText('1/2-1/2', 'repetition', names)).toMatchObject({ title: 'Draw', winner: null })
		expect(resultText('0-1', 'aborted', names).title).toBe('Game aborted')
		expect(toGameResult({ result: '0-1', reason: 'resignation' }).winner).toBe('b')
	})
})
