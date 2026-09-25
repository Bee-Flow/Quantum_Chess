import { applyOutcome, legalMoves, newGame, outcomes, pieceLocations } from './core/quantum.mjs'
import { info, liveSq, SETUPS, V } from './mv.mjs'
const keys = (s) => legalMoves(V, s).map((m) => m.code)
const play = (s, c, i = 0) => { const r = applyOutcome(V, s, c, i); if (!r) throw new Error('illegal ' + c + ' / ' + keys(s).join(' ')); return r }
const sk = (s) => JSON.stringify(s.worlds[0].b.x.r)
const outs = (s, c) => (outcomes(V, s, c) ?? []).map((o) => o.key + ' ' + (o.p * 100).toFixed(1) + '%' + (o.rolled ? ' rolled' : ''))
const at = (s, l, cell) => { const I = info(s.worlds[0].b.x); const x = 'abcdefgh'.indexOf(cell[0]), y = Number(cell.slice(1)) - 1; return s.worlds.map(({ b }) => { const id = b.board[liveSq(l, I.mode, x, y)]; return id < 0 ? '.' : b.sd[id] + b.ty[id] + '#' + id }).join(' | ') }
SETUPS.lr = { n: 5, mode: 0, rows: [[0, '3qk/5/5/5/K1N2']] }
let s = newGame(V, { setup: 'lr', timelines: 3, window: 4 })
s = play(s, '(0)c1-(0)b3|(0)d3')
s = play(s, '(0T1)d5-d4')
s = play(s, '(0T2)a1-a2')
const k = '(0T2)d4>>(0T1)d3'
console.log('keys to the past ghost', keys(s).filter((c) => c.endsWith('(0T1)d3')).join(' '), '|', k, outs(s, k).join(' ; '))
const cap = play(s, k, 1), mov = play(s, k, 0)
console.log('capture:', sk(cap), 'worlds', cap.worlds.length, '(−1)d3', at(cap, -1, 'd3'), 'L0 b3', at(cap, 0, 'b3'), 'L0 d3', at(cap, 0, 'd3'), 'turn', cap.turn)
console.log('move   :', sk(mov), 'worlds', mov.worlds.length, '(−1)d3', at(mov, -1, 'd3'), '(−1)b3', at(mov, -1, 'b3'), 'L0 b3', at(mov, 0, 'b3'), 'turn', mov.turn)
