import V from '/home/user/Quantum_Chess/src/variants/chess960.js'
import { worldFrom, generate, applyClassical, nameOf } from '/home/user/Quantum_Chess/src/variants/core/world.js'
import { castlingRights } from '/home/user/Quantum_Chess/src/variants/core/orthodox.js'
const w = worldFrom(V, { g1: '0:k', h1: '0:r', a1: '0:r', e8: '1:k' }, {})
w.x = { ep: -1, epVictim: -1, castle: castlingRights(V, w) }
console.log(JSON.stringify(w.x.castle.map(c => ({...c, king: nameOf(V,c.king), rook: nameOf(V,c.rook), kingTo: nameOf(V,c.kingTo), rookTo: nameOf(V,c.rookTo)}))))
const g = generate(V, w, 0)
for (const [k, m] of g) if (m.kind === 'castle') {
  const n = applyClassical(V, w, m)
  const pos = n.sq.map((s, id) => n.ty[id] + n.sd[id] + '@' + (s >= 0 ? nameOf(V, s) : s))
  console.log(k, 'from', nameOf(V, m.from), 'to', nameOf(V, m.to), '=>', pos.join(' '))
}
