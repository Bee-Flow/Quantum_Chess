// Probe: stuck-test step 6 ("a branch that changes the must-move set") is fooled by the branch's own source row.
import { V, P, Q, seeded } from '../../tmp/mv-final/libf.mjs'
import { chooseMove } from '../../tmp/mv-final/core/ai.mjs'
import * as F from './mvf-fix6.mjs'
const rng = seeded(10)
let s = Q.newGame(V, { setup: 'marauders', timelines: '3' })
while (s.ply < 20) {
	const code = await chooseMove(V, s, { level: 'easy', rng })
	s = Q.applyMove(V, s, code, rng).state
}
const x = s.worlds[0].b.x
console.log('ply', s.ply, 'Black to move; must move', P.mandatory(x).map((u) => P.LAB[u]), 'created', x.c)
console.log('spec stuck test (prototype):', P.stuck(s), ' result now:', JSON.stringify(s.result))
console.log('with step 6 = "some stuck board stops being must-move, or Submit":', F.stuck(s))
console.log('exact result at the start of the turn would be:', Q.royalDanger(V, s, s.turn) >= 1 ? 'checkmate' : 'stalemate')
// what the stuck player can still get by choosing its forced move
const res = new Map()
for (const m of Q.legalMoves(V, s, { splits: true })) {
	const list = Q.branches(V, s, m.code)
	for (const br of list) {
		const n = Q.stateAfter(V, s, m.code, br, list, { light: true })
		const k = n.result ? n.result.reason + ':' + n.result.winner : 'goes on'
		res.set(k, (res.get(k) ?? []).concat(m.code))
	}
}
for (const [k, v] of res) console.log(' ', k, v.length, 'moves, e.g.', v.slice(0, 3).join(', '))
