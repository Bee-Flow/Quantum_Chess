import { FOUR as V } from './proto.mjs'
import { stateOf, after } from './lib.mjs'
import { newGame, legalMoves, applyMove, budget, budgetLimit } from './quantum_fp.js'
const K4 = { h1: '0:k', a7: '1:k', g14: '2:k', n8: '3:k' }
// T10
let s = { ...stateOf(V, [[K4, 1]], 0), quiet: 199 }
console.log('T10', JSON.stringify(after(V, s, 'h1-h2').result))
// UI1: rotation per VariantBoard rot()
const W = 14, H = 14
const rot = (r, x, y) => r === 180 ? [W - x, H - y] : r === 90 ? [H - y, x] : r === 270 ? [y, W - x] : [x, y]
const centre = (n) => { const c = V.topology.cells[V.topology.byName(n)]; return [c.x + 0.5, c.y + 0.5] }
for (const [side, k, q] of [[0, 'h1', 'g1'], [1, 'a7', 'a8'], [2, 'g14', 'h14'], [3, 'n8', 'n7']]) {
  const r = V.sides[side].rotate
  console.log('UI1', side, r, 'king', rot(r, ...centre(k)), 'queen', rot(r, ...centre(q)))
}
// F1 fuzz with invariants
let seed = 99
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const alive = (b) => [0, 1, 2, 3].filter((x) => b.sq.some((q, id) => q >= 0 && b.sd[id] === x && b.ty[id] === 'k'))
const t0 = Date.now(); let plies = 0; const res = {}
for (let g = 0; g < 16; g++) {
  const mode = g % 2 ? 'teams' : 'ffa'
  let st = newGame(V, { mode })
  while (!st.result && st.ply < 500) {
    const ms = legalMoves(V, st, { splits: rng() < 0.4 })
    const m = ms[Math.floor(rng() * ms.length)]
    st = applyMove(V, st, m.code, rng).state; plies++
    const b0 = st.worlds[0].b
    const al = alive(b0)
    for (const { b } of st.worlds) {
      if (alive(b).join() !== al.join()) throw new Error('alive differs')
      for (let id = 0; id < b.sq.length; id++) {
        if (b.sq[id] < 0) continue
        if (!b.x.teams && !al.includes(b.sd[id])) throw new Error('dead piece on board')
        if (b.ty[id] === 'p') {
          const [x, y] = V.topology.coords[b.sq[id]]
          const pr = [y, x, 13 - y, 13 - x][b.sd[id]]
          if (pr > (b.x.teams ? 10 : 7) || pr < 1) throw new Error('pawn beyond line')
        }
      }
      const solid = (w) => w.board.map((id) => (id >= 0 && V.solidTypes.has(w.ty[id]) ? w.sd[id] + w.ty[id] : '.')).join(',')
      if (solid(b) !== solid(b0)) throw new Error('solid differs')
    }
    for (let x = 0; x < 4; x++) if (budget(st, x) > budgetLimit(V, st)) throw new Error('budget')
    if (al.length === 4 && st.worlds.length > 16) throw new Error('worlds > 16 with four')
    if (st.result && !st.result.winners && st.result.winner === null && st.result.reason !== 'quiet' && st.result.reason !== 'moveLimit') throw new Error('odd result')
  }
  const k = mode + ' ' + JSON.stringify(st.result); res[k] = (res[k] ?? 0) + 1
}
console.log('F1 plies', plies, 'ms', Date.now() - t0, res)
