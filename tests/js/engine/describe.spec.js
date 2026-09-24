/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The plain-text position description for LLM prompts (Appendix B).
 *
 * Section numbers (§) and appendices refer to docs/engine-rules.md.
 */

import { describe, expect, it } from 'vitest'
import { E, play, S } from './helpers.js'

describe('describeForLlm', () => {
	it('describes pieces, links, possibilities and legal moves', () => {
		const s = play(play(S('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), 'b6-a4|c4'), 'a1-a8')
		const text = E.describeForLlm(s)
		expect(text).toContain('Quantum Chess (rules v1). You are Black. Move 2, Black to move.')
		expect(text).toContain('Certain pieces (FEN, uncertain pieces removed): 4k3/8/8/8/8/8/8/4K3 b - - 2 2')
		expect(text).toContain('- White rook: a1 50%, a8 50%')
		expect(text).toContain('- Black knight: a4 50%, c4 50%')
		const links
			= 'Links: white rook a8 <-> black knight c4 (knight on c4 in 100% of the cases where the rook is on a8)'
		expect(text).toContain(links)
		expect(text).toContain('Possibilities: 2. Budget: White 2/8, Black 2/8. King danger: White 0%, Black 50%.')
		expect(text).toContain('?a4 (measure: a4 50%, c4 50%)')
		expect(text).toContain('Na4 may split to two of:')
		expect(E.describeForLlm(E.initialState(), { color: 'w' })).toContain('Uncertain pieces: none')
	})
})
