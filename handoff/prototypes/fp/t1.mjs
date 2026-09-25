import { FOUR as V } from './proto.mjs'
import { newGame, codes, show, after, outs, stateOf, budget } from './lib.mjs'
import { nameOf } from '/home/user/Quantum_Chess/src/variants/core/world.js'
console.log('size', V.topology.size)
const s = newGame(V, { mode: 'ffa' })
console.log(show(V, s)[0])
for (let t = 0; t < 4; t++) {
  const st = { ...s, turn: t }
  const c = codes(V, st)
  console.log('side', t, c.length, c.join(' '))
}
