// Computer against computer (level normal), to check that the AI copes with the 10 x 8 board and the new pieces.
import { CAPA as V } from './proto.mjs'
import { seededRng } from '../../../src/engine/index.js'
import { applyMove, newGame } from '../../../src/variants/core/quantum.js'
import { chooseMove } from '../../../src/variants/core/ai.js'
const rng = seededRng(42)
let s = newGame(V, {})
const t0 = Date.now()
const line = []
let slow = 0
for (let ply = 0; ply < 80 && !s.result; ply++) {
	const t1 = Date.now()
	const m = await chooseMove(V, s, { level: 'normal', rng })
	slow = Math.max(slow, Date.now() - t1)
	line.push(m)
	s = applyMove(V, s, m, rng).state
}
console.log(line.join(' '))
console.log('plies', s.ply, 'result', s.result, 'worlds', s.worlds.length, 'total ms', Date.now() - t0, 'slowest move ms', slow)
