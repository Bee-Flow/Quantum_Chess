/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Building blocks for variants played with the ordinary chess pieces on a two-dimensional board: the six piece types,
 * pawn double steps and en passant, castling (including Chess960 castling), promotion and the per-world bookkeeping
 * of castling rights and the en passant square.
 *
 * World extras used here: `x.ep` (the square a pawn just skipped, or -1), `x.epVictim` (the square of that pawn) and
 * `x.castle` (the castling rights: `[{ flag, side, king, rook, kingTo, rookTo }]`). `clearEnPassant` and
 * `unifyCastling` keep them in line with docs/rules.md across the worlds (the `applyMiss` and `unifyWorlds` hooks).
 * Castling, double steps and the en passant square also work along a file and with more than two coordinates.
 */

import { t } from '@nextcloud/l10n'
import { rectTopology } from './topology.js'
import { addPiece, emptyWorld, moveKey } from './world.js'

export const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
export const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
export const KING_STEPS = [...ROOK_DIRS, ...BISHOP_DIRS]
export const KNIGHT_JUMPS = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]

/** Standard piece values in centipawns. */
export const VALUES = Object.freeze({ k: 400, q: 900, r: 500, b: 330, n: 320, p: 100 })

/**
 * The six orthodox piece types. `lastRank(side, sq)` decides where pawns promote; `promoteTo` lists the choices.
 *
 * @param {object} opts options
 * @param {(side: number, sq: number) => boolean} opts.lastRank promotion squares
 * @param {string[]} [opts.promoteTo] promotion choices
 * @param {boolean} [opts.royalKing] whether the king is royal (false in antichess)
 * @return {Record<string, object>}
 */
export function orthodoxTypes({ lastRank, promoteTo = ['q', 'r', 'b', 'n'], royalKing = true }) {
	return {
		k: {
			name: () => t('quantumchess', 'King'),
			moves: [{ leap: KING_STEPS }],
			royal: royalKing,
			solid: true,
			value: VALUES.k,
			glyph: { sprite: 'k' },
		},
		q: {
			name: () => t('quantumchess', 'Queen'),
			moves: [{ ride: ROOK_DIRS }, { ride: BISHOP_DIRS }],
			value: VALUES.q,
			glyph: { sprite: 'q' },
		},
		r: {
			name: () => t('quantumchess', 'Rook'),
			moves: [{ ride: ROOK_DIRS }],
			value: VALUES.r,
			glyph: { sprite: 'r' },
		},
		b: {
			name: () => t('quantumchess', 'Bishop'),
			moves: [{ ride: BISHOP_DIRS }],
			value: VALUES.b,
			glyph: { sprite: 'b' },
		},
		n: {
			name: () => t('quantumchess', 'Knight'),
			moves: [{ leap: KNIGHT_JUMPS }],
			value: VALUES.n,
			glyph: { sprite: 'n' },
		},
		p: {
			name: () => t('quantumchess', 'Pawn'),
			moves: [
				{ leap: [[0, 1]], oriented: true, mode: 'move' },
				{ leap: [[1, 1], [-1, 1]], oriented: true, mode: 'capture' },
			],
			solid: true,
			value: VALUES.p,
			glyph: { sprite: 'p' },
			promote: { zone: (side, sq) => lastRank(side, sq), to: promoteTo },
		},
	}
}

/**
 * A standard two-sided board of `files × ranks` with the usual promotion ranks.
 *
 * @param {number} [files] number of files
 * @param {number} [ranks] number of ranks
 * @param {object} [opts] options for `rectTopology`
 * @return {{topology: object, lastRank: (side: number, sq: number) => boolean, rankOf: (sq: number) => number,
 *   fileOf: (sq: number) => number}}
 */
export function standardBoard(files = 8, ranks = 8, opts = {}) {
	const topology = rectTopology(files, ranks, opts)
	const rankOf = (sq) => topology.coords[sq][1]
	const fileOf = (sq) => topology.coords[sq][0]
	return {
		topology,
		rankOf,
		fileOf,
		lastRank: (side, sq) => rankOf(sq) === (side === 0 ? ranks - 1 : 0),
	}
}

/**
 * The start world of a two-sided game with a back rank and a pawn rank per side, mirrored for Black.
 *
 * @param {object} V variant (topology and types)
 * @param {string} back back-rank types from file a, e.g. `rnbqkbnr`
 * @param {object} [opts] options
 * @param {number} [opts.pawnRank] rank index of White's pawns (default 1)
 * @param {boolean} [opts.castling] give both sides the castling rights of this back rank
 * @return {object}
 */
export function standardSetup(V, back, { pawnRank = 1, castling = true } = {}) {
	const topo = V.topology
	const ranks = Math.max(...topo.coords.map((c) => c[1])) + 1
	const w = emptyWorld(V)
	for (const side of [0, 1]) {
		const r = side === 0 ? 0 : ranks - 1
		const pr = side === 0 ? pawnRank : ranks - 1 - pawnRank
		for (let f = 0; f < back.length; f++) {
			addPiece(w, back[f], side, topo.at([f, r]))
		}
		for (let f = 0; f < back.length; f++) {
			addPiece(w, 'p', side, topo.at([f, pr]))
		}
	}
	w.x = { ep: -1, epVictim: -1, castle: castling ? castlingRights(V, w) : [] }
	return w
}

/**
 * The castling rights of a start world: for each side, the king and the outermost rook on each side of it, with the
 * usual destinations (king to the c or g file, rook to the d or f file; on a wider board, the files next to the
 * king's destination as in Capablanca chess, where the king goes to the c or i file).
 *
 * Coordinate 0 is the file. The rook must share every other coordinate with the king (its rank, and its board on a
 * topology with more coordinates, such as `[file, rank, board]`), and the destinations keep them too.
 *
 * @param {object} V variant
 * @param {object} w start world
 * @param {object} [opts] options
 * @param {number} [opts.kingToLong] file of the king after castling long (default 2)
 * @param {number} [opts.kingToShort] file of the king after castling short (default files − 2)
 * @return {object[]}
 */
export function castlingRights(V, w, opts = {}) {
	const topo = V.topology
	const files = Math.max(...topo.coords.map((c) => c[0])) + 1
	const kingToShort = opts.kingToShort ?? files - 2
	const kingToLong = opts.kingToLong ?? 2
	const out = []
	for (const side of [0, 1]) {
		const king = w.sq.findIndex((s, id) => s >= 0 && w.sd[id] === side && w.ty[id] === 'k')
		if (king < 0) {
			continue
		}
		const ks = w.sq[king]
		const [kf, ...rest] = topo.coords[ks]
		const onFile = (f) => topo.at([f, ...rest])
		const rooks = w.sq
			.map((s, id) => ({ s, id }))
			.filter(({ s, id }) => s >= 0 && w.sd[id] === side && w.ty[id] === 'r'
				&& rest.every((v, i) => topo.coords[s][i + 1] === v))
		const long = rooks
			.filter(({ s }) => topo.coords[s][0] < kf)
			.sort((a, b) => topo.coords[a.s][0] - topo.coords[b.s][0])[0]
		const short = rooks
			.filter(({ s }) => topo.coords[s][0] > kf)
			.sort((a, b) => topo.coords[b.s][0] - topo.coords[a.s][0])[0]
		if (short) {
			out.push({
				flag: side === 0 ? 'K' : 'k',
				side,
				king: ks,
				rook: short.s,
				kingTo: onFile(kingToShort),
				rookTo: onFile(kingToShort - 1),
			})
		}
		if (long) {
			out.push({
				flag: side === 0 ? 'Q' : 'q',
				side,
				king: ks,
				rook: long.s,
				kingTo: onFile(kingToLong),
				rookTo: onFile(kingToLong + 1),
			})
		}
	}
	return out
}

/**
 * The squares strictly between two squares on one straight line, in any number of coordinates: the line's unit step
 * is the sign of each coordinate difference, so the differences that are not zero must all have the same size (a
 * rank, a file, a diagonal, ...). Empty when the squares are equal, adjacent or not on one line; squares that do not
 * exist in the topology are left out.
 *
 * @param {object} topo topology
 * @param {number} a square
 * @param {number} b square
 * @return {number[]}
 */
export function between(topo, a, b) {
	const ca = topo.coords[a]
	const cb = topo.coords[b]
	const d = cb.map((v, i) => v - ca[i])
	const n = Math.max(...d.map((v) => Math.abs(v)))
	if (n < 2 || d.some((v) => v !== 0 && Math.abs(v) !== n)) {
		return []
	}
	const unit = d.map((v) => Math.sign(v))
	const out = []
	for (let k = 1; k < n; k++) {
		const s = topo.at(ca.map((v, i) => v + k * unit[i]))
		if (s >= 0) {
			out.push(s)
		}
	}
	return out
}

/**
 * Castling moves of a side in a world. There is no check in Quantum Chess, so the only condition is that every square
 * the king and the rook cross or land on is empty (apart from the king and the rook themselves). King and rook may
 * stand on any straight line (a rank, a file, the rank of one board of several).
 *
 * The move's `to` is the king's destination (the rook's square when the king does not move); with `toRook` it is
 * always the rook's square, so the player castles by moving the king onto its rook (Chess960). `extra.kingTo` is
 * always the king's destination and `extra.rook` the rook with its destination.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side side index
 * @param {object} [opts] options
 * @param {boolean} [opts.toRook] use the rook's square as `to` of every castling move
 * @return {object[]}
 */
export function castlingMoves(V, w, side, opts = {}) {
	const out = []
	const topo = V.topology
	for (const c of w.x.castle ?? []) {
		if (c.side !== side) {
			continue
		}
		const king = w.board[c.king]
		const rook = w.board[c.rook]
		if (king < 0 || rook < 0 || w.ty[king] !== 'k' || w.ty[rook] !== 'r'
			|| w.sd[king] !== side || w.sd[rook] !== side) {
			continue
		}
		const need = new Set([
			...between(topo, c.king, c.kingTo),
			c.kingTo,
			...between(topo, c.rook, c.rookTo),
			c.rookTo,
		])
		need.delete(c.king)
		need.delete(c.rook)
		if ([...need].some((s) => w.board[s] !== -1)) {
			continue
		}
		const long = c.flag === 'Q' || c.flag === 'q'
		out.push({
			key: long ? 'O-O-O' : 'O-O',
			from: c.king,
			to: opts.toRook || c.kingTo === c.king ? c.rook : c.kingTo,
			id: king,
			capture: -1,
			promo: null,
			drop: null,
			kind: 'castle',
			extra: { rook: { id: rook, to: c.rookTo }, kingTo: c.kingTo },
		})
	}
	return out
}

/**
 * Pawn double steps and en passant captures of a side in a world.
 *
 * The fifth argument is the pawn type (default `p`) or an object with the pawn geometry, for boards where pawns do
 * not move up a file (hexagonal boards, four-player chess): `pawn` (type, default `p`), `forward` (the single step,
 * default `[0, 1]`; a double step is two of them) and `captures` (the capture steps, default `[[1, 1], [-1, 1]]`), all
 * written for side 0 and turned with `V.orient` for the other sides.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side side index
 * @param {(side: number, sq: number) => boolean} canDouble whether a pawn on this square may double-step
 * @param {string|{pawn?: string, forward?: number[], captures?: number[][]}} [opts] the pawn type, or the geometry
 * @return {object[]}
 */
export function pawnExtras(V, w, side, canDouble, opts = 'p') {
	const { pawn = 'p', forward = [0, 1], captures = [[1, 1], [-1, 1]] } = typeof opts === 'string'
		? { pawn: opts }
		: (opts ?? {})
	const out = []
	const topo = V.topology
	const fwd = V.orient(side, forward)
	const caps = w.x.ep >= 0 ? captures.map((c) => V.orient(side, c)) : []
	const victim = w.x.ep >= 0 ? w.board[w.x.epVictim] : -1
	const epOpen = victim >= 0 && V.enemies(side, w.sd[victim]) && w.board[w.x.ep] === -1
	for (let id = 0; id < w.sq.length; id++) {
		const s = w.sq[id]
		if (s < 0 || w.sd[id] !== side || w.ty[id] !== pawn) {
			continue
		}
		if (canDouble(side, s)) {
			const s1 = topo.step(s, fwd)
			const s2 = s1 < 0 ? -1 : topo.step(s1, fwd)
			if (s2 >= 0 && w.board[s1] === -1 && w.board[s2] === -1) {
				out.push({
					key: moveKey(V, s, s2),
					from: s,
					to: s2,
					id,
					capture: -1,
					promo: null,
					drop: null,
					kind: 'double',
				})
			}
		}
		if (epOpen) {
			for (const c of caps) {
				const t = topo.step(s, c)
				if (t === w.x.ep) {
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
	return out
}

/**
 * Per-world bookkeeping after an orthodox move: the en passant square and the castling rights. The en passant square
 * of a double step is the midpoint of its from and to squares in every coordinate (a vertical, horizontal or
 * multi-board double step).
 *
 * @param {object} V variant
 * @param {object} next the new world (mutable)
 * @param {object} m the move
 */
export function orthodoxAfterMove(V, next, m) {
	if (m.kind === 'double') {
		const topo = V.topology
		const to = topo.coords[m.to]
		const ep = topo.at(topo.coords[m.from].map((v, i) => (v + to[i]) / 2))
		next.x.ep = ep
		next.x.epVictim = ep >= 0 ? m.to : -1
	} else {
		next.x.ep = -1
		next.x.epVictim = -1
	}
	if (next.x.castle?.length) {
		next.x.castle = next.x.castle.filter((c) => !(m.from === c.king || m.from === c.rook || m.to === c.rook
			|| m.to === c.king))
	}
}

/**
 * The en passant right ends after one ply, also in a world where that ply's move missed (the `applyMiss` hook of the
 * quantum layer) and on a Measure turn: a world without the en passant square and its victim.
 *
 * @param {object} b world
 * @return {object} `b` itself when `x.ep` and `x.epVictim` are -1 or absent, else a copy with both -1
 */
export function clearEnPassant(b) {
	const x = b.x ?? {}
	if ((x.ep ?? -1) === -1 && (x.epVictim ?? -1) === -1) {
		return b
	}
	return { ...b, x: { ...x, ep: -1, epVictim: -1 } }
}

/**
 * The text key of a castling right, for comparing rights between worlds.
 *
 * @param {object} c right `{ flag, side, king, rook, kingTo, rookTo }`
 * @return {string}
 */
function rightKey(c) {
	return c.flag + ':' + c.side + ':' + c.king + ':' + c.rook + ':' + c.kingTo + ':' + c.rookTo
}

/**
 * Castling rights follow the whole state (the `unifyWorlds` hook of the quantum layer): a right is kept only if every
 * world still has it, so it is lost everywhere as soon as the king or that rook is not 100 % on its start square. A
 * world without `x.castle` has no rights.
 *
 * @param {object[]} bs the worlds of the new state
 * @return {object[]} `bs` itself when all worlds agree; otherwise a new array of the same length and order, in which
 *   only the worlds whose rights change are copies
 */
export function unifyCastling(bs) {
	if (bs.length < 2) {
		return bs
	}
	const lists = bs.map((b) => (Array.isArray(b.x?.castle) ? b.x.castle : []))
	if (lists.every((l) => l.length === 0)) {
		return bs
	}
	const keys = lists.map((l) => l.map(rightKey))
	const count = new Map()
	for (const list of keys) {
		for (const k of new Set(list)) {
			count.set(k, (count.get(k) ?? 0) + 1)
		}
	}
	let changed = false
	const out = bs.map((b, i) => {
		if (keys[i].every((k) => count.get(k) === bs.length)) {
			return b
		}
		changed = true
		return { ...b, x: { ...b.x, castle: lists[i].filter((c, j) => count.get(keys[i][j]) === bs.length) } }
	})
	return changed ? out : bs
}
