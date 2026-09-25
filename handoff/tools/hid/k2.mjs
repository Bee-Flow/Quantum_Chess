import { V, visibility, names, newGame, applyOutcome, br, st, legalMoves, squareView, N, pieceLocations, royalDanger, candidateMoves, checkInfo, pawnTries, branches, splitTargets, ownOnly } from './proto.mjs'
// K6 pawn try on ghost
let s6 = st([[{ e1: '0:k', e4: '0:p', e8: '1:k', d5: '1:n' }, 1], [{ e1: '0:k', e4: '0:p', e8: '1:k', b6: '1:n' }, 1]], 0)
console.log('K6 tries', pawnTries(s6), 'e4-d5', JSON.stringify(br(s6, 'e4-d5')), 'e4-f5', JSON.stringify(br(s6, 'e4-f5')))
const miss = applyOutcome(V, s6, 'e4-d5', 0)
console.log('K6 miss: pawn', JSON.stringify(pieceLocations(miss, 1).map(l=>[N(l.sq), l.p])), 'knight', JSON.stringify(pieceLocations(miss, 3).map(l=>[N(l.sq), l.p])), 'turn', miss.turn, 'hist', JSON.stringify(miss.history.at(-1)))
// K7 slide past ghost -> link + check 50%
let s7 = st([[{ h1: '0:k', a1: '0:r', e8: '1:k', a4: '1:n' }, 1], [{ h1: '0:k', a1: '0:r', e8: '1:k', c4: '1:n' }, 1]], 0)
console.log('K7 a1-a8', JSON.stringify(br(s7, 'a1-a8')))
const s7b = applyOutcome(V, s7, 'a1-a8', 0)
console.log('K7 rook', JSON.stringify(pieceLocations(s7b, 1).map(l=>[N(l.sq), l.p])), 'check', JSON.stringify(checkInfo(s7b)), 'tries', pawnTries(s7b))
// K8 ghost part blocked in every world
let s8 = st([[{ e1: '0:k', d1: '0:q', d2: '1:n', e8: '1:k' }, 1], [{ e1: '0:k', d3: '0:q', d2: '1:n', e8: '1:k' }, 1]], 0)
console.log('K8 d1-d5', JSON.stringify(br(s8, 'd1-d5')), 'd3-d5', JSON.stringify(br(s8, 'd3-d5')), 'd1-d2', JSON.stringify(br(s8, 'd1-d2')))
console.log('K8 cands from d1', candidateMoves(s8).filter(m=>m.from===V.topology.byName('d1')).map(m=>m.code).join(' '))
// K11 end roll
let s11 = st([[{ e1: '0:k', a4: '0:q', e8: '1:k' }, 1], [{ e1: '0:k', h4: '0:q', e8: '1:k' }, 1]], 0)
console.log('K11 a4-e8', JSON.stringify(br(s11, 'a4-e8')))
console.log('K11 check on black at start (as if black to move)', JSON.stringify(checkInfo({ ...s11, turn: 1 })))
// K12 merge onto king
let s12 = st([[{ e1: '0:k', a4: '0:q', e8: '1:k' }, 1], [{ e1: '0:k', h5: '0:q', e8: '1:k' }, 1]], 0)
console.log('K12 merge', JSON.stringify(br(s12, 'a4|h5-e8')))
// K12b merge onto empty square where king is not
let s12b = st([[{ e1: '0:k', a4: '0:q', g8: '1:k' }, 1], [{ e1: '0:k', h5: '0:q', g8: '1:k' }, 1]], 0)
console.log('K12b merge', JSON.stringify(br(s12b, 'a4|h5-e8')))
const m = applyOutcome(V, s12b, 'a4|h5-e8', 0)
console.log('K12b after', JSON.stringify(pieceLocations(m, 1).map(l=>[N(l.sq), l.p])), 'check', JSON.stringify(checkInfo(m)))
