// Prototype of a lean 5D move generator on flat typed arrays, to size the per-world cost in the browser.
import { performance } from 'perf_hooks'
const axesVecs = (n) => { // vectors with exactly n nonzero unit components over (x,y,t,l)
  const out = []
  for (let m = 0; m < 81; m++) { let a = m, v = []; for (let i = 0; i < 4; i++) { v.push((a % 3) - 1); a = Math.floor(a / 3) } if (v.filter(c => c).length === n) out.push(v) }
  return out
}
const ROOK = axesVecs(1), BISHOP = axesVecs(2), UNI = axesVecs(3), DRA = axesVecs(4)
const QUEEN = [...ROOK, ...BISHOP, ...UNI, ...DRA]
const KNIGHT = []
for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i !== j) for (const a of [-2, 2]) for (const b of [-1, 1]) { const v = [0, 0, 0, 0]; v[i] = a; v[j] = b; KNIGHT.push(v) }
const SET = { 2: [KNIGHT, false], 3: [BISHOP, true], 4: [ROOK, true], 5: [QUEEN, true], 6: [QUEEN, false] }
console.log('vector counts', { ROOK: ROOK.length, BISHOP: BISHOP.length, UNI: UNI.length, DRA: DRA.length, QUEEN: QUEEN.length, KNIGHT: KNIGHT.length })
// multiverse: lines[li] = { end: v, boards: Array(v) of Int8Array(N*N) | null }, v = half-turn index (2T + c)
function makeMV(N, nLines, depth, setup) {
  const lines = []
  for (let li = 0; li < nLines; li++) {
    const boards = []
    const end = 2 * depth + (li % 2 ? 0 : 0)
    for (let v = 0; v <= end; v++) boards.push(v >= end - 2 * 4 ? Int8Array.from(setup) : null) // window of 4 turns
    lines.push({ end, boards })
  }
  return { N, lines }
}
function board(mv, li, v) { const L = mv.lines[li]; return L && v >= 0 && v <= L.end ? L.boards[v] : null }
let KEYS = false
const FILES = 'abcdefgh'
function generate(mv, side) {
  const N = mv.N; let count = 0; const out = new Map()
  const sign = side === 0 ? 1 : -1
  for (let li = 0; li < mv.lines.length; li++) {
    const L = mv.lines[li]; if ((L.end & 1) !== side) continue
    const b = L.boards[L.end]
    for (let c = 0; c < N * N; c++) {
      const p = b[c] * sign; if (p <= 0) continue
      if (p === 1) { // pawn: 1 forward on y, 1 forward on l, 2 diagonal captures (simplified)
        count += 2; continue
      }
      const [vecs, ride] = SET[p]
      const x0 = c % N, y0 = (c / N) | 0
      for (const [dx, dy, dt, dl] of vecs) {
        let x = x0, y = y0, v = L.end, l = li
        for (;;) {
          x += dx; y += dy; v += 2 * dt; l += dl
          if (x < 0 || y < 0 || x >= N || y >= N) break
          const tb = (dt === 0 && dl === 0) ? b : board(mv, l, v)
          if (!tb) break
          const q = tb[y * N + x] * sign
          if (q > 0) break
          count++
          if (KEYS) { const key = '(' + (li) + 'T' + (L.end >> 1) + ')' + FILES[x0] + (y0 + 1) + '-' + (tb === b ? '' : '(' + l + 'T' + (v >> 1) + ')') + FILES[x] + (y + 1); out.set(key, { key, from: c, to: y * N + x, id: 0, capture: q < 0 ? 1 : -1, kind: 'n' }) }
          if (q < 0 || !ride) break
        }
      }
    }
  }
  return count
}
const STD = [4,2,3,5,6,3,2,4, 1,1,1,1,1,1,1,1, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, 0,0,0,0,0,0,0,0, -1,-1,-1,-1,-1,-1,-1,-1, -4,-2,-3,-5,-6,-3,-2,-4]
// open middlegame-ish: remove most pawns so riders see far
const OPEN8 = STD.map((p, i) => (Math.abs(p) === 1 && i % 3 !== 0) ? 0 : p)
const SMALL = [6,5,3,2,4, 1,1,1,1,1, 0,0,0,0,0, -1,-1,-1,-1,-1, -6,-5,-3,-2,-4]
const OPEN5 = SMALL.map((p, i) => (Math.abs(p) === 1 && i % 2) ? 0 : p)
for (const [name, N, setup] of [['8x8 open', 8, OPEN8], ['5x5 open', 5, OPEN5]]) {
  for (const nl of [1, 3, 5, 9, 15]) {
    const mv = makeMV(N, nl, 10, setup)
    const res = []
    for (const k of [false, true]) { KEYS = k
      let n = 0, moves = 0; const t0 = performance.now()
      while (performance.now() - t0 < 200) { moves = generate(mv, 0); n++ }
      res.push([moves, (performance.now() - t0) * 1000 / n]) }
    console.log(name, 'timelines', nl, 'moves', res[0][0], 'us/gen (count only)', res[0][1].toFixed(0), 'us/gen (keyed Map)', res[1][1].toFixed(0), 'keyed x64 worlds ms', (res[1][1] * 64 / 1000).toFixed(1))
  }
}
