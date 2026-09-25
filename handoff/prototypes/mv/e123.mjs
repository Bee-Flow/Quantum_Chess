import * as P from './proto.mjs'
const STD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'
const play = (w, key) => { const m = P.generate(w, w.x.s).find((x) => x.key === key); if (!m) throw new Error('no move ' + key + ' :: ' + P.generate(w, w.x.s).map((x) => x.key).filter((k) => k.startsWith(key.slice(0, 6))).join(' ')); return P.apply(w, m) }
const info = (w, label) => { const sk = P.skel(w); console.log(label, 'tl', JSON.stringify(w.x.tl.map((e, u) => e && [P.LOf(u), e[0], e[1]]).filter(Boolean)), 'active', w.x.tl.map((e, u) => e && sk.active(u) ? P.LOf(u) : null).filter((x) => x !== null), 'present', sk.present, 'mandatory', P.mandatory(w).map(P.LOf), 'passed', P.passed(w)) }
let w = P.setup(STD, 8)
for (const k of ['(0T1)g1-f3', '/', '(0T1)g8-f6', '/', '(0T2)f3>>(0T1)f5', '/', '(+1T1)e7-e6', '/', '(+1T2)b1-c3', '/', '(0T2)e7-e6', '(+1T2)d7-d6', '/']) w = play(w, k)
info(w, 'before W4')
w = play(w, '(+1T3)g1>>(+1T2)g3'); info(w, 'E2 after 2nd branch (inactive)')
w = play(w, '(0T3)b1-c3'); info(w, 'E2 after (0T3)Nc3')
w = play(w, '/')
w = play(w, '(+1T3)a7-a6'); info(w, 'E3 after (1T3)a6')
w = play(w, '(0T3)f6>>(0T2)h6'); info(w, 'E3 after black branch (reactivation)')
w = play(w, '(+2T2)a7-a6'); info(w, 'E3 after (2T2)a6')
// hop clears two boards: find a position with two mandatory boards for white and a hop between them
let h = P.setup(STD, 8)
for (const k of ['(0T1)g1-f3', '/', '(0T1)g8-f6', '/', '(0T2)f3>>(0T1)f5', '/', '(+1T1)e7-e6', '/', '(+1T2)b1-c3', '/', '(0T2)e7-e6', '(+1T2)d7-d6', '/']) h = play(h, k)
const hops = P.generate(h, 0).filter((m) => m.travel === 'hop').map((m) => m.key)
console.log('hops available', hops.length, hops.slice(0, 6))
const h2 = play(h, hops.find((k) => k.startsWith('(0T3)b1')) ?? hops[0]); info(h2, 'after one hop')
