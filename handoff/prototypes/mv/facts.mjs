import * as P from './proto.mjs'
const STD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'
const play = (w, key) => { const m = P.generate(w, w.x.s).find((x) => x.key === key); if (!m) throw new Error('no move ' + key + ' have ' + P.generate(w, w.x.s).map((x) => x.key).slice(0, 80).join(' ')); return P.apply(w, m) }
const count = (w) => { const g = P.generate(w, w.x.s); return { total: g.filter((m) => m.kind !== 'submit').length, physical: g.filter((m) => m.travel === 'physical').length, hop: g.filter((m) => m.travel === 'hop').length, branch: g.filter((m) => m.travel === 'branch').length, submit: g.some((m) => m.kind === 'submit') } }
let w = P.setup(STD, 8)
console.log('std start', count(w))
w = play(w, '(0T1)g1-f3'); console.log('after Nf3: passed', P.passed(w), JSON.stringify(w.x.tl[0]))
w = play(w, '/'); w = play(w, '(0T1)g8-f6'); w = play(w, '/')
console.log('W at T2', count(w))
w = play(w, '(0T2)f3>>(0T1)f5')
console.log('E1 after branch: tl', JSON.stringify(w.x.tl.slice(0, 3)), 'present', P.skel(w).present, 'passed', P.passed(w))
w = play(w, '/')
console.log('E1 black mandatory', P.mandatory(w).map(P.LOf), count(w))
w = play(w, '(+1T1)e7-e6'); console.log('E1 after (1T1)e6 passed', P.passed(w))
// E2: continue, white creates second timeline while black has 0 -> inactive
w = play(w, '/')
console.log('W mandatory', P.mandatory(w).map(P.LOf), 'present', P.skel(w).present)
// fool's mate
let f = P.setup(STD, 8)
for (const k of ['(0T1)f2-f3', '/', '(0T1)e7-e6', '/', '(0T2)g2-g4', '/', '(0T2)d8-h4', '/']) f = play(f, k)
console.log('fools: threats vs white', P.royalThreats(f, 0).map((m) => m.key))
const safe = []
for (const m of P.generate(f, 0).filter((x) => x.kind !== 'submit')) {
  const a = P.apply(f, m)
  if (!P.passed(a)) continue
  const s = P.apply(a, { kind: 'submit' })
  // after submit, black to move: any royal capture?
  const caps = P.generate(s, 1).filter((x) => x.capture >= 0 && ['k','k0','y','hk','hk0','hy'].includes(s.ty[x.capture]))
  if (!caps.length) safe.push(m.key)
}
console.log('fools: safe single-move actions', safe)
// just unicorns start
console.log('unicorns start', count(P.setup('1u1uk/5/5/5/KU1U1', 5)), P.generate(P.setup('1u1uk/5/5/5/KU1U1', 5), 0).map((m) => m.key))
console.log('dragons start', count(P.setup('2ddk/5/5/5/KDD2', 5)))
console.log('small start', count(P.setup('kqbnr/ppppp/5/PPPPP/KQBNR', 5)))
console.log('brawns start', count(P.setup('wwwwk/5/5/5/KWWWW', 5)), P.generate(P.setup('wwwwk/5/5/5/KWWWW', 5), 0).map((m) => m.key).join(' '))
console.log('vso start', count(P.setup('nbrk/3p/P3/KRBN', 4)), P.generate(P.setup('nbrk/3p/P3/KRBN', 4), 0).map((m) => m.key).join(' '))
console.log('vector counts', Object.fromEntries(Object.entries(P.V).map(([k, v]) => [k, v.length])))
