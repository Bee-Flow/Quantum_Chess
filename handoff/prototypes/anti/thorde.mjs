import { HORDE as V } from './proto.mjs'
import { stateOf, show, outs, codes, newGame } from '../c960/lib.mjs'
import { applyOutcome, legalMoves, budget, splitTargets, T } from '/home/user/Quantum_Chess/src/variants/core/quantum.js'
import { nameOf } from '/home/user/Quantum_Chess/src/variants/core/world.js'
const hr = (t) => console.log('\n=== ' + t)
const res = (s) => JSON.stringify(s.result)
const play = (s, c, i = 0) => { const x = applyOutcome(V, s, c, i); if (!x) throw new Error('illegal ' + c); return x }
const withX = (x) => (b) => { b.x = { ep: -1, epVictim: -1, castle: [], ...x } }

hr('H1 start')
let s = newGame(V)
const b = s.worlds[0].b
const white = b.sq.map((q, id) => (b.sd[id] === 0 && q >= 0 ? nameOf(V, q) : null)).filter(Boolean)
console.log('white', white.length, white.join(' '))
console.log('black', b.sq.map((q, id) => (b.sd[id] === 1 ? b.ty[id] + nameOf(V, q) : null)).filter(Boolean).join(' '))
console.log('castle', b.x.castle.map((c) => c.flag + ':' + nameOf(V, c.king) + '>' + nameOf(V, c.kingTo) + ',' + nameOf(V, c.rook) + '>' + nameOf(V, c.rookTo)).join(' '))
console.log('white moves', codes(V, s).sort().join(' '), 'splits', legalMoves(V, s, { splits: true }).length)
let a = play(s, 'e4-e5'); console.log('black moves', codes(V, a).length)
hr('H2 double step from rank 1, no en passant after it; ep after rank-2 double step')
s = stateOf(V, [[{ a1: '0:p', b3: '1:p', e8: '1:k' }, 1]])
console.log(codes(V, s)); a = play(s, 'a1-a3'); console.log(JSON.stringify(a.worlds[0].b.x), 'black', codes(V, a).filter(c => c.startsWith('b3')))
s = stateOf(V, [[{ c2: '0:p', d4: '1:p', e8: '1:k' }, 1]])
a = play(s, 'c2-c4'); console.log(JSON.stringify(a.worlds[0].b.x), 'black', codes(V, a).filter(c => c.startsWith('d4')), outs(V, a, 'd4-c3'))
a = play(a, 'd4-c3'); console.log(show(V, a), res(a))
hr('H3 rank-1 double step blocked by a piece on rank 2 or 3')
s = stateOf(V, [[{ a1: '0:p', a3: '1:n', b1: '0:p', b2: '1:n', e8: '1:k' }, 1]])
console.log(codes(V, s))
hr('H4 black double step and white ep')
s = stateOf(V, [[{ e5: '0:p', d7: '1:p', e8: '1:k' }, 1]], 1)
a = play(s, 'd7-d5'); console.log(codes(V, a))
hr('H5 black captures the last white piece -> black wins')
s = stateOf(V, [[{ h2: '0:p', h8: '1:r', e8: '1:k' }, 1]], 1)
a = play(s, 'h8-h2'); console.log(res(a))
hr('H6 white captures the king -> white wins; black king may step into attack')
s = stateOf(V, [[{ d6: '0:p', e8: '1:k', a8: '1:r' }, 1]], 1)
console.log(codes(V, s).filter(c => c.startsWith('e8')))
a = play(s, 'e8-e7'); console.log(codes(V, a)); a = play(a, 'd6-e7'); console.log(res(a))
hr('H7 promotion')
s = stateOf(V, [[{ g7: '0:p', h8: '1:r', a8: '1:k' }, 1]])
console.log(codes(V, s))
hr('H8 black castling')
s = newGame(V)
const w0 = s.worlds[0].b
s = stateOf(V, [[{ a2: '0:p', a8: '1:r', e8: '1:k', h8: '1:r' }, 1]], 1, (b) => { b.x = { ep: -1, epVictim: -1, castle: [] }; b.x.castle = [] })
import('/home/user/Quantum_Chess/src/variants/core/orthodox.js').then(({ castlingRights }) => {
  s = stateOf(V, [[{ a2: '0:p', a8: '1:r', e8: '1:k', h8: '1:r' }, 1]], 1, (b) => { b.x = { ep: -1, epVictim: -1, castle: castlingRights(V, b) } })
  console.log(codes(V, s).filter(c => c.startsWith('O')), outs(V, s, 'O-O'))
  more()
})
function more() {
hr('H9 quantum: a white pawn attacks a ghost knight (50% d6 / 50% a6): e5-d6 roll')
s = stateOf(V, [[{ e5: '0:p', d6: '1:n', e8: '1:k' }, 1], [{ e5: '0:p', a6: '1:n', e8: '1:k' }, 1]])
console.log(codes(V, s), 'd6', outs(V, s, 'e5-d6'), 'e6', outs(V, s, 'e5-e6'))
hr('H10 quantum: last white pawn and a ghost bishop 50% c7 / 50% a8; black c7-h2')
s = stateOf(V, [[{ h2: '0:p', c7: '1:b', e8: '1:k' }, 1], [{ h2: '0:p', a8: '1:b', e8: '1:k' }, 1]], 1)
console.log(outs(V, s, 'c7-h2')); for (let i = 0; i < 2; i++) { const x = applyOutcome(V, s, 'c7-h2', i); console.log(i, res(x)) }
hr('H11 quantum stalemate draw: white only ph5; black knight 50% h6 / 50% b8; black plays e8-d8')
s = stateOf(V, [[{ h5: '0:p', h6: '1:n', e8: '1:k' }, 1], [{ h5: '0:p', b8: '1:n', e8: '1:k' }, 1]], 1)
console.log(outs(V, s, 'e8-d8')); for (let i = 0; i < 2; i++) { const x = applyOutcome(V, s, 'e8-d8', i); console.log(i, res(x), show(V, x)) }
hr('H12 quantum: white promoted queen can split; pawns cannot')
s = stateOf(V, [[{ d1: '0:q', a2: '0:p', e8: '1:k', h7: '1:p' }, 1]])
console.log('queen targets', splitTargets(V, s, V.topology.byName('d1')).length, 'pawn', splitTargets(V, s, V.topology.byName('a2')).length)
hr('H13 quantum: ghost king attacker: black king e8; white ghost queen 50% e1 / 50% a1; e1-e8 roll')
s = stateOf(V, [[{ e1: '0:q', a2: '0:p', e8: '1:k' }, 1], [{ a1: '0:q', a2: '0:p', e8: '1:k' }, 1]])
console.log(outs(V, s, 'e1-e8')); for (let i = 0; i < 2; i++) { const x = applyOutcome(V, s, 'e1-e8', i); console.log(i, res(x)) }
hr('H14 white stalemated at state level (no ghost): black move leaves white blocked')
s = stateOf(V, [[{ h5: '0:p', g8: '1:n', e8: '1:k' }, 1]], 1)
a = play(s, 'g8-h6'); console.log(res(a))
}
