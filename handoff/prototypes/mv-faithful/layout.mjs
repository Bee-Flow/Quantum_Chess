// Prototype of layoutOf(state, { viewer }) for the faithful multiverse design (geometry, areas, arrows, labels,
// history views, focus). Returns { size, names, cells, layout } as src/variantplay/components/VariantBoard.vue draws it.
import { histSq, info, labelOf, liveSq, mandatory, MINUS, playable } from './mv.mjs'

const GX = 1.2 // gap between columns
const GY = 1.5 // gap between rows (board labels)
const LEFT = 2.6
const TOP = 1.8
const KEY_RE = /^\((.+?)T(\d+)\)([a-h]\d)(-|>>?)(?:\((.+?)T(\d+)\))?([a-h]\d)/

export function layoutOf(state, opts = {}) {
	const b0 = state.worlds[0].b
	const x = b0.x
	const I = info(x)
	const { N, mode } = I
	const HB = x.g[1]
	const flip = opts.viewer === 1
	const side = x.s
	// rows (timelines) top to bottom; columns = half-turns v with gaps collapsed
	const rows = x.r.map((r, slot) => ({ slot, l: r[0], st: r[1], en: r[2], pl: r[3], pv: r[4], lo: Math.max(r[1], r[2] - HB) }))
	rows.sort((a, b) => (flip ? b.l - a.l : a.l - b.l))
	const vs = new Set()
	for (const r of rows) for (let v = r.lo; v <= r.en; v++) vs.add(v)
	const cols = [...vs].sort((a, b) => a - b)
	const colX = new Map()
	let cx = LEFT
	const gaps = []
	cols.forEach((v, i) => {
		if (i > 0 && v - cols[i - 1] > 1) { gaps.push(cx + 0.1); cx += 1.4 }
		colX.set(v, cx)
		cx += N + GX
	})
	const rowY = new Map(rows.map((r, i) => [r.slot, TOP + i * (N + GY)]))
	const contentW = cx + 0.4
	const contentH = TOP + rows.length * (N + GY)
	const W = contentW
	const H = Math.max(contentH, 0.6 * contentW)
	const dy = (H - contentH) / 2
	const cells = []
	const names = []
	const boards = []
	const areas = []
	const lines = []
	const labels = []
	const size = b0.board.length
	const mand = new Set(mandatory(x))
	const play = new Set(playable(x, side))
	const boardBox = (slot, v) => ({ x: colX.get(v), y: rowY.get(slot) + dy, w: N, h: N })
	for (const r of rows) {
		const label = labelOf(r.l, mode)
		const y0 = rowY.get(r.slot) + dy
		labels.push({ x: 1.1, y: y0 + N / 2 - 0.3, text: 'L' + label })
		if (!I.active(r.l)) labels.push({ x: 1.1, y: y0 + N / 2 + 0.3, text: 'inactive' })
		if (r.lo > r.st) labels.push({ x: colX.get(r.lo) - 0.6, y: y0 + N / 2, text: '⋯' })
		for (let v = r.lo; v <= r.en; v++) {
			const live = v === r.en
			const box = boardBox(r.slot, v)
			const T = v >> 1
			boards.push({ ...box, label: (live ? '(' + label + 'T' + T + ')' : 'T' + T) + (v & 1 ? ' ●' : ' ○') })
			if (live && v === r.en && (v & 1) === side) {
				areas.push({ x: box.x - 0.35, y: box.y - 0.75, w: N + 0.7, h: N + 1.1, shade: mand.has(r.slot) ? 'wood' : 'river' })
			}
			for (let yy = 0; yy < N; yy++) {
				for (let xx = 0; xx < N; xx++) {
					const sq = live ? liveSq(r.l, mode, xx, yy) : histSq(x.g, r.slot, v, xx, yy)
					const gxp = flip ? N - 1 - xx : xx
					const gyp = flip ? yy : N - 1 - yy
					const dark = (xx + yy) % 2 === 0
					cells.push({ sq, x: box.x + gxp, y: box.y + gyp, w: 1, h: 1, shape: 'rect', shade: live ? (dark ? 'dark' : 'light') : (dark ? 'mid' : 'light') })
					names[sq] = '(' + label + 'T' + T + ')' + 'abcdefgh'[xx] + (yy + 1)
				}
			}
		}
		// branch connector: parent board right edge -> first board left edge
		if (r.pl !== null) {
			const ps = x.r.findIndex((q) => q[0] === r.pl)
			const pr = x.r[ps]
			const first = Math.max(r.st, r.lo)
			const to = boardBox(r.slot, first)
			const shown = r.pv >= Math.max(pr[1], pr[2] - HB)
			const from = shown ? boardBox(ps, r.pv) : { x: LEFT - 0.5, y: rowY.get(ps) + dy, w: 0, h: N }
			arrow(lines, from.x + from.w + 0.1, from.y + N / 2, to.x - 0.15, to.y + N / 2)
		}
	}
	// the present
	const pc = colX.get(I.present)
	if (pc !== undefined) {
		areas.unshift({ x: pc - 0.45, y: TOP - 1.2 + dy, w: N + 0.9, h: rows.length * (N + GY) + 0.6, shade: 'frame' })
		labels.push({ x: pc + N / 2, y: TOP - 1.5 + dy, text: 'Now' })
	}
	for (const g of gaps) labels.push({ x: g + 0.5, y: TOP + dy - 0.9, text: '⋯' })
	labels.push({ x: W / 2, y: 0.5 + dy, text: 'New timelines: White ' + I.c[0] + '/' + x.g[2] + ' · Black ' + I.c[1] + '/' + x.g[2] })
	// travel arrows of the last turn of each side
	const hist = state.history ?? []
	const seen = new Set()
	for (let i = hist.length - 1; i >= 0 && seen.size < 2; i--) {
		const h = hist[i]
		if (h.code === '↵') { seen.add(h.side); continue }
		if (seen.has(h.side) || h.key === 'miss') continue
		const m = KEY_RE.exec(h.code)
		if (!m || m[4] === '-') continue
		const lOf = (lab) => rows.find((r) => labelOf(r.l, mode) === lab)
		const a = lOf(m[1]), bRow = lOf(m[5])
		if (!a || !bRow) continue
		const va = 2 * Number(m[2]) + h.side, vb = 2 * Number(m[6]) + h.side
		if (!colX.has(va) || !colX.has(vb)) continue
		const A = boardBox(a.slot, va), B = boardBox(bRow.slot, vb)
		arrow(lines, A.x + N / 2, A.y + (B.y > A.y ? N + 0.1 : -0.1), B.x + N / 2, B.y + (B.y > A.y ? -0.1 : N + 0.1))
	}
	// focus: the must-move boards (else the playable ones), about two and a half boards wide
	let boxes = [...mand].map((s) => boardBox(s, x.r[s][2]))
	if (!boxes.length) boxes = [...play].map((s) => boardBox(s, x.r[s][2]))
	if (!boxes.length && pc !== undefined) boxes = [{ x: pc, y: TOP + dy, w: N, h: rows.length * (N + GY) }]
	const bx0 = Math.min(...boxes.map((q) => q.x)), bx1 = Math.max(...boxes.map((q) => q.x + q.w))
	const by0 = Math.min(...boxes.map((q) => q.y)), by1 = Math.max(...boxes.map((q) => q.y + q.h))
	const fw = Math.max(bx1 - bx0, 2.5 * (N + GX)) + 1, fh = Math.max(by1 - by0, N) + 1.5
	const zoom = Math.min(8, Math.max(1, Math.min((W + 1.4) / fw, (H + 1.4) / fh)))
	const focus = { x: (bx0 + bx1) / 2, y: (by0 + by1) / 2, zoom }
	return { size, names, cells, layout: { width: W, height: H, boards, areas, lines, labels, focus, zoomable: true } }
}

function arrow(lines, x1, y1, x2, y2) {
	// an elbow line with a head: horizontal, vertical, horizontal
	const mx = (x1 + x2) / 2
	lines.push({ x1, y1, x2: mx, y2: y1 }, { x1: mx, y1, x2: mx, y2 }, { x1: mx, y1: y2, x2, y2 })
	const dir = x2 >= mx ? 1 : -1
	lines.push({ x1: x2, y1: y2, x2: x2 - 0.3 * dir, y2: y2 - 0.2 }, { x1: x2, y1: y2, x2: x2 - 0.3 * dir, y2: y2 + 0.2 })
}
export { MINUS }
