import { BUG as V } from './bug.mjs'
import { stateOf, show, outs, after, codes, newGame, budget } from './libt.mjs'
const hr = (t) => console.log('\n=== ' + t)
hr('B10 castling on board B for Black B (seat 2) from the start position')
let s = newGame(V)
for (const m of ['A:g1-A:f3', 'B:g1-B:f3', 'B:g8-B:f6', 'A:g8-A:f6', 'A:e2-A:e3', 'B:e2-B:e3', 'B:e7-B:e6', 'A:e7-A:e6', 'A:f1-A:e2', 'B:f1-B:e2', 'B:f8-B:e7', 'A:f8-A:e7']) s = after(V, s, m)
console.log('turn', s.turn, 'O-O for seat 0', codes(V, s).includes('O-O'))
s = after(V, s, 'O-O') // seat 0 castles on A
console.log(show(V, s).map(x => x.slice(0, 60)))
s = after(V, s, 'B:e1-B:f1') // seat 1 king move (loses right)
console.log('turn', s.turn, 'O-O for seat 2', codes(V, s).includes('O-O'), outs(V, s, 'O-O'))
s = after(V, s, 'O-O')
const b = s.worlds[0].b
console.log('B:g8', V.topology.names.indexOf('B:g8'), b.board[V.topology.byName('B:g8')] >= 0 ? b.ty[b.board[V.topology.byName('B:g8')]] + b.sd[b.board[V.topology.byName('B:g8')]] : '-', 'B:f8', b.ty[b.board[V.topology.byName('B:f8')]])
s = after(V, s, 'A:e8-A:f8')
s = after(V, s, 'A:d2-A:d3')
console.log('seat 1 O-O after king moved', codes(V, s).includes('O-O'))
hr('B11 start position counts')
s = newGame(V)
console.log('moves seat0', codes(V, s).length, 'budget', budget(s, 0), 'pieces', s.worlds[0].b.sq.length)
