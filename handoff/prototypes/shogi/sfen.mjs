// SFEN of placement maps (to quote the classical test positions in the spec).
import { SHOGI as V } from './shogi.mjs'
import { worldFrom, HAND } from '../../../src/variants/core/world.js'
export function toSfen(w, turn) {
  const rows = []
  for (let r = 8; r >= 0; r--) {
    let row = ''; let e = 0
    for (let f = 0; f < 9; f++) {
      const id = w.board[V.topology.at([f, r])]
      if (id < 0) { e++; continue }
      if (e) { row += e; e = 0 }
      const t = w.ty[id]
      const ch = t.replace('+', '')
      row += (t[0] === '+' ? '+' : '') + (w.sd[id] === 0 ? ch.toUpperCase() : ch)
    }
    if (e) row += e
    rows.push(row)
  }
  const order = 'rbgsnlp'
  let hand = ''
  for (const side of [0, 1]) for (const t of order) {
    const n = w.sq.filter((q, id) => q === HAND && w.sd[id] === side && w.ty[id] === t).length
    if (n) hand += (n > 1 ? n : '') + (side === 0 ? t.toUpperCase() : t)
  }
  return rows.join('/') + ' ' + (turn === 0 ? 'b' : 'w') + ' ' + (hand || '-') + ' 1'
}
const P = (pl, turn = 0, hand = []) => toSfen(worldFrom(V, pl, {}, hand), turn)
const zone = { '9a': '0:r', '8a': '0:b', '7a': '0:g', '6a': '0:g', '4a': '0:s', '3a': '0:s', '2b': '0:+p', '3b': '0:+p', '4b': '0:+p', '6b': '0:+p', '5c': '0:k', '9i': '1:k' }
const pl8 = { '1a': '0:k', '5i': '1:k' }; const gens = ['s','g','s','g','s','g','s','g']
for (let f = 2; f <= 9; f++) pl8[f + 'a'] = '0:' + gens[f - 2]
for (let f = 1; f <= 9; f++) pl8[f + 'b'] = '0:p'
const list = {
  S2: P({ '5i': '0:k', '4d': '0:s', '9a': '1:k', '6c': '0:s' }),
  S3: P({ '5i': '0:k', '3b': '0:p', '7d': '0:n', '6e': '0:n', '1d': '0:l', '9a': '1:k' }),
  S3g: P({ '5a': '1:k', '7f': '1:p', '9i': '0:k' }, 1),
  S4: P({ '5i': '0:k', '5g': '0:p', '4d': '0:+p', '1a': '1:k' }, 0, [[0, 'p'], [0, 'l'], [0, 'n']]),
  S5: P({ '5i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:n' }, 0, [[0, 'p'], [0, 'g']]),
  S5pin: P({ '5i': '0:k', '2c': '0:g', '9a': '0:r', '1a': '1:k', '2a': '1:s' }, 0, [[0, 'p']]),
  S5hang: P({ '5i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:n', '5b': '1:r' }, 0, [[0, 'p']]),
  S6: P({ '5i': '0:k', '2b': '0:+r', '5a': '1:k', '3a': '1:s' }, 1),
  S7: P(zone, 1, [[0, 'r'], [0, 'b']]),
  S8: P(pl8, 1),
  S10: P({ '5i': '0:k', '5c': '0:p', '5a': '1:k', '4a': '1:g' }),
}
for (const [k, v] of Object.entries(list)) console.log(k.padEnd(7), v)
