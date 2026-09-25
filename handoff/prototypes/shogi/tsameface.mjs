// The optional core change "parts with different faces cannot merge", on a patched copy of quantum.js.
import { SHOGI as V } from './shogi.mjs'
import * as Q from './quantum_sameface.js'
import { stateOf, check, summary } from './lib.mjs'
let s = stateOf(V, [[{ '5i': '0:k', '5e': '0:s', '5a': '1:k' }, 1]])
const go = (st, c) => Q.applyOutcome(V, st, c, 0)
s = go(s, '5e-4d|6d')
s = go(s, '5a-5b')
s = go(s, '4d-4c=+s')
s = go(s, '5b-5a')
check('merge 6d|4c-5c refused', Q.branches(V, s, '6d|4c-5c'), null)
check('no merge listed', Q.legalMoves(V, s).filter((m) => m.type === 'merge').length, 0)
check('measure still offered', Q.legalMoves(V, s).some((m) => m.type === 'measure'), true)
// same faces still merge
let u = stateOf(V, [[{ '5i': '0:k', '5e': '0:s', '5a': '1:k' }, 1]])
u = go(u, '5e-4d|6d')
u = go(u, '5a-5b')
check('unpromoted parts merge', Q.branches(V, u, '6d|4d-5c') === null, false)
summary()
