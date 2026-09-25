const Chess = require('../5dsrc/package/dist/5d-chess.js')
const c = new Chess()
const tryDo = (label, f) => { try { const r = f(); console.log(label, 'OK', r === undefined ? '' : JSON.stringify(r)) } catch (e) { console.log(label, 'ERR', e.message.split('\n')[0]) } }
for (const [m, s] of [['Nf3', 1], ['Nf6', 1], ['(0T2)Nf3>>(0T1)f5', 1], ['(1T1)e6', 1], ['(1T2)Nc3', 1], ['(0T2)e6', 0], ['(1T2)d6', 1]]) { tryDo(m, () => c.move(m)); if (s) tryDo('submit', () => c.submit()) }
console.log('white turn; submittable?', c.submittable())
const mv = c.moves('notation_short').split('\n')
console.log('present moves count', mv.length, 'branching from L1:', mv.filter(x => x.startsWith('(1T3)') && x.includes('>>')).slice(0, 5))
const br = mv.find(x => x.startsWith('(1T3)') && x.includes('>>'))
tryDo('second white branch ' + br, () => c.move(br))
console.log('submittable after 2nd (inactive) branch, L0 T3w unmoved:', c.submittable())
tryDo('move on L0', () => c.move('(0T3)Nc3'))
console.log('submittable after also moving on L0:', c.submittable())
tryDo('submit', () => c.submit())
console.log(c.export('5dpgn'))
