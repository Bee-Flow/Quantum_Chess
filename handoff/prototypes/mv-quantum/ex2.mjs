// Worked example 2: pass = link through the past versus land = roll in the past
import { V, P, Q, show, play, outs, invariants, stateOfWorlds } from './lib.mjs'
const rows = (v5, v6, v4) => ({ 0: { st: 2, en: 6, boards: { 2: '4k/5/2n2/5/B3K', 3: '4k/5/2n2/4K/B4', 4: v4, 5: v5, 6: v6 } } })
const A = P.buildWorld({ n: 5, s: 0, rows: rows('4k/5/4K/5/Bn3', '3k1/5/4K/5/Bn3', '4k/5/5/4K/Bn3') })
const B = P.buildWorld({ n: 5, s: 0, rows: rows('4k/5/4K/5/B2n1', '3k1/5/4K/5/B2n1', '4k/5/5/4K/B2n1') })
let s = stateOfWorlds([[A, 1], [B, 1]], 0)
invariants(s)
console.log(show(s))
console.log('bishop keys:', Q.legalMoves(V, s).map((m) => m.code).filter((c) => c.startsWith('(0T4)a1')).join(' '))
for (const code of ['(0T4)a1>>(0T2)c1', '(0T4)a1>>(0T3)b1']) {
	console.log('\n>> ' + code + '  ' + outs(s, code))
	const list = Q.branches(V, s, code)
	list.forEach((br, i) => {
		const n = play(s, code, i)
		invariants(n)
		console.log('--- outcome ' + i + ' (' + br.key + ')')
		console.log(show(n))
		const bishop = P.idOf(5, 0, 0, 0, 0)
		console.log('bishop locations', Q.pieceLocations(n, bishop).map((l) => V.topology.names[l.sq] + ' ' + (l.p * 100) + '%').join(', '))
	})
}
