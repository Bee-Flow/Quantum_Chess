// Final prototype of the "multiverse" variant (handoff/research/multiverse-final.md). Validation and measurement only;
// not production code (no JSDoc, no translations). Runs on core/, a copy of the working-tree core patched with the one
// proposed hook allowQuantum (patch-core.mjs).
//
// Square: sq = ((u * SLOTS_MAX) + slot) * 64 + y * 8 + x     (u = zig-zag row of the line l, slot 0 = latest board,
//         slot 1..h = history ring, board v in slot 1 + v % h)
// Id:     id = ((u * (h + 1)) + slot) * n * n + y * n + x     (compact per game; live ids travel with the piece,
//         history ids belong to their history cell)
// Time:   v = 2 T + c (c 0 = White to move, 1 = Black), T0 ● = 1, T1 ○ = 2.
import { allDirections, directions, makeTopology, symmetric } from '../../tmp/mv-final/core/topology.mjs'
import { defineVariant } from '../../tmp/mv-final/core/variant.mjs'
import { ownPieceAt, parseCode, royalDanger, branches, stateAfter } from '../../tmp/mv-final/core/quantum.mjs'
import { generate as cachedGen } from '../../tmp/mv-final/core/world.mjs'

export const OFF = -1
export const MINUS = '−'
const ENV = globalThis.process?.env ?? {}
export const ROWS = Number(ENV.MVF_ROWS ?? 11) // static rows: u 0..8 by zig-zag of the line, 9 = −0, 10 = +0
export const HMAX = Number(ENV.MVF_HMAX ?? 8) // history boards per row at reach 4
export const SLOTS_MAX = HMAX + 1
export const SUBMIT = 'submit'
const FILES = 'abcdefgh'
const START = [[0, 0], [-1, 0], [-1, 1]] // starting lines [l0, l1] per start mode: single, even (−0, +0), three

// storage row of line l: zig-zag of the displayed number; an even start (md 1) keeps −0 (l −1) and +0 (l 0) in the
// dedicated rows 9 and 10, and its Black lines l ≤ −2 (displayed −1, −2, …) in the odd rows
const EVEN0 = ROWS - 2
export const uOf = (l, md = 0) => (md === 1 ? (l === 0 ? EVEN0 + 1 : l === -1 ? EVEN0 : l > 0 ? 2 * l : -2 * l - 3) : l >= 0 ? 2 * l : -2 * l - 1)
export const lOf = (u, md = 0) => {
	if (md === 1) {
		return u === EVEN0 + 1 ? 0 : u === EVEN0 ? -1 : u % 2 === 0 ? u / 2 : -(u + 1) / 2 - 1
	}
	return u % 2 === 0 ? u / 2 : -(u + 1) / 2
}
export const sqOf = (u, slot, x, y) => (u * SLOTS_MAX + slot) * 64 + y * 8 + x
export const decode = (sq) => {
	const cell = sq % 64
	const b = (sq - cell) / 64
	return { u: Math.floor(b / SLOTS_MAX), slot: b % SLOTS_MAX, x: cell % 8, y: cell >> 3 }
}
// ids by row creation order (x.ord), so they stay compact whatever the row numbers
export const idOf = (x, u, slot, cx, cy) => (x.ord[u] * (x.h + 1) + slot) * x.n * x.n + cy * x.n + cx
const num = (l) => (l === 0 ? '0' : l > 0 ? '+' + l : MINUS + -l)
// the player-facing timeline label of a storage row (official numbering: −0 / +0 in an even start), and of a line
export const LAB = Array.from({ length: ROWS }, (_, u) => (u === ROWS - 2 ? MINUS + '0' : u === ROWS - 1 ? '+0' : num(lOf(u, 0))))
export const label = (l, md) => LAB[uOf(l, md)]
const cellName = (x, y) => FILES[x] + (y + 1)
export const boardText = (x, u, v) => '(' + LAB[u] + 'T' + (v >> 1) + ')'

// ------------------------------------------------------------------ static topology (names for split, merge and measure codes)
const coords = []
for (let u = 0; u < ROWS; u++) {
	for (let slot = 0; slot < SLOTS_MAX; slot++) {
		for (let y = 0; y < 8; y++) {
			for (let x = 0; x < 8; x++) {
				coords.push([x, y, slot, u])
			}
		}
	}
}
export const topology = makeTopology({
	coords,
	name: ([x, y, slot, u]) => '(' + LAB[u] + ')' + (slot ? '~' + slot : '') + cellName(x, y),
	cell: ([x, y, slot, u]) => ({ x: slot * 9 + x, y: u * 9 + 7 - y, w: 1, h: 1, shape: 'rect', shade: 'light' }),
})

// ------------------------------------------------------------------ pieces
const usable = (v) => !(v[3] === 0 && v[2] > 0) // same timeline, forward in time: never a board
const DIR = (k) => directions(4, k).filter(usable)
export const VEC = { R: DIR(1), B: DIR(2), U: DIR(3), D: DIR(4), N: symmetric([2, 1], 4).filter(usable) }
VEC.Q = allDirections(4).filter(usable)
VEC.S = [...VEC.R, ...VEC.B]
const RIDE = { q: VEC.Q, y: VEC.Q, r: VEC.R, b: VEC.B, u: VEC.U, d: VEC.D, s: VEC.S }
const LEAP = { k: VEC.Q, c: VEC.Q, n: VEC.N }
export const base = (t) => (t[0] === 'h' ? t.slice(1) : t).replace('0', '')
const live = (t) => (t[0] === 'h' ? t.slice(1) : t)
const moved = (t) => t.replace('0', '')
const VALUES = { k: 0, y: 0, c: 350, q: 1400, s: 800, r: 350, b: 500, n: 450, u: 550, d: 350, p: 100, w: 140 }
const NAMES = { k: 'King', y: 'Royal queen', c: 'Common king', q: 'Queen', s: 'Princess', r: 'Rook', b: 'Bishop', n: 'Knight', u: 'Unicorn', d: 'Dragon', p: 'Pawn', w: 'Brawn' }
export const LIVE_TYPES = ['k0', 'k', 'y', 'c', 'q', 's', 'r0', 'r', 'b', 'n', 'u', 'd', 'p0', 'p', 'w0', 'w']
export const types = {}
for (const t of LIVE_TYPES) {
	const b = base(t)
	const royal = b === 'k' || b === 'y'
	const solid = royal || b === 'c' || b === 'p' || b === 'w'
	const glyph = 'kqrbnp'.includes(b) ? { sprite: b } : { text: b.toUpperCase(), shape: 'circle' }
	types[t] = { name: () => NAMES[b], moves: [], royal, solid, splittable: !solid, value: VALUES[b], glyph, ...(b === 'c' ? { resetsQuiet: false } : {}) }
	// the same piece on a history board: never moves, worth nothing to the computer, still royal / solid
	types['h' + t] = { name: () => NAMES[b], moves: [], royal, solid, splittable: false, value: 0, glyph, resetsQuiet: false }
}

// ------------------------------------------------------------------ setups (5DFEN ranks top to bottom; K, R, P, W start unmoved)
const STD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'
export const SETUPS = {
	small: { n: 5, md: 0, rows: [[0, 'kqbnr/ppppp/5/PPPPP/KQBNR']] },
	verysmallopen: { n: 4, md: 0, rows: [[0, 'nbrk/3p/P3/KRBN']] },
	standard: { n: 8, md: 0, rows: [[0, STD]] },
	smallcentered: { n: 5, md: 0, rows: [[0, 'rnkqr/ppppp/5/PPPPP/RQKNR']] },
	verysmall: { n: 4, md: 0, rows: [[0, 'nbrk/pppp/PPPP/KRBN']] },
	justknights: { n: 5, md: 0, rows: [[0, 'n1kn1/5/5/5/1NK1N']] },
	justunicorns: { n: 5, md: 0, rows: [[0, '1u1uk/5/5/5/KU1U1']] },
	justdragons: { n: 5, md: 0, rows: [[0, '2ddk/5/5/5/KDD2']] },
	justbrawns: { n: 5, md: 0, rows: [[0, 'wwwwk/5/5/5/KWWWW']] },
	kingofkings: { n: 5, md: 0, rows: [[0, 'cckcc/5/5/5/CCKCC']] },
	royalqueens: { n: 6, md: 0, rows: [[0, '4y1/6/6/6/6/1Y4']] },
	noqueens: { n: 7, md: 0, rows: [[0, 'rnbknbr/ppppppp/7/7/7/PPPPPPP/RNBKNBR']] },
	excessive: { n: 7, md: 0, rows: [[0, 'kruqdrk/rnbknbr/ppppppp/7/PPPPPPP/RNBKNBR/KRUQDRK']] },
	marauders: { n: 5, md: 2, rows: [[-1, 'wrkrw/1www1/5/5/5'], [0, 'w1w1w/5/5/5/W1W1W'], [1, '5/5/5/1WWW1/WRKRW']] },
	invasion: { n: 5, md: 1, rows: [[-1, 'nbkrb/ppppp/5/5/PPPPP'], [0, 'ppppp/5/5/PPPPP/NBKRB']] },
	turnzero: { n: 8, md: 0, rows: [[0, STD]], turnZero: true },
	twotimelines: { n: 8, md: 1, rows: [[-1, STD], [0, STD]] },
	princess: { n: 8, md: 0, rows: [[0, 'rnbskbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBSKBNR']] },
	reversed: { n: 8, md: 0, rows: [[0, 'rnbycbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBYCBNR']] },
	defended: { n: 8, md: 0, rows: [[0, 'rqbnkbnr/pppppppp/8/8/8/8/PPPPPPPP/RQBNKBNR']] },
	halfreflected: { n: 8, md: 0, rows: [[0, 'rnbkqbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR']] },
}
// travel reach (turns) when the option is 'auto': 2 on boards up to 5 x 5, 4 on larger boards
export const reachOf = (n, opt) => (opt === 'auto' || opt === undefined ? (n <= 5 ? 2 : 4) : Number(opt))

// FEN ranks top to bottom; allUnmoved marks K, R, P, W unmoved; '*' after a letter marks it unmoved (test helper)
export function fromFen(fen, n, allUnmoved = false) {
	const out = []
	fen.split('/').forEach((row, i) => {
		const y = n - 1 - i
		let x = 0
		for (const ch of row) {
			if (/\d/.test(ch)) {
				x += Number(ch)
				continue
			}
			if (ch === '*') {
				const last = out[out.length - 1]
				if ('krpw'.includes(last.t)) {
					last.t += '0'
				}
				continue
			}
			const side = ch === ch.toUpperCase() ? 0 : 1
			let t = ch.toLowerCase()
			if (allUnmoved && 'krpw'.includes(t)) {
				t += '0'
			}
			out.push({ x, y, t, side })
			x++
		}
	})
	return out
}

export function blankWorld({ n, h, m, md }) {
	const w = { sq: [], ty: [], sd: [], board: [], x: { n, h, m, md, s: 0, c: [0, 0], tl: [], ep: [], ord: [], nr: 0, k: -1 } }
	for (let u = 0; u < ROWS; u++) {
		w.x.tl.push(null)
		w.x.ep.push(-1)
		w.x.ord.push(-1)
	}
	return w
}
// a new storage row u: its creation index, the board array up to its squares, the ids of one more row
export function grow(w, u) {
	const x = w.x
	if (x.ord[u] < 0) {
		x.ord[u] = x.nr++
	}
	const nb = (u + 1) * SLOTS_MAX * 64
	while (w.board.length < nb) {
		w.board.push(-1)
	}
	const ni = x.nr * (x.h + 1) * x.n * x.n
	while (w.sq.length < ni) {
		w.sq.push(OFF)
		w.ty.push('')
		w.sd.push(0)
	}
}
export function place(w, id, sq, t, side) {
	w.sq[id] = sq
	w.ty[id] = t
	w.sd[id] = side
	w.board[sq] = id
}

export function setup(options = {}) {
	const S = SETUPS[options.setup ?? 'small']
	const h = 2 * reachOf(S.n, options.reach ?? 'auto')
	const w = blankWorld({ n: S.n, h, m: Number(options.timelines ?? 3), md: S.md })
	const x = w.x
	for (const [l, fen] of S.rows) {
		const u = uOf(l, S.md)
		grow(w, u)
		x.tl[u] = [S.turnZero ? 1 : 2, 2, null, null]
		for (const p of fromFen(fen, S.n, true)) {
			place(w, idOf(x, u, 0, p.x, p.y), sqOf(u, 0, p.x, p.y), p.t, p.side)
			if (S.turnZero) {
				// the T0 ● board (v = 1) in history: the same position
				const slot = 1 + (1 % h)
				place(w, idOf(x, u, slot, p.x, p.y), sqOf(u, slot, p.x, p.y), 'h' + p.t, p.side)
			}
		}
	}
	return w
}

// ------------------------------------------------------------------ skeleton (pure, from x)
const skelCache = new WeakMap()
export function skeleton(x) {
	let k = skelCache.get(x)
	if (k) {
		return k
	}
	const [l0, l1] = START[x.md]
	const act = (u) => {
		const l = lOf(u, x.md)
		return (l >= l0 && l <= l1) || (l > l1 ? l - l1 <= x.c[1] + 1 : l0 - l <= x.c[0] + 1)
	}
	let present = Infinity
	for (let u = 0; u < ROWS; u++) {
		if (x.tl[u] && act(u)) {
			present = Math.min(present, x.tl[u][1])
		}
	}
	k = { act, present }
	skelCache.set(x, k)
	return k
}
export const playable = (x, side, u) => x.tl[u] !== null && (x.tl[u][1] & 1) === side
export function mandatory(x) {
	const { act, present } = skeleton(x)
	const out = []
	if ((present & 1) !== x.s) {
		return out
	}
	for (let u = 0; u < ROWS; u++) {
		if (x.tl[u] && act(u) && x.tl[u][1] === present) {
			out.push(u)
		}
	}
	return out
}
export const canSubmit = (x) => (skeleton(x).present & 1) !== x.s
export function newRowFor(x, side) {
	const [l0, l1] = START[x.md]
	return uOf(side === 0 ? l1 + x.c[0] + 1 : l0 - x.c[1] - 1, x.md)
}
// board (u, v) stored? -> slot or -1. `pass` marks rows that are virtually passed (the phantom): their end is en + 1,
// with the same pieces as the stored latest board (slot 0).
export function slotAt(x, u, v, pass) {
	const e = x.tl[u]
	if (!e) {
		return -1
	}
	const en = pass && pass[u] ? e[1] + 1 : e[1]
	if (v < e[0] || v > en || en - v > x.h) {
		return -1
	}
	return v >= e[1] ? 0 : 1 + (v % x.h)
}
// the half-turn index of history slot `slot` of row u
export function vOfSlot(x, u, slot) {
	const [st, en] = x.tl[u]
	if (slot === 0) {
		return en
	}
	for (let v = en - 1; v >= Math.max(st, en - x.h); v--) {
		if (1 + (v % x.h) === slot) {
			return v
		}
	}
	return -1
}

// ------------------------------------------------------------------ move generation
// `pass`: the phantom (rows passed virtually); `noPrune`: ignore the computer's view; `onlyRoyal`: stop at the first
// capture of a royal piece and return it alone (the computer's fast threat test)
function genMoves(w, side, { pass = null, noPrune = false, onlyRoyal = false } = {}) {
	const x = w.x
	const n = x.n
	const out = []
	const canBranch = x.c[side] < x.m
	const mand = x.ai && !pass && !noPrune && !onlyRoyal ? new Set(mandatory(x)) : null
	const fy = side === 0 ? 1 : -1
	const fl = side === 0 ? -1 : 1
	const last = side === 0 ? n - 1 : 0
	for (let u = 0; u < ROWS; u++) {
		const e = x.tl[u]
		if (!e) {
			continue
		}
		const en = pass && pass[u] ? e[1] + 1 : e[1]
		if ((en & 1) !== side) {
			continue
		}
		const l0 = lOf(u, x.md)
		const pruned = mand !== null && mand.size > 0 && !mand.has(u)
		for (let y0 = 0; y0 < n; y0++) {
			for (let x0 = 0; x0 < n; x0++) {
				const from = sqOf(u, 0, x0, y0)
				const id = w.board[from]
				if (id < 0 || w.sd[id] !== side) {
					continue
				}
				const t = w.ty[id]
				const b = base(t)
				const target = (k, v) => {
					const tx = x0 + k * v[0]
					const ty = y0 + k * v[1]
					if (tx < 0 || ty < 0 || tx >= n || ty >= n) {
						return null
					}
					const l2 = l0 + k * v[3]
					const tu = uOf(l2, x.md)
					if (tu < 0 || tu >= ROWS) {
						return null
					}
					const tv = en + 2 * k * v[2]
					const slot = slotAt(x, tu, tv, pass)
					if (slot < 0) {
						return null
					}
					const ten = pass && pass[tu] ? x.tl[tu][1] + 1 : x.tl[tu][1]
					return { tu, tv, slot, tx, ty, sq: sqOf(tu, slot, tx, ty), latest: tv === ten }
				}
				const emit = (tg, capture, kind, promo) => {
					if (onlyRoyal && out.length) {
						return
					}
					const tr = tg.tu === u && tg.latest ? 0 : tg.latest ? 1 : 2
					const royalVictim = capture >= 0 && types[w.ty[capture]].royal
					if (onlyRoyal) {
						if (royalVictim) {
							out.push({ key: '!', from, to: tg.sq, id, capture, kind: 'danger' })
						}
						return
					}
					if (pruned && !royalVictim && !(tr === 1 && mand.has(tg.tu))) {
						return
					}
					let noRow = false
					if (tr === 2) {
						if (royalVictim) {
							noRow = true
						} else if (!canBranch) {
							return
						}
					}
					let key = boardText(x, u, en) + cellName(x0, y0)
					if (tr === 0) {
						key += '-' + cellName(tg.tx, tg.ty)
					} else {
						key += (tr === 1 ? '>' : '>>') + boardText(x, tg.tu, tg.tv) + cellName(tg.tx, tg.ty)
					}
					if (promo) {
						key += '=Q'
					}
					out.push({
						key, from, to: tg.sq, id, capture, promo: promo ? 'q' : null, drop: null,
						kind: kind ?? (tr === 0 ? 'normal' : tr === 1 ? 'hop' : 'branch'),
						extra: { u, tu: tg.tu, tv: tg.tv, tx: tg.tx, ty: tg.ty, noRow },
					})
				}
				if (RIDE[b]) {
					for (const vec of RIDE[b]) {
						for (let k = 1; ; k++) {
							const tg = target(k, vec)
							if (!tg) {
								break
							}
							const o = w.board[tg.sq]
							if (o < 0) {
								emit(tg, -1)
								continue
							}
							if (w.sd[o] !== side) {
								emit(tg, o)
							}
							break
						}
					}
				} else if (LEAP[b]) {
					for (const vec of LEAP[b]) {
						const tg = target(1, vec)
						if (!tg) {
							continue
						}
						const o = w.board[tg.sq]
						if (o < 0) {
							emit(tg, -1)
						} else if (w.sd[o] !== side) {
							emit(tg, o)
						}
					}
					if (t === 'k0' && !onlyRoyal && !pass && !pruned) {
						castling(w, side, u, en, x0, y0, id, out)
					}
				} else {
					// pawn p0 / p, brawn w0 / w: quiet steps along the rank and the timeline, doubles when unmoved
					const unmoved = t === 'p0' || t === 'w0'
					for (const q of [[0, fy, 0, 0], [0, 0, 0, fl]]) {
						const t1 = target(1, q)
						if (!t1 || w.board[t1.sq] >= 0) {
							continue
						}
						if (!onlyRoyal) {
							emit(t1, -1, null, q[1] !== 0 && t1.ty === last)
						}
						if (unmoved) {
							const t2 = target(2, q)
							if (t2 && w.board[t2.sq] < 0 && !onlyRoyal) {
								emit(t2, -1, q[1] !== 0 ? 'double' : null, q[1] !== 0 && t2.ty === last)
							}
						}
					}
					const caps = [[1, fy, 0, 0], [-1, fy, 0, 0], [0, 0, 1, fl], [0, 0, -1, fl]]
					if (b === 'w') {
						caps.push([1, 0, 0, fl], [-1, 0, 0, fl], [0, fy, 0, fl], [0, fy, -1, 0])
					}
					for (const c of caps) {
						const tg = target(1, c)
						if (!tg) {
							continue
						}
						const o = w.board[tg.sq]
						if (o >= 0 && w.sd[o] !== side) {
							emit(tg, o, null, c[1] !== 0 && tg.ty === last)
						}
					}
					// en passant: this board only, right after the enemy's physical double step
					const ep = x.ep[u]
					if (ep >= 0 && !pass && !onlyRoyal) {
						for (const dx of [1, -1]) {
							const tx = x0 + dx
							const ty = y0 + fy
							if (tx < 0 || tx >= n || ty * 8 + tx !== ep || w.board[sqOf(u, 0, tx, ty)] >= 0) {
								continue
							}
							const victim = w.board[sqOf(u, 0, tx, y0)]
							if (victim >= 0 && w.sd[victim] !== side && 'pw'.includes(base(w.ty[victim]))) {
								emit({ tu: u, tv: en, slot: 0, tx, ty, sq: sqOf(u, 0, tx, ty), latest: true }, victim, 'ep', false)
							}
						}
					}
				}
			}
		}
	}
	return out
}

function castling(w, side, u, en, x0, y0, id, out) {
	const x = w.x
	const n = x.n
	for (const dir of [1, -1]) {
		// the two squares next to the king must be empty, then the first piece met must be an unmoved own rook
		let xr = x0 + dir
		let empty = 0
		while (xr >= 0 && xr < n && w.board[sqOf(u, 0, xr, y0)] < 0) {
			xr += dir
			empty++
		}
		if (xr < 0 || xr >= n || empty < 2) {
			continue
		}
		const r = w.board[sqOf(u, 0, xr, y0)]
		if (w.sd[r] !== side || w.ty[r] !== 'r0') {
			continue
		}
		const kx = x0 + 2 * dir
		out.push({
			key: boardText(x, u, en) + cellName(x0, y0) + '-' + cellName(kx, y0),
			from: sqOf(u, 0, x0, y0), to: sqOf(u, 0, kx, y0), id, capture: -1, promo: null, drop: null, kind: 'castle',
			extra: { u, tu: u, tv: en, tx: kx, ty: y0, rook: { id: r, from: sqOf(u, 0, xr, y0), to: sqOf(u, 0, x0 + dir, y0) } },
		})
	}
}

// the phantom: the rows the side to move must still play are passed virtually (the official "check" test)
export function phantomPass(x) {
	const mand = new Set(mandatory(x))
	if (!mand.size) {
		return null
	}
	const pass = []
	for (let u = 0; u < ROWS; u++) {
		pass.push(mand.has(u))
	}
	return pass
}

export function generate(w, side) {
	const x = w.x
	if (side !== x.s) {
		// the danger list: the waiting side's real moves after the mover passed its must-move boards; flagged so that
		// apply leaves a world unchanged (royalDanger only reads their captures, mergeDanger their paths)
		const list = genMoves(w, side, { pass: phantomPass(x), noPrune: true })
		for (const m of list) {
			m.phantom = true
		}
		return list
	}
	const out = genMoves(w, side)
	if (canSubmit(x)) {
		out.push({ key: SUBMIT, from: -1, to: -1, id: -1, capture: -1, promo: null, drop: null, kind: 'submit', extra: {} })
	}
	return out
}

// ------------------------------------------------------------------ applying
export function clone(w) {
	return {
		sq: w.sq.slice(), ty: w.ty.slice(), sd: w.sd.slice(), board: w.board.slice(),
		x: { ...w.x, c: w.x.c.slice(), tl: w.x.tl.map((e) => (e ? e.slice() : null)), ep: w.x.ep.slice(), ord: w.x.ord.slice() },
	}
}

// the row's latest board becomes history (ring slot 1 + en % h); the row gets its next board with the same pieces
function advance(w, u) {
	const x = w.x
	const n = x.n
	const en = x.tl[u][1]
	const slot = 1 + (en % x.h)
	for (let y = 0; y < n; y++) {
		for (let xx = 0; xx < n; xx++) {
			const hs = sqOf(u, slot, xx, y)
			const hid = idOf(x, u, slot, xx, y)
			if (w.board[hs] >= 0) {
				w.sq[w.board[hs]] = OFF
				w.board[hs] = -1
			}
			const p = w.board[sqOf(u, 0, xx, y)]
			if (p >= 0) {
				place(w, hid, hs, 'h' + w.ty[p], w.sd[p])
			} else {
				w.ty[hid] = ''
				w.sd[hid] = 0
			}
		}
	}
	x.tl[u][1] = en + 1
	x.ep[u] = -1
}

function removeAt(w, sq) {
	const id = w.board[sq]
	if (id >= 0) {
		w.sq[id] = OFF
		w.board[sq] = -1
	}
	return id
}

// a new timeline for `side`: a copy of past board (tu, tv), without the piece on (skipX, skipY)
function openRow(w, side, tu, tv, skipX, skipY) {
	const x = w.x
	const n = x.n
	const nu = newRowFor(x, side)
	grow(w, nu)
	const slot = slotAt(x, tu, tv, null)
	for (let y = 0; y < n; y++) {
		for (let xx = 0; xx < n; xx++) {
			if (xx === skipX && y === skipY) {
				continue
			}
			const h = w.board[sqOf(tu, slot, xx, y)]
			if (h >= 0) {
				place(w, idOf(x, nu, 0, xx, y), sqOf(nu, 0, xx, y), live(w.ty[h]), w.sd[h])
			}
		}
	}
	x.tl[nu] = [tv + 1, tv + 1, tu, tv]
	x.ep[nu] = -1
	x.c[side]++
	return nu
}

function autoEnd(x) {
	for (let u = 0; u < ROWS; u++) {
		if (playable(x, x.s, u)) {
			return
		}
	}
	x.s = 1 - x.s
}

export function apply(w, m) {
	if (m.phantom) {
		return w
	}
	const next = clone(w)
	const x = next.x
	const side = x.s
	if (m.kind === 'submit') {
		x.s = 1 - side
		return next
	}
	const e = m.extra
	if (m.kind === 'branch') {
		const royalVictim = m.capture >= 0 && types[next.ty[m.capture]].royal
		const t = next.ty[m.id]
		// copy the past board first (it may be on the source row, in the slot the advance overwrites)
		const nu = e.noRow ? -1 : openRow(next, side, e.tu, e.tv, e.tx, e.ty)
		advance(next, e.u)
		removeAt(next, m.from)
		if (royalVictim) {
			x.k = side
		}
		if (nu >= 0) {
			place(next, m.id, sqOf(nu, 0, e.tx, e.ty), moved(t), side)
		} else {
			next.sq[m.id] = OFF // a royal branch: the traveller leaves its row and no row opens (the game ends)
		}
		autoEnd(x)
		return next
	}
	if (m.kind === 'hop') {
		advance(next, e.u)
		advance(next, e.tu)
		const t = next.ty[m.id]
		removeAt(next, m.from)
		const victim = removeAt(next, m.to)
		if (victim >= 0 && types[next.ty[victim]].royal) {
			x.k = side
		}
		place(next, m.id, m.to, m.promo ? 'q' : moved(t), side)
		autoEnd(x)
		return next
	}
	// physical (normal, double, ep, castle)
	advance(next, e.u)
	const t = next.ty[m.id]
	removeAt(next, m.from)
	if (m.capture >= 0) {
		if (types[next.ty[m.capture]].royal) {
			x.k = side
		}
		removeAt(next, next.sq[m.capture])
	}
	place(next, m.id, m.to, m.promo ? 'q' : moved(t), side)
	if (m.kind === 'castle') {
		const r = e.rook
		removeAt(next, r.from)
		place(next, r.id, r.to, 'r', side)
	}
	if (m.kind === 'double') {
		x.ep[e.u] = ((e.ty + decode(m.from).y) >> 1) * 8 + e.tx
	}
	autoEnd(x)
	return next
}

// the idle worlds get the same new boards, without the piece moving ("a move always makes its boards"); info.hit is
// ignored on purpose: a rolled Missed builds the boards too
export function applyMiss(w, action) {
	if (action.type === 'pass') {
		return w
	}
	const next = clone(w)
	const x = next.x
	const side = x.s
	if (action.type === 'move') {
		const m = action.sample
		if (m.kind === 'submit') {
			x.s = 1 - side
			return next
		}
		const e = m.extra
		if (m.kind === 'branch') {
			if (!e.noRow) {
				openRow(next, side, e.tu, e.tv, -1, -1)
			}
			advance(next, e.u)
		} else if (m.kind === 'hop') {
			advance(next, e.u)
			advance(next, e.tu)
		} else {
			advance(next, e.u)
		}
		autoEnd(x)
		return next
	}
	const f = decode(action.from[0])
	if (action.type === 'measure') {
		advance(next, f.u)
		autoEnd(x)
		return next
	}
	// split and merge: every part and target is on one board each (allowQuantum), so the first ones decide
	const t = decode(action.to[0])
	if (t.slot > 0) {
		openRow(next, side, t.u, vOfSlot(x, t.u, t.slot), -1, -1)
		advance(next, f.u)
	} else if (t.u !== f.u) {
		advance(next, f.u)
		advance(next, t.u)
	} else {
		advance(next, f.u)
	}
	autoEnd(x)
	return next
}

// the one new hook: splits land on one board, merges start from one board, measure only a part on a board you may play
export function allowQuantum(state, { type, from, to }) {
	const x = state.worlds[0].b.x
	const f = decode(from[0])
	if (f.slot !== 0) {
		return false
	}
	if (type === 'measure') {
		return playable(x, state.turn, f.u) && x.s === state.turn
	}
	if (type === 'merge') {
		const g = decode(from[1])
		return g.slot === 0 && g.u === f.u
	}
	const a = decode(to[0])
	const b = decode(to[1])
	return a.u === b.u && a.slot === b.slot
}

export function solidExtra(w) {
	const x = w.x
	return x.s + '/' + x.c[0] + ',' + x.c[1] + '/' + x.tl.map((e) => (e ? e[0] + '.' + e[1] : '')).join(';')
}

export function worldResult(w) {
	return w.x.k >= 0 ? { winner: w.x.k, reason: 'king' } : null
}

// a rook keeps 'r0' only while it is 'r0' on the same square in every world (docs/rules.md 5)
export function unifyWorlds(bs) {
	const b0 = bs[0]
	let lost = null
	for (let id = 0; id < b0.sq.length; id++) {
		let any = false
		let same = true
		for (const b of bs) {
			if (b.ty[id] === 'r0') {
				any = true
			}
			if (b.ty[id] !== 'r0' || b.sq[id] !== b0.sq[id] || b.sq[id] < 0) {
				same = false
			}
		}
		if (any && !same) {
			(lost ??= []).push(id)
		}
	}
	if (!lost) {
		return bs
	}
	return bs.map((b) => {
		if (!lost.some((id) => b.ty[id] === 'r0')) {
			return b
		}
		const ty = b.ty.slice()
		for (const id of lost) {
			if (ty[id] === 'r0') {
				ty[id] = 'r'
			}
		}
		return { ...b, ty }
	})
}

// ------------------------------------------------------------------ the stuck test (stateResult)
function afterBranch(x, side, m) {
	const y = { ...x, c: x.c.slice(), tl: x.tl.map((e) => (e ? e.slice() : null)) }
	if (!m.extra.noRow) {
		const nu = newRowFor(y, side)
		y.tl[nu] = [m.extra.tv + 1, m.extra.tv + 1, m.extra.tu, m.extra.tv]
		y.c[side]++
	}
	y.tl[m.extra.u][1] += 1
	return y
}
const superposedId = (state, id) => state.worlds.some(({ b }) => b.sq[id] !== state.worlds[0].b.sq[id])
export const stuckStats = { calls: 0, slow: 0, ms: 0 }
export function stuck(state) {
	const t0 = performance.now()
	stuckStats.calls++
	try {
		const b0 = state.worlds[0].b
		const x = b0.x
		const side = state.turn
		if (x.s !== side || canSubmit(x)) {
			return false
		}
		const mand = mandatory(x)
		const free = new Set()
		// quick: a departing key in the cached generation (pruning never removes keys of must-move boards)
		for (const { b } of state.worlds) {
			for (const m of cachedGen(V, b, side).values()) {
				if (m.kind !== 'submit' && m.kind !== 'castle' && m.kind !== 'ep') {
					free.add(m.extra.u)
				}
			}
			if (mand.every((u) => free.has(u))) {
				return false
			}
		}
		stuckStats.slow++
		// a measurable part on the board (a superposed own piece whose square holds only it): measuring uses the board
		for (const u of mand) {
			for (let c = 0; c < 64 && !free.has(u); c++) {
				const s = u * SLOTS_MAX * 64 + c
				const id = ownPieceAt(state, s)
				if (id >= 0 && superposedId(state, id)) {
					free.add(u)
				}
			}
		}
		// the unpruned union (castling and en passant only when every world has them)
		const union = new Map()
		const counts = new Map()
		for (const { b } of state.worlds) {
			for (const m of genMoves(b, side, { noPrune: true })) {
				if (!union.has(m.key)) {
					union.set(m.key, m)
				}
				counts.set(m.key, (counts.get(m.key) ?? 0) + 1)
			}
		}
		const legal = [...union.values()].filter((m) => (m.kind !== 'castle' && m.kind !== 'ep')
			|| counts.get(m.key) === state.worlds.length)
		for (const m of legal) {
			free.add(m.extra.u)
		}
		const Z = mand.filter((u) => !free.has(u))
		if (!Z.length) {
			return false
		}
		// a key that might capture an enemy royal piece: the player may still try it
		if (legal.some((m) => m.capture >= 0 && state.worlds.some(({ b }) => b.board[m.to] === m.capture
			&& types[b.ty[m.capture]]?.royal))) {
			return false
		}
		// a branch that changes the must-move boards (the present moves back, or a timeline becomes active)
		const zset = Z /* PATCH: a branch helps only when a stuck board stops being must-move */
		for (const m of legal) {
			if (m.kind === 'branch') {
				const y = afterBranch(x, side, m)
				if (canSubmit(y) || Z.some((z) => !mandatory(y).includes(z))) {
					return false
				}
			}
		}
		// every stuck board needs its own source board with a hop onto it (bipartite matching)
		const edges = new Map(Z.map((z) => [z, [...new Set(legal.filter((m) => m.kind === 'hop' && m.extra.tu === z
			&& !Z.includes(m.extra.u)).map((m) => m.extra.u))]]))
		const owner = new Map()
		const tryz = (z, seen) => {
			for (const src of edges.get(z)) {
				if (seen.has(src)) {
					continue
				}
				seen.add(src)
				if (!owner.has(src) || tryz(owner.get(src), seen)) {
					owner.set(src, z)
					return true
				}
			}
			return false
		}
		return !Z.every((z) => tryz(z, new Set()))
	} finally {
		stuckStats.ms += performance.now() - t0
	}
}
// checkmate needs a CERTAIN capture: royalDanger is the best single move (or merge) of the waiting side
const endResult = (state) => (royalDanger(V, state, state.turn) >= 1
	? { winner: 1 - state.turn, reason: 'checkmate' }
	: { winner: null, reason: 'stalemate' })

// the strand warning (the proposed UI hook moveWarning): would some outcome of this move end the game as stuck?
export function moveWarning(state, code) {
	const list = branches(V, state, code)
	if (!list) {
		return null
	}
	let worst = null
	for (const br of list) {
		const next = stateAfter(V, state, code, br, list, { light: true })
		if (next.result && (next.result.reason === 'checkmate' || next.result.reason === 'stalemate')) {
			worst = next.result.reason === 'checkmate' || !worst ? next.result.reason : worst
		}
	}
	return worst
}

// ------------------------------------------------------------------ computer player
export const EVAL = { check: 3000, threat: 6000, timeline: 100, contempt: 200 }
function evaluate(w, side) {
	const x = w.x
	const moverSafe = genMoves(w, 1 - x.s, { pass: phantomPass(x), onlyRoyal: true }).length === 0
	const waiterSafe = genMoves(w, x.s, { onlyRoyal: true }).length === 0
	let score = EVAL.contempt
	if (x.s === side) {
		score += (moverSafe ? 0 : -EVAL.check) + (waiterSafe ? 0 : EVAL.threat)
	} else {
		score += (waiterSafe ? 0 : -EVAL.threat) + (moverSafe ? 0 : EVAL.check)
	}
	score += EVAL.timeline * Math.max(-2, Math.min(2, x.c[1 - side] - x.c[side]))
	return score
}

// the computer searches a copy whose worlds carry x.ai: generate then keeps the must-move boards' moves, and from the
// other boards only royal captures and hops onto a must-move board (a key is kept in every world or in none)
export function aiView(state) {
	const x = state.worlds[0].b.x
	const mand = mandatory(x)
	let optional = 0
	for (let u = 0; u < ROWS; u++) {
		if (playable(x, x.s, u) && !mand.includes(u)) {
			optional++
		}
	}
	if (!mand.length || !optional) {
		return state
	}
	return { ...state, worlds: state.worlds.map(({ b, w }) => ({ b: { ...b, x: { ...b.x, ai: 1 } }, w })) }
}

export function replySide(s, me) {
	if (globalThis.process?.env?.MVQ_REPLY === 'cont') {
		return s.turn
	}
	return s.turn === me ? null : s.turn
}

// ------------------------------------------------------------------ records and texts
// absolute text of a square: (label T turn)cell, from the skeleton before the move
export function squareText(x, sq) {
	const d = decode(sq)
	const v = d.slot === 0 ? x.tl[d.u][1] : vOfSlot(x, d.u, d.slot)
	return boardText(x, d.u, v) + cellName(d.x, d.y)
}
export function codeTextOf(x, code) {
	if (code === SUBMIT) {
		return 'Submit'
	}
	const mv = parseCode(V, code)
	if (!mv || mv.type === 'move') {
		return code
	}
	const s = (q) => squareText(x, q)
	if (mv.type === 'measure') {
		return 'Measure ' + s(mv.from[0])
	}
	if (mv.type === 'split') {
		return s(mv.from[0]) + ' split ' + s(mv.to[0]) + ' | ' + s(mv.to[1])
	}
	return s(mv.from[0]) + ' | ' + s(mv.from[1]) + ' merge ' + s(mv.to[0])
}

export function recordInfo(prev, code, branch, next) {
	const a = prev.worlds[0].b.x
	const b = next.worlds[0].b.x
	const rows = []
	for (let u = 0; u < ROWS; u++) {
		if (!a.tl[u] && b.tl[u]) {
			rows.push(u)
		}
	}
	const mv = parseCode(V, code)
	let from = []
	let to = []
	if (mv?.type === 'move' && code !== SUBMIT) {
		const m = prev.worlds.map(({ b: w }) => cachedGen(V, w, prev.turn).get(code)).find(Boolean)
		if (m && m.from >= 0) {
			from = [m.from]
			to = [m.to]
		}
	} else if (mv && mv.type !== 'measure' && mv.type !== 'move') {
		from = mv.from
		to = mv.to
	}
	const arrows = []
	if (branch.key !== 'miss') {
		for (const f of from) {
			const df = decode(f)
			for (const t of to) {
				const dt = decode(t)
				if (dt.u === df.u && dt.slot === 0) {
					continue
				}
				const src = [df.u, a.tl[df.u][1], df.x, df.y]
				const dst = dt.slot > 0
					? [rows[0] ?? dt.u, vOfSlot(a, dt.u, dt.slot) + 1, dt.x, dt.y]
					: [dt.u, a.tl[dt.u][1] + 1, dt.x, dt.y]
				arrows.push([...src, ...dst])
			}
		}
	}
	const text = mv && mv.type !== 'move' ? codeTextOf(a, code) : null
	// which-path memory: after a merge, the latest past board on which the possibilities still differ
	let memory = null
	if (mv?.type === 'merge' && next.worlds.length > 1) {
		let best = null
		for (let u = 0; u < ROWS; u++) {
			const e = b.tl[u]
			if (!e) {
				continue
			}
			for (let v = Math.max(e[0], e[1] - b.h); v < e[1]; v++) {
				const slot = 1 + (v % b.h)
				let differs = false
				for (let c = 0; c < 64 && !differs; c++) {
					const q = sqOf(u, slot, c % 8, c >> 3)
					const b0 = next.worlds[0].b
					const k0 = b0.board[q] >= 0 ? b0.sd[b0.board[q]] + b0.ty[b0.board[q]] : ''
					differs = next.worlds.some(({ b: w }) => (w.board[q] >= 0 ? w.sd[w.board[q]] + w.ty[w.board[q]] : '') !== k0)
				}
				if (differs && (!best || v - e[1] > best[1] - b.tl[best[0]][1])) {
					best = [u, v]
				}
			}
		}
		memory = best
	}
	const present = skeleton(b).present < skeleton(a).present ? skeleton(b).present : null
	return rows.length || arrows.length || text || present !== null || memory
		? { rows, arrows, ...(text ? { text } : {}), ...(present !== null ? { back: present } : {}), ...(memory ? { memory } : {}) }
		: null
}

export function budgetRule() {
	return { limit: 8 }
}

// ------------------------------------------------------------------ the variant
export const spec = {
	id: 'multiverse',
	category: 'dimensions',
	sides: [{ id: 'w', name: () => 'White', color: 'white', rotate: 0 }, { id: 'b', name: () => 'Black', color: 'black', rotate: 0 }],
	topology,
	types,
	options: [
		{ id: 'setup', type: 'choice', default: 'small', values: Object.keys(SETUPS).map((id) => ({ id, label: () => id })) },
		{ id: 'timelines', type: 'choice', default: '3', values: ['1', '2', '3'].map((id) => ({ id, label: () => id })) },
		{ id: 'reach', type: 'choice', default: 'auto', values: ['auto', '2', '4'].map((id) => ({ id, label: () => id })) },
	],
	setup,
	rules: () => [],
	generate,
	apply,
	applyMiss,
	allowQuantum,
	solidExtra,
	nextSide: (w) => w.x.s,
	worldResult,
	actions: () => [{ code: SUBMIT, label: 'Submit turn' }],
	noMoves: (state) => endResult(state),
	stateResult: (state) => (stuck(state) ? endResult(state) : null),
	unifyWorlds,
	evaluate,
	aiView,
	replySide,
	recordInfo,
	budgetRule,
	bareKingsDraw: false,
	drawsWait: true,
	specialMoves: true,
	maxPly: 1200,
	quietPlies: 300,
}
export const V = defineVariant(spec)
export default V

// ------------------------------------------------------------------ test helper: a world from board strings
// rows: { l: { st, en, parent: [u, v], boards: { v: fen } } }; unlisted stored boards are empty; '*' = unmoved
export function buildWorld({ n = 5, h = 4, m = 3, md = 0, s = 0, c = [0, 0], rows }) {
	const w = blankWorld({ n, h, m, md })
	w.x.s = s
	w.x.c = c.slice()
	for (const ls of Object.keys(rows).sort((a, b) => Number(a) - Number(b))) {
		grow(w, uOf(Number(ls), md))
	}
	for (const [ls, r] of Object.entries(rows)) {
		const u = uOf(Number(ls), md)
		w.x.tl[u] = [r.st, r.en, r.parent?.[0] ?? null, r.parent?.[1] ?? null]
		for (const [vs, fen] of Object.entries(r.boards)) {
			const v = Number(vs)
			const slot = v === r.en ? 0 : 1 + (v % h)
			for (const { x, y, t, side } of fromFen(fen, n)) {
				place(w, idOf(w.x, u, slot, x, y), sqOf(u, slot, x, y), slot ? 'h' + t : t, side)
			}
		}
	}
	return w
}
