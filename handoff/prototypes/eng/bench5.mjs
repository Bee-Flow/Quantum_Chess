// Cost of the core's O(size) world operations (clone, worldKey, solid scan) for different square-space sizes.
import { cloneWorld, worldKey } from '/home/user/Quantum_Chess/src/variants/core/world.js'
import { performance } from 'perf_hooks'
function mk(size, pieces) {
  const w = { sq: [], ty: [], sd: [], board: new Array(size).fill(-1), x: { tl: [[0, 1, 9]] } }
  for (let i = 0; i < pieces; i++) { const s = Math.floor((i * 7919) % size); if (w.board[s] >= 0) continue; w.board[s] = w.sq.length; w.sq.push(s); w.ty.push('pnbrqk'[i % 6]); w.sd.push(i % 2) }
  return w
}
for (const [size, pieces] of [[1000, 300], [3584, 700], [5376, 900], [20000, 1500], [128000, 1500]]) {
  const w = mk(size, pieces)
  let t0 = performance.now(); for (let i = 0; i < 64; i++) cloneWorld(w); const clone = performance.now() - t0
  t0 = performance.now(); let len = 0; for (let i = 0; i < 64; i++) len = worldKey(w).length; const key = performance.now() - t0
  t0 = performance.now(); for (let i = 0; i < 64; i++) { let n = 0; for (let s = 0; s < w.board.length; s++) if (w.board[s] >= 0) n++ } const scan = performance.now() - t0
  console.log(JSON.stringify({ size, pieces, clone64ms: +clone.toFixed(1), worldKey64ms: +key.toFixed(1), keyKB: Math.round(len / 1024), scan64ms: +scan.toFixed(1), jsonKB: Math.round(JSON.stringify(w).length / 1024) }))
}
