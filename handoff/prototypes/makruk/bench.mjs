// Cost of the per-world stalemate test: the same random games with and without it, and the computer player's time.
import { MAKRUK as V, khunSquare } from './proto.mjs'
import { seededRng } from '../../../src/engine/index.js'
import { applyMove, legalMoves, newGame, splitsFrom } from '../../../src/variants/core/quantum.js'
import { chooseMove } from '../../../src/variants/core/ai.js'

function games(n, plies) {
	let count = 0
	const t0 = performance.now()
	for (let g = 0; g < n; g++) {
		const rng = seededRng(77 + g)
		let s = newGame(V, {})
		for (let p = 0; p < plies && !s.result; p++) {
			let codes = legalMoves(V, s).map((m) => m.code)
			if (p % 4 === 1) {
				const fs = [...new Set(s.worlds.flatMap(({ b }) => b.sq.filter((q, id) => q >= 0 && b.sd[id] === s.turn && V.types[b.ty[id]].splittable)))]
				const sp = fs.length ? splitsFrom(V, s, fs[Math.floor(rng() * fs.length)]).map((m) => m.code) : []
				if (sp.length) codes = sp
			}
			s = applyMove(V, s, codes[Math.floor(rng() * codes.length)], rng).state
			count++
		}
	}
	return { plies: count, ms: Math.round(performance.now() - t0) }
}
const withTest = V.worldResult
console.log('with stalemate test   ', JSON.stringify(games(60, 300)))
V.worldResult = function (w, mover) {
	const k0 = khunSquare(w, 0)
	const k1 = khunSquare(w, 1)
	if (k0 < 0 || k1 < 0) return k0 < 0 && k1 < 0 ? { winner: null, reason: 'king' } : { winner: k0 >= 0 ? 0 : 1, reason: 'king' }
	return null
}
console.log('without stalemate test', JSON.stringify(games(60, 300)))
V.worldResult = withTest
// computer player on a quantum middle game position
const rng = seededRng(5)
let s = newGame(V, {})
for (const c of ['e3-e4', 'd6-d5', 'c1-b2|d2', 'f8-e7|g7', 'b1-d2', 'e6-e5']) {
	const r = applyMove(V, s, c, rng)
	if (!r) { console.log('illegal', c); break }
	s = r.state
}
for (const level of ['easy', 'normal', 'hard']) {
	const t0 = performance.now()
	const m = await chooseMove(V, s, { level, rng: seededRng(1) })
	console.log(level, m, Math.round(performance.now() - t0) + ' ms', 'worlds', s.worlds.length)
}
