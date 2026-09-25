import { FOUR as V } from './proto.mjs'
import { newGame, applyMove } from '/home/user/Quantum_Chess/src/variants/core/quantum.js'
import { chooseMove } from '/home/user/Quantum_Chess/src/variants/core/ai.js'
let seed = 11
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
let s = newGame(V, { mode: 'ffa' })
for (let i = 0; i < 24 && !s.result; i++) {
  const t0 = Date.now()
  const code = await chooseMove(V, s, { level: i % 2 ? 'hard' : 'normal', rng })
  const dt = Date.now() - t0
  s = applyMove(V, s, code, rng).state
  console.log(i, ['R','B','Y','G'][s.history.at(-1).side], code, s.history.at(-1).key, dt + 'ms', 'worlds', s.worlds.length)
}
