import { ZH as V } from './zh.mjs'
import { stateOf, show, outs, after } from './lib.mjs'
const QA = await import('/home/user/Quantum_Chess/src/variants/core/quantum.js')
const { HAND, OFF } = await import('/home/user/Quantum_Chess/src/variants/core/world.js')
let s = stateOf(V, [[{ e1: '0:k', e8: '1:k', d4: '1:n' }, 3, [[0, 'p']]], [{ e1: '0:k', e8: '1:k', f5: '1:n' }, 1, [[0, 'p']]]], 0)
console.log('Q5', outs(V, s, 'p@d4'))
function rng(seed) { let x = seed >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296 } }
let bad = 0, n = 0
for (let g = 0; g < 30; g++) {
  const r = rng(100 + g); let st = QA.newGame(V)
  for (let i = 0; i < 100 && !st.result; i++) {
    const ms = QA.legalMoves(V, st, { splits: r() < 0.3 }); if (!ms.length) break
    // bias to captures and drops
    const caps = ms.filter(m => m.drop || (QA.branches(V, st, m.code) ?? []).some(b => b.captures.length))
    const m = (caps.length && r() < 0.5 ? caps : ms)[Math.floor(r() * (caps.length && r() < 0.5 ? caps.length : ms.length))] ?? ms[0]
    st = QA.applyMove(V, st, m.code, r).state; n++
    for (const { b } of st.worlds) {
      const live = b.sq.filter((q) => q >= 0 || q === HAND).length
      const kingsOff = b.sq.filter((q, id) => q === OFF && b.ty[id] === 'k').length
      if (live + kingsOff !== 32) bad++
      for (let id = 0; id < b.sq.length; id++) if (b.ty[id] === 'p' && b.sq[id] >= 0) { const rk = V.topology.coords[b.sq[id]][1]; if (rk === 0 || rk === 7) bad++ }
    }
  }
}
console.log('F1 plies', n, 'violations', bad)
