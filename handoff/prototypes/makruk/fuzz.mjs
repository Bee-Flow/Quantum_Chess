// Random games on the prototype (as tests/js/variants/fuzz.spec.js, but longer and with more seeds), with the same
// invariants, a tally of how the games ended and the time spent in the stalemate test.
// Run: node fuzz.mjs [games] [plies]
import { MAKRUK as V, stats } from './proto.mjs'
import { seededRng } from '../../../src/engine/index.js'
import {
	applyMove, BUDGET, branches, budget, legalMoves, MAX_WORLDS, newGame, royalDanger, splitsFrom, stateAfter, T,
} from '../../../src/variants/core/quantum.js'

function pick(s, codes, rng) {
	if (!SMART) return codes[Math.floor(rng() * codes.length)]
	const order = codes.map((c) => [rng(), c]).sort((a, b) => a[0] - b[0]).map((x) => x[1])
	let fallback = order[0]
	for (const c of order) {
		const list = branches(V, s, c)
		if (!list) continue
		if (list.every((br) => stateAfter(V, s, c, br, list, { light: true }).result?.winner === s.turn)) return c
	}
	for (const c of order) {
		const list = branches(V, s, c)
		if (!list) continue
		const safe = list.every((br) => {
			const n = stateAfter(V, s, c, br, list, { light: true })
			return n.result || royalDanger(V, n, s.turn) < 1
		})
		if (safe) return c
	}
	return fallback
}

const GAMES = Number(process.argv[2] ?? 40)
const PLIES = Number(process.argv[3] ?? 400)
// smart: take a certain king capture when there is one, and never leave the own Khun capturable for certain
const SMART = process.argv[4] === 'smart'

function check(s) {
	if (!s.worlds.length || s.worlds.length > MAX_WORLDS) throw new Error('worlds ' + s.worlds.length)
	if (s.worlds.reduce((a, e) => a + e.w, 0) !== T) throw new Error('weights')
	for (const { b } of s.worlds) {
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sq[id] >= 0 && b.board[b.sq[id]] !== id) throw new Error('board')
		}
	}
	for (const side of [0, 1]) if (budget(s, side) > BUDGET) throw new Error('budget')
	const solid = (b) => b.board.map((id) => (id >= 0 && V.solidTypes.has(b.ty[id]) ? b.sd[id] + b.ty[id] : '.')).join(',')
	const first = solid(s.worlds[0].b)
	for (const { b } of s.worlds) if (solid(b) !== first) throw new Error('solid')
	if (s.result && legalMoves(V, s).length) throw new Error('finished game with moves')
}

const tally = {}
let maxWorlds = 0
let plies = 0
const t0 = Date.now()
for (let g = 0; g < GAMES; g++) {
	const rng = seededRng(1000 + g)
	let s = newGame(V, {})
	for (let ply = 0; ply < PLIES && !s.result; ply++) {
		let codes = legalMoves(V, s).map((m) => m.code)
		if (ply % 4 === 1) {
			const froms = new Set()
			for (const { b } of s.worlds) {
				for (let id = 0; id < b.sq.length; id++) {
					if (b.sd[id] === s.turn && b.sq[id] >= 0 && V.types[b.ty[id]]?.splittable) froms.add(b.sq[id])
				}
			}
			const list = [...froms]
			const f = list[Math.floor(rng() * list.length)]
			const splits = f === undefined ? [] : splitsFrom(V, s, f).map((m) => m.code)
			if (splits.length) codes = splits
		}
		if (!codes.length) throw new Error('no move without result')
		// prefer captures a little so that games reach endgames
		const code = pick(s, codes, rng)
		const res = applyMove(V, s, code, rng)
		if (!res) throw new Error('illegal ' + code)
		s = res.state
		plies++
		maxWorlds = Math.max(maxWorlds, s.worlds.length)
		check(s)
	}
	const r = s.result ? s.result.reason + (s.result.winner === null ? '(draw)' : '(win)') : 'unfinished'
	tally[r] = (tally[r] ?? 0) + 1
}
const ms = Date.now() - t0
console.log(JSON.stringify({ games: GAMES, plies, ms, msPerPly: +(ms / plies).toFixed(2), maxWorlds, tally, stats }))
