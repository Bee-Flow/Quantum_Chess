// Worked example 1: a ghost travels in time (the portal opens anyway)
import { V, P, Q, show, play, outs, invariants } from './lib.mjs'
let s = Q.newGame(V, { setup: 'small', timelines: '2' })
const step = (code, i = null) => {
	console.log('\n>> ' + code + '   outcomes: ' + outs(s, code))
	s = play(s, code, i)
	invariants(s)
	console.log(show(s))
}
step('L0:d1-L0:c3|L0:e3')
step('(0T1)a4-a3')
console.log('White moves now:', Q.legalMoves(V, s).map((m) => m.code).join(' '))
step('(0T2)c3>>(0T1)e3')
console.log('Black moves:', Q.legalMoves(V, s).map((m) => m.code).join(' '))
const s0 = s
step('(+1T1)e4-e3', 0)
s = s0
step('(+1T1)e4-e3', 1)
