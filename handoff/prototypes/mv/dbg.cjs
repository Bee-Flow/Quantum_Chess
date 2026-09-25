const Chess = require('../../5dsrc/package/dist/5d-chess.js')
;(async () => {
const P = await import('./proto.mjs')
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'
for (const [s0, G] of [[1, 27], [7, 15]]) {
let seed = s0
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const sigJ = (m) => `${m.start.timeline}:${m.start.turn}:${m.start.player[0]}:${m.start.file}${m.start.rank}>${m.end.timeline}:${m.end.turn}:${m.end.player[0]}:${m.end.file}${m.end.rank}`
const sigP = (w, m) => { const us = Math.floor(m.from / (P.S * P.C)); const vs = w.x.tl[us][1]; const c = m.from % 64; const t = m.tg
  return `${P.LOf(us)}:${vs >> 1}:${(vs & 1) ? 'b' : 'w'}:${(c % 8) + 1}${(c >> 3) + 1}>${P.LOf(t.ut)}:${t.vt >> 1}:${(t.vt & 1) ? 'b' : 'w'}:${(t.cell % 8) + 1}${(t.cell >> 3) + 1}` }
for (let g = 0; g <= G; g++) {
  const c = new Chess(); c.skipDetection = true
  let w = P.setup(START, 8)
  for (let step = 0; step < 80; step++) {
    const side = w.x.s
    const mine = P.generate(w, side).filter((m) => m.kind !== 'submit')
    const theirs = c.moves('object', false, false)
    const inCheck = c.inCheck
    const myCheck = P.royalThreats(w, side).length > 0
    if (g === G && inCheck !== myCheck) {
      const ch = c.checks('object')
      console.log('game', g, 'step', step, 'side', side, 'tl', JSON.stringify(w.x.tl.map((e, u) => e && [P.LOf(u), ...e])), 'created', P.skel(w).cW, P.skel(w).cB)
      console.log(' ref checks', ch.map((m) => sigJ(m)).slice(0, 4))
      break
    }
    const subMine = P.passed(w)
    if (Math.max(...w.x.tl.filter(Boolean).map((e) => e[1] >> 1)) >= 7) break
    if ((subMine && rng() < 0.45) || mine.length === 0) {
      if (!subMine || inCheck) break
      w = P.apply(w, { kind: 'submit' }); c.submit(); continue
    }
    const m = mine[Math.floor(rng() * mine.length)]
    const sig = sigP(w, m)
    const ref = theirs.find((x) => sigJ(x) === sig && (!x.promotion || x.promotion === 'Q'))
    if (!ref) break
    w = P.apply(w, m); c.move(ref)
  }
}
}
})()
