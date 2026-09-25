// Random quantum games through the patched core: every invariant of tests/js/variants/fuzz.spec.js plus the
// multiverse ones (one skeleton in every world). Usage: node fuzz.mjs <setup> <seed> <games> <plies> [splitEvery]
import { writeFileSync } from 'node:fs'
import { seededRng } from '/home/tom/Projects/Quantum_Chess/Quantum_Chess/src/engine/index.js'
import { applyMove, budget, BUDGET, legalMoves, MAX_WORLDS, newGame, splitsFrom, T } from './core/quantum.mjs'
import { V } from './mv.mjs'

const [setupId = 'standard', seedArg = '1', gamesArg = '5', pliesArg = '120', splitEvery = '3'] = process.argv.slice(2)
const fail = (msg) => { throw new Error(msg) }
const stats = { games: 0, plies: 0, rolls: 0, splits: 0, merges: 0, measures: 0, travel: 0, maxWorlds: 0, maxRows: 0, maxWorldKB: 0, maxStateKB: 0, results: {}, ms: 0 }
const samples = []
function check(s) {
	if (s.worlds.length < 1 || s.worlds.length > MAX_WORLDS) fail('world count ' + s.worlds.length)
	if (s.worlds.reduce((a, e) => a + e.w, 0) !== T) fail('weights')
	const sx = V.solidExtra(s.worlds[0].b)
	const solid = (b) => b.board.map((id) => (id >= 0 && V.solidTypes.has(b.ty[id]) ? b.sd[id] + b.ty[id] : '.')).join(',')
	const s0 = solid(s.worlds[0].b)
	for (const { b, w } of s.worlds) {
		if (!(Number.isInteger(w) && w > 0)) fail('weight')
		for (let id = 0; id < b.sq.length; id++) if (b.sq[id] >= 0 && b.board[b.sq[id]] !== id) fail('sq/board ' + id)
		b.board.forEach((id, sq) => { if (id >= 0 && b.sq[id] >= 0 && b.sq[id] !== sq) fail('board/sq ' + sq) })
		b.board.forEach((id, sq) => { if (id >= 0 && b.sq[id] < 0 && (sq < 832 || id >= 32)) fail('marker outside history ' + sq) })
		if (V.solidExtra(b) !== sx) fail('skeleton differs between worlds')
		if (solid(b) !== s0) fail('solid pieces differ')
		if (b.sq.length !== s.worlds[0].b.sq.length || b.board.length !== s.worlds[0].b.board.length) fail('array lengths differ')
	}
	for (let side = 0; side < 2; side++) if (budget(s, side, V) > BUDGET) fail('budget ' + budget(s, side, V))
	if (s.result && legalMoves(V, s).length) fail('moves after the end')
}
const t0 = Date.now()
for (let g = 0; g < Number(gamesArg); g++) {
	const rng = seededRng(Number(seedArg) * 7919 + g)
	let s = newGame(V, { setup: setupId, timelines: 3, window: 4 })
	check(s)
	for (let ply = 0; ply < Number(pliesArg) && !s.result; ply++) {
		let codes = legalMoves(V, s).map((m) => m.code)
		if (ply % Number(splitEvery) === 1) {
			const froms = new Set()
			for (const { b } of s.worlds) for (let id = 0; id < b.sq.length; id++) if (b.sd[id] === s.turn && b.sq[id] >= 0 && V.types[b.ty[id]]?.splittable) froms.add(b.sq[id])
			const list = [...froms]
			const f = list[Math.floor(rng() * list.length)]
			const splits = f === undefined ? [] : splitsFrom(V, s, f).map((m) => m.code)
			if (splits.length) codes = splits
		} else if (ply % 7 === 3) {
			const q = codes.filter((c) => c.includes('|') || c.startsWith('?'))
			if (q.length) codes = q
		}
		if (!codes.length) fail('no legal move without a result')
		const code = codes[Math.floor(rng() * codes.length)]
		const res = applyMove(V, s, code, rng)
		if (!res) fail('illegal chosen ' + code)
		if (res.outcomes.length > 1) stats.rolls++
		if (code.includes('|')) { if (code.indexOf('|') > code.indexOf('-')) stats.splits++; else stats.merges++ }
		if (code.startsWith('?')) stats.measures++
		if (code.includes('>')) stats.travel++
		s = res.state
		check(s)
		stats.plies++
		const kb = JSON.stringify(s.worlds[0].b).length / 1024
		const skb = JSON.stringify(s).length / 1024
		stats.maxWorlds = Math.max(stats.maxWorlds, s.worlds.length)
		stats.maxRows = Math.max(stats.maxRows, s.worlds[0].b.x.r.length)
		stats.maxWorldKB = Math.max(stats.maxWorldKB, Math.round(kb * 10) / 10)
		stats.maxStateKB = Math.max(stats.maxStateKB, Math.round(skb))
		if (samples.length < 400 && ply % 5 === 0) samples.push({ rows: s.worlds[0].b.x.r.length, worlds: s.worlds.length, state: s })
	}
	const r = s.result ? s.result.reason : 'open'
	stats.results[r] = (stats.results[r] ?? 0) + 1
	stats.games++
}
stats.ms = Date.now() - t0
console.log(JSON.stringify({ setup: setupId, seed: Number(seedArg), ...stats }))
if (process.env.SAVE) writeFileSync(process.env.SAVE, JSON.stringify(samples.map((x) => x.state)))
