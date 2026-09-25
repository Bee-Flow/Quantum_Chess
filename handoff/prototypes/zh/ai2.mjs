import { ZH } from './zh.mjs'
const Q = await import('/home/user/Quantum_Chess/src/variants/core/quantum.js')
const { chooseMove } = await import('/home/user/Quantum_Chess/src/variants/core/ai.js')
const { HAND } = await import('/home/user/Quantum_Chess/src/variants/core/world.js')
const V = ZH
const topo = V.topology
V.evaluate = (b, side) => {
  let score = 0
  const kings = []
  for (let id = 0; id < b.sq.length; id++) if (b.ty[id] === 'k' && b.sq[id] >= 0) kings[b.sd[id]] = b.sq[id]
  for (let id = 0; id < b.sq.length; id++) {
    const s = b.sq[id]; const own = b.sd[id] === side ? 1 : -1
    if (s === HAND) { score += own * 0.2 * V.types[b.ty[id]].value; continue }
    if (s < 0 || b.ty[id] === 'k') continue
    const ek = kings[1 - b.sd[id]]; if (ek === undefined) continue
    const [f, r] = topo.coords[s]; const [kf, kr] = topo.coords[ek]
    if (Math.max(Math.abs(f - kf), Math.abs(r - kr)) <= 2) score += own * 12
  }
  return score
}
let s = Q.newGame(V)
const r = (() => { let x = 7; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648 } })()
const log = []
for (let i = 0; i < 40 && !s.result; i++) {
  const m = await chooseMove(V, s, { level: 'normal', rng: r })
  log.push(m)
  s = Q.applyMove(V, s, m, r).state
}
console.log(log.join(' '), JSON.stringify(s.result))
