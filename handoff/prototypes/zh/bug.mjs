// Prototype of bughouse on the variants core (with a team budget patch), only to check the research test cases.
const R = '/home/user/Quantum_Chess/src/variants/core/'
const { defineVariant } = await import(R + 'variant.js')
const { orthodoxTypes, pawnExtras } = await import(R + 'orthodox.js')
const { makeTopology, FILE_LETTERS } = await import(R + 'topology.js')
const { HAND, OFF, addPiece, emptyWorld, placePiece, handOf, dropKey, moveKey } = await import(R + 'world.js')
const { CURRENT } = await import('./quantum_team.js')

const GAP = 0.8
const coords = []
for (const bd of [0, 1]) for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) coords.push([f, r, bd])
const labels = []
for (let f = 0; f < 8; f++) {
	labels.push({ x: f + 0.5, y: 8.32, text: FILE_LETTERS[f] })
	labels.push({ x: 8 + GAP + (7 - f) + 0.5, y: 8.32, text: FILE_LETTERS[f] })
}
for (let r = 0; r < 8; r++) {
	labels.push({ x: -0.3, y: 7 - r + 0.5, text: String(r + 1) })
	labels.push({ x: 16 + GAP + 0.3, y: r + 0.5, text: String(r + 1) })
}
const topology = makeTopology({
	coords,
	name: ([f, r, bd]) => (bd ? 'B' : 'A') + ':' + FILE_LETTERS[f] + (r + 1),
	cell: ([f, r, bd]) => ({
		x: bd ? 8 + GAP + (7 - f) : f,
		y: bd ? r : 7 - r,
		w: 1,
		h: 1,
		shape: 'rect',
		shade: (f + r) % 2 === 0 ? 'dark' : 'light',
	}),
	layout: {
		width: 16 + GAP,
		height: 8,
		labels,
		boards: [{ x: 0, y: 0, w: 8, h: 8, label: 'A' }, { x: 8 + GAP, y: 0, w: 8, h: 8, label: 'B' }],
	},
})
const rankOf = (sq) => topology.coords[sq][1]
const boardOfSq = (sq) => topology.coords[sq][2]
export const boardOf = (side) => (side === 1 || side === 2 ? 1 : 0)
export const isBlack = (side) => side >= 2
export const partner = (side) => (side + 2) % 4
export const team = (side) => side % 2
const PROMOTED = { '+q': 'q', '+r': 'r', '+b': 'b', '+n': 'n' }
const types = orthodoxTypes({ lastRank: (side, sq) => rankOf(sq) === (isBlack(side) ? 0 : 7) })
Object.assign(types.p, { value: 100 }); types.n.value = 220; types.b.value = 200; types.r.value = 230; types.q.value = 420
for (const [p, base] of Object.entries(PROMOTED)) types[p] = { ...types[base], glyph: { sprite: base, promoted: true } }
const at = (f, r, bd) => topology.at([f, r, bd])
function handKey(b) {
	const out = []
	for (let id = 0; id < b.sq.length; id++) if (b.sq[id] === HAND) out.push(b.sd[id] + b.ty[id])
	return out.sort().join('')
}
function castlingMovesB(V, w, side) {
	const out = []
	for (const c of w.x.castle) {
		if (c.side !== side) continue
		const king = w.board[c.king]; const rook = w.board[c.rook]
		if (king < 0 || rook < 0 || w.ty[king] !== 'k' || w.ty[rook] !== 'r' || w.sd[king] !== side || w.sd[rook] !== side) continue
		const [kf, r, bd] = topology.coords[c.king]; const rf = topology.coords[c.rook][0]
		const ktf = topology.coords[c.kingTo][0]; const rtf = topology.coords[c.rookTo][0]
		const lo = Math.min(kf, rf, ktf, rtf); const hi = Math.max(kf, rf, ktf, rtf)
		let ok = true
		for (let f = lo; f <= hi; f++) { const s = at(f, r, bd); if (s !== c.king && s !== c.rook && w.board[s] !== -1) ok = false }
		if (!ok) continue
		out.push({ key: c.long ? 'O-O-O' : 'O-O', from: c.king, to: c.kingTo, id: king, capture: -1, promo: null, drop: null, kind: 'castle', extra: { rook: { id: rook, to: c.rookTo }, kingTo: c.kingTo } })
	}
	return out
}
const spec = {
	id: 'bughouse',
	category: 'rules',
	drops: true,
	rules: () => [],
	sides: [
		{ id: 'aw', name: 'White A', color: 'white', rotate: 0 },
		{ id: 'bw', name: 'White B', color: 'white', rotate: 180 },
		{ id: 'bb', name: 'Black B', color: 'black', rotate: 0 },
		{ id: 'ab', name: 'Black A', color: 'black', rotate: 180 },
	],
	teams: [[0, 2], [1, 3]],
	enemies: (a, b) => team(a) !== team(b),
	orient: (side, vec) => { if (!isBlack(side)) return vec; const v = vec.slice(); v[1] = -v[1]; return v },
	budgetSides: (side) => [side, partner(side)],
	maxPly: 1200,
	quietPlies: 200,
	topology,
	types,
	setup() {
		const w = emptyWorld(spec)
		const back = 'rnbqkbnr'
		const castle = []
		for (const [side, bd, br, pr] of [[0, 0, 0, 1], [3, 0, 7, 6], [1, 1, 0, 1], [2, 1, 7, 6]]) {
			for (let f = 0; f < 8; f++) addPiece(w, back[f], side, at(f, br, bd))
			for (let f = 0; f < 8; f++) addPiece(w, 'p', side, at(f, pr, bd))
			castle.push({ side, long: false, king: at(4, br, bd), rook: at(7, br, bd), kingTo: at(6, br, bd), rookTo: at(5, br, bd) })
			castle.push({ side, long: true, king: at(4, br, bd), rook: at(0, br, bd), kingTo: at(2, br, bd), rookTo: at(3, br, bd) })
		}
		w.x = { ep: [-1, -1], epVictim: [-1, -1], castle }
		return w
	},
	extraMoves(w, side) {
		const bd = boardOf(side)
		const view = { ...w, x: { ep: w.x.ep[bd], epVictim: w.x.epVictim[bd] } }
		const out = [
			...pawnExtras(spec, view, side, (s, sq) => rankOf(sq) === (isBlack(s) ? 6 : 1)),
			...castlingMovesB(spec, w, side),
		]
		for (const [type, ids] of handOf(w, side)) {
			for (let sq = bd * 64; sq < bd * 64 + 64; sq++) {
				if (w.board[sq] !== -1) continue
				const r = rankOf(sq)
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
		next.sd[victim] = partner(next.sd[m.id])
		next.ty[victim] = PROMOTED[t] ? 'p' : t
	},
	afterMove(next, m) {
		const bd = boardOfSq(m.to)
		next.x.ep = next.x.ep.slice(); next.x.epVictim = next.x.epVictim.slice()
		if (m.kind === 'double') {
			const [f, r1] = topology.coords[m.from]; const r2 = topology.coords[m.to][1]
			next.x.ep[bd] = at(f, (r1 + r2) / 2, bd); next.x.epVictim[bd] = m.to
		} else { next.x.ep[bd] = -1; next.x.epVictim[bd] = -1 }
		next.x.castle = next.x.castle.filter((c) => !(m.from === c.king || m.from === c.rook || m.to === c.rook || m.to === c.king))
		if (m.promo) next.ty[m.id] = '+' + m.promo
	},
	worldResult(b) {
		for (let s = 0; s < 4; s++) {
			let alive = false
			for (let id = 0; id < b.sq.length; id++) if (b.sd[id] === s && b.ty[id] === 'k' && b.sq[id] >= 0) alive = true
			if (!alive) return { winner: null, winners: [(s + 1) % 4, (s + 3) % 4], reason: 'king' }
		}
		return null
	},
	solidExtra: handKey,
}
export const BUG = defineVariant(spec)
CURRENT.V = BUG
