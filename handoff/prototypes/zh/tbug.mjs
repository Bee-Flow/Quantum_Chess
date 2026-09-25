import { BUG as V } from './bug.mjs'
import { stateOf, show, outs, after, codes, newGame, handView, budget, ownPieceAt, splitsFrom, branches } from './libt.mjs'
const hr = (t) => console.log('\n=== ' + t)
const hv = (s, side) => JSON.stringify(handView(s, side).map(h => h.type + ':' + h.min))
let s = newGame(V)
hr('B1 turn order and first moves')
const seq = ['A:e2-A:e4', 'B:d2-B:d4', 'B:e7-B:e5', 'A:d7-A:d5']
for (const m of seq) { console.log('turn', s.turn, 'plays', m, 'legal', codes(V, s).includes(m)); s = after(V, s, m) }
console.log('turn now', s.turn, 'ply', s.ply, 'A:e4-A:d5 legal for seat 0', codes(V, s).includes('A:e4-A:d5'), 'B:.. moves for seat0?', codes(V, s).some(c => c.includes('B:')))
hr('B2 capture passes to partner')
s = after(V, s, 'A:e4-A:d5') // seat 0 takes black pawn on board A
console.log('hands', [0, 1, 2, 3].map(x => hv(s, x)).join(' '), 'turn', s.turn)
s = after(V, s, 'B:d4-B:e5') // seat 1 (White B) takes black pawn on B -> goes to seat 3 (Black A)
console.log('hands', [0, 1, 2, 3].map(x => hv(s, x)).join(' '), 'turn', s.turn)
console.log('seat 2 can drop on B:', codes(V, s).filter(c => c.startsWith('p@')).slice(0, 3), 'on A?', codes(V, s).some(c => c.startsWith('p@A:')))
console.log('seat 2 p@B:e1?', codes(V, s).includes('p@B:e1'), 'p@B:e8', codes(V, s).includes('p@B:e8'), 'p@B:e3', codes(V, s).includes('p@B:e3'))
hr('B3 black pawn dropped on its 2nd rank (rank 7) double-steps')
s = after(V, s, 'p@B:d7') // seat 2 re-drops? d7 was vacated? B:d7 had a pawn? black on B moved e7-e5 only, d7 still occupied
