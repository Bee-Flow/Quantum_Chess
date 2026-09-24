// @vitest-environment happy-dom
/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The LLM opponent personas: their definitions, the avatar in every expression, and the mood-to-expression mapping.
 */

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PersonaAvatar from '../../../src/llm/components/PersonaAvatar.vue'
import { moodToExpression, PERSONAS } from '../../../src/llm/personas.js'

describe('personas', () => {
	it('ships four personas with their tolerances and canned lines', () => {
		expect(PERSONAS.map((p) => [p.id, p.tolerance])).toEqual([['professor', 4], ['captain', 10], ['superposa', 8], ['q7', 1]])
		for (const p of PERSONAS) {
			for (const event of ['start', 'opponentLucky', 'opponentUnlucky', 'kingDanger', 'win', 'loss', 'fallback']) {
				expect(p.canned[event].length, p.id + ' ' + event).toBeGreaterThanOrEqual(2)
			}
		}
	})

	it('draws every persona in each of the three expressions', () => {
		for (const p of PERSONAS) {
			for (const expression of ['calm', 'happy', 'worried']) {
				const w = mount(PersonaAvatar, { props: { persona: p.id, expression, size: 32 } })
				expect(w.find('svg.qc-persona-avatar > g').exists(), p.id + ' ' + expression).toBe(true)
				w.unmount()
			}
		}
	})

	it('maps the six moods onto three drawings', () => {
		expect(['happy', 'playful', 'confident', 'thinking', 'worried', 'surprised'].map(moodToExpression))
			.toEqual(['happy', 'happy', 'calm', 'calm', 'worried', 'worried'])
	})
})
