import { CHESS960 as V } from './proto.mjs'
import { newGame, legalMoves, show, after, outs } from './lib.mjs'
// rights after rook out and back
let s = newGame(V, { position: 518 })
for (const m of ['a2-a4', 'a7-a5', 'a1-a3', 'h7-h6', 'a3-a1', 'h6-h5']) s = after(V, s, m)
console.log(show(V, s)[0].split('{')[1])
// SP 0 black castling after f8 rook moves? SP0: bbqnnrkr: O-O needs f8 empty. 
// rng default
const s2 = V.setup({}, () => 0.54); console.log(s2.sq.slice(0,8).map((q,id)=>s2.ty[id]).join(''))
