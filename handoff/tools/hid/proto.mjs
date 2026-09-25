// Prototype of the darkchess / kriegspiel hooks, to compute the expected values of the spec's test cases.
import { orthodoxSpec } from '/home/user/Quantum_Chess/src/variants/core/orthodoxVariant.js'
import { defineVariant } from '/home/user/Quantum_Chess/src/variants/core/variant.js'
import { newGame, legalMoves, branches, applyOutcome, royalDanger, ordinaryMoves, T, pieceLocations, splitTargets, squareView } from '/home/user/Quantum_Chess/src/variants/core/quantum.js'
import { generate, worldFrom, pieceMoves, cloneWorld, worldKey } from '/home/user/Quantum_Chess/src/variants/core/world.js'

export const V = defineVariant(Object.assign(orthodoxSpec(), { id: 'x', category: 'uncertainty' }))
const N = (s) => V.topology.names[s]
export const names = (set) => [...set].map(N).sort((a, b) => (a[1] + a[0]).localeCompare(b[1] + b[0]))

export function visibility(state, side) {
	const out = new Set()
	for (const { b } of state.worlds) {
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sd[id] === side && b.sq[id] >= 0) out.add(b.sq[id])
		}
		for (const m of generate(V, b, side).values()) {
			out.add(m.to)
			if (m.kind === 'ep') out.add(b.sq[m.capture])
		}
	}
	return out
}

export function ownOnly(state, side) {
	const map = new Map()
	for (const { b, w } of state.worlds) {
		const c = cloneWorld(b)
		for (let id = 0; id < c.sq.length; id++) {
			if (c.sd[id] !== side && c.sq[id] >= 0) { c.board[c.sq[id]] = -1; c.sq[id] = -1 }
		}
		c.x = { ...c.x, ep: -1, epVictim: -1, castle: (c.x.castle ?? []).filter((r) => r.side === side) }
		const k = worldKey(c)
		if (map.has(k)) map.get(k).w += w; else map.set(k, { b: c, w })
	}
	return { ...state, worlds: [...map.values()], history: [] }
}

export function candidateMoves(state) {
	const side = state.turn
	const own = ownOnly(state, side)
	const byKey = new Map()
	for (const m of ordinaryMoves(V, own)) byKey.set(m.code, m)
	for (const { b } of own.worlds) {
		const out = []
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sd[id] === side && b.sq[id] >= 0 && b.ty[id] === 'p') pieceMoves(V, b, id, out, { ghostEnemies: true })
		}
		for (const m of out) if (!byKey.has(m.key)) byKey.set(m.key, { code: m.key, type: 'move', from: m.from, to: m.to, promo: m.promo, drop: null, kind: m.kind })
	}
	return [...byKey.values()]
}

function diagDir(ksq, fsq) {
	const [kf, kr] = V.topology.coords[ksq]
	const [ff, fr] = V.topology.coords[fsq]
	const dx = ff - kf, dy = fr - kr
	if (dy === 0) return 'rank'
	if (dx === 0) return 'file'
	if (Math.abs(dx) === Math.abs(dy)) {
		const lenMain = 8 - Math.abs(kf - kr) // a1-h8 direction
		const lenAnti = 8 - Math.abs(kf + kr - 7)
		const main = Math.sign(dx) === Math.sign(dy)
		const len = main ? lenMain : lenAnti
		const other = main ? lenAnti : lenMain
		return len > other ? 'long diagonal' : 'short diagonal'
	}
	return 'knight'
}

export function checkInfo(state) {
	const side = state.turn
	if (state.result) return null
	const dirs = new Set()
	for (const { b } of state.worlds) {
		for (const m of generate(V, b, 1 - side).values()) {
			if (m.capture >= 0 && b.ty[m.capture] === 'k' && b.sd[m.capture] === side) dirs.add(diagDir(m.to, m.from))
		}
	}
	if (!dirs.size) return null
	return { dirs: [...dirs].sort(), p: royalDanger(V, state, side) }
}

export function pawnTries(state) {
	const side = state.turn
	const pairs = new Set()
	for (const { b } of state.worlds) {
		for (const m of generate(V, b, side).values()) {
			if (b.ty[m.id] === 'p' && m.capture >= 0) pairs.add(m.from + '-' + m.to)
		}
	}
	return pairs.size
}

export function st(worlds, turn = 0, x = null) {
	const total = worlds.reduce((a, [, w]) => a + w, 0)
	let rest = T
	const list = worlds.map(([p, rel], i) => {
		const b = worldFrom(V, p, x ? JSON.parse(JSON.stringify(x)) : { ep: -1, epVictim: -1, castle: [] })
		const w = i === worlds.length - 1 ? rest : Math.floor((T * rel) / total)
		rest -= w
		return { b, w }
	})
	return { v: 1, variant: 'x', options: {}, worlds: list, turn, ply: 0, quiet: 0, result: null, history: [] }
}
export const br = (s, code) => { const l = branches(V, s, code); return l ? l.map((b) => ({ key: b.key, p: b.weight / T, notes: b.notes, captures: b.captures.map(N) })) : null }
export { newGame, legalMoves, branches, applyOutcome, royalDanger, T, pieceLocations, splitTargets, squareView, N }
