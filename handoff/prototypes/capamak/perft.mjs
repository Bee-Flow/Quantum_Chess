import { CAPA, MAKRUK } from './proto.mjs'
import { generate, applyClassical, attacks, royalSquares } from '/home/user/Quantum_Chess/src/variants/core/world.js'
function legal(V, w, side) {
  const out = []
  for (const m of generate(V, w, side).values()) {
    const n = applyClassical(V, n0(w), m)
    const k = royalSquares(V, n, side)
    if (k.length && !attacks(V, n, 1 - side, k[0])) {
      if (m.kind === 'castle') {
        // FSF: may not castle out of or through check
        const path = []
        const [kf, r] = V.topology.coords[m.from]; const tf = V.topology.coords[m.extra.kingTo][0]
        for (let f = Math.min(kf, tf); f <= Math.max(kf, tf); f++) path.push(V.topology.at([f, r]))
        if (path.some((s) => attacks(V, w, 1 - side, s))) continue
      }
      out.push([m, n])
    }
  }
  return out
}
const n0 = (w) => w
function perft(V, w, side, d) {
  if (d === 0) return 1
  let c = 0
  for (const [, n] of legal(V, w, side)) c += d === 1 ? 1 : perft(V, n, 1 - side, d - 1)
  return c
}
for (const [V, name] of [[MAKRUK, 'makruk'], [CAPA, 'capablanca']]) {
  const w = V.setup({})
  const res = []
  for (let d = 1; d <= 4; d++) res.push(perft(V, w, 0, d))
  console.log(name, res.join(' '))
}
