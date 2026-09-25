import { V, P, Q, show, play, outs, invariants, stateOfWorlds } from './lib.mjs'
let s = Q.newGame(V, { setup: 'small' })
const step = (code, i = null, quiet = false) => {
	console.log('>> ' + code + '   outcomes: ' + outs(s, code) + '  -> worlds ' + (s = play(s, code, i)).worlds.length + ' budgetW ' + Q.budget(s, 0))
	invariants(s)
	if (!quiet) console.log(show(s))
}
console.log('=== which-path memory')
step('L0:d1-L0:c3|L0:e3', null, true)
step('(0T1)a4-a3', null, true)
step('L0:c3|L0:e3-L0:d1')
step('(0T2)b4-b3', null, true)
step('(0T3)e2-e3', null, true)
step('(0T3)c4-c3', null, true)
step('(0T4)d1-c3')
console.log('=== a ghost hunts a king in the past')
const rows = (v3, v4) => ({ 0: { st: 2, en: 4, boards: { 2: '5/5/4k/5/KN3', 3: v3, 4: v4 } } })
const A = P.buildWorld({ n: 5, s: 0, rows: rows('5/5/2N1k/5/K4', '5/4k/2N2/5/K4') })
const B = P.buildWorld({ n: 5, s: 0, rows: rows('5/5/N3k/5/K4', '5/4k/N4/5/K4') })
const setId = (w, q, id) => { const old = w.board[q]; const [t, d] = [w.ty[old], w.sd[old]]; w.sq[old] = -1; w.ty[old] = ''; w.sd[old] = 0; P.place(w, id, q, t, d) }
setId(B, P.sqOf(0, 0, 0, 2), P.idOf(5, 0, 0, 2, 2))
setId(B, P.sqOf(0, 4, 0, 2), P.idOf(5, 0, 4, 2, 2))
s = stateOfWorlds([[A, 1], [B, 1]])
console.log(show(s))
console.log('danger black', Q.royalDanger(V, s, 1))
const s0 = s
step('(0T3)c3>>(0T2)e3', 0)
s = s0
step('(0T3)c3>>(0T2)e3', 1)
