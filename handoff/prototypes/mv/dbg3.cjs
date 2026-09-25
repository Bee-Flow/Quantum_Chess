const Chess = require('../../5dsrc/package/dist/5d-chess.js')
;(async () => {
const P = await import('./proto.mjs')
const star = (fen) => fen.replace(/[KkRrPpWw]/g, (c) => c + '*')
const [name, fen, z, G, STEP] = JSON.parse(process.argv[2])
const sigJ = (m) => `${m.start.timeline}:${m.start.turn}:${m.start.player[0]}:${m.start.file}${m.start.rank}>${m.end.timeline}:${m.end.turn}:${m.end.player[0]}:${m.end.file}${m.end.rank}`
const sigP = (w, m) => { const us = Math.floor(m.from / (P.S * P.C)); const vs = w.x.tl[us][1]; const c = m.from % 64; const t = m.tg
  return `${P.LOf(us)}:${vs >> 1}:${(vs & 1) ? 'b' : 'w'}:${(c % 8) + 1}${(c >> 3) + 1}>${P.LOf(t.ut)}:${t.vt >> 1}:${(t.vt & 1) ? 'b' : 'w'}:${(t.cell % 8) + 1}${(t.cell >> 3) + 1}` }
let seed = 11
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
for (let g = 0; g <= G; g++) {
  const imp = `[Size "${z}x${z}"]\n[Board "custom"]\n[Mode "5D"]\n[Promotions "Q"]\n[${star(fen)}:0:1:w]\n`
  const c = new Chess(imp, 'custom'); c.skipDetection = true
  let w = P.setup(fen, z)
  for (let step = 0; step < 70; step++) {
    const side = w.x.s
    const mine = P.generate(w, side).filter((m) => m.kind !== 'submit')
    const theirs = c.moves('object', false, false)
    if (g === G && step === STEP) {
      console.log('tl', JSON.stringify(w.x.tl.map((e, u) => e && [P.LOf(u), ...e])), 'side', side)
      console.log('ref checks', c.checks('object').map(sigJ))
      console.log('my threats', P.royalThreats(w, side).map((m) => m.key))
      break
    }
    if (w.x.k !== null) break
    const subMine = P.passed(w); const inCheck = c.inCheck
    if (Math.max(...w.x.tl.filter(Boolean).map((e) => e[1] >> 1)) >= 7) break
    if ((subMine && rng() < 0.45) || mine.length === 0) { if (!subMine || inCheck) break; w = P.apply(w, { kind: 'submit' }); c.submit(); continue }
    const m = mine[Math.floor(rng() * mine.length)]
    const sig = sigP(w, m)
    const ref = theirs.find((x) => sigJ(x) === sig && (!x.promotion || x.promotion === 'Q'))
    if (!ref) break
    w = P.apply(w, m); c.move(ref)
  }
}
})()
