import { orthodoxSpec } from '/home/user/Quantum_Chess/src/variants/core/orthodoxVariant.js'
import { defineVariant } from '/home/user/Quantum_Chess/src/variants/core/variant.js'
import { newGame, reachable, legalMoves } from '/home/user/Quantum_Chess/src/variants/core/quantum.js'
const V = defineVariant(Object.assign(orthodoxSpec(), { id: 'x', category: 'uncertainty' }))
const s = newGame(V)
const r = [...reachable(V, s, 0)].map(q => V.topology.names[q]).sort()
console.log(r.length, r.join(' '))
console.log(legalMoves(V, s).length)
