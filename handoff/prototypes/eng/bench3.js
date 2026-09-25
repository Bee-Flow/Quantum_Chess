const Chess = require('../../5dsrc/package/dist/5d-chess.js')
const { performance } = require('perf_hooks')
const cases = {
  'check, 4 timelines, not mate': '1. d4 / c5 2. Bf4 / Nc6 3. Nc3 / cxd4 4. Nd5 / Qa5 5. Bd2 / Qxd5 6. Nf3 / e6 7. g3 / Bb4 8. c3 / dxc3 9. bxc3 / Qc5 10. cxb4 / (0T10)Qc5>>x(0T7)f2 11. (-1T8)Kxf2 / (-1T8)d3 12. (-1T9)e3 / (-1T9)Ne5 13. (0T11)Bd2>>x(0T8)d5 / (1T8)Nge7 14. (1T9)Bxb4 / (1T9)Nxb4 15. (-1T10)Bg2 (1T10)Ne5 / (-1T10)Qd5>x(1T10)d5 16. (-1T11)Nxe5 (1T11)Nxf7 / (-1T11)Nf6 (0T11)Nf6 (1T11)Nxc2 17. (-1T12)Ne5>(0T12)c5 (1T12)Qxc2 / (1T12)Qb5 (0T12)Ng4 (-1T12)Ng4 18. (0T13)Nc5>(1T13)c7 (-1T13)Qxg4 / (0T13)Bc8>x(1T13)c7 (-1T13)Bc5 19. (-1T14)Qxe6 (0T14)Qxd7 (1T14)Qxc7',
  'check, 5+ timelines, not mate': '1. e3 / h5 2. a4 / h4 3. c3 / h3 4. Nf3 / hxg2 5. Bxg2 / Rxh2 6. Nxh2 / g5 7. (0T7)Bg2>>(0T6)g1 / (1T6)Rxh1 8. (1T7)Bxh1 / (1T7)g5 (0T7)g4 9. (1T8)Nxg5 (0T8)Qc2 / (1T8)f5 (0T8)g3 10. (0T9)Qh7 (1T9)Qh5 / (0T9)Pf7>(1T9)f7 11. (1T10)Qh5>>(1T9)g6 (0T10)fxg3 / (1T10)f4 (0T10)e5 12. (0T11)Qg6 (1T11)Bd5 / (1T11)Ng8>x(0T11)g6 13. (1T12)Bxf7 (0T12)a5 / (0T12)Bf8>>x(0T6)f2 14. (-1T7)Kxf2 / (-1T7)g5 15. (-1T8)Bxb7 / (-1T8)Ng8>>(-1T7)g6 16. (-2T8)Bxb7 / (-2T8)Nf4 17. (-1T9)Bb7>>x(-1T8)c7 / (3T8)Qxc7 18. (-2T9)exf4 (3T9)Bxb7 / (-1T9)Nb8>>(-1T8)b6 19. (-3T9)Kf3 / (-3T9)Nb6>>(-1T8)b6 20. (-4T9)Qd1>>(0T9)h5',
  'mate, 1 timeline': '1. e3 / f6 2. Qe2 / Nc6 3. Qh5',
}
for (const [name, pgn] of Object.entries(cases)) {
  const c = new Chess(); c.checkmateTimeout = 20000
  c.import(pgn)
  let tl = 0; for (const l of c.rawBoard) if (l) tl++
  const t0 = performance.now(); const inCheck = c.inCheck; const t1 = performance.now()
  const mate = c.inCheckmate; const t2 = performance.now()
  console.log(name, JSON.stringify({ timelines: tl, inCheck, checkMs: +(t1 - t0).toFixed(1), mate, mateMs: +(t2 - t1).toFixed(0) }))
}
