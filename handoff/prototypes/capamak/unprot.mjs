import { CAPA, MAKRUK } from './proto.mjs'
import { attacks, cloneWorld, placePiece } from '/home/user/Quantum_Chess/src/variants/core/world.js'
for (const V of [CAPA, MAKRUK]) {
  const w = V.setup({})
  const out = []
  for (let id = 0; id < w.sq.length; id++) {
    if (w.ty[id] !== 'p') continue
    // defended = own side attacks the square if an enemy stood there: replace with enemy piece
    const t = cloneWorld(w); t.sd[id] = 1 - w.sd[id]
    if (!attacks(V, t, w.sd[id], w.sq[id])) out.push((w.sd[id] ? 'b' : 'W') + V.topology.names[w.sq[id]])
  }
  console.log(V.id, 'undefended pawns:', out.join(' '))
}
