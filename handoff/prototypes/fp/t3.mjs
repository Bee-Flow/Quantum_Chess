import { FOUR as V } from './proto.mjs'
import { newGame, codes, show, after, outs, stateOf } from './lib.mjs'
const hr = (t) => console.log('\n=== ' + t)
const K4 = { h1: '0:k', a7: '1:k', g14: '2:k', n8: '3:k' }
hr('F5 promotion FFA')
let s = stateOf(V, [[{ ...K4, e7: '0:p', g5: '1:p', j8: '2:p', h9: '3:p', f8: '1:n' }, 1]], 0)
for (let t = 0; t < 4; t++) console.log(t, codes(V, { ...s, turn: t }).filter(c => /^(e7|g5|j8|h9)-/.test(c)).join(' '))
hr('F5b promotion Teams')
s = stateOf(V, [[{ ...K4, e7: '0:p', e10: '0:p', j10: '1:p', i10: '1:p', f4: '2:p', h5: '3:p', d5: '3:p' }, 1]], 0, (b) => { b.x.teams = true })
for (let t = 0; t < 4; t++) console.log(t, codes(V, { ...s, turn: t }).filter(c => /^(e7|e10|j10|i10|f4|h5|d5)-/.test(c)).join(' '))
