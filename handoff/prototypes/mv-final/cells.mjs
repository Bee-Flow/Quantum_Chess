// Probe: every drawn square once, inside the layout, with a name; board rectangles never overlap.
import { V, P, Q, seeded } from '../../tmp/mv-final/libf.mjs'
import { layoutOf } from '../../tmp/mv-final/layoutf.mjs'
let bad = 0, states = 0
for (const setup of ['small', 'standard', 'marauders', 'invasion', 'twotimelines', 'turnzero']) {
	for (let g = 1; g <= 4; g++) {
		const rng = seeded(g * 7)
		let s = Q.newGame(V, { setup, timelines: '3' })
		while (!s.result && s.ply < 80) {
			states++
			const L = layoutOf(s)
			const seen = new Set()
			for (const c of L.cells) {
				if (seen.has(c.sq)) { bad++; console.log(setup, 'dup', c.sq) }
				seen.add(c.sq)
				if (!L.names[c.sq]) { bad++; console.log(setup, 'no name', c.sq) }
				if (c.x < 0 || c.y < 0 || c.x + 1 > L.layout.width + 1e-9 || c.y + 1 > L.layout.height + 1e-9) { bad++; console.log(setup, 'outside', c.sq) }
				if (c.sq >= L.size) { bad++; console.log(setup, 'beyond size', c.sq) }
			}
			const bs = L.layout.boards
			for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
				const a = bs[i], b = bs[j]
				if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) { bad++; console.log(setup, 'overlap', a.label, b.label) }
			}
			// every square holding a piece in some world is drawn
			for (const { b } of s.worlds) for (let sq = 0; sq < b.board.length; sq++) if (b.board[sq] >= 0 && !seen.has(sq)) { bad++; console.log(setup, 'piece not drawn', P.topology.names[sq]); break }
			const ms = Q.legalMoves(V, s)
			s = Q.applyMove(V, s, ms[Math.floor(rng() * ms.length)].code, rng).state
		}
	}
}
console.log({ states, problems: bad })
