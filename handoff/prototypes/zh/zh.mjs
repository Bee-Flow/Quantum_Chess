// Prototype of crazyhouse on the real variants core, only to check the research test cases.
const R = '/home/user/Quantum_Chess/src/variants/core/'
const { orthodoxSpec } = await import(R + 'orthodoxVariant.js')
const { defineVariant } = await import(R + 'variant.js')
const { pawnExtras, castlingMoves, orthodoxAfterMove } = await import(R + 'orthodox.js')
const { HAND, OFF, addPiece, placePiece, handOf, dropKey } = await import(R + 'world.js')

const PROMOTED = { '+q': 'q', '+r': 'r', '+b': 'b', '+n': 'n' }
const spec = orthodoxSpec()
const board = spec.board
spec.types.p.value = 100
spec.types.n.value = 220
spec.types.b.value = 200
spec.types.r.value = 230
spec.types.q.value = 420
for (const [p, base] of Object.entries(PROMOTED)) {
	spec.types[p] = { ...spec.types[base], glyph: { sprite: base, promoted: true } }
}
export function handKey(b) {
	const out = []
	for (let id = 0; id < b.sq.length; id++) if (b.sq[id] === HAND) out.push(b.sd[id] + b.ty[id])
	return out.sort().join('')
}
Object.assign(spec, {
	id: 'crazyhouse',
	category: 'rules',
	drops: true,
	rules: () => [],
	extraMoves(w, side) {
		const out = [
			...pawnExtras(spec, w, side, (s, sq) => board.rankOf(sq) === (s === 0 ? 1 : 6)),
			...castlingMoves(spec, w, side),
		]
		for (const [type, ids] of handOf(w, side)) {
			for (let sq = 0; sq < 64; sq++) {
				if (w.board[sq] !== -1) continue
				const r = board.rankOf(sq)
				if (type === 'p' && (r === 0 || r === 7)) continue
				out.push({ key: dropKey(spec, type, sq), from: -1, to: sq, id: ids[0], capture: -1, promo: null, drop: type, kind: 'drop' })
			}
		}
		return out
	},
	onCapture(next, victim, m) {
		const t = next.ty[victim]
		if (spec.types[t].royal) { placePiece(next, victim, OFF); return }
		placePiece(next, victim, HAND)
		next.sd[victim] = next.sd[m.id]
		next.ty[victim] = PROMOTED[t] ? 'p' : t
	},
	afterMove(next, m) {
		orthodoxAfterMove(spec, next, m)
		if (m.promo) next.ty[m.id] = '+' + m.promo
		if (m.kind === 'drop') {
			const side = next.sd[m.id]
			placePiece(next, m.id, OFF)
			addPiece(next, m.drop, side, m.to)
		}
	},
	solidExtra: handKey,
})
export const ZH = defineVariant(spec)
