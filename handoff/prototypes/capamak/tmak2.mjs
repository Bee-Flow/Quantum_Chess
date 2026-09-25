import { MAKRUK as V, countInfo } from './proto.mjs'
import { show, outs, after, codes } from '../c960/lib.mjs'
import { STATE_VERSION, T } from '/home/user/Quantum_Chess/src/variants/core/quantum.js'
import { worldFrom } from '/home/user/Quantum_Chess/src/variants/core/world.js'
function stateOf(V, worlds, turn = 0, quiet = 0) {
  const total = worlds.reduce((a, [, w]) => a + w, 0); let rest = T
  const list = worlds.map(([pl, rel], i) => { const b = worldFrom(V, pl, {}); const w = i === worlds.length - 1 ? rest : Math.floor((T * rel) / total); rest -= w; return { b, w } })
  return { v: STATE_VERSION, variant: V.id, options: {}, worlds: list, turn, ply: 0, quiet, result: null, history: [] }
}
const hr = (t) => console.log('\n=== ' + t)
hr('M8 piece honour: KRR vs K after Rb2xb7: allowance 8-4+1=5 moves')
let s = stateOf(V, [[{ a1: '0:k', b2: '0:r', c3: '0:r', h8: '1:k', b7: '1:n' }, 1]], 0, 30)
let s2 = after(V, s, 'b2-b7'); console.log(s2.result, 'quiet', s2.quiet, JSON.stringify(countInfo(V, s2)))
let st = s2
const plies = ['h8-g8', 'c3-c4', 'g8-h8', 'c4-c5', 'h8-g8', 'c5-c4', 'g8-h8', 'c4-c5', 'h8-g8', 'c5-c4']
for (const p of plies) { st = after(V, st, p); console.log(p, 'quiet', st.quiet, JSON.stringify(countInfo(V, st)), st.result); if (st.result) break }
hr('M8b capture of the Khun on the 5th move wins')
st = s2
for (const p of ['h8-g8', 'c3-c4', 'g8-h8', 'c4-c5', 'h8-g8', 'c5-c4', 'g8-h8', 'b7-b6', 'h8-g8']) st = after(V, st, p)
console.log(JSON.stringify(countInfo(V, st)), show(V, st))
console.log('b6-g6?', codes(V, st).filter((c) => c.startsWith('b6-')).join(' '))
const w = after(V, st, 'c4-g4'); console.log('c4-g4', w.result)
