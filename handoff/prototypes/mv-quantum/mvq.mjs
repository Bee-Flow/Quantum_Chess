// Prototype of the "multiverse" variant, design lens "quantum" (handoff/research/multiverse-design-quantum.md).
// Validation and measurement only; not production code (no JSDoc, no translations). Runs on core/, a snapshot of the
// working-tree core (with applyMiss, Q2, Q6, Q7, Q9, Q14, U3) plus the one proposed hook allowQuantum and the
// perWorldMerge bug fix (search core/quantum.mjs for PROTOTYPE PATCH).
//
// World: live boards and a ring of H history boards per timeline are REAL squares with piece ids, so the core sees
// the past (land = roll in the past, certainly-empty split targets on a past board, ghosts drawn on history boards).
// Square: sq = ((u * SLOTS) + slot) * 64 + y * 8 + x   (u = zig-zag row, slot 0 = live board, 1..H = ring)
// Id:     id = ((u * SLOTS) + slot) * n * n + y * n + x (compact; live ids are given at row creation and then travel
//         with the piece; history ids belong to their history cell)
import { makeTopology, directions, allDirections, symmetric } from './core/topology.mjs'
import { defineVariant } from './core/variant.mjs'
import { royalDanger, parseCode, ordinaryMoves } from './core/quantum.mjs'

export const H = 4 // history boards per timeline (two full turns)
export const SLOTS = H + 1
export const ROWS = 7 // capacity: L-3 .. L+3
export const OFF = -1
const FILES = 'abcdefgh'
// capacity of one board in the square space: 8 (every setup) or 5 (small setups only); env MVQ_B for measurements
export const BC = Number(globalThis.process?.env?.MVQ_B ?? 8)
export const STRIDE = BC * BC

export const uOf = (L) => (L > 0 ? 2 * L - 1 : L < 0 ? -2 * L : 0)
export const LOf = (u) => (u === 0 ? 0 : u % 2 === 1 ? (u + 1) / 2 : -u / 2)
export const sqOf = (u, slot, x, y) => (u * SLOTS + slot) * STRIDE + y * BC + x
export const idOf = (n, u, slot, x, y) => (u * SLOTS + slot) * n * n + y * n + x
export const decode = (sq) => {
	const cell = sq % STRIDE
	const b = Math.floor(sq / STRIDE)
	return { u: Math.floor(b / SLOTS), slot: b % SLOTS, x: cell % BC, y: Math.floor(cell / BC) }
}
const Lname = (L) => (L === 0 ? '0' : L > 0 ? '+' + L : '−' + -L)
const Lkey = (L) => (L > 0 ? '+' + L : String(L))
const cellName = (x, y) => FILES[x] + (y + 1)

// ------------------------------------------------------------------ static topology (names for codes)
const coords = []
for (let u = 0; u < ROWS; u++) {
	for (let slot = 0; slot < SLOTS; slot++) {
		for (let y = 0; y < BC; y++) {
			for (let x = 0; x < BC; x++) {
				coords.push([x, y, slot, u])
			}
		}
	}
}
export const topology = makeTopology({
	coords,
	name: ([x, y, slot, u]) => 'L' + Lname(LOf(u)) + (slot ? '~' + slot : '') + ':' + cellName(x, y),
	cell: ([x, y, slot, u]) => ({ x: slot * 9 + x, y: u * 9 + 7 - y, w: 1, h: 1, shape: 'rect', shade: 'light' }),
})

// ------------------------------------------------------------------ pieces
const usable = (v) => !(v[3] === 0 && v[2] > 0) // same timeline, forward in time: never a board
const ROOK = directions(4, 1).filter(usable)
const BISHOP = directions(4, 2).filter(usable)
const QUEEN = allDirections(4).filter(usable)
const KNIGHT = symmetric([2, 1], 4).filter(usable)
const base = (t) => (t[0] === 'h' ? t.slice(1) : t).replace('0', '')
const RIDE = { q: QUEEN, r: ROOK, b: BISHOP }
const LEAP = { k: QUEEN, n: KNIGHT }
const VALUES = { k: 0, q: 1100, r: 400, b: 450, n: 450, p: 100 }
const SPRITE = { k: 'k', q: 'q', r: 'r', b: 'b', n: 'n', p: 'p' }

const types = {}
for (const t of ['k', 'k0', 'q', 'r', 'r0', 'b', 'n', 'p', 'p0']) {
	const b = base(t)
	const royal = b === 'k'
	const solid = royal || b === 'p'
	types[t] = { name: () => b, moves: [], royal, solid, splittable: !solid, value: VALUES[b], glyph: { sprite: SPRITE[b] } }
	// the same piece on a history board: never moves, worth nothing to the computer, still royal / solid
	types['h' + t] = { name: () => b, moves: [], royal, solid, splittable: false, value: 0, glyph: { sprite: SPRITE[b] } }
}
const live = (t) => (t[0] === 'h' ? t.slice(1) : t)
const moved = (t) => t.replace('0', '')

// ------------------------------------------------------------------ setups
export const SETUPS = {
	small: { n: 5, fen: 'kqbnr/ppppp/5/PPPPP/KQBNR' },
	centered: { n: 5, fen: 'rnkqr/ppppp/5/PPPPP/RQKNR' },
	open4: { n: 4, fen: 'nbrk/3p/P3/KRBN' },
	knights: { n: 5, fen: 'n1kn1/5/5/5/1NK1N' },
	standard: { n: 8, fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR' },
}

function grow(w, u) {
	const n = w.x.n
	const nb = (u + 1) * SLOTS * STRIDE
	while (w.board.length < nb) {
		w.board.push(-1)
	}
	const ni = (u + 1) * SLOTS * n * n
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

// FEN ranks top to bottom; '*' after K, R or P = never moved (5DFEN); allUnmoved marks every K, R, P unmoved
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
				if ('krp'.includes(last.t)) {
					last.t += '0'
				}
				continue
			}
			const side = ch === ch.toUpperCase() ? 0 : 1
			let t = ch.toLowerCase()
			if (allUnmoved && 'krp'.includes(t)) {
				t += '0'
			}
			out.push({ x, y, t, side })
			x++
		}
	})
	return out
}

export function blankWorld(n, m) {
	const w = { sq: [], ty: [], sd: [], board: [], x: { n, m, s: 0, c: [0, 0], tl: [], ep: [], k: -1 } }
	for (let u = 0; u < ROWS; u++) {
		w.x.tl.push(null)
		w.x.ep.push(-1)
	}
	return w
}

export function setup(options = {}) {
	const S = SETUPS[options.setup ?? 'small']
	const m = Number(options.timelines ?? 2)
	const w = blankWorld(S.n, m)
	grow(w, 0)
	for (const { x, y, t, side } of fromFen(S.fen, S.n, true)) {
		place(w, idOf(S.n, 0, 0, x, y), sqOf(0, 0, x, y), t, side)
	}
	w.x.tl[0] = [0, 0, null, null]
	return w
}

// ------------------------------------------------------------------ skeleton (pure, from x)
export function skeleton(x) {
	const tl = x.tl
	const act = (u) => {
		if (u === 0) {
			return true
		}
		const L = LOf(u)
		return L > 0 ? L <= x.c[1] + 1 : -L <= x.c[0] + 1
	}
	let present = Infinity
	for (let u = 0; u < ROWS; u++) {
		if (tl[u] && act(u)) {
			present = Math.min(present, tl[u][1])
		}
	}
	return { act, present }
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
export const T = (v) => (v >> 1) + 1
const boardKey = (u, v) => '(' + Lkey(LOf(u)) + 'T' + T(v) + ')'

// board (u, v) stored? -> slot or -1. `pass` = the rows that are virtually passed (phantom), with end + 1.
function slotAt(x, u, v, pass) {
	const e = x.tl[u]
	if (!e) {
		return -1
	}
	const en = pass && pass[u] ? e[1] + 1 : e[1]
	if (v < e[0] || v > en || en - v > H) {
		return -1
	}
	return v === en ? 0 : 1 + (v % H)
}
// the half-turn index of a history slot of row u (the stored board with v % H === slot - 1)
export function vOfSlot(x, u, slot) {
	const en = x.tl[u][1]
	if (slot === 0) {
		return en
	}
	for (let v = en - 1; v >= en - H; v--) {
		if (v >= 0 && v % H === slot - 1) {
			return v
		}
	}
	return -1
}

// ------------------------------------------------------------------ move generation
function newRowFor(x, side) {
	return uOf(side === 0 ? x.c[0] + 1 : -(x.c[1] + 1))
}

function genMoves(w, side, pass, onlyRoyal) {
	const x = w.x
	const n = x.n
	const out = []
	const canBranch = x.c[side] < x.m
	// the computer's view (aiView): from boards that are not mandatory only king captures and hops onto a mandatory
	// board (skeleton and solid kings only, so a key is kept in every world or in none)
	const mand = x.ai && !onlyRoyal && !pass ? new Set(mandatory(x)) : null
	const fy = side === 0 ? 1 : -1
	const fl = side === 0 ? -1 : 1
	for (let u = 0; u < ROWS; u++) {
		const e = x.tl[u]
		if (!e) {
			continue
		}
		const en = pass && pass[u] ? e[1] + 1 : e[1]
		if ((en & 1) !== side) {
			continue
		}
		const L0 = LOf(u)
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
				// target of step k along vec, or null
				const target = (k, vx, vy, vt, vl) => {
					const tx = x0 + k * vx
					const ty = y0 + k * vy
					if (tx < 0 || ty < 0 || tx >= n || ty >= n) {
						return null
					}
					const L = L0 + k * vl
					if (L < -3 || L > 3) {
						return null
					}
					const tu = uOf(L)
					const tv = en + 2 * k * vt
					const slot = slotAt(x, tu, tv, pass)
					if (slot < 0) {
						return null
					}
					return { tu, tv, slot, tx, ty, sq: sqOf(tu, slot, tx, ty) }
				}
				const emit = (tg, capture, kind, promo) => {
					const tr = tg.tu === u && tg.slot === 0 ? 0 : tg.slot === 0 ? 1 : 2
					const royalVictim = capture >= 0 && types[w.ty[capture]].royal
					if (onlyRoyal) {
						if (royalVictim) {
							out.push({ key: '†', from, to: tg.sq, id: -1, capture, promo: null, drop: null, kind: 'danger' })
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
					let key = boardKey(u, en) + cellName(x0, y0)
					if (tr === 0) {
						key += '-' + cellName(tg.tx, tg.ty)
					} else {
						key += (tr === 1 ? '>' : '>>') + boardKey(tg.tu, tg.tv) + cellName(tg.tx, tg.ty)
					}
					if (promo) {
						key += '=q'
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
							const tg = target(k, vec[0], vec[1], vec[2], vec[3])
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
						const tg = target(1, vec[0], vec[1], vec[2], vec[3])
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
				} else if (b === 'p') {
					const last = side === 0 ? n - 1 : 0
					// quiet steps: rank and timeline, doubles for an unmoved pawn
					for (const [vy, vl] of [[fy, 0], [0, fl]]) {
						const t1 = target(1, 0, vy, 0, vl)
						if (!t1 || w.board[t1.sq] >= 0) {
							continue
						}
						if (!onlyRoyal) {
							emit(t1, -1, vy ? 'normal' : undefined, vy && t1.ty === last && t1.slot === 0 && t1.tu === u)
						}
						if (t === 'p0') {
							const t2 = target(2, 0, vy, 0, vl)
							if (t2 && w.board[t2.sq] < 0 && !onlyRoyal) {
								emit(t2, -1, vy ? 'double' : undefined, vy && t2.ty === last && t2.tu === u)
							}
						}
					}
					for (const [vx, vy, vt, vl] of [[1, fy, 0, 0], [-1, fy, 0, 0], [0, 0, 1, fl], [0, 0, -1, fl]]) {
						const tg = target(1, vx, vy, vt, vl)
						if (!tg) {
							continue
						}
						const o = w.board[tg.sq]
						if (o >= 0 && w.sd[o] !== side) {
							emit(tg, o, undefined, vy !== 0 && tg.ty === last && tg.tu === u && tg.slot === 0)
						} else if (o < 0 && vy !== 0 && !pass && x.ep[u] === tg.ty * 8 + tg.tx && tg.tu === u && tg.slot === 0) {
							// en passant on this board only
							const victim = w.board[sqOf(u, 0, tg.tx, y0)]
							if (victim >= 0 && w.sd[victim] !== side && !onlyRoyal) {
								emit(tg, victim, 'ep')
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
	const n = w.x.n
	for (const dir of [1, -1]) {
		// the two squares next to the king must be empty, then the first piece must be an unmoved own rook
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
			key: boardKey(u, en) + cellName(x0, y0) + '-' + cellName(kx, y0),
			from: sqOf(u, 0, x0, y0), to: sqOf(u, 0, kx, y0), id, capture: -1, promo: null, drop: null, kind: 'castle',
			extra: { u, tu: u, tv: en, tx: kx, ty: y0, rook: { id: r, from: sqOf(u, 0, xr, y0), to: sqOf(u, 0, x0 + dir, y0) } },
		})
	}
}

export const SUBMIT = 'submit'

export function generate(w, side) {
	const x = w.x
	if (side !== x.s) {
		// phantom: the mover passes every board it may still play; the danger list holds one royal capture, if any
		const pass = []
		for (let u = 0; u < ROWS; u++) {
			pass.push(playable(x, x.s, u))
		}
		const list = genMoves(w, side, pass, true)
		return list.length ? [list[0]] : []
	}
	const out = genMoves(w, side, null, false)
	if (canSubmit(x)) {
		out.push({ key: SUBMIT, from: -1, to: -1, id: -1, capture: -1, promo: null, drop: null, kind: 'submit' })
	}
	return out
}

// ------------------------------------------------------------------ applying
export function clone(w) {
	return {
		sq: w.sq.slice(), ty: w.ty.slice(), sd: w.sd.slice(), board: w.board.slice(),
		x: { ...w.x, c: w.x.c.slice(), tl: w.x.tl.map((e) => (e ? e.slice() : null)), ep: w.x.ep.slice() },
	}
}

// the row's latest board becomes history; the row gets its next board (the same pieces, the same ids)
function advance(w, u) {
	const x = w.x
	const n = x.n
	const en = x.tl[u][1]
	const slot = 1 + (en % H)
	for (let y = 0; y < n; y++) {
		for (let xx = 0; xx < n; xx++) {
			const hs = sqOf(u, slot, xx, y)
			const hid = idOf(n, u, slot, xx, y)
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
				place(w, idOf(n, nu, 0, xx, y), sqOf(nu, 0, xx, y), live(w.ty[h]), w.sd[h])
			}
		}
	}
	x.tl[nu] = [tv + 1, tv + 1, LOf(tu), tv]
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
	const next = clone(w)
	const x = next.x
	const side = x.s
	if (m.kind === 'submit') {
		x.s = 1 - side
		return next
	}
	const e = m.extra
	if (m.kind === 'branch') {
		// read the past board before the source row advances (it may be the same row)
		const victim = m.capture
		const royalVictim = victim >= 0 && types[next.ty[victim]].royal
		const t = next.ty[m.id]
		// copy first (into a brand-new row), then advance the source row
		let nu = -1
		if (!e.noRow) {
			nu = openRow(next, side, e.tu, e.tv, e.tx, e.ty)
		}
		advance(next, e.u)
		removeAt(next, m.from)
		if (royalVictim) {
			x.k = side
		}
		if (nu >= 0) {
			place(next, m.id, sqOf(nu, 0, e.tx, e.ty), moved(t), side)
		} else {
			next.sq[m.id] = OFF
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
		place(next, m.id, m.to, moved(t), side)
		autoEnd(x)
		return next
	}
	// physical (normal, double, ep, castle)
	advance(next, e.u)
	const t = next.ty[m.id]
	removeAt(next, m.from)
	if (m.capture >= 0) {
		const vs = next.sq[m.capture]
		if (types[next.ty[m.capture]].royal) {
			x.k = side
		}
		removeAt(next, vs)
	}
	place(next, m.id, m.to, m.promo ? 'q' : moved(t), side)
	if (m.kind === 'castle') {
		const r = m.extra.rook
		removeAt(next, r.from)
		place(next, r.id, r.to, 'r', side)
	}
	if (m.kind === 'double') {
		x.ep[e.u] = ((e.ty + decode(m.from).y) >> 1) * 8 + e.tx
	}
	autoEnd(x)
	return next
}

// the missed worlds get the same new boards, without the piece moving ("the structure follows the move")
export function applyMiss(w, action) {
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
	// split, merge, measure: the structure of the quiet move from the first square to the first target
	const f = decode(action.from[0])
	if (action.type === 'measure') {
		advance(next, f.u)
		autoEnd(x)
		return next
	}
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

// split and merge squares on one board; measure a part on a board you may play
export function allowQuantum(state, mv) {
	const x = state.worlds[0].b.x
	const f = decode(mv.from[0])
	if (f.slot !== 0 || !playable(x, x.s, f.u)) {
		return false
	}
	if (mv.type === 'measure') {
		return true
	}
	if (mv.type === 'merge') {
		const f2 = decode(mv.from[1])
		return f2.slot === 0 && f2.u === f.u
	}
	const a = decode(mv.to[0])
	const b = decode(mv.to[1])
	if (a.u !== b.u || a.slot !== b.slot) {
		return false
	}
	return true
}

export function solidExtra(w) {
	const x = w.x
	return x.s + '/' + x.c[0] + ',' + x.c[1] + '/' + x.tl.map((e) => (e ? e[0] + '.' + e[1] : '')).join(';')
}

export function worldResult(w) {
	return w.x.k >= 0 ? { winner: w.x.k, reason: 'king' } : null
}

// ------------------------------------------------------------------ computer player
function evaluate(w, side) {
	// history pieces are worth 0 (their types). Kings: a king that can be captured after the mover passes (the 5D
	// "check") or by the side to move is nearly lost; the timeline advantage is worth a little.
	const x = w.x
	const pass = []
	for (let u = 0; u < ROWS; u++) {
		pass.push(playable(x, x.s, u))
	}
	const moverSafe = genMoves(w, 1 - x.s, pass, true).length === 0 // after the mover passes
	const waiterSafe = genMoves(w, x.s, null, true).length === 0 // the mover to play now
	let score = 0
	if (x.s === side) {
		score += (moverSafe ? 0 : -EVAL.check) + (waiterSafe ? 0 : EVAL.threat)
	} else {
		score += (waiterSafe ? 0 : -EVAL.threat) + (moverSafe ? 0 : EVAL.check)
	}
	score += EVAL.timeline * Math.max(-2, Math.min(2, x.c[1 - side] - x.c[side]))
	return score
}
export const EVAL = { check: 3000, threat: 6000, timeline: 60 }

// the computer searches a copy whose worlds carry x.ai: generate then keeps the mandatory boards (see genMoves)
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

// inside my own turn there is no answer yet: the evaluation (with the 5D check term) decides; after the turn ends,
// the opponent answers. MVQ_REPLY=cont keeps the core default (my best continuation).
export function replySide(s, me) {
	if (globalThis.process?.env?.MVQ_REPLY === 'cont') {
		return s.turn
	}
	return s.turn === me ? null : s.turn
}

// the history record keeps the travel of the move in absolute board coordinates [u, v, x, y] (the board the piece
// left, the board it arrived on), so the layout can draw arrows while the boards are shown. Nothing for a move on one
// board, a measurement and a rolled Missed (no piece travelled in any remaining possibility).
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
	if (mv?.type === 'move') {
		const m = ordinaryMoves(V, prev).find((o) => o.code === code)
		if (m && m.from >= 0) {
			from = [m.from]
			to = [m.to]
		}
	} else if (mv && mv.type !== 'measure') {
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
					? [rows[0], vOfSlot(a, dt.u, dt.slot) + 1, dt.x, dt.y]
					: [dt.u, a.tl[dt.u][1] + 1, dt.x, dt.y]
				arrows.push([...src, ...dst])
			}
		}
	}
	return rows.length || arrows.length ? { rows, arrows } : null
}

// the quantum budget: 8 on the small boards with at most 2 new timelines each, 4 on 8 x 8 or with 3 (state size)
export function budgetRule(b) {
	return { limit: b.x.n <= 5 && b.x.m <= 2 ? 8 : 4 }
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
		{ id: 'timelines', type: 'choice', default: '2', values: ['1', '2', '3'].map((id) => ({ id, label: () => id })) },
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
	noMoves: (state) => (royalDanger(V, state, state.turn) >= 1 ? { winner: 1 - state.turn, reason: 'stuck' } : { winner: null, reason: 'noMoves' }),
	evaluate,
	aiView,
	replySide,
	recordInfo,
	budgetRule,
	maxPly: 1200,
	quietPlies: 300,
}
export const V = defineVariant(spec)
export default V

// ------------------------------------------------------------------ test helper: a world from board strings
// rows: { L: { st, en, boards: { v: fen } } } ; unlisted stored boards are empty
export function buildWorld({ n = 5, m = 2, s = 0, c = [0, 0], rows }) {
	const w = blankWorld(n, m)
	w.x.s = s
	w.x.c = c.slice()
	let maxU = 0
	for (const L of Object.keys(rows)) {
		maxU = Math.max(maxU, uOf(Number(L)))
	}
	grow(w, maxU)
	for (const [Ls, r] of Object.entries(rows)) {
		const L = Number(Ls)
		const u = uOf(L)
		w.x.tl[u] = [r.st, r.en, r.parent?.[0] ?? null, r.parent?.[1] ?? null]
		for (const [vs, fen] of Object.entries(r.boards)) {
			const v = Number(vs)
			const slot = v === r.en ? 0 : 1 + (v % H)
			for (const { x, y, t, side } of fromFen(fen, n)) {
				const id = idOf(n, u, slot, x, y)
				place(w, id, sqOf(u, slot, x, y), slot ? 'h' + t : t, side)
			}
		}
	}
	return w
}
