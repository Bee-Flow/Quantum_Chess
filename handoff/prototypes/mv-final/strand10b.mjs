// Probe: why the easy computer played a stranding move valued 0 while 1540 was available (seed 10)
import { V, P, Q, seeded } from '../../tmp/mv-final/libf.mjs'
import { chooseMove } from '../../tmp/mv-final/core/ai.mjs'
const rng = seeded(10)
let s = Q.newGame(V, { setup: 'marauders', timelines: '3' })
while (!s.result && s.ply < 200) {
	const t0 = performance.now()
	const code = await chooseMove(V, s, { level: 'easy', rng })
	const ms = performance.now() - t0
	const cands = Q.legalMoves(V, P.aiView(s)).length
	if (ms > 300 || s.ply >= 18) console.log('ply', s.ply, 'side', s.turn, code, Math.round(ms) + ' ms', 'view candidates', cands)
	s = Q.applyMove(V, s, code, rng).state
}
console.log(JSON.stringify(s.result))
