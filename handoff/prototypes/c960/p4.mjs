import { CHESS960 as V } from './proto.mjs'
import { newGame, show, after, outs } from './lib.mjs'
const s = newGame(V, { position: 74 }); console.log(outs(V, s, 'O-O-O'), show(V, after(V, s, 'O-O-O'))[0].slice(0, 60))
const s3 = newGame(V, { position: 3 }); console.log(show(V, after(V, s3, 'O-O'))[0].split('{')[1])
import { optionValues } from '/home/user/Quantum_Chess/src/variants/core/variant.js'
V.options = [{ id: 'position', type: 'number', min: 0, max: 959, random: true, default: 518 }]
console.log(optionValues(V, { position: 1000 }), optionValues(V, { position: 77 }))
