import { THREECHECK as V } from './proto.mjs'
import { stateOf, after, codes, newGame, outs } from './lib.mjs'
const C = (c) => (b) => { b.x.checks = c.slice() }
const chk = (s) => s.worlds.map(({ b }) => b.x.checks.join(':')).join(' ')
const s = stateOf(V, [[{ g1: '0:k', b5: '0:b', a2: '0:p', e8: '1:k', c1: '0:n' }, 1], [{ g1: '0:k', b5: '0:b', a2: '0:p', e8: '1:k', h3: '0:n' }, 1]], 0, C([1, 0]))
for (let i = 0; i < 2; i++) console.log(chk(after(V, s, '?c1', i)))
const n = newGame(V); console.log(codes(V, n).length, chk(n), n.result)
