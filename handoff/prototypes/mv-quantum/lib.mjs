// Helpers for the prototype scripts: printing states, playing codes with a chosen outcome, invariants.
import V, * as P from './mvq.mjs'
import * as Q from './core/quantum.mjs'

export { V, P, Q }

const PIECE = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' }

// text picture of one stored board (u, v): '.' empty, letters, 'N50' style for uncertain cells
export function boardText(state, u, v) {
	const x = state.worlds[0].b.x
	const n = x.n
	const e = x.tl[u]
	const slot = v === e[1] ? 0 : 1 + (v % P.H)
	const rows = []
	for (let y = n - 1; y >= 0; y--) {
		const cells = []
		for (let xx = 0; xx < n; xx++) {
			const view = Q.squareView(state, P.sqOf(u, slot, xx, y))
			if (!view.length) {
				cells.push('.')
				continue
			}
			cells.push(view.map((o) => {
				const b = o.type.replace(/^h/, '').replace('0', '')
				const ch = o.side === 0 ? PIECE[b] : PIECE[b].toLowerCase()
				return o.p > 0.9999 ? ch : ch + Math.round(o.p * 100)
			}).join('/'))
		}
		rows.push(cells.join(' '))
	}
	return rows.join(' | ')
}

export function show(state, { history = true } = {}) {
	const x = state.worlds[0].b.x
	const out = []
	const sk = P.skeleton(x)
	out.push(`ply ${state.ply} turn ${state.turn} worlds ${state.worlds.length} budget W${Q.budget(state, 0)} B${Q.budget(state, 1)} created ${x.c} present v${sk.present} (T${P.T(sk.present)}${sk.present & 1 ? 'b' : 'w'}) submit ${P.canSubmit(x)} result ${JSON.stringify(state.result)}`)
	for (let u = 0; u < P.ROWS; u++) {
		const e = x.tl[u]
		if (!e) {
			continue
		}
		const L = P.LOf(u)
		out.push(`  L${L > 0 ? '+' + L : L} [${e[0]}..${e[1]}] parent ${e[2]},${e[3]} ${sk.act(u) ? 'active' : 'inactive'}`)
		const from = history ? Math.max(e[0], e[1] - P.H) : e[1]
		for (let v = from; v <= e[1]; v++) {
			out.push(`    v${v} T${P.T(v)}${v & 1 ? 'b' : 'w'}${v === e[1] ? '*' : ' '} ${boardText(state, u, v)}`)
		}
	}
	return out.join('\n')
}

// play a code; index = which outcome (default: the only one, or 0); returns the new state
export function play(state, code, index = null) {
	const list = Q.branches(V, state, code)
	if (!list) {
		throw new Error('illegal: ' + code)
	}
	const i = index ?? 0
	if (!list[i]) {
		throw new Error('no outcome ' + i + ' for ' + code)
	}
	return Q.stateAfter(V, state, code, list[i], list)
}

export function outs(state, code) {
	const o = Q.outcomes(V, state, code)
	return o ? o.map((b) => `${b.key}${b.rolled ? '' : '(certain)'} ${Math.round(b.p * 1000) / 10}%${b.notes.length ? ' notes:' + b.notes.map((n) => n.slice(0, 20)).join(',') : ''}`).join(' / ') : 'ILLEGAL'
}

export function stateOfWorlds(worlds, turn = 0) {
	const total = worlds.reduce((a, [, w]) => a + w, 0)
	let rest = Q.T
	const list = worlds.map(([b, rel], i) => {
		const w = i === worlds.length - 1 ? rest : Math.floor((Q.T * rel) / total)
		rest -= w
		return { b, w }
	})
	return { v: 1, variant: 'multiverse', options: {}, worlds: list, turn, ply: 0, quiet: 0, result: null, history: [] }
}

export function invariants(s) {
	const err = (m) => {
		throw new Error(m)
	}
	if (s.worlds.length > Q.MAX_WORLDS) err('too many worlds')
	if (s.worlds.reduce((a, e) => a + e.w, 0) !== Q.T) err('weights')
	const sx = P.solidExtra(s.worlds[0].b)
	for (const { b } of s.worlds) {
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sq[id] >= 0 && b.board[b.sq[id]] !== id) err('sq/board ' + id)
		}
		b.board.forEach((id, sq) => {
			if (id >= 0 && b.sq[id] !== sq) err('board/sq ' + sq)
		})
		if (P.solidExtra(b) !== sx) err('skeleton differs')
	}
	for (let side = 0; side < 2; side++) {
		const bi = Q.budgetInfo(V, s, side)
		if (bi.used > bi.limit) err('budget ' + bi.used + '>' + bi.limit)
	}
	const solid = (b) => b.board.map((id) => (id >= 0 && V.solidTypes.has(b.ty[id]) ? b.sd[id] + b.ty[id] : '.')).join(',')
	const first = solid(s.worlds[0].b)
	for (const { b } of s.worlds) {
		if (solid(b) !== first) err('solid differs')
	}
	if (s.turn !== s.worlds[0].b.x.s && !s.result) err('turn')
}

export function seeded(seed) {
	let a = seed >>> 0
	return () => {
		a = (a + 0x6d2b79f5) >>> 0
		let t = a
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
