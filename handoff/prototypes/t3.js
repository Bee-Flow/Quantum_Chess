const Chess = require('../5dsrc/package/dist/5d-chess.js')
const c = new Chess()
const tryDo = (label, f) => { try { const r = f(); console.log(label, 'OK', r === undefined ? '' : JSON.stringify(r)) } catch (e) { console.log(label, 'ERR', e.message.split('\n')[0]) } }
c.import(`1. Nf3 / Nf6
2. (0T2)Nf3>>(0T1)f5 / (1T1)e6
3. (1T2)Nc3 / (0T2)e6 (1T2)d6
4. (1T3)Ng1>>(1T2)g3 (0T3)Nc3`)
console.log('black to move, actionNumber', c.actionNumber, 'submittable', c.submittable())
const mv = c.moves('notation_short', false, false).split('\n')
console.log('black moves on L2 (inactive, optional) exist?', mv.filter(x => x.startsWith('(2T2)')).slice(0, 3))
tryDo('L1 move', () => c.move('(1T3)a6'))
console.log('submittable (L0 T3b still unmoved)?', c.submittable())
const br = c.moves('notation_short', false, false).split('\n').filter(x => x.startsWith('(0T3)') && x.includes('>>(0T2)'))
console.log('black branches to (0T2):', br.slice(0, 4))
tryDo('black branch ' + br[0], () => c.move(br[0]))
console.log('submittable after black branch reactivates white L2 (end T2b, black to move)?', c.submittable())
tryDo('move on L2', () => c.move('(2T2)a6'))
console.log('submittable after moving on L2?', c.submittable())
tryDo('submit', () => c.submit())
console.log(c.export('5dpgn'))
