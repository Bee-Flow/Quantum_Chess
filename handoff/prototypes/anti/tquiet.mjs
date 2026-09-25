import { ANTI as V } from './proto.mjs'
import { stateOf } from '../c960/lib.mjs'
import { applyOutcome } from '/home/user/Quantum_Chess/src/variants/core/quantum.js'
let s = stateOf(V, [[{ a1: '0:k', h8: '1:k', h1: '0:n' }, 1]])
s.quiet = 10
console.log('king move quiet', applyOutcome(V, s, 'a1-a2', 0).quiet, 'knight move quiet', applyOutcome(V, s, 'h1-g3', 0).quiet)
