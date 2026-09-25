import { ZH as V } from './zh.mjs'
import { stateOf, show, outs, after, codes, newGame, handView, budget, ownPieceAt, splitsFrom, pieceLocations, legalMoves } from './lib.mjs'
const sq = (n) => V.topology.byName(n)
const hr = (t) => console.log('\n=== ' + t)
const hv = (s, side) => JSON.stringify(handView(s, side).map(h => h.type + ':' + h.min + '-' + h.max))

hr('Q1 drop onto a square where an enemy ghost may stand = probe')
// black knight 50% d4 / 50% f4 (same id in both worlds: placement order)
let s = stateOf(V, [[{ e1: '0:k', e8: '1:k', d4: '1:n' }, 1, [[0, 'p']]], [{ e1: '0:k', e8: '1:k', f4: '1:n' }, 1, [[0, 'p']]]], 0)
console.log(outs(V, s, 'p@d4'))
console.log('miss ->', show(V, after(V, s, 'p@d4', 0)), hv(after(V, s, 'p@d4', 0), 0))
console.log('move ->', show(V, after(V, s, 'p@d4', 1)), hv(after(V, s, 'p@d4', 1), 0))

hr('Q2 capturing a ghost part puts it in hand only in the capture branch')
s = stateOf(V, [[{ e1: '0:k', b5: '0:b', e8: '1:k', c6: '1:n' }, 1], [{ e1: '0:k', b5: '0:b', e8: '1:k', a6: '1:n' }, 1]], 0)
console.log(outs(V, s, 'b5-c6'))
for (const i of [0, 1]) { const n = after(V, s, 'b5-c6', i); console.log(show(V, n), 'W hand', hv(n, 0)) }

hr('Q3 capture of a square whose occupant differs between worlds -> hand roll (solid:)')
s = stateOf(V, [
  [{ e1: '0:k', e2: '0:r', e8: '1:k', e5: '1:n', g7: '1:b' }, 1],
  [{ e1: '0:k', e2: '0:r', e8: '1:k', c6: '1:n', e5: '1:b' }, 1],
], 0)
console.log(outs(V, s, 'e2-e5'))
for (const i of [0, 1]) { const n = after(V, s, 'e2-e5', i); console.log(show(V, n), 'W hand', hv(n, 0), 'budgetW', budget(n, 0)) }

hr('Q3b same, promoted queen (+q) vs knight: pawn count differs -> solid roll')
s = stateOf(V, [
  [{ e1: '0:k', e2: '0:r', e8: '1:k', e5: '1:+q', g7: '1:n' }, 1],
  [{ e1: '0:k', e2: '0:r', e8: '1:k', c6: '1:+q', e5: '1:n' }, 1],
], 0)
console.log(outs(V, s, 'e2-e5'))

hr('Q4 fresh id: hands with different ids of the same type; dropped knight is one piece (can split)')
// world1: white hand holds knight id A, knight B on the board as black? construct: two black knights X (id3) and Y (id4); in world1 X in white hand (as white n), Y on g6; world2 Y in hand, X on g6
import { worldFrom, HAND } from '/home/user/Quantum_Chess/src/variants/core/world.js'
{
  const mk = (handId) => { const b = worldFrom(V, { e1: '0:k', e8: '1:k' }, {}); b.x = { ep: -1, epVictim: -1, castle: [] }
    // add two knights
    b.sq.push(-2, -2); b.ty.push('n', 'n'); b.sd.push(1, 1)
    const other = handId === 2 ? 3 : 2
    b.sq[handId] = HAND; b.sd[handId] = 0
    b.sq[other] = sq('g6'); b.board[sq('g6')] = other
    return b }
  s = { ...stateOf(V, [[{ e1: '0:k', e8: '1:k' }, 1]], 0), worlds: [{ b: mk(2), w: 8388608 }, { b: mk(3), w: 8388608 }] }
  console.log(show(V, s))
  console.log('ownPieceAt g6 for black', ownPieceAt({ ...s, turn: 1 }, sq('g6')))
  console.log(outs(V, s, 'n@f3'))
  const n = after(V, s, 'n@f3')
  console.log(show(V, n))
  const n2 = { ...n, turn: 0 }
  console.log('ownPieceAt f3', ownPieceAt(n2, sq('f3')), 'splits from f3', splitsFrom(V, n2, sq('f3')).length)
}

hr('Q5 drop onto own ghost square')
s = stateOf(V, [[{ e1: '0:k', e8: '1:k', c3: '0:n' }, 1, [[0, 'b']]], [{ e1: '0:k', e8: '1:k', e5: '0:n' }, 1, [[0, 'b']]]], 0)
console.log(outs(V, s, 'b@e5'))

hr('Q6 split then drop: budget and a dropped piece then splits')
s = stateOf(V, [[{ e1: '0:k', e8: '1:k', g1: '0:n' }, 1, [[0, 'n']]]], 0)
s = after(V, s, 'g1-f3|h3')
console.log('budget W', budget(s, 0))
s = after(V, s, 'e8-d8')
console.log(outs(V, s, 'n@c3'))
s = after(V, s, 'n@c3')
console.log(show(V, s), 'budget', budget(s, 0))
