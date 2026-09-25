// Probe: per-move UI costs that the spec's "one UI step" (6.16) leaves out, at the largest states of split-heavy
// random games: the roll memo key (rolls.js positionHash over every world), the Submit button's isLegal, the H4
// moveWarning of one attempt, the H7 Split-mode filter (isLegal per candidate target), aiView's real-state filter.
import { V, P, Q, seeded } from '../../tmp/mv-final/libf.mjs'
import { fnv1a64 } from '../../../src/engine/hash.js'
const setup = process.argv[2] ?? 'standard'
function worldText(b) {
	const board = b.board.map((id) => (id < 0 ? '.' : b.sd[id] + b.ty[id] + id)).join(',')
	return board + '||' + JSON.stringify(b.x)
}
const positionHash = (s) => fnv1a64([String(s.turn), ...s.worlds.map(({ b, w }) => worldText(b) + '@' + w)].join(';'))
let best = null
for (let g = 0; g < Number(process.env.GAMES ?? 8); g++) {
	const rng = seeded(900 + g)
	let s = Q.newGame(V, { setup, timelines: '3' })
	for (let ply = 0; ply < 150 && !s.result; ply++) {
		let codes = Q.legalMoves(V, s).map((m) => m.code)
		if (ply % 3 === 1) {
			const froms = new Set()
			for (const { b } of s.worlds) for (let id = 0; id < b.sq.length; id++) if (b.sd[id] === s.turn && b.sq[id] >= 0 && V.types[b.ty[id]]?.splittable) froms.add(b.sq[id])
			for (const f of froms) { const sp = Q.splitsFrom(V, s, f).map((m) => m.code); if (sp.length) { codes = sp; break } }
		}
		s = Q.applyMove(V, s, codes[Math.floor(rng() * codes.length)], rng).state
		if (!s.result && (!best || s.worlds.length * s.worlds[0].b.board.length > best.worlds.length * best.worlds[0].b.board.length)) best = s
	}
}
const s = JSON.parse(JSON.stringify(best))
const t = (f) => { const t0 = performance.now(); const r = f(); return [performance.now() - t0, r] }
console.log(`${setup}: ${s.worlds.length} worlds, ${s.worlds[0].b.x.tl.filter(Boolean).length} rows, board length ${s.worlds[0].b.board.length}`)
const [h] = t(() => positionHash(s))
const [sub] = t(() => Q.isLegal(V, s, 'submit'))
const moves = Q.legalMoves(V, s)
const mv = moves.find((m) => m.type === 'move' && m.code !== 'submit')
const [mw] = t(() => P.moveWarning(s, mv.code))
// H7: the piece with most split targets; after the first target, isLegal(splitCode(f, t1, t)) for every other target
let bestF = null, bestT = []
for (const { b } of s.worlds.slice(0, 1)) for (let id = 0; id < b.sq.length; id++) {
	if (b.sd[id] !== s.turn || b.sq[id] < 0 || !V.types[b.ty[id]]?.splittable) continue
	const tg = Q.splitTargets(V, s, b.sq[id])
	if (tg.length > bestT.length) { bestT = tg; bestF = b.sq[id] }
}
let h7 = 0, legalPairs = 0
if (bestF !== null) {
	const t1 = bestT[0]
	const [ms] = t(() => { for (const t2 of bestT.slice(1)) legalPairs += Q.isLegal(V, s, Q.splitCode(V, bestF, t1, t2)) })
	h7 = ms
}
// aiView's real-state filter: branches(real, c) for every candidate of the view
const view = P.aiView(s)
const cands = Q.legalMoves(V, view).map((m) => m.code)
const [rf] = t(() => cands.filter((c) => view === s || Q.branches(V, s, c)))
console.log(`  roll memo key (positionHash) ${h.toFixed(1)} ms | isLegal(submit) ${sub.toFixed(1)} ms | moveWarning(one move) ${mw.toFixed(1)} ms | H7 filter for ${bestT.length - 1} targets ${h7.toFixed(0)} ms (${legalPairs} legal pairs) | aiView real-state filter ${rf.toFixed(0)} ms for ${cands.length} candidates (view pruned: ${view !== s})`)
