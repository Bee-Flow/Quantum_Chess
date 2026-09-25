// Random-play statistics with 5d-chess-js 1.2.1: timelines, boards, moves per present, time per move generation.
const Chess = require('../../5dsrc/package/dist/5d-chess.js')
const { performance } = require('perf_hooks')
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 } }
function run(seed, turns, pBranch) {
  const r = rng(seed)
  const c = new Chess()
  c.skipDetection = true
  const B = c.raw.boardFuncs
  const stats = []
  for (let a = 0; a < turns * 2; a++) {
    let guard = 0
    let genMs = 0, genCalls = 0, maxMoves = 0
    while (B.present(c.rawBoard, c.rawAction).length > 0 && guard++ < 40) {
      const t0 = performance.now()
      const moves = B.moves(c.rawBoard, c.rawAction, true, true, false)
      genMs += performance.now() - t0; genCalls++
      maxMoves = Math.max(maxMoves, moves.length)
      if (!moves.length) break
      const travel = moves.filter(m => m[0][0] !== m[1][0] || m[0][1] !== m[1][1])
      const pool = travel.length && r() < pBranch ? travel : moves
      const m = pool[Math.floor(r() * pool.length)]
      B.move(c.rawBoard, m)
    }
    c.rawAction++
    let boards = 0, tl = 0
    for (const l of c.rawBoard) { if (!l) continue; tl++; for (const t of l) if (t) boards++ }
    stats.push({ a, tl, active: B.active(c.rawBoard).length, boards, maxMoves, genMsPerCall: genCalls ? genMs / genCalls : 0 })
  }
  return stats
}
for (const p of [0.05, 0.2, 0.5]) {
  const s = run(7, 20, p)
  const pick = [3, 9, 19, 29, 39].map(i => s[i]).filter(Boolean)
  console.log('pBranch', p, JSON.stringify(pick.map(x => ({ ply: x.a + 1, tl: x.tl, act: x.active, boards: x.boards, moves: x.maxMoves, ms: +x.genMsPerCall.toFixed(2) }))))
}
