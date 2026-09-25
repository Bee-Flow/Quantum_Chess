// Replays computer game seed 2 (aigames.mjs) and prints the states at chosen plies: node game2.mjs 6 11 18 20 23
import { V, Q, P, show, seeded } from './lib.mjs'
import { chooseMove } from './core/ai.mjs'
const want = new Set(process.argv.slice(2).map(Number))
const rng = seeded(2)
let s = Q.newGame(V, { setup: 'small', timelines: '2' })
while (!s.result && s.ply < 200) {
	const code = await chooseMove(V, s, { level: 'normal', rng })
	const res = Q.applyMove(V, s, code, rng)
	const prev = s
	s = res.state
	if (want.has(s.ply)) {
		console.log(`\n=== after ply ${s.ply}: ${prev.turn ? 'B' : 'W'} ${code}  outcomes ${res.outcomes.map((o) => o.key + ' ' + Math.round(o.weight / Q.T * 100) + '%').join(' / ')} -> ${res.branch.key}; danger W ${Q.royalDanger(V, s, 0).toFixed(2)} B ${Q.royalDanger(V, s, 1).toFixed(2)}`)
		console.log(show(s))
	}
}
