import { FOUR as V } from './proto.mjs'
import { newGame, legalMoves, applyMove, budget } from './quantum_fp.js'
let seed = 7
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
for (const mode of ['ffa', 'teams']) {
  const t0 = Date.now()
  let games = 0, plies = 0, maxW = 0, results = {}
  for (let g = 0; g < 6; g++) {
    let s = newGame(V, { mode })
    while (!s.result && s.ply < 400) {
      const ms = legalMoves(V, s, { splits: rng() < 0.3 })
      const cap = ms.filter(m => m.type === 'move' && V.topology.names[m.to] && s.worlds.some(({ b }) => b.board[m.to] >= 0 && b.sd[b.board[m.to]] !== s.turn))
      const pool = cap.length && rng() < 0.6 ? cap : ms
      const m = pool[Math.floor(rng() * pool.length)]
      const r = applyMove(V, s, m.code, rng)
      s = r.state; plies++
      maxW = Math.max(maxW, s.worlds.length)
      for (let x = 0; x < 4; x++) if (budget(s, x) > V.budgetLimit(s.worlds[0].b)) throw new Error('budget')
    }
    games++
    const k = JSON.stringify(s.result)
    results[k] = (results[k] ?? 0) + 1
  }
  console.log(mode, 'games', games, 'plies', plies, 'ms', Date.now() - t0, 'maxWorlds', maxW, results)
}
