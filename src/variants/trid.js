/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Tri-Dimensional chess (board by Franz Joseph, 1975; rules after Jens Meder's Tournament Rules, which build on Andrew
 * Bartmess's Federation Standard rules) with the four attack boards fixed on their start pins. Every move is an
 * ordinary chess move on the flat 6 × 10 map seen from above and may end on any level of the target map square; a
 * piece on any level of a map square in between blocks a rider, and void map squares are flown across. Castling on
 * both wings (the king's side swaps king and rook), not on a side's first move; en passant onto either level;
 * promotion on the last rank of the file. Player-facing rules are in docs/variants.md.
 *
 * World extras (`x`, the same fields in every world, in this order): `ep` (the skipped map square of the last double
 * step, or -1), `epVictim` (the square of that pawn, or -1), `castle` (the rights, in the array shape of
 * core/orthodox.js), `started` (per side, whether it has had its first turn) and `moved` (the ids of the pawns that
 * have moved, sorted).
 */

import { t } from '@nextcloud/l10n'
import { castlingMoves, clearEnPassant, unifyCastling } from './core/orthodox.js'
import { whiteBlack } from './core/orthodoxVariant.js'
import { defineVariant } from './core/variant.js'
import { addPiece, emptyWorld, moveKey, pushMove } from './core/world.js'
import { COL_OF, COLS, colStep, FILE, LEVELS, LINES, RANK, RIDERS, sqOf, topology } from './trid/board.js'

/** The last rank of a pawn per side and file (`z` … `e`): the attack boards overhang the corners of files a and d. */
const LAST = [[9, 9, 8, 8, 9, 9], [0, 0, 1, 1, 0, 0]]

/** The start position: square → `side:type`. */
const START = {
	z0QL1: '0:r',
	a0QL1: '0:q',
	d0KL1: '0:k',
	e0KL1: '0:r',
	a1W: '0:n',
	b1W: '0:b',
	c1W: '0:b',
	d1W: '0:n',
	z1QL1: '0:p',
	a1QL1: '0:p',
	d1KL1: '0:p',
	e1KL1: '0:p',
	a2W: '0:p',
	b2W: '0:p',
	c2W: '0:p',
	d2W: '0:p',
	z9QL6: '1:r',
	a9QL6: '1:q',
	d9KL6: '1:k',
	e9KL6: '1:r',
	a8B: '1:n',
	b8B: '1:b',
	c8B: '1:b',
	d8B: '1:n',
	z8QL6: '1:p',
	a8QL6: '1:p',
	d8KL6: '1:p',
	e8KL6: '1:p',
	a7B: '1:p',
	b7B: '1:p',
	c7B: '1:p',
	d7B: '1:p',
}

/** The level of the neutral main board, where minor pieces and queens are most active. */
const NEUTRAL = LEVELS.indexOf('N')
/** Evaluation weights (centipawns): per square a side's pieces reach, per rank a pawn has advanced, per piece on N. */
const MOBILITY = 3
const PAWN_RANK = 4
const CENTRE = 10
/** Marks of the squares counted by `activity` (a new stamp per call, so nothing is allocated). */
const seen = new Int32Array(topology.size)
let stamp = 0

/**
 * The castling rights of the start position (Meder art. 3.5): on the king's side the king and the rook next to it
 * swap places; on the queen's side the king goes to the queen's home square and the corner rook to the king's.
 *
 * @return {object[]}
 */
export function startRights() {
	const right = (flag, side, king, rook, kingTo) => ({
		flag,
		side,
		king: sqOf(king),
		rook: sqOf(rook),
		kingTo: sqOf(kingTo),
		rookTo: sqOf(king),
	})
	return [
		right('K', 0, 'd0KL1', 'e0KL1', 'e0KL1'),
		right('Q', 0, 'd0KL1', 'z0QL1', 'a0QL1'),
		right('k', 1, 'd9KL6', 'e9KL6', 'e9KL6'),
		right('q', 1, 'd9KL6', 'z9QL6', 'a9QL6'),
	]
}

/**
 * The world extras with every field, in the fixed order (worlds are compared by the JSON text of `x`).
 *
 * @param {object} [given] values to use instead of the defaults
 * @return {object}
 */
export function extras(given = {}) {
	return {
		ep: given.ep ?? -1,
		epVictim: given.epVictim ?? -1,
		castle: given.castle ?? [],
		started: given.started ?? [true, true],
		moved: (given.moved ?? []).slice().sort((a, b) => a - b),
	}
}

/**
 * The start world.
 *
 * @param {object} V variant
 * @return {object}
 */
function startWorld(V) {
	const w = emptyWorld(V)
	for (const [name, piece] of Object.entries(START)) {
		const [side, type] = piece.split(':')
		addPiece(w, type, Number(side), sqOf(name))
	}
	w.x = extras({ castle: startRights(), started: [false, false] })
	return w
}

/**
 * Every classical move of a side in a world: the projected moves of the pieces, the pawn moves and castling.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side side index
 * @return {object[]}
 */
function generateMoves(V, w, side) {
	const out = []
	for (let id = 0; id < w.sq.length; id++) {
		const s = w.sq[id]
		if (s < 0 || w.sd[id] !== side) {
			continue
		}
		const ty = w.ty[id]
		if (ty === 'p') {
			pawnMoves(V, w, side, id, s, out)
			continue
		}
		const ride = RIDERS.has(ty)
		for (const line of LINES[ty]?.[COL_OF[s]] ?? []) {
			for (const c of line) {
				let blocked = false
				for (const t of COLS[c]) {
					const occ = w.board[t]
					if (occ === -1) {
						pushMove(V, w, out, id, s, t, -1)
					} else {
						blocked = true
						if (w.sd[occ] !== side) {
							pushMove(V, w, out, id, s, t, occ)
						}
					}
				}
				// a rider stops at a map square with a piece on any level; a void map square is flown across
				if (!ride || blocked) {
					break
				}
			}
		}
	}
	// no castling on a side's first move (Meder: "before move 2")
	if (w.x.started[side]) {
		out.push(...castlingMoves(V, w, side))
	}
	return out
}

/**
 * The moves of a pawn: one map square forward onto any empty level, two on its first move (the skipped map square
 * empty on every level), diagonal captures onto any level, and en passant onto either level of the skipped square.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side side index
 * @param {number} id pawn
 * @param {number} s its square
 * @param {object[]} out output
 */
function pawnMoves(V, w, side, id, s, out) {
	const f = side === 0 ? 1 : -1
	const c0 = COL_OF[s]
	const c1 = colStep(c0, 0, f)
	if (c1 >= 0) {
		let free = true
		for (const t of COLS[c1]) {
			if (w.board[t] === -1) {
				pushMove(V, w, out, id, s, t, -1)
			} else {
				free = false
			}
		}
		const c2 = free && !w.x.moved.includes(id) ? colStep(c1, 0, f) : -1
		for (const t of c2 >= 0 ? COLS[c2] : []) {
			if (w.board[t] === -1) {
				pushMove(V, w, out, id, s, t, -1, 'double')
			}
		}
	}
	for (const dx of [-1, 1]) {
		const c = colStep(c0, dx, f)
		if (c < 0) {
			continue
		}
		for (const t of COLS[c]) {
			const occ = w.board[t]
			if (occ >= 0 && w.sd[occ] !== side) {
				pushMove(V, w, out, id, s, t, occ)
			}
		}
		if (c === w.x.ep) {
			const victim = w.board[w.x.epVictim]
			if (victim >= 0 && w.sd[victim] !== side && w.ty[victim] === 'p') {
				for (const t of COLS[c]) {
					if (w.board[t] === -1) {
						out.push({
							key: moveKey(V, s, t),
							from: s,
							to: t,
							id,
							capture: victim,
							promo: null,
							drop: null,
							kind: 'ep',
						})
					}
				}
			}
		}
	}
}

/**
 * How active a side is in a world, for the computer: the squares its pieces (not pawns or the king) could move to or
 * capture on, its minor pieces and queens on the neutral level, and how far its pawns have advanced.
 *
 * @param {object} w world
 * @param {number} side side index
 * @return {number} centipawns
 */
function activity(w, side) {
	if (++stamp === 0x7fffffff) {
		seen.fill(0)
		stamp = 1
	}
	let score = 0
	let reach = 0
	for (let id = 0; id < w.sq.length; id++) {
		const s = w.sq[id]
		const ty = w.ty[id]
		if (s < 0 || w.sd[id] !== side || ty === 'k') {
			continue
		}
		if (ty === 'p') {
			score += PAWN_RANK * (side === 0 ? RANK[s] : 9 - RANK[s])
			continue
		}
		if (ty !== 'r' && topology.coords[s][2] === NEUTRAL) {
			score += CENTRE
		}
		const ride = RIDERS.has(ty)
		for (const line of LINES[ty]?.[COL_OF[s]] ?? []) {
			for (const c of line) {
				let blocked = false
				for (const t of COLS[c]) {
					const occ = w.board[t]
					if (occ >= 0) {
						blocked = true
					}
					if ((occ < 0 || w.sd[occ] !== side) && seen[t] !== stamp) {
						seen[t] = stamp
						reach++
					}
				}
				if (!ride || blocked) {
					break
				}
			}
		}
	}
	return score + MOBILITY * reach
}

const spec = {
	id: 'trid',
	category: 'dimensions',
	sides: whiteBlack(),
	topology,
	// the movement descriptors stay empty: `generate` projects every move onto the map (see the module comment)
	types: {
		k: { name: () => t('quantumchess', 'King'), moves: [], royal: true, value: 0, glyph: { sprite: 'k' } },
		q: { name: () => t('quantumchess', 'Queen'), moves: [], value: 950, glyph: { sprite: 'q' } },
		r: { name: () => t('quantumchess', 'Rook'), moves: [], value: 520, glyph: { sprite: 'r' } },
		b: { name: () => t('quantumchess', 'Bishop'), moves: [], value: 320, glyph: { sprite: 'b' } },
		n: { name: () => t('quantumchess', 'Knight'), moves: [], value: 280, glyph: { sprite: 'n' } },
		p: {
			name: () => t('quantumchess', 'Pawn'),
			moves: [],
			solid: true,
			value: 100,
			glyph: { sprite: 'p' },
			// the file the pawn arrives on decides (c7B-b8B promotes, c7B-d8KL6 does not)
			promote: { zone: (side, to) => RANK[to] === LAST[side][FILE[to]], to: ['q', 'r', 'b', 'n'] },
		},
	},
	setup() {
		return startWorld(spec)
	},
	generate(w, side) {
		return generateMoves(spec, w, side)
	},
	afterMove(next, m, prev) {
		const x = next.x
		const side = prev.sd[m.id]
		if (prev.ty[m.id] === 'p' && !x.moved.includes(m.id)) {
			x.moved.push(m.id)
			x.moved.sort((a, b) => a - b)
		}
		if (m.kind === 'double') {
			x.ep = colStep(COL_OF[m.from], 0, side === 0 ? 1 : -1)
			x.epVictim = m.to
		} else {
			x.ep = -1
			x.epVictim = -1
		}
		if (x.castle.length) {
			x.castle = x.castle.filter((c) => m.from !== c.king && m.from !== c.rook && m.to !== c.king
				&& m.to !== c.rook)
		}
		x.started[side] = true
	},
	// a world where the turn passed without the move (missed, a Measure) ends en passant and still counts the turn
	applyMiss(b, action, side) {
		const done = b.x.started[side]
		const cleared = clearEnPassant(b)
		if (done) {
			return cleared
		}
		return { ...cleared, x: { ...cleared.x, started: b.x.started.map((v, i) => v || i === side) } }
	},
	// a castling right is kept only while every world has it (king and rook 100 % home)
	unifyWorlds(bs) {
		return unifyCastling(bs)
	},
	// No `worldResult`: the game ends by the core's classic rules (docs/rules.md 5 and 6; the flags keep their
	// defaults). Capturing the king wins, "your king cannot escape" wins at once (`escapeRule`), and two bare kings
	// draw (`bareKingsDraw`), but not while the side to move can take the other king for certain (`drawsWait`).
	evaluate(w, side) {
		return activity(w, side) - activity(w, 1 - side)
	},
	rules: () => [
		t(
			'quantumchess',
			'Three 4 × 4 main levels, White\'s (W, lowest), Neutral (N) and Black\'s (B, highest), and four 2 × 2 attack boards at the back corners: QL1 and KL1 on the queen\'s and king\'s side of White, QL6 and KL6 of Black. The attack boards never move in this version.',
		),
		t(
			'quantumchess',
			'A square is named file, rank and board, such as b3N or z0QL1. Seen from above, all boards form one map with files z to e and ranks 0 to 9: b3W and b3N are the two levels of map square b3.',
		),
		t(
			'quantumchess',
			'Every move is an ordinary chess move on that map and may stop on any level of the target map square. Moving straight up or down is not a move.',
		),
		t(
			'quantumchess',
			'A piece on any level of a map square in between blocks the move. Gaps without a board are empty: pieces fly across them but cannot stop there.',
		),
		t(
			'quantumchess',
			'Pawns step forward (two map squares on their first move) and capture diagonally forward, onto any level. En passant lands on either level of the skipped square.',
		),
		t(
			'quantumchess',
			'A pawn promotes on the last rank of its file: rank 8 on files b and c, rank 9 on files z, a, d and e (for Black rank 1 and rank 0).',
		),
		t(
			'quantumchess',
			'You may castle from your second move on, if neither the king nor that rook has moved in any possibility. On the king\'s side the king and the rook next to it swap places; on the queen\'s side, once the queen\'s square is empty, the king goes there and the corner rook goes to the king\'s square.',
		),
		t(
			'quantumchess',
			'Quantum tip: a ghost on either level of a map square blocks moves across it in its possibilities, and a piece split over both levels of one map square blocks it for certain. A ghost on the other level of your target square does not matter.',
		),
	],
}

export default defineVariant(spec)
