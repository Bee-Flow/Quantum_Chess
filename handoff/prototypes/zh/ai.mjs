import { ZH } from './zh.mjs'
import { BUG } from './bug.mjs'
const Q = await import('/home/user/Quantum_Chess/src/variants/core/quantum.js')
const { chooseMove } = await import('/home/user/Quantum_Chess/src/variants/core/ai.js')
for (const [name, V, seq] of [['zh', ZH, ['e2-e4', 'd7-d5', 'e4-d5', 'd8-d5', 'b1-c3', 'd5-a5', 'd2-d4', 'g8-f6']], ['bug', BUG, ['A:e2-A:e4', 'B:d2-B:d4', 'B:e7-B:e5', 'A:d7-A:d5', 'A:e4-A:d5', 'B:d4-B:e5']]]) {
  let s = Q.newGame(V)
  for (const m of seq) s = Q.applyMove(V, s, m, 0).state
  for (const level of ['easy', 'normal', 'hard']) {
    const t = Date.now(); const m = await chooseMove(V, s, { level, rng: () => 0.5 })
    console.log(name, level, m, Date.now() - t, 'ms', 'moves', Q.legalMoves(V, s).length)
  }
}
