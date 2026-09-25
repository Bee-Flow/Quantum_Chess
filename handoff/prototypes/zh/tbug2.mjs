import { BUG as V } from './bug.mjs'
import { stateOf, show, outs, after, codes, newGame, handView, budget, ownPieceAt, splitsFrom, branches, pieceLocations } from './libt.mjs'
const sq = (n) => V.topology.byName(n)
const hr = (t) => console.log('\n=== ' + t)
const hv = (s) => [0, 1, 2, 3].map(x => x + ':' + JSON.stringify(handView(s, x).map(h => h.type + h.min))).join(' ')
const K = { 'A:e1': '0:k', 'A:e8': '3:k', 'B:e1': '1:k', 'B:e8': '2:k' }

hr('B3 promoted piece captured -> partner gets a pawn of its own colour')
let s = stateOf(V, [[{ ...K, 'A:b7': '0:p', 'A:a8': '3:r' }, 1]], 0)
s = after(V, s, 'A:b7-A:b8=q')
console.log(show(V, s))
s = after(V, s, 'B:e1-B:d1'); s = after(V, s, 'B:e8-B:d8')
console.log('turn', s.turn, outs(V, s, 'A:a8-A:b8'))
s = after(V, s, 'A:a8-A:b8')
console.log(show(V, s), hv(s))

hr('B4 black pawn dropped on B:d7 double-steps; e.p. on board B survives moves on board A')
s = stateOf(V, [[{ ...K, 'B:e5': '1:p', 'A:a2': '0:p', 'A:h7': '3:p' }, 1, [[2, 'p']]]], 2)
s = after(V, s, 'p@B:d7')          // seat 2
s = after(V, s, 'A:h7-A:h6')       // seat 3
s = after(V, s, 'A:a2-A:a3')       // seat 0
s = after(V, s, 'B:e1-B:f1')       // seat 1
console.log('turn', s.turn, 'B:d7-B:d5 legal', codes(V, s).includes('B:d7-B:d5'))
s = after(V, s, 'B:d7-B:d5')       // seat 2 double step
console.log('ep', JSON.stringify(s.worlds[0].b.x.ep.map(q => q >= 0 ? V.topology.names[q] : -1)))
s = after(V, s, 'A:h6-A:h5')       // seat 3
s = after(V, s, 'A:a3-A:a4')       // seat 0
console.log('turn', s.turn, 'ep still', JSON.stringify(s.worlds[0].b.x.ep.map(q => q >= 0 ? V.topology.names[q] : -1)), 'B:e5-B:d6 legal', codes(V, s).includes('B:e5-B:d6'))
s = after(V, s, 'B:e5-B:d6')
console.log(show(V, s), hv(s))

hr('B5 ep on board A cleared by the next move on board A only (A-B declines)')
s = stateOf(V, [[{ ...K, 'A:d2': '0:p', 'A:e4': '3:p', 'B:a2': '1:p', 'B:a7': '2:p' }, 1]], 0)
s = after(V, s, 'A:d2-A:d4'); s = after(V, s, 'B:a2-B:a3'); s = after(V, s, 'B:a7-B:a6')
console.log('seat', s.turn, 'A:e4-A:d3 legal', codes(V, s).includes('A:e4-A:d3'))
s = after(V, s, 'A:e8-A:f8'); s = after(V, s, 'A:e1-A:f1'); s = after(V, s, 'B:a3-B:a4'); s = after(V, s, 'B:a6-B:a5')
console.log('seat', s.turn, 'A:e4-A:d3 legal later', codes(V, s).includes('A:e4-A:d3'))

hr('B6 king capture on board B ends the game for everyone')
s = stateOf(V, [[{ ...K, 'B:e7': '1:q', 'A:d1': '0:q' }, 1]], 1)
console.log(outs(V, s, 'B:e7-B:e8'))
s = after(V, s, 'B:e7-B:e8')
console.log(JSON.stringify(s.result), 'legal moves', codes(V, s).length)

hr('B7 team budget: seat 0 ghosts + partner seat 2 ghost fill team budget; opponents unaffected')
s = stateOf(V, [[{ ...K, 'A:b1': '0:n', 'A:g1': '0:n', 'B:b8': '2:n', 'B:b1': '1:n' }, 1]], 0)
s = after(V, s, 'A:b1-A:a3|A:c3')  // seat 0: team0 budget 2
s = after(V, s, 'B:e1-B:d1')       // seat 1
s = after(V, s, 'B:b8-B:a6|B:c6')  // seat 2: team0 budget 4
s = after(V, s, 'A:e8-A:d8')       // seat 3
console.log('team0 budget', budget(s, 0), budget(s, 2), 'team1', budget(s, 1), 'worlds', s.worlds.length)
console.log('seat0 split g1 legal', splitsFrom(V, s, sq('A:g1')).length)
s = after(V, s, 'A:g1-A:f3|A:h3')  // team0 budget 8
console.log('team0 budget', budget(s, 0), 'worlds', s.worlds.length)
console.log('seat1 splits of B:b1', splitsFrom(V, s, sq('B:b1')).length)
s = after(V, s, 'B:b1-B:a3|B:c3') // team1 budget 2 -> worlds 16
console.log('worlds', s.worlds.length, 'team1', budget(s, 1))
console.log('seat2 split? (team full)', splitsFrom(V, { ...s }, sq('B:a6')).length, 'turn', s.turn)
// pass=link over budget -> rolled: seat 2 knight parts cannot slide; use measure
console.log('seat2 measure outcomes', outs(V, s, '?B:a6'))

hr('B8 capturing a ghost part on board A: partner hand only in the capture branch; board B odds unchanged')
s = stateOf(V, [
  [{ ...K, 'A:c3': '0:b', 'A:a5': '3:n', 'B:c3': '1:n' }, 1],
  [{ ...K, 'A:c3': '0:b', 'A:d4': '3:n', 'B:c3': '1:n' }, 1],
  [{ ...K, 'A:c3': '0:b', 'A:a5': '3:n', 'B:e4': '1:n' }, 1],
  [{ ...K, 'A:c3': '0:b', 'A:d4': '3:n', 'B:e4': '1:n' }, 1],
], 0)
console.log(outs(V, s, 'A:c3-A:a5'))
for (const i of [0, 1]) { const n = after(V, s, 'A:c3-A:a5', i); console.log(show(V, n), hv(n), 'B knight', JSON.stringify(pieceLocations(n, 6).map(l => V.topology.names[l.sq] + ':' + l.p))) }

hr('B9 drop probe on board B')
s = stateOf(V, [[{ ...K, 'B:d4': '1:n' }, 3, [[2, 'p']]], [{ ...K, 'B:f5': '1:n' }, 1, [[2, 'p']]]], 2)
console.log(outs(V, s, 'p@B:d4'))
