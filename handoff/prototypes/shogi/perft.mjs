// Legal perft on the prototype (pseudo-legal generation + "own king not capturable" filter) against known counts.
import { SHOGI as V } from './shogi.mjs'
import { generate, applyClassical, attacks, addPiece, emptyWorld, HAND } from '../../../src/variants/core/world.js'
export function fromSfen(sfen) {
  const [board, turn, hand] = sfen.split(' ')
  const w = emptyWorld(V)
  const rows = board.split('/')
  rows.forEach((row, k) => { // k = 0 is rank a
    let f = 0
    for (let i = 0; i < row.length; i++) {
      let ch = row[i]
      if (/[0-9]/.test(ch)) { f += Number(ch); continue }
      let promo = ''
      if (ch === '+') { promo = '+'; ch = row[++i] }
      const side = ch === ch.toUpperCase() ? 0 : 1
      addPiece(w, promo + ch.toLowerCase(), side, V.topology.at([f, 8 - k]))
      f++
    }
  })
  if (hand && hand !== '-') {
    let n = 0
    for (const ch of hand) {
      if (/[0-9]/.test(ch)) { n = n * 10 + Number(ch); continue }
      const side = ch === ch.toUpperCase() ? 0 : 1
      for (let j = 0; j < (n || 1); j++) addPiece(w, ch.toLowerCase(), side, HAND)
      n = 0
    }
  }
  w.x = {}
  return { w, side: turn === 'b' ? 0 : 1 }
}
const kingSq = (w, side) => w.sq.find((q, id) => w.sd[id] === side && w.ty[id] === 'k' && q >= 0)
export function legal(w, side) {
  const out = []
  for (const m of generate(V, w, side).values()) {
    const n = applyClassical(V, w, m)
    if (!attacks(V, n, 1 - side, kingSq(n, side))) out.push([m, n])
  }
  return out
}
function perft(w, side, d) {
  const l = legal(w, side)
  if (d === 1) return l.length
  let n = 0
  for (const [, nx] of l) n += perft(nx, 1 - side, d - 1)
  return n
}
if (process.argv[1].endsWith('perft.mjs')) {
  const start = fromSfen('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1')
  let t = Date.now()
  for (const d of [1, 2, 3, 4]) console.log('start perft', d, perft(start.w, start.side, d), (Date.now() - t) + 'ms')
  const mat = fromSfen('l6nl/5+P1gk/2np1S3/p1p4Pp/3P2Sp1/1PPb2P1P/P5GS1/R8/LN4bKL w RGgsn5p 1')
  t = Date.now()
  for (const d of [1, 2]) console.log('matsuri perft', d, perft(mat.w, mat.side, d), (Date.now() - t) + 'ms')
  if (process.argv[2] === 'deep') console.log('matsuri perft 3', perft(mat.w, mat.side, 3), (Date.now() - t) + 'ms')
}
