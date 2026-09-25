import { V, visibility, names, newGame, applyOutcome, N, candidateMoves, pawnTries } from './proto.mjs'
import { aiView } from './ai2.mjs'
const dump = (s) => s.worlds.map(({ b, w }) => (w / 16777216) + ':' + b.board.map((id, sq) => id >= 0 ? N(sq) + b.sd[id] + b.ty[id] : '').filter(Boolean).join(',')).join(' | ')
let s = applyOutcome(V, newGame(V), 'e2-e4', 0)
const A = applyOutcome(V, s, 'h7-h6', 0), B = applyOutcome(V, s, 'g7-g6', 0)
console.log('D10 vis equal', names(visibility(A, 0)).join() === names(visibility(B, 0)).join(), 'view equal', dump(aiView(A, 0, 'dark')) === dump(aiView(B, 0, 'dark')))
const A2 = applyOutcome(V, s, 'a7-a5', 0), B2 = applyOutcome(V, s, 'h7-h5', 0)
console.log('K12 cands equal', candidateMoves(A2).map(m=>m.code).sort().join() === candidateMoves(B2).map(m=>m.code).sort().join(), candidateMoves(A2).length, 'tries', pawnTries(A2), pawnTries(B2), 'view equal', dump(aiView(A2, 0, 'krieg')) === dump(aiView(B2, 0, 'krieg')))
// a case where darkchess views must differ: black plays d7-d5 (visible to white via e4xd5)
const C = applyOutcome(V, s, 'd7-d5', 0)
console.log('D10 visible move differs', dump(aiView(C, 0, 'dark')) !== dump(aiView(A, 0, 'dark')))
