import { FOUR as V } from './proto.mjs'
import { newGame, legalMoves, applyMove, budget, budgetLimit } from './quantum_fp.js'
let seed = 99
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const alive = (b) => [0, 1, 2, 3].filter((x) => b.sq.some((q, id) => q >= 0 && b.sd[id] === x && b.ty[id] === 'k'))
const solid = (w) => w.board.map((id) => (id >= 0 && V.solidTypes.has(w.ty[id]) ? w.sd[id] + w.ty[id] : '.')).join(',')
const t0 = Date.now(); let plies = 0
for (let g = 0; g < 6; g++) {
  const tg = Date.now(); let maxW = 0; let maxW4 = 0
  const mode = g % 2 ? 'teams' : 'ffa'
  let st = newGame(V, { mode })
  while (!st.result && st.ply < 300) {
    const ms = legalMoves(V, st, { splits: rng() < 0.2 })
    // prefer captures half of the time so that games end
    const caps = ms.filter((m) => m.type === 'move' && st.worlds.some(({ b }) => b.board[m.to] >= 0 && b.sd[b.board[m.to]] !== st.turn))
    const pool = caps.length && rng() < 0.5 ? caps : ms
    const m = pool[Math.floor(rng() * pool.length)]
    st = applyMove(V, st, m.code, rng).state; plies++
    const b0 = st.worlds[0].b
    const al = alive(b0)
    maxW = Math.max(maxW, st.worlds.length)
    if (al.length === 4) maxW4 = Math.max(maxW4, st.worlds.length)
    for (const { b } of st.worlds) {
      if (alive(b).join() !== al.join()) throw new Error('alive differs')
      if (solid(b) !== solid(b0)) throw new Error('solid differs')
      for (let id = 0; id < b.sq.length; id++) {
        if (b.sq[id] < 0) continue
        if (!b.x.teams && !al.includes(b.sd[id])) throw new Error('dead piece on board')
        if (b.ty[id] === 'p') {
          const [x, y] = V.topology.coords[b.sq[id]]
          const pr = [y, x, 13 - y, 13 - x][b.sd[id]]
          if (pr >= (b.x.teams ? 10 : 7) || pr < 1) throw new Error('pawn on or beyond line')
        }
      }
    }
    for (let x = 0; x < 4; x++) if (budget(st, x) > budgetLimit(V, st)) throw new Error('budget')
    if (al.length === 4 && st.worlds.length > 16) throw new Error('worlds > 16 with four')
    if (st.result && st.result.winner === null && !st.result.winners && !['quiet', 'moveLimit', 'noMoves'].includes(st.result.reason)) throw new Error('odd result')
  }
  if (g === 5) console.log(st.history.map(h => h.side + ':' + h.code + ':' + h.key).join(' ')); console.log('game', g, mode, st.ply, 'plies', Date.now() - tg, 'ms', JSON.stringify(st.result), 'maxWorlds', maxW, 'max with four', maxW4)
}
console.log('total plies', plies, 'ms', Date.now() - t0)
