/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The classic end rules and rule fixes of the quantum layer (package "rules"): "your king cannot escape" (R1), the
 * bare-kings draw (R2), draws that wait for a certain royal capture (R3), converging captures next to the king in the
 * king danger (R4), a merge onto a part with another face (R5), a merging piece absent from the first world (R6),
 * superposed pieces whose lowest square may hold another piece (R7), no split at a full budget (R8) and the
 * declaration flags (R9).
 */

import { describe, expect, it } from 'vitest'
import { seededRng } from '../../../src/engine/index.js'
import { aiSplits } from '../../../src/variants/core/ai.js'
import {
	clearEnPassant,
	KING_STEPS,
	orthodoxAfterMove,
	orthodoxTypes,
	pawnExtras,
	standardBoard,
} from '../../../src/variants/core/orthodox.js'
import { orthodoxSpec, whiteBlack } from '../../../src/variants/core/orthodoxVariant.js'
import {
	applyOutcome,
	branches,
	budgetInfo,
	isLegal,
	legalMoves,
	mergesFrom,
	newGame,
	outcomes,
	royalDanger,
	splitCode,
	splitsFrom,
	splitTargets,
	STATE_VERSION,
	stateAfter,
	T,
} from '../../../src/variants/core/quantum.js'
import { defineVariant } from '../../../src/variants/core/variant.js'
import { addPiece, HAND, hasRoyal, OFF, placePiece, worldFrom } from '../../../src/variants/core/world.js'
import { play, stateOf } from './helpers.js'

/**
 * An orthodox test variant (with the hooks of `orthodoxSpec()`).
 *
 * @param {object|((spec: object) => object)} [extra] fields to add, or a function of the declaration that returns them
 * @param {object} [opts] options for `orthodoxSpec`
 * @return {object}
 */
function variant(extra = {}, opts = {}) {
	const spec = orthodoxSpec(opts)
	const add = typeof extra === 'function' ? extra(spec) : extra
	return defineVariant(Object.assign(spec, { id: 'test', category: 'rules' }, add))
}

/** Plain orthodox chess with every classic end rule. */
const V = variant()

/**
 * The square with a name on the 8 × 8 board.
 *
 * @param {string} name square name
 * @return {number}
 */
function sq(name) {
	return V.topology.byName(name)
}

/**
 * Outcomes as `[key, p]` pairs.
 *
 * @param {object} W variant
 * @param {object} s state
 * @param {string} code move code
 * @return {Array<[string, number]>}
 */
function keysOf(W, s, code) {
	return outcomes(W, s, code).map((o) => [o.key, o.p])
}

/** docs/engine-rules.md W14: White Ra1, Ke1; Black Kg8, pawns f7, g7, h7. `a1-a8` traps the Black king. */
const BACK_RANK = { e1: '0:k', a1: '0:r', g8: '1:k', f7: '1:p', g7: '1:p', h7: '1:p' }

/**
 * The back-rank position with 8 worlds: a White knight on b1 or h3, a White bishop on c1 or e3 and a Black knight on
 * b4 or h4 (none of them can stop the rook).
 *
 * @return {Array<[object, number]>}
 */
function backRank8() {
	const out = []
	for (const n of ['b1', 'h3']) {
		for (const bishop of ['c1', 'e3']) {
			for (const bn of ['b4', 'h4']) {
				out.push([{ ...BACK_RANK, [n]: '0:n', [bishop]: '0:b', [bn]: '1:n' }, 1])
			}
		}
	}
	return out
}

/**
 * The explosion of a mini-atomic chess: a capture removes the capturer and every non-pawn piece next to the capture
 * square.
 *
 * @param {object} spec variant declaration
 * @param {object} next the new world (changed in place)
 * @param {object} m the move played
 */
function explode(spec, next, m) {
	if (m.capture < 0) {
		return
	}
	const [x, y] = spec.topology.coords[m.to]
	placePiece(next, m.id, OFF)
	for (let id = 0; id < next.sq.length; id++) {
		const s = next.sq[id]
		if (s < 0 || next.ty[id] === 'p') {
			continue
		}
		const [a, c] = spec.topology.coords[s]
		if (Math.abs(a - x) <= 1 && Math.abs(c - y) <= 1) {
			placePiece(next, id, OFF)
		}
	}
}

/**
 * A mini-atomic variant (see `explode`).
 *
 * @return {object}
 */
function atomic() {
	return variant((spec) => ({
		afterMove(next, m) {
			orthodoxAfterMove(spec, next, m)
			explode(spec, next, m)
		},
	}))
}

/**
 * Orthodox pieces on a small n × n board (no castling, no double steps), for random positions.
 *
 * @param {number} n board size
 * @param {object} [opts] options
 * @param {boolean} [opts.blast] with the explosions of `explode`
 * @param {boolean} [opts.escapeRule] the escape rule flag (default: the classic default)
 * @return {object}
 */
function small(n, { blast = false, escapeRule } = {}) {
	const board = standardBoard(n, n)
	const spec = {
		id: 'small',
		category: 'rules',
		rules: () => [],
		sides: whiteBlack(),
		topology: board.topology,
		types: orthodoxTypes({ lastRank: board.lastRank }),
		setup: () => worldFrom(spec, {}),
		extraMoves: (w, side) => pawnExtras(spec, w, side, () => false),
		afterMove(next, m) {
			orthodoxAfterMove(spec, next, m)
			if (blast) {
				explode(spec, next, m)
			}
		},
		applyMiss: (b) => clearEnPassant(b),
	}
	if (escapeRule !== undefined) {
		spec.escapeRule = escapeRule
	}
	return defineVariant(spec)
}

/**
 * A random position of `small(n)` with White to move: both kings, two to four White pieces, up to three Black ones,
 * and up to two ghosts (a piece that may also stand on another square), so up to four worlds.
 *
 * @param {object} W variant
 * @param {() => number} rng random numbers
 * @return {object}
 */
function randomPosition(W, rng) {
	const names = W.topology.names
	const top = Math.round(Math.sqrt(names.length)) - 1
	const used = new Set()
	const free = () => {
		for (;;) {
			const s = names[Math.floor(rng() * names.length)]
			if (!used.has(s)) {
				used.add(s)
				return s
			}
		}
	}
	const place = { [free()]: '0:k', [free()]: '1:k' }
	for (const [side, count] of [[0, 2 + Math.floor(rng() * 3)], [1, Math.floor(rng() * 4)]]) {
		for (let i = 0; i < count; i++) {
			const type = 'qrbnprnb'[Math.floor(rng() * 8)]
			const s = free()
			const rank = W.topology.coords[W.topology.byName(s)][1]
			if (type !== 'p' || (rank > 0 && rank < top)) {
				place[s] = side + ':' + type
			}
		}
	}
	let worlds = [place]
	const movable = Object.keys(place).filter((s) => !/[kp]$/.test(place[s]))
	for (let g = Math.floor(rng() * 3); g > 0 && movable.length > 0; g--) {
		const from = movable.splice(Math.floor(rng() * movable.length), 1)[0]
		const to = free()
		// the same key order in every world keeps the piece ids
		const moved = (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k === from ? to : k, v]))
		worlds = worlds.flatMap((p) => [p, moved(p)])
	}
	return stateOf(W, worlds.map((p) => [p, 1]))
}

/**
 * The escape rule by plain search, on a state without a result: the side to move has a legal action, none of its
 * actions captures an enemy royal piece in any world, and every outcome of every action goes on with a king danger of
 * 100 % for it.
 *
 * @param {object} W variant
 * @param {object} s state
 * @return {boolean}
 */
function trappedByPlainSearch(W, s) {
	const d = s.turn
	const royals = (b, side) => b.sq.filter((q, id) => q >= 0 && b.sd[id] === side && W.royalTypes.has(b.ty[id])).length
	const before = royals(s.worlds[0].b, 1 - d)
	const acts = legalMoves(W, s, { splits: true })
	let trapped = acts.length > 0
	for (const a of acts) {
		const list = branches(W, s, a.code)
		for (const br of list) {
			if (br.worlds.some((e) => royals(e.b, 1 - d) < before)) {
				return false
			}
			const next = stateAfter(W, s, a.code, br, list, { light: true })
			if (next.result || royalDanger(W, next, d) < 1) {
				trapped = false
			}
		}
	}
	return trapped
}

/**
 * The king danger by brute force: for every legal ordinary move and merge of each enemy, the weight of the worlds of
 * its outcomes in which `side` has no royal piece left.
 *
 * @param {object} W variant
 * @param {object} s state
 * @param {number} side the side in danger
 * @return {number}
 */
function bruteDanger(W, s, side) {
	if (s.result) {
		return 0
	}
	let best = 0
	for (let e = 0; e < W.sideCount; e++) {
		if (e === side) {
			continue
		}
		const se = { ...s, turn: e }
		for (const m of legalMoves(W, se)) {
			if (m.type !== 'move' && m.type !== 'merge') {
				continue
			}
			let w = 0
			for (const br of branches(W, se, m.code) ?? []) {
				for (const entry of br.worlds) {
					if (!hasRoyal(W, entry.b, side)) {
						w += entry.w
					}
				}
			}
			best = Math.max(best, w / T)
		}
	}
	return best
}

/**
 * Play random games with many splits and call `visit` on every state.
 *
 * @param {object} W variant
 * @param {number} seed seed
 * @param {number} plies plies per game
 * @param {(s: object) => void} visit called on every state
 */
function randomStates(W, seed, plies, visit) {
	const rng = seededRng(seed)
	let s = newGame(W)
	for (let ply = 0; ply < plies && !s.result; ply++) {
		visit(s)
		let codes = legalMoves(W, s).map((m) => m.code)
		if (ply % 3 === 0) {
			const splits = []
			for (let id = 0; id < s.worlds[0].b.sq.length; id++) {
				const f = s.worlds[0].b.sq[id]
				if (f >= 0 && s.worlds[0].b.sd[id] === s.turn) {
					splits.push(...splitsFrom(W, s, f).map((m) => m.code))
				}
			}
			if (splits.length > 0) {
				codes = splits
			}
		}
		const code = codes[Math.floor(rng() * codes.length)]
		const list = branches(W, s, code)
		s = applyOutcome(W, s, code, Math.floor(rng() * list.length))
	}
}

describe('R9 declaration flags', () => {
	it('switches the classic end rules on for a two-player game with royal pieces and one move per turn', () => {
		for (const flag of ['escapeRule', 'bareKingsDraw', 'drawsWait']) {
			expect(V[flag]).toBe(true)
			expect(variant({}, { royalKing: false })[flag]).toBe(false)
			expect(variant({ compulsoryCapture: true })[flag]).toBe(false)
			expect(variant({ nextSide: (b, side) => 1 - side })[flag]).toBe(false)
			expect(variant({ actions: () => [] })[flag]).toBe(false)
			const three = [...whiteBlack(), { id: 'r', name: () => 'Red', color: 'red' }]
			expect(variant({ sides: three })[flag]).toBe(false)
			expect(variant({ [flag]: false })[flag]).toBe(false)
			expect(variant({ compulsoryCapture: true, [flag]: true })[flag]).toBe(true)
		}
	})

	it('has special moves unless the variant says otherwise', () => {
		expect(V.specialMoves).toBe(true)
		expect(variant({ specialMoves: false }).specialMoves).toBe(false)
	})
})

describe('R1 your king cannot escape', () => {
	it('a: ends the game when every answer leaves the king capturable for certain (engine-rules W14)', () => {
		const s = stateOf(V, [[BACK_RANK, 1]])
		expect(play(V, s, 'a1-a8').result).toEqual({ winner: 0, reason: 'cannotEscape' })
	})

	it('a: a piece that can block the rank is an escape', () => {
		const s = stateOf(V, [[{ ...BACK_RANK, d7: '1:n' }, 1]])
		expect(play(V, s, 'a1-a8').result).toBeNull()
	})

	it('b: never in light mode, and not without the flag', () => {
		const s = stateOf(V, [[BACK_RANK, 1]])
		const list = branches(V, s, 'a1-a8')
		expect(stateAfter(V, s, 'a1-a8', list[0], list, { light: true }).result).toBeNull()
		const W = variant({ escapeRule: false })
		expect(play(W, stateOf(W, [[BACK_RANK, 1]]), 'a1-a8').result).toBeNull()
	})

	it('c: counts every action at 8 worlds (moves, splits, merges, measurements)', () => {
		const s = stateOf(V, backRank8())
		expect(s.worlds).toHaveLength(8)
		expect(budgetInfo(V, { ...s, turn: 1 }, 1).used).toBe(2)
		expect(play(V, s, 'a1-a8').result).toEqual({ winner: 0, reason: 'cannotEscape' })
	})

	it('d: a split that meets two threats half each is an escape', () => {
		// after a1-a8 the Black king on h8 is attacked along the rank and the file: e8|h5 blocks each half the time
		const place = { b3: '0:k', a1: '0:r', h1: '0:r', h8: '1:k', g7: '1:p', f6: '1:n' }
		const s = stateOf(V, [[place, 1]])
		const after = play(V, s, 'a1-a8')
		expect(after.result).toBeNull()
		for (const code of ['f6-e8', 'f6-h5', 'h8-g8', 'h8-h7', 'g7-g6']) {
			expect(royalDanger(V, play(V, after, code), 1)).toBe(1)
		}
		expect(royalDanger(V, play(V, after, 'f6-e8|h5'), 1)).toBe(0.5)
		// the same with a knight that cannot split
		const W = variant((spec) => {
			spec.types.n = { ...spec.types.n, splittable: false }
			return {}
		})
		expect(play(W, stateOf(W, [[place, 1]]), 'a1-a8').result).toEqual({ winner: 0, reason: 'cannotEscape' })
	})

	it('e: an outcome that ends the game is an escape', () => {
		/**
		 * Capture the king, or win with the king on g8.
		 *
		 * @param {object} b world
		 * @return {object|null}
		 */
		function goal(b) {
			const alive = [hasRoyal(V, b, 0), hasRoyal(V, b, 1)]
			if (!alive[0] || !alive[1]) {
				return { winner: alive[0] ? 0 : 1, reason: 'king' }
			}
			const on = b.board[sq('g8')]
			return on >= 0 && b.ty[on] === 'k' ? { winner: b.sd[on], reason: 'goal' } : null
		}
		const place = { e1: '0:k', a1: '0:r', h8: '1:k', g7: '1:p', h7: '1:p' }
		expect(play(V, stateOf(V, [[place, 1]]), 'a1-a8').result).toEqual({ winner: 0, reason: 'cannotEscape' })
		const W = variant({ worldResult: goal })
		expect(play(W, stateOf(W, [[place, 1]]), 'a1-a8').result).toBeNull()
	})

	it('f: an action that might capture an enemy royal piece is an escape, even if the game goes on', () => {
		// White has two royal kings: taking one does not end the game
		const s = stateOf(V, [[{ ...BACK_RANK, c1: '0:k', f3: '1:n' }, 1]])
		expect(play(V, s, 'a1-a8').result).toBeNull()
		const t = stateOf(V, [[{ ...BACK_RANK, c1: '0:k', f4: '1:n' }, 1]])
		expect(play(V, t, 'a1-a8').result).toEqual({ winner: 0, reason: 'cannotEscape' })
	})

	it('f: a ghost that might capture the enemy king is an escape', () => {
		// the Black knight is on f3 (it attacks e1) or on b4
		const ghost = stateOf(V, [[{ ...BACK_RANK, f3: '1:n' }, 1], [{ ...BACK_RANK, b4: '1:n' }, 1]])
		expect(play(V, ghost, 'a1-a8').result).toBeNull()
		const far = stateOf(V, [[{ ...BACK_RANK, f4: '1:n' }, 1], [{ ...BACK_RANK, b4: '1:n' }, 1]])
		expect(play(V, far, 'a1-a8').result).toEqual({ winner: 0, reason: 'cannotEscape' })
	})

	it('g: a side with no legal action gets the noMoves draw, not a loss', () => {
		const W = variant((spec) => {
			spec.types.x = { moves: [], royal: true }
			return {}
		})
		const s = stateOf(W, [[{ e1: '0:k', a8: '0:r', h8: '1:x' }, 1]])
		const after = play(W, s, 'e1-d1')
		expect(after.result).toEqual({ winner: null, reason: 'noMoves' })
		expect(royalDanger(W, { ...after, result: null }, 1)).toBe(1)
	})

	it('h: an escape that works in one outcome of a roll is an escape', () => {
		// the rook on h1 attacks h8 and h7; the Black king's only other square g8 may hold a White knight whose other
		// part (d8) blocks the rook on a8: stepping there rolls, and the Moved outcome is safe
		const place = { e1: '0:k', a1: '0:r', h1: '0:r', h8: '1:k', g7: '1:p' }
		const s = stateOf(V, [[{ ...place, g8: '0:n' }, 1], [{ ...place, d8: '0:n' }, 1]])
		const after = play(V, s, 'a1-a8')
		expect(after.result).toBeNull()
		expect(keysOf(V, after, 'h8-g8')).toEqual([['move', 0.5], ['capture', 0.5]])
		expect(royalDanger(V, applyOutcome(V, after, 'h8-g8', 0), 1)).toBe(0)
		expect(royalDanger(V, applyOutcome(V, after, 'h8-g8', 1), 1)).toBe(1)
		const t = stateOf(V, [[{ ...place, g8: '0:n' }, 1], [{ ...place, b1: '0:n' }, 1]])
		expect(play(V, t, 'a1-a8').result).toEqual({ winner: 0, reason: 'cannotEscape' })
	})

	it('i: comes before the quiet-move draw, and never when every answer reaches the move limit (edge case 86)', () => {
		const quiet = { ...stateOf(V, [[BACK_RANK, 1]]), quiet: V.quietPlies - 1 }
		expect(play(V, quiet, 'a1-a8').result).toEqual({ winner: 0, reason: 'cannotEscape' })
		const late = { ...stateOf(V, [[BACK_RANK, 1]]), ply: V.maxPly - 2 }
		const after = play(V, late, 'a1-a8')
		expect(after.result).toBeNull()
		expect(play(V, after, 'g8-h8').result).toEqual({ winner: null, reason: 'moveLimit' })
	})

	it('j: a smothered king with a big army and eight worlds, splits allowed', () => {
		const place = {
			a1: '0:k',
			e5: '0:n',
			a3: '0:p',
			h8: '1:k',
			g8: '1:r',
			g7: '1:p',
			h7: '1:p',
			b5: '1:q',
			a8: '1:r',
			c8: '1:b',
			b6: '1:n',
			a6: '1:p',
			b7: '1:p',
			c6: '1:p',
		}
		const worlds = []
		for (const n of ['b1', 'd1']) {
			for (const b of ['c1', 'a2']) {
				for (const r of ['e1', 'f1']) {
					worlds.push([{ ...place, [n]: '0:n', [b]: '0:b', [r]: '0:r' }, 1])
				}
			}
		}
		const s = stateOf(V, worlds)
		const after = play(V, s, 'e5-f7')
		expect(after.worlds).toHaveLength(8)
		expect(budgetInfo(V, after, 1).used).toBe(1)
		expect(after.result).toEqual({ winner: 0, reason: 'cannotEscape' })
		// with the Black bishop able to take the knight, play goes on
		const open = stateOf(V, worlds.map(([p]) => {
			const q = { ...p, d5: '1:b' }
			delete q.c8
			return [q, 1]
		}))
		expect(play(V, open, 'e5-f7').result).toBeNull()
	})

	it('l: decides a converging capture from single worlds (a knight ghost on f7|g6 smothers h8)', () => {
		// Black has many actions, and after each one the merge f7|g6-h8 takes the king in every world
		const place = {
			a1: '0:k',
			a3: '0:p',
			b2: '0:p',
			e5: '0:n',
			h8: '1:k',
			g8: '1:r',
			g7: '1:p',
			h7: '1:n',
			b3: '1:r',
			c1: '1:b',
			d8: '1:q',
			c5: '1:q',
		}
		const trapped = { winner: 0, reason: 'cannotEscape' }
		const off = variant({ escapeRule: false })
		const one = { ...place, c8: '1:b', a8: '1:r' }
		expect(trappedByPlainSearch(off, play(off, stateOf(off, [[one, 1]]), 'e5-f7|g6'))).toBe(true)
		expect(play(V, stateOf(V, [[one, 1]]), 'e5-f7|g6').result).toEqual(trapped)
		// with h7 free the king steps out of both knights' reach
		const free = { ...one }
		delete free.h7
		expect(trappedByPlainSearch(off, play(off, stateOf(off, [[free, 1]]), 'e5-f7|g6'))).toBe(false)
		expect(play(V, stateOf(V, [[free, 1]]), 'e5-f7|g6').result).toBeNull()
		// 8 worlds (Black ghosts c8|d7 and a8|b8): the classical moves applied while the rule decides are counted
		let applied = 0
		const W = variant((spec) => ({
			afterMove(next, m) {
				applied++
				orthodoxAfterMove(spec, next, m)
			},
		}))
		const worlds = []
		for (const bishop of ['c8', 'd7']) {
			for (const rook of ['a8', 'b8']) {
				worlds.push([{ ...place, [bishop]: '1:b', [rook]: '1:r' }, 1])
			}
		}
		const s = stateOf(W, worlds)
		const list = branches(W, s, 'e5-f7|g6')
		applied = 0
		const after = stateAfter(W, s, 'e5-f7|g6', list[0], list)
		expect(after.worlds).toHaveLength(8)
		expect(after.result).toEqual(trapped)
		// each outcome is decided from its worlds (about 700 moves applied); building every outcome's state and
		// weighing the merge there applied over 9,000 and took 50-70 ms
		expect(applied).toBeLessThan(2000)
	})

	it('k: agrees with a plain search over every action and outcome on random small positions', () => {
		let trapped = 0
		for (const [n, blast, count, seed] of [[4, false, 700, 21], [5, false, 300, 22], [4, true, 500, 23]]) {
			const on = small(n, { blast })
			const off = small(n, { blast, escapeRule: false })
			const rng = seededRng(seed)
			for (let i = 0; i < count; i++) {
				const s = randomPosition(on, rng)
				const acts = legalMoves(on, s, { splits: true })
				for (let k = 0; k < 3 && acts.length > 0; k++) {
					const code = acts[Math.floor(rng() * acts.length)].code
					branches(on, s, code).forEach((br, o) => {
						const without = applyOutcome(off, s, code, o)
						const result = applyOutcome(on, s, code, o).result
						if (without.result) {
							expect(result).toEqual(without.result)
							return
						}
						const expected = trappedByPlainSearch(off, without)
						expect(result, code).toEqual(expected ? { winner: 0, reason: 'cannotEscape' } : null)
						trapped += expected ? 1 : 0
					})
				}
			}
		}
		expect(trapped).toBeGreaterThan(50)
	})
})

describe('R2 bare kings', () => {
	it('draws when only the two kings are left', () => {
		const s = stateOf(V, [[{ e1: '0:k', d2: '1:n', e8: '1:k' }, 1]])
		expect(play(V, s, 'e1-d2').result).toEqual({ winner: null, reason: 'bareKings' })
		const W = variant({ bareKingsDraw: false })
		expect(play(W, stateOf(W, [[{ e1: '0:k', d2: '1:n', e8: '1:k' }, 1]]), 'e1-d2').result).toBeNull()
	})

	it('needs every world and no piece in hand', () => {
		const ghost = stateOf(V, [[{ e1: '0:k', d2: '1:n', e8: '1:k' }, 1], [{ e1: '0:k', a6: '1:n', e8: '1:k' }, 1]])
		expect(keysOf(V, ghost, 'e1-d2')).toEqual([['move', 0.5], ['capture', 0.5]])
		expect(applyOutcome(V, ghost, 'e1-d2', 1).result).toEqual({ winner: null, reason: 'bareKings' })
		expect(applyOutcome(V, ghost, 'e1-d2', 0).result).toBeNull()
		// the king captures in both worlds, but a Black knight stays in one of them
		const mixed = stateOf(V, [
			[{ e3: '0:k', d4: '1:n', e8: '1:k' }, 1],
			[{ e3: '0:k', d4: '1:b', e8: '1:k', a6: '1:n' }, 1],
		])
		expect(keysOf(V, mixed, 'e3-d4')).toEqual([['capture', 1]])
		expect(play(V, mixed, 'e3-d4').result).toBeNull()
		const hand = stateOf(V, [[{ e1: '0:k', d2: '1:n', e8: '1:k' }, 1]], 0, (w) => {
			w.x = { ep: -1, epVictim: -1, castle: [] }
			addPiece(w, 'p', 1, HAND)
		})
		expect(play(V, hand, 'e1-d2').result).toBeNull()
	})

	it('agrees with a variant that draws bare kings in worldResult', () => {
		/**
		 * Capture the king; only the two kings, not touching, is a draw (as hyper4d, makruk and trid do it).
		 *
		 * @param {object} b world
		 * @return {object|null}
		 */
		function own(b) {
			const kings = []
			let pieces = 0
			for (let id = 0; id < b.sq.length; id++) {
				if (b.sq[id] >= 0) {
					pieces++
					if (b.ty[id] === 'k') {
						kings[b.sd[id]] = V.topology.coords[b.sq[id]]
					}
				}
			}
			if (!kings[0] || !kings[1]) {
				return { winner: kings[0] ? 0 : 1, reason: 'king' }
			}
			const touch = Math.max(Math.abs(kings[0][0] - kings[1][0]), Math.abs(kings[0][1] - kings[1][1])) === 1
			return pieces === 2 && !touch ? { winner: null, reason: 'bareKings' } : null
		}
		const W = variant({ worldResult: own, bareKingsDraw: false })
		for (const [place, code] of [
			[{ e1: '0:k', d2: '1:n', e8: '1:k' }, 'e1-d2'],
			[{ e4: '0:k', d5: '1:n', e6: '1:k' }, 'e4-d5'],
			[{ e4: '0:k', d5: '1:n', e7: '1:k' }, 'e4-d5'],
			[{ e4: '0:k', d5: '1:n', e6: '1:k', a2: '0:p' }, 'e4-d5'],
		]) {
			const core = play(V, stateOf(V, [[place, 1]]), code).result
			expect(core).toEqual(play(W, stateOf(W, [[place, 1]]), code).result)
		}
	})
})

describe('R3 draws wait for a certain royal capture', () => {
	it('bare kings side by side: the side to move takes the king (engine-rules W16)', () => {
		const s = stateOf(V, [[{ e4: '0:k', d5: '1:n', e6: '1:k' }, 1]])
		const after = play(V, s, 'e4-d5')
		expect(after.result).toBeNull()
		expect(play(V, after, 'e6-d5').result).toEqual({ winner: 1, reason: 'king' })
		expect(play(V, after, 'e6-f7').result).toEqual({ winner: null, reason: 'bareKings' })
	})

	it('the quiet draw waits too, and only while the capture is certain', () => {
		const place = { e1: '0:k', a1: '0:r', e8: '1:k', e5: '1:r' }
		const s = { ...stateOf(V, [[place, 1]]), quiet: 99 }
		const after = play(V, s, 'a1-a2')
		expect(after.quiet).toBe(100)
		expect(after.result).toBeNull()
		expect(play(V, after, 'e5-e6').result).toEqual({ winner: null, reason: 'quiet' })
		const W = variant({ drawsWait: false })
		expect(play(W, { ...stateOf(W, [[place, 1]]), quiet: 99 }, 'a1-a2').result)
			.toEqual({ winner: null, reason: 'quiet' })
		// a rook that is only half there does not stop the draw
		const half = { ...stateOf(V, [[place, 1], [{ e1: '0:k', a1: '0:r', e8: '1:k', h5: '1:r' }, 1]]), quiet: 99 }
		expect(play(V, half, 'a1-a2').result).toEqual({ winner: null, reason: 'quiet' })
	})

	it('a converging capture of the king is a certain capture: the draw waits', () => {
		// the Black knight is on d4 or f4: either part takes a king on e2, the merge d4|f4-e2 takes it for certain
		const worlds = [[{ e1: '0:k', e8: '1:k', d4: '1:n' }, 1], [{ e1: '0:k', e8: '1:k', f4: '1:n' }, 1]]
		const s = { ...stateOf(V, worlds), quiet: V.quietPlies - 1 }
		const after = play(V, s, 'e1-e2')
		expect(after.result).toBeNull()
		expect(isLegal(V, after, 'd4-e2')).toBe(true)
		expect(keysOf(V, after, 'd4-e2')).toEqual([['miss', 0.5], ['capture', 0.5]])
		expect(keysOf(V, after, 'd4|f4-e2')).toEqual([['capture', 1]])
		expect(play(V, after, 'd4|f4-e2').result).toEqual({ winner: 1, reason: 'king' })
		expect(play(V, s, 'e1-d1').result).toEqual({ winner: null, reason: 'quiet' })
	})

	it('a capture that is not legal does not count, even when the king danger is 100 %', () => {
		// a1-a8 is a certain move in one world and an ordinary move in the other, so it is not legal at all
		const sure = (m) => (m.key === 'a1-a8' ? { ...m, certain: true } : m)
		const W = variant({ filterMoves: (w, side, list) => (w.x.sure ? list.map(sure) : list) })
		const place = { e1: '0:k', a1: '0:r', a8: '1:k', h5: '1:n' }
		const s = { ...stateOf(W, [[place, 1], [place, 1]], 1), quiet: W.quietPlies - 1 }
		s.worlds[0].b.x = { ...s.worlds[0].b.x, sure: true }
		const after = play(W, s, 'h5-g7')
		expect(after.result).toEqual({ winner: null, reason: 'quiet' })
		const open = { ...after, result: null }
		expect(royalDanger(W, open, 1)).toBe(1)
		expect(isLegal(W, open, 'a1-a8')).toBe(false)
	})

	it('the move limit does not wait', () => {
		const place = { e1: '0:k', a1: '0:r', e8: '1:k', e5: '1:r' }
		const s = { ...stateOf(V, [[place, 1]]), ply: V.maxPly - 1 }
		expect(play(V, s, 'a1-a2').result).toEqual({ winner: null, reason: 'moveLimit' })
	})
})

describe('R4 king danger counts a converging capture next to the king (atomic T24)', () => {
	const A = atomic()
	const two = [
		[{ e1: '0:k', d5: '0:n', e7: '1:k', f6: '1:b' }, 1],
		[{ e1: '0:k', h5: '0:n', e7: '1:k', f6: '1:b' }, 1],
	]

	it('a: the merge next to the king blows it up for certain', () => {
		expect(royalDanger(A, stateOf(A, two, 0), 1)).toBe(1)
		expect(royalDanger(A, stateOf(A, two, 1), 1)).toBe(1)
	})

	it('b: with a third part that reaches nothing, two thirds', () => {
		const three = [...two, [{ e1: '0:k', a1: '0:n', e7: '1:k', f6: '1:b' }, 1]]
		expect(keysOf(A, stateOf(A, three, 0), 'd5|h5-f6').map(([k]) => k)).toEqual(['miss', 'capture'])
		expect(royalDanger(A, stateOf(A, three, 1), 1)).toBeCloseTo(2 / 3, 6)
	})

	it('c: a merge onto the king itself', () => {
		const onto = [
			[{ e1: '0:k', d5: '0:n', f6: '1:k', a8: '1:b' }, 1],
			[{ e1: '0:k', h5: '0:n', f6: '1:k', a8: '1:b' }, 1],
		]
		expect(royalDanger(A, stateOf(A, onto, 1), 1)).toBe(1)
	})

	it('equals a brute-force count on the mini-atomic variant', () => {
		let checked = 0
		for (const seed of [31, 32, 33, 34]) {
			randomStates(A, seed, 40, (s) => {
				for (const side of [0, 1]) {
					expect(royalDanger(A, s, side)).toBe(bruteDanger(A, s, side))
					checked++
				}
			})
		}
		expect(checked).toBeGreaterThan(40)
	})

	it('equals a brute-force count on orthodox chess', () => {
		let checked = 0
		for (const seed of [11, 12, 13]) {
			randomStates(V, seed, 40, (s) => {
				for (const side of [0, 1]) {
					expect(royalDanger(V, s, side)).toBe(bruteDanger(V, s, side))
					checked++
				}
			})
		}
		expect(checked).toBeGreaterThan(150)
	})
})

describe('R5 a merge onto a part with another face is refused (shogi Q13)', () => {
	it('checks the target too', () => {
		const W = variant((spec) => {
			spec.types.s = { moves: [{ leap: KING_STEPS }] }
			spec.types['+s'] = { moves: [{ leap: KING_STEPS }] }
			return {}
		})
		const s = stateOf(W, [
			[{ e1: '0:k', d4: '0:s', e8: '1:k' }, 1],
			[{ e1: '0:k', f4: '0:s', e8: '1:k' }, 1],
			[{ e1: '0:k', e4: '0:+s', e8: '1:k' }, 1],
		])
		const codes = mergesFrom(W, s, sq('d4')).map((m) => m.code).filter((c) => c.startsWith('d4|f4-')).sort()
		expect(codes).toEqual(['d4|f4-e3', 'd4|f4-e5'])
		expect(branches(W, s, 'd4|f4-e4')).toBeNull()
		expect(branches(W, s, 'd4|f4-e3')).not.toBeNull()
		expect(legalMoves(W, s).map((m) => m.code)).not.toContain('d4|f4-e4')
	})
})

describe('R6 a merging piece absent from the first world', () => {
	it('reads its type where it stands', () => {
		const a = worldFrom(V, { e1: '0:k', e8: '1:k' }, { ep: -1, epVictim: -1, castle: [] })
		// the piece id 2 exists only in the other worlds (a multiverse twin): no square, no type
		a.sq.push(OFF)
		a.ty.push('')
		a.sd.push(0)
		const b = worldFrom(V, { e1: '0:k', e8: '1:k', d4: '0:n' }, { ep: -1, epVictim: -1, castle: [] })
		const c = worldFrom(V, { e1: '0:k', e8: '1:k', h4: '0:n' }, { ep: -1, epVictim: -1, castle: [] })
		const s = {
			v: STATE_VERSION,
			variant: V.id,
			options: {},
			worlds: [{ b: a, w: T / 2 }, { b, w: T / 4 }, { b: c, w: T / 4 }],
			turn: 0,
			ply: 0,
			quiet: 0,
			result: null,
			history: [],
		}
		expect(mergesFrom(V, s, sq('d4')).map((m) => m.code)).toContain('d4|h4-f5')
		expect(keysOf(V, s, 'd4|h4-f5')).toEqual([['move', 1]])
		expect(legalMoves(V, s).map((m) => m.code)).toContain('d4|h4-f5')
	})
})

describe('R7 a superposed piece whose lowest square may hold another piece', () => {
	// a Black knight on c3 or e3; where it is on e3, a White knight stands on c3 (makruk review)
	const s = stateOf(V, [
		[{ a1: '0:k', h8: '1:k', c3: '1:n', h1: '0:n' }, 1],
		[{ a1: '0:k', h8: '1:k', e3: '1:n', c3: '0:n' }, 1],
	], 1)

	it('offers the Measure on its other square', () => {
		const codes = legalMoves(V, s).map((m) => m.code)
		expect(codes).toContain('?e3')
		expect(keysOf(V, s, '?e3')).toEqual([['c3', 0.5], ['e3', 0.5]])
	})

	it('lists only legal codes, splits from the other square too', () => {
		const list = legalMoves(V, s, { splits: true })
		expect(list.some((m) => m.type === 'split' && m.from[0] === sq('e3'))).toBe(true)
		for (const m of list) {
			expect(isLegal(V, s, m.code), m.code).toBe(true)
		}
		expect(mergesFrom(V, s, sq('e3'))).toEqual([])
	})
})

describe('R8 no split at a full budget', () => {
	it('returns no split at once, as the full check would', () => {
		const worlds = []
		for (const n of ['b1', 'h3']) {
			for (const b of ['c1', 'e3']) {
				for (const r of ['a1', 'a4']) {
					worlds.push([{ e1: '0:k', e8: '1:k', [n]: '0:n', [b]: '0:b', [r]: '0:r', h1: '0:q' }, 1])
				}
			}
		}
		const s = stateOf(V, worlds)
		expect(budgetInfo(V, s, 0)).toEqual({ used: 8, limit: 8, sides: [0] })
		const f = sq('h1')
		const targets = splitTargets(V, s, f)
		expect(targets.length).toBeGreaterThan(2)
		expect(splitsFrom(V, s, f)).toEqual([])
		for (let i = 0; i < targets.length; i++) {
			for (let j = i + 1; j < targets.length; j++) {
				expect(branches(V, s, splitCode(V, f, targets[i], targets[j]))).toBeNull()
			}
		}
		// the computer player's split candidates too
		expect(aiSplits(V, s, f, seededRng(1))).toEqual([])
		const free = stateOf(V, worlds.slice(0, 4))
		expect(splitsFrom(V, free, f).length).toBeGreaterThan(0)
		expect(aiSplits(V, free, f, seededRng(1)).length).toBeGreaterThan(0)
	})
})
