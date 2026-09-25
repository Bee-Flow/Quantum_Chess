import { applyOutcome, branches, legalMoves, newGame, outcomes } from './core/quantum.mjs'
import { info, liveSq, SETUPS, V } from './mv.mjs'
const keys = (s) => legalMoves(V, s).map((m) => m.code)
const play = (s, c, i = 0) => { const r = applyOutcome(V, s, c, i); if (!r) throw new Error('illegal ' + c + ' / ' + keys(s).join(' ')); return r }
const outs = (s, c) => (outcomes(V, s, c) ?? []).map((o) => o.key + ' ' + (o.p * 100).toFixed(1) + '%' + (o.rolled ? ' rolled' : ''))
const tyAt = (s, cell) => s.worlds.map(({ b }) => { const x = 'abcdefgh'.indexOf(cell[0]), y = Number(cell[1]) - 1; const id = b.board[liveSq(0, 0, x, y)]; return id < 0 ? '.' : b.ty[id] }).join('|')
// T27 castling is certain-only
SETUPS.c1 = { n: 8, mode: 0, rows: [[0, '4k3/8/8/8/8/4N3/8/4K2R']] }
let s = newGame(V, { setup: 'c1', timelines: 3, window: 4 })
s = play(s, '(0)e3-(0)f1|(0)g2')
s = play(s, '(0T1)e8-d8')
console.log('T27 castle key legal?', keys(s).includes('(0T2)e1-g1'), 'branches', branches(V, s, '(0T2)e1-g1'))
SETUPS.c2 = { n: 8, mode: 0, rows: [[0, '4k3/8/8/8/8/4N3/8/4K2R']] }
s = newGame(V, { setup: 'c2', timelines: 3, window: 4 })
s = play(s, '(0)e3-(0)c2|(0)d5')
s = play(s, '(0T1)e8-d8')
console.log('T27b castle outcomes', outs(s, '(0T2)e1-g1').join(' ; '))
// T28 a rook that only partly slid loses the right
SETUPS.c3 = { n: 8, mode: 0, rows: [[0, '4k3/8/6n1/8/8/8/P7/4K2R']] }
s = newGame(V, { setup: 'c3', timelines: 3, window: 4 })
s = play(s, '(0T1)a2-a3')
s = play(s, '(0)g6-(0)e5|(0)h4')
console.log('T28 rook slide outcomes', outs(s, '(0T2)h1-h8').join(' ; '))
s = play(s, '(0T2)h1-h8')
console.log('after the slide: worlds', s.worlds.length, 'h1', tyAt(s, 'h1'), 'h8', tyAt(s, 'h8'))
const mk = keys(s).filter((c) => c.startsWith('?'))
console.log('black measures', mk.join(' '), outs(s, mk[0]).join(' ; '))
let m = play(s, mk[0], 0)
console.log('after measure (knight h4): worlds', m.worlds.length, 'h1', tyAt(m, 'h1'), 'turn', m.turn)
console.log('white castle key?', keys(m).filter((c) => c.includes('e1-g1')).length)
