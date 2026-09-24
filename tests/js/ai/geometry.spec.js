/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The computer player keeps its own board tables (their iteration order drives its move ordering), but they must
 * describe the same board as the rules engine's.
 */

import { describe, expect, it } from 'vitest'
import * as AI from '../../../src/ai/geometry.js'
import * as ENGINE from '../../../src/engine/geometry.js'

const sorted = (list) => [...list].sort((a, b) => a - b)

describe('computer player geometry', () => {
	it('has the same rays as the rules engine, in the same order', () => {
		for (let i = 0; i < 64 * 8; i++) {
			expect(AI.RAYS[i]).toEqual(ENGINE.RAYS[i])
		}
	})

	it('has the same knight and king targets (in its own order)', () => {
		for (let s = 0; s < 64; s++) {
			expect(sorted(AI.KNIGHT[s])).toEqual(ENGINE.KNIGHT[s])
			expect(sorted(AI.KING[s])).toEqual(ENGINE.KING[s])
		}
	})

	it('has the same pawn attacks', () => {
		for (let s = 0; s < 64; s++) {
			expect(sorted(AI.PAWN_ATTACKS[0][s])).toEqual(ENGINE.PAWN_CAPTURES[0][s])
			expect(sorted(AI.PAWN_ATTACKS[1][s])).toEqual(ENGINE.PAWN_CAPTURES[1][s])
		}
	})

	it('finds the same squares between two squares as the engine lanes', () => {
		for (let f = 0; f < 64; f++) {
			for (let t = 0; t < 64; t++) {
				if (f !== t) {
					expect(AI.between(f, t)).toEqual(ENGINE.LANE[f * 64 + t])
				}
			}
		}
	})
})
