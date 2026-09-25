import { FOUR as V } from './proto.mjs'
import { codes, show, after, outs, stateOf } from './lib.mjs'
const K4 = { h1: '0:k', a7: '1:k', g14: '2:k', n8: '3:k' }
let s = stateOf(V, [[{ ...K4, b10: '1:p', d11: '2:p' }, 1]], 1)
s = after(V, s, 'b10-d10'); console.log(show(V, s)[0])
console.log('yellow d11 moves', codes(V, s).filter(c => c.startsWith('d11')), outs(V, s, 'd11-c10'))
console.log(show(V, after(V, s, 'd11-c10'))[0])
s = stateOf(V, [[{ ...K4, j13: '2:p', k11: '3:p' }, 1]], 2)
s = after(V, s, 'j13-j11'); console.log(show(V, s)[0], codes(V, s).filter(c => c.startsWith('k11')))
s = stateOf(V, [[{ ...K4, m5: '3:p', k4: '0:p' }, 1]], 3)
s = after(V, s, 'm5-k5'); console.log(show(V, s)[0], codes(V, s).filter(c => c.startsWith('k4')))
// quantum: en passant when the capturer is certain but a ghost blocks the double step in some worlds
s = stateOf(V, [[{ ...K4, f2: '0:p', e4: '1:p', f3: '2:n' }, 1], [{ ...K4, f2: '0:p', e4: '1:p', h12: '2:n' }, 1]], 0)
console.log('red f2-f4 with yellow knight 50% on f3:', outs(V, s, 'f2-f4'))
for (let i = 0; i < 2; i++) { const a = after(V, s, 'f2-f4', i); console.log(i, show(V, a), codes(V, a).filter(c => c.startsWith('e4'))) }
