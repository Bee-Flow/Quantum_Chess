import { sp, spNumber } from './sp.mjs'
const all = new Set()
let ok = true
for (let n = 0; n < 960; n++) { const s = sp(n); all.add(s); if (spNumber(s) !== n) ok = false
  // validity
  const k = s.indexOf('K'), r1 = s.indexOf('R'), r2 = s.lastIndexOf('R')
  const bs = [...s].map((p,i)=>p==='B'?i:-1).filter(i=>i>=0)
  if (!(r1 < k && k < r2) || (bs[0]+bs[1]) % 2 === 0) ok = false
}
console.log('distinct', all.size, 'roundtrip+valid', ok)
for (const n of [0,1,2,3,4,5,12,16,95,96,100,200,300,400,500,518,534,600,700,800,900,959]) console.log(n, sp(n))
// castling stats
const files = 'abcdefgh'
let kingStaysShort=0,kingStaysLong=0,rookStaysShort=0,rookStaysLong=0,kingOneShort=0,kingOneLong=0, kingOneEither=0, kingMovesAwayLong=0
const ex = {}
for (let n = 0; n < 960; n++) { const s = sp(n); const k = s.indexOf('K'), rl = s.indexOf('R'), rs = s.lastIndexOf('R')
  if (k === 6) { kingStaysShort++; ex.kss ??= n }
  if (k === 2) { kingStaysLong++; ex.ksl ??= n }
  if (rs === 5) { rookStaysShort++; ex.rss ??= n }
  if (rl === 3) { rookStaysLong++; ex.rsl ??= n }
  if (Math.abs(k-6)===1) { kingOneShort++; ex.k1s ??= n }
  if (Math.abs(k-2)===1) { kingOneLong++; ex.k1l ??= n }
  if (k < 2) { kingMovesAwayLong++; ex.kaway ??= n } // king moves toward h-side in long castling (b1 -> c1)
}
console.log({kingStaysShort,kingStaysLong,rookStaysShort,rookStaysLong,kingOneShort,kingOneLong,kingMovesAwayLong})
for (const [k,n] of Object.entries(ex)) console.log(k, n, sp(n))
// king file distribution
const kd = {}; for (let n=0;n<960;n++){const f=files[sp(n).indexOf('K')]; kd[f]=(kd[f]??0)+1}; console.log(kd)
