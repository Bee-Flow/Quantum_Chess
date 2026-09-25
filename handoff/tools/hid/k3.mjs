import { V, visibility, names, newGame, applyOutcome, br, st, legalMoves, squareView, N, pieceLocations, royalDanger, candidateMoves, checkInfo, pawnTries, branches, splitTargets, ownOnly } from './proto.mjs'
// king adjacency
let a = st([[{ e7: '0:k', e8: '1:k' }, 1]], 1)
console.log('adj', JSON.stringify(checkInfo(a)))
let a2 = st([[{ d7: '0:k', e8: '1:k' }, 1]], 1)
console.log('adj diag', JSON.stringify(checkInfo(a2)))
// ep try
let e = st([[{ e1: '0:k', e5: '0:p', e8: '1:k', d7: '1:p' }, 1]], 1)
e = applyOutcome(V, e, 'd7-d5', 0)
console.log('ep tries', pawnTries(e), 'check', JSON.stringify(checkInfo(e)))
// split attempt
const sq = (n) => V.topology.byName(n)
let sp = st([[{ e1: '0:k', g1: '0:n', e8: '1:k', f3: '1:b' }, 1]], 0)
const own = ownOnly(sp, 0)
console.log('split targets own view', splitTargets(V, own, sq('g1')).map(N).join(' '), 'real', splitTargets(V, sp, sq('g1')).map(N).join(' '))
console.log('g1-f3|h3', JSON.stringify(br(sp, 'g1-f3|h3')), 'g1-e2|h3', JSON.stringify(br(sp, 'g1-e2|h3')))
// castling No
const cas = { ep: -1, epVictim: -1, castle: [{ flag: 'K', side: 0, king: sq('e1'), rook: sq('h1'), kingTo: sq('g1'), rookTo: sq('f1') }] }
let c = st([[{ e1: '0:k', h1: '0:r', e8: '1:k', f1: '1:b' }, 1]], 0, cas)
console.log('castle cands', candidateMoves(c).map(m=>m.code).filter(x=>x.startsWith('O')).join(' '), 'real', JSON.stringify(br(c, 'O-O')))
// castle with ghost on f1
let c2 = st([[{ e1: '0:k', h1: '0:r', e8: '1:k', f1: '1:b' }, 1], [{ e1: '0:k', h1: '0:r', e8: '1:k', c4: '1:b' }, 1]], 0, cas)
console.log('castle ghost', JSON.stringify(br(c2, 'O-O')))
// promotion attempt onto occupied
let p = st([[{ a1: '0:k', e7: '0:p', h1: '1:k', e8: '1:r', d8: '1:n' }, 1]], 0)
console.log('promo cands', candidateMoves(p).filter(m=>m.from===sq('e7')).map(m=>m.code).join(' '))
console.log('e7-e8=q', JSON.stringify(br(p, 'e7-e8=q')), 'e7-d8=q', JSON.stringify(br(p, 'e7-d8=q')), 'e7-f8=q', JSON.stringify(br(p, 'e7-f8=q')), 'tries', pawnTries(p))
