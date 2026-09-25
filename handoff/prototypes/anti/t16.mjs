import { ANTI as V, legalC } from './proto.mjs'
import { stateOf } from '../c960/lib.mjs'
const s = stateOf(V, [[{ d1: '0:k', a1: '0:q', h7: '1:p' }, 1]])
const splits = legalC(V, s, true).filter(m => m.type === 'split').map(m => m.code)
console.log(splits.length, splits.filter(c => c.startsWith('d1')), splits.filter(c => c.startsWith('a1')).length)
