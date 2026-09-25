import { CHESS960 as V } from './proto.mjs'
import { newGame, legalMoves } from './lib.mjs'
import { sp } from './sp.mjs'
const dist = {}
const ex = {}
for (let n = 0; n < 960; n++) { const s = newGame(V, { position: n }); const c = legalMoves(V, s).length; dist[c] = (dist[c] ?? 0) + 1; ex[c] ??= n }
console.log(dist, ex)
for (const n of Object.values(ex)) console.log(n, sp(n))
