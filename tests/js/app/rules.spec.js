/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The Rules page content (SPEC §14.10) follows docs/RULES.md section by section, and every board is a valid position
 * with a legal move; the personas match SPEC §10.3.
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findMove, setupPosition } from '../../../src/engine/index.js'
import { moodToExpression, PERSONAS } from '../../../src/personas/index.js'
import { RULES_SECTIONS } from '../../../src/rules/sections.js'

const rules = readFileSync(new URL('../../../docs/RULES.md', import.meta.url), 'utf8')

describe('rules content', () => {
	it('mirrors the level-2 headings of RULES.md in order', () => {
		const headings = rules.split('\n').filter((l) => l.startsWith('## '))
		expect(RULES_SECTIONS.map((s) => s.heading)).toEqual(headings)
	})

	it('has translatable text in every block', () => {
		for (const s of RULES_SECTIONS) {
			expect(s.title()).not.toBe('')
			for (const b of s.blocks) {
				const texts = [b.text, b.q, b.a, b.caption, ...(b.items ?? []), ...(b.head ?? []), ...(b.rows ?? []).flat()].filter(Boolean)
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

describe('personas', () => {
	it('ships the four 1.0 personas with the SPEC tolerances', () => {
		expect(PERSONAS.map((p) => [p.id, p.tolerance])).toEqual([['professor', 4], ['captain', 10], ['superposa', 8], ['q7', 1]])
		for (const p of PERSONAS) {
			expect(Object.keys(p.avatar)).toEqual(['calm', 'happy', 'worried'])
			for (const event of ['start', 'opponentLucky', 'opponentUnlucky', 'kingDanger', 'win', 'loss', 'fallback']) {
				expect(p.canned[event].length, p.id + ' ' + event).toBeGreaterThanOrEqual(2)
			}
		}
	})

	it('maps the six moods onto three drawings', () => {
		expect(['happy', 'playful', 'confident', 'thinking', 'worried', 'surprised'].map(moodToExpression))
			.toEqual(['happy', 'happy', 'calm', 'calm', 'worried', 'worried'])
	})
})
