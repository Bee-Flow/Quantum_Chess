/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Shogi (src/variants/shogi.js): the setup, the movement of every piece, promotion, drops with their three
 * restrictions, the end of the game (king capture, the escape rule, impasse, no move, quiet rule, move limit), the
 * quantum interactions and the texts. The cases S1-S12, Q1-Q12, Q15 and Q16 are those of the research spec
 * (handoff/research/shogi.md, section 7; it has no Q13 and Q14). The spec's S11 predates the core's escape rule (lead
 * decision L1 in handoff/LEAD-DECISIONS.md): the stalemate it builds now ends the game at once.
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { glyphOf } from '../../../src/variantplay/glyphs.js'
import { sharedRules } from '../../../src/variantplay/texts.js'
import { chooseMove, evaluateState, LEVELS } from '../../../src/variants/core/ai.js'
import {
	applyMove,
	branches,
	budget,
	handView,
	isLegal,
	legalMoves,
	mergesFrom,
	newGame,
	outcomes,
	splitsFrom,
	squareView,
	T,
} from '../../../src/variants/core/quantum.js'
import { addPiece, generate, HAND, OFF } from '../../../src/variants/core/world.js'
import V, { farRanks, impasse, pawnDropMate } from '../../../src/variants/shogi.js'
import { play, stateOf } from './helpers.js'

/**
 * The square index of a square name (`5e`).
 *
 * @param {string} name square name
 * @return {number}
 */
function sq(name) {
	return V.topology.byName(name)
}

/**
 * A state from explicit worlds, every world with the same hand (shogi keeps no extra state in `x`).
 *
 * @param {Array<Record<string, string>|[Record<string, string>, number]>} worlds placements, optionally weighted
 * @param {number} [turn] side to move
 * @param {Array<[number, string]>} [hand] pieces in hand as [side, type]
 * @return {object}
 */
function make(worlds, turn = 0, hand = []) {
	return stateOf(V, worlds.map((w) => (Array.isArray(w) ? w : [w, 1])), turn, (b) => {
		b.x = {}
		for (const [side, type] of hand) {
			addPiece(b, type, side, HAND)
		}
	})
}

/**
 * The legal move codes of a state.
 *
 * @param {object} s state
 * @return {string[]}
 */
function codes(s) {
	return legalMoves(V, s).map((m) => m.code)
}

/**
 * The ordinary move codes from one square, sorted.
 *
 * @param {object} s state
 * @param {string} from square name
 * @return {string[]}
 */
function movesFrom(s, from) {
	return codes(s).filter((c) => c.startsWith(from + '-')).sort()
}

/**
 * The distinct target squares of the ordinary moves from one square.
 *
 * @param {object} s state
 * @param {string} from square name
 * @return {string[]}
 */
function targetsFrom(s, from) {
	const out = new Set()
	for (const m of legalMoves(V, s)) {
		if (m.type === 'move' && m.from === sq(from)) {
			out.add(V.topology.names[m.to])
		}
	}
	return [...out].sort()
}

/**
 * The outcomes of a move as `[key, ...notes, p]`.
 *
 * @param {object} s state
 * @param {string} code move code
 * @return {Array<Array<string|number>>|null}
 */
function outs(s, code) {
	const list = outcomes(V, s, code)
	return list ? list.map((o) => [o.key, ...o.notes, o.p]) : null
}

/**
 * Who may stand on a square: `[[side, type, p], ...]`.
 *
 * @param {object} s state
 * @param {string} name square name
 * @return {Array<Array<number|string>>}
 */
function at(s, name) {
	return squareView(s, sq(name)).map((o) => [o.side, o.type, o.p])
}

/**
 * A side's hand as text: `type:count` per type (`min-max` when the worlds differ).
 *
 * @param {object} s state
 * @param {number} side side index
 * @return {string}
 */
function hand(s, side) {
	return handView(s, side)
		.map((h) => h.type + ':' + (h.min === h.max ? h.min : h.min + '-' + h.max))
		.join(' ')
}

/** The S7 impasse position without Sente's hand (Gote to move, Sente king 5c in the zone). */
const ZONE = {
	'9a': '0:r',
	'8a': '0:b',
	'7a': '0:g',
	'6a': '0:g',
	'4a': '0:s',
	'3a': '0:s',
	'6b': '0:+p',
	'4b': '0:+p',
	'3b': '0:+p',
	'2b': '0:+p',
	'5c': '0:k',
	'9i': '1:k',
}

describe('shogi: board, setup and pieces', () => {
	it('sets up every start square (S1) with 30 moves and 23 splits for Sente', () => {
		const s = newGame(V)
		expect(s.worlds).toHaveLength(1)
		const b = s.worlds[0].b
		const placed = {}
		b.board.forEach((id, i) => {
			if (id >= 0) {
				placed[V.topology.names[i]] = b.sd[id] + ':' + b.ty[id]
			}
		})
		const want = {}
		const files = ['9', '8', '7', '6', '5', '4', '3', '2', '1']
		files.forEach((f, i) => {
			want[f + 'i'] = '0:' + 'lnsgkgsnl'[i]
			want[f + 'g'] = '0:p'
			want[f + 'a'] = '1:' + 'lnsgkgsnl'[i]
			want[f + 'c'] = '1:p'
		})
		Object.assign(want, { '8h': '0:b', '2h': '0:r', '8b': '1:r', '2b': '1:b' })
		expect(placed).toEqual(want)
		expect(b.sq.filter((x) => x === HAND)).toHaveLength(0)
		expect(codes(s)).toHaveLength(30)
		expect(legalMoves(V, s, { splits: true }).filter((m) => m.type === 'split')).toHaveLength(23)
		expect(V.category).toBe('regional')
		expect(V.maxPly).toBe(500)
	})

	it('names the squares as in shogi notation and draws a wooden board with its labels', () => {
		expect([sq('9i'), sq('1i'), sq('5e'), sq('9a'), sq('1a')]).toEqual([0, 8, 40, 72, 80])
		expect(V.topology.cells.every((c) => c.shade === 'wood' && c.shape === 'rect')).toBe(true)
		const texts = V.topology.layout.labels.map((l) => l.text)
		expect(texts.slice(0, 9)).toEqual(['9', '8', '7', '6', '5', '4', '3', '2', '1'])
		expect(texts.slice(9, 18).join('')).toBe('abcdefghi')
		expect(texts).toHaveLength(18)
		// the four star points are near-black outlines (a label's grey has too little contrast on the wood in a dark
		// theme): four short strokes crossing on each grid corner 3 and 6 lines in
		const centres = V.topology.layout.outlines.map((l) => [(l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2].join(','))
		expect(centres).toEqual(['3,3', '6,3', '3,6', '6,6'].flatMap((c) => [c, c, c, c]))
		expect(V.topology.layout.outlines.every((l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1) < 0.1)).toBe(true)
		expect(farRanks(0, sq('5c'), 3) && !farRanks(0, sq('5d'), 3)).toBe(true)
		expect(farRanks(1, sq('5g'), 3) && !farRanks(1, sq('5f'), 3)).toBe(true)
	})

	it('moves every piece type as in shogi', () => {
		// kings on 8i and 2a stand on none of the lines from 5e
		const kings = { '8i': '0:k', '2a': '1:k' }
		const count = (type) => targetsFrom(make([{ ...kings, '5e': '0:' + type }]), '5e').length
		expect(Object.fromEntries(['k', 'r', 'b', 'g', 's', 'n', 'l', 'p', '+r', '+b', '+s', '+n', '+l', '+p']
			.map((type) => [type, count(type)]))).toEqual({
			k: 8,
			r: 16,
			b: 16,
			g: 6,
			s: 5,
			n: 2,
			l: 4,
			p: 1,
			'+r': 20,
			'+b': 20,
			'+s': 6,
			'+n': 6,
			'+l': 6,
			'+p': 6,
		})
		const s = make([{ ...kings, '5e': '0:g', '3e': '0:s', '7e': '0:n' }])
		expect(targetsFrom(s, '5e')).toEqual(['4d', '4e', '5d', '5f', '6d', '6e'])
		expect(targetsFrom(s, '3e')).toEqual(['2d', '2f', '3d', '4d', '4f'])
		expect(targetsFrom(s, '7e')).toEqual(['6c', '8c'])
		// Gote's pieces point the other way
		const g = make([{ ...kings, '5e': '1:g', '3e': '1:s', '7e': '1:n', '1d': '1:l' }], 1)
		expect(targetsFrom(g, '5e')).toEqual(['4e', '4f', '5d', '5f', '6e', '6f'])
		expect(targetsFrom(g, '3e')).toEqual(['2d', '2f', '3f', '4d', '4f'])
		expect(targetsFrom(g, '7e')).toEqual(['6g', '8g'])
		expect(targetsFrom(g, '1d')).toEqual(['1e', '1f', '1g', '1h', '1i'])
		// the pawn captures straight ahead, never diagonally
		const p = make([{ ...kings, '5e': '0:p', '5d': '1:s', '4d': '1:g' }])
		expect(movesFrom(p, '5e')).toEqual(['5e-5d'])
	})

	it('draws pentagons with kanji, promoted pieces in red, and names every type', () => {
		expect(glyphOf(V, 'k', 0)).toMatchObject({ shape: 'shogi', text: '玉', ink: '#1b1b1b' })
		expect(glyphOf(V, 'k', 1)).toMatchObject({ shape: 'shogi', text: '王' })
		expect(glyphOf(V, '+p', 1)).toMatchObject({ shape: 'shogi', text: 'と', ink: '#b71c1c' })
		expect(glyphOf(V, 'r', 0).text + glyphOf(V, '+r', 0).text).toBe('飛龍')
		for (const [id, type] of Object.entries(V.types)) {
			expect(typeof type.name()).toBe('string')
			expect(Boolean(type.glyph.promoted)).toBe(id.startsWith('+'))
		}
		expect(V.handOrder).toEqual(['r', 'b', 'g', 's', 'n', 'l', 'p'])
		expect(V.rules().length).toBeGreaterThanOrEqual(3)
		expect(V.rules().length).toBeLessThanOrEqual(8)
		expect([V.codeText('p@5e'), V.codeText('7c-7b=+s'), V.codeText('7c-7b'), V.codeText('6d|4d-5c')])
			.toEqual(['P*5e', '7c-7b+', null, null])
		expect(V.reasonText('impasse')).toContain('27')
	})

	it('keeps the classic end rules, leaves out castling and en passant, and states the impasse count exactly', () => {
		expect([V.escapeRule, V.bareKingsDraw, V.drawsWait, V.specialMoves]).toEqual([true, true, true, false])
		expect(sharedRules(V).some((r) => /castling|en passant/i.test(r))).toBe(false)
		const rules = V.rules().join(' ')
		// the shared card explains capture-the-king and the escape rule; the shogi card must not contradict it
		expect(rules).not.toMatch(/no check|no checkmate|only by capturing|Capture the king to win/i)
		const impasseRule = V.rules().find((r) => r.includes('impasse'))
		for (const words of ['at least ten', 'at least 28', 'promoted or not', 'the king 0', 'in your hand']) {
			expect(impasseRule).toContain(words)
		}
	})

	it('treats kings and unpromoted pawns as solid and every other piece as splittable', () => {
		expect([...V.solidTypes].sort()).toEqual(['k', 'p'])
		expect(Object.keys(V.types).filter((x) => V.types[x].splittable).sort())
			.toEqual(['+b', '+l', '+n', '+p', '+r', '+s', 'b', 'g', 'l', 'n', 'r', 's'])
		expect([...V.quietTypes]).toEqual(['p'])
		// the shared card says pawns are solid, so the shogi card says that a tokin is not
		expect(sharedRules(V).some((r) => r.startsWith('Kings and pawns'))).toBe(true)
		expect(V.rules().some((r) => r.includes('tokin (promoted pawn) is not solid: it can split'))).toBe(true)
	})
})

describe('shogi: promotion', () => {
	it('may promote a move into, within or out of the zone (S2)', () => {
		const s = make([{ '5i': '0:k', '4d': '0:s', '9a': '1:k', '6c': '0:s' }])
		const entering = ['4d-3c', '4d-3c=+s', '4d-3e', '4d-4c', '4d-4c=+s', '4d-5c', '4d-5c=+s', '4d-5e']
		expect(movesFrom(s, '4d')).toEqual(entering)
		// moving out of the zone may promote too
		const inside = ['5b', '5d', '6b', '7b', '7d'].flatMap((to) => ['6c-' + to, '6c-' + to + '=+s'])
		expect(movesFrom(s, '6c')).toEqual(inside)
		let n = play(V, s, '6c-5d=+s')
		expect(at(n, '5d')).toEqual([[0, '+s', 1]])
		n = play(V, n, '9a-9b')
		expect(movesFrom(n, '5d')).toEqual(['5d-4c', '5d-5c', '5d-5e', '5d-6c', '5d-6d'])
	})

	it('forces the promotion where a piece could never move again (S3)', () => {
		const s = make([{ '5i': '0:k', '3b': '0:p', '7d': '0:n', '6e': '0:n', '1d': '0:l', '9a': '1:k' }])
		expect(movesFrom(s, '3b')).toEqual(['3b-3a=+p'])
		expect(movesFrom(s, '7d')).toEqual(['7d-6b=+n', '7d-8b=+n'])
		expect(movesFrom(s, '6e')).toEqual(['6e-5c', '6e-5c=+n', '6e-7c', '6e-7c=+n'])
		expect(movesFrom(s, '1d')).toEqual(['1d-1a=+l', '1d-1b', '1d-1b=+l', '1d-1c', '1d-1c=+l'])
		const g = make([{ '5a': '1:k', '7f': '1:p', '9i': '0:k' }], 1)
		expect(movesFrom(g, '7f')).toEqual(['7f-7g', '7f-7g=+p'])
	})
})

describe('shogi: captures and drops', () => {
	it('puts a captured piece into the capturer\'s hand, unpromoted, ready to drop (S6)', () => {
		const n = play(V, make([{ '5i': '0:k', '2b': '0:+r', '5a': '1:k', '3a': '1:s' }], 1), '3a-2b')
		expect(hand(n, 1)).toBe('r:1')
		expect(n.quiet).toBe(0)
		expect(codes({ ...n, turn: 1 })).toContain('r@5e')
		const p = play(V, make([{ '5i': '0:k', '5e': '0:p', '5d': '1:+p', '9a': '1:k' }]), '5e-5d')
		expect(at(p, '5d')).toEqual([[0, 'p', 1]])
		expect(hand(p, 0)).toBe('p:1')
	})

	it('drops onto every empty square except nifu and where the piece could never move (S4)', () => {
		const s = make([{ '5i': '0:k', '5g': '0:p', '4d': '0:+p', '1a': '1:k' }], 0, [[0, 'p'], [0, 'l'], [0, 'n']])
		expect(['p@', 'l@', 'n@'].map((x) => codes(s).filter((c) => c.startsWith(x)).length)).toEqual([63, 69, 60])
		expect(['p@5e', 'p@4e', 'p@3a', 'l@3a', 'n@3b', 'p@3b', 'l@3b', 'n@3c'].map((c) => isLegal(V, s, c)))
			.toEqual([false, true, false, false, false, true, true, true])
		const g = make([{ '5i': '0:k', '5a': '1:k' }], 1, [[1, 'p'], [1, 'n']])
		expect(['p@3i', 'n@3h', 'p@3h', 'n@3g'].map((c) => isLegal(V, g, c))).toEqual([false, false, true, true])
		// the dropped piece keeps its id, has the dropper's side and is unpromoted even in the zone
		const d = play(V, s, 'n@3c')
		expect(at(d, '3c')).toEqual([[0, 'n', 1]])
		expect(hand(d, 0)).toBe('l:1 p:1')
	})

	it('forbids a pawn-drop mate, and only that (S5, S11)', () => {
		const base = { '5i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:n' }
		const s = make([base], 0, [[0, 'p'], [0, 'g']])
		expect([isLegal(V, s, 'p@1b'), isLegal(V, s, 'g@1b')]).toEqual([false, true])
		const legal = (placement, h = [[0, 'p']], turn = 0, code = 'p@1b') => {
			return isLegal(V, make([placement], turn, h), code)
		}
		// (b) the king takes the pawn; (c) the silver takes it; (d) the silver is pinned by the rook
		expect(legal({ '5i': '0:k', '1a': '1:k', '2a': '1:n' })).toBe(true)
		expect(legal({ '5i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:s' })).toBe(true)
		expect(legal({ '5i': '0:k', '2c': '0:g', '9a': '0:r', '1a': '1:k', '2a': '1:s' })).toBe(false)
		// (e) capturing the dropper's king is an escape; (e') without it the drop is mate
		expect(legal({ ...base, '5c': '1:r' })).toBe(true)
		expect(legal({ '4i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:n', '5c': '1:r' })).toBe(false)
		// (f) moving a pawn to give mate is allowed
		const f = make([{ '5i': '0:k', '2c': '0:g', '1c': '0:p', '1a': '1:k', '2a': '1:n' }])
		expect(movesFrom(f, '1c')).toEqual(['1c-1b', '1c-1b=+p'])
		// (g) the same for Gote
		const turned = { '5a': '1:k', '8g': '1:g', '9i': '0:k', '8i': '0:n' }
		expect(legal(turned, [[1, 'g'], [1, 'p']], 1, 'p@9h')).toBe(false)
		expect(legal(turned, [[1, 'g'], [1, 'p']], 1, 'g@9h')).toBe(true)
		expect(legal({ '5a': '1:k', '9i': '0:k', '8i': '0:n' }, [[1, 'p']], 1, 'p@9h')).toBe(true)
		// S11: a pawn drop that does not attack the king is legal, even when every reply loses the king. That is
		// stalemate, which loses in shogi: the core's escape rule ends the game at once (lead decision L1)
		const s11 = make([{ '5i': '0:k', '2c': '0:s', '1a': '1:k' }], 0, [[0, 'p']])
		expect(isLegal(V, s11, 'p@1b')).toBe(true)
		expect(isLegal(V, s11, 'p@2b')).toBe(true)
		const n = play(V, s11, 'p@2b')
		expect(n.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		// every reply the escape rule looked at loses the king for certain
		const on = { ...n, result: null }
		expect(codes(on).sort()).toEqual(['1a-1b', '1a-2a', '1a-2b'])
		for (const [reply, take] of [['1a-1b', '2c-1b'], ['1a-2a', '2b-2a=+p'], ['1a-2b', '2c-2b']]) {
			expect(play(V, play(V, on, reply), take).result).toEqual({ winner: 0, reason: 'king' })
		}
		expect(play(V, s11, 'p@1b').result).toBeNull()
		// the helper itself, in one world
		const w = s.worlds[0].b
		expect(pawnDropMate(w, 0, sq('1b'), w.sq.length - 2)).toBe(true)
		expect(pawnDropMate(w, 0, sq('1c'), w.sq.length - 2)).toBe(false)
	})
})

describe('shogi: the end of the game', () => {
	it('wins by capturing the king, even after a check the other player ignored (S10)', () => {
		let s = make([{ '5i': '0:k', '5c': '0:p', '5a': '1:k', '4a': '1:g' }])
		s = play(V, play(V, s, '5c-5b'), '4a-4b')
		expect(play(V, s, '5b-5a=+p').result).toEqual({ winner: 0, reason: 'king' })
	})

	it('ends a checkmate at once by the escape rule; a drop can escape, and a legal pawn drop never mates', () => {
		// a pawn *move* may give mate (S5 f): no Gote move saves the king, so Sente wins at once
		const f = make([{ '5i': '0:k', '2c': '0:g', '1c': '0:p', '1a': '1:k', '2a': '1:n' }])
		for (const code of ['1c-1b', '1c-1b=+p']) {
			expect(play(V, f, code).result).toEqual({ winner: 0, reason: 'cannotEscape' })
		}
		// the rook checks along file 1 and the gold covers 2a and 2b: a silver in hand can block, an empty hand cannot
		const rook = { '5i': '0:k', '9e': '0:r', '3b': '0:g', '1a': '1:k' }
		expect(play(V, make([rook], 0, [[1, 's']]), '9e-1e').result).toBeNull()
		expect(play(V, make([rook]), '9e-1e').result).toEqual({ winner: 0, reason: 'cannotEscape' })
		// a pawn drop that the pawn-drop-mate rule allows in a possibility never ends the game by the escape rule
		const s = make([
			{ '5i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:n' },
			{ '5i': '0:k', '3d': '0:g', '1a': '1:k', '2a': '1:n' },
		], 0, [[0, 'p']])
		expect([play(V, s, 'p@1b', 0).result, play(V, s, 'p@1b', 1).result]).toEqual([null, null])
	})

	it('wins by the 27-point impasse at the start of the turn (S7)', () => {
		const result = (placement, h, turn = 1, code = '9i-8i') => play(V, make([placement], turn, h), code).result
		const rb = [[0, 'r'], [0, 'b']]
		expect(result(ZONE, rb)).toEqual({ winner: 0, reason: 'impasse' })
		// 27 points, 9 pieces in the zone, the king attacked: no impasse
		expect(result(ZONE, [[0, 'r'], [0, 'p'], [0, 'p'], [0, 'p'], [0, 'p']])).toBeNull()
		const nine = { ...ZONE, '4e': '0:+p' }
		delete nine['4b']
		expect(result(nine, rb)).toBeNull()
		expect(result({ ...ZONE, '5d': '1:g' }, rb)).toBeNull()
		// promoted rooks and bishops count 5 too
		expect(result({ ...ZONE, '9a': '0:+r' }, rb)).toEqual({ winner: 0, reason: 'impasse' })
		expect(result({ ...ZONE, '8a': '0:+b' }, rb)).toEqual({ winner: 0, reason: 'impasse' })
		// "at least": 11 pieces and 29 points win too; the king in the camp counts 0 (R + 4 P above: 27, not 28)
		expect(result({ ...ZONE, '1b': '0:+p' }, rb)).toEqual({ winner: 0, reason: 'impasse' })
		// Gote needs 27 points
		const mirror = {}
		for (const [name, piece] of Object.entries(ZONE)) {
			const turned = String(10 - Number(name[0])) + 'abcdefghi'[8 - 'abcdefghi'.indexOf(name[1])]
			mirror[turned] = (piece[0] === '0' ? '1' : '0') + piece.slice(1)
		}
		const gote = [[1, 'r'], [1, 'p'], [1, 'p'], [1, 'p'], [1, 'p']]
		expect(result(mirror, gote, 0, '1a-2a')).toEqual({ winner: 1, reason: 'impasse' })
		expect(impasse(make([ZONE], 1, rb).worlds[0].b, 0)).toBe(true)
	})

	it('makes a player who cannot move lose (S8)', () => {
		const placement = { '1a': '0:k', '5i': '1:k' }
		'gsgsgsgs'.split('').forEach((type, i) => {
			placement[String(9 - i) + 'a'] = '0:' + type
		})
		for (let f = 1; f <= 9; f++) {
			placement[f + 'b'] = '0:p'
		}
		const n = play(V, make([placement], 1), '5i-5h')
		expect(n.result).toEqual({ winner: 1, reason: 'noMoves' })
		expect(legalMoves(V, n)).toEqual([])
	})

	it('draws after 50 moves each without a capture, a drop or a pawn move, and at ply 500 (S9)', () => {
		let s = make([{ '5i': '0:k', '1i': '0:r', '5a': '1:k', '9a': '1:r' }], 0, [[0, 'p']])
		s = play(V, s, '1i-1h')
		expect(s.quiet).toBe(1)
		s = play(V, play(V, s, '9a-9b'), 'p@5e')
		expect(s.quiet).toBe(0)
		s = play(V, s, '9b-9a')
		const cycle = ['1h-1i', '9a-9b', '1i-1h', '9b-9a']
		for (let i = 0; !s.result; i++) {
			s = play(V, s, cycle[i % 4])
		}
		expect(s.result).toEqual({ winner: null, reason: 'quiet' })
		expect(s.quiet).toBe(100)
		const late = { ...make([{ '5i': '0:k', '1i': '0:r', '5a': '1:k' }]), ply: 499 }
		expect(play(V, late, '1i-1h').result).toEqual({ winner: null, reason: 'moveLimit' })
	})

	it('treats a tokin as a gold, not a pawn: it splits, and its moves do not reset the quiet count (S12)', () => {
		const s = { ...make([{ '5i': '0:k', '5d': '0:+p', '3g': '0:p', '5a': '1:k' }]), quiet: 5 }
		expect([splitsFrom(V, s, sq('5d')).length, splitsFrom(V, s, sq('3g')).length]).toEqual([15, 0])
		expect([play(V, s, '5d-5c').quiet, play(V, s, '3g-3f').quiet]).toEqual([6, 0])
		// the type before the move counts: a pawn move that promotes resets it
		const p = { ...make([{ '5i': '0:k', '5c': '0:p', '9a': '1:k' }]), quiet: 5 }
		expect(play(V, p, '5c-5b=+p').quiet).toBe(0)
	})
})

describe('shogi: quantum interactions', () => {
	it('promotes a ghost only where it moves, and never merges two faces (Q1)', () => {
		let s = play(V, play(V, make([{ '5i': '0:k', '5e': '0:s', '5a': '1:k' }]), '5e-4d|6d'), '5a-5b')
		expect(outs(s, '4d-4c=+s')).toEqual([['move', 1]])
		const n = play(V, s, '4d-4c=+s')
		expect([at(n, '4c'), at(n, '6d'), budget(n, 0)]).toEqual([[[0, '+s', 0.5]], [[0, 's', 0.5]], 2])
		s = play(V, n, '5b-5a')
		const list = legalMoves(V, s)
		expect(list.filter((m) => m.type === 'merge')).toEqual([])
		expect(branches(V, s, '6d|4c-5c')).toBeNull()
		expect(list.filter((m) => m.type === 'measure').map((m) => m.code)).toEqual(['?6d'])
		// control: two parts with the same face merge
		const u = play(V, play(V, make([{ '5i': '0:k', '5e': '0:s', '5a': '1:k' }]), '5e-4d|6d'), '5a-5b')
		expect(outs(u, '6d|4d-5c')).toEqual([['move', 1]])
	})

	it('rolls a drop onto a square a ghost might hold: Dropped or Missed (Q2)', () => {
		const s = make([
			{ '5i': '0:k', '5a': '1:k', '5e': '1:b' },
			{ '5i': '0:k', '5a': '1:k', '3c': '1:b' },
		], 0, [[0, 'g']])
		expect(outs(s, 'g@5e')).toEqual([['miss', 0.5], ['move', 0.5]])
		const miss = play(V, s, 'g@5e', 0)
		const move = play(V, s, 'g@5e', 1)
		expect([at(miss, '5e'), hand(miss, 0), miss.quiet]).toEqual([[[1, 'b', 1]], 'g:1', 1])
		expect([at(move, '5e'), at(move, '3c'), hand(move, 0), move.quiet])
			.toEqual([[[0, 'g', 1]], [[1, 'b', 1]], '', 0])
	})

	it('lets a pawn drop miss in the possibilities where it would be a pawn-drop mate (Q3, Q12)', () => {
		const s = make([
			{ '5i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:n' },
			{ '5i': '0:k', '3d': '0:g', '1a': '1:k', '2a': '1:n' },
		], 0, [[0, 'p']])
		expect(outs(s, 'p@1b')).toEqual([['miss', 0.5], ['move', 0.5]])
		const miss = play(V, s, 'p@1b', 0)
		const move = play(V, s, 'p@1b', 1)
		expect([hand(miss, 0), at(miss, '2c'), at(move, '1b'), at(move, '3d')])
			.toEqual(['p:1', [[0, 'g', 1]], [[0, 'p', 1]], [[0, 'g', 1]]])
		// in play: the gold splits, then the drop is the same roll
		let p = make([{ '5i': '0:k', '2d': '0:g', '1a': '1:k', '2a': '1:n', '9c': '1:p' }], 0, [[0, 'p']])
		p = play(V, play(V, p, '2d-2c|3d'), '9c-9d')
		expect(outs(p, 'p@1b')).toEqual([['miss', 0.5], ['move', 0.5]])
		// a ghost defender decides it: the rook on rank b can take the pawn, the one on 7e cannot
		const d = make([
			{ '5i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:n', '7b': '1:r' },
			{ '5i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:n', '7e': '1:r' },
		], 0, [[0, 'p']])
		expect(outs(d, 'p@1b')).toEqual([['miss', 0.5], ['move', 0.5]])
		const dropped = play(V, d, 'p@1b', 1)
		expect([at(dropped, '1b'), at(dropped, '7b'), outs(dropped, '7b-1b')])
			.toEqual([[[0, 'p', 1]], [[1, 'r', 1]], [['capture', 1]]])
		expect(at(play(V, d, 'p@1b', 0), '7e')).toEqual([[1, 'r', 1]])
	})

	it('rolls a pawn push onto a ghost between Captured and Moved, and keeps hands certain (Q4, Q5)', () => {
		const s = make([
			{ '5i': '0:k', '5e': '0:p', '5a': '1:k', '5d': '1:s' },
			{ '5i': '0:k', '5e': '0:p', '5a': '1:k', '4c': '1:s' },
		])
		expect(outs(s, '5e-5d')).toEqual([['move', 0.5], ['capture', 0.5]])
		const c = play(V, s, '5e-5d', 1)
		expect([at(c, '5d'), hand(c, 0)]).toEqual([[[0, 'p', 1]], 's:1'])
		const g = make([
			{ '5i': '0:k', '2b': '0:+r', '5a': '1:k', '3a': '1:s' },
			{ '5i': '0:k', '2d': '0:+r', '5a': '1:k', '3a': '1:s' },
		], 1)
		expect(outs(g, '3a-2b')).toEqual([['move', 0.5], ['capture', 0.5]])
		const taken = play(V, g, '3a-2b', 1)
		expect([hand(taken, 1), taken.worlds.length]).toEqual(['r:1', 1])
	})

	it('settles an impasse that holds in some possibilities by the game-end roll (Q6, Q11)', () => {
		const rb = [[0, 'r'], [0, 'b']]
		const zone = { ...ZONE }
		delete zone['4a']
		const s = make([{ ...zone, '4c': '0:s' }, { ...zone, '4d': '0:s' }], 1, rb)
		expect(outs(s, '9i-8i')).toEqual([
			['move', 'end:{"winner":0,"reason":"impasse"}', 0.5],
			['move', 'end:null', 0.5],
		])
		const won = play(V, s, '9i-8i', 0)
		expect(won.result).toEqual({ winner: 0, reason: 'impasse' })
		expect(at(won, '4c')).toEqual([[0, 's', 1]])
		// a ghost attacker of the king blocks the impasse where it stands
		const a = make([{ ...ZONE, '8f': '1:b' }, { ...ZONE, '8g': '1:b' }], 1, rb)
		expect(outs(a, '9i-8i')).toEqual([
			['move', 'end:null', 0.5],
			['move', 'end:{"winner":0,"reason":"impasse"}', 0.5],
		])
	})

	it('never promotes in a split, so a knight cannot split onto its last two ranks (Q7)', () => {
		const s = make([{ '5i': '0:k', '6e': '0:n', '3d': '0:n', '1e': '0:l', '5a': '1:k' }])
		expect(splitsFrom(V, s, sq('6e')).map((m) => m.code)).toEqual(['6e-7c|5c'])
		expect(splitsFrom(V, s, sq('3d'))).toEqual([])
		expect(splitsFrom(V, s, sq('1e')).map((m) => m.code).sort()).toEqual(['1e-1c|1b', '1e-1d|1b', '1e-1d|1c'])
		const n = play(V, s, '6e-7c|5c')
		expect([at(n, '7c'), at(n, '5c')]).toEqual([[[0, 'n', 0.5]], [[0, 'n', 0.5]]])
	})

	it('forces the promotion of a ghost part and joins a part onto its own part with the same face (Q8, Q10)', () => {
		let s = play(V, play(V, make([{ '5i': '0:k', '1e': '0:l', '5a': '1:k' }]), '1e-1d|1c'), '5a-5b')
		expect(movesFrom(s, '1c')).toEqual(['1c-1a=+l', '1c-1b', '1c-1b=+l'])
		expect(outs(s, '1c-1a=+l')).toEqual([['move', 1]])
		s = play(V, s, '1c-1a=+l')
		expect([at(s, '1a'), at(s, '1d')]).toEqual([[[0, '+l', 0.5]], [[0, 'l', 0.5]]])
		s = play(V, s, '5b-5c')
		expect(outs(s, '1d-1a=+l')).toEqual([['move', 1]])
		const joined = play(V, s, '1d-1a=+l')
		expect([at(joined, '1a'), budget(joined, 0)]).toEqual([[[0, '+l', 1]], 1])
		// a join needs the face the mover has after the move
		const plain = make([{ '5i': '0:k', '5c': '0:s', '5a': '1:k' }, { '5i': '0:k', '6d': '0:s', '5a': '1:k' }])
		expect([outs(plain, '6d-5c'), outs(plain, '6d-5c=+s')]).toEqual([[['move', 1]], [['miss', 0.5], ['move', 0.5]]])
		const red = make([{ '5i': '0:k', '5c': '0:+s', '5a': '1:k' }, { '5i': '0:k', '6d': '0:s', '5a': '1:k' }])
		expect([outs(red, '6d-5c'), outs(red, '6d-5c=+s')]).toEqual([[['miss', 0.5], ['move', 0.5]], [['move', 1]]])
		expect(at(play(V, red, '6d-5c=+s'), '5c')).toEqual([[0, '+s', 1]])
	})

	it('links a lance that slides past a ghost (pass = link), while a knight jumps', () => {
		const s = make([
			{ '5i': '0:k', '1g': '0:l', '6e': '0:n', '5a': '1:k', '1d': '1:s' },
			{ '5i': '0:k', '1g': '0:l', '6e': '0:n', '5a': '1:k', '3d': '1:s' },
		])
		const lance = outcomes(V, s, '1g-1c')
		expect(lance.map((o) => [o.key, o.rolled])).toEqual([['move', false]])
		const n = play(V, s, '1g-1c')
		expect([at(n, '1g'), at(n, '1c')]).toEqual([[[0, 'l', 0.5]], [[0, 'l', 0.5]]])
		expect(outs(s, '6e-5c')).toEqual([['move', 1]])
	})

	it('keeps both hands identical in every possibility, even for a two-faced piece', () => {
		// a silver that is promoted in one possibility and not in the other, on one square (only a core without the
		// full merge rule can make it): captured, it gives the same unpromoted silver to the hand
		const s = make([
			{ '5i': '0:k', '5c': '0:s', '5a': '1:k', '5b': '1:g' },
			{ '5i': '0:k', '5c': '0:+s', '5a': '1:k', '5b': '1:g' },
		], 1)
		expect(outs(s, '5b-5c')).toEqual([['capture', 1]])
		const n = play(V, s, '5b-5c')
		expect(hand(n, 1)).toBe('s:1')
		expect(n.worlds).toHaveLength(1)
	})

	it('refuses a merge onto a third part with the other face (Q9)', () => {
		const s = make([
			{ '5i': '0:k', '5a': '1:k', '4d': '0:s' },
			{ '5i': '0:k', '5a': '1:k', '6d': '0:s' },
			{ '5i': '0:k', '5a': '1:k', '5c': '0:+s' },
		])
		expect(branches(V, s, '6d|4d-5c')).toBeNull()
		expect(mergesFrom(V, s, sq('4d')).map((m) => m.code)).toEqual(['6d|4d-5e'])
		expect(legalMoves(V, s).filter((m) => m.type === 'merge').map((m) => m.code)).toEqual(['6d|4d-5e'])
	})

	it('misses a pawn drop for two reasons at once: the square is taken, or it would be a pawn-drop mate (Q15)', () => {
		const s = make([
			{ '5i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:n', '1b': '1:s' },
			{ '5i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:n', '4b': '1:s' },
			{ '5i': '0:k', '3d': '0:g', '1a': '1:k', '2a': '1:n', '4b': '1:s' },
		], 0, [[0, 'p']])
		expect([budget(s, 0), budget(s, 1)]).toEqual([2, 2])
		const list = outs(s, 'p@1b')
		expect(list.map((o) => o[0])).toEqual(['miss', 'move'])
		expect(list[0][1]).toBeCloseTo(2 / 3, 5)
		expect(list[1][1]).toBeCloseTo(1 / 3, 5)
		const miss = play(V, s, 'p@1b', 0)
		expect([hand(miss, 0), at(miss, '2c'), at(miss, '1b'), at(miss, '4b'), miss.worlds.length])
			.toEqual(['p:1', [[0, 'g', 1]], [[1, 's', 0.5]], [[1, 's', 0.5]], 2])
		const move = play(V, s, 'p@1b', 1)
		expect([hand(move, 0), at(move, '1b'), at(move, '3d'), at(move, '4b'), move.result])
			.toEqual(['', [[0, 'p', 1]], [[0, 'g', 1]], [[1, 's', 1]], null])
	})

	it('links a rook that promotes as it slides past a ghost, and measures it back (Q16)', () => {
		const s = make([
			{ '5i': '0:k', '2h': '0:r', '5a': '1:k', '2e': '1:s' },
			{ '5i': '0:k', '2h': '0:r', '5a': '1:k', '7e': '1:s' },
		])
		expect(codes(s).filter((c) => c.includes('-2c')).sort()).toEqual(['2h-2c', '2h-2c=+r'])
		expect([outs(s, '2h-2c=+r'), outs(s, '2h-2c'), outs(s, '2h-2e')])
			.toEqual([[['move', 1]], [['move', 1]], [['move', 0.5], ['capture', 0.5]]])
		let n = play(V, s, '2h-2c=+r')
		expect([at(n, '2c'), at(n, '2h'), budget(n, 0)]).toEqual([[[0, '+r', 0.5]], [[0, 'r', 0.5]], 2])
		n = play(V, n, '5a-4a')
		expect(outs(n, '?2h')).toEqual([['2h', 0.5], ['2c', 0.5]])
		const back = play(V, n, '?2h', 0)
		// the rook stayed where the silver blocked it: the two were linked
		expect([at(back, '2h'), at(back, '2c'), at(back, '2e'), at(back, '7e')])
			.toEqual([[[0, 'r', 1]], [], [[1, 's', 1]], []])
	})
})

/**
 * Check the shogi invariants in every world of a state: hands identical in every world (ids, sides, types) and
 * never promoted, no piece where it could never move, no two unpromoted pawns of a side on a file, and every piece on
 * the board or in a hand (only a captured king leaves, and that ends the game).
 *
 * @param {object} s state
 */
function checkShogi(s) {
	expect(s.worlds.reduce((a, e) => a + e.w, 0)).toBe(T)
	const hands = (b) => b.sq.map((x, id) => (x === HAND ? id + ':' + b.sd[id] + b.ty[id] : '')).join(',')
	const first = hands(s.worlds[0].b)
	for (const { b } of s.worlds) {
		expect(hands(b)).toBe(first)
		const off = b.sq.map((x, id) => (x === OFF ? b.ty[id] : null)).filter((x) => x !== null)
		expect(off.length === 0 || (off.join() === 'k' && s.result !== null)).toBe(true)
		const files = new Set()
		for (let id = 0; id < b.sq.length; id++) {
			const t = b.ty[id]
			const side = b.sd[id]
			if (b.sq[id] === HAND) {
				expect(t[0]).not.toBe('+')
			}
			if (b.sq[id] < 0) {
				continue
			}
			expect((t === 'p' || t === 'l') && farRanks(side, b.sq[id], 1)).toBe(false)
			expect(t === 'n' && farRanks(side, b.sq[id], 2)).toBe(false)
			if (t === 'p') {
				const key = side + ':' + V.topology.coords[b.sq[id]][0]
				expect(files.has(key)).toBe(false)
				files.add(key)
			}
		}
	}
}

/**
 * A random move, biased towards what makes shogi special: every fourth ply a split, else often a drop, a promotion
 * or a merge.
 *
 * @param {object} s state
 * @param {number} ply ply number
 * @param {() => number} rng random numbers
 * @return {object}
 */
function randomMove(s, ply, rng) {
	const moves = legalMoves(V, s, { splits: ply % 4 === 1 })
	const r = rng()
	let pool = moves
	if (ply % 4 === 1) {
		pool = moves.filter((m) => m.type === 'split')
	} else if (r < 0.3) {
		pool = moves.filter((m) => m.drop)
	} else if (r < 0.6) {
		pool = moves.filter((m) => m.promo || m.type === 'merge')
	}
	if (!pool.length) {
		pool = moves
	}
	return pool[Math.floor(rng() * pool.length)]
}

describe('shogi: random games and the computer player', () => {
	it('keeps the shogi invariants in random games with drops, promotions, splits and merges', () => {
		const seen = { drop: 0, promo: 0, split: 0, merge: 0 }
		for (const seed of [11, 12, 13, 14]) {
			const rng = seededRng(seed)
			let s = newGame(V)
			for (let ply = 0; ply < 120 && !s.result; ply++) {
				const m = randomMove(s, ply, rng)
				seen.drop += m.drop ? 1 : 0
				seen.promo += m.promo ? 1 : 0
				seen[m.type] = (seen[m.type] ?? 0) + 1
				s = applyMove(V, s, m.code, rng).state
				checkShogi(s)
			}
		}
		expect(Math.min(seen.drop, seen.promo, seen.split, seen.merge)).toBeGreaterThan(10)
	}, 30000)

	it('lets the computer make a legal move from the start at every level within its time budget', async () => {
		const s = newGame(V)
		for (const level of LEVELS) {
			const started = Date.now()
			const code = await chooseMove(V, s, { level: level.id, rng: seededRng(5) })
			expect(Date.now() - started).toBeLessThan(level.timeMs + 250)
			expect(isLegal(V, s, code)).toBe(true)
		}
		// and with pieces in both hands
		const mid = make(
			[{ '5i': '0:k', '7g': '0:p', '2h': '0:r', '5a': '1:k', '3c': '1:p', '8b': '1:r' }],
			0,
			[[0, 'b'], [0, 'g'], [0, 'p'], [1, 's'], [1, 'n']],
		)
		expect(generate(V, mid.worlds[0].b, 0).size).toBeGreaterThan(150)
		const code = await chooseMove(V, mid, { level: 'normal', rng: seededRng(6) })
		expect(isLegal(V, mid, code)).toBe(true)
	}, 30000)

	it('counts a piece in hand at its full value, so that a quiet drop costs the computer nothing', () => {
		// with a hand piece worth more than on the board, the one-move search never dropped anything but pawns
		const s = make([{ '5i': '0:k', '7g': '0:p', '5a': '1:k' }], 0, [[0, 'r'], [0, 'g'], [1, 's']])
		const before = evaluateState(V, s, 0)
		for (const code of ['r@9e', 'g@1h']) {
			const n = play(V, s, code)
			expect(evaluateState(V, n, 0)).toBeCloseTo(before, 6)
			expect(evaluateState(V, n, 1)).toBeCloseTo(evaluateState(V, s, 1), 6)
		}
	})
})
