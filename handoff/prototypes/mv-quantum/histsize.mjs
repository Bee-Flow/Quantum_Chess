import { V, Q, seeded } from './lib.mjs'
import { chooseMove } from './core/ai.mjs'
const rng = seeded(99)
let s = Q.newGame(V, { setup: 'small' })
let n = 0
while (!s.result && s.ply < 120) {
	const code = await chooseMove(V, s, { level: 'easy', rng })
	s = Q.applyMove(V, s, code, rng).state
}
const h = JSON.stringify(s.history).length
console.log('plies', s.ply, 'history bytes', h, 'per ply', Math.round(h / s.ply), 'state bytes', JSON.stringify(s).length, 'worlds', s.worlds.length)
