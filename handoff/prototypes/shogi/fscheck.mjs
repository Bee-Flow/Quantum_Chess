// Cross-check of classical legal move counts against Fairy-Stockfish (built from handoff/ext in handoff/tmp/shogi/fsrc).
// Fairy-Stockfish generates a pawn-drop mate as a legal move (it scores it as a loss for the dropper), so positions
// with an uchifuzume drop differ by exactly the number of such drops.
import { execFileSync } from 'node:child_process'
import { fromSfen, legal } from './perft.mjs'
const FS = new URL('../../tmp/shogi/fsrc/stockfish', import.meta.url).pathname
function fsPerft(sfen, depth) {
  const [board, turn, hand] = sfen.split(' ')
  let h = ''
  if (hand && hand !== '-') { let n = 0; for (const ch of hand) { if (/[0-9]/.test(ch)) { n = n * 10 + Number(ch); continue } h += ch.repeat(n || 1); n = 0 } }
  const fen = `${board}[${h}] ${turn === 'b' ? 'w' : 'b'} - - 0 1`
  const out = execFileSync(FS, { input: `setoption name UCI_Variant value shogi\nposition fen ${fen}\ngo perft ${depth}\nquit\n` }).toString()
  return Number(/Nodes searched: (\d+)/.exec(out)[1])
}
function myPerft(w, side, d) {
  const l = legal(w, side)
  if (d === 1) return l.length
  let n = 0
  for (const [, nx] of l) n += myPerft(nx, 1 - side, d - 1)
  return n
}
const cases = [
  ['S4 drops', '8k/9/9/5+P3/9/9/4P4/9/4K4 b PLN 1'],
  ['S4 Gote drops', '4k4/9/9/9/9/9/9/9/4K4 w pn 1'],
  ['S5 uchifuzume base', '7nk/9/7G1/9/9/9/9/9/4K4 b PG 1'],
  ['S5 no gold', '7nk/9/9/9/9/9/9/9/4K4 b P 1'],
  ['S5 silver defender', '7sk/9/7G1/9/9/9/9/9/4K4 b P 1'],
  ['S5 pinned silver', 'R6sk/9/7G1/9/9/9/9/9/4K4 b P 1'],
  ['S2 silvers', 'k8/9/3S5/5S3/9/9/9/9/4K4 b - 1'],
  ['S3 forced promotion', 'k8/6P2/9/2N5L/3N5/9/9/9/4K4 b - 1'],
  ['S3 Gote pawn', '4k4/9/9/9/9/2p6/9/9/K8 w - 1'],
  ['S6 dragon capture', '4k1s2/7+R1/9/9/9/9/9/9/4K4 w - 1'],
  ['S7 impasse position', 'RBGG1SS2/3+P1+P+P+P1/4K4/9/9/9/9/9/k8 w RB 1'],
  ['S8 no moves', 'GSGSGSGSK/PPPPPPPPP/9/9/9/9/9/9/4k4 w - 1'],
  ['S10', '4kg3/9/4P4/9/9/9/9/9/4K4 b - 1'],
  ['middlegame with hands', 'ln1g5/1r2S1k2/p2pppn2/2ps2p2/1p7/2P6/PPSPPPPLP/2G2K1pr/LN4G1b w BGSLPnp 62'],
]
for (const [name, sfen] of cases) {
  const { w, side } = fromSfen(sfen)
  const mine = [1, 2].map((d) => myPerft(w, side, d))
  const fs = [1, 2].map((d) => fsPerft(sfen, d))
  console.log(name.padEnd(24), 'mine', mine.join('/').padEnd(14), 'FS', fs.join('/'), mine[0] === fs[0] && mine[1] === fs[1] ? 'same' : 'DIFF')
}
