// Search: positions where every move of the computer's pruned view (aiView) ends the game by the stuck rule, but a
// move the view pruned away (an optional-board move) keeps the game going.
import { V, P, Q, seeded } from '../../tmp/mv-final/libf.mjs'
import { chooseMove } from '../../tmp/mv-final/core/ai.mjs'
const [setup = 'marauders', seeds = '30', level = 'easy'] = process.argv.slice(2)
const stuckEnd = (s, code) => {
	const list = Q.branches(V, s, code)
	return list.every((br) => { const n = Q.stateAfter(V, s, code, br, list, { light: true }); return n.result && (n.result.reason === 'stalemate' || n.result.reason === 'checkmate') })
}
let found = 0, pruned = 0
for (let seed = 1; seed <= Number(seeds); seed++) {
	const rng = seeded(seed)
	let s = Q.newGame(V, { setup, timelines: '3' })
	while (!s.result && s.ply < 200) {
		const view = P.aiView(s)
		if (view !== s) {
			pruned++
			const vc = Q.legalMoves(V, view).map((m) => m.code)
			if (vc.every((c) => stuckEnd(s, c))) {
				const vs = new Set(vc)
				const out = Q.legalMoves(V, s).map((m) => m.code).filter((c) => !vs.has(c) && !stuckEnd(s, c))
				if (out.length) { found++; console.log(`seed ${seed} ply ${s.ply}: all ${vc.length} view moves strand; pruned moves that do not: ${out.slice(0, 4).join(', ')} (${out.length})`) }
			}
		}
		const code = await chooseMove(V, s, { level, rng })
		s = Q.applyMove(V, s, code, rng).state
	}
}
console.log({ setup, level, prunedDecisions: pruned, found })
