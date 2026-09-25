import { V, P, Q, seeded } from '../../tmp/mv-final/libf.mjs'
import { chooseMove, evaluateState } from '../../tmp/mv-final/core/ai.mjs'
const rng = seeded(10)
let s = Q.newGame(V, { setup: 'marauders', timelines: '3' })
while (s.ply < 20) {
	const code = await chooseMove(V, s, { level: 'easy', rng })
	s = Q.applyMove(V, s, code, rng).state
}
const view = P.aiView(s)
for (const m of Q.legalMoves(V, view)) {
	const list = Q.branches(V, view, m.code)
	let v = 0
	const res = []
	for (const br of list) {
		const n = Q.stateAfter(V, view, m.code, br, list, { light: true })
		v += br.weight / Q.T * evaluateState(V, n, s.turn)
		res.push(n.result ? n.result.reason : '-')
	}
	console.log(m.code.padEnd(24), Math.round(v), res.join(','), 'moveWarning:', P.moveWarning(s, m.code))
}
