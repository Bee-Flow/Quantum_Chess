/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Kriegspiel (src/variants/kriegspiel.js): the orthodox game in which each player sees only their own pieces, the
 * umpire's "no", the announcements (captures, check, pawn tries), the quantum rules seen through the umpire, and the
 * computer's view. The cases K1-K23 are those of handoff/research/kriegspiel.md, section 7.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { refusalKind } from '../../../src/variantplay/panel.js'
import { chooseMove, LEVELS } from '../../../src/variants/core/ai.js'
import {
	applyOutcome,
	branches,
	budget,
	legalMoves,
	mergesFrom,
	newGame,
	ordinaryMoves,
	pieceLocations,
	royalDanger,
	splitsFrom,
	splitTargets,
	stateAfter,
	T,
} from '../../../src/variants/core/quantum.js'
import { generate } from '../../../src/variants/core/world.js'
import V from '../../../src/variants/kriegspiel.js'
import { CHECK_PENALTY, evaluate } from '../../../src/variants/kriegspiel/computer.js'
import { announce, checkOf, pawnTries } from '../../../src/variants/kriegspiel/umpire.js'
import { play, stateOf } from './helpers.js'

const S = (name) => V.topology.byName(name)
const N = (sq) => V.topology.names[sq]

/**
 * The outcomes of an attempt as `key p` strings (with ` rolled` for a roll), or `No` when the umpire refuses it.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {string[]|string}
 */
function out(s, code) {
	const list = branches(V, s, code)
	return list ? list.map((b) => `${b.key} ${+(b.weight / T).toFixed(4)}${b.rolled ? ' rolled' : ''}`) : 'No'
}

/**
 * The announcement stored on the last record of a state.
 *
 * @param {object} s state
 * @return {object}
 */
function said(s) {
	return s.history.at(-1).info.announce
}

/**
 * What stands on some squares, per world: `weight:e4 0p,d5 -` (side and type, or `-` for empty).
 *
 * @param {object} s state
 * @param {string[]} squares square names
 * @return {string}
 */
function where(s, squares) {
	return s.worlds.map(({ b, w }) => +(w / T).toFixed(4) + ':' + squares.map((q) => {
		const id = b.board[S(q)]
		return q + ' ' + (id >= 0 ? b.sd[id] + b.ty[id] : '-')
	}).join(',')).join(' | ')
}

/**
 * Worlds with White's short castling right only.
 *
 * @param {object} b world being built
 */
function castleK(b) {
	const right = { flag: 'K', side: 0, king: S('e1'), rook: S('h1'), kingTo: S('g1'), rookTo: S('f1') }
	b.x = { ep: -1, epVictim: -1, castle: [right] }
}

/**
 * A history record with only what the umpire said (the computer reads nothing else of the opponent's records).
 *
 * @param {number} side the side that moved
 * @param {object} announced the announcement
 * @return {object}
 */
function record(side, announced) {
	return { code: 'x', side, info: { announce: announced } }
}

/**
 * Every combination of the given choices as placements: `[[placement, 1], ...]`.
 *
 * @param {Record<string, string>} fixed pieces in every world
 * @param {Array<Array<Record<string, string>>>} choices lists of alternative placements
 * @return {Array<[Record<string, string>, number]>}
 */
function combos(fixed, choices) {
	let list = [fixed]
	for (const alternatives of choices) {
		list = list.flatMap((p) => alternatives.map((a) => ({ ...p, ...a })))
	}
	return list.map((p) => [p, 1])
}

describe('kriegspiel: setup and movement', () => {
	it('starts from the orthodox position with both castling rights, White to move', () => {
		const s = newGame(V)
		const b = s.worlds[0].b
		const back = 'rnbqkbnr'
		const seen = {}
		b.board.forEach((id, sq) => {
			if (id >= 0) {
				seen[N(sq)] = b.sd[id] + b.ty[id]
			}
		})
		const want = {}
		for (let f = 0; f < 8; f++) {
			const file = 'abcdefgh'[f]
			want[file + '1'] = '0' + back[f]
			want[file + '2'] = '0p'
			want[file + '7'] = '1p'
			want[file + '8'] = '1' + back[f]
		}
		expect(seen).toEqual(want)
		expect(s.turn).toBe(0)
		expect(b.x.castle.map((c) => c.flag).sort()).toEqual(['K', 'Q', 'k', 'q'])
		expect(V.id).toBe('kriegspiel')
		expect(V.category).toBe('uncertainty')
		expect(V.hidden && V.umpire && V.hiddenStyle === 'plain').toBe(true)
	})

	it('shows each side only the squares of its own pieces (K1)', () => {
		const s = newGame(V)
		const white = [...V.visibility(s, 0)].map(N).sort()
		expect(white).toHaveLength(16)
		expect(white.every((q) => q[1] === '1' || q[1] === '2')).toBe(true)
		const after = play(V, s, 'e2-e4')
		expect(V.visibility(after, 0).has(S('e4'))).toBe(true)
		expect(V.visibility(after, 0).has(S('e2'))).toBe(false)
		expect([...V.visibility(after, 1)].map(N).every((q) => q[1] === '7' || q[1] === '8')).toBe(true)
	})

	it('moves every piece type as in orthodox chess', () => {
		const from = (placement, sq, turn = 0) => {
			const s = stateOf(V, [[placement, 1]], turn)
			return ordinaryMoves(V, s).filter((m) => m.from === S(sq)).length
		}
		const kings = { h1: '0:k', a8: '1:k' }
		expect(from({ ...kings, d4: '0:q' }, 'd4')).toBe(27)
		expect(from({ ...kings, d4: '0:r' }, 'd4')).toBe(14)
		expect(from({ ...kings, d4: '0:b' }, 'd4')).toBe(13)
		expect(from({ ...kings, d4: '0:n' }, 'd4')).toBe(8)
		expect(from(kings, 'h1')).toBe(3)
		expect(from({ ...kings, e4: '1:k', a1: '0:r' }, 'e4', 1)).toBe(8)
		// pawns: the single and double step, and on the last rank the four promotions
		expect(from({ ...kings, e2: '0:p' }, 'e2')).toBe(2)
		expect(from({ ...kings, e7: '1:p' }, 'e7', 1)).toBe(2)
		expect(from({ ...kings, e7: '0:p' }, 'e7')).toBe(4)
		// the pieces keep their orthodox names, sprites and values for the computer
		for (const type of ['k', 'q', 'r', 'b', 'n', 'p']) {
			expect(V.types[type].name()).toBeTruthy()
			expect(V.types[type].glyph.sprite).toBe(type)
			expect(V.types[type].value).toBeGreaterThan(0)
		}
		expect(V.rules().length).toBeGreaterThanOrEqual(3)
		expect(V.rules().length).toBeLessThanOrEqual(8)
	})
})

describe('kriegspiel: the umpire', () => {
	it('offers every move of the own board plus the pawn tries, and refuses the tries (K1)', () => {
		const s = newGame(V)
		const c = V.candidateMoves(s)
		const tries = c.filter((m) => m.kind === 'try')
		expect(c).toHaveLength(34)
		const diagonals = []
		for (let f = 0; f < 8; f++) {
			for (const d of [-1, 1]) {
				if (f + d >= 0 && f + d < 8) {
					diagonals.push('abcdefgh'[f] + '2-' + 'abcdefgh'[f + d] + '3')
				}
			}
		}
		expect(tries.map((m) => m.code).sort()).toEqual(diagonals.sort())
		expect(diagonals).toHaveLength(14)
		expect(tries.filter((m) => branches(V, s, m.code))).toEqual([])
		expect(pawnTries(V, s)).toBe(0)
		// every candidate has the shape the board expects
		expect(c.every((m) => m.type === 'move' && m.drop === null && m.from >= 0 && m.to >= 0)).toBe(true)
	})

	it('says no to a move blocked by a hidden piece, and nothing changes (K2)', () => {
		const s = stateOf(V, [[{ e1: '0:k', e2: '0:p', e8: '1:k', e3: '1:n' }, 1]])
		expect(V.candidateMoves(s).map((m) => m.code).sort())
			.toEqual(['e1-d1', 'e1-d2', 'e1-f1', 'e1-f2', 'e2-d3', 'e2-e3', 'e2-e4', 'e2-f3'])
		for (const code of ['e2-e4', 'e2-e3', 'e2-d3', 'e2-f3']) {
			expect(out(s, code)).toBe('No')
			expect(applyOutcome(V, s, code, 0)).toBeNull()
		}
		expect(s.history).toHaveLength(0)
		expect(s.turn).toBe(0)
		expect(out(s, 'e1-d1')).toEqual(['move 1'])
		expect(pawnTries(V, s)).toBe(0)
	})

	it('says no to a ghost part that is blocked in every possibility, and rolls one that might capture (K8)', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', d1: '0:q', d2: '1:n', e8: '1:k' }, 1],
			[{ e1: '0:k', d3: '0:q', d2: '1:n', e8: '1:k' }, 1],
		])
		// the own board shows the queen's part on d1 with a free file: the umpire knows d2 blocks it
		expect(V.candidateMoves(s).some((m) => m.code === 'd1-d5')).toBe(true)
		expect(out(s, 'd1-d5')).toBe('No')
		expect(out(s, 'd3-d5')).toEqual(['move 1'])
		expect(out(s, 'd1-d2')).toEqual(['miss 0.5 rolled', 'capture 0.5 rolled'])
	})

	it('gives the umpire\'s "no" unless the player could know it from their own pieces (K20, K21, K22)', () => {
		const s = stateOf(V, [[{ e1: '0:k', e4: '0:p', g1: '0:n', e8: '1:k', f3: '1:b' }, 1]])
		const own = V.ownView(s, 0)
		// a pawn try is illegal on the own board by construction, and still gets the umpire's answer
		expect(out(s, 'e4-d5')).toBe('No')
		expect(refusalKind(V, own, 'e4-d5')).toBe('umpire')
		// a split onto the hidden bishop's square is legal on the own board
		expect(out(s, 'g1-f3|h3')).toBe('No')
		expect(refusalKind(V, own, 'g1-f3|h3')).toBe('umpire')
		// White's budget is full (16 arrangements on both boards): the normal notice
		const full = stateOf(V, combos({ e1: '0:k', a1: '0:r', e8: '1:k' }, [
			[{ f3: '0:n' }, { h3: '0:n' }],
			[{ d2: '0:b' }, { e3: '0:b' }],
			[{ e2: '0:b' }, { d3: '0:b' }],
			[{ a4: '1:n' }, { c4: '1:n' }],
		]))
		expect(out(full, 'a1-a2|a3')).toBe('No')
		expect(refusalKind(V, V.ownView(full, 0), 'a1-a2|a3')).toBe('illegal')
		// K21's reverse: legal on the own board (8 arrangements), but the hidden knight on a4 keeps the a5 part home in
		// half the possibilities, which gives 12: the umpire's "no"
		const rev = stateOf(V, combos({ e1: '0:k', a1: '0:r', e8: '1:k' }, [
			[{ f3: '0:n' }, { h3: '0:n' }],
			[{ d2: '0:b' }, { e3: '0:b' }],
			[{ a4: '1:n' }, { c6: '1:n' }],
		]))
		expect(budget(rev, 0)).toBe(4)
		expect(out(V.ownView(rev, 0), 'a1-a3|a5')).toEqual(['split 1'])
		expect(out(rev, 'a1-a3|a5')).toBe('No')
		expect(refusalKind(V, V.ownView(rev, 0), 'a1-a3|a5')).toBe('umpire')
		// K20: measuring an own ghost never needs the umpire, and has the same odds on both boards
		const ghost = stateOf(V, [
			[{ e1: '0:k', e8: '1:k', d4: '0:n', f6: '1:n' }, 1],
			[{ e1: '0:k', e8: '1:k', f5: '0:n', b6: '1:n' }, 1],
		])
		expect(out(ghost, '?d4')).toEqual(['d4 0.5 rolled', 'f5 0.5 rolled'])
		expect(out(V.ownView(ghost, 0), '?d4')).toEqual(out(ghost, '?d4'))
	})

	it('announces captures by square and kind, and a long-diagonal check (K3)', () => {
		const s = stateOf(V, [[{ e1: '0:k', d1: '0:q', e8: '1:k', d7: '1:p' }, 1]])
		expect(out(s, 'd1-d7')).toEqual(['capture 1'])
		const next = play(V, s, 'd1-d7')
		expect(said(next)).toEqual({
			captures: [{ sq: 'd7', kind: 'pawn' }],
			check: { dirs: ['long'], p: 1 },
			tries: 0,
		})
		const list = branches(V, s, 'd1-d7')
		expect(announce(V, s, 'd1-d7', list[0], next)).toEqual(said(next))
		const back = play(V, next, 'e8-d7')
		expect(said(back)).toEqual({ captures: [{ sq: 'd7', kind: 'piece' }], check: null, tries: 0 })
	})

	it('names the check directions from the king\'s point of view (K4)', () => {
		const rows = [
			[{ a1: '0:k', e1: '0:r', f6: '0:n', e8: '1:k' }, ['file', 'knight']],
			[{ a1: '0:k', h5: '0:b', e8: '1:k' }, ['short']],
			[{ a1: '0:k', a4: '0:b', e8: '1:k' }, ['long']],
			[{ a1: '0:k', h8: '0:r', d7: '0:p', e8: '1:k' }, ['rank', 'long']],
			[{ e7: '0:k', e8: '1:k' }, ['file']],
			[{ d7: '0:k', e8: '1:k' }, ['long']],
		]
		for (const [placement, dirs] of rows) {
			expect(checkOf(V, stateOf(V, [[placement, 1]], 1))).toEqual({ dirs, p: 1 })
		}
		// the ICC help file: for a king on e1 the short diagonal is e1-h4
		expect(checkOf(V, stateOf(V, [[{ e1: '0:k', h4: '1:b', a8: '1:k' }, 1]]))).toEqual({ dirs: ['short'], p: 1 })
		expect(checkOf(V, stateOf(V, [[{ e1: '0:k', a5: '1:b', h8: '1:k' }, 1]]))).toEqual({ dirs: ['long'], p: 1 })
		expect(checkOf(V, stateOf(V, [[{ e1: '0:k', a4: '1:b', h8: '1:k' }, 1]]))).toBeNull()
	})

	it('counts pawn tries and announces en passant on the passing pawn\'s square (K5)', () => {
		const white = { e1: '0:k', e4: '0:p', d4: '0:p', g7: '0:p' }
		const s = stateOf(V, [[{ ...white, e8: '1:k', d5: '1:p', f5: '1:n', h8: '1:r' }, 1]])
		// e4xd5, e4xf5 and g7xh8 (four promotion keys, one try); the d4 pawn is blocked
		expect(pawnTries(V, s)).toBe(3)
		expect(legalMoves(V, s).filter((m) => m.code.startsWith('d4'))).toEqual([])
		const ep = stateOf(V, [[{ e1: '0:k', e5: '0:p', e8: '1:k', d7: '1:p' }, 1]], 1)
		const pushed = play(V, ep, 'd7-d5')
		expect(said(pushed)).toEqual({ captures: [], check: null, tries: 1 })
		expect(out(pushed, 'e5-d6')).toEqual(['capture 1'])
		const taken = play(V, pushed, 'e5-d6')
		expect(taken.history.at(-1).captures.map(N)).toEqual(['d6'])
		expect(said(taken).captures).toEqual([{ sq: 'd5', kind: 'pawn' }])
		expect(where(taken, ['d5', 'd6'])).toBe('1:d5 -,d6 0p')
	})

	it('castles only when it is possible in every possibility, and never announces it (K13)', () => {
		const one = stateOf(V, [[{ e1: '0:k', h1: '0:r', e8: '1:k', f1: '1:b' }, 1]], 0, castleK)
		expect(V.candidateMoves(one).some((m) => m.code === 'O-O')).toBe(true)
		expect(out(one, 'O-O')).toBe('No')
		const maybe = stateOf(V, [
			[{ e1: '0:k', h1: '0:r', e8: '1:k', f1: '1:b' }, 1],
			[{ e1: '0:k', h1: '0:r', e8: '1:k', c4: '1:b' }, 1],
		], 0, castleK)
		expect(V.candidateMoves(maybe).some((m) => m.code === 'O-O')).toBe(true)
		expect(out(maybe, 'O-O')).toBe('No')
		const free = stateOf(V, [
			[{ e1: '0:k', h1: '0:r', e8: '1:k', c4: '1:b' }, 1],
			[{ e1: '0:k', h1: '0:r', e8: '1:k', b5: '1:b' }, 1],
		], 0, castleK)
		expect(out(free, 'O-O')).toEqual(['move 1'])
		const castled = play(V, free, 'O-O')
		expect(said(castled)).toEqual({ captures: [], check: null, tries: 0 })
		expect(where(castled, ['e1', 'f1', 'g1', 'h1'])).toBe('0.5:e1 -,f1 0r,g1 0k,h1 - | 0.5:e1 -,f1 0r,g1 0k,h1 -')
		// no check in quantum chess: castling out of and through an attack is allowed
		for (const attacker of ['e5', 'f5']) {
			const s = stateOf(V, [[{ e1: '0:k', h1: '0:r', e8: '1:k', [attacker]: '1:r' }, 1]], 0, castleK)
			expect(out(s, 'O-O')).toEqual(['move 1'])
		}
	})

	it('lets a pawn promote without announcing it (K14)', () => {
		const s = stateOf(V, [[{ a1: '0:k', e7: '0:p', h1: '1:k', e8: '1:r', d8: '1:n' }, 1]])
		expect(V.candidateMoves(s).filter((m) => m.from === S('e7'))).toHaveLength(12)
		expect(pawnTries(V, s)).toBe(1)
		expect(out(s, 'e7-e8=q')).toBe('No')
		expect(out(s, 'e7-f8=q')).toBe('No')
		expect(out(s, 'e7-d8=q')).toEqual(['capture 1'])
		const next = play(V, s, 'e7-d8=q')
		expect(said(next)).toEqual({ captures: [{ sq: 'd8', kind: 'piece' }], check: null, tries: 0 })
		expect(where(next, ['d8'])).toBe('1:d8 0q')
	})

	it('puts the umpire\'s words on every record, the same for both players', () => {
		const s = stateOf(V, [[{ e1: '0:k', d1: '0:q', e8: '1:k', d7: '1:p' }, 1]])
		const next = play(V, s, 'd1-d7')
		const lines = V.infoText(next.history.at(-1), 0)
		expect(lines).toEqual([
			'White moved.',
			'Capture on d7: a pawn.',
			'Check: long diagonal (100 %).',
			'No pawn tries.',
		])
		expect(V.infoText(next.history.at(-1), 1)).toEqual(lines)
		const ep = play(V, stateOf(V, [[{ e1: '0:k', e5: '0:p', e8: '1:k', d7: '1:p' }, 1]], 1), 'd7-d5')
		expect(V.infoText(ep.history.at(-1), 0)).toEqual(['Black moved.', '1 pawn try.'])
		expect(V.infoText({ code: 'e2-e4', side: 0 }, 0)).toBeNull()
		// the move list asks for the lines that carry information only: no "… moved." and no "No pawn tries."
		expect(V.infoText(next.history.at(-1), 0, { brief: true }))
			.toEqual(['Capture on d7: a pawn.', 'Check: long diagonal (100 %).'])
		expect(V.infoText(ep.history.at(-1), 0, { brief: true })).toEqual(['1 pawn try.'])
		const quiet = play(V, stateOf(V, [[{ e1: '0:k', a2: '0:p', e8: '1:k' }, 1]]), 'a2-a3')
		expect(V.infoText(quiet.history.at(-1), 1, { brief: true })).toEqual([])
	})

	it('says on the rules card what the umpire really announces about en passant and ghosts', () => {
		const card = V.rules()
		// an en passant capture is announced (as a capture of a pawn), only not as en passant
		const ep = play(V, stateOf(V, [[{ e1: '0:k', e5: '0:p', e8: '1:k', d7: '1:p' }, 1]], 1), 'd7-d5')
		expect(V.infoText(play(V, ep, 'e5-d6').history.at(-1), 1)).toContain('Capture on d5: a pawn.')
		expect(card.some((line) => /en passant are never announced/.test(line))).toBe(false)
		expect(card.some((line) => line.includes('en passant as such are never announced'))).toBe(true)
		// a ghost also becomes solid when a rolled enemy move only passes one of its squares
		expect(card.some((line) => line.includes('land on or pass through one of its squares'))).toBe(true)
		// the classic end rules apply (LEAD-DECISIONS L1): the card must not deny them
		expect(card.some((line) => /no checkmate|only by capturing/i.test(line))).toBe(false)
		expect(card.some((line) => line.includes('when a king cannot escape or a draw comes'))).toBe(true)
	})
})

describe('kriegspiel: the quantum rules through the umpire', () => {
	it('rolls a pawn try on a ghost: a miss uses the turn and settles the ghost (K6, a roll)', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', e4: '0:p', e8: '1:k', d5: '1:n' }, 1],
			[{ e1: '0:k', e4: '0:p', e8: '1:k', b6: '1:n' }, 1],
		])
		expect(pawnTries(V, s)).toBe(1)
		expect(out(s, 'e4-f5')).toBe('No')
		expect(out(s, 'e4-d5')).toEqual(['miss 0.5 rolled', 'capture 0.5 rolled'])
		expect(said(play(V, s, 'e4-d5', 1)).captures).toEqual([{ sq: 'd5', kind: 'piece' }])
		const missed = play(V, s, 'e4-d5', 0)
		expect(missed.turn).toBe(1)
		expect(missed.history.at(-1).key).toBe('miss')
		expect(said(missed)).toEqual({ captures: [], check: null, tries: 0 })
		expect(where(missed, ['e4', 'd5', 'b6'])).toBe('1:e4 0p,d5 -,b6 1n')
	})

	it('settles a ghost on the path of a rolled enemy move that lands elsewhere (rules card sentence 7)', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', e8: '1:k', d7: '1:p', d6: '0:n' }, 1],
			[{ e1: '0:k', e8: '1:k', d7: '1:p', b5: '0:n' }, 1],
		], 1)
		// the double step passes d6: a solid pawn cannot link, so it is rolled
		expect(out(s, 'd7-d5')).toEqual(['miss 0.5 rolled', 'move 0.5 rolled'])
		expect(where(play(V, s, 'd7-d5', 0), ['d7', 'd6', 'b5'])).toBe('1:d7 1p,d6 0n,b5 -')
		const moved = play(V, s, 'd7-d5', 1)
		expect(where(moved, ['d5', 'd6', 'b5'])).toBe('1:d5 1p,d6 -,b5 0n')
		expect(said(moved)).toEqual({ captures: [], check: null, tries: 0 })
	})

	it('links a slider that passes a hidden ghost and announces a 50 % check (K7, pass = link)', () => {
		const s = stateOf(V, [
			[{ h1: '0:k', a1: '0:r', e8: '1:k', a4: '1:n' }, 1],
			[{ h1: '0:k', a1: '0:r', e8: '1:k', c4: '1:n' }, 1],
		])
		expect(out(s, 'a1-a8')).toEqual(['move 1'])
		const next = play(V, s, 'a1-a8')
		expect(said(next)).toEqual({ captures: [], check: { dirs: ['rank'], p: 0.5 }, tries: 0 })
		expect(V.infoText(next.history.at(-1), 1)).toContain('Check: rank (50 %).')
		expect(where(next, ['a1', 'a8'])).toBe('0.5:a1 -,a8 0r | 0.5:a1 0r,a8 -')
		// the budget fallback: with White's budget full, the same slide is rolled (K19)
		const full = stateOf(V, combos({ e1: '0:k', a1: '0:r', e8: '1:k' }, [
			[{ f3: '0:n' }, { h3: '0:n' }],
			[{ d2: '0:b' }, { e3: '0:b' }],
			[{ e2: '0:b' }, { d3: '0:b' }],
			[{ a4: '1:n' }, { c4: '1:n' }],
		]))
		expect(budget(full, 0)).toBe(8)
		expect(out(full, 'a1-a8')).toEqual(['miss 0.5 rolled', 'move 0.5 rolled'])

		// K17: a measurement settles the linked enemy knight and may give check
		const moved = play(V, next, 'e8-f8')
		expect(said(moved)).toEqual({ captures: [], check: null, tries: 0 })
		expect(out(moved, '?a1')).toEqual(['a1 0.5 rolled', 'a8 0.5 rolled'])
		const home = play(V, moved, '?a1', 0)
		expect(said(home)).toEqual({ captures: [], check: null, tries: 0 })
		expect(where(home, ['a1', 'a8', 'a4', 'c4'])).toBe('1:a1 0r,a8 -,a4 1n,c4 -')
		const up = play(V, moved, '?a1', 1)
		expect(said(up)).toEqual({ captures: [], check: { dirs: ['rank'], p: 1 }, tries: 0 })
		expect(where(up, ['a1', 'a8', 'a4', 'c4'])).toBe('1:a1 -,a8 0r,a4 -,c4 1n')
	})

	it('decides a king capture by the landing roll, without a settling roll (K9, game end)', () => {
		const s = stateOf(V, [
			[{ e1: '0:k', a4: '0:q', e8: '1:k' }, 1],
			[{ e1: '0:k', h4: '0:q', e8: '1:k' }, 1],
		])
		expect(out(s, 'a4-e8')).toEqual(['miss 0.5 rolled', 'capture 0.5 rolled'])
		expect(branches(V, s, 'a4-e8').map((b) => b.notes)).toEqual([[], []])
		const won = play(V, s, 'a4-e8', 1)
		expect(won.result).toEqual({ winner: 0, reason: 'king' })
		expect(said(won)).toEqual({ captures: [{ sq: 'e8', kind: 'king' }], check: null, tries: 0 })
		expect(V.infoText(won.history.at(-1), 1)).toEqual(['White moved.', 'The king on e8 is captured.'])
		expect(V.candidateMoves(won)).toEqual([])
		const missed = play(V, s, 'a4-e8', 0)
		expect(missed.result).toBeNull()
		expect(where(missed, ['a4', 'h4'])).toBe('1:a4 -,h4 0q')
		expect(checkOf(V, { ...s, turn: 1 })).toEqual({ dirs: ['long'], p: 0.5 })
	})

	it('counts a converging capture: the merge takes the unseen king for certain (K10, K18)', () => {
		const worlds = (king) => [
			[{ e1: '0:k', a4: '0:q', [king]: '1:k' }, 1],
			[{ e1: '0:k', h5: '0:q', [king]: '1:k' }, 1],
		]
		const s = stateOf(V, worlds('e8'))
		expect(out(s, 'a4|h5-e8')).toEqual(['capture 1'])
		expect(play(V, s, 'a4|h5-e8').result).toEqual({ winner: 0, reason: 'king' })
		const beside = stateOf(V, worlds('g8'))
		const merged = play(V, beside, 'a4|h5-e8')
		expect(said(merged).check).toEqual({ dirs: ['rank'], p: 1 })
		expect(where(merged, ['e8'])).toBe('1:e8 0q')
		// the check chance counts the merge: each single move captures in half the possibilities only
		const black = stateOf(V, worlds('e8'), 1)
		expect(checkOf(V, black)).toEqual({ dirs: ['long', 'short'], p: 1 })
		const three = stateOf(V, [...worlds('e8'), [{ e1: '0:k', a1: '0:q', e8: '1:k' }, 1]], 1)
		const c = checkOf(V, three)
		expect(c.dirs).toEqual(['long', 'short'])
		expect(c.p).toBeCloseTo(2 / 3, 4)
		expect(royalDanger(V, three, 1)).toBeCloseTo(c.p, 9)
	})

	it('decides a split on the real board, not on the own view (K11, K21, a split)', () => {
		const s = stateOf(V, [[{ e1: '0:k', g1: '0:n', e8: '1:k', f3: '1:b' }, 1]])
		expect(splitTargets(V, V.ownView(s, 0), S('g1')).map(N)).toEqual(['e2', 'f3', 'h3'])
		expect(out(V.ownView(s, 0), 'g1-f3|h3')).toEqual(['split 1'])
		expect(out(s, 'g1-f3|h3')).toBe('No')
		expect(out(s, 'g1-e2|h3')).toEqual(['split 1'])
		// hidden blockers keep a split under the budget that the own view would break
		const k21 = stateOf(V, combos({ e1: '0:k', c1: '0:b', e8: '1:k' }, [
			[{ a1: '0:r' }, { h1: '0:r' }],
			[{ f3: '0:n', b6: '1:n' }, { h3: '0:n', d2: '1:n' }, { g5: '0:n', d2: '1:n' }],
		]))
		expect(budget(k21, 0)).toBe(6)
		expect(out(V.ownView(k21, 0), 'c1-e3|f4')).toBe('No')
		expect(out(k21, 'c1-e3|f4')).toEqual(['split 1'])
		const split = play(V, k21, 'c1-e3|f4')
		expect(budget(split, 0)).toBe(8)
		const bishop = k21.worlds[0].b.board[S('c1')]
		expect(pieceLocations(split, bishop).map((l) => N(l.sq) + ' ' + l.p.toFixed(4)))
			.toEqual(['c1 0.6667', 'e3 0.1667', 'f4 0.1667'])
		expect(said(split)).toEqual({ captures: [], check: null, tries: 0 })
	})

	it('ends the en passant right after one ply, also where the moves missed (K16)', () => {
		const s = stateOf(V, combos({ e1: '0:k', e8: '1:k', d2: '0:p', e4: '1:p' }, [
			[{ f3: '0:n' }, { h3: '0:n' }],
			[{ f6: '1:n' }, { h6: '1:n' }],
		]))
		expect(out(s, 'd2-d4')).toEqual(['move 1'])
		const pushed = play(V, s, 'd2-d4')
		expect(said(pushed).tries).toBe(2)
		expect(out(pushed, 'e4-d3')).toEqual(['capture 1'])
		const black = play(V, pushed, 'f6-g4')
		expect(out(black, 'f3-g5')).toEqual(['move 1'])
		const later = play(V, black, 'f3-g5')
		expect(said(later).tries).toBe(0)
		expect(V.candidateMoves(later).some((m) => m.code === 'e4-d3')).toBe(true)
		expect(out(later, 'e4-d3')).toBe('No')
	})

	it('ends in a draw after 50 moves by each side without a capture or a pawn move', () => {
		const s = { ...stateOf(V, [[{ e1: '0:k', a1: '0:r', e8: '1:k', e2: '0:p', e7: '1:p' }, 1]]), quiet: 99 }
		expect(play(V, s, 'a1-a2').result).toEqual({ winner: null, reason: 'quiet' })
		expect(play(V, s, 'e2-e3').result).toBeNull()
		expect(play(V, s, 'e2-e3').quiet).toBe(0)
	})

	it('names no pawn tries after a draw, although the other side has a pawn capture', () => {
		const pawns = { e1: '0:k', a1: '0:r', e8: '1:k', e4: '0:p', d5: '1:p' }
		const quiet = play(V, { ...stateOf(V, [[pawns, 1]]), quiet: 99 }, 'a1-a2')
		expect(quiet.result).toEqual({ winner: null, reason: 'quiet' })
		expect(said(quiet)).toEqual({ captures: [], check: null, tries: 0 })
		expect(quiet.history.at(-1).info.end).toBe(true)
		expect(V.infoText(quiet.history.at(-1), 1)).toEqual(['White moved.'])
		const limit = play(V, { ...stateOf(V, [[pawns, 1]]), ply: 599 }, 'a1-a2')
		expect(limit.result).toEqual({ winner: null, reason: 'moveLimit' })
		expect(V.infoText(limit.history.at(-1), 1)).toEqual(['White moved.'])
		// while the game goes on, the same move names Black's try and marks no end
		const on = play(V, stateOf(V, [[pawns, 1]]), 'a1-a2')
		expect(on.history.at(-1).info.end).toBeUndefined()
		expect(V.infoText(on.history.at(-1), 1)).toEqual(['White moved.', '1 pawn try.'])
	})

	it('keeps the classic end rules, decided by the umpire on the real board (LEAD-DECISIONS L1)', () => {
		expect([V.escapeRule, V.bareKingsDraw, V.drawsWait]).toEqual([true, true, true])
		// every move of White's king goes next to the queen or the king: Black wins without having seen that king
		const trapped = play(V, stateOf(V, [[{ a1: '0:k', c2: '1:k', b4: '1:q' }, 1]], 1), 'b4-b3')
		expect(trapped.result).toEqual({ winner: 1, reason: 'cannotEscape' })
		expect(trapped.history.at(-1).info.end).toBe(true)
		expect(V.infoText(trapped.history.at(-1), 0)).toEqual(['Black moved.'])
		expect(V.candidateMoves(trapped)).toEqual([])
		// a hidden White knight that might take Black's king (on e3, in half the possibilities) is an escape
		const ghost = play(V, stateOf(V, [
			[{ a1: '0:k', c2: '1:k', b4: '1:q', e3: '0:n' }, 1],
			[{ a1: '0:k', c2: '1:k', b4: '1:q', h8: '0:n' }, 1],
		], 1), 'b4-b3')
		expect(ghost.result).toBeNull()
		expect(out(ghost, 'e3-c2')).toEqual(['miss 0.5 rolled', 'capture 0.5 rolled'])
		// only the two kings left is a draw, and the umpire names no pawn tries after it
		const bare = play(V, stateOf(V, [[{ e1: '0:k', e8: '1:k', d7: '0:r' }, 1]], 1), 'e8-d7')
		expect(bare.result).toEqual({ winner: null, reason: 'bareKings' })
		expect(V.infoText(bare.history.at(-1), 0)).toEqual(['Black moved.', 'Capture on d7: a piece.'])
		// the 50-move draw waits while White can take the king on d2 for certain
		const near = { ...stateOf(V, [[{ e1: '0:k', d2: '1:k', a8: '1:r' }, 1]], 1), quiet: 99 }
		const waiting = play(V, near, 'a8-b8')
		expect(waiting.result).toBeNull()
		expect(V.infoText(waiting.history.at(-1), 0))
			.toEqual(['Black moved.', 'Check: long diagonal (100 %).', 'No pawn tries.'])
		expect(play(V, waiting, 'e1-d2').result).toEqual({ winner: 0, reason: 'king' })
		// without that certain capture the draw comes at once
		const far = { ...stateOf(V, [[{ e1: '0:k', d4: '1:k', a8: '1:r' }, 1]], 1), quiet: 99 }
		expect(play(V, far, 'a8-b8').result).toEqual({ winner: null, reason: 'quiet' })
	})
})

describe('kriegspiel: the computer', () => {
	it('sees exactly what a player sees (K12, no peeking)', () => {
		const s0 = play(V, newGame(V), 'e2-e4')
		const a = play(V, s0, 'a7-a5')
		const b = play(V, s0, 'h7-h5')
		const codes = (s) => V.candidateMoves(s).map((m) => m.code).sort()
		expect(codes(a)).toEqual(codes(b))
		expect(codes(a)).toHaveLength(44)
		expect(V.candidateMoves(a).filter((m) => m.kind === 'try')).toHaveLength(14)
		const va = V.aiView(a, 0)
		expect(va).toEqual(V.aiView(b, 0))
		expect(va.history).toEqual([])
		expect(va.quiet).toBe(0)
		expect(va.worlds.reduce((sum, e) => sum + e.w, 0)).toBe(T)
		for (const { b: w } of va.worlds) {
			expect(w.sq.filter((q, id) => w.sd[id] === 1 && w.ty[id] === 'k' && q >= 0)).toHaveLength(1)
			const real = a.worlds[0].b
			for (let id = 0; id < real.sq.length; id++) {
				if (real.sd[id] === 0) {
					expect(w.sq[id]).toBe(real.sq[id])
				}
			}
		}
	})

	it('always finds a move the umpire accepts (K23)', async () => {
		const white = { a1: '0:k', b1: '0:b', a2: '0:p', b2: '0:p', c2: '0:p' }
		const s = stateOf(V, [[{ ...white, e8: '1:k', a3: '1:p', b3: '1:p', c3: '1:p' }, 1]])
		const legal = ['a2-b3', 'b2-a3', 'b2-c3', 'c2-b3']
		expect(legalMoves(V, s).map((m) => m.code).sort()).toEqual(legal)
		// without any announcement (the phantoms stand at home, every push is refused)
		expect(legal).toContain(await chooseMove(V, s, { level: 'easy', rng: () => 0.5 }))
		// the view itself then holds moves the umpire accepts, without the core's own fallback: only the phantom
		// king and a phantom pawn on the first accepted pawn try (b3, which both a2 and c2 can take)
		const fallback = V.aiView(s, 0)
		expect(legalMoves(V, fallback).filter((m) => branches(V, s, m.code)).map((m) => m.code).sort())
			.toEqual(['a2-b3', 'c2-b3'])
		const enemy = fallback.worlds[0].b.sq.map((q, id) => ({ q, id })).filter(({ q, id }) => q >= 0
			&& fallback.worlds[0].b.sd[id] === 1)
		expect(enemy.map(({ q, id }) => N(q) + fallback.worlds[0].b.ty[id]).sort()).toEqual(['b3p', 'e8k'])
		// with the announcement of 4 pawn tries: phantom pawns on the capture squares
		const told = { ...s, history: [record(1, { captures: [], check: null, tries: pawnTries(V, s) })] }
		const view = V.aiView(told, 0)
		expect(['a3', 'b3', 'c3', 'd3'].every((q) => view.worlds[0].b.board[S(q)] >= 0)).toBe(true)
		expect(legal).toContain(await chooseMove(V, told, { level: 'normal', rng: () => 0.5 }))
	})

	it('keeps the announced check in its view and wants the king off the check line', () => {
		const s = stateOf(V, [[{ e1: '0:k', a1: '0:r', e8: '1:k' }, 1]], 1)
		const announced = { captures: [{ sq: 'e5', kind: 'piece' }], check: { dirs: ['file'], p: 1 }, tries: 0 }
		const told = { ...s, history: [record(0, announced)] }
		const view = V.aiView(told, 1)
		const w = view.worlds[0].b
		expect(w.x.aiCheck).toEqual({ side: 1, k: S('e8'), dirs: ['file'] })
		// the piece that captured last stands on the capture square now (a phantom piece, not a pawn)
		const capturer = w.board[S('e5')]
		expect(capturer).toBeGreaterThanOrEqual(0)
		expect([w.sd[capturer], w.ty[capturer] === 'p']).toEqual([0, false])
		expect(evaluate(V, w, 1)).toBe(-CHECK_PENALTY)
		expect(evaluate(V, w, 0)).toBe(CHECK_PENALTY)
		const moved = applyOutcome(V, { ...view, worlds: [{ b: w, w: T }] }, 'e8-d8', 0).worlds[0].b
		expect(evaluate(V, moved, 1)).toBe(0)
		expect(evaluate(V, newGame(V).worlds[0].b, 0)).toBe(0)
	})

	it('plays a legal move from the start at every level within its time budget', async () => {
		const s = newGame(V)
		for (const level of LEVELS) {
			const started = Date.now()
			const code = await chooseMove(V, s, { level: level.id, rng: seededRng(5) })
			expect(Date.now() - started).toBeLessThan(level.timeMs + 1000)
			expect(branches(V, s, code), level.id + ' ' + code).not.toBeNull()
		}
	})
})

describe('kriegspiel: random games as a player attempts them (K15)', () => {
	/**
	 * The attempts a player could make: the candidates, and splits, merges and measurements chosen on the own view.
	 *
	 * @param {object} s state
	 * @param {() => number} rng random numbers
	 * @return {string[]}
	 */
	function attempts(s, rng) {
		const own = V.ownView(s, s.turn)
		const extra = []
		for (const sq of V.visibility(s, s.turn)) {
			if (rng() < 0.3) {
				extra.push(...splitsFrom(V, own, sq).map((m) => m.code))
			}
			extra.push(...mergesFrom(V, own, sq).map((m) => m.code))
		}
		extra.push(...legalMoves(V, own).filter((m) => m.type === 'measure').map((m) => m.code))
		const list = V.candidateMoves(s).map((m) => m.code)
		return rng() < 0.4 && extra.length ? [...extra, ...list] : list
	}

	/**
	 * Check the Kriegspiel invariants of a state.
	 *
	 * @param {object} s state
	 */
	function check(s) {
		const own = V.visibility(s, s.turn)
		for (let sq = 0; sq < V.topology.size; sq++) {
			const sides = new Set(s.worlds.filter(({ b }) => b.board[sq] >= 0).map(({ b }) => b.sd[b.board[sq]]))
			expect(sides.size, 'one side per square: ' + N(sq)).toBeLessThanOrEqual(1)
		}
		expect(new Set(s.worlds.map(({ b }) => JSON.stringify([b.x.ep, b.x.castle]))).size).toBe(1)
		if (s.result) {
			return
		}
		const cand = new Set(V.candidateMoves(s).map((m) => m.code))
		for (const m of ordinaryMoves(V, s)) {
			expect(cand.has(m.code), 'a candidate: ' + m.code).toBe(true)
		}
		const view = V.aiView(s, s.turn)
		expect(view.worlds.reduce((sum, e) => sum + e.w, 0)).toBe(T)
		for (const { b } of view.worlds) {
			const enemy = b.sq.map((q, id) => ({ q, id })).filter(({ q, id }) => q >= 0 && b.sd[id] !== s.turn)
			expect(enemy.filter(({ id }) => b.ty[id] === 'k')).toHaveLength(1)
			expect(enemy.some(({ q }) => own.has(q))).toBe(false)
		}
	}

	it('keeps every invariant, and the stored announcement is the umpire\'s', () => {
		let most = 1
		for (const seed of [3, 4, 5]) {
			const rng = seededRng(seed)
			let s = newGame(V)
			for (let ply = 0; ply < 60 && !s.result; ply++) {
				check(s)
				const pool = attempts(s, rng)
				let code = null
				let list = null
				while (pool.length && !list) {
					code = pool.splice(Math.floor(rng() * pool.length), 1)[0]
					list = branches(V, s, code)
				}
				expect(list, 'some attempt is accepted').not.toBeNull()
				// the solid roll and the game-end roll never happen in Kriegspiel
				expect(list.every((b) => b.notes.length === 0)).toBe(true)
				const branch = list[Math.floor(rng() * list.length)]
				const next = stateAfter(V, s, code, branch, list)
				const a = said(next)
				expect(a).toEqual(announce(V, s, code, branch, next))
				expect(Boolean(a.check)).toBe(royalDanger(V, next, next.turn) > 0)
				for (const c of a.captures) {
					const X = S(c.sq)
					expect(s.worlds.some(({ b }) => b.board[X] >= 0 && b.sd[b.board[X]] !== s.turn)).toBe(true)
					const ep = s.worlds.some(({ b }) => generate(V, b, s.turn).get(code)?.kind === 'ep')
					expect(branch.captures.includes(X)).toBe(!ep)
				}
				s = next
				most = Math.max(most, s.worlds.length)
			}
		}
		expect(most, 'the games reach superpositions').toBeGreaterThan(2)
	})
})
