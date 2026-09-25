// State sizes in computer games and in split-heavy random games: node sizes.mjs <setup> <timelines>
import { V, Q, seeded } from './lib.mjs'
import { chooseMove } from './core/ai.mjs'
const setup = process.argv[2] ?? 'small'
const tl = process.argv[3] ?? '2'
const kb = (o) => JSON.stringify(o).length / 1024
let maxState = 0, maxWorlds = 0, sum = 0, n = 0, histPerPly = 0, hp = 0
for (let g = 0; g < 4; g++) {
	const rng = seeded(500 + g)
	let s = Q.newGame(V, { setup, timelines: tl })
	while (!s.result && s.ply < 160) {
		const code = await chooseMove(V, s, { level: 'easy', rng })
		s = Q.applyMove(V, s, code, rng).state
		const k = kb(s)
		maxState = Math.max(maxState, k)
		maxWorlds = Math.max(maxWorlds, s.worlds.length)
		sum += k
		n++
	}
	if (s.ply) {
		histPerPly += JSON.stringify(s.history).length / s.ply
		hp++
	}
}
console.log(`${setup}/${tl} computer games: state avg ${(sum / n).toFixed(1)} KB, max ${maxState.toFixed(1)} KB, max worlds ${maxWorlds}, history ${(histPerPly / hp).toFixed(0)} B per ply`)
// the largest state of the random split-heavy games (the fuzz policy)
let big = 0, bigW = 0, perWorld = 0
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
		const k = kb(s.worlds)
		if (k > big) { big = k; bigW = s.worlds.length; perWorld = k / s.worlds.length }
	}
}
console.log(`${setup}/${tl} split-heavy random games: worlds max ${big.toFixed(0)} KB at ${bigW} worlds (${perWorld.toFixed(1)} KB per world)`)
