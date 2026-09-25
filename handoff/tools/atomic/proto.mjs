// Prototype of the atomic hooks on the real variant core, to compute the expected values of the spec's test cases.
const R = '/home/user/Quantum_Chess/src/variants/core/'
const { orthodoxSpec } = await import(R + 'orthodoxVariant.js')
const { orthodoxAfterMove, KING_STEPS } = await import(R + 'orthodox.js')
const { defineVariant } = await import(R + 'variant.js')
const Q = await import(R + 'quantum.js')
const W = await import(R + 'world.js')

const VALUES = { k: 400, q: 560, r: 270, b: 190, n: 150, p: 100 }

/** The squares of the blast around a centre: the centre and its (up to) 8 neighbours. */
function blast(V, c) {
	const out = [c]
	for (const v of KING_STEPS) {
		const s = V.topology.step(c, v)
		if (s >= 0) out.push(s)
	}
	return out
}
function kingSq(w, side) {
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sd[id] === side && w.ty[id] === 'k' && w.sq[id] >= 0) return w.sq[id]
	}
	return -1
}
function near(V, a, b) {
	const [fa, ra] = V.topology.coords[a]
	const [fb, rb] = V.topology.coords[b]
	return Math.max(Math.abs(fa - fb), Math.abs(ra - rb)) <= 1
}

const spec = orthodoxSpec()
spec.id = 'atomic'
spec.category = 'rules'
spec.rules = () => []
spec.types.k.moves = [{ leap: KING_STEPS, mode: 'move' }]
for (const [t, v] of Object.entries(VALUES)) spec.types[t].value = v
spec.filterMoves = (w, side, list) => {
	const k = kingSq(w, side)
	if (k < 0) return list
	return list.filter((m) => m.capture < 0 || !near(spec, m.to, k))
}
spec.afterMove = (next, m) => {
	orthodoxAfterMove(spec, next, m)
	if (m.capture < 0) return
	const area = blast(spec, m.to)
	for (const s of area) {
		const id = next.board[s]
		if (id >= 0 && (s === m.to || next.ty[id] !== 'p')) W.placePiece(next, id, W.OFF)
	}
	if (next.x.castle?.length) {
		next.x.castle = next.x.castle.filter((c) => !area.includes(c.rook) && !area.includes(c.king))
	}
}
spec.worldResult = (w) => {
	const wk = kingSq(w, 0) >= 0
	const bk = kingSq(w, 1) >= 0
	if (!wk || !bk) {
		return wk === bk ? { winner: null, reason: 'exploded' } : { winner: wk ? 0 : 1, reason: 'exploded' }
	}
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sq[id] >= 0 && w.ty[id] !== 'k') return null
	}
	return { winner: null, reason: 'bareKings' }
}
export const V = defineVariant(spec)
export { Q, W }
