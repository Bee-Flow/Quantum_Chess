import { V, P, Q, show, play, outs, invariants, stateOfWorlds } from './lib.mjs'
let s = stateOfWorlds([[P.buildWorld({ n: 5, s: 0, c: [1, 0], rows: { 0: { st: 0, en: 4, boards: { 4: '4k/5/2N2/5/K4', 2: '4k/5/5/5/K1N2' } }, 1: { st: 3, en: 4, parent: [0, 2], boards: { 4: '4k/5/5/5/K4', 3: '4k/5/5/5/K4' } } } }), 1]])
const step = (code, i = null, quiet = false) => {
	console.log('\n>> ' + code + '   outcomes: ' + outs(s, code))
	s = play(s, code, i)
	invariants(s)
	if (!quiet) console.log(show(s))
}
console.log(show(s))
console.log('splits:', Q.splitsFrom(V, s, V.topology.byName('L0:c3')).map((m) => m.code).join(' '))
step('L0:c3-L+1:a3|L+1:e3')
step('(0T3)e5-d5', null, true)
step('(+1T3)e5-d5')
console.log('merges', Q.legalMoves(V, s).filter((m) => m.type === 'merge').map((m) => m.code).join(' '))
step('L+1:a3|L+1:e3-L+1:c4')
console.log('budget', Q.budget(s, 0))
