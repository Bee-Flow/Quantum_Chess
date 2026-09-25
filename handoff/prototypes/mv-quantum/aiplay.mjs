// AI self-play: node aiplay.mjs <setup> <games> <levelWhite> <levelBlack> [seed]
import { V, Q, invariants, seeded } from './lib.mjs'
import { chooseMove } from './core/ai.mjs'
const [setup = 'small', games = '4', lw = 'normal', lb = 'easy', seed = '1'] = process.argv.slice(2)
const out = { results: {}, plies: [], maxMs: 0, avgMs: 0, kinds: {}, rolls: 0, maxWorlds: 0, rows: [] }
let moves = 0, tot = 0
for (let g = 0; g < Number(games); g++) {
	const rng = seeded(Number(seed) * 100 + g)
	let s = Q.newGame(V, { setup, timelines: '2' })
	while (!s.result && s.ply < 400) {
		const t0 = performance.now()
		const code = await chooseMove(V, s, { level: s.turn === 0 ? lw : lb, rng })
		const ms = performance.now() - t0
		out.maxMs = Math.max(out.maxMs, ms)
		tot += ms
		moves++
		if (!code) {
			throw new Error('no move')
		}
		const kind = code === 'submit' ? 'submit' : code.includes('>>') ? 'branch' : code.includes('>') ? 'hop' : code[0] === '?' ? 'measure' : code.includes('|') ? (code.indexOf('|') < code.indexOf('-') ? 'merge' : 'split') : 'physical'
		out.kinds[kind] = (out.kinds[kind] ?? 0) + 1
		const res = Q.applyMove(V, s, code, rng)
		if (res.outcomes.length > 1) out.rolls++
		s = res.state
		invariants(s)
		out.maxWorlds = Math.max(out.maxWorlds, s.worlds.length)
	}
	const r = s.result ? s.result.reason + ':' + s.result.winner : 'open'
	out.results[r] = (out.results[r] ?? 0) + 1
	out.plies.push(s.ply)
	out.rows.push(s.worlds[0].b.x.tl.filter(Boolean).length)
}
out.avgMs = Math.round(tot / moves)
out.maxMs = Math.round(out.maxMs)
console.log(setup, lw, 'vs', lb, JSON.stringify(out))
