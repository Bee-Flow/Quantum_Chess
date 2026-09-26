/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Package "ai-ui" of handoff/CORE-CHANGES.md, pure parts: the computer's reply side (U3), its split candidates (U4)
 * and forcing moves (U14), the last-move squares (U1), the panel helpers (U5, U6, U10, U12, U16) and the texts (U7,
 * U9, U11, U17), plus the glyph of a promoted sprite piece (U13).
 */

import { describe, expect, it } from 'vitest'
import { glyphOf } from '../../../src/variantplay/glyphs.js'
import { lastMoveSquares, sidePieceAt } from '../../../src/variantplay/marks.js'
import {
	budgetPips,
	needsConfirmation,
	recordsSince,
	refusalKind,
	resignResult,
	sideInfoOf,
	sortHand,
} from '../../../src/variantplay/panel.js'
import {
	codeText,
	noteText,
	optionLines,
	optionValueText,
	outcomeText,
	reasonText,
	recordLines,
	sharedRules,
} from '../../../src/variantplay/texts.js'
import { aiSplits, chooseMove, mightForce } from '../../../src/variants/core/ai.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import { branches, legalMoves, newGame, T } from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { play, stateOf, workClock } from './helpers.js'

/**
 * An orthodox test variant with extra fields.
 *
 * @param {object} [extra] fields and hooks to add
 * @return {object}
 */
function orthodox(extra = {}) {
	return defineVariant(Object.assign(orthodoxSpec(), { id: 'test-ai-ui', category: 'rules' }, extra))
}

const V = orthodox()

/**
 * A seeded random number generator (mulberry32).
 *
 * @param {number} seed seed
 * @return {() => number}
 */
function seeded(seed) {
	let a = seed
	return () => {
		a = (a + 0x6D2B79F5) | 0
		let r = Math.imul(a ^ (a >>> 15), 1 | a)
		r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * The square index of a name.
 *
 * @param {string} name square name
 * @return {number}
 */
function sq(name) {
	return V.topology.byName(name)
}

describe('U3: the side whose reply the computer searches', () => {
	const position = { e1: '0:k', d1: '0:q', e8: '1:k', d8: '1:r', d5: '1:p' }

	it('by default avoids a capture that the next side takes back', async () => {
		const s = stateOf(V, [[position, 1]])
		const code = await chooseMove(V, s, { level: 'normal', rng: () => 0.5, now: workClock() })
		// the quiet moves tie; the checks among them (d1-e2) are tried first since they count as forcing (A1)
		expect(code).not.toBe('d1-d5')
		expect(legalMoves(V, s).map((m) => m.code)).toContain(code)
	})

	it('searches no reply when replySide gives null', async () => {
		const W = orthodox({ replySide: () => null })
		const s = stateOf(W, [[position, 1]])
		expect(await chooseMove(W, s, { level: 'normal', rng: () => 0.5, now: workClock() })).toBe('d1-d5')
	})

	it('asks replySide with the state after the move and my side', async () => {
		const seen = []
		const W = orthodox({
			replySide(s, me) {
				seen.push([s.turn, me])
				return s.turn
			},
		})
		const s = stateOf(W, [[position, 1]])
		expect(await chooseMove(W, s, { level: 'normal', rng: () => 0.5, now: workClock() })).not.toBe('d1-d5')
		expect(seen.length).toBeGreaterThan(0)
		expect(seen.every(([turn, me]) => turn === 1 && me === 0)).toBe(true)
	})

	it('searches another side\'s replies with that side to move (here my own continuation)', async () => {
		// as if I moved again: the queen goes where its next move takes the king
		const W = orthodox({ replySide: (s, me) => me })
		const s = stateOf(W, [[position, 1]])
		const code = await chooseMove(W, s, { level: 'normal', rng: () => 0.5, now: workClock() })
		expect(['d1-e2', 'd1-a4', 'd1-h5']).toContain(code)
	})

	it('takes a free queen as before', async () => {
		const s = stateOf(V, [[{ e1: '0:k', d1: '0:r', e8: '1:k', d7: '1:q' }, 1]])
		expect(await chooseMove(V, s, { level: 'normal', rng: () => 0.5, now: workClock() })).toBe('d1-d7')
	})
})

describe('U4: the split candidates of the computer', () => {
	const s = stateOf(V, [[{ e1: '0:k', d4: '0:q', e8: '1:k' }, 1]])

	it('pairs at most 6 targets and keeps at most 6 legal splits', () => {
		const codes = aiSplits(V, s, sq('d4'), seeded(1))
		expect(codes.length).toBeGreaterThan(0)
		expect(codes.length).toBeLessThanOrEqual(6)
		const targets = new Set(codes.flatMap((c) => c.split('-')[1].split('|')))
		expect(targets.size).toBeLessThanOrEqual(6)
		for (const c of codes) {
			expect(branches(V, s, c)).not.toBeNull()
			expect(c.startsWith('d4-')).toBe(true)
		}
	})

	it('is reproducible with the same seed and not always the lowest squares', () => {
		expect(aiSplits(V, s, sq('d4'), seeded(3))).toEqual(aiSplits(V, s, sq('d4'), seeded(3)))
		const seen = new Set()
		for (let seed = 1; seed <= 5; seed++) {
			for (const c of aiSplits(V, s, sq('d4'), seeded(seed))) {
				c.split('-')[1].split('|').forEach((t) => seen.add(t))
			}
		}
		expect(seen.size).toBeGreaterThan(6)
	})

	it('ranks the targets by the value of the world after the quiet move', () => {
		// the variant rewards a queen on the a-file: the best targets are a1, a4 and a7
		const W = orthodox({
			evaluate(b, side) {
				const id = b.ty.indexOf('q')
				return b.sd[id] === side && W.topology.coords[b.sq[id]][0] === 0 ? 50 : 0
			},
		})
		const w = stateOf(W, [[{ e1: '0:k', d4: '0:q', e8: '1:k' }, 1]])
		const codes = aiSplits(W, w, W.topology.byName('d4'), seeded(2), 3)
		const targets = new Set(codes.flatMap((c) => c.split('-')[1].split('|')))
		expect([...targets].sort()).toEqual(['a1', 'a4', 'a7'])
		expect(codes).toHaveLength(3)
	})

	it('gives nothing for a piece that cannot split', () => {
		expect(aiSplits(V, s, sq('e1'), seeded(1))).toEqual([])
		expect(aiSplits(V, newGame(V), sq('d1'), seeded(1))).toEqual([])
	})
})

describe('U14: forcing moves', () => {
	const W = defineVariant(Object.assign(orthodoxSpec(), {
		id: 'test-force',
		category: 'rules',
		worldResult(b) {
			const k = b.ty.findIndex((t, id) => t === 'k' && b.sd[id] === 0)
			return b.sq[k] === W.topology.byName('e4') ? { winner: 0, reason: 'hill' } : null
		},
	}))

	it('counts a move that ends the game, and still a capture', () => {
		const s = stateOf(W, [[{ e3: '0:k', e8: '1:k', a2: '0:p' }, 1]])
		expect(mightForce(W, s, 'e3-e4')).toBe(true)
		expect(mightForce(W, s, 'a2-a3')).toBe(false)
		const c = stateOf(V, [[{ e1: '0:k', d1: '0:r', e8: '1:k', d7: '1:q' }, 1]])
		expect(mightForce(V, c, 'd1-d7')).toBe(true)
		expect(mightForce(V, c, 'd1-d6')).toBe(false)
		expect(mightForce(V, c, 'd1-h5')).toBe(false)
	})
})

describe('U1: the squares of the last move', () => {
	it('uses the squares stored on the record', () => {
		expect(lastMoveSquares(V, { code: 'O-O', from: [4], to: [6] })).toEqual([4, 6])
		expect(lastMoveSquares(V, { code: '(0T5)b1>>(0T3)b3', from: [9], to: [17, -1] })).toEqual([9, 17])
	})

	it('reads the code of an older record', () => {
		expect(lastMoveSquares(V, { code: 'e2-e4' })).toEqual([sq('e2'), sq('e4')])
		expect(lastMoveSquares(V, { code: 'e7-e8=q' })).toEqual([sq('e7'), sq('e8')])
		expect(lastMoveSquares(V, { code: 'n@f3' })).toEqual([sq('f3')])
		expect(lastMoveSquares(V, { code: 'g1-f3|h3' })).toEqual([sq('g1'), sq('f3'), sq('h3')])
		expect(lastMoveSquares(V, { code: 'f3|h3-g1' })).toEqual([sq('f3'), sq('h3'), sq('g1')])
		expect(lastMoveSquares(V, { code: '?f3' })).toEqual([sq('f3')])
	})

	it('gives nothing for a code without squares, and never throws', () => {
		for (const code of ['O-O', 'O-O-O', '(0T5)b1>>(0T3)b3', 'z9-q0', '', null, 42]) {
			expect(() => lastMoveSquares(V, { code })).not.toThrow()
			expect(lastMoveSquares(V, { code })).toEqual([])
		}
		expect(lastMoveSquares(V, undefined)).toEqual([])
	})

	it('marks the king\'s squares of a castling record of the core', () => {
		const s = stateOf(V, [[{ e1: '0:k', h1: '0:r', e8: '1:k' }, 1]], 0, (w) => {
			w.x = { ep: -1, epVictim: -1, castle: [{ flag: 'K', side: 0, king: 4, rook: 7, kingTo: 6, rookTo: 5 }] }
		})
		const after = play(V, s, 'O-O')
		expect(lastMoveSquares(V, after.history.at(-1))).toEqual([sq('e1'), sq('g1')])
	})
})

describe('U10(a): the piece a selection may mark', () => {
	it('ignores an enemy ghost and finds the side\'s own piece in a later world', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', e8: '1:k', d5: '1:n' }, 1],
			[{ e1: '0:k', e8: '1:k', b6: '1:n', d5: '0:b' }, 1],
		])
		expect(sidePieceAt(s, sq('d5'), 0)).toBe(s.worlds[1].b.board[sq('d5')])
		expect(sidePieceAt(s, sq('b6'), 0)).toBe(-1)
		expect(sidePieceAt(s, sq('d5'), 1)).toBe(s.worlds[0].b.board[sq('d5')])
		expect(sidePieceAt(s, sq('a3'), 0)).toBe(-1)
	})
})

describe('U5: budget pips', () => {
	it('show the used budget and the limit of the budget rule', () => {
		const s = play(V, newGame(V), 'g1-f3|h3')
		expect(budgetPips(V, s, 0, 0)).toEqual({ known: true, used: 2, limit: 8 })
		expect(budgetPips(V, s, 1, 0)).toEqual({ known: true, used: 1, limit: 8 })
		const W = orthodox({ budgetRule: () => ({ limit: 4 }) })
		expect(budgetPips(W, newGame(W), 1, 0)).toEqual({ known: true, used: 1, limit: 4 })
	})

	it('give partners of a team budget the same number', () => {
		const W = orthodox({ budgetRule: () => ({ sides: [0, 1], limit: 8 }) })
		const s = play(W, newGame(W), 'g1-f3|h3')
		expect(budgetPips(W, s, 0, 0)).toEqual(budgetPips(W, s, 1, 0))
		expect(budgetPips(W, s, 1, 0).used).toBe(2)
	})

	it('hide the other sides\' budgets while a hidden game runs', () => {
		const W = orthodox({ hidden: true })
		const s = play(W, newGame(W), 'g1-f3|h3')
		expect(budgetPips(W, s, 0, 0)).toEqual({ known: true, used: 2, limit: 8 })
		expect(budgetPips(W, s, 0, 1).known).toBe(false)
		expect(budgetPips(W, s, 1, 0).known).toBe(false)
		const over = { ...s, result: { winner: 0, reason: 'resign' } }
		expect(budgetPips(W, over, 0, 1)).toEqual({ known: true, used: 2, limit: 8 })
	})
})

describe('U6: the variant\'s text in a player row', () => {
	it('comes from sideInfo, with the viewer', () => {
		const calls = []
		const W = orthodox({
			sideInfo(state, side, viewer) {
				calls.push([side, viewer])
				return side === 0 ? { text: '2/3', title: 'Checks given' } : null
			},
		})
		const s = newGame(W)
		expect(sideInfoOf(W, s, 0, 1)).toEqual({ text: '2/3', title: 'Checks given' })
		expect(sideInfoOf(W, s, 1, 1)).toBeNull()
		expect(calls).toEqual([[0, 1], [1, 1]])
		expect(sideInfoOf(V, s, 0, 0)).toBeNull()
	})
})

describe('U7: texts', () => {
	it('asks the variant for a note first', () => {
		const W = orthodox({ noteText: (note) => (/checks:(\d+):(\d+)$/.test(note) ? 'Checks: 1 : 0' : null) })
		expect(noteText(W, 'solid:checks:1:0')).toBe('Checks: 1 : 0')
		expect(noteText(W, 'solid:')).toBe('A piece that is always solid was settled')
		expect(noteText(V, 'end:null')).toBe('The game goes on')
		expect(noteText(V, 'end:' + JSON.stringify({ winner: 0, reason: 'king' })))
			.toBe('The game ends: White wins (a king was captured)')
	})

	it('words the outcomes of a drop', () => {
		expect(outcomeText('move', 'n@f3')).toBe('Dropped')
		expect(outcomeText('miss', 'n@f3')).toBe('Missed: the piece stays in hand')
		expect(outcomeText('move', 'e2-e4')).toBe('Moved')
		expect(outcomeText('miss')).toBe('Missed')
		expect(outcomeText('capture', 'e4-d5')).toBe('Captured')
		expect(outcomeText('f3', '?f3')).toBe('On f3')
	})

	it('has a generic text for the bare-kings draw and keeps the variant\'s own reasons first', () => {
		expect(reasonText(V, 'bareKings')).toBe('only the two kings are left')
		const W = orthodox({ reasonText: (r) => (r === 'bareKings' ? 'own' : null) })
		expect(reasonText(W, 'bareKings')).toBe('own')
	})

	it('says that castling and en passant never roll', () => {
		const sentence
			= 'Castling and en passant are allowed only when they are possible in every possibility; they are never rolled.'
		expect(sharedRules()).toContain(sentence)
	})
})

describe('U9: the lines of a record', () => {
	it('come from infoText, then one line per side that sat out', () => {
		const W = orthodox({
			infoText: (record, viewer) => (record.info ? ['Check: ' + record.info.check + ' (' + viewer + ')'] : null),
		})
		expect(recordLines(W, { code: 'e2-e4', side: 0, info: { check: 'file' } }, 1)).toEqual(['Check: file (1)'])
		expect(recordLines(W, { code: 'e2-e4', side: 0, skipped: [1] }, 0)).toEqual(['Black cannot move and sits out'])
		expect(recordLines(V, { code: 'e2-e4', side: 0 }, 0)).toEqual([])
	})

	it('are reported from the viewer\'s own last move on', () => {
		const h = [{ side: 0, code: 'a' }, { side: 1, code: 'b' }, { side: 0, code: 'c' }, { side: 1, code: 'd' }]
		expect(recordsSince(h, 0).map((r) => r.code)).toEqual(['c', 'd'])
		expect(recordsSince(h, 1).map((r) => r.code)).toEqual(['d'])
		expect(recordsSince(h.slice(0, 1), 1).map((r) => r.code)).toEqual(['a'])
		expect(recordsSince([], 0)).toEqual([])
	})
})

describe('U10: hidden information in the panel', () => {
	it('(d) an umpire makes an attempt binding: no confirmation of the odds', () => {
		const outs = [{ key: 'miss', p: 0.5 }, { key: 'capture', p: 0.5 }]
		expect(needsConfirmation(V, outs)).toBe(true)
		expect(needsConfirmation(V, outs.slice(0, 1))).toBe(false)
		expect(needsConfirmation(orthodox({ umpire: true }), outs)).toBe(false)
	})

	it('(b) the umpire says no only to what the player could not know from the own view', () => {
		// the own view knows no enemy pieces: a split onto a square an enemy ghost may hold is legal there only
		const ownView = (state) => ({
			...state,
			worlds: [{ b: state.worlds[0].b, w: T }],
		})
		const W = orthodox({ hidden: true, umpire: true, ownView })
		const real = stateOf(W, [
			[{ e1: '0:k', e8: '1:k', g1: '0:n' }, 1],
			[{ e1: '0:k', e8: '1:k', g1: '0:n', h3: '1:b' }, 1],
		])
		const own = ownView(real)
		expect(branches(W, real, 'g1-f3|h3')).toBeNull()
		expect(refusalKind(W, own, 'g1-f3|h3')).toBe('umpire')
		expect(refusalKind(W, own, 'g1-e2|h3')).toBe('umpire')
		expect(refusalKind(W, own, 'g1-g2|g3')).toBe('illegal')
		expect(refusalKind(W, own, 'e2-e4')).toBe('umpire')
		const D = orthodox({ hidden: true })
		expect(refusalKind(D, real, 'e2-e4')).toBe('illegal')
		expect(refusalKind(V, real, 'g1-f3|h3')).toBe('illegal')
	})
})

describe('U11: option values', () => {
	const W = orthodox({
		options: [
			{
				id: 'pos',
				type: 'number',
				label: () => 'Start position (0–959)',
				min: 0,
				max: 959,
				default: 518,
				describe: (v) => (v === 518 ? 'RNBQKBNR' : null),
			},
			{
				id: 'mode',
				type: 'choice',
				label: () => 'Mode',
				default: 'ffa',
				values: [{ id: 'ffa', label: () => 'Free for all' }, { id: 'teams', label: () => 'Teams' }],
			},
			{ id: 'fast', type: 'boolean', label: () => 'Fast', default: false },
		],
	})

	it('describe a value with the option\'s own text, the choice label, yes / no or the number', () => {
		expect(optionValueText(W.options[0], 518)).toBe('RNBQKBNR')
		expect(optionValueText(W.options[0], 12)).toBe('12')
		expect(optionValueText(W.options[1], 'teams')).toBe('Teams')
		expect(optionValueText(W.options[2], true)).toBe('Yes')
	})

	it('give one line per option of a game', () => {
		expect(optionLines(W, { pos: 518, mode: 'ffa', fast: false }))
			.toEqual(['Start position (0–959): RNBQKBNR', 'Mode: Free for all', 'Fast: No'])
		expect(optionLines(W, {})[0]).toBe('Start position (0–959): RNBQKBNR')
		expect(optionLines(V, {})).toEqual([])
	})
})

describe('U12: the result of a resignation', () => {
	it('is a win for every enemy by default, or the variant\'s own', () => {
		const s = newGame(V)
		expect(resignResult(V, s, 0)).toEqual({ winner: 1, reason: 'resign' })
		const four = { sides: [0, 1, 2, 3], enemies: (a, b) => a % 2 !== b % 2 }
		expect(resignResult(four, s, 1)).toEqual({ winner: null, winners: [0, 2], reason: 'resign' })
		const W = orthodox({
			resignResult: (state, loser) => ({ winner: null, winners: [loser + 1], reason: 'resign' }),
		})
		expect(resignResult(W, s, 0)).toEqual({ winner: null, winners: [1], reason: 'resign' })
	})
})

describe('U13: promoted sprite pieces', () => {
	it('pass the promoted flag through the glyph', () => {
		const W = orthodox({
			types: { ...orthodoxSpec().types, '+q': { moves: [], value: 900, glyph: { sprite: 'q', promoted: true } } },
		})
		expect(glyphOf(W, '+q', 1)).toEqual({
			kind: 'sprite',
			symbol: 'qc-piece-cburnett-bQ',
			tint: null,
			promoted: true,
		})
		expect(glyphOf(W, 'q', 1).promoted).toBeUndefined()
	})
})

describe('U16, U17: hands and move codes', () => {
	it('sorts the hand by the variant\'s order, the rest last by id', () => {
		const pieces = [{ type: 'b' }, { type: 'q' }, { type: 'x' }, { type: 'p' }, { type: 'a' }, { type: 'n' }]
		const W = orthodox({ handOrder: ['p', 'n', 'b', 'r', 'q'] })
		expect(sortHand(W, pieces).map((p) => p.type)).toEqual(['p', 'n', 'b', 'q', 'a', 'x'])
		expect(sortHand(V, pieces).map((p) => p.type)).toEqual(['a', 'b', 'n', 'p', 'q', 'x'])
	})

	it('writes a drop with a capital letter unless the variant writes the code itself', () => {
		expect(codeText(V, 'p@e4')).toBe('P@e4')
		expect(codeText(V, '+p@e4')).toBe('+p@e4')
		expect(codeText(V, 'e2-e4')).toBe('e2-e4')
		const W = orthodox({ codeText: (code) => (code === 'O-O' ? '0-0' : null) })
		expect(codeText(W, 'O-O')).toBe('0-0')
		expect(codeText(W, 'n@f3')).toBe('N@f3')
	})
})
