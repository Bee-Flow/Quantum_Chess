import { FOUR as V } from './proto.mjs'
import { newGame, codes, show, after, outs, stateOf, budget, royalDanger, splitsFrom, legalMoves } from './lib.mjs'
import { isLegal } from './quantum_fp.js'
const hr = (t) => console.log('\n=== ' + t)
const K4 = { h1: '0:k', a7: '1:k', g14: '2:k', n8: '3:k' }
const turnOf = (s) => ['R', 'B', 'Y', 'G'][s.turn]
const res = (s) => JSON.stringify(s.result)
hr('E1 FFA: Red Qd4xa7 eliminates Blue, whole army leaves, turn to Yellow')
let s = stateOf(V, [[{ ...K4, d4: '0:q', b8: '1:p', c6: '1:n', a11: '1:r' }, 1]], 0)
console.log(outs(V, s, 'd4-a7'))
let a = after(V, s, 'd4-a7'); console.log(show(V, a), 'turn', turnOf(a), res(a))
hr('E2 FFA: last two, Red captures Green king -> Red wins')
s = stateOf(V, [[{ h1: '0:k', n8: '3:k', h8: '0:r', m9: '3:p' }, 1]], 0)
console.log(outs(V, s, 'h8-n8'))
a = after(V, s, 'h8-n8'); console.log(show(V, a), res(a))
hr('E3 Teams: Red cannot capture Yellow; captures Blue king -> Red & Yellow win')
s = stateOf(V, [[{ ...K4, d4: '0:q', c5: '2:n', e5: '1:n', d7: '1:b' }, 1]], 0, (b) => { b.x.teams = true })
console.log(codes(V, s).filter(c => c.startsWith('d4')).join(' '))
s = stateOf(V, [[{ ...K4, d4: '0:q', b8: '1:p' }, 1]], 0, (b) => { b.x.teams = true })
a = after(V, s, 'd4-a7'); console.log(show(V, a), res(a))
hr('Q1 ghost queen hits the Blue king: 50% miss / 50% capture (Blue out, its ghost knight gone too)')
s = stateOf(V, [
  [{ ...K4, d4: '0:q', c6: '1:n', b8: '1:p' }, 1],
  [{ ...K4, d4: '0:q', d8: '1:n', b8: '1:p' }, 1],
  [{ ...K4, j4: '0:q', c6: '1:n', b8: '1:p' }, 1],
  [{ ...K4, j4: '0:q', d8: '1:n', b8: '1:p' }, 1],
], 0)
console.log('budgets', [0,1,2,3].map(x => budget(s, x)))
console.log(outs(V, s, 'd4-a7'))
for (let i = 0; i < 2; i++) { a = after(V, s, 'd4-a7', i); console.log(i, show(V, a), 'turn', turnOf(a), res(a), 'budgets', [0,1,2,3].map(x => budget(a, x))) }
hr('Q2 elimination unlinks: Red rook linked to Blue knight; Yellow Qd10xa7')
s = stateOf(V, [
  [{ ...K4, d8: '0:r', f8: '1:n', d10: '2:q' }, 1],
  [{ ...K4, i8: '0:r', f10: '1:n', d10: '2:q' }, 1],
], 2)
console.log(outs(V, s, 'd10-a7'))
a = after(V, s, 'd10-a7'); console.log(show(V, a), 'turn', turnOf(a), 'red budget', budget(a, 0))
hr('Q2b how the link arose: Red d8-i8 passes a Blue knight 50% f8 / 50% f10')
s = stateOf(V, [
  [{ ...K4, d8: '0:r', f8: '1:n', d10: '2:q' }, 1],
  [{ ...K4, d8: '0:r', f10: '1:n', d10: '2:q' }, 1],
], 0)
console.log(outs(V, s, 'd8-i8'))
