import { V, Q, P, show, invariants, seeded } from './lib.mjs'
import { chooseMove } from './core/ai.mjs'
const rng = seeded(Number(process.argv[2] ?? 7))
let s = Q.newGame(V, { setup: 'small', timelines: '2' })
const log = []
while (!s.result && s.ply < 200) {
	const code = await chooseMove(V, s, { level: 'normal', rng })
	const res = Q.applyMove(V, s, code, rng)
	log.push((s.turn ? 'B ' : 'W ') + code + (res.outcomes.length > 1 ? ' [' + res.branch.key + ' ' + Math.round(res.branch.weight / Q.T * 100) + '%]' : '') + ' dangerW=' + Q.royalDanger(V, res.state, 0).toFixed(2) + ' dangerB=' + Q.royalDanger(V, res.state, 1).toFixed(2))
	s = res.state
}
console.log(log.join('\n'))
console.log(JSON.stringify(s.result))
console.log(show(s))
