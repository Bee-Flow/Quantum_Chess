// Per-board move counts (physical vs superphysical), check-detection cost, and checkmate-search behaviour.
const Chess = require('../../5dsrc/package/dist/5d-chess.js')
const { performance } = require('perf_hooks')
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 } }
const c = new Chess(); c.skipDetection = true
const B = c.raw.boardFuncs, M = c.raw.mateFuncs
const r = rng(11)
const snap = []
for (let a = 0; a < 44; a++) {
  let guard = 0
  while (B.present(c.rawBoard, c.rawAction).length > 0 && guard++ < 60) {
    const moves = B.moves(c.rawBoard, c.rawAction, true, true, false)
    if (!moves.length) break
    const travel = moves.filter(m => m[0][0] !== m[1][0] || m[0][1] !== m[1][1])
    const pool = travel.length && r() < 0.15 ? travel : moves.filter(m => !(m[0][0] !== m[1][0] || m[0][1] !== m[1][1]))
    const m = (pool.length ? pool : moves)[Math.floor(r() * (pool.length || moves.length))]
    B.move(c.rawBoard, m)
  }
  c.rawAction++
  if ([6, 12, 20, 30, 43].includes(a)) snap.push({ a, board: B.copy(c.rawBoard), action: c.rawAction })
}
for (const s of snap) {
  const pres = B.present(s.board, s.action)
  const all = B.moves(s.board, s.action, true, true, false)
  const phys = all.filter(m => m[0][0] === m[1][0] && m[0][1] === m[1][1]).length
  let tl = 0; for (const l of s.board) if (l) tl++
  let t0 = performance.now(); let n = 0
  while (performance.now() - t0 < 300) { M.checks(s.board, s.action, true); n++ }
  const chk = (performance.now() - t0) / n
  console.log(JSON.stringify({ ply: s.a + 1, timelines: tl, presentBoards: pres.length, movesPerPresentBoard: +(all.length / Math.max(1, pres.length)).toFixed(1), superphysicalShare: +(1 - phys / Math.max(1, all.length)).toFixed(2), checkDetectMs: +chk.toFixed(2) }))
}
