// Prototype of the "faithful" multiverse variant (Quantum 5D chess), wired to a patched copy of the real core
// (./core, built by patch-core.mjs). Not production code: it validates the design in
// handoff/research/multiverse-design-faithful.md (encoding, rules, hooks, sizes, speed).
//
// World: { sq, ty, sd, board, x }
//   live squares (static, 13 label blocks x 64 cells):  block * 64 + y * 8 + x
//   history squares (per game, after LIVE):             LIVE + (slot * HB + v % HB) * N * N + y * N + x
//   ids 0..31: history markers (side * 16 + type index, sq = -1); live ids 32 + slot * N * N + cell
//   x = { g: [N, HB, M, mode], s, r: [[l, st, en, pl, pv]], ep: [cell | -1], k }
import { makeTopology } from '/home/tom/Projects/Quantum_Chess/Quantum_Chess/src/variants/core/topology.js'
import { defineVariant } from '/home/tom/Projects/Quantum_Chess/Quantum_Chess/src/variants/core/variant.js'
import { royalDanger, T as TOTAL } from './core/quantum.mjs'
import { generate as cachedGenerate } from '/home/tom/Projects/Quantum_Chess/Quantum_Chess/src/variants/core/world.js'

export const MINUS = '−'
export const LABELS = ['0', '+0', MINUS + '0', '+1', MINUS + '1', '+2', MINUS + '2', '+3', MINUS + '3', '+4', MINUS + '4', '+5', MINUS + '5']
export const LIVE = LABELS.length * 64
export const TYPES = ['k0', 'k', 'c', 'y', 'q', 's', 'r0', 'r', 'b', 'n', 'u', 'd', 'p0', 'p', 'w0', 'w']
const TI = Object.fromEntries(TYPES.map((t, i) => [t, i]))
const ROYAL = new Set(['k0', 'k', 'y'])
const SOLID = new Set(['k0', 'k', 'y', 'c', 'p0', 'p', 'w0', 'w'])
const MOVED = { k0: 'k', r0: 'r', p0: 'p', w0: 'w' }
export const MARKERS = 32
const FILES = 'abcdefgh'
const LETTER = { k0: 'K', k: 'K', c: 'C', y: 'Y', q: 'Q', s: 'S', r0: 'R', r: 'R', b: 'B', n: 'N', u: 'U', d: 'D', p0: 'P', p: 'P', w0: 'W', w: 'W' }
export const SUBMIT = '↵'

// ------------------------------------------------------------------ vectors (dx, dy, dT, dL)
function perms(a) {
	if (a.length <= 1) return [a.slice()]
	const out = []
	for (let i = 0; i < a.length; i++) for (const p of perms(a.slice(0, i).concat(a.slice(i + 1)))) out.push([a[i], ...p])
	return out
}
function symmetric(vec) {
	const base = vec.concat(new Array(4 - vec.length).fill(0))
	const out = new Map()
	for (const p of perms(base)) {
		const nz = p.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
		for (let m = 0; m < 1 << nz.length; m++) {
			const v = p.slice()
			nz.forEach((i, k) => { if (m & (1 << k)) v[i] = -v[i] })
			out.set(v.join(','), v)
		}
	}
	return [...out.values()]
}
const usable = (v) => !(v[3] === 0 && v[2] > 0)
const dirs = (k) => symmetric(new Array(k).fill(1)).filter(usable)
export const VEC = { R: dirs(1), B: dirs(2), U: dirs(3), D: dirs(4), N: symmetric([2, 1]).filter(usable) }
VEC.Q = [...VEC.R, ...VEC.B, ...VEC.U, ...VEC.D]
VEC.S = [...VEC.R, ...VEC.B]
const RIDE = { q: VEC.Q, y: VEC.Q, r0: VEC.R, r: VEC.R, b: VEC.B, u: VEC.U, d: VEC.D, s: VEC.S }
const LEAP = { k0: VEC.Q, k: VEC.Q, c: VEC.Q, n: VEC.N }

// ------------------------------------------------------------------ setups
export const SETUPS = {
	standard: { n: 8, mode: 0, rows: [[0, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR']] },
	turnzero: { n: 8, mode: 0, rows: [[0, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR']], turnZero: true },
	twotimelines: { n: 8, mode: 1, rows: [[-1, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'], [0, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR']] },
	princess: { n: 8, mode: 0, rows: [[0, 'rnbskbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBSKBNR']] },
	reversed: { n: 8, mode: 0, rows: [[0, 'rnbycbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBYCBNR']] },
	defended: { n: 8, mode: 0, rows: [[0, 'rqbnkbnr/pppppppp/8/8/8/8/PPPPPPPP/RQBNKBNR']] },
	halfreflected: { n: 8, mode: 0, rows: [[0, 'rnbkqbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR']] },
	noqueens: { n: 7, mode: 0, rows: [[0, 'rnbknbr/ppppppp/7/7/7/PPPPPPP/RNBKNBR']] },
	small: { n: 5, mode: 0, rows: [[0, 'kqbnr/ppppp/5/PPPPP/KQBNR']] },
	smallcentered: { n: 5, mode: 0, rows: [[0, 'rnkqr/ppppp/5/PPPPP/RQKNR']] },
	verysmall: { n: 4, mode: 0, rows: [[0, 'nbrk/pppp/PPPP/KRBN']] },
	verysmallopen: { n: 4, mode: 0, rows: [[0, 'nbrk/3p/P3/KRBN']] },
	justunicorns: { n: 5, mode: 0, rows: [[0, '1u1uk/5/5/5/KU1U1']] },
	justdragons: { n: 5, mode: 0, rows: [[0, '2ddk/5/5/5/KDD2']] },
	justbrawns: { n: 5, mode: 0, rows: [[0, 'wwwwk/5/5/5/KWWWW']] },
	kingofkings: { n: 5, mode: 0, rows: [[0, 'cckcc/5/5/5/CCKCC']] },
	royalqueens: { n: 6, mode: 0, rows: [[0, '4y1/6/6/6/6/1Y4']] },
	excessive: { n: 7, mode: 0, rows: [[0, 'kruqdrk/rnbknbr/ppppppp/7/PPPPPPP/RNBKNBR/KRUQDRK']] },
	marauders: { n: 5, mode: 2, rows: [[-1, 'wrkrw/1www1/5/5/5'], [0, 'w1w1w/5/5/5/W1W1W'], [1, '5/5/5/1WWW1/WRKRW']] },
	invasion: { n: 5, mode: 1, rows: [[-1, 'nbkrb/ppppp/5/5/PPPPP'], [0, 'ppppp/5/5/PPPPP/NBKRB']] },
}
const L0 = [[0, 0], [-1, 0], [-1, 1]] // initial [lmin, lmax] per mode

export function parseFen(fen, n) {
	const out = []
	fen.split('/').forEach((row, i) => {
		const y = n - 1 - i
		let x = 0
		for (const ch of row) {
			if (/\d/.test(ch)) { x += Number(ch); continue }
			const side = ch === ch.toUpperCase() ? 0 : 1
			let t = ch.toLowerCase()
			if (t === 'k' || t === 'r' || t === 'p' || t === 'w') t += '0'
			out.push({ x, y, t, side })
			x++
		}
	})
	return out
}

// ------------------------------------------------------------------ labels, squares
export const labelOf = (l, mode) => (mode === 1 ? (l >= 0 ? '+' + l : MINUS + (-l - 1)) : l === 0 ? '0' : l > 0 ? '+' + l : MINUS + -l)
const BLOCK = Object.fromEntries(LABELS.map((s, i) => [s, i]))
export const blockOf = (l, mode) => BLOCK[labelOf(l, mode)]
export const liveSq = (l, mode, x, y) => blockOf(l, mode) * 64 + y * 8 + x
export const histSq = (g, slot, v, x, y) => LIVE + (slot * g[1] + (v % g[1])) * g[0] * g[0] + y * g[0] + x
const boardName = (l, mode, v) => '(' + labelOf(l, mode) + 'T' + (v >> 1) + ')'
const cellName = (x, y) => FILES[x] + (y + 1)
const marker = (side, t) => side * 16 + TI[t]

// per-x cache of the skeleton facts
const infoCache = new WeakMap()
export function info(x) {
	let I = infoCache.get(x)
	if (I) return I
	const [N, HB, M, mode] = x.g
	const [lmin0, lmax0] = L0[mode]
	const byL = new Map()
	let lmin = 0, lmax = 0
	x.r.forEach((r, slot) => { byL.set(r[0], slot); lmin = Math.min(lmin, r[0]); lmax = Math.max(lmax, r[0]) })
	const c = [Math.max(0, lmax - lmax0), Math.max(0, lmin0 - lmin)]
	const active = (l) => (l >= lmin0 && l <= lmax0) || (l > lmax0 ? l - lmax0 <= c[1] + 1 : lmin0 - l <= c[0] + 1)
	let present = Infinity
	for (const r of x.r) if (active(r[0])) present = Math.min(present, r[2])
	I = { N, HB, M, mode, byL, c, active, present, lmin, lmax }
	infoCache.set(x, I)
	return I
}
export const mandatory = (x) => { const I = info(x); return x.r.map((r, s) => s).filter((s) => I.active(x.r[s][0]) && x.r[s][2] === I.present && (I.present & 1) === x.s) }
export const playable = (x, side) => x.r.map((r, s) => s).filter((s) => (x.r[s][2] & 1) === side)
export const canSubmit = (x) => (info(x).present & 1) !== x.s

// the content of a cell: -1 empty, else side * 16 + type index; `en` may override the row ends (phantom boards)
function cellAt(w, slot, v, x, y, en) {
	const r = w.x.r[slot]
	if (v === (en ? en[slot] : r[2])) {
		const id = w.board[liveSq(r[0], info(w.x).mode, x, y)]
		return id >= 0 ? w.sd[id] * 16 + TI[w.ty[id]] : -1
	}
	return w.board[histSq(w.x.g, slot, v, x, y)] // markers are exactly side * 16 + type index
}
function exists(x, slot, v, en) {
	if (slot === undefined) return false
	const r = x.r[slot]
	const e = en ? en[slot] : r[2]
	return v >= r[1] && v <= e && v >= e - x.g[1]
}

// ------------------------------------------------------------------ generation
export function generate(w, side) {
	if (side !== w.x.s) return danger(w, side)
	const out = []
	const x = w.x
	const I = info(x)
	const { N, M, mode } = I
	const created = I.c[side]
	const ai = x.ai
	const fy = side === 0 ? 1 : -1
	const fl = side === 0 ? -1 : 1
	const lastY = side === 0 ? N - 1 : 0
	const mand = new Set(mandatory(x))
	for (let slot = 0; slot < x.r.length; slot++) {
		const r = x.r[slot]
		if ((r[2] & 1) !== side) continue
		const l0 = r[0], v0 = r[2]
		const isMand = mand.has(slot)
		for (let y0 = 0; y0 < N; y0++) {
			for (let x0 = 0; x0 < N; x0++) {
				const from = liveSq(l0, mode, x0, y0)
				const id = w.board[from]
				if (id < 0 || w.sd[id] !== side) continue
				const t = w.ty[id]
				const tgt = (k, vec) => {
					const xx = x0 + k * vec[0], yy = y0 + k * vec[1]
					if (xx < 0 || yy < 0 || xx >= N || yy >= N) return null
					const s2 = I.byL.get(l0 + k * vec[3])
					const v2 = v0 + 2 * k * vec[2]
					if (!exists(x, s2, v2)) return null
					return { s2, v2, xx, yy }
				}
				const emit = (tg, occ, kind, extra) => {
					const r2 = x.r[tg.s2]
					const travel = tg.s2 === slot && tg.v2 === v0 ? 'physical' : tg.v2 === r2[2] ? 'hop' : 'branch'
					const royal = occ >= 0 && ROYAL.has(TYPES[occ & 15])
					if (travel === 'branch' && created >= M && !royal) return
					if (ai && !aiKeep(w, ai, travel, isMand, t, tg, slot, mand)) return
					const promo = extra?.promo ? 'q' : null
					let key = boardName(l0, mode, v0) + cellName(x0, y0)
					key += travel === 'physical' ? '-' : (travel === 'hop' ? '>' : '>>') + boardName(r2[0], mode, tg.v2)
					key += cellName(tg.xx, tg.yy) + (promo ? '=Q' : '')
					const to = travel === 'branch' ? histSq(x.g, tg.s2, tg.v2, tg.xx, tg.yy) : liveSq(r2[0], mode, tg.xx, tg.yy)
					out.push({
						key,
						from,
						to,
						id: travel === 'physical' ? id : -1,
						capture: kind === 'ep' ? extra.victim : occ >= 0 ? w.board[to] : -1,
						promo,
						drop: null,
						kind: kind ?? (travel === 'physical' ? 'normal' : travel),
						extra: { travel, slot, v: v0, s2: tg.s2, v2: tg.v2, x0, y0, x2: tg.xx, y2: tg.yy, royal, mover: id, ...extra },
					})
				}
				const occOf = (tg) => cellAt(w, tg.s2, tg.v2, tg.xx, tg.yy)
				const enemy = (o) => o >= 0 && (o >> 4) !== side
				if (RIDE[t]) {
					for (const vec of RIDE[t]) {
						for (let k = 1; ; k++) {
							const tg = tgt(k, vec)
							if (!tg) break
							const o = occOf(tg)
							if (o < 0) { emit(tg, -1); continue }
							if (enemy(o)) emit(tg, o)
							break
						}
					}
				} else if (LEAP[t]) {
					for (const vec of LEAP[t]) {
						const tg = tgt(1, vec)
						if (!tg) continue
						const o = occOf(tg)
						if (o < 0) emit(tg, -1)
						else if (enemy(o)) emit(tg, o)
					}
					if (t === 'k0') castling(w, side, slot, x0, y0, emit)
				} else {
					// pawn p0/p, brawn w0/w
					const unmoved = t === 'p0' || t === 'w0'
					for (const q of [[0, fy, 0, 0], [0, 0, 0, fl]]) {
						const t1 = tgt(1, q)
						if (!t1 || occOf(t1) >= 0) continue
						emit(t1, -1, null, { promo: q[1] !== 0 && t1.yy === lastY })
						if (unmoved) {
							const t2 = tgt(2, q)
							if (t2 && occOf(t2) < 0) {
								const phys = q[1] !== 0
								emit(t2, -1, phys ? 'double' : null, { promo: phys && t2.yy === lastY, skip: phys ? t1.yy * N + t1.xx : -1 })
							}
						}
					}
					const caps = [[1, fy, 0, 0], [-1, fy, 0, 0], [0, 0, 1, fl], [0, 0, -1, fl]]
					if (t === 'w' || t === 'w0') caps.push([1, 0, 0, fl], [-1, 0, 0, fl], [0, fy, 0, fl], [0, fy, -1, 0])
					for (const c of caps) {
						const tg = tgt(1, c)
						if (!tg) continue
						const o = occOf(tg)
						if (enemy(o)) emit(tg, o, null, { promo: c[1] !== 0 && tg.yy === lastY })
					}
					const ep = x.ep[slot]
					if (ep >= 0) {
						for (const dx of [1, -1]) {
							const tg = tgt(1, [dx, fy, 0, 0])
							if (!tg || tg.s2 !== slot || tg.v2 !== v0 || tg.yy * N + tg.xx !== ep || occOf(tg) >= 0) continue
							const vic = w.board[liveSq(l0, mode, tg.xx, y0)]
							if (vic >= 0 && w.sd[vic] !== side && /^[pw]/.test(w.ty[vic])) emit(tg, -1, 'ep', { victim: vic, promo: false })
						}
					}
				}
			}
		}
	}
	if ((I.present & 1) !== side) out.push({ key: SUBMIT, from: -1, to: -1, id: -1, capture: -1, promo: null, drop: null, kind: 'submit', extra: {} })
	return out
}

function castling(w, side, slot, kx, ky, emit) {
	const x = w.x
	const { N, mode } = info(x)
	const l0 = x.r[slot][0]
	for (const dir of [1, -1]) {
		const a = kx + dir, b = kx + 2 * dir
		if (b < 0 || b >= N) continue
		if (w.board[liveSq(l0, mode, a, ky)] >= 0 || w.board[liveSq(l0, mode, b, ky)] >= 0) continue
		let rook = -1
		for (let f = b + dir; f >= 0 && f < N; f += dir) {
			const o = w.board[liveSq(l0, mode, f, ky)]
			if (o >= 0) { rook = o; break }
		}
		if (rook < 0 || w.ty[rook] !== 'r0' || w.sd[rook] !== side) continue
		emit({ s2: slot, v2: x.r[slot][2], xx: b, yy: ky }, -1, 'castle', { rook, rookTo: liveSq(l0, mode, a, ky) })
	}
}

// AI candidate filter: world-independent (key, skeleton, solid pieces and the AI's target set only)
function aiKeep(w, ai, travel, isMand, t, tg, slot, mand) {
	const sq = travel === 'branch' ? histSq(w.x.g, tg.s2, tg.v2, tg.xx, tg.yy) : liveSq(w.x.r[tg.s2][0], info(w.x).mode, tg.xx, tg.yy)
	if (ai.t[w.x.s].has(sq)) return true // a piece of the other side may stand there
	if (travel === 'physical') return isMand
	if (ROYAL.has(t)) return true // royal pieces may always flee through time and timelines
	if (travel === 'hop') return mand.has(tg.s2) // clears a second must-move board
	return isMand && tg.v2 >= w.x.r[slot][2] - 2 // one turn back from a must-move board (rewinds the present)
}

// ------------------------------------------------------------------ "check": phantom captures of royal pieces
export function threats(w, attacker, all = false) {
	const x = w.x
	const victim = 1 - attacker
	const I = info(x)
	const en = x.r.map((r) => r[2])
	if (x.s === victim) for (const s of mandatory(x)) en[s] += 1 // the victim passes its must-move boards
	const out = []
	const { N, mode } = I
	const fy = attacker === 0 ? 1 : -1
	const fl = attacker === 0 ? -1 : 1
	for (let slot = 0; slot < x.r.length; slot++) {
		if ((en[slot] & 1) !== attacker) continue
		const l0 = x.r[slot][0], v0 = en[slot]
		for (let y0 = 0; y0 < N; y0++) {
			for (let x0 = 0; x0 < N; x0++) {
				const id = w.board[liveSq(l0, mode, x0, y0)]
				if (id < 0 || w.sd[id] !== attacker) continue
				const t = w.ty[id]
				const tgt = (k, vec) => {
					const xx = x0 + k * vec[0], yy = y0 + k * vec[1]
					if (xx < 0 || yy < 0 || xx >= N || yy >= N) return null
					const s2 = I.byL.get(l0 + k * vec[3])
					const v2 = v0 + 2 * k * vec[2]
					if (!exists(x, s2, v2, en)) return null
					return { s2, v2, xx, yy, o: cellAt(w, s2, v2, xx, yy, en) }
				}
				const hit = (tg) => { out.push({ from: [slot, v0, x0, y0], to: [tg.s2, tg.v2, tg.xx, tg.yy], id }); return !all }
				const royalOf = (o) => o >= 0 && (o >> 4) === victim && ROYAL.has(TYPES[o & 15])
				if (RIDE[t]) {
					for (const vec of RIDE[t]) {
						for (let k = 1; ; k++) {
							const tg = tgt(k, vec)
							if (!tg) break
							if (tg.o < 0) continue
							if (royalOf(tg.o) && hit(tg)) return out
							break
						}
					}
				} else {
					const vecs = LEAP[t] ?? ((t === 'w' || t === 'w0')
						? [[1, fy, 0, 0], [-1, fy, 0, 0], [0, 0, 1, fl], [0, 0, -1, fl], [1, 0, 0, fl], [-1, 0, 0, fl], [0, fy, 0, fl], [0, fy, -1, 0]]
						: [[1, fy, 0, 0], [-1, fy, 0, 0], [0, 0, 1, fl], [0, 0, -1, fl]])
					for (const vec of vecs) {
						const tg = tgt(1, vec)
						if (tg && royalOf(tg.o) && hit(tg)) return out
					}
				}
			}
		}
	}
	return out
}
function danger(w, attacker) {
	const list = threats(w, attacker)
	if (!list.length) return []
	const [s2, v2, xx, yy] = list[0].to
	const r = w.x.r[s2]
	const sq = v2 >= r[2] ? liveSq(r[0], info(w.x).mode, xx, yy) : histSq(w.x.g, s2, v2, xx, yy) // a passed (phantom) board holds the live pieces
	return [{ key: '†', from: -1, to: sq, id: -1, capture: w.board[sq], promo: null, drop: null, kind: 'danger', extra: {} }]
}

// ------------------------------------------------------------------ apply
function cloneW(w) {
	const x = w.x
	const nx = { g: x.g, s: x.s, r: x.r.map((r) => r.slice()), ep: x.ep.slice(), k: x.k }
	if (x.ai) nx.ai = x.ai
	return { sq: w.sq.slice(), ty: w.ty.slice(), sd: w.sd.slice(), board: w.board.slice(), x: nx }
}
function place(w, id, s) {
	const f = w.sq[id]
	if (f >= 0 && w.board[f] === id) w.board[f] = -1
	w.sq[id] = s
	if (s >= 0) w.board[s] = id
}
// the old live board of the row becomes a history board (markers), the row gets its next board
function advance(w, slot) {
	const { N, mode } = info(w.x)
	const r = w.x.r[slot]
	for (let y = 0; y < N; y++) {
		for (let xx = 0; xx < N; xx++) {
			const id = w.board[liveSq(r[0], mode, xx, y)]
			w.board[histSq(w.x.g, slot, r[2], xx, y)] = id >= 0 ? marker(w.sd[id], w.ty[id]) : -1
		}
	}
	r[2] += 1
	w.x.ep[slot] = -1
}
// the codes of a board (a copy, before anything changes)
function boardCodes(w, slot, v) {
	const { N } = info(w.x)
	const out = []
	for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) out.push(cellAt(w, slot, v, xx, y))
	return out
}
function newRow(w, side, content, s2, v2, traveller, tx, ty, ttype) {
	const x = w.x
	const I = info(x)
	const { N, mode } = I
	const l = side === 0 ? I.lmax + 1 : I.lmin - 1
	const slot = x.r.length
	x.r.push([l, v2 + 1, v2 + 1, x.r[s2][0], v2])
	x.ep.push(-1)
	for (let i = 0; i < x.g[1] * N * N; i++) w.board.push(-1) // the row's history squares
	const base = MARKERS + slot * N * N
	for (let i = 0; i < N * N; i++) { w.sq.push(-1); w.ty.push(''); w.sd.push(0) }
	for (let cell = 0; cell < N * N; cell++) {
		const c = content[cell]
		if (c < 0) continue
		const xx = cell % N, yy = (cell / N) | 0
		if (traveller >= 0 && xx === tx && yy === ty) continue // captured by the arriving piece
		const id = base + cell
		w.ty[id] = TYPES[c & 15]
		w.sd[id] = c >> 4
		place(w, id, liveSq(l, mode, xx, yy))
	}
	if (traveller >= 0) {
		place(w, traveller, liveSq(l, mode, tx, ty))
		w.ty[traveller] = ttype
	}
}
function finish(w) {
	infoCache.delete(w.x)
	const x = w.x
	if (!playable(x, x.s).length) x.s = 1 - x.s // the turn ends by itself when the mover has no board left
	infoCache.delete(x)
	return w
}
const movedType = (t) => MOVED[t] ?? t

export function apply(w, m) {
	if (m.kind === 'danger') return w
	const next = cloneW(w)
	const x = next.x
	const side = x.s
	if (m.kind === 'submit') {
		x.s = 1 - side
		return next
	}
	const e = m.extra
	const id = e.mover
	const ttype = m.promo ? 'q' : movedType(w.ty[id])
	const royalHit = (victim) => { if (victim >= 0 && ROYAL.has(next.ty[victim])) x.k = side }
	if (e.travel === 'physical') {
		advance(next, e.slot)
		const victim = m.kind === 'ep' ? e.victim : m.capture
		if (victim >= 0) { royalHit(victim); place(next, victim, -1) }
		place(next, id, m.to)
		next.ty[id] = ttype
		if (m.kind === 'castle') { place(next, e.rook, e.rookTo); next.ty[e.rook] = 'r' }
		if (m.kind === 'double') x.ep[e.slot] = e.skip
	} else if (e.travel === 'hop') {
		advance(next, e.slot)
		advance(next, e.s2)
		place(next, id, -1)
		const victim = next.board[m.to]
		if (victim >= 0) { royalHit(victim); place(next, victim, -1) }
		place(next, id, m.to)
		next.ty[id] = ttype
	} else {
		const content = boardCodes(w, e.s2, e.v2)
		advance(next, e.slot)
		place(next, id, -1)
		if (e.royal) x.k = side // a royal piece taken on a past board: the game ends, no timeline opens
		else newRow(next, side, content, e.s2, e.v2, id, e.x2, e.y2, ttype)
	}
	return finish(next)
}

// Q1: an idle world. A move that took effect elsewhere in its branch (hit) builds the same boards without moving the
// piece; a rolled Missed only uses up the board it was played from; a measurement uses up one board of the mover.
export function applyMiss(b, action, side, { hit }) {
	const next = cloneW(b)
	const x = next.x
	const slotOf = (sq) => { const blk = Math.floor(sq / 64); return x.r.findIndex((r) => blockOf(r[0], info(x).mode) === blk) }
	if (action.type === 'measure') {
		let slot = slotOf(action.from[0])
		if (slot < 0 || (x.r[slot][2] & 1) !== side) slot = mandatory(x)[0] ?? playable(x, side)[0]
		advance(next, slot)
		return finish(next)
	}
	if (action.type !== 'move') { // split, merge: the board of the piece passes
		advance(next, slotOf(action.from[0]))
		return finish(next)
	}
	const e = action.sample.extra
	const content = e.travel === 'branch' ? boardCodes(b, e.s2, e.v2) : null
	advance(next, e.slot)
	if (hit && e.travel === 'hop') advance(next, e.s2)
	if (hit && e.travel === 'branch' && !e.royal) newRow(next, side, content, e.s2, e.v2, -1)
	return finish(next)
}

// Q3: a castling right (an unmoved rook, r0) survives only if that rook is r0 on the same square in every world
export function unifyWorlds(bs) {
	const lost = new Set()
	const b0 = bs[0]
	for (let id = MARKERS; id < b0.sq.length; id++) {
		if (b0.ty[id] !== 'r0' && !bs.some((b) => b.ty[id] === 'r0')) continue
		if (bs.some((b) => b.ty[id] !== 'r0' || b.sq[id] !== b0.sq[id])) lost.add(id)
	}
	if (!lost.size) return bs
	return bs.map((b) => {
		if (![...lost].some((id) => b.ty[id] === 'r0')) return b
		const c = { ...b, ty: b.ty.slice() }
		for (const id of lost) if (c.ty[id] === 'r0') c.ty[id] = 'r'
		return c
	})
}

// X2: the side's pieces on history boards count toward its budget ("the past remembers")
const bxCache = new WeakMap()
export function budgetExtra(b, side) {
	let v = bxCache.get(b)
	if (!v) {
		const h = [0x811c9dc5, 0x811c9dc5]
		const h2 = [7, 7]
		for (let s = LIVE; s < b.board.length; s++) {
			const id = b.board[s]
			if (id < 0) continue
			const sd = id >> 4
			const val = s * 32 + id
			h[sd] = Math.imul(h[sd] ^ val, 16777619) >>> 0
			h2[sd] = (h2[sd] * 31 + val) % 2147483647
		}
		v = [h[0].toString(36) + h2[0].toString(36), h[1].toString(36) + h2[1].toString(36)]
		bxCache.set(b, v)
	}
	return v[side]
}

// ------------------------------------------------------------------ setup, topology, variant
export function setup(opts = {}) {
	const S = SETUPS[opts.setup ?? 'standard']
	const N = S.n
	const HB = 2 * (opts.window ?? 4)
	const M = opts.timelines ?? 3
	const mode = S.mode
	const x = { g: [N, HB, M, mode], s: 0, r: [], ep: [], k: -1 }
	const w = { sq: [], ty: [], sd: [], board: new Array(LIVE).fill(-1), x }
	for (let i = 0; i < MARKERS; i++) { w.sq.push(-1); w.ty.push(TYPES[i & 15]); w.sd.push(i >> 4) }
	const rows = S.rows.slice().sort((a, b) => a[0] - b[0])
	rows.forEach(([l, fen], slot) => {
		x.r.push([l, S.turnZero ? 1 : 2, 2, null, null])
		x.ep.push(-1)
		for (let i = 0; i < HB * N * N; i++) w.board.push(-1)
		const base = MARKERS + slot * N * N
		for (let i = 0; i < N * N; i++) { w.sq.push(-1); w.ty.push(''); w.sd.push(0) }
		for (const p of parseFen(fen, N)) {
			const id = base + p.y * N + p.x
			w.ty[id] = p.t
			w.sd[id] = p.side
			place(w, id, liveSq(l, mode, p.x, p.y))
			if (S.turnZero) w.board[histSq(x.g, slot, 1, p.x, p.y)] = marker(p.side, p.t) // the T0 board
		}
	})
	return w
}

const coords = []
for (let b = 0; b < LABELS.length; b++) for (let y = 0; y < 8; y++) for (let xx = 0; xx < 8; xx++) coords.push([b, xx, y])
const topology = makeTopology({
	coords,
	name: ([b, xx, y]) => '(' + LABELS[b] + ')' + FILES[xx] + (y + 1),
	cell: ([b, xx, y]) => ({ x: b * 9 + xx, y: 7 - y, w: 1, h: 1, shape: 'rect', shade: (xx + y) % 2 ? 'light' : 'dark' }),
})

const VALUES = { k0: 0, k: 0, y: 0, c: 350, q: 1400, s: 800, r0: 350, r: 350, b: 500, n: 450, u: 550, d: 350, p0: 100, p: 100, w0: 140, w: 140 }
const types = {}
for (const t of TYPES) {
	types[t] = { name: () => t, moves: [], royal: ROYAL.has(t), solid: SOLID.has(t), splittable: !SOLID.has(t), value: VALUES[t], glyph: { text: LETTER[t] } }
}

// ------------------------------------------------------------------ "no legal action": the turn cannot be finished
// The present has not passed, the mover has no ghost to measure (a measurement uses up a board), no branch rewinds the
// present, and the must-move boards without a move of their own cannot all be reached by hops from distinct boards.
export function stuck(state) {
	const x = state.worlds[0].b.x
	const side = state.turn
	if (canSubmit(x)) return false
	for (let id = MARKERS; id < state.worlds[0].b.sq.length; id++) {
		const f = state.worlds[0].b.sq[id]
		if (state.worlds.some(({ b }) => b.sd[id] === side && b.sq[id] !== f && (b.sq[id] >= 0 || f >= 0))) return false
	}
	const I = info(x)
	const byKey = new Map()
	for (const { b } of state.worlds) for (const [k, m] of cachedGenerate(V, b, side)) if (!byKey.has(k) && m.kind !== 'submit') byKey.set(k, m)
	const union = [...byKey.values()]
	const newL = side === 0 ? I.lmax + 1 : I.lmin - 1
	for (const m of union) {
		if (m.extra.travel !== 'branch' || m.extra.royal) continue
		const r2 = x.r.map((r) => r.slice())
		r2[m.extra.slot][2] += 1
		r2.push([newL, m.extra.v2 + 1, m.extra.v2 + 1, 0, 0])
		const I2 = info({ ...x, r: r2 })
		if ((I2.present & 1) !== side) return false // a rewind: the rest of the present becomes optional
	}
	const mand = mandatory(x)
	const departs = new Set(union.map((m) => m.extra.slot))
	const Z = mand.filter((s) => !departs.has(s))
	if (!Z.length) return false
	// bipartite matching: every board in Z needs its own source board with a hop onto it
	const edges = new Map(Z.map((z) => [z, [...new Set(union.filter((m) => m.extra.travel === 'hop' && m.extra.s2 === z).map((m) => m.extra.slot))]]))
	const owner = new Map()
	const tryz = (z, seen) => {
		for (const src of edges.get(z)) {
			if (seen.has(src)) continue
			seen.add(src)
			if (!owner.has(src) || tryz(owner.get(src), seen)) { owner.set(src, z); return true }
		}
		return false
	}
	return !Z.every((z) => tryz(z, new Set()))
}
const endResult = (state) => (royalDanger(V, state, state.turn) >= 1 - 1e-12 ? { winner: 1 - state.turn, reason: 'checkmate' } : { winner: null, reason: 'stalemate' })

// ------------------------------------------------------------------ AI hooks
// must-move boards of `side` on which nothing can be played and onto which nothing can arrive (the turn would get stuck)
export function stranded(w, side) {
	const x = w.x
	if (x.s !== side) return 0
	const mand = mandatory(x)
	if (!mand.length) return 0
	const I = info(x)
	const list = generate(w, side).filter((m) => m.kind !== 'submit')
	const newL = side === 0 ? I.lmax + 1 : I.lmin - 1
	const rewinds = I.active(newL) && list.some((m) => m.extra.travel === 'branch' && !m.extra.royal && m.extra.v2 + 1 < I.present)
	if (rewinds) return 0
	let n = 0
	for (const s of mand) {
		if (!list.some((m) => m.extra.slot === s || (m.extra.travel === 'hop' && m.extra.s2 === s))) n++
	}
	return n
}
export function evaluate(w, side) {
	const x = w.x
	const enemy = 1 - side
	let score = 200 // contempt: a game that goes on beats a draw by stalemate unless the position is bad
	if (threats(w, enemy).length) score -= x.s === enemy ? 3000 : 1200
	if (threats(w, side).length) score += x.s === side ? 400 : 150
	const I = info(x)
	score += 120 * Math.max(-2, Math.min(2, I.c[enemy] - I.c[side]))
	return score
}
export function aiView(state) {
	const T2 = [new Set(), new Set()]
	for (const { b } of state.worlds) {
		for (let s = 0; s < b.board.length; s++) {
			const id = b.board[s]
			if (id < 0) continue
			const sd = s < LIVE ? b.sd[id] : id >> 4
			T2[1 - sd].add(s)
		}
	}
	const ai = { t: T2, toJSON: () => 'ai' }
	return { ...state, worlds: state.worlds.map(({ b, w }) => ({ b: { ...b, x: { ...b.x, ai } }, w })) }
}

// ------------------------------------------------------------------ the variant
const spec = {
	id: 'multiverse',
	category: 'dimensions',
	sides: [{ id: 'w', name: () => 'White', color: 'white', rotate: 0 }, { id: 'b', name: () => 'Black', color: 'black', rotate: 0 }],
	topology,
	types,
	maxPly: 1200,
	quietPlies: 300,
	options: [
		{ id: 'setup', type: 'choice', default: 'standard', values: Object.keys(SETUPS).map((id) => ({ id, label: () => id })) },
		{ id: 'timelines', type: 'choice', default: 3, values: [2, 3, 4].map((id) => ({ id, label: () => String(id) })) },
		{ id: 'window', type: 'choice', default: 4, values: [2, 4, 6].map((id) => ({ id, label: () => String(id) })) },
	],
	setup: (o) => setup(o),
	rules: () => [],
	generate,
	apply,
	applyMiss,
	unifyWorlds,
	budgetExtra,
	solidExtra: (w) => w.x.s + '|' + w.x.r.map((r) => r.join('.')).join(';'),
	nextSide: (w) => w.x.s,
	actions: () => [{ code: SUBMIT, label: 'Submit turn' }],
	worldResult: (w) => (w.x.k >= 0 ? { winner: w.x.k, reason: 'king' } : null),
	noMoves: (state) => endResult(state),
	stateResult: (state) => (stuck(state) ? endResult(state) : null),
	evaluate,
	aiView,
}
export const V = defineVariant(spec)
export default V
export { TOTAL }
