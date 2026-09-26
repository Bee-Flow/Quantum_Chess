/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The start positions of multiverse chess and the building of its worlds (docs/variants.md, "Multiverse chess (5D)"):
 * the official setups, the travel reach, empty worlds, new rows and piece placement, and `buildWorld`, which builds a
 * world from board strings for tests and lessons.
 *
 * A world is `{ sq, ty, sd, board, x }` as everywhere (core/world.js). Its extra state `x` is
 * `{ n, h, m, md, s, t, c, tl, ep, ord, nr, k }`: board size, history boards per row, the cap of new timelines, the
 * start mode (0 one timeline, 1 an even start, 2 three timelines), the side to move, its actions in the current
 * turn, the new lines created by White and Black, per storage row `[st, en, pu, pv]` (first and latest board, the
 * parent board; null for a starting row) or null, per row the en passant cell (`y · 8 + x`) or −1, per row its
 * creation index or −1, the number of rows, and the side that captured a royal piece in this world or −1. The key
 * order never changes (identical worlds are recognised by their JSON).
 */

import { CELLS, idOf, MAX_NEW, ROWS, SLOTS, sqOf, uOf } from './skeleton.js'

/** The Standard position. */
const STANDARD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'

/**
 * The official setups of 5D chess (the boards of the 5dpgn `Board` header), all but Misc – Global Warming, an empty
 * 1 × 1 board that is drawn before the first move: board size `n`, start mode `md`, the starting rows as
 * `[line, 5DFEN, v]` (ranks top to bottom; `v` the half-turn index of the row's first board, 2 = T1 White to move by
 * default, 3 = T1 Black to move for a staggered start) and whether the game starts from turn zero (the Standard
 * position also on a T0 ● history board). The order is the order of the new-game dialog: the three main boards, then
 * the families of the original game.
 */
export const SETUPS = Object.freeze({
	small: { n: 5, md: 0, rows: [[0, 'kqbnr/ppppp/5/PPPPP/KQBNR']] },
	verysmallopen: { n: 4, md: 0, rows: [[0, 'nbrk/3p/P3/KRBN']] },
	standard: { n: 8, md: 0, rows: [[0, STANDARD]] },
	smallcentered: { n: 5, md: 0, rows: [[0, 'rnkqr/ppppp/5/PPPPP/RQKNR']] },
	smallflipped: { n: 5, md: 0, rows: [[0, 'nbrqk/ppppp/5/PPPPP/KQRBN']] },
	smallopen: { n: 5, md: 0, rows: [[0, 'prnbk/3pp/5/PP3/KBNRP']] },
	verysmall: { n: 4, md: 0, rows: [[0, 'nbrk/pppp/PPPP/KRBN']] },
	noqueens: { n: 7, md: 0, rows: [[0, 'rnbknbr/ppppppp/7/7/7/PPPPPPP/RNBKNBR']] },
	nobishops: { n: 6, md: 0, rows: [[0, 'rnqknr/pppppp/6/6/PPPPPP/RNQKNR']] },
	noknights: { n: 6, md: 0, rows: [[0, 'rbqkbr/pppppp/6/6/PPPPPP/RBQKBR']] },
	norooks: { n: 6, md: 0, rows: [[0, 'nbqkbn/pppppp/6/6/PPPPPP/NBQKBN']] },
	knightsbishops: { n: 6, md: 0, rows: [[0, 'rbqkbr/pppppp/6/6/PPPPPP/RNQKNR']] },
	simpleset: { n: 6, md: 0, rows: [[0, 'rnbqkr/pppppp/6/6/PPPPPP/RKQBNR']] },
	turnzero: { n: 8, md: 0, rows: [[0, STANDARD]], turnZero: true },
	twotimelines: { n: 8, md: 1, rows: [[-1, STANDARD], [0, STANDARD]] },
	princess: { n: 8, md: 0, rows: [[0, 'rnbskbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBSKBNR']] },
	reversed: { n: 8, md: 0, rows: [[0, 'rnbycbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBYCBNR']] },
	defended: { n: 8, md: 0, rows: [[0, 'rqbnkbnr/pppppppp/8/8/8/8/PPPPPPPP/RQBNKBNR']] },
	halfreflected: { n: 8, md: 0, rows: [[0, 'rnbkqbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR']] },
	justkings: { n: 3, md: 0, rows: [[0, '2k/3/K2']] },
	justpawns: { n: 5, md: 0, rows: [[0, 'ppppk/5/5/5/KPPPP']] },
	justknights: { n: 5, md: 0, rows: [[0, 'n1kn1/5/5/5/1NK1N']] },
	justbishops: { n: 5, md: 0, rows: [[0, '1bbk1/5/5/5/1KBB1']] },
	justrooks: { n: 5, md: 0, rows: [[0, '1rk1r/5/5/5/R1KR1']] },
	justqueens: { n: 6, md: 0, rows: [[0, '1q1k2/6/6/6/6/2K1Q1']] },
	justunicorns: { n: 5, md: 0, rows: [[0, '1u1uk/5/5/5/KU1U1']] },
	justdragons: { n: 5, md: 0, rows: [[0, '2ddk/5/5/5/KDD2']] },
	justbrawns: { n: 5, md: 0, rows: [[0, 'wwwwk/5/5/5/KWWWW']] },
	kingofkings: { n: 5, md: 0, rows: [[0, 'cckcc/5/5/5/CCKCC']] },
	royalqueens: { n: 6, md: 0, rows: [[0, '4y1/6/6/6/6/1Y4']] },
	excessive: { n: 7, md: 0, rows: [[0, 'kruqdrk/rnbknbr/ppppppp/7/PPPPPPP/RNBKNBR/KRUQDRK']] },
	marauders: {
		n: 5,
		md: 2,
		rows: [[-1, 'wrkrw/1www1/5/5/5'], [0, 'w1w1w/5/5/5/W1W1W'], [1, '5/5/5/1WWW1/WRKRW']],
	},
	battlegrounds: {
		n: 5,
		md: 2,
		rows: [[-1, 'rrkrr/bbqbb/ppppp/5/PPPPP'], [0, 'nnnnn/ppppp/5/PPPPP/NNNNN'], [1, 'ppppp/5/PPPPP/BBQBB/RRKRR']],
	},
	invasion: { n: 5, md: 1, rows: [[-1, 'nbkrb/ppppp/5/5/PPPPP'], [0, 'ppppp/5/5/PPPPP/NBKRB']] },
	formations: { n: 5, md: 1, rows: [[-1, 'ppppp/5/5/5/2K2'], [0, '2k2/5/5/5/PPPPP']] },
	tactician: { n: 4, md: 1, rows: [[-1, 'kbnr/pppp/4/4'], [0, '4/4/PPPP/KBNR']] },
	strategos: { n: 5, md: 1, rows: [[-1, 'nbkur/ppppp/5/5/5'], [0, '5/5/5/PPPPP/RUKBN']] },
	skirmish: { n: 5, md: 1, rows: [[-1, '3rk/3pp/5/BB3/NN3'], [0, '3nn/3bb/5/PP3/KR3']] },
	// −0 starts half a turn later, with Black to move
	fragments: { n: 4, md: 1, rows: [[-1, 'kppp/4/4/NBRU', 3], [0, 'nbru/4/4/KPPP']] },
	mateknight: { n: 6, md: 0, rows: [[0, '5n/6/6/6/6/K5']] },
	matebishop: { n: 6, md: 0, rows: [[0, '4b1/6/6/6/6/K5']] },
	materook: { n: 6, md: 0, rows: [[0, '5r/6/6/6/6/K5']] },
	matequeen: { n: 6, md: 0, rows: [[0, '4q1/6/6/6/6/K5']] },
	matepawns: { n: 6, md: 0, rows: [[0, '2ppp1/6/6/6/6/3K2']] },
})

/** The order of the setups in the new-game dialog (the main boards first). */
export const SETUP_ORDER = Object.freeze(Object.keys(SETUPS))

/**
 * The travel reach in turns: the option's value, or with 'auto' 2 turns on boards up to 5 × 5 and 4 on larger ones.
 *
 * @param {number} n board size
 * @param {string} [option] the option value: 'auto', '2' or '4'
 * @return {number}
 */
export function reachOf(n, option = 'auto') {
	return option === '2' || option === '4' ? Number(option) : n <= 5 ? 2 : 4
}

/**
 * The pieces of a 5DFEN board (ranks top to bottom; digits are empty cells). With `unmoved`, every king, rook, pawn
 * and brawn gets its unmoved type; otherwise a `*` after one of them marks it unmoved.
 *
 * @param {string} fen the board
 * @param {number} n board size
 * @param {boolean} [unmoved] mark every king, rook, pawn and brawn unmoved
 * @return {Array<{x: number, y: number, type: string, side: number}>}
 */
export function fenPieces(fen, n, unmoved = false) {
	const out = []
	fen.split('/').forEach((row, i) => {
		const y = n - 1 - i
		let x = 0
		for (const ch of row) {
			if (ch >= '0' && ch <= '9') {
				x += Number(ch)
			} else if (ch === '*') {
				const last = out[out.length - 1]
				if ('krpw'.includes(last.type)) {
					last.type += '0'
				}
			} else {
				const lower = ch.toLowerCase()
				const type = unmoved && 'krpw'.includes(lower) ? lower + '0' : lower
				out.push({ x, y, type, side: ch === lower ? 1 : 0 })
				x++
			}
		}
	})
	return out
}

/**
 * A world without rows.
 *
 * @param {object} opts the game's constants
 * @param {number} opts.n board size
 * @param {number} opts.h history boards per row (twice the travel reach)
 * @param {number} opts.m new timelines per player
 * @param {number} opts.md start mode
 * @return {object}
 */
export function blankWorld({ n, h, m, md }) {
	const none = () => new Array(ROWS).fill(null)
	return {
		sq: [],
		ty: [],
		sd: [],
		board: [],
		x: {
			n,
			h,
			m,
			md,
			s: 0,
			t: 0,
			c: [0, 0],
			tl: none(),
			ep: new Array(ROWS).fill(-1),
			ord: new Array(ROWS).fill(-1),
			nr: 0,
			k: -1,
		},
	}
}

/**
 * Make room for a new storage row in a world under construction: its creation index, the board up to its squares,
 * and the piece ids of one more row (unused ids have square −1, type '' and side 0).
 *
 * @param {object} w mutable world
 * @param {number} u storage row
 */
export function grow(w, u) {
	const x = w.x
	if (x.ord[u] < 0) {
		x.ord[u] = x.nr++
	}
	const squares = (u + 1) * SLOTS * CELLS
	while (w.board.length < squares) {
		w.board.push(-1)
	}
	const ids = x.nr * (x.h + 1) * x.n * x.n
	while (w.sq.length < ids) {
		w.sq.push(-1)
		w.ty.push('')
		w.sd.push(0)
	}
}

/**
 * Put a piece on an empty square of a world under construction.
 *
 * @param {object} w mutable world
 * @param {number} id piece id
 * @param {number} sq square
 * @param {string} type type
 * @param {number} side side index
 */
export function place(w, id, sq, type, side) {
	w.sq[id] = sq
	w.ty[id] = type
	w.sd[id] = side
	w.board[sq] = id
}

/**
 * The cap of new timelines per player: the option's value (3 when it is missing or not a number), at most what the
 * storage rows hold for the setup's start mode (a three-timeline start keeps 3 when 4 is chosen), and at most 3 on
 * two 8 × 8 timelines (Standard – Two Timelines), where a fourth pair makes one step of the game (the legal moves, the
 * danger, the drawing and the move) take 0.13 to 0.17 s at 64 possibilities on a desktop computer, over the 0.15 s a
 * step may take.
 *
 * @param {object} S the setup (`SETUPS`)
 * @param {string} [option] the option value: '1' … '4'
 * @return {number}
 */
export function capOf(S, option = '3') {
	const most = S.n >= 8 && S.rows.length > 1 ? Math.min(3, MAX_NEW[S.md]) : MAX_NEW[S.md]
	return Math.max(1, Math.min(Number(option) || 3, most))
}

/**
 * The start world of a game.
 *
 * @param {object} [options] option values: `setup`, `timelines` ('1' … '4'), `reach` ('auto', '2', '4')
 * @return {object}
 */
export function setup(options = {}) {
	const S = SETUPS[options.setup] ?? SETUPS.small
	const h = 2 * reachOf(S.n, options.reach)
	const w = blankWorld({ n: S.n, h, m: capOf(S, options.timelines), md: S.md })
	const x = w.x
	for (const [l, fen, v = 2] of S.rows) {
		const u = uOf(l, S.md)
		grow(w, u)
		x.tl[u] = [S.turnZero ? 1 : v, v, null, null]
		for (const p of fenPieces(fen, S.n, true)) {
			place(w, idOf(x, u, 0, p.x, p.y), sqOf(u, 0, p.x, p.y), p.type, p.side)
			if (S.turnZero) {
				// the T0 ● board (v 1) holds the same position in history
				const slot = 1 + (1 % h)
				place(w, idOf(x, u, slot, p.x, p.y), sqOf(u, slot, p.x, p.y), 'h' + p.type, p.side)
			}
		}
	}
	return w
}

/**
 * A world from board strings, for tests and lessons. `rows` maps a line to `{ st, en, parent, boards }`: the first and
 * latest board, the parent board `[u, v]` of a created row, and 5DFEN strings by half-turn index (`*` after a king,
 * rook, pawn or brawn marks it unmoved; boards not listed are empty). History pieces get their cells' ids and types.
 *
 * @param {object} spec the world
 * @param {number} [spec.n] board size (default 5)
 * @param {number} [spec.h] history boards per row (default 4)
 * @param {number} [spec.m] new timelines per player (default 3)
 * @param {number} [spec.md] start mode (default 0)
 * @param {number} [spec.s] side to move (default 0)
 * @param {number} [spec.t] actions of the side to move in this turn (default 0)
 * @param {number[]} [spec.c] new lines created by White and Black (default none)
 * @param {object} spec.rows the rows by line
 * @return {object}
 */
export function buildWorld({ n = 5, h = 4, m = 3, md = 0, s = 0, t = 0, c = [0, 0], rows }) {
	const w = blankWorld({ n, h, m, md })
	w.x.s = s
	w.x.t = t
	w.x.c = c.slice()
	const lines = Object.keys(rows).map(Number).sort((a, b) => a - b)
	for (const l of lines) {
		grow(w, uOf(l, md))
	}
	for (const l of lines) {
		const r = rows[l]
		const u = uOf(l, md)
		w.x.tl[u] = [r.st, r.en, r.parent?.[0] ?? null, r.parent?.[1] ?? null]
		for (const [v, fen] of Object.entries(r.boards ?? {})) {
			const slot = Number(v) === r.en ? 0 : 1 + (Number(v) % h)
			for (const p of fenPieces(fen, n)) {
				place(w, idOf(w.x, u, slot, p.x, p.y), sqOf(u, slot, p.x, p.y), slot ? 'h' + p.type : p.type, p.side)
			}
		}
	}
	return w
}
