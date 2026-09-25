// Probe: chooseMove's real-state filter (core ai.js: candidates(view).filter((c) => branches(V, real, c))) runs
// before any clock check; cost at large states where aiView prunes (must-move + optional boards).
import { V, P, Q, seeded } from '../../tmp/mv-final/libf.mjs'
const setup = process.argv[2] ?? 'standard'
let worst = 0, info = ''
for (let g = 0; g < Number(process.env.GAMES ?? 8); g++) {
	const rng = seeded(900 + g)
	let s = Q.newGame(V, { setup, timelines: '3' })
	for (let ply = 0; ply < 150 && !s.result; ply++) {
		let codes = Q.legalMoves(V, s).map((m) => m.code)
		if (ply % 3 === 1) {
			const froms = new Set()
			for (const { b } of s.worlds) for (let id = 0; id < b.sq.length; id++) if (b.sd[id] === s.turn && b.sq[id] >= 0 && V.types[b.ty[id]]?.splittable) froms.add(b.sq[id])
			for (const f of froms) { const sp = Q.splitsFrom(V, s, f).map((m) => m.code); if (sp.length) { codes = sp; break } }
		}
		s = Q.applyMove(V, s, codes[Math.floor(rng() * codes.length)], rng).state
		if (!s.result && s.worlds.length >= 16) {
			const view = P.aiView(s)
			if (view === s) continue
			const c = JSON.parse(JSON.stringify(s))
			const v2 = P.aiView(c)
			const cands = Q.legalMoves(V, v2).map((m) => m.code)
			const t0 = performance.now()
			cands.filter((code) => Q.branches(V, c, code))
			const ms = performance.now() - t0
			if (ms > worst) { worst = ms; info = `${c.worlds.length} worlds, ${cands.length} candidates` }
		}
	}
}
console.log(`${setup}: worst real-state filter ${worst.toFixed(0)} ms (${info}) before the first clock check`)
