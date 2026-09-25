// Probe: the static row map of an even start (spec 4.2: u(-1) = 9, u(0) = 10, u(l > 0) = 2l, u(l <= -2) = -2l - 3)
// is not injective beyond the cap: line +5 maps to row 10 (+0) and line -6 to row 9 (-0). A knight on the outermost
// timeline therefore gets moves onto -0 / +0 with a timeline step of two.
import { V, P, Q, stateOfWorlds } from '../../tmp/mv-final/libf.mjs'
console.log('uOf(5, even) =', P.uOf(5, 1), '= row of +0:', P.uOf(0, 1), '| uOf(-6, even) =', P.uOf(-6, 1), '= row of -0:', P.uOf(-1, 1))
// Timeline Invasion style (n 5, even start), White has opened +1, +2, +3 (l = 1..3); a White knight stands on +3.
// Rows: -0 (l -1), +0 (l 0), +1, +2, +3, all ending at T5 ○ (v 10).
const rows = {}
for (const l of [-1, 0, 1, 2, 3]) rows[l] = { st: l <= 0 ? 2 : 9, en: 10, parent: l <= 0 ? null : [P.uOf(l - 1, 1), 8], boards: { 10: l === 3 ? '4k/5/5/5/KN3' : '4k/5/5/5/K4' } }
const w = P.buildWorld({ n: 5, h: 4, m: 3, md: 1, s: 0, c: [3, 3], rows })
const s = stateOfWorlds([[w, 1]], 0)
const keys = Q.legalMoves(V, s).map((m) => m.code).filter((k) => k.startsWith('(+3T5)b1'))
console.log('knight on (+3T5)b1, keys onto -0/+0:', keys.filter((k) => /\(\+0|\(−0/.test(k)))
