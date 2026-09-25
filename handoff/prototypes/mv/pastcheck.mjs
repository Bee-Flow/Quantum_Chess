import * as P from './proto.mjs'
let w = P.setup('kqbnr/ppppp/5/PPPPP/KQBNR', 5)
const play = (k) => { const m = P.generate(w, w.x.s).find((x) => x.key === k); if (!m) throw new Error(k); w = P.apply(w, m) }
for (const k of ['(0T1)b2-b3', '/', '(0T1)a4-b3', '/', '(0T2)c1-a3', '/']) play(k)
console.log('Black threats at T2 (trans-temporal check):', P.royalThreats(w, 1).map((m) => m.key))
// which black single-move actions avoid it?
const safe = []
for (const m of P.generate(w, 1).filter((x) => x.kind !== 'submit')) { const a = P.apply(w, m); if (!P.passed(a)) continue; const s = P.apply(a, { kind: 'submit' }); if (!P.generate(s, 0).some((x) => x.capture >= 0 && /k|y/.test(P.base(s.ty[x.capture])))) safe.push(m.key) }
console.log('safe black actions', safe.length, safe.slice(0, 12))
