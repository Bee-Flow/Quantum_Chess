/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Tri-Dimensional chess (board by Franz Joseph, 1975; rules after Jens Meder's Tournament Rules, which build on Andrew
 * Bartmess's Federation Standard rules). Every piece move is an ordinary chess move on the flat 6 × 10 map seen from
 * above and may end on any level of the target map square; a piece on any level of a map square in between blocks a
 * rider, and void map squares are flown across. Castling on both wings (the king's side swaps king and rook), not on a
 * side's first move; en passant onto either level; promotion on the last rank of the file. Player-facing rules are in
 * docs/variants.md.
 *
 * The four attack boards move too (Meder art. 3.6): instead of a piece, a player moves a board that holds at most one
 * piece to a free pin next to it (geometry.js), carrying that piece along. An empty board belongs to the side that
 * owns it at the start, a board with a piece to that piece's side; only an empty board may move backwards. The code
 * of a board move is its two pins, `QL1>QL3`, plus the promotion when a pawn of the mover promotes (`QL4>QL6=q`), and
 * its from and to squares are the two pins' tabs. The squares of a pin exist only while a board stands there, so the
 * columns of the map depend on the boards (`columns`). Which rank is last for a pawn on file a or d depends on the
 * board over the far corner (Meder art. 3.4(e)): a pawn that a board move carries to its last rank or leaves on it
 * promotes at once, the mover's own pawn to the piece in the code, the other side's to a queen.
 *
 * Quantum: the boards are never superposed. Their pins are part of every world and the same in all of them
 * (`solidExtra`, so a disagreement would be settled by the solid roll), and a board move is measured: where it cannot
 * be played in some worlds (a ghost makes the board too full, or hands it to the other side) a roll decides whether it
 * happened, and the worlds of each outcome agree on the pins. In a world where a ghost part stands on the moving board
 * it rides along; its other parts, and every link between worlds, stay as they are.
 *
 * World extras (`x`, the same fields in every world, in this order): `ep` (the skipped map square of the last double
 * step, or -1), `epVictim` (the square of that pawn, or -1), `castle` (the rights, in the array shape of
 * core/orthodox.js), `started` (per side, whether it has had its first turn), `moved` (the ids of the pawns that have
 * moved, sorted) and `boards` (the pin of each attack board: White's queen's and king's board, then Black's).
 */

import { t } from '@nextcloud/l10n'
import { castlingMoves, clearEnPassant, unifyCastling } from './core/orthodox.js'
import { whiteBlack } from './core/orthodoxVariant.js'
import { defineVariant } from './core/variant.js'
import { addPiece, cloneWorld, emptyWorld, moveKey, OFF, placePiece, pushMove } from './core/world.js'
import {
	COL_OF,
	colStep,
	columns,
	CORNER_OF,
	FILE,
	LINES,
	PIN_SQUARES,
	RANK,
	RIDERS,
	sqOf,
	START_BOARDS,
	TAB_OF,
	topology,
} from './trid/board.js'
import { ADJACENT, direction, LEVELS, PIN_INDEX, PINS } from './trid/geometry.js'
import { layoutFor } from './trid/layout.js'

/** The side that owns each attack board (in the order of `x.boards`) while it is empty. */
const OWNER = [0, 0, 1, 1]

/** The pieces a pawn may promote to. */
const PROMOTIONS = ['q', 'r', 'b', 'n']

/** The code of a board move: its two pins, then the promotion of the mover's pawn, if any. */
const BOARD_CODE = /^([QK]L[1-6])>([QK]L[1-6])(?:=([qrbn]))?$/

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
		boards: (given.boards ?? START_BOARDS).slice(),
	}
}

/**
 * The last rank of a pawn of a side on a file (Meder art. 3.4(e)): rank 8 on files b and c and rank 9 on files z and
 * e (Black: 1 and 0); on files a and d rank 9 while a board stands on the pin over the far corner (QL6, KL6), else 8
 * (Black: 0 with a board on QL1 or KL1, else 1).
 *
 * @param {string[]} boards the pin of every attack board
 * @param {number} side side index
 * @param {number} file file index
 * @return {number}
 */
export function lastRank(boards, side, file) {
	const far = side === 0 ? 9 : 0
	if (file === 0 || file === 5) {
		return far
	}
	const near = side === 0 ? 8 : 1
	if (file === 2 || file === 3) {
		return near
	}
	const corner = (file === 1 ? 'QL' : 'KL') + (side === 0 ? 6 : 1)
	return boards.includes(corner) ? far : near
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
 * Every classical move of a side in a world: the projected moves of the pieces, the pawn moves, castling and the
 * moves of the attack boards.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side side index
 * @return {object[]}
 */
function generateMoves(V, w, side) {
	const out = []
	const cols = columns(w.x.boards)
	for (let id = 0; id < w.sq.length; id++) {
		const s = w.sq[id]
		if (s < 0 || w.sd[id] !== side) {
			continue
		}
		const ty = w.ty[id]
		if (ty === 'p') {
			pawnMoves(V, w, cols, side, id, s, out)
			continue
		}
		const ride = RIDERS.has(ty)
		for (const line of LINES[ty]?.[COL_OF[s]] ?? []) {
			for (const c of line) {
				let blocked = false
				for (const t of cols[c]) {
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
	boardMoves(w, side, out)
	return out
}

/**
 * The moves of a pawn: one map square forward onto any empty level, two on its first move (the skipped map square
 * empty on every level), diagonal captures onto any level, and en passant onto either level of the skipped square.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number[][]} cols the squares of every column
 * @param {number} side side index
 * @param {number} id pawn
 * @param {number} s its square
 * @param {object[]} out output
 */
function pawnMoves(V, w, cols, side, id, s, out) {
	const f = side === 0 ? 1 : -1
	const c0 = COL_OF[s]
	const c1 = colStep(c0, 0, f)
	if (c1 >= 0) {
		let free = true
		for (const t of cols[c1]) {
			if (w.board[t] === -1) {
				pushMove(V, w, out, id, s, t, -1)
			} else {
				free = false
			}
		}
		const c2 = free && !w.x.moved.includes(id) ? colStep(c1, 0, f) : -1
		for (const t of c2 >= 0 ? cols[c2] : []) {
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
		for (const t of cols[c]) {
			const occ = w.board[t]
			if (occ >= 0 && w.sd[occ] !== side) {
				pushMove(V, w, out, id, s, t, occ)
			}
		}
		if (c === w.x.ep) {
			const victim = w.board[w.x.epVictim]
			if (victim >= 0 && w.sd[victim] !== side && w.ty[victim] === 'p') {
				for (const t of cols[c]) {
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
 * The pieces on the squares of a pin in a world: `{ count, piece, index }`, with the last piece found and the place
 * of its square in the pin's list.
 *
 * @param {object} w world
 * @param {number} pin pin index
 * @return {{count: number, piece: number, index: number}}
 */
function riders(w, pin) {
	let count = 0
	let piece = -1
	let index = -1
	PIN_SQUARES[pin].forEach((sq, i) => {
		if (w.board[sq] >= 0) {
			count++
			piece = w.board[sq]
			index = i
		}
	})
	return { count, piece, index }
}

/**
 * The pawns that a board move promotes, as `[id, square after the move]`: the piece it carries when that is a pawn
 * that lands on the last rank of its file, and a pawn left on the corner square the board overhung when that is now
 * the last rank of its file (Meder art. 3.4(e)(iii)).
 *
 * @param {object} w world before the move
 * @param {string[]} next the pins of the boards after the move
 * @param {number} from pin the board leaves
 * @param {number} to pin the board goes to
 * @return {Array<[number, number]>}
 */
function promotions(w, next, from, to) {
	const out = []
	const { piece, index } = riders(w, from)
	if (piece >= 0 && w.ty[piece] === 'p') {
		const sq = PIN_SQUARES[to][index]
		if (RANK[sq] === lastRank(next, w.sd[piece], FILE[sq])) {
			out.push([piece, sq])
		}
	}
	const corner = CORNER_OF[from]
	const left = w.board[corner]
	if (left >= 0 && w.ty[left] === 'p' && RANK[corner] === lastRank(next, w.sd[left], FILE[corner])) {
		out.push([left, corner])
	}
	return out
}

/**
 * The moves of the attack boards that a side controls in a world (Meder art. 3.6): a board holding at most one piece
 * goes to a free pin next to its own. An empty board is controlled by the side that owns it at the start, a board with
 * a piece by that piece's side, and only an empty board may go backwards (towards its controller's side). When a pawn
 * of the mover promotes, there is one move per piece it may become.
 *
 * @param {object} w world
 * @param {number} side side index
 * @param {object[]} out output
 */
function boardMoves(w, side, out) {
	const boards = w.x.boards
	boards.forEach((name, b) => {
		const from = PIN_INDEX[name]
		const { count, piece } = riders(w, from)
		if (count > 1 || (count ? w.sd[piece] : OWNER[b]) !== side) {
			return
		}
		for (const to of ADJACENT[from]) {
			if (boards.includes(PINS[to]) || (count && direction(from, to) === (side === 0 ? -1 : 1))) {
				continue
			}
			const next = boards.slice()
			next[b] = PINS[to]
			const key = name + '>' + PINS[to]
			const move = { from: TAB_OF[from], to: TAB_OF[to], id: -1, capture: -1, drop: null, kind: 'board' }
			const extra = { board: b, side, pin: to }
			if (promotions(w, next, from, to).some(([id]) => w.sd[id] === side)) {
				for (const promo of PROMOTIONS) {
					out.push({ ...move, key: key + '=' + promo, promo, extra })
				}
			} else {
				out.push({ ...move, key, promo: null, extra })
			}
		}
	})
}

/**
 * Apply a board move: the board goes to its new pin with the piece it holds, a pawn on the last rank of its file
 * promotes (the mover's to the piece of the move, the other side's to a queen), en passant ends, a carried pawn counts
 * as moved (no double step later), a carried king or rook loses its castling rights, and the turn counts as played.
 *
 * @param {object} w world
 * @param {object} m the board move
 * @return {object} the new world
 */
function applyBoard(w, m) {
	const { board, side, pin } = m.extra
	const from = PIN_INDEX[w.x.boards[board]]
	const next = cloneWorld(w)
	next.x.boards[board] = PINS[pin]
	const promoted = promotions(w, next.x.boards, from, pin)
	const { piece, index } = riders(w, from)
	if (piece >= 0) {
		const was = PIN_SQUARES[from][index]
		placePiece(next, piece, PIN_SQUARES[pin][index])
		if (w.ty[piece] === 'p' && !next.x.moved.includes(piece)) {
			next.x.moved.push(piece)
			next.x.moved.sort((a, b) => a - b)
		}
		next.x.castle = next.x.castle.filter((c) => c.king !== was && c.rook !== was)
	}
	for (const [id] of promoted) {
		next.ty[id] = w.sd[id] === side ? (m.promo ?? 'q') : 'q'
	}
	next.x.ep = -1
	next.x.epVictim = -1
	next.x.started[side] = true
	return next
}

/**
 * Apply a piece move (the core's classical apply, with this variant's bookkeeping): the capture, the move or the
 * castling king and rook, the promotion, then the pawn's first move, the en passant square, the castling rights and
 * the side's first turn.
 *
 * @param {object} w world
 * @param {object} m the move
 * @return {object} the new world
 */
function applyPiece(w, m) {
	const next = cloneWorld(w)
	if (m.capture >= 0) {
		placePiece(next, m.capture, OFF)
	}
	if (m.extra?.rook) {
		// both are lifted first: on the king's side the king lands on the rook's square
		placePiece(next, m.id, OFF)
		placePiece(next, m.extra.rook.id, OFF)
		placePiece(next, m.id, m.extra.kingTo ?? m.to)
		placePiece(next, m.extra.rook.id, m.extra.rook.to)
	} else {
		placePiece(next, m.id, m.to)
	}
	if (m.promo) {
		next.ty[m.id] = m.promo
	}
	const x = next.x
	const side = w.sd[m.id]
	if (w.ty[m.id] === 'p' && !x.moved.includes(m.id)) {
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
	return next
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
	const cols = columns(w.x.boards)
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
				for (const t of cols[c]) {
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
			// the file the pawn arrives on decides (c7B-b8B promotes, c7B-d8KL6 does not), and on files a and d
			// whether a board stands over the far corner
			promote: {
				zone: (side, to, from, w) => RANK[to] === lastRank(w.x.boards, side, FILE[to]),
				to: PROMOTIONS,
			},
		},
	},
	setup() {
		return startWorld(spec)
	},
	generate(w, side) {
		return generateMoves(spec, w, side)
	},
	apply(w, m) {
		return m.kind === 'board' ? applyBoard(w, m) : applyPiece(w, m)
	},
	// an attack board is never superposed: a board move that happens only in some worlds is settled by a roll
	measured: (m) => m.kind === 'board',
	// the pins are the same in every world; worlds that differ in them would be settled by the solid roll
	solidExtra: (b) => b.x.boards.join(),
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
	/**
	 * The drawing with the attack boards on their pins (the pins are the same in every world).
	 *
	 * @param {object} state state
	 * @return {object}
	 */
	layoutOf(state) {
		return layoutFor(topology, state.worlds[0].b.x.boards)
	},
	/**
	 * A board move as its code with the promotion in capitals (`QL4>QL6=Q`); other moves are left to the generic
	 * notation.
	 *
	 * @param {string} code move code
	 * @return {string|null}
	 */
	codeText(code) {
		const m = BOARD_CODE.exec(code)
		return m ? m[1] + '>' + m[2] + (m[3] ? '=' + m[3].toUpperCase() : '') : null
	},
	boardLegend: () => [{
		kind: 'pin',
		text: t('quantumchess', 'To move an attack board, tap its pin name, then the name of a free pin (dashed).'),
	}],
	rules: () => [
		t(
			'quantumchess',
			'Three 4 × 4 main levels, White\'s (W, lowest), Neutral (N) and Black\'s (B, highest), and four 2 × 2 attack boards on pins at the corners of the main levels: QL1 to QL6 on the queen\'s side and KL1 to KL6 on the king\'s side, numbered from White\'s end. White\'s boards start on QL1 and KL1, Black\'s on QL6 and KL6.',
		),
		t(
			'quantumchess',
			'A square is named file, rank and board, such as b3N or z0QL1. Seen from above, all boards form one map with files z to e and ranks 0 to 9: b3W and b3N are the two levels of map square b3. The squares of a pin exist only while a board stands on it.',
		),
		t(
			'quantumchess',
			'Every move is an ordinary chess move on that map and may stop on any level of the target map square. Moving straight up or down is not a move. A piece on any level of a map square in between blocks the move; gaps without a board are empty: pieces fly across them but cannot stop there.',
		),
		t(
			'quantumchess',
			'Instead of a piece you may move an attack board that holds at most one piece to a free pin next to it: one or two numbers up or down on the same side (QL3 reaches QL1, QL2, QL4 and QL5), or across to the same number (KL3). An empty board belongs to the side it started with, a board with a piece to that piece\'s side and carries it along; only an empty board may move backwards.',
		),
		t(
			'quantumchess',
			'Pawns step forward (two map squares on their first move, but not after riding a board) and capture diagonally forward, onto any level. En passant lands on either level of the skipped square.',
		),
		t(
			'quantumchess',
			'A pawn promotes on the last rank of its file: rank 8 on files b and c, rank 9 on files z and e, and on files a and d rank 9 while a board stands on the pin over the far corner (QL6, KL6), else rank 8 (for Black rank 1 and rank 0, with QL1 and KL1). A pawn that a board move takes to its last rank, or leaves on it, promotes at once: your own to the piece you pick, the other side\'s to a queen.',
		),
		t(
			'quantumchess',
			'You may castle from your second move on, if neither the king nor that rook has moved in any possibility. On the king\'s side the king and the rook next to it swap places; on the queen\'s side, once the queen\'s square is empty, the king goes there and the corner rook goes to the king\'s square.',
		),
		t(
			'quantumchess',
			'Quantum tip: a ghost on either level of a map square blocks moves across it in its possibilities, and a piece split over both levels of one map square blocks it for certain. A ghost on the other level of your target square does not matter. Attack boards are never ghosts: a ghost on a moving board rides along where it stands, and a board move that a ghost prevents in some possibilities is settled by a roll.',
		),
	],
}

export default defineVariant(spec)
