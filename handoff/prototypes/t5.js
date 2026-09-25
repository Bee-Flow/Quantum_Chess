const Chess = require('../5dsrc/package/dist/5d-chess.js')
const d = new Chess()
d.import('1. f3 / e6\n2. g4 / Qh4')
const mv = d.moves('notation_short', false, false).split('\n')
const ok = []
for (const m of mv) { const x = d.copy(); try { x.move(m); if (x.submittable()) ok.push(m) } catch (e) {} }
console.log('single-move legal actions for white:', ok)
