import { ZH } from './zh.mjs'
import { BUG } from './bug.mjs'
const QA = await import('/home/user/Quantum_Chess/src/variants/core/quantum.js')
const QB = await import('./quantum_team.js')
const { HAND } = await import('/home/user/Quantum_Chess/src/variants/core/world.js')
function rng(seed) { let x = seed >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296 } }
function handSig(b) { const o = []; for (let id = 0; id < b.sq.length; id++) if (b.sq[id] === HAND) o.push(b.sd[id] + b.ty[id] + id); return o.sort().join(',') }
for (const [name, V, Q] of [['crazyhouse', ZH, QA], ['bughouse', BUG, QB]]) {
  const t0 = Date.now(); let maxW = 0, drops = 0, splits = 0, handDiff = 0, plies = 0, results = {}
  for (let g = 0; g < 20; g++) {
    const r = rng(g + 1)
    let s = Q.newGame(V)
    for (let i = 0; i < 80 && !s.result; i++) {
      const moves = Q.legalMoves(V, s, { splits: r() < 0.3 })
      if (!moves.length) break
      // prefer captures/drops sometimes
      const m = moves[Math.floor(r() * moves.length)]
      if (m.drop) drops++
      if (m.type === 'split') splits++
      const res = Q.applyMove(V, s, m.code, r)
      s = res.state; plies++
      maxW = Math.max(maxW, s.worlds.length)
      const h0 = handSig(s.worlds[0].b)
      if (s.worlds.some(({ b }) => handSig(b) !== h0)) handDiff++
      for (let side = 0; side < V.sideCount; side++) if (Q.budget(s, side) > 8) throw new Error('budget ' + side)
    }
    const key = s.result ? s.result.reason : 'open'; results[key] = (results[key] ?? 0) + 1
  }
  console.log(name, 'ms', Date.now() - t0, 'plies', plies, 'maxWorlds', maxW, 'drops', drops, 'splits', splits, 'handDiffStates', handDiff, JSON.stringify(results))
}
