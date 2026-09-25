import { V, Q, W } from './proto.mjs'
const { chooseMove } = await import('/home/user/Quantum_Chess/src/variants/core/ai.js')
const { KING_STEPS } = await import('/home/user/Quantum_Chess/src/variants/core/orthodox.js')
let s = Q.newGame(V)
for (const c of ['g1-f3', 'a7-a6', 'f3-e5']) s = Q.applyOutcome(V, s, c, 0)
for (const level of []) {
	const m = await chooseMove(V, s, { level, rng: () => 0.5 })
	console.log('black after Ne5', level, m?.code ?? m)
}
// with an evaluate term
function kingSq(w, side) { for (let id = 0; id < w.sq.length; id++) if (w.sd[id] === side && w.ty[id] === 'k' && w.sq[id] >= 0) return w.sq[id]; return -1 }
function threat(w, s) {
	const k = kingSq(w, s); const ek = kingSq(w, 1 - s)
	if (k < 0 || ek < 0) return 0
	let n = 0
	for (const q of [k, ...KING_STEPS.map((v) => V.topology.step(k, v)).filter((x) => x >= 0)]) {
		const id = w.board[q]
		if (id < 0 || w.sd[id] !== s) continue
		const [fa, ra] = V.topology.coords[q]; const [fb, rb] = V.topology.coords[ek]
		if (Math.max(Math.abs(fa - fb), Math.abs(ra - rb)) <= 1) continue
		if (W.attacks(V, w, 1 - s, q)) n++
	}
	return Math.min(n, 2)
}
V.evaluate = (w, side) => 60 * (threat(w, 1 - side) - threat(w, side))
for (const level of ['easy', 'normal']) {
	const m = await chooseMove(V, s, { level, rng: () => 0.5 })
	console.log('with eval: black after Ne5', level, m?.code ?? m)
}
// self-play sample game normal vs normal with eval
let g = Q.newGame(V)
const codes = []
let seed = 7
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const t0 = Date.now()
while (!g.result && g.ply < 60) {
	const m = await chooseMove(V, g, { level: 'normal', rng })
	codes.push(m)
	g = Q.applyMove(V, g, m, rng).state
}
console.log(codes.join(' '), JSON.stringify(g.result), 'ms', Date.now() - t0)
