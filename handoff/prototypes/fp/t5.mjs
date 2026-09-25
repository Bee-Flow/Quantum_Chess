import { FOUR as V } from './proto.mjs'
import { newGame, codes, show, after, outs, stateOf, budget, splitsFrom, legalMoves } from './lib.mjs'
import { isLegal, splitTargets } from './quantum_fp.js'
const hr = (t) => console.log('\n=== ' + t)
const K4 = { h1: '0:k', a7: '1:k', g14: '2:k', n8: '3:k' }
const turnOf = (s) => ['R', 'B', 'Y', 'G'][s.turn]
const sq = (n) => V.topology.byName(n)
hr('B1 budget 2 with four players: second split refused, allowed with three players')
let s = newGame(V, { mode: 'ffa' })
s = after(V, s, 'e1-d3|f3')
console.log(show(V, s).length, 'worlds; red budget', budget(s, 0))
for (const m of ['b8-d8', 'g13-g11', 'm7-k7']) s = after(V, s, m)
console.log('red j1 split legal?', isLegal(V, s, 'j1-i3|k3'), 'targets', splitTargets(V, s, sq('j1')).map(q => V.topology.names[q]))
console.log('red can still move j1-k3 (quiet, certain):', outs(V, s, 'j1-k3'))
// same with Blue eliminated
let s3 = stateOf(V, [[{ h1: '0:k', g14: '2:k', n8: '3:k', d3: '0:n', j1: '0:n' }, 1], [{ h1: '0:k', g14: '2:k', n8: '3:k', f3: '0:n', j1: '0:n' }, 1]], 0)
console.log('3 alive: red j1 split legal?', isLegal(V, s3, 'j1-i3|k3'))
let s4 = stateOf(V, [[{ ...K4, d3: '0:n', j1: '0:n' }, 1], [{ ...K4, f3: '0:n', j1: '0:n' }, 1]], 0)
console.log('4 alive: red j1 split legal?', isLegal(V, s4, 'j1-i3|k3'))
hr('B2 budget full: a pass=link move is rolled instead')
s = stateOf(V, [
  [{ ...K4, d3: '0:n', d8: '0:r', f8: '1:n' }, 1],
  [{ ...K4, f3: '0:n', d8: '0:r', f8: '1:n' }, 1],
  [{ ...K4, d3: '0:n', d8: '0:r', f10: '1:n' }, 1],
  [{ ...K4, f3: '0:n', d8: '0:r', f10: '1:n' }, 1],
], 0)
console.log('budgets', [0,1,2,3].map(x => budget(s, x)), outs(V, s, 'd8-i8'))
s = stateOf(V, [
  [{ ...K4, d8: '0:r', f8: '1:n' }, 1],
  [{ ...K4, d8: '0:r', f10: '1:n' }, 1],
], 0)
console.log('no own ghost: ', outs(V, s, 'd8-i8'))
hr('P1 Teams: landing where the partner might be is a roll: miss or move')
s = stateOf(V, [
  [{ ...K4, d8: '0:r', g8: '2:n' }, 1],
  [{ ...K4, d8: '0:r', g10: '2:n' }, 1],
], 0, (b) => { b.x.teams = true })
console.log(outs(V, s, 'd8-g8'))
for (let i = 0; i < 2; i++) console.log(i, show(V, after(V, s, 'd8-g8', i)))
hr('P2 Teams: partner blocks a pass like any piece (link)')
console.log(outs(V, s, 'd8-i8'))
console.log(show(V, after(V, s, 'd8-i8')))
hr('S1 stuck player sits out (Teams): Red Kd1 Be1 Pd2 Pe2 Pf2 blocked by Yellow pawns d3 e3 f3 g3')
s = stateOf(V, [[{ d1: '0:k', e1: '0:b', d2: '0:p', e2: '0:p', f2: '0:p', d3: '2:p', e3: '2:p', f3: '2:p', g3: '2:p', a7: '1:k', g14: '2:k', n8: '3:k' }, 1]], 3, (b) => { b.x.teams = true })
console.log('red moves', codes(V, { ...s, turn: 0 }))
const a = after(V, s, 'n8-n9'); console.log('after green n8-n9: turn', turnOf(a), 'skipped', a.skipped, JSON.stringify(a.result))
