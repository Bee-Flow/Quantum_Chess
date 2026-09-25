// Fuzz: the prototype's stuck test vs the one with step 6 fixed, on random play; disagreements are checked by an
// exhaustive search of the stuck side's own turn (every action, every outcome): can it finish the turn at all?
import { V, P, Q, seeded } from '../../tmp/mv-final/libf.mjs'
import * as F from './mvf-fix6.mjs'
const [setup = 'marauders', games = '30', plies = '80'] = process.argv.slice(2)
// can the side to move finish its turn (reach a state where the other side moves, or the game ends not by stuck)?
function canFinish(s, depth, seen) {
	if (s.result) return s.result.reason !== 'checkmate' && s.result.reason !== 'stalemate'
	if (s.turn !== seen.side) return true
	if (depth === 0) return true // give up: count as finishable (conservative)
	for (const m of Q.legalMoves(V, s)) {
		const list = Q.branches(V, s, m.code)
		for (const br of list) {
			const n = Q.stateAfter(V, s, m.code, br, list, { light: true })
			// light mode runs stateResult: a stuck result there is the orig test's verdict; recurse on the raw state instead
			const raw = n.result && (n.result.reason === 'stalemate' || n.result.reason === 'checkmate') ? null : n
			if (raw && canFinish(raw, depth - 1, seen)) return true
		}
	}
	return false
}
let states = 0, orig = 0, fix = 0, disagree = 0, confirmed = 0
for (let g = 1; g <= Number(games); g++) {
	const rng = seeded(1000 + g)
	let s = Q.newGame(V, { setup, timelines: '3' })
	while (!s.result && s.ply < Number(plies)) {
		states++
		const o = P.stuck(s), f = F.stuck(s)
		orig += o; fix += f
		if (o !== f) {
			disagree++
			const fin = canFinish(s, 4, { side: s.turn })
			if (!fin) confirmed++
			if (disagree <= 3) console.log(`game ${g} ply ${s.ply}: orig ${o} fixed ${f}; exhaustive (depth 4): can finish = ${fin}`)
		}
		const ms = Q.legalMoves(V, s)
		const m = ms[Math.floor(rng() * ms.length)]
		s = Q.applyMove(V, s, m.code, rng).state
	}
}
console.log({ setup, states, origStuck: orig, fixedStuck: fix, disagree, confirmedStuckByExhaustiveSearch: confirmed })
