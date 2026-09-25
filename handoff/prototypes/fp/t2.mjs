import { FOUR as V } from './proto.mjs'
import { newGame, codes, show, after, outs, stateOf, budget, royalDanger, splitsFrom } from './lib.mjs'
const hr = (t) => console.log('\n=== ' + t)
const sq = (n) => V.topology.byName(n)
const K4 = { h1: '0:k', a7: '1:k', g14: '2:k', n8: '3:k' }
const turnOf = (s) => ['R', 'B', 'Y', 'G'][s.turn]
hr('F1 turn order')
let s = newGame(V, { mode: 'ffa' })
for (const m of ['h2-h4', 'b8-d8', 'g13-g11', 'm7-k7']) { s = after(V, s, m); console.log(m, '->', turnOf(s)) }
hr('F2 board shape: knight d4, rook d4, bishop d4 (red)')
s = stateOf(V, [[{ ...K4, d4: '0:n' }, 1]])
console.log(codes(V, s).filter(c => c.startsWith('d4')).join(' '))
s = stateOf(V, [[{ ...K4, d4: '0:b' }, 1]])
console.log(codes(V, s).filter(c => c.startsWith('d4')).join(' '))
s = stateOf(V, [[{ ...K4, c4: '0:n' }, 1]])
console.log('c4 knight', codes(V, s).filter(c => c.startsWith('c4')).join(' '))
hr('F3 castling all sides')
const full = newGame(V, { mode: 'ffa' })
const rights = full.worlds[0].b.x.castle
const setC = (b) => { b.x.castle = rights.map(c => ({ ...c })) }
for (const [side, pl] of [[0, { h1: '0:k', d1: '0:r', k1: '0:r' }], [1, { a7: '1:k', a4: '1:r', a11: '1:r' }], [2, { g14: '2:k', d14: '2:r', k14: '2:r' }], [3, { n8: '3:k', n11: '3:r', n4: '3:r' }]]) {
  const base = { ...K4, ...pl }
  for (const code of ['O-O', 'O-O-O']) {
    const st = stateOf(V, [[base, 1]], side, setC)
    const a = after(V, st, code)
    console.log(side, code, show(V, a)[0].split(' ').filter(p => p.startsWith('RR') || p.startsWith('BR') || p.startsWith('YR') || p.startsWith('GR') || /^[RBYG]K/.test(p)).join(' '), a.worlds[0].b.x.castle.map(c => c.side + c.flag).join(','))
  }
}
hr('F4 en passant: Red f2-f4, Blue pawn e4 takes f3; later players cannot')
s = stateOf(V, [[{ ...K4, f2: '0:p', e4: '1:p', g4: '3:p' }, 1]], 0)
s = after(V, s, 'f2-f4')
console.log(show(V, s)[0], 'turn', turnOf(s))
console.log('blue ep?', codes(V, s).filter(c => c.startsWith('e4')))
const ep = after(V, s, 'e4-f3'); console.log(show(V, ep)[0])
let s2 = after(V, s, 'a7-a6'); s2 = after(V, s2, 'g14-g13'); console.log('green moves from g4:', codes(V, s2).filter(c => c.startsWith('g4')))
hr('F5 promotion FFA and Teams')
s = stateOf(V, [[{ ...K4, e7: '0:p', g5: '1:p', e8: '2:p', h9: '3:p', e10: '0:p' }, 1]], 0)
for (let t = 0; t < 4; t++) console.log(t, codes(V, { ...s, turn: t }).filter(c => /^(e7|g5|e8|h9|e10)-/.test(c)).join(' '))
s = stateOf(V, [[{ ...K4, e7: '0:p', e10: '0:p', j5: '1:p', e5: '2:p', e4: '2:p', e11: '2:p', e12: '2:p', e13: '2:p' , e9: '0:p'}, 1]], 0, (b) => { b.x.teams = true })
console.log('teams red', codes(V, s).filter(c => /^(e7|e10)-/.test(c)).join(' '))
console.log('teams yellow', codes(V, { ...s, turn: 2 }).filter(c => /^(e5|e4)-/.test(c)).join(' '))
console.log('teams blue j5', codes(V, { ...s, turn: 1 }).filter(c => /^(j5)-/.test(c)).join(' '))
