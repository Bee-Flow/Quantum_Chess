// capacity denial with the unpatched core (budget 8 per side, 64 worlds)
import { FOUR as V } from './proto.mjs'
import { newGame, applyOutcome, isLegal, budget } from '/home/user/Quantum_Chess/src/variants/core/quantum.js'
let s = newGame(V, { mode: 'ffa' })
const seq = ['e1-d3|f3', 'a10-c9|c11', 'j14-i12|k12', 'n5-l4|l6', 'j1-i3|k3', 'a5-c4|c6', 'e14-d12|f12']
for (const m of seq) {
  const ok = isLegal(V, s, m)
  console.log(m, 'legal', ok)
  if (ok) s = applyOutcome(V, s, m, 0)
  else break
  console.log('  worlds', s.worlds.length, 'budgets', [0, 1, 2, 3].map((x) => budget(s, x)))
}
