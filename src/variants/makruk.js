/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Makruk (Thai chess) as played in Thailand and by Fairy-Stockfish, with the Khun (king), Met (one step diagonally),
 * Khon (one step diagonally or straight forward), Ma (knight), Rua (rook) and Bia (pawn: no double step, always a Met
 * on its sixth rank). Capture the Khun to win, or leave it no escape (the core's escape rule). Stalemate is a draw,
 * tested in every possibility (the game-end roll settles disagreement). Once no Bia is left, long endgames are drawn by
 * the bare-Khun count (pieces' honour), a 64-move rule (board's honour) and the bare-Khuns rule, all counted with the
 * core's quiet counter from the last capture or promotion; these draws wait while the player to move can capture the
 * enemy Khun for certain. The research spec is handoff/research/makruk.md; the player-facing rules are in
 * docs/variants.md.
 */

import { t } from '@nextcloud/l10n'
import { BISHOP_DIRS, KING_STEPS, KNIGHT_JUMPS, ROOK_DIRS, standardBoard } from './core/orthodox.js'
import { whiteBlack } from './core/orthodoxVariant.js'
import { branches, legalMoves } from './core/quantum.js'
import { defineVariant } from './core/variant.js'
import { addPiece, applyClassical, attacks, emptyWorld, generate } from './core/world.js'

// The traditional Thai board has one colour on every square: every cell is wooden.
const board = standardBoard(8, 8, { shade: () => 'wood' })
const topo = board.topology
const { rankOf, fileOf } = board

/** The back ranks from file a: White's Khun on d1 and Met on e1, Black's Met on d8 and Khun on e8. */
export const BACK = Object.freeze(['rnskmsnr', 'rnsmksnr'])

/** Plies without a capture or promotion after which a game without Bias is drawn: 65 moves by each side. */
export const BOARD_PLIES = 130

/** From this many quiet plies on (move 50), the player rows show the 64-move rule's counter. */
const SHOW_PLIES = 100

/** Piece values in centipawns for the computer player (relative to the orthodox knight, as in Fairy-Stockfish). */
export const VALUES = Object.freeze({ k: 400, r: 540, n: 320, s: 250, m: 170, p: 100 })

/** Centrality of every square: 12 on d4, e4, d5, e5 down to 0 in the corners. */
const CENTRE = new Array(topo.size).fill(0)
for (let sq = 0; sq < topo.size; sq++) {
	CENTRE[sq] = 14 - Math.abs(2 * fileOf(sq) - 7) - Math.abs(2 * rankOf(sq) - 7)
}

/**
 * The square of a side's Khun in a world, or -1 when it was captured.
 *
 * @param {object} w world
 * @param {number} side side index
 * @return {number}
 */
export function khunSquare(w, side) {
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sq[id] >= 0 && w.sd[id] === side && w.ty[id] === 'k') {
			return w.sq[id]
		}
	}
	return -1
}

/**
 * The king distance between two squares.
 *
 * @param {number} a square
 * @param {number} b square
 * @return {number}
 */
function distance(a, b) {
	return Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)))
}

/**
 * Whether a world has a Bia on the board. Bias are solid, so the answer is the same in every world of a state.
 *
 * @param {object} w world
 * @return {boolean}
 */
function hasBia(w) {
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sq[id] >= 0 && w.ty[id] === 'p') {
			return true
		}
	}
	return false
}

/**
 * The pieces on the board of a world: the total, the number per side and the type counts per side.
 *
 * @param {object} w world
 * @return {{total: number, side: number[], types: Array<Record<string, number>>}}
 */
function census(w) {
	const out = { total: 0, side: [0, 0], types: [{}, {}] }
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sq[id] < 0) {
			continue
		}
		const sd = w.sd[id]
		out.total++
		out.side[sd]++
		out.types[sd][w.ty[id]] = (out.types[sd][w.ty[id]] ?? 0) + 1
	}
	return out
}

/**
 * The limit of the bare-Khun count (pieces' honour) by the chasing side's material, first match of the Thai table
 * (Fairy-Stockfish `count_limit`): two or more Rua 8, one Rua 16, two or more Khon 22, two or more Ma 32, one Khon 44,
 * otherwise 64.
 *
 * @param {Record<string, number>} types the chaser's type counts
 * @return {number}
 */
export function honourLimit(types) {
	const r = types.r ?? 0
	const s = types.s ?? 0
	if (r >= 2) {
		return 8
	}
	if (r === 1) {
		return 16
	}
	if (s >= 2) {
		return 22
	}
	if ((types.n ?? 0) >= 2) {
		return 32
	}
	return s === 1 ? 44 : 64
}

/**
 * Whether `side`, to move, is stalemated in a world: its Khun is not attacked, and every ordinary move it has leaves
 * its Khun attacked (a move that captures the enemy Khun is always safe). A side with no move at all and a safe Khun
 * is stalemated too. The test stops at the first safe move, and the move generation it uses is the one the next turn
 * needs anyway (cached per world).
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side the side to move
 * @return {boolean}
 */
export function stalemated(V, w, side) {
	const k = khunSquare(w, side)
	if (k < 0 || attacks(V, w, 1 - side, k)) {
		return false
	}
	for (const m of generate(V, w, side).values()) {
		if (m.capture >= 0 && w.ty[m.capture] === 'k') {
			return false
		}
		if (!attacks(V, applyClassical(V, w, m), 1 - side, m.from === k ? m.to : k)) {
			return false
		}
	}
	return true
}

/**
 * Whether the player to move can capture the enemy Khun for certain: one move key captures it in every world, or a
 * merge onto it (a converging capture) has the single outcome Captured. The counting draws wait while this holds.
 *
 * @param {object} V variant
 * @param {object} state state (without a result)
 * @return {boolean}
 */
export function canTakeKhun(V, state) {
	let keys = null
	for (const { b } of state.worlds) {
		const here = new Set()
		for (const m of generate(V, b, state.turn).values()) {
			if (m.capture >= 0 && b.ty[m.capture] === 'k' && (!keys || keys.has(m.key))) {
				here.add(m.key)
			}
		}
		keys = here
		if (here.size === 0) {
			break
		}
	}
	if (keys && keys.size > 0) {
		return true
	}
	// the Khun is solid, so it stands on the same square in every world
	const ks = khunSquare(state.worlds[0].b, 1 - state.turn)
	for (const m of legalMoves(V, state)) {
		if (m.type === 'merge' && m.to[0] === ks) {
			const list = branches(V, state, m.code)
			if (list && list.length === 1 && list[0].key === 'capture') {
				return true
			}
		}
	}
	return false
}

/**
 * The bare-Khun count of a state, or null when it does not run. It runs when no Bia is on the board, both Khuns are
 * on the board in every world, and one side (`lone`) has only its Khun in every world while the other side
 * (`chaser`) has more in some world. The chaser must capture the lone Khun within `allow = max(1, limit − pieces +
 * 1)` of its moves (the most generous value over the worlds); `done` counts the chaser's replies to the lone side's
 * moves since the last capture or promotion (the quiet counter), so after a capture by the lone Khun the chaser's
 * first move is free, as in Fairy-Stockfish. `done` is not capped: it can exceed `allow` when the count is already
 * used up as it starts, or while the draw waits.
 *
 * @param {object} state state
 * @return {null|{lone: number, chaser: number, allow: number, done: number, limit: number, pieces: number}}
 */
export function countInfo(state) {
	if (hasBia(state.worlds[0].b)) {
		return null
	}
	// once a Khun has been captured the game is over, and the side that lost it is no chaser
	if (state.worlds.some(({ b }) => khunSquare(b, 0) < 0 || khunSquare(b, 1) < 0)) {
		return null
	}
	const cs = state.worlds.map((e) => census(e.b))
	for (const lone of [0, 1]) {
		const chaser = 1 - lone
		if (!cs.every((c) => c.side[lone] === 1) || cs.every((c) => c.side[chaser] <= 1)) {
			continue
		}
		let allow = -Infinity
		let limit = 0
		let pieces = 0
		for (const c of cs) {
			const L = honourLimit(c.types[chaser])
			if (L - c.total + 1 > allow) {
				allow = L - c.total + 1
				limit = L
				pieces = c.total
			}
		}
		const q = state.quiet
		const done = state.turn === lone ? Math.floor(q / 2) : Math.max(0, Math.ceil(q / 2) - 1)
		return { lone, chaser, allow: Math.max(1, allow), done, limit, pieces }
	}
	return null
}

/**
 * The squares next to a lone Khun that it could step to without being captured at once.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} lone the lone side
 * @param {number} k the lone Khun's square
 * @return {number}
 */
function freeSquares(V, w, lone, k) {
	let free = 0
	for (const v of KING_STEPS) {
		const to = topo.step(k, v)
		if (to >= 0 && (w.board[to] < 0 || w.sd[w.board[to]] !== lone) && !attacks(V, w, 1 - lone, to)) {
			free++
		}
	}
	return free
}

/**
 * The computer's positional terms for a side in a world, own minus enemy: Bias that advanced, minor pieces near the
 * centre and, against a lone Khun, driving it to the edge, taking its squares away and bringing the own Khun near.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side side index
 * @return {number}
 */
function positional(V, w, side) {
	let score = 0
	const count = [0, 0]
	const khun = [-1, -1]
	for (let id = 0; id < w.sq.length; id++) {
		const sq = w.sq[id]
		if (sq < 0) {
			continue
		}
		const sd = w.sd[id]
		const sign = sd === side ? 1 : -1
		const ty = w.ty[id]
		count[sd]++
		if (ty === 'k') {
			khun[sd] = sq
		} else if (ty === 'p') {
			score += sign * 8 * (sd === 0 ? rankOf(sq) - 2 : 5 - rankOf(sq))
		} else if (ty === 'n') {
			score += sign * 1.5 * CENTRE[sq]
		} else if (ty === 's' || ty === 'm') {
			score += sign * CENTRE[sq]
		}
	}
	for (const lone of [0, 1]) {
		if (count[lone] === 1 && count[1 - lone] > 1 && khun[0] >= 0 && khun[1] >= 0) {
			const edge = 6 * (12 - CENTRE[khun[lone]])
			const near = 5 * (7 - distance(khun[0], khun[1]))
			const cage = 25 * (8 - freeSquares(V, w, lone, khun[lone]))
			score += (lone === side ? -1 : 1) * (edge + near + cage)
		}
	}
	return score
}

const spec = {
	id: 'makruk',
	category: 'regional',
	// no castling and no en passant: the shared rules card leaves out its sentence about them
	specialMoves: false,
	// The bare-Khuns draw is this variant's own (worldResult): decided in each possibility, so a capture that leaves
	// only the two Khuns in some possibilities ends in the game-end roll, where the core's rule needs all of them. The
	// core's escape rule stays on, and the variant's own draws wait for a certain Khun capture themselves
	// (handoff/LEAD-DECISIONS.md L1).
	bareKingsDraw: false,
	sides: whiteBlack(),
	topology: topo,
	types: {
		k: {
			name: () => t('quantumchess', 'Khun'),
			moves: [{ leap: KING_STEPS }],
			royal: true,
			value: VALUES.k,
			glyph: { sprite: 'k' },
		},
		m: {
			name: () => t('quantumchess', 'Met'),
			moves: [{ leap: BISHOP_DIRS }],
			value: VALUES.m,
			// a small queen: the queen's place, one diagonal step
			glyph: { sprite: 'q', scale: 0.8 },
		},
		s: {
			name: () => t('quantumchess', 'Khon'),
			moves: [{ leap: BISHOP_DIRS }, { leap: [[0, 1]], oriented: true }],
			value: VALUES.s,
			// bishop-like, as Western sets draw the khon (a disc with "Kh" read like a king)
			glyph: { sprite: 'b' },
		},
		n: {
			name: () => t('quantumchess', 'Ma'),
			moves: [{ leap: KNIGHT_JUMPS }],
			value: VALUES.n,
			glyph: { sprite: 'n' },
		},
		r: {
			name: () => t('quantumchess', 'Rua'),
			moves: [{ ride: ROOK_DIRS }],
			value: VALUES.r,
			glyph: { sprite: 'r' },
		},
		p: {
			name: () => t('quantumchess', 'Bia'),
			moves: [
				{ leap: [[0, 1]], oriented: true, mode: 'move' },
				{ leap: [[1, 1], [-1, 1]], oriented: true, mode: 'capture' },
			],
			solid: true,
			value: VALUES.p,
			glyph: { sprite: 'p' },
			// the sixth rank (ranks 7 and 8 only matter for hand-made positions); the only choice is the Met
			promote: { zone: (side, to) => (side === 0 ? rankOf(to) >= 5 : rankOf(to) <= 2), to: ['m'] },
		},
	},
	// Makruk has no move-count draw while a Bia is on the board; the 64-move rule is in stateResult
	quietPlies: Number.POSITIVE_INFINITY,
	rules: () => [
		t('quantumchess', 'The Khun (king) starts on d1 for White and on e8 for Black, with the Met beside it, and never castles; the Bia (pawns) start on each side\'s third rank.'),
		t('quantumchess', 'The Met steps one square diagonally, the Khon one square diagonally or straight forward, and the Ma, Rua and Khun move like the knight, rook and king.'),
		t('quantumchess', 'A Bia moves one square forward and captures one square diagonally forward; it never moves two squares (so there is no en passant), and on its sixth rank it always becomes a Met.'),
		t('quantumchess', 'Stalemate (not attacked, but every move would expose the Khun) is a draw, and if it is a stalemate in only some possibilities, a roll decides.'),
		t('quantumchess', 'When no Bia is left and one side has only its Khun, the other side must capture that Khun within a set number of its moves, counted from the lone Khun\'s first move after the last capture or promotion, or the game is drawn.'),
		t('quantumchess', 'That number is the first that applies of 8 (two Rua), 16 (one Rua), 22 (two Khon), 32 (two Ma), 44 (one Khon) and 64, minus the number of pieces on the board (both Khuns included), plus one, and at least one.'),
		t('quantumchess', 'When no Bia is left, the game is also drawn after 65 moves by each side without a capture or promotion, and it is drawn when only the two Khuns are left.'),
		t('quantumchess', 'These draws are put off while the player to move can capture the enemy Khun for certain.'),
	],
	setup() {
		const w = emptyWorld(spec)
		for (const side of [0, 1]) {
			for (let f = 0; f < 8; f++) {
				addPiece(w, BACK[side][f], side, topo.at([f, side === 0 ? 0 : 7]))
			}
			for (let f = 0; f < 8; f++) {
				addPiece(w, 'p', side, topo.at([f, side === 0 ? 2 : 5]))
			}
		}
		// no castling, no double step, no en passant: a Makruk world has no extra state
		w.x = {}
		return w
	},
	worldResult(w, mover) {
		const k0 = khunSquare(w, 0)
		const k1 = khunSquare(w, 1)
		if (k0 < 0 || k1 < 0) {
			return k0 < 0 && k1 < 0 ? { winner: null, reason: 'king' } : { winner: k0 >= 0 ? 0 : 1, reason: 'king' }
		}
		let total = 0
		for (let id = 0; id < w.sq.length && total < 3; id++) {
			if (w.sq[id] >= 0) {
				total++
			}
		}
		if (total === 2) {
			// only the two Khuns: a draw, unless they touch and the side to move takes the other
			return distance(k0, k1) === 1 ? null : { winner: null, reason: 'bareKings' }
		}
		return stalemated(spec, w, 1 - mover) ? { winner: null, reason: 'stalemate' } : null
	},
	stateResult(state) {
		const info = countInfo(state)
		let draw = null
		if (info && info.done >= info.allow) {
			draw = 'count'
		} else if (state.quiet >= BOARD_PLIES && !hasBia(state.worlds[0].b)) {
			draw = 'quiet'
		}
		if (!draw || canTakeKhun(spec, state)) {
			return null
		}
		return { winner: null, reason: draw }
	},
	noMoves(state) {
		// Every possibility where the Khun is safe has already ended in stalemate, so here it is attacked in every
		// possibility: a checkmate everywhere. The test only guards against a side that is stuck for another reason.
		const side = state.turn
		const mated = state.worlds.every(({ b }) => {
			const k = khunSquare(b, side)
			return k >= 0 && attacks(spec, b, 1 - side, k)
		})
		return mated ? { winner: 1 - side, reason: 'noMoves' } : { winner: null, reason: 'noMoves' }
	},
	reasonText(reason) {
		switch (reason) {
			case 'king':
				return t('quantumchess', 'a Khun was captured')
			case 'cannotEscape':
				// TRANSLATORS: Makruk: every move of the loser would have let its Khun (king) be captured for certain
				return t('quantumchess', 'the Khun could not escape')
			case 'stalemate':
				// TRANSLATORS: Makruk, why the game was drawn: the Khun was not attacked, but each move would expose it
				return t('quantumchess', 'stalemate')
			case 'bareKings':
				// TRANSLATORS: Makruk, why the game was drawn; a Khun is the king
				return t('quantumchess', 'only the two Khuns are left')
			case 'count':
				// TRANSLATORS: Makruk, why the game was drawn: the lone Khun (king) survived the counted moves
				return t('quantumchess', 'the counting rule: the lone Khun was not captured in time')
			case 'quiet':
				// TRANSLATORS: Makruk, why the game was drawn; a Bia is a pawn
				return t('quantumchess', '65 moves by each side since the last capture or promotion, with no Bia left')
			default:
				return null
		}
	},
	sideInfo(state, side) {
		const info = countInfo(state)
		if (info) {
			// the bare-Khun count, in the chaser's row only; a count used up when it starts, or waiting, shows 5/5
			if (side !== info.chaser) {
				return null
			}
			const done = Math.min(info.done, info.allow)
			return {
				text: done + '/' + info.allow,
				title: t('quantumchess', 'Counting: {done} of {allow} moves to capture the lone Khun', {
					done,
					allow: info.allow,
				}),
			}
		}
		if (state.quiet >= SHOW_PLIES && !hasBia(state.worlds[0].b)) {
			// at most 65/65, shown while the draw waits
			const n = Math.min(Math.floor(state.quiet / 2), 65)
			return { text: n + '/65', title: t('quantumchess', 'Moves without a capture: {n} of 65', { n }) }
		}
		return null
	},
	evaluate(w, side) {
		return positional(spec, w, side)
	},
}

export default defineVariant(spec)
