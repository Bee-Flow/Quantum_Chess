// Prototype of four-player chess (research only), built on the real src/variants/core.
import { rectTopology, FILE_LETTERS } from '/home/user/Quantum_Chess/src/variants/core/topology.js'
import { defineVariant } from '/home/user/Quantum_Chess/src/variants/core/variant.js'
import { orthodoxTypes, pawnExtras } from '/home/user/Quantum_Chess/src/variants/core/orthodox.js'
import { addPiece, emptyWorld, hasRoyal, placePiece, attacks, royalSquares, OFF } from '/home/user/Quantum_Chess/src/variants/core/world.js'

const exists = (f, r) => !((f < 3 || f > 10) && (r < 3 || r > 10))

// labels hugging the cross
const labels = []
for (let f = 0; f < 14; f++) {
	const low = f < 3 || f > 10 ? 3 : 0
	labels.push({ x: f + 0.5, y: 14 - low + 0.32, text: FILE_LETTERS[f] })
}
for (let r = 0; r < 14; r++) {
	const left = r < 3 || r > 10 ? 3 : 0
	labels.push({ x: left - 0.3, y: 14 - r - 0.5, text: String(r + 1) })
}
const topology = rectTopology(14, 14, {
	exists,
	shade: (f, r) => ((f + r) % 2 === 0 ? 'light' : 'dark'),
	noLabels: true,
	layout: { labels },
})

/** rotate a vector clockwise (y up) `side` quarter turns */
export function orient(side, v) {
	let [a, b] = v
	for (let i = 0; i < side; i++) {
		[a, b] = [b, -a]
	}
	return [a, b]
}
/** rotate a square's coordinates clockwise about the centre */
function rotSq(side, [x, y]) {
	for (let i = 0; i < side; i++) {
		[x, y] = [y, 13 - x]
	}
	return [x, y]
}
/** steps forward from the own back rank */
export function progress(side, sq) {
	const [x, y] = topology.coords[sq]
	return [y, x, 13 - y, 13 - x][side]
}
const promoLine = (w) => (w.x.teams ? 10 : 7)

const spec = {
	id: 'fourplayer',
	category: 'boards',
	rules: () => [],
	sides: [
		{ id: 'r', name: 'Red', color: 'red', rotate: 0 },
		{ id: 'b', name: 'Blue', color: 'blue', rotate: 270 },
		{ id: 'y', name: 'Yellow', color: 'yellow', rotate: 180 },
		{ id: 'g', name: 'Green', color: 'green', rotate: 90 },
	],
	topology,
	orient,
	maxPly: 1200,
	quietPlies: 200,
	passWhenStuck: true,
	types: (() => {
		const T = orthodoxTypes({ lastRank: () => false })
		T.q.value = 1000
		T.b.value = 450
		T.n.value = 300
		T.p.promote = { zone: (side, to, from, w) => progress(side, to) === promoLine(w), to: ['q', 'r', 'b', 'n'] }
		return T
	})(),
	options: [{ id: 'mode', type: 'choice', values: [{ id: 'ffa' }, { id: 'teams' }], default: 'ffa' }],
	setup(options = {}) {
		const w = emptyWorld(spec)
		const back = 'rnbqkbnr'
		for (let side = 0; side < 4; side++) {
			for (let i = 0; i < 8; i++) {
				addPiece(w, back[i], side, topology.at(rotSq(side, [3 + i, 0])))
			}
			for (let i = 0; i < 8; i++) {
				addPiece(w, 'p', side, topology.at(rotSq(side, [3 + i, 1])))
			}
		}
		w.x = { teams: options.mode === 'teams', ep: -1, epVictim: -1, castle: castleRights() }
		return w
	},
	extraMoves(w, side) {
		return [
			...pawnExtras(spec, w, side, (s, sq) => progress(s, sq) === 1),
			...castling(w, side),
		]
	},
	filterMoves(w, side, list) {
		if (!w.x.teams) {
			return list
		}
		return list.filter((m) => m.capture < 0 || (w.sd[m.capture] % 2) !== (side % 2))
	},
	afterMove(next, m, prev) {
		// en passant square: the midpoint of a double step
		if (m.kind === 'double') {
			const [x1, y1] = topology.coords[m.from]
			const [x2, y2] = topology.coords[m.to]
			next.x.ep = topology.at([(x1 + x2) / 2, (y1 + y2) / 2])
			next.x.epVictim = m.to
		} else {
			next.x.ep = -1
			next.x.epVictim = -1
		}
		if (next.x.castle.length) {
			next.x.castle = next.x.castle.filter((c) => ![c.king, c.rook].includes(m.from) && ![c.king, c.rook].includes(m.to))
		}
		// FFA: a captured king takes its whole army off the board
		if (m.capture >= 0 && prev.ty[m.capture] === 'k' && !next.x.teams) {
			const victim = prev.sd[m.capture]
			for (let id = 0; id < next.sq.length; id++) {
				if (next.sd[id] === victim && next.sq[id] >= 0) {
					placePiece(next, id, OFF)
				}
			}
			next.x.castle = next.x.castle.filter((c) => c.side !== victim)
		}
	},
	isOut: (b, s) => !hasRoyal(spec, b, s),
	worldResult(b) {
		const alive = [0, 1, 2, 3].filter((s) => hasRoyal(spec, b, s))
		if (b.x.teams) {
			const lost = [0, 1, 2, 3].find((s) => !alive.includes(s))
			if (lost === undefined) return null
			return { winner: null, winners: lost % 2 === 0 ? [1, 3] : [0, 2], reason: 'king' }
		}
		if (alive.length === 1) return { winner: alive[0], reason: 'king' }
		return null
	},
	budgetLimit(b) {
		if (b.x.teams) return 2
		const alive = [0, 1, 2, 3].filter((s) => hasRoyal(spec, b, s)).length
		return alive >= 4 ? 2 : alive === 3 ? 4 : 8
	},
	evaluate(b, side) {
		let score = 0
		const k = royalSquares(spec, b, side)[0]
		if (k !== undefined) {
			for (let e = 0; e < 4; e++) {
				if (e !== side && (!b.x.teams || e % 2 !== side % 2) && hasRoyal(spec, b, e) && attacks(spec, b, e, k)) {
					score -= 1500
					break
				}
			}
		}
		if (b.x.teams) {
			const mat = [0, 0, 0, 0]
			for (let id = 0; id < b.sq.length; id++) if (b.sq[id] >= 0) mat[b.sd[id]] += spec.types[b.ty[id]].value
			const partner = (side + 2) % 4
			const e1 = (side + 1) % 4
			const e2 = (side + 3) % 4
			score += (4 * mat[partner] - 2 * (mat[e1] + mat[e2])) / 3
		}
		return score
	},
}

function castleRights() {
	const out = []
	for (let side = 0; side < 4; side++) {
		const at = (x) => topology.at(rotSq(side, [x, 0]))
		out.push({ flag: 'K', side, king: at(7), rook: at(10), kingTo: at(9), rookTo: at(8) })
		out.push({ flag: 'Q', side, king: at(7), rook: at(3), kingTo: at(5), rookTo: at(6) })
	}
	return out
}
function castling(w, side) {
	const out = []
	for (const c of w.x.castle ?? []) {
		if (c.side !== side) continue
		const king = w.board[c.king]
		const rook = w.board[c.rook]
		if (king < 0 || rook < 0 || w.ty[king] !== 'k' || w.ty[rook] !== 'r' || w.sd[king] !== side || w.sd[rook] !== side) continue
		const [kx, ky] = topology.coords[c.king]
		const [rx, ry] = topology.coords[c.rook]
		const n = Math.max(Math.abs(rx - kx), Math.abs(ry - ky))
		const dx = Math.sign(rx - kx)
		const dy = Math.sign(ry - ky)
		let clear = true
		for (let i = 1; i < n; i++) {
			if (w.board[topology.at([kx + i * dx, ky + i * dy])] !== -1) clear = false
		}
		if (!clear) continue
		out.push({
			key: c.flag === 'K' ? 'O-O' : 'O-O-O', from: c.king, to: c.kingTo, id: king, capture: -1, promo: null, drop: null,
			kind: 'castle', extra: { rook: { id: rook, to: c.rookTo }, kingTo: c.kingTo },
		})
	}
	return out
}

export const FOUR = defineVariant(spec)
