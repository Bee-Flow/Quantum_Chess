// More scenarios for section 7 of the design.
import { applyOutcome, branches, budget, legalMoves, newGame, outcomes, pieceLocations, royalDanger } from './core/quantum.mjs'
import { info, liveSq, mandatory, SETUPS, SUBMIT, V } from './mv.mjs'

const say = (...a) => console.log(...a)
const keys = (s) => legalMoves(V, s).map((m) => m.code)
const sk = (s) => JSON.stringify(s.worlds[0].b.x.r)
const game = (setup, o = {}) => newGame(V, { setup, timelines: o.timelines ?? 3, window: o.window ?? 4 })
const custom = (id, n, rows, mode = 0) => { SETUPS[id] = { n, mode, rows }; return id }
function play(s, code, i = 0) { if (!branches(V, s, code)) throw new Error('illegal: ' + code + '\n legal: ' + keys(s).join(' ')); return applyOutcome(V, s, code, i) }
const seq = (s, codes) => codes.reduce((a, c) => play(a, c), s)
const outs = (s, c) => (outcomes(V, s, c) ?? []).map((o) => o.key + ' ' + (o.p * 100).toFixed(1) + '%' + (o.rolled ? ' rolled' : '') + (o.notes.length ? ' [' + o.notes.map((n) => n.slice(0, 4)).join(',') + ']' : ''))
const at = (s, l, cell) => { const I = info(s.worlds[0].b.x); const x = 'abcdefgh'.indexOf(cell[0]), y = Number(cell.slice(1)) - 1; return s.worlds.map(({ b }) => { const id = b.board[liveSq(l, I.mode, x, y)]; return id < 0 ? '.' : b.sd[id] + b.ty[id] + '#' + id }).join(' | ') }

say('--- P1 pawn moves across timelines (three starting timelines, White to move on all)')
custom('pl', 5, [[-1, '4k/5/5/5/K4'], [0, '4k/5/5/2P2/K4'], [1, '4k/5/5/5/K4']], 2)
let s = game('pl')
say('pawn keys', keys(s).filter((c) => c.includes('c2')).join(' '), '| mand', mandatory(s.worlds[0].b.x))
s = play(s, '(0T1)c2>(−1T1)c2')
say('after hop: turn', s.turn, sk(s), 'mand', mandatory(s.worlds[0].b.x), '(−1)c2', at(s, -1, 'c2'))

say('--- P2 T-L capture')
custom('tl', 5, [[-1, '4k/5/5/2n2/K4'], [0, '4k/5/5/2P2/K4'], [1, '4k/5/5/5/K4']], 2)
s = game('tl')
s = seq(s, ['(−1T1)a1-a2', '(+1T1)a1-a2', '(0T1)a1-a2'])
say('turn', s.turn, sk(s))
s = seq(s, ['(−1T1)c2-d4', '(0T1)e5-d5', '(+1T1)e5-d5'])
say('turn', s.turn, sk(s), 'pawn keys', keys(s).filter((c) => c.startsWith('(0T2)c2')).join(' '))

say('--- B1 brawn captures (5 of its 8 capture vectors exist here)')
custom('br', 5, [[-1, '4k/5/2p2/1p1p1/K4'], [0, '4k/5/5/2W2/K4'], [1, '4k/5/5/5/K4']], 2)
s = game('br')
say('brawn keys', keys(s).filter((c) => c.startsWith('(0T1)c2')).join(' '))

say('--- C1 the timeline cap (1 per side)')
s = seq(game('standard', { timelines: 1 }), ['(0T1)g1-f3', '(0T1)g8-f6', '(0T2)f3>>(0T1)f5', '(+1T1)e7-e6', SUBMIT])
say('White created', info(s.worlds[0].b.x).c, 'White branch keys', keys(s).filter((c) => c.includes('>>')).length, 'hop keys', keys(s).filter((c) => /[^>]>[^>]/.test(c)).length)

say('--- K1 a ghost captures a king in the past (rolled; Missed opens nothing)')
custom('kp', 5, [[0, '4k/5/5/5/K1N2']])
s = game('kp')
s = play(s, '(0)c1-(0)b3|(0)d3')
s = seq(s, ['(0T1)e5-d5'])
s = seq(s, ['(0T2)a1-a2', '(0T2)d5-e5'])
say('danger B', royalDanger(V, s, 1).toFixed(3), 'turn', s.turn, sk(s))
const ks = keys(s).filter((c) => c.includes('>>') && c.includes('d3'))
say('knight travel keys from d3', ks.join(' '))
for (const c of ks) say(c, outs(s, c).join(' ; '))
const kc = applyOutcome(V, s, '(0T3)d3>>(0T2)d5', 1)
const km = applyOutcome(V, s, '(0T3)d3>>(0T2)d5', 0)
say('Captured:', JSON.stringify(kc.result), sk(kc), '| Missed:', JSON.stringify(km.result), sk(km), 'turn', km.turn, 'worlds', km.worlds.length, 'knight b3', at(km, 0, 'b3'))

say('--- H1 a ghost hops (applyMiss advances both timelines)')
custom('hop', 5, [[-1, '4k/5/5/5/K4'], [0, '4k/5/5/5/K1N2'], [1, '4k/5/5/5/K4']], 2)
s = game('hop')
say('keys L0', keys(s).filter((c) => c.startsWith('(0T1)')).length)

say('--- M1 Marauders: a board without own pieces must be reached by a hop')
s = game('marauders')
say('mand', mandatory(s.worlds[0].b.x), 'keys', keys(s).length, 'onto (−1)', keys(s).filter((c) => c.includes('>(−1T1)')).join(' '))
const stuck = play(s, '(0T1)a1-a2')
say('after (0T1)a1-a2: keys', keys(stuck).length, 'onto (−1):', keys(stuck).filter((c) => c.includes('>(−1T1)')).join(' '), 'result', JSON.stringify(stuck.result))
let st2 = play(stuck, '(+1T1)b2-b3')
say('after (+1T1)b2-b3: result', JSON.stringify(st2.result), 'keys', keys(st2).length)

say('--- D1 danger is the union of ghost attackers')
custom('duA', 5, [[0, '4k/5/3N1/5/K4']])
custom('duB', 5, [[0, '4k/5/2B2/5/K4']])
const A = game('duA').worlds[0].b, B = game('duB').worlds[0].b
for (const b of [A, B]) { b.x.s = 1; b.x.r[0][2] = 3 }
s = { ...game('duA'), turn: 1, worlds: [{ b: A, w: 8388608 }, { b: B, w: 8388608 }] }
say('two worlds, Black to move: danger B', royalDanger(V, s, 1), 'white keys capture e5 in A only / B only')
