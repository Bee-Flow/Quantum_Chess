// Random games from endgame positions (bare-Khun counts, stalemates, bare Khuns) with splits, checking the quantum
// invariants and tallying the results. Run: node fuzzend.mjs [gamesPerStart] [plies]
import { MAKRUK as V, countInfo } from './proto.mjs'
import { stateOf } from './lib.mjs'
import { seededRng } from '../../../src/engine/index.js'
import { applyMove, BUDGET, budget, legalMoves, MAX_WORLDS, splitsFrom, T } from '../../../src/variants/core/quantum.js'

const N = Number(process.argv[2] ?? 50)
const PLIES = Number(process.argv[3] ?? 300)
const STARTS = [
	{ a1: '0:k', b2: '0:r', c3: '0:m', h8: '1:k', g6: '1:s' },
	{ c3: '0:k', d4: '0:s', e4: '0:s', f7: '1:k', a7: '1:m' },
	{ e1: '0:k', b1: '0:n', g1: '0:n', e4: '0:m', e8: '1:k', d7: '1:m' },
	{ d1: '0:k', c3: '0:p', f3: '0:p', e8: '1:k', c6: '1:p', g6: '1:s' },
	{ f6: '0:k', g5: '0:m', h8: '1:k', a8: '1:m' },
]
function check(s) {
	if (!s.worlds.length || s.worlds.length > MAX_WORLDS) throw new Error('worlds')
	if (s.worlds.reduce((a, e) => a + e.w, 0) !== T) throw new Error('weights')
	for (const side of [0, 1]) if (budget(s, side) > BUDGET) throw new Error('budget')
	const solid = (b) => b.board.map((id) => (id >= 0 && V.solidTypes.has(b.ty[id]) ? b.sd[id] + b.ty[id] : '.')).join(',')
	for (const { b } of s.worlds) if (solid(b) !== solid(s.worlds[0].b)) throw new Error('solid')
	if (s.result && legalMoves(V, s).length) throw new Error('moves after the end')
}
const tally = {}
let plies = 0
let counted = 0
const t0 = Date.now()
STARTS.forEach((pl, i) => {
	for (let g = 0; g < N; g++) {
		const rng = seededRng(31 * i + g)
		let s = stateOf(V, [[pl, 1]], g % 2)
		for (let p = 0; p < PLIES && !s.result; p++) {
			let codes = legalMoves(V, s).map((m) => m.code)
			if (p % 3 === 1) {
				const fs = [...new Set(s.worlds.flatMap(({ b }) => b.sq.filter((q, id) => q >= 0 && b.sd[id] === s.turn && V.types[b.ty[id]].splittable)))]
				const sp = fs.length ? splitsFrom(V, s, fs[Math.floor(rng() * fs.length)]).map((m) => m.code) : []
				if (sp.length) codes = sp
			}
			if (!codes.length) throw new Error('no moves without a result')
			// avoid obviously suicidal Khun steps half of the time so that games last
			const r = applyMove(V, s, codes[Math.floor(rng() * codes.length)], rng)
			s = r.state
			if (countInfo(s)) counted++
			plies++
			check(s)
		}
		const r = s.result ? s.result.reason + (s.result.winner === null ? '(draw)' : '(win)') : 'unfinished'
		tally[r] = (tally[r] ?? 0) + 1
	}
})
console.log(JSON.stringify({ games: N * STARTS.length, plies, ms: Date.now() - t0, pliesWithCount: counted, tally }))
