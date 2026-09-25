// layoutOf for the prototype (design section 6): only the layout features the board component has today (boards,
// areas frame/wood/river, lines under the cells, outlines above them, labels, focus with a key). Labels untranslated.
import * as P from './mvq.mjs'

const FILES = 'abcdefgh'
const cache = new Map()
const Lname = (L) => (L === 0 ? '0' : L > 0 ? '+' + L : '−' + -L)
const mark = (v) => (v & 1 ? '●' : '○')

// the records of the side to move's current turn and of the opponent's turn before it (newest last)
function lastTurns(state) {
	const h = state.history
	let i = h.length
	const sides = []
	while (i > 0) {
		const side = h[i - 1].side
		if (sides[sides.length - 1] !== side) {
			if (sides.length === 2) {
				break
			}
			sides.push(side)
		}
		i--
	}
	return h.slice(i)
}

export function layoutOf(state) {
	const b0 = state.worlds[0].b
	const x = b0.x
	const view = state.options?.view === 'black' ? 1 : 0
	const recent = lastTurns(state).filter((r) => r.info?.arrows?.length)
	const key = P.solidExtra(b0) + '#' + view + '#' + recent.map((r) => JSON.stringify(r.info.arrows)).join(';')
	const hit = cache.get(key)
	if (hit) {
		return hit
	}
	const n = x.n
	const gx = n >= 8 ? 1.6 : 1.1
	const gy = n >= 8 ? 2.0 : 1.6
	const px = n + gx
	const py = n + gy
	const left = 3.0
	const top = 2.6
	const sk = P.skeleton(x)
	const rows = []
	for (let u = 0; u < P.ROWS; u++) {
		if (x.tl[u]) {
			rows.push(u)
		}
	}
	rows.sort((a, b) => P.LOf(a) - P.LOf(b))
	if (view === 1) {
		rows.reverse()
	}
	const playable = (u) => P.playable(x, x.s, u)
	const vs = new Set()
	for (const u of rows) {
		const [st, en] = x.tl[u]
		for (let v = Math.max(st, en - P.H); v <= en; v++) {
			vs.add(v)
		}
		if (playable(u)) {
			vs.add(en + 1)
		}
	}
	const cols = [...vs].sort((a, b) => a - b)
	const colX = new Map()
	const gaps = []
	let cx = 0
	cols.forEach((v, i) => {
		if (i > 0 && v - cols[i - 1] > 1) {
			gaps.push(cx + 0.6 - gx / 2)
			cx += 1.2
		}
		colX.set(v, cx)
		cx += px
	})
	const contentW = left + cx + 0.4
	const contentH = top + rows.length * py
	const width = contentW
	const height = Math.max(contentH, 0.75 * contentW)
	const dy = (height - contentH) / 2
	const at = (u, v) => ({ bx: left + colX.get(v), by: dy + top + rows.indexOf(u) * py })
	const shown = (u, v) => x.tl[u] && colX.has(v) && v >= Math.max(x.tl[u][0], x.tl[u][1] - P.H) && v <= x.tl[u][1]
	const cellXY = (bx, by, xx, yy) => (view === 1 ? { cx: bx + (n - 1 - xx), cy: by + yy } : { cx: bx + xx, cy: by + (n - 1 - yy) })
	const cells = []
	const boards = []
	const areas = []
	const lines = []
	const outlines = []
	const labels = []
	const names = []
	const mand = new Set(P.mandatory(x))
	const rect = (x1, y1, w, h) => {
		outlines.push({ x1, y1, x2: x1 + w, y2: y1 }, { x1: x1 + w, y1, x2: x1 + w, y2: y1 + h },
			{ x1: x1 + w, y1: y1 + h, x2: x1, y2: y1 + h }, { x1, y1: y1 + h, x2: x1, y2: y1 })
	}
	// the present band and its label
	if (colX.has(sk.present)) {
		const bx = left + colX.get(sk.present)
		areas.push({ x: bx - 0.4, y: dy + top - 1.2, w: n + 0.8, h: rows.length * py + 0.6, shade: 'frame' })
		labels.push({ x: bx + n / 2, y: dy + top - 1.5, text: 'Now' })
	}
	for (const g of gaps) {
		labels.push({ x: left + g, y: dy + top - 0.5, text: '⋯' })
	}
	labels.push({ x: left, y: dy + 0.8, text: `New timelines: White ${x.c[0]}/${x.m} · Black ${x.c[1]}/${x.m}`, anchor: 'start' })
	for (const u of rows) {
		const [st, en, pL, pv] = x.tl[u]
		const L = P.LOf(u)
		const { by } = at(u, en)
		labels.push({ x: 1.4, y: by + n / 2 - 0.3, text: 'L' + Lname(L) })
		if (!sk.act(u)) {
			labels.push({ x: 1.4, y: by + n / 2 + 0.5, text: 'inactive' })
		}
		const first = Math.max(st, en - P.H)
		if (first > st) {
			labels.push({ x: left + colX.get(first) - 0.6, y: by + n / 2, text: '⋯' })
		}
		for (let v = first; v <= en; v++) {
			const { bx } = at(u, v)
			const slot = v === en ? 0 : 1 + (v % P.H)
			const live = v === en
			boards.push({ x: bx, y: by, w: n, h: n, label: (live ? 'L' + Lname(L) + ' ' : '') + 'T' + P.T(v) + ' ' + mark(v) })
			if (live && playable(u)) {
				areas.push({ x: bx - 0.3, y: by - 0.3, w: n + 0.6, h: n + 0.6, shade: mand.has(u) ? 'wood' : 'river' })
			}
			for (let yy = 0; yy < n; yy++) {
				for (let xx = 0; xx < n; xx++) {
					const sq = P.sqOf(u, slot, xx, yy)
					const dark = (xx + yy) % 2 === 0
					const { cx: cxx, cy: cyy } = cellXY(bx, by, xx, yy)
					cells.push({ sq, x: cxx, y: cyy, w: 1, h: 1, shape: 'rect', shade: live ? (dark ? 'dark' : 'light') : (dark ? 'mid' : 'light') })
					names[sq] = `Timeline ${Lname(L)}, turn ${P.T(v)}, ${v & 1 ? 'Black' : 'White'} to move: ${FILES[xx]}${yy + 1}`
				}
			}
		}
		if (playable(u)) {
			const { bx } = at(u, en + 1)
			rect(bx, by, n, n)
			labels.push({ x: bx + n / 2, y: by + n / 2, text: 'T' + P.T(en + 1) + ' ' + mark(en + 1) })
		}
		// branch connector from the parent board (or from the parent row's left margin when that board is sealed)
		if (pL !== null) {
			const pu = P.uOf(pL)
			const to = at(u, first)
			const y2 = to.by + n / 2
			if (shown(pu, pv)) {
				const from = at(pu, pv)
				lines.push({ x1: from.bx + n, y1: from.by + n / 2, x2: to.bx, y2 })
			} else if (x.tl[pu]) {
				lines.push({ x1: left - 0.3, y1: at(pu, x.tl[pu][1]).by + n / 2, x2: to.bx, y2 })
			}
		}
	}
	// travel arrows of the last two turns: centre of the square left to the centre of the square reached
	for (const r of recent) {
		for (const [u1, v1, x1, y1, u2, v2, x2, y2] of r.info.arrows) {
			if (!shown(u1, v1) || !shown(u2, v2)) {
				continue
			}
			const a = at(u1, v1)
			const b = at(u2, v2)
			const p1 = cellXY(a.bx, a.by, x1, y1)
			const p2 = cellXY(b.bx, b.by, x2, y2)
			const [sx, sy, ex, ey] = [p1.cx + 0.5, p1.cy + 0.5, p2.cx + 0.5, p2.cy + 0.5]
			outlines.push({ x1: sx, y1: sy, x2: ex, y2: ey })
			const ang = Math.atan2(ey - sy, ex - sx)
			for (const d of [0.44, -0.44]) {
				outlines.push({ x1: ex, y1: ey, x2: ex - 0.4 * Math.cos(ang + d), y2: ey - 0.4 * Math.sin(ang + d) })
			}
		}
	}
	// focus: the boards the side to move must play (else those it may play, else the present column)
	let box = null
	const grow = (bx, by) => {
		box = box
			? { x1: Math.min(box.x1, bx), y1: Math.min(box.y1, by), x2: Math.max(box.x2, bx + n), y2: Math.max(box.y2, by + n) }
			: { x1: bx, y1: by, x2: bx + n, y2: by + n }
	}
	for (const u of rows) {
		if (mand.has(u) || (!mand.size && playable(u))) {
			const { bx, by } = at(u, x.tl[u][1])
			grow(bx, by)
		}
	}
	if (!box && colX.has(sk.present)) {
		grow(left + colX.get(sk.present), dy + top)
	}
	const bw = box.x2 - box.x1 + 2
	const bh = box.y2 - box.y1 + 2
	const zoom = Math.max(1, Math.min(4, Math.min(width / Math.max(bw, 2.2 * px), height / bh)))
	// recentre only when the turn passes, the present moves, a timeline appears or the view changes
	const fkey = [x.s, sk.present, rows.length, view].join('/')
	const focus = { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2, zoom, key: fkey }
	const out = { size: b0.board.length, names, cells, layout: { width, height, boards, areas, lines, outlines, labels, focus, zoomable: true } }
	if (cache.size > 64) {
		cache.clear()
	}
	cache.set(key, out)
	return out
}
