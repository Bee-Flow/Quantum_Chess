import { SHOGI as V } from './shogi.mjs'
import { newGame, codes, show, legalMoves, splitsFrom, after, outs } from './lib.mjs'
import { generate } from '../../../src/variants/core/world.js'
const s = newGame(V)
console.log(show(V, s)[0])
const c = codes(V, s)
console.log(c.length, c.join(' '))
// splits
const sp = legalMoves(V, s, { splits: true }).filter(m => m.type === 'split')
console.log('splits', sp.length, sp.map(m => m.code).join(' '))
// perft-like: classical moves at depth 2,3 (single world)
function perft(w, side, d) {
  if (d === 0) return 1
  let n = 0
  for (const m of generate(V, w, side).values()) {
    const nx = (V.apply ? V.apply(w, m) : null)
    n += perft(applyC(w, m), 1 - side, d - 1)
  }
  return n
}
import { applyClassical } from '../../../src/variants/core/world.js'
function applyC(w, m) { return applyClassical(V, w, m) }
const b = s.worlds[0].b
for (const d of [1, 2, 3]) console.log('perft', d, perft(b, 0, d))
