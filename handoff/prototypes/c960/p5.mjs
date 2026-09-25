import { KOTH as V } from './proto.mjs'
import { newGame, after, codes } from './lib.mjs'
let s = newGame(V)
for (const m of ['e2-e4', 'e7-e5', 'e1-e2', 'b8-c6', 'e2-d3', 'g8-f6']) s = after(V, s, m)
console.log(codes(V, s).filter(c => c.startsWith('d3')))
