/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The Rules page content follows docs/rules.md section by section, and every board is a valid position with a legal
 * move.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findMove, setupPosition } from '../../../src/engine/index.js'
import { RULES_SECTIONS } from '../../../src/rules/sections.js'

const rules = readFileSync(new URL('../../../docs/rules.md', import.meta.url), 'utf8')

describe('rules content', () => {
	it('mirrors the level-2 headings of the player rules in order', () => {
		const headings = rules.split('\n').filter((l) => l.startsWith('## '))
		expect(RULES_SECTIONS.map((s) => s.heading)).toEqual(headings)
	})

	it('has translatable text in every block', () => {
		for (const s of RULES_SECTIONS) {
			expect(s.title()).not.toBe('')
			for (const b of s.blocks) {
				const texts = [
					b.text,
					b.q,
					b.a,
					b.caption,
					...(b.items ?? []),
					...(b.head ?? []),
					...(b.rows ?? []).flat(),
				].filter(Boolean)
				expect(texts.length, s.id).toBeGreaterThan(0)
				for (const fn of texts) {
					expect(typeof fn()).toBe('string')
				}
			}
		}
	})

	it('uses valid positions and legal moves', () => {
		const boards = RULES_SECTIONS.flatMap((s) => s.blocks).filter((b) => b.type === 'board')
		expect(boards.length).toBeGreaterThanOrEqual(8)
		for (const b of boards) {
			const state = setupPosition(b.setup)
			if (b.play) {
				expect(findMove(state, b.play.code), b.play.code).not.toBeNull()
			}
		}
	})
})
