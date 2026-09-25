import * as P from './proto.mjs'
const ROY = new Set(['k', 'k0', 'y', 'hk', 'hk0', 'hy'])
let best = null
for (let seed0 = 1; seed0 < 4000 && !best; seed0++) {
  let seed = seed0
  const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  let w = P.setup('kqbnr/ppppp/5/PPPPP/KQBNR', 5)
  const keys = []
  for (let step = 0; step < 16; step++) {
    const g = P.generate(w, w.x.s)
    const hit = g.find((m) => m.travel === 'branch' && m.capture >= 0 && ROY.has(w.ty[m.capture]))
    if (hit) { best = [...keys, hit.key]; break }
    // avoid capturing kings physically; prefer quiet
    const quiet = g.filter((m) => !(m.capture >= 0 && ROY.has(w.ty[m.capture])))
    const sub = quiet.find((m) => m.kind === 'submit')
    const rest = quiet.filter((m) => m.kind !== 'submit')
    const m = (sub && (rng() < 0.6 || !rest.length)) ? sub : rest[Math.floor(rng() * rest.length)]
    if (!m) break
    keys.push(m.key); w = P.apply(w, m)
  }
}
console.log(best && best.join(' '))
if (best) { let w = P.setup('kqbnr/ppppp/5/PPPPP/KQBNR', 5); for (const k of best) { const m = P.generate(w, w.x.s).find((x) => x.key === k); w = P.apply(w, m) } console.log('result k =', w.x.k, 'rows', JSON.stringify(w.x.tl.filter(Boolean))) }
