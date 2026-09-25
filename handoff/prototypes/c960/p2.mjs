import { CHESS960 as V } from './proto.mjs'
import { newGame, legalMoves, show, after } from './lib.mjs'
import { sp } from './sp.mjs'
const s = newGame(V, { position: 3 })
console.log(legalMoves(V, s).map(m => m.code).join(' '))
console.log(show(V, after(V, s, 'O-O'))[0])
let n1 = 0, list = []
for (let n = 0; n < 960; n++) { const c = legalMoves(V, newGame(V, { position: n })).filter(m => m.kind === 'castle'); if (c.length) { n1++; list.push(n + ':' + sp(n) + ':' + c.map(m => m.code)) } }
console.log(n1, list.join(' '))
