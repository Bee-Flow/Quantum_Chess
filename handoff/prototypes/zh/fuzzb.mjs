import { BUG as V, boardOf } from './bug.mjs'
const Q = await import('./quantum_team.js')
const { HAND, OFF } = await import('/home/user/Quantum_Chess/src/variants/core/world.js')
function rng(seed) { let x = seed >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296 } }
const hs = (b) => { const o = []; for (let id = 0; id < b.sq.length; id++) if (b.sq[id] === HAND) o.push(id + ':' + b.sd[id] + b.ty[id]); return o.join(',') }
let bad = {}, n = 0, maxW = 0
const flag = (k) => { bad[k] = (bad[k] ?? 0) + 1 }
for (let g = 0; g < 25; g++) {
  const r = rng(500 + g); let s = Q.newGame(V)
  for (let i = 0; i < 100 && !s.result; i++) {
    const ms = Q.legalMoves(V, s, { splits: r() < 0.35 }); if (!ms.length) break
    const m = ms[Math.floor(r() * ms.length)]
    s = Q.applyMove(V, s, m.code, r).state; n++; maxW = Math.max(maxW, s.worlds.length)
    if (s.worlds.length > 64) flag('worlds')
    for (const t of [0, 1]) if (Q.budget(s, t) > 8) flag('budget')
    const h0 = hs(s.worlds[0].b)
    for (const { b } of s.worlds) {
      if (hs(b) !== h0) flag('hand')
      let cnt = 0
      for (let id = 0; id < b.sq.length; id++) {
        const q = b.sq[id]
        if (q >= 0 || q === HAND || (q === OFF && b.ty[id] === 'k')) cnt++
        if (q >= 0) { if (V.topology.coords[q][2] !== boardOf(b.sd[id])) flag('board'); if (b.ty[id] === 'p') { const rk = V.topology.coords[q][1]; if (rk === 0 || rk === 7) flag('pawnrank') } }
      }
      if (cnt !== 64) flag('count')
    }
  }
}
console.log('plies', n, 'maxWorlds', maxW, 'violations', JSON.stringify(bad))
