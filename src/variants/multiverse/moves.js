/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The moves of multiverse chess in one world (handoff/research/multiverse-final.md sections 5, 6.6 and 6.7).
 *
 * A piece moves from the latest board of a row its side may play, along its vectors (dx, dy, dT, dL), onto a stored
 * board: its own board (a physical move), the latest board of another row (a jump, key `>`), or an older board (a
 * branch, key `>>`, which opens a new timeline). A rider stops at the first piece, reading every board it passes as
 * it was then; a board that does not exist (also a sealed one) ends the line. A branch needs a free timeline of the
 * mover (`x.c[side] < x.m`) unless it captures a royal piece: that ends the game and opens no row (`noRow`).
 *
 * `walkMoves` finds the moves without building them (the computer's fast scans), `genMoves` builds them with their
 * keys, and `generate` is the variant's hook: the moves of the side to move, or for the waiting side the phantom list
 * of 5D check (the side to move's must-move boards passed virtually).
 */

import { LEAPS, PAWN, RIDES, ROYAL } from './pieces.js'
import {
	boardText,
	canSubmit,
	CELL_NAMES,
	lineRange,
	lOf,
	mandatory,
	ROWS,
	sqOf,
	uOf,
} from './skeleton.js'

/** The move kinds by travel class: 0 on its own board, 1 onto another row's latest board, 2 onto an older board. */
const KINDS = ['normal', 'hop', 'branch']

/** The Submit action: legal while the present is not the board of the side to move. */
export const SUBMIT = 'submit'

/**
 * @typedef {object} MoveCursor
 * @property {number} id the moving piece
 * @property {number} from its square (slot 0 of row `u`)
 * @property {number} u source row
 * @property {number} en half-turn index of the source board (with the phantom: its virtual latest board)
 * @property {number} tu target row
 * @property {number} tv half-turn index of the target board
 * @property {number} slot target slot (0 on a latest board)
 * @property {number} tx target file
 * @property {number} ty target rank
 * @property {number} to target square (the drawn square, also on a past board)
 * @property {number} tr travel class: 0 physical, 1 jump, 2 branch
 * @property {number} capture the captured piece, or −1
 * @property {boolean} royal whether the captured piece is royal
 * @property {boolean} noRow a branch onto a royal piece: it opens no row
 * @property {string} kind normal, double, ep, castle, hop or branch
 * @property {boolean} promo whether the pawn or brawn becomes a queen
 * @property {{id: number, from: number, to: number}|null} rook the rook of a castling move
 */

/**
 * Walk the moves of `side` in world `w`: every move of its pieces on the latest boards it may play, as they would be
 * generated (branch permission, promotion, castling and en passant included). `visit` gets one cursor object that is
 * reused for every move (copy what you keep) and may return true to stop the walk. With `pass` (the phantom), the
 * passed rows' latest boards are `en + 1` with the pieces of slot 0; castling and en passant are left out then.
 *
 * @param {object} w world
 * @param {number} side side index
 * @param {boolean[]|null} pass rows passed virtually, or null
 * @param {(m: MoveCursor) => boolean|void} visit called for every move; true stops the walk
 * @return {boolean} whether `visit` stopped the walk
 */
export function walkMoves(w, side, pass, visit) {
	const x = w.x
	const { n, md, h } = x
	const board = w.board
	const [lo, hi] = lineRange(x)
	const canBranch = x.c[side] < x.m
	const pawn = PAWN[side]
	const last = side === 0 ? n - 1 : 0
	const special = !pass
	const ends = x.tl.map((e, u) => (e === null ? -1 : e[1] + (pass && pass[u] ? 1 : 0)))
	/** @type {MoveCursor} */
	const cur = {
		id: -1,
		from: -1,
		u: -1,
		en: -1,
		tu: -1,
		tv: -1,
		slot: 0,
		tx: 0,
		ty: 0,
		to: -1,
		tr: 0,
		capture: -1,
		royal: false,
		noRow: false,
		kind: 'normal',
		promo: false,
		rook: null,
	}
	let l = 0
	let x0 = 0
	let y0 = 0

	/**
	 * Aim the cursor at step `k` along vector `v` from the current piece; false when that board or cell is not there.
	 *
	 * @param {number} k number of steps
	 * @param {number[]} v vector (dx, dy, dT, dL)
	 * @return {boolean}
	 */
	const aim = (k, v) => {
		const tx = x0 + k * v[0]
		const ty = y0 + k * v[1]
		const l2 = l + k * v[3]
		if (tx < 0 || ty < 0 || tx >= n || ty >= n || l2 < lo || l2 > hi) {
			return false
		}
		const tu = uOf(l2, md)
		const e = tu < 0 ? null : x.tl[tu]
		if (e === null) {
			return false
		}
		const ten = ends[tu]
		const tv = cur.en + 2 * k * v[2]
		if (tv < e[0] || tv > ten || ten - tv > h) {
			return false
		}
		cur.tu = tu
		cur.tv = tv
		cur.slot = tv >= e[1] ? 0 : 1 + (tv % h)
		cur.tx = tx
		cur.ty = ty
		cur.to = sqOf(tu, cur.slot, tx, ty)
		cur.tr = tv !== ten ? 2 : tu === cur.u ? 0 : 1
		return true
	}

	/**
	 * Hand the move at the cursor to `visit`, unless it is a branch the mover may not make.
	 *
	 * @param {number} capture captured piece or −1
	 * @param {string|null} kind the kind, or null for the travel class's kind
	 * @param {boolean} promo whether it promotes
	 * @return {boolean} whether the walk stops
	 */
	const emit = (capture, kind, promo) => {
		const royal = capture >= 0 && ROYAL.has(w.ty[capture])
		if (cur.tr === 2 && !royal && !canBranch) {
			return false
		}
		cur.capture = capture
		cur.royal = royal
		cur.noRow = cur.tr === 2 && royal
		cur.kind = kind ?? KINDS[cur.tr]
		cur.promo = promo
		return visit(cur) === true
	}

	for (let u = 0; u < ROWS; u++) {
		const en = ends[u]
		if (en < 0 || (en & 1) !== side) {
			continue
		}
		l = lOf(u, md)
		for (y0 = 0; y0 < n; y0++) {
			for (x0 = 0; x0 < n; x0++) {
				const from = sqOf(u, 0, x0, y0)
				const id = board[from]
				if (id < 0 || w.sd[id] !== side) {
					continue
				}
				cur.id = id
				cur.from = from
				cur.u = u
				cur.en = en
				cur.rook = null
				const type = w.ty[id]
				const b = type[0]
				const rides = RIDES[b]
				if (rides) {
					for (const v of rides) {
						for (let k = 1; aim(k, v); k++) {
							const o = board[cur.to]
							if (o < 0) {
								if (emit(-1, null, false)) {
									return true
								}
								continue
							}
							if (w.sd[o] !== side && emit(o, null, false)) {
								return true
							}
							break
						}
					}
					continue
				}
				const leaps = LEAPS[b]
				if (leaps) {
					for (const v of leaps) {
						if (aim(1, v)) {
							const o = board[cur.to]
							if ((o < 0 || w.sd[o] !== side) && emit(o, null, false)) {
								return true
							}
						}
					}
					if (type === 'k0' && special && castle(w, side, cur, x0, y0, emit)) {
						return true
					}
					continue
				}
				// pawn or brawn: steps (twice when unmoved), captures, en passant
				const unmoved = type === 'p0' || type === 'w0'
				for (const v of pawn.steps) {
					if (!aim(1, v) || board[cur.to] >= 0) {
						continue
					}
					if (emit(-1, null, v[1] !== 0 && cur.ty === last)) {
						return true
					}
					if (unmoved && aim(2, v) && board[cur.to] < 0
						&& emit(-1, v[1] !== 0 ? 'double' : null, v[1] !== 0 && cur.ty === last)) {
						return true
					}
				}
				for (const set of b === 'w' ? [pawn.captures, pawn.brawn] : [pawn.captures]) {
					for (const v of set) {
						if (aim(1, v)) {
							const o = board[cur.to]
							if (o >= 0 && w.sd[o] !== side && emit(o, null, v[1] !== 0 && cur.ty === last)) {
								return true
							}
						}
					}
				}
				if (special && x.ep[u] >= 0 && enPassant(w, side, cur, x0, y0, emit)) {
					return true
				}
			}
		}
	}
	return false
}

/**
 * The castling moves of an unmoved king at the cursor (one board, certain-only): towards each side, the two cells
 * next to the king are on the board and empty, and the first piece further on is an unmoved rook of the same side;
 * the king moves two files and the rook lands on the cell the king crossed.
 *
 * @param {object} w world
 * @param {number} side side index
 * @param {MoveCursor} cur the cursor, at the king
 * @param {number} x0 the king's file
 * @param {number} y0 the king's rank
 * @param {(capture: number, kind: string, promo: boolean) => boolean} emit hands the move over
 * @return {boolean} whether the walk stops
 */
function castle(w, side, cur, x0, y0, emit) {
	const n = w.x.n
	for (const dir of [1, -1]) {
		let xr = x0 + dir
		while (xr >= 0 && xr < n && w.board[sqOf(cur.u, 0, xr, y0)] < 0) {
			xr += dir
		}
		if (xr < 0 || xr >= n || Math.abs(xr - x0) < 3) {
			continue
		}
		const rook = w.board[sqOf(cur.u, 0, xr, y0)]
		if (w.sd[rook] !== side || w.ty[rook] !== 'r0') {
			continue
		}
		atCell(cur, x0 + 2 * dir, y0)
		cur.rook = { id: rook, from: sqOf(cur.u, 0, xr, y0), to: sqOf(cur.u, 0, x0 + dir, y0) }
		const stop = emit(-1, 'castle', false)
		cur.rook = null
		if (stop) {
			return true
		}
	}
	return false
}

/**
 * The en passant captures of a pawn or brawn at the cursor: onto the row's en passant cell, diagonally forward, when
 * the enemy pawn or brawn beside it made a physical double step with the move that produced this board.
 *
 * @param {object} w world
 * @param {number} side side index
 * @param {MoveCursor} cur the cursor, at the pawn
 * @param {number} x0 the pawn's file
 * @param {number} y0 the pawn's rank
 * @param {(capture: number, kind: string, promo: boolean) => boolean} emit hands the move over
 * @return {boolean} whether the walk stops
 */
function enPassant(w, side, cur, x0, y0, emit) {
	const n = w.x.n
	const ty = y0 + (side === 0 ? 1 : -1)
	for (const dx of [1, -1]) {
		const tx = x0 + dx
		if (tx < 0 || tx >= n || ty * 8 + tx !== w.x.ep[cur.u] || w.board[sqOf(cur.u, 0, tx, ty)] >= 0) {
			continue
		}
		const victim = w.board[sqOf(cur.u, 0, tx, y0)]
		const vt = victim >= 0 ? w.ty[victim][0] : ''
		if (victim >= 0 && w.sd[victim] !== side && (vt === 'p' || vt === 'w')) {
			atCell(cur, tx, ty)
			if (emit(victim, 'ep', false)) {
				return true
			}
		}
	}
	return false
}

/**
 * Aim the cursor at a cell of the source board (castling, en passant).
 *
 * @param {MoveCursor} cur the cursor
 * @param {number} tx file
 * @param {number} ty rank
 */
function atCell(cur, tx, ty) {
	cur.tu = cur.u
	cur.tv = cur.en
	cur.slot = 0
	cur.tx = tx
	cur.ty = ty
	cur.to = sqOf(cur.u, 0, tx, ty)
	cur.tr = 0
}

/**
 * The key of the move at the cursor: `(0T5)c3-e4` on one board, `(0T5)c3>(+1T5)c3` for a jump, `(0T5)c3>>(0T3)c3`
 * for a branch, with `=Q` for a promotion; castling is the king's move.
 *
 * @param {MoveCursor} m the cursor
 * @return {string}
 */
export function keyOf(m) {
	const src = boardText(m.u, m.en) + CELL_NAMES[(m.from % 64)]
	const cell = CELL_NAMES[m.ty * 8 + m.tx]
	const path = m.tr === 0 ? '-' + cell : (m.tr === 1 ? '>' : '>>') + boardText(m.tu, m.tv) + cell
	return src + path + (m.promo ? '=Q' : '')
}

/**
 * The classical move of the cursor, with its key: `extra` holds the source row `u`, the target board `tu`, `tv`, the
 * target cell `tx`, `ty`, `noRow` (a branch onto a royal piece) and for castling the `rook` (`{ id, from, to }`).
 *
 * @param {MoveCursor} m the cursor
 * @return {object}
 */
export function moveOf(m) {
	const extra = { u: m.u, tu: m.tu, tv: m.tv, tx: m.tx, ty: m.ty, noRow: m.noRow }
	if (m.rook) {
		extra.rook = m.rook
	}
	return {
		key: keyOf(m),
		from: m.from,
		to: m.to,
		id: m.id,
		capture: m.capture,
		promo: m.promo ? 'q' : null,
		drop: null,
		kind: m.kind,
		extra,
	}
}

/**
 * The moves of `side` in world `w`, built (see `walkMoves`). `keep` may drop moves (the computer's view).
 *
 * @param {object} w world
 * @param {number} side side index
 * @param {object} [opts] options
 * @param {boolean[]|null} [opts.pass] rows passed virtually (the phantom)
 * @param {((m: MoveCursor) => boolean)|null} [opts.keep] which moves to keep
 * @return {object[]}
 */
export function genMoves(w, side, { pass = null, keep = null } = {}) {
	const out = []
	walkMoves(w, side, pass, (m) => {
		if (!keep || keep(m)) {
			out.push(moveOf(m))
		}
	})
	return out
}

/**
 * The phantom of 5D check: the must-move rows of the side to move, passed virtually (null when it has none).
 *
 * @param {object} x the world's extra state
 * @return {boolean[]|null}
 */
export function phantomPass(x) {
	const must = mandatory(x)
	if (!must.length) {
		return null
	}
	const pass = new Array(ROWS).fill(false)
	for (const u of must) {
		pass[u] = true
	}
	return pass
}

/**
 * The variant's `generate`. For the side to move: its moves, plus Submit while it is legal; in the computer's view
 * (`x.ai`) `view(w, side)` may return a filter. For the waiting side: its real moves after the side to move passed its
 * must-move boards (the official check test), flagged `phantom` (`apply` leaves a world unchanged for them), so the
 * core's king danger is 5D check and is the same before and after Submit.
 *
 * @param {object} w world
 * @param {number} side side index
 * @param {((w: object, side: number) => ((m: MoveCursor) => boolean)|null)|null} [view] the computer's view filter
 * @return {object[]}
 */
export function generate(w, side, view = null) {
	const x = w.x
	if (side !== x.s) {
		const list = genMoves(w, side, { pass: phantomPass(x) })
		for (const m of list) {
			m.phantom = true
		}
		return list
	}
	const out = genMoves(w, side, { keep: x.ai && view ? view(w, side) : null })
	if (canSubmit(x)) {
		out.push({
			key: SUBMIT,
			from: -1,
			to: -1,
			id: -1,
			capture: -1,
			promo: null,
			drop: null,
			kind: 'submit',
			extra: {},
		})
	}
	return out
}
