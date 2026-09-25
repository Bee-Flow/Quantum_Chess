// Random games like tests/js/variants/fuzz.spec.js (splits every 4th ply) with the same invariants, plus timing.
import { CAPA as V } from './proto.mjs'
import { seededRng } from '../../../src/engine/index.js'
import { applyMove, BUDGET, budget, legalMoves, MAX_WORLDS, newGame, splitsFrom, T } from '../../../src/variants/core/quantum.js'
import { chooseMove } from '../../../src/variants/core/ai.js'

function inv(s) {
	if (!s.worlds.length || s.worlds.length > MAX_WORLDS) throw new Error('worlds')
	if (s.worlds.reduce((a, e) => a + e.w, 0) !== T) throw new Error('weights')
	for (let side = 0; side < 2; side++) if (budget(s, side) > BUDGET) throw new Error('budget')
	const solid = (b) => b.board.map((id) => (id >= 0 && V.solidTypes.has(b.ty[id]) ? b.sd[id] + b.ty[id] : '.')).join(',')
	const f = solid(s.worlds[0].b)
	for (const { b } of s.worlds) {
		if (solid(b) !== f) throw new Error('solid')
		for (let id = 0; id < b.sq.length; id++) if (b.sq[id] >= 0 && b.board[b.sq[id]] !== id) throw new Error('board')
	}
	if (s.result && legalMoves(V, s).length) throw new Error('moves after result')
}
let maxW = 0
const t0 = Date.now()
const games = Number(process.argv[2] ?? 20)
const plies = Number(process.argv[3] ?? 120)
const ends = {}
for (let g = 0; g < games; g++) {
	const rng = seededRng(1000 + g)
	let s = newGame(V, {})
	inv(s)
	let ply = 0
	for (; ply < plies && !s.result; ply++) {
		let cs = legalMoves(V, s).map((m) => m.code)
		if (ply % 4 === 1) {
			const froms = new Set()
			for (const { b } of s.worlds) for (let id = 0; id < b.sq.length; id++) {
				if (b.sd[id] === s.turn && b.sq[id] >= 0 && V.types[b.ty[id]]?.splittable) froms.add(b.sq[id])
			}
			const list = [...froms]
			const f = list[Math.floor(rng() * list.length)]
			const sp = f === undefined ? [] : splitsFrom(V, s, f).map((m) => m.code)
			if (sp.length) cs = sp
		}
		if (!cs.length) throw new Error('no moves without result')
		const res = applyMove(V, s, cs[Math.floor(rng() * cs.length)], rng)
		s = res.state
		inv(s)
		maxW = Math.max(maxW, s.worlds.length)
	}
	const r = s.result ? s.result.reason + ':' + s.result.winner : 'running'
	ends[r] = (ends[r] ?? 0) + 1
}
console.log(`${games} random games of up to ${plies} plies: ${Date.now() - t0} ms, max worlds ${maxW}, ends`, ends)

// computer player from the start position and from a middle-game state with ghosts
for (const level of ['easy', 'normal', 'hard']) {
	const s = newGame(V, {})
	const t1 = Date.now()
	const m = await chooseMove(V, s, { level, rng: seededRng(7) })
	console.log(`AI ${level} from the start: ${m} in ${Date.now() - t1} ms`)
}
