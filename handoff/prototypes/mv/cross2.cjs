const Chess = require('../../5dsrc/package/dist/5d-chess.js')
;(async () => {
const P = await import('./proto.mjs')
const star = (fen) => fen.replace(/[KkRrPpWw]/g, (c) => c + '*')
const VARS = [
  ['standard', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR', 8],
  ['princess', 'rnbskbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBSKBNR', 8],
  ['royalty', 'rnbycbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBYCBNR', 8],
  ['small', 'kqbnr/ppppp/5/PPPPP/KQBNR', 5],
  ['smallOpen', 'prnbk/3pp/5/PP3/KBNRP', 5],
  ['verySmallOpen', 'nbrk/3p/P3/KRBN', 4],
  ['unicorns', '1u1uk/5/5/5/KU1U1', 5],
  ['dragons', '2ddk/5/5/5/KDD2', 5],
  ['brawns', 'wwwwk/5/5/5/KWWWW', 5],
]
const sigJ = (m) => `${m.start.timeline}:${m.start.turn}:${m.start.player[0]}:${m.start.file}${m.start.rank}>${m.end.timeline}:${m.end.turn}:${m.end.player[0]}:${m.end.file}${m.end.rank}`
const sigP = (w, m) => { const us = Math.floor(m.from / (P.S * P.C)); const vs = w.x.tl[us][1]; const c = m.from % 64; const t = m.tg
  return `${P.LOf(us)}:${vs >> 1}:${(vs & 1) ? 'b' : 'w'}:${(c % 8) + 1}${(c >> 3) + 1}>${P.LOf(t.ut)}:${t.vt >> 1}:${(t.vt & 1) ? 'b' : 'w'}:${(t.cell % 8) + 1}${(t.cell >> 3) + 1}` }
const outside = (w, sig) => { const [s, e] = sig.split('>'); const f = (x) => { const [L, T, c] = x.split(':'); return [P.uOf(Number(L)), 2 * Number(T) + (c === 'b' ? 1 : 0)] }
  const [u, v] = f(e); const tl = w.x.tl[u]; return !tl || tl[1] - v > P.HB }
for (const [name, fen, z] of VARS) {
  let seed = 11
  const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  let plies = 0, mism = 0, checkBad = 0, travel = 0, gen = 0, maxTL = 0, winEnds = 0
  for (let g = 0; g < 25; g++) {
    const imp = `[Size "${z}x${z}"]\n[Board "custom"]\n[Mode "5D"]\n[Promotions "Q"]\n[${star(fen)}:0:1:w]\n`
    const c = new Chess(imp, 'custom'); c.skipDetection = true
    let w = P.setup(fen, z)
    for (let step = 0; step < 70; step++) {
      const side = w.x.s
      const mine = P.generate(w, side).filter((m) => m.kind !== 'submit')
      const theirs = c.moves('object', false, false)
      gen++
      const A = new Set(mine.filter((m) => m.kind !== 'castle').map((m) => sigP(w, m)))
      const B = new Set(theirs.filter((m) => !m.castling).map(sigJ))
      const onlyA = [...A].filter((x) => !B.has(x))
      let onlyB = [...B].filter((x) => !A.has(x) && !outside(w, x))
      const sk = P.skel(w); if ((side === 0 ? sk.cW : sk.cB) >= 3) onlyB = onlyB.filter(() => false)
      if (onlyA.length || onlyB.length) { mism++; if (mism < 3) console.log(name, 'MISMATCH', g, step, onlyA.slice(0, 4), onlyB.slice(0, 4)) }
      const inCheck = c.inCheck; const my = P.royalThreats(w, side).length > 0
      if (inCheck !== my) { checkBad++; if (checkBad < 3) console.log(name, 'CHECK', g, step, inCheck, my) }
      if (w.x.k !== null) { winEnds++; break }
      const subMine = P.passed(w)
      if (!inCheck && subMine !== c.submittable()) { mism++; console.log(name, 'SUBMIT', g, step) }
      if (Math.max(...w.x.tl.filter(Boolean).map((e) => e[1] >> 1)) >= 7) break
      if ((subMine && rng() < 0.45) || mine.length === 0) {
        if (!subMine || inCheck) break
        w = P.apply(w, { kind: 'submit' }); c.submit(); plies++; continue
      }
      const m = mine[Math.floor(rng() * mine.length)]
      const sig = sigP(w, m)
      const ref = theirs.find((x) => sigJ(x) === sig && (!x.promotion || x.promotion === 'Q'))
      if (!ref) { if (m.kind !== 'castle') { console.log(name, 'no ref', m.key); } break }
      if (m.travel !== 'physical') travel++
      w = P.apply(w, m); c.move(ref); plies++
      maxTL = Math.max(maxTL, w.x.tl.filter(Boolean).length)
    }
  }
  console.log(name.padEnd(14), { plies, travel, gen, mism, checkBad, maxTL, winEnds })
}
})()
