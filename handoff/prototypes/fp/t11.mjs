import { FOUR as V } from './proto.mjs'
import { newGame, applyMove } from '/home/user/Quantum_Chess/src/variants/core/quantum.js'
import { chooseMove } from '/home/user/Quantum_Chess/src/variants/core/ai.js'
let seed = 5
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
for (const mode of ['teams', 'ffa']) {
  let s = newGame(V, { mode }); let max = 0
  for (let i = 0; i < 40 && !s.result; i++) {
    const t0 = Date.now()
    const code = await chooseMove(V, s, { level: 'normal', rng })
    max = Math.max(max, Date.now() - t0)
    s = applyMove(V, s, code, rng).state
  }
  console.log(mode, 'plies', s.ply, 'max ms', max, 'result', JSON.stringify(s.result), 'moves', s.history.slice(-8).map(h => h.code + ':' + h.key).join(' '))
}
