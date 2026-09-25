// Probe: the self-strand of seed 10 (easy vs easy, Timeline Marauders): was the draw the computer's best value?
import { V, P, Q, seeded } from '../../tmp/mv-final/libf.mjs'
import { chooseMove, evaluateState } from '../../tmp/mv-final/core/ai.mjs'
const rng = seeded(10)
let s = Q.newGame(V, { setup: 'marauders', timelines: '3' })
let prev = null, code = null
while (!s.result && s.ply < 200) {
	code = await chooseMove(V, s, { level: 'easy', rng })
	prev = s
	s = Q.applyMove(V, s, code, rng).state
}
console.log('last', code, JSON.stringify(s.result), 'ply', s.ply)
console.log('eval before for mover', prev.turn, Math.round(evaluateState(V, prev, prev.turn)))
const vals = []
for (const m of Q.legalMoves(V, prev)) {
	const list = Q.branches(V, prev, m.code)
	let v = 0
	for (const br of list) v += br.weight / Q.T * evaluateState(V, Q.stateAfter(V, prev, m.code, br, list, { light: true }), prev.turn)
	vals.push([m.code, Math.round(v)])
}
vals.sort((a, b) => b[1] - a[1])
console.log(vals.slice(0, 8), '...', vals.length, 'moves')
console.log('value of the played move on the real state:', vals.find((e) => e[0] === code))
const view = P.aiView(prev)
console.log('aiView pruned?', view !== prev, 'mandatory', P.mandatory(prev.worlds[0].b.x), 'turn', prev.turn)
const list = Q.branches(V, view, code)
console.log('legal in view', Boolean(list))
if (list) {
	for (const br of list) {
		const n = Q.stateAfter(V, view, code, br, list, { light: true })
		console.log(' outcome', br.key, 'result in view', JSON.stringify(n.result), 'eval', Math.round(evaluateState(V, n, prev.turn)), 'stuck(view next)=', P.stuck(n))
		const nr = Q.stateAfter(V, prev, code, br, list, { light: true })
		console.log('   real result', JSON.stringify(nr.result))
	}
}
console.log(P.show ? '' : '', (await import('../../tmp/mv-final/libf.mjs')).show(prev))
