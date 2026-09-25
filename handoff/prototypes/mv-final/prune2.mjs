import { V, P, Q, seeded, show } from '../../tmp/mv-final/libf.mjs'
import { chooseMove } from '../../tmp/mv-final/core/ai.mjs'
import * as F from './mvf-fix6.mjs'
for (const [seed, ply] of [[29, 18], [36, 22]]) {
	const rng = seeded(seed)
	let s = Q.newGame(V, { setup: 'marauders', timelines: '3' })
	while (s.ply < ply) s = Q.applyMove(V, s, await chooseMove(V, s, { level: 'easy', rng }), rng).state
	const x = s.worlds[0].b.x
	console.log(`seed ${seed} ply ${ply}: side ${s.turn}, must move ${P.mandatory(x).map((u) => P.LAB[u])}, spec stuck ${P.stuck(s)}, fixed stuck ${F.stuck(s)}, legal ${Q.legalMoves(V, s).length}, view ${Q.legalMoves(V, P.aiView(s)).length}`)
	const code = await chooseMove(V, s, { level: 'easy', rng })
	const n = Q.applyMove(V, s, code, rng).state
	console.log('   computer plays', code, '->', JSON.stringify(n.result))
	// after the non-stranding pruned move, is the rest of the turn finishable?
	for (const c of Q.legalMoves(V, s).map((m) => m.code)) {
		const list = Q.branches(V, s, c)
		const r = list.map((br) => Q.stateAfter(V, s, c, br, list, { light: true }))
		if (r.every((m) => !m.result)) console.log('   non-stranding:', c, 'then must move', P.mandatory(r[0].worlds[0].b.x).map((u) => P.LAB[u]), 'canSubmit', P.canSubmit(r[0].worlds[0].b.x), 'turn', r[0].turn)
	}
}
