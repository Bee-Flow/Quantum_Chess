// The cost of one UI move on the largest states: node uicost.mjs <setup> <timelines>
import { V, Q, seeded } from './lib.mjs'
import { layoutOf } from './layout.mjs'
const setup = process.argv[2] ?? 'small'
const tl = process.argv[3] ?? '2'
let big = null
for (let g = 0; g < 10; g++) {
	const rng = seeded(900 + g)
	let s = Q.newGame(V, { setup, timelines: tl })
	for (let ply = 0; ply < 150 && !s.result; ply++) {
		let codes = Q.legalMoves(V, s).map((m) => m.code)
		if (ply % 3 === 1) {
			const froms = new Set()
			for (const { b } of s.worlds) {
				for (let id = 0; id < b.sq.length; id++) {
					if (b.sd[id] === s.turn && b.sq[id] >= 0 && V.types[b.ty[id]]?.splittable) froms.add(b.sq[id])
				}
			}
			for (const f of froms) {
				const sp = Q.splitsFrom(V, s, f).map((m) => m.code)
				if (sp.length) { codes = sp; break }
			}
		}
		s = Q.applyMove(V, s, codes[Math.floor(rng() * codes.length)], rng).state
		if (!s.result && (!big || s.worlds.length * s.worlds[0].b.board.length > big.worlds.length * big.worlds[0].b.board.length)) big = s
	}
}
const t = (f) => { const t0 = performance.now(); const r = f(); return [performance.now() - t0, r] }
const s = JSON.parse(JSON.stringify(big))
const [a, moves] = t(() => Q.legalMoves(V, s))
const [b] = t(() => Q.royalDanger(V, s, s.turn))
const [c, L] = t(() => layoutOf(s))
const [d] = t(() => Q.boardView(s, L.size))
const code = moves.find((m) => m.type === 'move').code
const [e] = t(() => Q.applyMove(V, s, code, () => 0.5))
const [f] = t(() => Q.splitsFrom(V, s, moves.find((m) => m.type === 'move').from))
console.log(`${setup}/${tl}: ${s.worlds.length} worlds, ${s.worlds[0].b.x.tl.filter(Boolean).length} rows | legalMoves ${a.toFixed(1)} ms (${moves.length}) | royalDanger ${b.toFixed(1)} | layoutOf ${c.toFixed(1)} | boardView ${d.toFixed(1)} | applyMove ${e.toFixed(1)} | splitsFrom ${f.toFixed(1)} | total ${(a + b + c + d + e).toFixed(1)} ms`)
