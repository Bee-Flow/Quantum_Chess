// Prototype of the "faithful" multiverse design: one classical world with the proposed encoding.
// Not production code: used only to validate the design against 5d-chess-js.

export const S = 7 // board slots per row: live + 6 history boards
export const HB = S - 1
export const C = 64
export const R = 7
export const OFF = -1

export const sqOf = (u, slot, cell) => (u * S + slot) * C + cell
export const uOf = (L) => (L === 0 ? 0 : L > 0 ? 2 * L - 1 : -2 * L)
export const LOf = (u) => (u === 0 ? 0 : u % 2 === 1 ? (u + 1) / 2 : -u / 2)

// vectors (dx, dy, dT, dL)
function perms(a) {
	if (a.length <= 1) return [a.slice()]
	const out = []
	for (let i = 0; i < a.length; i++) {
		for (const p of perms(a.slice(0, i).concat(a.slice(i + 1)))) out.push([a[i], ...p])
	}
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
const dirs = (k) => symmetric(new Array(k).fill(1))
const usable = (v) => !(v[3] === 0 && v[2] > 0)
export const V = {
	R: dirs(1).filter(usable),
	B: dirs(2).filter(usable),
	U: dirs(3).filter(usable),
	D: dirs(4).filter(usable),
	N: symmetric([2, 1]).filter(usable),
}
V.Q = [...V.R, ...V.B, ...V.U, ...V.D]
V.S = [...V.R, ...V.B]
V.K = V.Q

const RIDE = { q: V.Q, r: V.R, b: V.B, u: V.U, d: V.D, s: V.S, y: V.Q }
const LEAP = { k: V.K, c: V.K, n: V.N }

export const base = (t) => t.replace(/^h/, '').replace(/0$/, '')
const unmoved = (t) => t.endsWith('0')
const royal = (t) => { const b = base(t); return b === 'k' || b === 'y' }

// ---------------------------------------------------------------- world
export function emptyRows(n) {
	const len = n * S * C
	return { sq: new Array(len).fill(OFF), ty: new Array(len).fill(''), sd: new Array(len).fill(0), board: new Array(len).fill(-1) }
}

function grow(w, u) {
	const len = (u + 1) * S * C
	while (w.board.length < len) { w.sq.push(OFF); w.ty.push(''); w.sd.push(0); w.board.push(-1) }
}

export function fromFen(fen, z) {
	// fen top rank first; letters: KQRBNP UDSYCW; lower = black
	const ranks = fen.split('/')
	const out = []
	ranks.forEach((row, i) => {
		const r = z - 1 - i
		let f = 0
		for (const ch of row) {
			if (/\d/.test(ch)) { f += Number(ch); continue }
			const side = ch === ch.toUpperCase() ? 0 : 1
			let t = ch.toLowerCase()
			if (t === 'k' || t === 'r' || t === 'p' || t === 'w') t += '0'
			out.push({ cell: r * 8 + f, t, side })
			f++
		}
	})
	return out
}

export function setup(fen, z, { turnZero = false, maxc = 3 } = {}) {
	const w = { ...emptyRows(1), x: { s: 0, n: 0, z, m: maxc, tl: new Array(R).fill(null), ep: new Array(R).fill(null), k: null } }
	for (const { cell, t, side } of fromFen(fen, z)) {
		const id = sqOf(0, 0, cell)
		w.sq[id] = id; w.ty[id] = t; w.sd[id] = side; w.board[id] = id
		if (turnZero) {
			const h = sqOf(0, 1, cell)
			w.sq[h] = h; w.ty[h] = 'h' + t; w.sd[h] = side; w.board[h] = h
		}
	}
	w.x.tl[0] = turnZero ? [1, 2, -1, -1] : [2, 2, -1, -1]
	return w
}

export function clone(w) {
	return { sq: w.sq.slice(), ty: w.ty.slice(), sd: w.sd.slice(), board: w.board.slice(), x: JSON.parse(JSON.stringify(w.x)) }
}

// ---------------------------------------------------------------- skeleton
export function skel(w) {
	const tl = w.x.tl
	let cW = 0, cB = 0
	tl.forEach((e, u) => { if (e && u > 0) { if (u % 2) cW++; else cB++ } })
	const active = (u) => { if (u === 0) return true; const L = LOf(u); return L > 0 ? L <= cB + 1 : -L <= cW + 1 }
	let present = Infinity
	tl.forEach((e, u) => { if (e && active(u)) present = Math.min(present, e[1]) })
	return { tl, cW, cB, active, present }
}
export const passed = (w) => (skel(w).present & 1) !== w.x.s
export function mandatory(w) {
	const sk = skel(w)
	const out = []
	sk.tl.forEach((e, u) => { if (e && sk.active(u) && e[1] === sk.present && (e[1] & 1) === w.x.s) out.push(u) })
	return out
}

// board (u, v) stored? returns slot or -1
function slotOf(w, u, v) {
	const e = w.x.tl[u]
	if (!e || v < e[0] || v > e[1] || e[1] - v > HB) return -1
	return e[1] - v
}

const Ls = (L) => (L > 0 ? '+' + L : String(L))
const nm = (cell) => 'abcdefgh'[cell % 8] + (Math.floor(cell / 8) + 1)
const bd = (u, v) => '(' + Ls(LOf(u)) + 'T' + (v >> 1) + ')'

// ---------------------------------------------------------------- generation
export function generate(w, side) {
	const out = []
	const z = w.x.z
	const tl = w.x.tl
	const sk = skel(w)
	const created = side === 0 ? sk.cW : sk.cB
	const canBranch = created < w.x.m
	if ((sk.present & 1) !== side) out.push({ key: '/', from: -1, to: -1, id: -1, capture: -1, kind: 'submit' })
	for (let u = 0; u < tl.length; u++) {
		const e = tl[u]
		if (!e || (e[1] & 1) !== side) continue
		const v0 = e[1]
		const L0 = LOf(u)
		for (let cell = 0; cell < C; cell++) {
			const from = sqOf(u, 0, cell)
			const id = w.board[from]
			if (id < 0 || w.sd[id] !== side) continue
			const t = w.ty[id]
			const b = base(t)
			const x0 = cell % 8, y0 = cell >> 3
			const target = (k, vec) => {
				const x = x0 + k * vec[0], y = y0 + k * vec[1]
				if (x < 0 || y < 0 || x >= z || y >= z) return null
				const L = L0 + k * vec[3]
				if (L < -3 || L > 3) return null
				const ut = uOf(L)
				const vt = v0 + 2 * k * vec[2]
				const slot = slotOf(w, ut, vt)
				if (slot < 0) return null
				return { ut, vt, slot, sq: sqOf(ut, slot, y * 8 + x), cell: y * 8 + x }
			}
			const emit = (tg, capture, kind, extra = {}) => {
				const kindT = tg.ut === u && tg.slot === 0 ? 'physical' : tg.slot === 0 ? 'hop' : 'branch'
				// at the cap a branch is still allowed when it captures a royal piece (the game ends at once)
				if (kindT === 'branch' && !canBranch && !(capture >= 0 && royal(w.ty[capture]))) return
				let key
				if (kindT === 'physical') key = bd(u, v0) + nm(cell) + '-' + nm(tg.cell)
				else key = bd(u, v0) + nm(cell) + (kindT === 'hop' ? '>' : '>>') + bd(tg.ut, tg.vt) + nm(tg.cell)
				const promo = extra.promo ? '=Q' : ''
				out.push({ key: key + promo, from, to: tg.sq, id, capture, kind: kind ?? kindT, travel: kindT, tg, extra })
			}
			const occ = (tg) => w.board[tg.sq]
			if (RIDE[b]) {
				for (const vec of RIDE[b]) {
					for (let k = 1; ; k++) {
						const tg = target(k, vec)
						if (!tg) break
						const o = occ(tg)
						if (o < 0) { emit(tg, -1); continue }
						if (w.sd[o] !== side) emit(tg, o)
						break
					}
				}
			} else if (LEAP[b]) {
				for (const vec of LEAP[b]) {
					const tg = target(1, vec)
					if (!tg) continue
					const o = occ(tg)
					if (o < 0) emit(tg, -1)
					else if (w.sd[o] !== side) emit(tg, o)
				}
				if (t === 'k0') castling(w, side, u, v0, cell, id, out)
			} else if (b === 'p' || b === 'w') {
				const fy = side === 0 ? 1 : -1, fl = side === 0 ? -1 : 1
				const last = side === 0 ? z - 1 : 0
				const quiet = [[0, fy, 0, 0], [0, 0, 0, fl]]
				for (const q of quiet) {
					const t1 = target(1, q)
					if (!t1 || occ(t1) >= 0) continue
					emit(t1, -1, null, { promo: q[1] !== 0 && (t1.cell >> 3) === last })
					if (unmoved(t)) {
						const t2 = target(2, q)
						if (t2 && occ(t2) < 0) emit(t2, -1, q[1] !== 0 && t2.ut === u && t2.slot === 0 ? 'double' : null, { skip: t1.cell, promo: q[1] !== 0 && (t2.cell >> 3) === last })
					}
				}
				const caps = [[1, fy, 0, 0], [-1, fy, 0, 0], [0, 0, 1, fl], [0, 0, -1, fl]]
				if (b === 'w') caps.push([1, 0, 0, fl], [-1, 0, 0, fl], [0, fy, 0, fl], [0, fy, -1, 0])
				for (const c of caps) {
					const tg = target(1, c)
					if (!tg) continue
					const o = occ(tg)
					if (o >= 0 && w.sd[o] !== side) emit(tg, o, null, { promo: (tg.cell >> 3) === last && c[1] !== 0 })
				}
				// en passant, on this board only
				const ep = w.x.ep[u]
				if (ep) {
					for (const dx of [1, -1]) {
						const tg = target(1, [dx, fy, 0, 0])
						if (tg && tg.cell === ep[0] && occ(tg) < 0) {
							const vsq = sqOf(u, 0, ep[1])
							const vic = w.board[vsq]
							if (vic >= 0 && w.sd[vic] !== side) emit(tg, vic, 'ep', { victim: vsq })
						}
					}
				}
			}
		}
	}
	return out
}

function castling(w, side, u, v0, kcell, kid, out) {
	const y = kcell >> 3
	for (const dir of [1, -1]) {
		let f = (kcell & 7) + dir
		let rook = -1
		for (; f >= 0 && f < w.x.z; f += dir) {
			const o = w.board[sqOf(u, 0, y * 8 + f)]
			if (o >= 0) { rook = o; break }
		}
		if (rook < 0 || w.ty[rook] !== 'r0' || w.sd[rook] !== side) continue
		if (Math.abs(f - (kcell & 7)) < 3) continue
		const kto = y * 8 + (kcell & 7) + 2 * dir
		const rto = y * 8 + (kcell & 7) + dir
		out.push({
			key: bd(u, v0) + (dir > 0 ? 'O-O' : 'O-O-O'), from: sqOf(u, 0, kcell), to: sqOf(u, 0, kto), id: kid, capture: -1, kind: 'castle',
			travel: 'physical', tg: { ut: u, slot: 0, cell: kto, sq: sqOf(u, 0, kto), vt: v0 }, extra: { rook, rto: sqOf(u, 0, rto) },
		})
	}
}

// ---------------------------------------------------------------- apply
function place(w, id, s) {
	if (w.sq[id] >= 0 && w.board[w.sq[id]] === id) w.board[w.sq[id]] = -1
	w.sq[id] = s
	if (s >= 0) w.board[s] = id
}

function advance(w, u) {
	const e = w.x.tl[u]
	for (let slot = HB; slot >= 1; slot--) {
		for (let cell = 0; cell < C; cell++) {
			const dst = sqOf(u, slot, cell)
			const srcSq = sqOf(u, slot - 1, cell)
			const src = w.board[srcSq]
			if (w.board[dst] >= 0) { w.sq[dst] = OFF; w.board[dst] = -1 }
			if (src >= 0) {
				w.ty[dst] = slot === 1 ? 'h' + w.ty[src] : w.ty[src]
				w.sd[dst] = w.sd[src]
				w.sq[dst] = dst
				w.board[dst] = dst
			}
		}
	}
	e[1] += 1
	w.x.ep[u] = null
}

const moved = (t) => (t.endsWith('0') ? t.slice(0, -1) : t)

function capture(w, victim, mover) {
	if (royal(w.ty[victim])) w.x.k = mover
	place(w, victim, OFF)
}

export function apply(w0, m) {
	const w = clone(w0)
	const side = w.x.s
	if (m.kind === 'submit') { w.x.s = 1 - side; w.x.n++; return w }
	const us = Math.floor(m.from / (S * C))
	const id = m.id
	const tg = m.tg
	if (m.travel === 'physical') {
		advance(w, us)
		if (m.kind === 'ep') capture(w, w.board[m.extra.victim], side)
		else if (m.capture >= 0) capture(w, m.capture, side)
		place(w, id, m.to)
		w.ty[id] = moved(w.ty[id])
		if (m.extra.promo) w.ty[id] = 'q'
		if (m.kind === 'castle') { place(w, m.extra.rook, m.extra.rto); w.ty[m.extra.rook] = 'r' }
		if (m.kind === 'double') w.x.ep[us] = [m.extra.skip, tg.cell]
		return w
	}
	if (m.travel === 'hop') {
		advance(w, us)
		place(w, id, OFF)
		advance(w, tg.ut)
		const o = w.board[sqOf(tg.ut, 0, tg.cell)]
		if (o >= 0) capture(w, o, side)
		place(w, id, sqOf(tg.ut, 0, tg.cell))
		w.ty[id] = m.extra.promo ? 'q' : moved(w.ty[id])
		return w
	}
	// branch: read the target board first
	const copy = []
	for (let cell = 0; cell < C; cell++) {
		const o = w.board[sqOf(tg.ut, tg.slot, cell)]
		if (o >= 0) copy.push({ cell, t: w.ty[o].slice(1), s: w.sd[o] })
	}
	advance(w, us)
	place(w, id, OFF)
	const sk = skel(w)
	const n = (side === 0 ? sk.cW : sk.cB) + 1
	if (n > w.x.m) { w.x.k = side; return w } // a royal capture at the cap: the game ends, no row is created
	const un = uOf(side === 0 ? n : -n)
	grow(w, un)
	w.x.tl[un] = [tg.vt + 1, tg.vt + 1, tg.ut, tg.vt]
	for (const { cell, t, s } of copy) {
		const nid = sqOf(un, 0, cell)
		w.ty[nid] = t; w.sd[nid] = s
		place(w, nid, nid)
	}
	const o = w.board[sqOf(un, 0, tg.cell)]
	if (o >= 0) capture(w, o, side)
	place(w, id, sqOf(un, 0, tg.cell))
	w.ty[id] = m.extra.promo ? 'q' : moved(w.ty[id])
	return w
}

// ---------------------------------------------------------------- phantom royal captures (danger = official check)
export function royalThreats(w, victim) {
	// the side to move is `mover`; if victim === mover, pass the victim's mandatory boards
	const pw = clone(w)
	const attacker = 1 - victim
	if (pw.x.s === victim) {
		for (const u of mandatory(w)) advance(pw, u) // pass: the live board is copied unchanged into history, end+1
		// after advance the live board is the same position (advance does not clear live cells)
		pw.x.s = attacker
	}
	return generate(pw, attacker).filter((m) => m.capture >= 0 && royal(pw.ty[m.capture]) && pw.sd[m.capture] === victim)
}
