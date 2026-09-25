import * as P from './proto.mjs'
let seed = 5
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const worldKey = (w) => w.board.map((id) => (id < 0 ? '.' : w.sd[id] + w.ty[id] + id)).join(',') + '|' + JSON.stringify(w.x)
const stats = []
for (const [name, fen, z] of [['standard', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', 8], ['small', 'kqbnr/ppppp/5/PPPPP/KQBNR', 5]]) {
  let best = null
  for (let g = 0; g < 40; g++) {
    let w = P.setup(fen, z)
    for (let step = 0; step < 200 && w.x.k === null; step++) {
      const mine = P.generate(w, w.x.s)
      const sub = mine.find((m) => m.kind === 'submit')
      const rest = mine.filter((m) => m.kind !== 'submit')
      if ((sub && rng() < 0.4) || !rest.length) { if (!sub) break; w = P.apply(w, sub); continue }
      // prefer travel moves sometimes to grow the multiverse
      const tr = rest.filter((m) => m.travel === 'branch')
      const pool = tr.length && rng() < 0.25 ? tr : rest
      w = P.apply(w, pool[Math.floor(rng() * pool.length)])
      const rows = w.x.tl.filter(Boolean).length
      if (!best || rows > best.rows || (rows === best.rows && w.board.length > best.w.board.length)) best = { rows, w: P.clone(w) }
    }
  }
  const w = best.w
  // timing
  const t0 = performance.now(); let n = 0, cnt = 0
  while (performance.now() - t0 < 500) { const c = { ...w, x: JSON.parse(JSON.stringify(w.x)) }; cnt = P.generate(c, c.x.s).length; n++ }
  const gen = (performance.now() - t0) / n
  const t1 = performance.now(); let k = 0
  while (performance.now() - t1 < 300) { worldKey(w); k++ }
  const wk = (performance.now() - t1) / k
  const t2 = performance.now(); let a = 0
  const ms = P.generate(w, w.x.s).filter((m) => m.kind !== 'submit')
  while (performance.now() - t2 < 300) { P.apply(w, ms[a % ms.length]); a++ }
  const ap = (performance.now() - t2) / a
  const t3 = performance.now(); let r = 0
  while (performance.now() - t3 < 300) { P.royalThreats(w, w.x.s); r++ }
  const th = (performance.now() - t3) / r
  const json = JSON.stringify({ sq: w.sq, ty: w.ty, sd: w.sd, board: w.board, x: w.x }).length
  const pieces = w.sq.filter((s) => s >= 0).length
  console.log(name, { rows: best.rows, arrayLen: w.board.length, pieces, moves: cnt, genMs: gen.toFixed(3), worldKeyMs: wk.toFixed(3), applyMs: ap.toFixed(3), threatsMs: th.toFixed(3), jsonKB: (json / 1024).toFixed(1) })
}
