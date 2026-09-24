/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * useBoardInput: modes and tooltips, click / split / merge / Measure / promotion flows, the king safety net thresholds
 * and the confirmation modes.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { clearBoardPreferenceOverrides, overrideBoardPreferences } from '../../../src/board/boardPreferences.js'
import { markerKind, useBoardInput } from '../../../src/board/composables/useBoardInput.js'
import { E, play, S, sq } from './helpers.js'

/**
 * An input for a state where the side to move may play.
 *
 * @param {object} state engine state
 * @param {object} [extra] more options
 * @return {{input: object, committed: object[], state: import('vue').Ref}}
 */
function setup(state, extra = {}) {
	const s = ref(state)
	const input = useBoardInput({
		state: s,
		legalMoves: () => E.generateMoves(s.value),
		movableColor: () => s.value.turn,
		interactive: true,
		...extra,
	})
	const committed = []
	input.onCommit((m) => committed.push(m.code))
	return { input, committed, state: s }
}

afterEach(() => {
	clearBoardPreferenceOverrides()
})

describe('modes', () => {
	it('start position: Move and Split available, Merge and Measure disabled with reasons', () => {
		const { input } = setup(E.initialState())
		expect(input.modes.move.enabled).toBe(true)
		expect(input.modes.split.enabled).toBe(true)
		expect(input.modes.merge).toEqual({
			enabled: false,
			reason: 'You have no ghost of a knight, bishop, rook or queen.',
		})
		expect(input.modes.measure).toEqual({ enabled: false, reason: 'You have no ghost to measure.' })
		expect(input.setMode('merge')).toBe(false)
		expect(input.mode).toBe('move')
	})

	it('not interactive: every mode is disabled with "Wait for your turn."', () => {
		const input = useBoardInput({ state: E.initialState(), legalMoves: [], movableColor: 'b', interactive: false })
		for (const m of ['move', 'split', 'merge', 'measure']) {
			expect(input.modes[m]).toEqual({ enabled: false, reason: 'Wait for your turn.' })
		}
		expect(input.activate(sq('g1'))).toBe('none')
	})

	it('budget full: the Split tooltip names the budget', () => {
		// W8: White has three independent ghosts (B = 8)
		const w8 = S('4k3/8/6n1/8/8/8/8/1NBQK2R w - - 0 1', ['b1-a3|c3', 'c1-d2|e3', 'd1-b3|a4', 'g6-f4|h4'])
		const { input } = setup(w8)
		expect(input.modes.split).toEqual({ enabled: false, reason: 'Budget full: merge or measure a piece first.' })
		expect(input.modes.merge.enabled).toBe(true)
		expect(input.modes.measure.enabled).toBe(true)
	})
})

describe('click flow', () => {
	it('select, targets with marker kinds, commit, back to Move', () => {
		const { input, committed } = setup(E.initialState())
		expect(input.activate(sq('g1'))).toBe('select')
		expect(input.selection).toBe(sq('g1'))
		expect(input.targets.map((x) => [x.square, x.kind])).toEqual([[sq('f3'), 'certain'], [sq('h3'), 'certain']])
		expect(input.activate(sq('f3'))).toBe('committed')
		expect(committed).toEqual(['g1-f3'])
		expect(input.selection).toBe(null)
		expect(input.mode).toBe('move')
	})

	it('clicking the selected piece or an empty square deselects; another own piece switches', () => {
		const { input } = setup(E.initialState())
		input.activate(sq('g1'))
		expect(input.activate(sq('b1'))).toBe('select')
		expect(input.selection).toBe(sq('b1'))
		expect(input.activate(sq('b1'))).toBe('deselect')
		input.activate(sq('b1'))
		expect(input.activate(sq('e5'))).toBe('illegal')
		expect(input.feedback.code).toBe('unreachable')
		expect(input.selection).toBe(null)
	})

	it('a pawn pushing into a piece explains that pawns can\'t capture straight ahead', () => {
		const s = S('4k3/8/8/8/4n3/8/4P3/4K3 w - - 0 1')
		const { input } = setup(s)
		input.activate(sq('e2'))
		expect(input.drop(sq('e2'), sq('e3'))).not.toBe('illegal')
		const s2 = S('4k3/8/8/8/8/4n3/4P3/4K3 w - - 0 1')
		const b = setup(s2).input
		b.activate(sq('e2'))
		expect(b.drop(sq('e2'), sq('e3'))).toBe('illegal')
		expect(b.feedback.text).toBe('Pawns can\'t capture straight ahead.')
	})

	it('marker kinds follow the resolution', () => {
		// W2: a solid bishop attacks a ghost knight
		const w2 = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		const { input } = setup(w2)
		input.activate(sq('c1'))
		const h6 = input.targetAt(sq('h6'))
		expect(h6.kind).toBe('roll-capture')
		expect(h6.pCapture).toBe(0.5)
		expect(input.targetAt(sq('g5')).kind).toBe('certain')
		// W4: a blocked slide is quantum
		const w4 = play(S('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), 'b6-a4|c4')
		const q = setup(w4).input
		q.activate(sq('a1'))
		expect(q.targetAt(sq('a8')).kind).toBe('quantum')
		// W8 fallback
		const w8 = S('4k3/8/6n1/8/8/8/8/1NBQK2R w - - 0 1', ['b1-a3|c3', 'c1-d2|e3', 'd1-b3|a4', 'g6-f4|h4'])
		const f = setup(w8).input
		f.activate(sq('h1'))
		expect(f.targetAt(sq('h8')).kind).toBe('roll-budget')
		// W6 converging capture
		const w6 = S('7k/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1-d4|h5'])
		const c = setup(w6).input
		c.setMode('merge')
		c.activate(sq('d4'))
		expect(c.mergeSources).toEqual([sq('d4'), sq('h5')])
		expect(c.targetAt(sq('h8')).kind).toBe('converging')
		expect(markerKind({ type: 'standard', resolution: 'certain', capture: true })).toBe('certain-capture')
	})
})

describe('split, merge and Measure flows', () => {
	it('split: first target (half ring), only legal partners stay, commit', () => {
		const { input, committed } = setup(E.initialState())
		expect(input.setMode('split')).toBe(true)
		input.activate(sq('g1'))
		const kinds = Object.fromEntries(input.targets.map((x) => [E.squareName(x.square), x.kind]))
		expect(kinds).toEqual({ e2: 'split-disabled', f3: 'split', h3: 'split' })
		expect(input.targetAt(sq('e2')).reason).toBe('A split can only go to squares that are certainly empty.')
		expect(input.activate(sq('e2'))).toBe('illegal')
		expect(input.activate(sq('f3'))).toBe('split-first')
		expect(input.targetAt(sq('f3')).kind).toBe('split-chosen')
		expect(input.targetAt(sq('h3')).kind).toBe('split')
		expect(input.activate(sq('h3'))).toBe('committed')
		expect(committed).toEqual(['g1-f3|h3'])
		expect(input.mode).toBe('move')
	})

	it('Shift+click a target in Move mode makes it split target 1', () => {
		const { input } = setup(E.initialState())
		input.activate(sq('g1'))
		expect(input.activate(sq('h3'), { shift: true })).toBe('split-first')
		expect(input.mode).toBe('split')
		expect(input.splitFirst).toBe(sq('h3'))
	})

	it('merge: a two-part ghost selects both parts; the merge glyph accelerator works from Move', () => {
		const s = play(E.initialState(), 'g1-f3|h3', 'e7-e5')
		const { input, committed } = setup(s)
		input.activate(sq('f3'))
		expect(input.targetAt(sq('h3')).kind).toBe('merge-part')
		expect(input.activate(sq('h3'))).toBe('merge')
		expect(input.mode).toBe('merge')
		expect(input.mergeSources).toEqual([sq('f3'), sq('h3')])
		expect(input.targetAt(sq('g1')).kind).toBe('merge')
		expect(input.activate(sq('g1'))).toBe('committed')
		expect(committed).toEqual(['f3|h3-g1'])
	})

	it('Measure: select a part, every part is marked, a second click commits', () => {
		// Measuring here risks the king (the linked rook may land on a8), so the safety net would ask
		overrideBoardPreferences({ safetyNet: false })
		const w4 = play(S('4k3/8/1n6/8/8/8/8/R3K3 b - - 0 1'), 'b6-a4|c4', 'a1-a8')
		const { input, committed } = setup(w4)
		expect(input.setMode('measure')).toBe(true)
		expect(input.activate(sq('c4'))).toBe('select')
		expect(input.targets.map((x) => [E.squareName(x.square), x.kind, x.probability]))
			.toEqual([['a4', 'measure', 0.5], ['c4', 'measure', 0.5]])
		expect(input.previewInfo.title).toContain('Measure')
		expect(input.activate(sq('a4'))).toBe('committed')
		expect(committed).toEqual(['?a4'])
	})

	it('changing mode keeps a selection that is valid in the new mode', () => {
		const s = play(E.initialState(), 'g1-f3|h3', 'e7-e5')
		const { input } = setup(s)
		input.activate(sq('h3'))
		input.setMode('measure')
		expect(input.selection).toBe(sq('h3'))
		input.setMode('split')
		expect(input.selection).toBe(sq('h3'))
		input.activate(sq('e2'))
		expect(input.selection).toBe(sq('e2'))
		input.setMode('merge')
		expect(input.selection).toBe(null)
	})
})

describe('promotion', () => {
	it('opens the picker before the move is sent; Always promote to queen skips it', () => {
		const s = S('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1')
		const { input, committed } = setup(s)
		input.activate(sq('b7'))
		expect(input.targetAt(sq('b8')).promotion).toBe(true)
		expect(input.activate(sq('b8'))).toBe('promotion')
		expect(input.promotion.moves.map((m) => m.promo)).toEqual(['q', 'r', 'b', 'n'])
		expect(input.choosePromotion('n')).toBe('committed')
		expect(committed).toEqual(['b7-b8=N'])
		overrideBoardPreferences({ autoQueen: true })
		input.activate(sq('b7'))
		expect(input.activate(sq('b8'))).toBe('committed')
		expect(committed).toEqual(['b7-b8=N', 'b7-b8=Q'])
	})
})

describe('king safety net', () => {
	// The black rook is 50 % a1 / 50 % a3: on the first rank the white king is 50 % capturable.
	const risky = () => S('4k3/8/8/8/8/8/r7/4K3 w - - 0 1', ['a2-a1|a3'])

	it('asks at risk ≥ 10 % when a move ≥ 10 points safer exists; Play anyway / Show / Cancel', () => {
		const { input, committed } = setup(risky())
		input.activate(sq('e1'))
		expect(input.activate(sq('d1'))).toBe('safety')
		expect(input.safetyNet.risk).toBe(0.5)
		expect(input.safetyNet.safer.risk).toBe(0)
		expect(committed).toEqual([])
		expect(input.resolveSafetyNet('show')).toBe('show')
		expect(input.selection).toBe(sq('e1'))
		expect(input.hovered).not.toBe(null)
		expect(E.moveRisk(risky(), 'e1-' + E.squareName(input.hovered))).toBe(0)
		input.activate(sq('d1'))
		expect(input.resolveSafetyNet('play')).toBe('committed')
		expect(committed).toEqual(['e1-d1'])
	})

	it('does not ask for safe moves; "Don\'t ask again this game" is remembered until newGame()', () => {
		const { input, committed } = setup(risky())
		input.activate(sq('e1'))
		expect(input.activate(sq('e2'))).toBe('committed')
		const x = setup(risky())
		x.input.activate(sq('e1'))
		expect(x.input.activate(sq('f1'))).toBe('safety')
		x.input.resolveSafetyNet('cancel', true)
		expect(x.committed).toEqual([])
		expect(x.input.selection).toBe(sq('e1'))
		expect(x.input.activate(sq('f1'))).toBe('committed')
		x.input.newGame()
		expect(x.input.dontAskSafety).toBe(false)
		expect(committed).toEqual(['e1-e2'])
	})

	it('no move at least 10 points safer: no question', () => {
		// The rook is 50 % on rank 1 and 50 % on rank 2: every king move keeps a 50 % risk
		const s = S('4k3/8/8/8/8/8/8/r3K3 w - - 0 1', ['a1-a2|b1'])
		const risks = E.generateMoves(s).map((m) => E.moveRisk(s, m.code))
		expect(Math.min(...risks)).toBeGreaterThan(0.4)
		const { input, committed } = setup(s)
		input.activate(sq('e1'))
		expect(input.activate(sq('d2'))).toBe('committed')
		expect(committed).toEqual(['e1-d2'])
	})

	it('can be switched off', () => {
		overrideBoardPreferences({ safetyNet: false })
		const { input } = setup(risky())
		input.activate(sq('e1'))
		expect(input.activate(sq('d1'))).toBe('committed')
	})
})

describe('confirm moves', () => {
	it('never / rolled / always', async () => {
		const w2 = S('4k1n1/8/8/8/8/8/8/2B1K3 w - - 0 1', ['g8-f6|h6'])
		overrideBoardPreferences({ confirmMoves: 'rolled' })
		const { input, committed } = setup(w2)
		input.activate(sq('c1'))
		expect(input.activate(sq('g5'))).toBe('committed')
		input.activate(sq('c1'))
		expect(input.activate(sq('h6'))).toBe('pending')
		expect(input.pending.move.code).toBe('c1-h6')
		expect(input.previewInfo.label).toBe('roll')
		// clicking the target again (or Enter on it) confirms
		expect(input.activate(sq('h6'))).toBe('committed')
		expect(committed).toEqual(['c1-g5', 'c1-h6'])
		overrideBoardPreferences({ confirmMoves: 'always' })
		input.activate(sq('c1'))
		expect(input.activate(sq('g5'))).toBe('pending')
		expect(input.cancel()).toBe('pending')
		expect(input.pending).toBe(null)
		// the selection stays after cancelling the pending move
		expect(input.selection).toBe(sq('c1'))
		expect(input.activate(sq('g5'))).toBe('pending')
		input.confirm()
		expect(committed).toEqual(['c1-g5', 'c1-h6', 'c1-g5'])
		await nextTick()
	})
})

describe('what-if view', () => {
	it('opens only on ghost parts, cycles parts with Tab, Esc closes', () => {
		const s = play(E.initialState(), 'g1-f3|h3')
		const { input } = setup(s)
		expect(input.setWhatIf(sq('e2'))).toBe(false)
		expect(input.setWhatIf(sq('f3'))).toBe(true)
		expect(input.cycleWhatIf()).toBe(sq('h3'))
		expect(input.cycleWhatIf()).toBe(sq('f3'))
		expect(input.cancel()).toBe('whatIf')
		expect(input.whatIf).toBe(null)
	})

	it('a new position resets every flow', async () => {
		const { input, state } = setup(E.initialState())
		input.activate(sq('g1'))
		input.setMode('split')
		state.value = play(state.value, 'e2-e4')
		await nextTick()
		expect(input.mode).toBe('move')
		expect(input.selection).toBe(null)
	})
})
