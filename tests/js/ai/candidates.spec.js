/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest'
import { candidates } from '../../../src/ai/candidates.js'
import { E, POS, S } from './helpers.js'

const QUICK = { timeMs: Infinity, nodeBudget: 5000 }

/** Tag grammar of SPEC §4.3. */
const TAG = /^(king-capture:\d{1,3}|certain-capture|converging|traps-king|capture:\d{1,3}:[qrbnp]|threatens-king:\d{1,3}|probe|split|merge|measure|defends-king|saves:[qrbnp]|hangs:[qrbnp]|risky|safe|trap)$/

/**
 * The tags of one candidate move.
 *
 * @param {object[]} list candidates
 * @param {string} code move code
 * @return {string[]}
 */
function tagsOf(list, code) {
	const c = list.find((x) => x.code === code)
	expect(c, code).toBeDefined()
	return c.tags
}

describe('candidates (GD §6.4 step 1)', () => {
	it('returns up to six moves best first with E for the side to move, tags and ✓', () => {
		const list = candidates(POS.middlegame(), { strength: 'balanced', tolerance: 0.04, ...QUICK })
		expect(list.length).toBe(6)
		for (let i = 1; i < list.length; i++) {
			expect(list[i - 1].E).toBeGreaterThanOrEqual(list[i].E)
		}
		expect(list[0].ok).toBe(true)
		for (const c of list) {
			expect(E.isLegal(POS.middlegame(), c.code)).toBe(true)
			expect(c.ok).toBe(c.E >= list[0].E - 0.04 - 1e-12)
			for (const t of c.tags) {
				expect(t).toMatch(TAG)
			}
		}
	})

	it('reports E for the side to move (Black here), not White', () => {
		const s = S('4k3/8/8/8/8/8/8/3QK3 b - - 0 1') // Black is lost
		const list = candidates(s, { strength: 'relaxed', tolerance: 0.1, ...QUICK })
		expect(list[0].E).toBeLessThan(0.2)
	})

	it('tags a certain converging king capture (W6)', () => {
		const list = candidates(POS.w6(), { strength: 'balanced', tolerance: 0.05, multiPv: 3, ...QUICK })
		expect(list[0].code).toBe('d4|h5-h8')
		expect(list[0].E).toBe(1)
		expect(tagsOf(list, 'd4|h5-h8')).toEqual(expect.arrayContaining(['king-capture:100', 'certain-capture', 'converging', 'merge']))
		expect(tagsOf(list, 'h5-h8')).toContain('king-capture:50')
	})

	it('tags the move that leaves the king unable to escape (W14)', () => {
		const list = candidates(POS.w14(), { strength: 'balanced', tolerance: 0.05, multiPv: 2, ...QUICK })
		expect(list[0].code).toBe('a1-a8')
		// The game ends at once, so there is no later threat to report.
		expect(tagsOf(list, 'a1-a8')).toContain('traps-king')
		expect(tagsOf(list, 'a1-a8').some((t) => t.startsWith('threatens-king'))).toBe(false)
	})

	it('tags a 50 % capture of a ghost as a risky roll (W2)', () => {
		const list = candidates(POS.w2(), { strength: 'balanced', tolerance: 0.05, ...QUICK })
		const tags = tagsOf(list, 'c1-h6')
		expect(tags).toContain('capture:50:n')
		expect(tags).toContain('risky')
	})

	it('tags a pawn probe, splits and measures', () => {
		const probe = candidates(POS.w9(), { strength: 'relaxed', tolerance: 0.5, multiPv: 30, ...QUICK })
		expect(tagsOf(probe, 'e2-e4')).toContain('probe')
		const s = S('4k3/8/8/8/8/8/3PPP2/4K1N1 w - - 0 1', ['g1-f3|h3'])
		const list = candidates(s, { strength: 'relaxed', tolerance: 1, multiPv: 60, ...QUICK })
		const split = list.find((c) => c.code.includes('|') && !c.code.startsWith('f3|'))
		const measure = list.find((c) => c.code.startsWith('?'))
		const merge = list.find((c) => c.code === 'f3|h3-g1')
		expect(split.tags).toContain('split')
		expect(measure.tags).toContain('measure')
		expect(merge.tags).toContain('merge')
	})

	it('tags king defence, saving and hanging pieces', () => {
		// Black's rook on a1 attacks the white king on e1 along the first rank.
		const danger = S('k7/8/8/8/8/8/8/r3K3 w - - 0 1')
		const d = candidates(danger, { strength: 'relaxed', tolerance: 1, multiPv: 8, ...QUICK })
		expect(tagsOf(d, 'e1-e2')).toContain('defends-king')
		// The white queen on d4 is attacked by the pawn on e5: moving it away saves it.
		const hit = S('4k3/8/2p5/4p3/3Q4/8/8/4K3 w - - 0 1')
		const h = candidates(hit, { strength: 'relaxed', tolerance: 1, multiPv: 500, ...QUICK })
		expect(tagsOf(h, 'd4-d1')).toContain('saves:q')
		expect(tagsOf(h, 'e1-e2')).not.toContain('saves:q') // the queen stays attacked
		// From a safe square, d1-d5?? walks into the c6 pawn.
		const safe = S('4k3/8/2p5/8/8/8/8/3QK3 w - - 0 1')
		const s = candidates(safe, { strength: 'relaxed', tolerance: 1, multiPv: 500, ...QUICK })
		expect(tagsOf(s, 'd1-d5')).toContain('hangs:q')
		expect(tagsOf(s, 'd1-d3')).not.toContain('hangs:q')
	})

	it('scales ✓ with the strength\'s tolerance factor and rejects unknown strengths', () => {
		const relaxed = candidates(POS.middlegame(), { strength: 'relaxed', tolerance: 0.02, ...QUICK })
		const okRelaxed = relaxed.filter((c) => c.ok).length
		for (const c of relaxed) {
			expect(c.ok).toBe(c.E >= relaxed[0].E - 0.02 * 2.5 - 1e-12)
		}
		expect(okRelaxed).toBeGreaterThanOrEqual(1)
		expect(() => candidates(POS.start(), { strength: 'insane' })).toThrow(TypeError)
		// A tolerance given in percentage points is understood too.
		const pp = candidates(POS.middlegame(), { strength: 'relaxed', tolerance: 2, ...QUICK })
		expect(pp.map((c) => c.ok)).toEqual(relaxed.map((c) => c.ok))
	})
})
