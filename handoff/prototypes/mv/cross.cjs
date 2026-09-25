// Cross-check the prototype generator against 5d-chess-js on random games.
const Chess = require('../../5dsrc/package/dist/5d-chess.js')
;(async () => {
const P = await import('./proto.mjs')
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'
let seed = Number(process.argv[2] ?? 1)
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const sigJ = (m) => `${m.start.timeline}:${m.start.turn}:${m.start.player[0]}:${m.start.file}${m.start.rank}>${m.end.timeline}:${m.end.turn}:${m.end.player[0]}:${m.end.file}${m.end.rank}`
const sigP = (w, m) => {
  const us = Math.floor(m.from / (P.S * P.C)); const vs = w.x.tl[us][1]; const c = m.from % 64
  const t = m.tg
  return `${P.LOf(us)}:${vs >> 1}:${(vs & 1) ? 'b' : 'w'}:${(c % 8) + 1}${(c >> 3) + 1}>${P.LOf(t.ut)}:${t.vt >> 1}:${(t.vt & 1) ? 'b' : 'w'}:${(t.cell % 8) + 1}${(t.cell >> 3) + 1}`
}
const outsideWindow = (w, sig) => {
  const [, e] = sig.split('>'); const [L, T, c] = e.split(':'); const u = P.uOf(Number(L)); const v = 2 * Number(T) + (c === 'b' ? 1 : 0)
  const tl = w.x.tl[u]; return !tl || tl[1] - v > P.HB
}
let games = 0, plies = 0, mismatches = 0, maxTL = 0, travel = 0, windowOnly = 0, checkCmp = 0, checkBad = 0, checks = 0, moveCount = 0
for (let g = 0; g < Number(process.argv[3] ?? 20); g++) {
  const c = new Chess(); c.skipDetection = true
  let w = P.setup(START, 8)
  for (let step = 0; step < 80; step++) {
    const side = w.x.s
    const mine = P.generate(w, side).filter((m) => m.kind !== 'submit')
    const theirs = c.moves('object', false, false)
    moveCount += mine.length
    const A = new Set(mine.filter((m) => m.kind !== 'castle').map((m) => sigP(w, m)))
    const B = new Set(theirs.filter((m) => !m.castling).map(sigJ))
    const onlyA = [...A].filter((x) => !B.has(x))
    let onlyB = [...B].filter((x) => !A.has(x))
    const sk = P.skel(w); const created = side === 0 ? sk.cW : sk.cB
    const wo = onlyB.filter((x) => outsideWindow(w, x)); windowOnly += wo.length
    onlyB = onlyB.filter((x) => !outsideWindow(w, x))
    if (created >= 3) onlyB = []
    if (onlyA.length || onlyB.length) { mismatches++; if (mismatches < 6) console.log('MISMATCH game', g, 'step', step, 'onlyMine', onlyA.slice(0, 5), 'onlyRef', onlyB.slice(0, 5)) }
    const inCheck = c.inCheck
    const myCheck = P.royalThreats(w, side).length > 0
    checkCmp++; if (inCheck) checks++
    if (inCheck !== myCheck) { checkBad++; if (checkBad < 4) console.log('CHECK mismatch', g, step, 'ref', inCheck, 'mine', myCheck) }
    const subMine = P.passed(w)
    if (!inCheck && subMine !== c.submittable()) { mismatches++; console.log('SUBMIT mismatch', g, step, subMine) }
    if (Math.max(...w.x.tl.filter(Boolean).map((e) => e[1] >> 1)) >= 7) break
    if ((subMine && rng() < 0.45) || mine.length === 0) {
      if (!subMine || inCheck) break
      w = P.apply(w, { kind: 'submit' }); c.submit(); plies++; continue
    }
    const m = mine[Math.floor(rng() * mine.length)]
    const sig = sigP(w, m)
    const ref = theirs.find((x) => sigJ(x) === sig && (!x.promotion || x.promotion === 'Q'))
    if (!ref) { if (m.kind !== 'castle') console.log('no ref move for', m.key); break }
    if (m.travel !== 'physical') travel++
    w = P.apply(w, m); c.move(ref); plies++
    maxTL = Math.max(maxTL, w.x.tl.filter(Boolean).length)
  }
  games++
}
console.log({ games, plies, travel, mismatches, windowOnly, maxTL, checkCmp, checks, checkBad, avgMoves: Math.round(moveCount / Math.max(1, checkCmp)) })
})()
