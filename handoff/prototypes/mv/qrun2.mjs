import V from './qvariant.mjs'
import * as P from './proto.mjs'
import { newGame, applyOutcome, branches, legalMoves, budget, outcomes, pieceLocations, squareView } from '/home/user/Quantum_Chess/src/variants/core/quantum.js'
import { optionValues } from '/home/user/Quantum_Chess/src/variants/core/variant.js'
const N = (q) => V.topology.names[q] ?? String(q)
const out = (s, code) => { const o = outcomes(V, s, code); return o && o.map((b) => `${b.key}${b.notes.length ? '[' + b.notes.map((n) => n.slice(0, 6) + '…' + n.length).join(',') + ']' : ''} ${(b.p * 100).toFixed(1)}%`) }
const go = (s, codes) => { for (const c of [].concat(codes)) { const [code, i] = Array.isArray(c) ? c : [c, 0]; const n = applyOutcome(V, s, code, i); if (!n) throw new Error('illegal ' + code + ' | ' + legalMoves(V, s).map((m) => m.code).filter((x) => x.includes(code.slice(0, 7))).slice(0, 20).join(' ')); s = n } return s }
const locs = (s, id) => pieceLocations(s, id).map((l) => `${N(l.sq)} ${(l.p * 100).toFixed(0)}%`)
const sk = (s) => [...new Set(s.worlds.map(({ b }) => V.solidExtra(b)))]
let s = newGame(V, optionValues(V, {}))
// S7: white splits Nb1 -> a3|c3 at T1; black e6; white d4; black travels a piece back to (0T1b)? black boards: T1b shows the knight ghost.
s = go(s, ['L0:b1-L0:a3|L0:c3', '/', '(0T1)e7-e6', '/', '(0T2)d2-d4', '/'])
console.log('S7 black moves to past black board T1b (v3):', legalMoves(V, s).filter((m) => m.code.includes('>>(0T1)')).map((m) => m.code).slice(0, 12))
const code7 = legalMoves(V, s).map((m) => m.code).find((c) => c.startsWith('(0T2)b8>>(0T1)b6'))
console.log('S7 branch', code7, out(s, code7))
const s7 = go(s, code7)
const newRow = s7.worlds[0].b.x.tl.findIndex((e, u) => e && u > 0)
console.log('S7 new row u', newRow, 'L', P.LOf(newRow), 'worlds', s7.worlds.length)
for (const cell of ['a3', 'c3', 'b1']) { const q = V.topology.byName('L−1:' + cell); console.log('   L-1', cell, squareView(s7, q).map((o) => `${o.side}${o.type} id${o.id} ${(o.p * 100).toFixed(0)}%`)) }
// White measures its knight on L0 (free), copies collapse
let s7b = go(s7, '/')
console.log('S7 white legal measures', legalMoves(V, s7b).filter((m) => m.type === 'measure').map((m) => m.code))
const meas = legalMoves(V, s7b).find((m) => m.type === 'measure' && m.code.startsWith('?L0:'))
console.log('S7 measure', meas.code, out(s7b, meas.code))
const s7c = go(s7b, [[meas.code, 0]])
console.log('S7 after measure: worlds', s7c.worlds.length, 'turn', s7c.turn, 'ply', s7b.ply, '->', s7c.ply, 'skeleton same', sk(s7b)[0] === sk(s7c)[0])
for (const cell of ['a3', 'c3']) { const q = V.topology.byName('L−1:' + cell); console.log('   L-1', cell, squareView(s7c, q).map((o) => `${o.side}${o.type} ${(o.p * 100).toFixed(0)}%`)) }
// S8 landing in the past onto a ghost's past square: Black to move at s7? use s: black travels to (0T1b) square a3/c3 where the white knight ghost stood
const land = legalMoves(V, s).map((m) => m.code).filter((c) => /\(0T1\)(a3|c3)$/.test(c))
console.log('S8 landings on ghost past squares', land.slice(0, 6), land[0] && out(s, land[0]))
// S9 budget includes history
let b9 = newGame(V, optionValues(V, {}))
b9 = go(b9, ['L0:g1-L0:f3|L0:h3', '/', '(0T1)e7-e6', '/'])
const mg = legalMoves(V, b9).filter((m) => m.type === 'merge').map((m) => m.code)
console.log('S9 merges', mg.slice(0, 5))
const g1back = mg.find((c) => c.endsWith('-L0:g1'))
b9 = go(b9, g1back)
console.log('S9 after merge back to g1: worlds', b9.worlds.length, 'budget W', budget(b9, 0), 'knight', locs(b9, 6))
const pastMeasures = legalMoves(V, b9).filter((m) => m.type === 'measure').map((m) => m.code)
console.log('S9 measurable past ghosts', pastMeasures)
// S12 pawn probe: black knight split to put a ghost on e... white pawn push onto ghost square
let p = newGame(V, optionValues(V, {}))
p = go(p, ['(0T1)a2-a3', '/', 'L0:g8-L0:f6|L0:h6', '/'])
// white pawn f... black knight ghost on f6: white pawn f2-f4 later; simpler: black ghost on h6 - white pawn h2-h4, h4-h5 then h5xh6? use g-pawn g2-g4-g5 attacking f6/h6
p = go(p, ['(0T2)g2-g4', '/', '(0T2)a7-a6', '/'])
console.log('S12 pawn g4-g5 then capture probes; g5 outcomes', out(p, '(0T3)g4-g5'))
p = go(p, ['(0T3)g4-g5', '/', '(0T3)a6-a5', '/'])
console.log('S12 pawn capture g5xf6 outcomes', out(p, '(0T4)g5-f6'), 'g5xh6', out(p, '(0T4)g5-h6'))
const pm = go(p, [['(0T4)g5-f6', 0]])
console.log('S12 after Missed: L0 end', pm.worlds[0].b.x.tl[0][1], 'vs before', p.worlds[0].b.x.tl[0][1], 'turn', pm.turn)
// note sizes
let maxNote = 0
console.log('S5-like note size', (outcomes(V, go(newGame(V, optionValues(V, {})), ['(0T1)g1-f3', '/', '(0T1)e7-e6', '/']), 'L0:f3-L0:g1|L0\'2:d3') || []).map((b) => b.notes.map((n) => n.length)))
