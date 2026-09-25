// The test scenarios of the design (section 7), run on the prototype; prints the facts quoted in the design.
import { applyOutcome, branches, budget, legalMoves, newGame, outcomes, pieceLocations, royalDanger, splitsFrom, splitTargets } from './core/quantum.mjs'
import { layoutOf } from './layout.mjs'
import { canSubmit, info, liveSq, mandatory, SETUPS, SUBMIT, V } from './mv.mjs'

const say = (...a) => console.log(...a)
const keys = (s) => legalMoves(V, s).map((m) => m.code)
const sk = (s) => JSON.stringify(s.worlds[0].b.x.r)
function game(setup, opts = {}) { return newGame(V, { setup, timelines: opts.timelines ?? 3, window: opts.window ?? 4 }) }
function custom(id, n, rows, mode = 0) { SETUPS[id] = { n, mode, rows }; return id }
function play(s, code, i = 0) {
	const list = branches(V, s, code)
	if (!list) throw new Error('illegal: ' + code + '\n legal: ' + keys(s).join(' '))
	return applyOutcome(V, s, code, i)
}
function seq(s, codes) { for (const c of codes) s = play(s, c); return s }
const outs = (s, c) => (outcomes(V, s, c) ?? []).map((o) => o.key + ' ' + (o.p * 100).toFixed(1) + '%' + (o.rolled ? ' rolled' : '') + (o.notes.length ? ' ' + o.notes.map((n) => n.slice(0, 5)).join(',') : ''))
const at = (s, l, cell) => {
	const b = s.worlds[0].b
	const I = info(b.x)
	const x = 'abcdefgh'.indexOf(cell[0]), y = Number(cell.slice(1)) - 1
	return s.worlds.map(({ b: w }) => { const id = w.board[liveSq(l, I.mode, x, y)]; return id < 0 ? '.' : w.sd[id] + w.ty[id] + '#' + id }).join(' | ')
}

say('--- 1 start')
let s = game('standard')
say(keys(s).length, keys(s).join(' '), 'submit?', keys(s).includes(SUBMIT), 'mand', mandatory(s.worlds[0].b.x))

say('--- 2 e4: auto-end, ep')
s = play(game('standard'), '(0T1)e2-e4')
say('turn', s.turn, sk(s), 'ep', s.worlds[0].b.x.ep, 'history (0T1 w) a1..h1', s.worlds[0].b.board.slice(832 + 2 * 64, 832 + 2 * 64 + 8).join(','))

say('--- 3 E1 rewind')
s = seq(game('standard'), ['(0T1)g1-f3', '(0T1)g8-f6'])
say('white keys', keys(s).length, 'travel', keys(s).filter((c) => c.includes('>')).join(' '))
s = play(s, '(0T2)f3>>(0T1)f5')
say('turn', s.turn, sk(s), 'present', info(s.worlds[0].b.x).present, 'mand', mandatory(s.worlds[0].b.x), 'submit?', canSubmit(s.worlds[0].b.x))
say('+1 f5:', at(s, 1, 'f5'), ' +1 g1:', at(s, 1, 'g1'), ' L0 f3:', at(s, 0, 'f3'))
const blackKeys = keys(s)
say('black keys', blackKeys.length, 'from +1', blackKeys.filter((c) => c.startsWith('(+1')).length, 'from L0', blackKeys.filter((c) => c.startsWith('(0')).length)
s = play(s, '(+1T1)e7-e6')
say('after (+1T1)e7-e6: turn', s.turn, sk(s), 'submit?', keys(s).includes(SUBMIT), 'present', info(s.worlds[0].b.x).present)
const e1 = play(s, SUBMIT)
say('after submit: turn', e1.turn, 'mand', mandatory(e1.worlds[0].b.x))

say('--- 4 E2 inactive')
s = seq(e1, ['(+1T2)b1-c3', '(0T2)e7-e6', '(+1T2)d7-d6'])
say('turn', s.turn, sk(s), 'mand', mandatory(s.worlds[0].b.x))
s = play(s, '(+1T3)g1>>(+1T2)g3')
let I = info(s.worlds[0].b.x)
say('after branch: turn', s.turn, sk(s), 'active +2?', I.active(2), 'present', I.present, 'mand', mandatory(s.worlds[0].b.x), 'submit?', keys(s).includes(SUBMIT))
s = play(s, '(0T3)b1-c3')
say('after (0T3)b1-c3: turn', s.turn, sk(s))

say('--- 5 E3 reactivation')
s = play(s, '(+1T3)a7-a6')
say('turn', s.turn, sk(s), 'mand', mandatory(s.worlds[0].b.x))
s = play(s, '(0T3)f6>>(0T2)h6')
I = info(s.worlds[0].b.x)
say('after branch: turn', s.turn, sk(s), 'present', I.present, 'active +2', I.active(2), 'mand', mandatory(s.worlds[0].b.x), 'submit?', keys(s).includes(SUBMIT))
s = play(s, '(+2T2)a7-a6')
say('after (+2T2)a7-a6: turn', s.turn, 'submit?', keys(s).includes(SUBMIT))

say('--- 6 E4 hop clears two boards')
s = game('twotimelines')
say('start keys', keys(s).length, 'hops', keys(s).filter((c) => c.includes('>')).join(' '))
s = play(s, '(−0T1)b1>(+0T1)b3')
say('turn', s.turn, sk(s))

say('--- 7 E5 fool\'s mate is a softmate')
s = seq(game('standard'), ['(0T1)f2-f3', '(0T1)e7-e6', '(0T2)g2-g4', '(0T2)d8-h4'])
say('danger W', royalDanger(V, s, 0), 'keys', keys(s).length, 'king keys', keys(s).filter((c) => c.startsWith('(0T3)e1')).join(' '))
s = play(s, '(0T3)e1>>(0T2)f2')
I = info(s.worlds[0].b.x)
say('after escape: turn', s.turn, sk(s), 'present', I.present, 'danger W', royalDanger(V, s, 0), '+1 e1', at(s, 1, 'e1'), '+1 f2', at(s, 1, 'f2'))

say('--- 8 Rook Tactics I (historical capture)')
custom('rt1', 5, [[0, '4k/5/5/5/K1R2']])
s = seq(game('rt1'), ['(0T1)a1-b2', '(0T1)e5-e4', '(0T2)c1-e1', '(0T2)e4-d3', '(0T3)e1-e5'])
say('turn', s.turn, 'danger B', royalDanger(V, s, 1))
s = play(s, '(0T3)d3-c3')
const cap = keys(s).filter((c) => c.startsWith('(0T4)e5>>'))
say('white rook travel keys', cap.join(' '))
const won = play(s, '(0T4)e5>>(0T1)e5')
say('result', JSON.stringify(won.result), 'rows', sk(won))

say('--- 9 unicorns and dragons cannot move on their own board')
say('justunicorns', keys(game('justunicorns')).join(' '), '| justdragons', keys(game('justdragons')).join(' '))
s = seq(game('justunicorns'), ['(0T1)a1-a2', '(0T1)e5-e4'])
say('T2 unicorn keys', keys(s).filter((c) => /^\(0T2\)(b1|d1)/.test(c)).join(' '))

say('--- 10 pawns across timelines')
custom('pawn1', 5, [[0, '4k/5/5/2P2/K4']])
s = game('pawn1')
say('L0 only', keys(s).filter((c) => c.includes('c2')).join(' '))

say('--- 11 castling and promotion')
custom('castle', 8, [[0, 'r3k2r/8/8/8/8/8/1P6/R3K2R']])
s = game('castle')
say('castle keys', keys(s).filter((c) => c.startsWith('(0T1)e1')).join(' '))
const cs = play(s, '(0T1)e1-g1')
say('after O-O: g1', at(cs, 0, 'g1'), 'f1', at(cs, 0, 'f1'))
custom('promo', 5, [[0, '4k/1P3/5/5/K4']])
s = game('promo')
say('promo keys', keys(s).filter((c) => c.includes('b4')).join(' '))

say('--- 12 brawn captures')
custom('brawn', 5, [[0, '4k/5/2W2/5/K4']])
s = seq(game('brawn'), ['(0T1)a1-a2', '(0T1)e5-e4'])
say('brawn keys T2', keys(s).filter((c) => c.startsWith('(0T2)c3')).join(' '))

say('--- 13 reversed royalty: common king is not royal, royal queen is')
s = game('reversed')
say('royal types', [...V.royalTypes].join(','), 'solid', [...V.solidTypes].join(','))

say('--- 14 timeline cap and royal captures')
s = seq(game('standard', { timelines: 2 }), ['(0T1)g1-f3', '(0T1)g8-f6', '(0T2)f3>>(0T1)f5', '(+1T1)e7-e6'])
say('W created', info(s.worlds[0].b.x).c)

say('--- 15 window')
custom('win', 5, [[0, '4k/5/5/5/K1R2']])
s = seq(game('win', { window: 2 }), ['(0T1)c1-c2', '(0T1)e5-e4', '(0T2)c2-c3', '(0T2)e4-e5', '(0T3)c3-c4', '(0T3)e5-e4'])
say('rook T keys (window 2)', keys(s).filter((c) => c.startsWith('(0T4)c4>>(0T')).join(' '))
s = seq(game('win', { window: 4 }), ['(0T1)c1-c2', '(0T1)e5-e4', '(0T2)c2-c3', '(0T2)e4-e5', '(0T3)c3-c4', '(0T3)e5-e4'])
say('rook T keys (window 4)', keys(s).filter((c) => c.startsWith('(0T4)c4>>(0T')).join(' '))

say('=== QUANTUM')
say('--- Q1 split on one board')
s = game('standard')
say('split targets g1', splitTargets(V, s, V.topology.byName('(0)g1')).map((q) => V.topology.names[q]).join(' '))
let q1 = play(s, '(0)g1-(0)f3|(0)h3')
say('worlds', q1.worlds.length, 'turn', q1.turn, sk(q1), 'budget W', budget(q1, 0, V))

say('--- Q2 a ghost travels (pass = link through time)')
let q2 = seq(q1, ['(0T1)a7-a6'])
say('outcomes (0T2)f3>>(0T1)f5:', outs(q2, '(0T2)f3>>(0T1)f5').join(' ; '))
q2 = play(q2, '(0T2)f3>>(0T1)f5')
say('worlds', q2.worlds.length, 'turn', q2.turn, sk(q2), 'knight id', q2.worlds[0].b.board[liveSq(0, 0, 6, 0)])
const kid = 32 + 6
say('locations of the knight', JSON.stringify(pieceLocations(q2, kid).map((l) => [V.topology.names[l.sq] ?? l.sq, l.p])))
say('budget W', budget(q2, 0, V), 'mand', mandatory(q2.worlds[0].b.x))

say('--- Q3 a missed branch still opens the timeline (rolled): ghost knight onto a past square with a pawn')
let q3 = seq(q1, ['(0T1)e7-e5'])
say('outcomes (0T2)f3>>(0T1)e5 ?', outs(q3, '(0T2)f3>>(0T1)e5').join(' ; '))
say('outcomes (0T2)f3-e5:', outs(q3, '(0T2)f3-e5').join(' ; '))
const q3m = play(q3, '(0T2)f3-e5', 0)
say('after Missed: worlds', q3m.worlds.length, 'turn', q3m.turn, sk(q3m), 'knight h3', at(q3m, 0, 'h3'))

say('--- Q4 twins')
let q4 = seq(q1, ['(0T1)e7-e6', '(0T2)a2-a3', '(0T2)b8>>(0T1)b6'])
say('turn', q4.turn, sk(q4), 'twins f3', at(q4, -1, 'f3'), 'h3', at(q4, -1, 'h3'), 'budget W', budget(q4, 0, V), 'worlds', q4.worlds.length)
const tw = legalMoves(V, q4).filter((m) => m.type === 'measure').map((m) => m.code)
say('measures', tw.join(' '))
const q4m = play(q4, '?(−1)f3', 0)
say('after measure outcome 0: worlds', q4m.worlds.length, 'f3', at(q4m, -1, 'f3'), 'h3', at(q4m, -1, 'h3'), 'L0 f3', at(q4m, 0, 'f3'), 'L0 h3', at(q4m, 0, 'h3'), 'turn', q4m.turn, sk(q4m))

say('--- Q5 land = roll in the past: target maybe occupied')
let q5 = seq(game('standard'), ['(0T1)g1-f3', '(0T1)b8-c6', '(0T2)f3-g5'])
q5 = play(q5, '(0)c6-(0)b4|(0)e5')
say('black split worlds', q5.worlds.length, 'turn', q5.turn)
q5 = play(q5, '(0T3)g5-f3')
say('white knight keys to past', keys(q5).filter((c) => c.startsWith('(0T3)') && c.includes('>>')).length)
say('turn', q5.turn, sk(q5))

say('--- Q6 merge and the past remembers')
let q6 = seq(q1, ['(0T1)a7-a6'])
q6 = play(q6, '(0)f3|(0)h3-(0)g1')
say('after merge: worlds', q6.worlds.length, 'budget W', budget(q6, 0, V), sk(q6))
const bud = []
for (const c of ['(0T2)a6-a5', '(0T3)a2-a3', '(0T3)a5-a4', '(0T4)b2-b3', '(0T4)h7-h6', '(0T5)c2-c3', '(0T5)h6-h5', '(0T6)d2-d3', '(0T6)h5-h4']) { q6 = play(q6, c); bud.push(q6.worlds.length + '/' + budget(q6, 0, V)) }
say('worlds/budget after each move', bud.join(' '))

say('--- Q7 measure is free')
let q7 = seq(q1, ['(0T1)a7-a6'])
say('measure codes', keys(q7).filter((c) => c.startsWith('?')).join(' '))
const q7m = play(q7, '?(0)f3', 0)
say('after measure: worlds', q7m.worlds.length, 'turn', q7m.turn, sk(q7m), 'ply', q7m.ply)

say('--- Q8 danger is the union; stuck')
say('fool danger after split? skipped')

say('--- U layout')
const lo = layoutOf(game('standard'))
say('start: cells', lo.cells.length, 'boards', lo.layout.boards.map((b) => b.label).join(','), 'areas', lo.layout.areas.map((a) => a.shade).join(','), 'focus', JSON.stringify(lo.layout.focus), 'W×H', lo.layout.width.toFixed(1), lo.layout.height.toFixed(1))
const lo2 = layoutOf(e1)
say('after E1: boards', lo2.layout.boards.length, 'labels', lo2.layout.labels.map((l) => l.text).join(' | '), 'lines', lo2.layout.lines.length, 'focus', JSON.stringify(lo2.layout.focus))
