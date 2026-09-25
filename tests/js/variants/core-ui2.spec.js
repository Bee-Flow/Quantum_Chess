/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The final-review items of package "ui" (pure parts; the components are in core-ui2.vue.spec.js): what the board may
 * show of hidden information (U1, the helpers), the result of each outcome (U2), a faster escape rule for splits that
 * stays exact (U3), a link that leaves a piece on a fifth square as in the classic engine (U4) and the turn of the
 * pieces off the board (U5).
 */

import { describe, expect, it } from 'vitest'
import {
	applyMove as classicApply,
	pieceLocations as classicLocations,
	getOutcomes,
	seededRng,
	setupPosition,
	squareName,
	whyIllegal,
} from '../../../src/engine/index.js'
import { pieceSpin } from '../../../src/variantplay/glyphs.js'
import { blindTargetAllowed, boardInteractive, focusSquares } from '../../../src/variantplay/marks.js'
import { endText } from '../../../src/variantplay/texts.js'
import { orthodoxSpec } from '../../../src/variants/core/orthodoxVariant.js'
import {
	applyMove,
	applyOutcome,
	branches,
	legalMoves,
	movesOnto,
	outcomes,
	pieceLocations,
	royalDanger,
	stateAfter,
} from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { linesOf, pieceMoves } from '../../../src/variants/core/world.js'
import hexagonal from '../../../src/variants/hexagonal.js'
import hyper4d from '../../../src/variants/hyper4d.js'
import { loadVariant, newGame, optionValues, VARIANT_IDS } from '../../../src/variants/index.js'
import kriegspiel from '../../../src/variants/kriegspiel.js'
import raumschach from '../../../src/variants/raumschach.js'
import shogi from '../../../src/variants/shogi.js'
import threecheck from '../../../src/variants/threecheck.js'
import { play, stateOf } from './helpers.js'

/** Plain orthodox chess with the classic end rules. */
const V = defineVariant(Object.assign(orthodoxSpec(), { id: 'test-ui2', category: 'rules', rules: () => [] }))

/**
 * The same variant without the escape rule (an object that inherits everything else), for the plain search.
 *
 * @param {object} W variant
 * @return {object}
 */
function withoutEscape(W) {
	const off = Object.create(W)
	off.escapeRule = false
	return off
}

/**
 * A state of equally likely worlds, in the order written (every world keeps the same key order, so the piece ids
 * agree), with the bookkeeping of the variant's board (none on boards with more than two coordinates).
 *
 * @param {object} W variant
 * @param {Array<Record<string, string>>} placements one placement per world
 * @param {number} [turn] side to move
 * @return {object}
 */
function worldsOf(W, placements, turn = 0) {
	return stateOf(W, placements.map((p) => [p, 1]), turn, (b) => {
		b.x = W.topology.dims === 2 ? { ep: -1, epVictim: -1, castle: [] } : {}
	})
}

/**
 * Eight worlds: the common pieces plus three White knight ghosts, each on one of two squares.
 *
 * @param {Record<string, string>} common the pieces in every world
 * @param {Array<[string, string]>} ghosts the two squares of each knight ghost
 * @return {Array<Record<string, string>>}
 */
function eightWorlds(common, ghosts) {
	const out = []
	for (let mask = 0; mask < 8; mask++) {
		const p = { ...common }
		ghosts.forEach(([a, b], g) => {
			p[mask & (1 << g) ? b : a] = '0:n'
		})
		out.push(p)
	}
	return out
}

/**
 * "Your king cannot escape" by plain search over every action and outcome (without the escape rule): the side to
 * move (1) has a legal action, none of its outcomes captures a royal piece of side 0, ends the game or leaves a king
 * danger below 100 %.
 *
 * @param {object} off the variant without the escape rule
 * @param {object} s the state after the move, side 1 to move
 * @return {boolean}
 */
function trappedByPlainSearch(off, s) {
	const royals = (b) => b.sq.filter((q, id) => q >= 0 && b.sd[id] === 0 && off.royalTypes.has(b.ty[id])).length
	const acts = legalMoves(off, s, { splits: true })
	for (const a of acts) {
		const list = branches(off, s, a.code)
		for (const br of list) {
			if (br.worlds.some((e) => royals(e.b) < royals(s.worlds[0].b))) {
				return false
			}
			const next = stateAfter(off, s, a.code, br, list, { light: true })
			if (next.result || royalDanger(off, next, 1) < 1) {
				return false
			}
		}
	}
	return acts.length > 0
}

/**
 * The smallest king danger of side 1 over the outcomes of an action.
 *
 * @param {object} W variant
 * @param {object} s state, side 1 to move
 * @param {string} code action
 * @return {number}
 */
function leastDanger(W, s, code) {
	return Math.min(...branches(W, s, code).map((br, o) => royalDanger(W, applyOutcome(W, s, code, o), 1)))
}

describe('U1: what the board may show of hidden information (helpers)', () => {
	const view = { humanTurn: true, handover: false, curtain: false, viewer: 0 }

	it('takes input only while a human is to move, without hand-over or curtain, and the viewer is to move', () => {
		const s = newGame(kriegspiel)
		expect(boardInteractive(kriegspiel, s, view)).toBe(true)
		expect(boardInteractive(kriegspiel, s, { ...view, humanTurn: false })).toBe(false)
		expect(boardInteractive(kriegspiel, s, { ...view, handover: true })).toBe(false)
		expect(boardInteractive(kriegspiel, s, { ...view, curtain: true })).toBe(false)
		expect(boardInteractive(kriegspiel, s, { ...view, viewer: 1 })).toBe(false)
		expect(boardInteractive(kriegspiel, { ...s, result: { winner: 0, reason: 'king' } }, view)).toBe(false)
		expect(boardInteractive(null, s, view)).toBe(false)
		// without hidden information the viewer may be another side (a player who flipped the board)
		expect(boardInteractive(V, newGame(V), { ...view, viewer: 1 })).toBe(true)
	})

	it('marks a target the viewer cannot see only when it comes from what the viewer knows', async () => {
		const dark = await loadVariant('darkchess')
		for (const source of ['move', 'drop', 'split', 'merge']) {
			// Kriegspiel: tries as if the enemy pieces were unknown, and the own view for Split and Merge
			expect(blindTargetAllowed(kriegspiel, source)).toBe(true)
			// Dark chess and plain variants: the targets come from the real state
			expect(blindTargetAllowed(dark, source)).toBe(false)
			expect(blindTargetAllowed(V, source)).toBe(false)
		}
	})

	it('lets the keyboard reach the visible from squares and the marked targets', () => {
		const moves = [{ from: 1 }, { from: 2 }, { from: -1 }, { from: 9 }]
		const marks = { 5: ['target'], 6: ['last'], 9: ['selected'] }
		expect([...focusSquares(moves, marks, null)].sort((a, b) => a - b)).toEqual([1, 2, 5, 9])
		expect([...focusSquares(moves, marks, new Set([2, 9]))].sort((a, b) => a - b)).toEqual([1, 5])
	})
})

describe('U2: the result of each outcome', () => {
	it('tells which outcome of a roll captures the king', () => {
		// the White queen is on d1 (the diagonal to h5 is open) or on d3
		const s = worldsOf(V, [{ g1: '0:k', d1: '0:q', h5: '1:k' }, { g1: '0:k', d3: '0:q', h5: '1:k' }])
		const outs = outcomes(V, s, 'd1-h5')
		expect(outs.map((o) => [o.key, o.p, o.result ?? null])).toEqual([
			['miss', 0.5, null],
			['capture', 0.5, { winner: 0, reason: 'king' }],
		])
		// an outcome in which the game goes on has no result field (the shape of before)
		expect(outs[0]).not.toHaveProperty('result')
		expect(outcomes(V, newGame(V), 'e2-e4'))
			.toEqual([{ key: 'move', notes: [], p: 1, captures: [], rolled: false }])
	})

	it('gives the third check that a landing roll decides (three-check report)', () => {
		const s = stateOf(threecheck, [
			[{ g1: '0:k', d1: '0:q', e8: '1:k', h5: '1:p' }, 1],
			[{ g1: '0:k', d3: '0:q', e8: '1:k', h5: '1:p' }, 1],
		], 0, (b) => {
			b.x = { ep: -1, epVictim: -1, castle: [], checks: [2, 0] }
		})
		const outs = outcomes(threecheck, s, 'd1-h5')
		expect(outs.map((o) => [o.key, o.notes, o.result ?? null])).toEqual([
			['miss', [], null],
			['capture', [], { winner: 0, reason: 'checks' }],
		])
		expect(endText(threecheck, outs[1].result, outs[1].notes)).toBe('The game ends: White wins (three checks)')
		expect(endText(threecheck, outs[0].result, outs[0].notes)).toBe('')
	})

	it('includes the draws of the whole state (only the two kings left after a capture)', () => {
		const s = worldsOf(V, [{ e1: '0:k', e8: '1:k', d2: '1:n' }, { e1: '0:k', e8: '1:k', a6: '1:n' }])
		expect(outcomes(V, s, 'e1-d2').map((o) => [o.key, o.result ?? null])).toEqual([
			['move', null],
			['capture', { winner: null, reason: 'bareKings' }],
		])
	})

	it('checks the escape rule before a draw, as a played move does (never a draw where the move wins)', () => {
		// White Kg1 Re1; Black Kh8 Pg7 Ph7 and a knight on e8 or c6: e1-e8 leaves the Black king no escape in both
		// outcomes, and the Moved one is the 100th quiet ply
		const win = { winner: 0, reason: 'cannotEscape' }
		const placement = (knight, extra) => ({ g1: '0:k', e1: '0:r', h8: '1:k', [knight]: '1:n', ...extra })
		const both = (extra) => worldsOf(V, [placement('e8', extra), placement('c6', extra)])
		const s = { ...both({ g7: '1:p', h7: '1:p' }), quiet: 99 }
		const outs = outcomes(V, s, 'e1-e8')
		expect(outs.map((o) => [o.key, o.result ?? null])).toEqual([['move', win], ['capture', null]])
		// a result in the preview is the result of playing that outcome (the Captured one is decided when played)
		expect([0, 1].map((i) => applyOutcome(V, s, 'e1-e8', i).result)).toEqual([win, win])
		// without the h-pawn the king escapes to h7: the draw stays a draw
		const open = { ...both({ g7: '1:p' }), quiet: 99 }
		const draw = { winner: null, reason: 'quiet' }
		expect(applyOutcome(V, open, 'e1-e8', 0).result).toEqual(draw)
		expect(outcomes(V, open, 'e1-e8')[0].result).toEqual(draw)
		// at the move limit every answer would end the game, so the king escapes and the preview keeps the move limit
		const late = { ...both({ g7: '1:p', h7: '1:p' }), ply: V.maxPly - 1 }
		const limit = { winner: null, reason: 'moveLimit' }
		expect(outcomes(V, late, 'e1-e8').map((o) => o.result)).toEqual([limit, limit])
		expect([0, 1].map((i) => applyOutcome(V, late, 'e1-e8', i).result)).toEqual([limit, limit])
	})

	it('says nothing more when an end note of the game-end roll already says it', () => {
		const win = { winner: 0, reason: 'king' }
		expect(endText(V, null, [])).toBe('')
		expect(endText(V, win, ['end:' + JSON.stringify(win)])).toBe('')
		expect(endText(V, win, ['end:null'])).toBe('The game ends: White wins (a king was captured)')
		expect(endText(V, { winner: null, reason: 'bareKings' }))
			.toBe('The game ends: Draw (only the two kings are left)')
	})
})

describe('U3: the escape rule for splits, fast and exact', () => {
	it('finds the moves onto a square exactly as pieceMoves lists them, in every variant', async () => {
		let compared = 0
		for (const id of VARIANT_IDS) {
			const W = await loadVariant(id)
			const rng = seededRng(4000 + id.length)
			let s = newGame(W, optionValues(W, {}), rng)
			for (let ply = 0; ply < 24 && !s.result; ply++) {
				const b = s.worlds[Math.floor(rng() * s.worlds.length)].b
				for (let pid = 0; pid < b.sq.length; pid++) {
					if (b.sq[pid] < 0) {
						continue
					}
					const all = []
					pieceMoves(W, b, pid, all)
					// every square of the piece's lines (screens and blocked squares too) and one elsewhere
					const squares = new Set(linesOf(W, b.ty[pid], b.sd[pid], b.sq[pid]).flatMap((l) => l.squares))
					squares.add(Math.floor(rng() * W.topology.size))
					for (const to of squares) {
						const where = id + ' ' + pid + ' ' + to
						expect(movesOnto(W, b, pid, to), where).toEqual(all.filter((m) => m.to === to))
						compared++
					}
				}
				const codes = legalMoves(W, s, { splits: ply % 4 === 1 }).map((m) => m.code)
				s = applyMove(W, s, codes[Math.floor(rng() * codes.length)], rng).state
			}
		}
		expect(compared).toBeGreaterThan(10000)
	}, 60000)

	it('lets a split escape where no single move does (its halves block two lines)', () => {
		// in the second and third case the splitting piece is a ghost, so the split also has worlds where it does not
		// stand on its square (idle worlds)
		const cases = [
			{
				W: hexagonal,
				worlds: [{ f1: '1:k', f2: '1:r', d3: '0:k', a1: '0:q', h1: '0:q', g8: '0:q' }],
				code: 'g8-g9',
				split: 'f2-e1|g1',
				danger: 0.5,
			},
			{
				W: hexagonal,
				worlds: [
					{ d9: '1:k', h2: '1:q', g5: '0:k', b3: '0:q', f9: '0:q', b7: '0:r', k5: '0:n' },
					{ d9: '1:k', c5: '1:q', g5: '0:k', b3: '0:q', f9: '0:q', b7: '0:r', k5: '0:n' },
				],
				code: 'k5-l2',
				split: 'c5-c8|e9',
				danger: 0.75,
			},
			{
				W: kriegspiel,
				worlds: [
					{ c1: '1:k', d3: '1:q', c7: '0:k', g1: '0:r', h2: '0:q', f4: '0:b', g8: '0:n' },
					{ c1: '1:k', f8: '1:q', c7: '0:k', g1: '0:r', h2: '0:q', f4: '0:b', g8: '0:n' },
				],
				code: 'g8-h6',
				split: 'd3-d1|d2',
				danger: 0.75,
			},
			{
				// three lines onto h8 (rank, file, long diagonal); the queen's part on d4 blocks the diagonal, h4
				// blocks the file and e8 the rank: every key is missing from one part of the split (idle worlds too)
				W: kriegspiel,
				worlds: [
					{ a3: '0:k', a8: '0:r', h1: '0:r', a1: '0:b', f5: '0:n', h8: '1:k', e4: '1:q' },
					{ a3: '0:k', a8: '0:r', h1: '0:r', a1: '0:b', f5: '0:n', h8: '1:k', d4: '1:q' },
				],
				code: 'a3-a2',
				split: 'e4-h4|e8',
				danger: 0.75,
			},
		]
		for (const { W, worlds, code, split, danger } of cases) {
			const off = withoutEscape(W)
			const s = worldsOf(W, worlds)
			expect(play(W, s, code).result, W.id + ' ' + code).toBeNull()
			const plain = play(off, s, code)
			for (const a of legalMoves(off, plain, { splits: true })) {
				if (a.type !== 'split') {
					expect(leastDanger(off, plain, a.code), a.code).toBe(1)
				}
			}
			expect(leastDanger(off, plain, split)).toBe(danger)
			// each half on its own is no escape
			const [from, pair] = split.split('-')
			for (const t of pair.split('|')) {
				expect(leastDanger(off, plain, from + '-' + t), from + '-' + t).toBe(1)
			}
			expect(trappedByPlainSearch(off, plain)).toBe(false)
		}
	})

	it('agrees with a plain search on mates in hexagonal, 5 × 5 × 5 and 4D chess', () => {
		const cases = [
			{
				W: hexagonal,
				code: 'l5-k3',
				place: { f8: '1:k', e6: '1:r', b1: '0:k', f6: '0:r', d8: '0:q', g7: '0:q', l5: '0:n' },
			},
			{
				W: raumschach,
				code: 'Aa5-Ab5',
				place: { Ea5: '1:k', Ec1: '1:u', De4: '0:k', Eb3: '0:q', Da5: '0:r', Dc5: '0:q', Aa5: '0:q' },
			},
			{
				W: hyper4d,
				code: 'C4b4-C4c3',
				place: { C4a3: '1:k', B1d4: '1:b', C1b1: '0:k', C2b3: '0:b', C3a3: '0:q', A1d2: '0:q', C4b4: '0:b' },
			},
		]
		for (const { W, place, code } of cases) {
			// one world, and two with a White knight ghost far away
			const far = W.topology.names.find((n) => !(n in place) && !code.endsWith(n))
			const other = W.topology.names.findLast((n) => !(n in place) && !code.endsWith(n))
			for (const placements of [[place], [{ ...place, [far]: '0:n' }, { ...place, [other]: '0:n' }]]) {
				const s = worldsOf(W, placements)
				expect(play(W, s, code).result, W.id).toEqual({ winner: 0, reason: 'cannotEscape' })
				expect(trappedByPlainSearch(withoutEscape(W), play(withoutEscape(W), s, code))).toBe(true)
			}
		}
	})

	it('stays exact when the idle worlds of a split depend on the split (an action-dependent applyMiss)', () => {
		// idle worlds remember the split that left them alone: every split builds new idle worlds
		const tagged = defineVariant(Object.assign(orthodoxSpec(), {
			id: 'test-ui2-tag',
			category: 'rules',
			rules: () => [],
			applyMiss: (b, action) => (action.type === 'split' ? { ...b, x: { ...b.x, tag: action.code } } : b),
		}))
		const worlds = [
			{ c1: '1:k', d3: '1:q', c7: '0:k', g1: '0:r', h2: '0:q', f4: '0:b', g8: '0:n' },
			{ c1: '1:k', f8: '1:q', c7: '0:k', g1: '0:r', h2: '0:q', f4: '0:b', g8: '0:n' },
		]
		const off = withoutEscape(tagged)
		const s = worldsOf(tagged, worlds)
		expect(play(tagged, s, 'g8-h6').result).toBeNull()
		expect(trappedByPlainSearch(off, play(off, s, 'g8-h6'))).toBe(false)
		// the back-rank trap (engine-rules W14) with a Black knight ghost that cannot stop the rook: its splits have
		// idle worlds, and none of them escapes
		const rank = { e1: '0:k', a1: '0:r', g8: '1:k', f7: '1:p', g7: '1:p', h7: '1:p' }
		const trap = worldsOf(tagged, [{ ...rank, b4: '1:n' }, { ...rank, h4: '1:n' }])
		expect(play(tagged, trap, 'a1-a8').result).toEqual({ winner: 0, reason: 'cannotEscape' })
		expect(trappedByPlainSearch(off, play(off, trap, 'a1-a8'))).toBe(true)
	})

	it('decides mates with a big army and eight worlds quickly (hexagonal, 5 × 5 × 5, 4D)', () => {
		const cases = [
			[hexagonal, {
				l2: '1:k',
				k3: '0:q',
				h4: '0:k',
				b2: '1:r',
				l6: '1:b',
				a1: '1:b',
				a4: '1:q',
				f5: '1:r',
				d9: '1:b',
				e1: '1:q',
				f1: '1:q',
				h7: '0:n',
			}, [['e6', 'l4'], ['e8', 'b4'], ['d5', 'f10']], 'h7-i4'],
			[raumschach, {
				Ad5: '1:k',
				Bd5: '0:q',
				Ce4: '0:k',
				Eb2: '1:b',
				Ee1: '1:r',
				Ed4: '1:r',
				Ee4: '1:b',
				Ca3: '1:q',
				Ea4: '1:b',
				Aa3: '0:n',
			}, [['Be4', 'Bd4'], ['Ec3', 'Ce1'], ['Cc1', 'Ec1']], 'Aa3-Ab5'],
			[hyper4d, {
				A4a3: '1:k',
				B3b3: '0:q',
				A4c3: '0:k',
				D2c2: '1:q',
				B2d1: '1:q',
				C2d1: '1:q',
				A2d1: '1:q',
				D2b3: '1:q',
				D2a4: '0:n',
			}, [['B1c2', 'D2c1'], ['B1d1', 'A3b4'], ['B2d4', 'B3d2']], 'D2a4-D2b2'],
		]
		for (const [W, common, pairs, code] of cases) {
			const s = worldsOf(W, eightWorlds(common, pairs))
			expect(s.worlds).toHaveLength(8)
			const list = branches(W, s, code)
			const start = performance.now()
			const after = stateAfter(W, s, code, list[0], list)
			const ms = performance.now() - start
			expect(after.result, W.id).toEqual({ winner: 0, reason: 'cannotEscape' })
			expect(legalMoves(W, { ...after, result: null }, { splits: true }).length).toBeGreaterThan(800)
			// about 5-30 ms on a laptop; the bound only catches a return to searching every split in full
			expect(ms, W.id).toBeLessThan(1500)
		}
	}, 30000)
})

describe('U4: a slide blocked in some worlds may leave a piece on a fifth square, as in the classic engine', () => {
	const moves = ['e1-a1|h1', 'c6-d6', 'h1-h2|h3', 'd6-c6', 'h3-g3|h4', 'c6-d6', 'b2-a4|c4', 'd6-c6']

	it('links the rook onto a fifth square, while a split may not spread it that far', () => {
		let s = worldsOf(V, [{ f8: '0:k', c6: '1:k', b2: '0:n', e1: '0:r' }])
		for (const code of moves) {
			s = play(V, s, code)
		}
		const rook = s.worlds[0].b.board.findIndex((id) => id >= 0 && s.worlds[0].b.ty[id] === 'r')
		const id = s.worlds[0].b.board[rook]
		expect(pieceLocations(s, id)).toHaveLength(4)
		expect(branches(V, s, 'a1-b1|c1')).toBeNull()
		expect(outcomes(V, s, 'a1-a8').map((o) => [o.key, o.rolled])).toEqual([['move', false]])
		const after = play(V, s, 'a1-a8')
		const where = (st) => pieceLocations(st, id).map((l) => [V.topology.names[l.sq], l.p])
		expect(where(after)).toEqual([['a1', 0.25], ['h2', 0.25], ['g3', 0.125], ['h4', 0.125], ['a8', 0.25]])
	})

	it('matches the classic engine, which links onto the fifth square too and refuses such a split', () => {
		let c = setupPosition({ fen: '5K2/8/2k5/8/8/8/1N6/4R3 w - - 0 1' })
		for (const code of moves) {
			c = classicApply(c, code, { rng: () => 0.3 }).state
		}
		expect(whyIllegal(c, 'a1-b1|c1')).toBe('location_cap')
		const outs = getOutcomes(c, 'a1-a8')
		expect(outs).toHaveLength(1)
		const rook = Object.values(classicLocations(outs[0].state)).find((list) => list.length === 5)
		expect(rook.map((l) => [squareName(l.square), l.probability]).sort())
			.toEqual([['a1', 0.25], ['a8', 0.25], ['g3', 0.125], ['h2', 0.25], ['h4', 0.125]])
	})
})

describe('U5: the pieces off the board turn with their side', () => {
	it('turns each side as on the board', () => {
		// Sente's view: Gote's pieces point down; Gote's view (the board turned): Sente's point down
		expect([0, 1].map((side) => pieceSpin(shogi, side, 0))).toEqual([0, 180])
		expect([0, 1].map((side) => pieceSpin(shogi, side, 180))).toEqual([180, 0])
		const four = { sides: [{ rotate: 0 }, { rotate: 270 }, { rotate: 180 }, { rotate: 90 }] }
		expect([0, 1, 2, 3].map((side) => pieceSpin(four, side, 90))).toEqual([90, 0, 270, 180])
	})
})
