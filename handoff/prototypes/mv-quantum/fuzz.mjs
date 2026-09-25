// Random games with invariants: node fuzz.mjs [setup] [games] [plies] [timelines]
import { V, Q, invariants, seeded } from './lib.mjs'

const setup = process.argv[2] ?? 'small'
const games = Number(process.argv[3] ?? 20)
const plies = Number(process.argv[4] ?? 120)
const tl = process.argv[5] ?? '2'
const stats = { plies: 0, rolls: 0, maxWorlds: 0, maxRows: 0, splits: 0, results: {}, ms: 0, maxJson: 0, kinds: {}, missBuilt: 0 }
const t0 = Date.now()
const seed0 = Number(process.argv[6] ?? 1000)
for (let g = 0; g < games; g++) {
	const rng = seeded(seed0 + g)
	let s = Q.newGame(V, { setup, timelines: tl })
	for (let ply = 0; ply < plies && !s.result; ply++) {
		let codes = Q.legalMoves(V, s).map((m) => m.code)
		if (ply % 3 === 1) {
			const froms = new Set()
			for (const { b } of s.worlds) {
				for (let id = 0; id < b.sq.length; id++) {
					if (b.sd[id] === s.turn && b.sq[id] >= 0 && V.types[b.ty[id]]?.splittable) {
						froms.add(b.sq[id])
					}
				}
			}
			const list = [...froms]
			const f = list[Math.floor(rng() * list.length)]
			const splits = f === undefined ? [] : Q.splitsFrom(V, s, f).map((m) => m.code)
			if (splits.length) {
				codes = splits
				stats.splits++
			}
		}
		if (!codes.length) {
			throw new Error('no legal move without result, game ' + g + ' ply ' + ply)
		}
		const code = codes[Math.floor(rng() * codes.length)]
		const other = 1 - s.turn
		const before = Q.budget(s, other)
		const res = Q.applyMove(V, s, code, rng)
		if (res && Q.budget(res.state, other) > before) {
			throw new Error('the opponent raised a budget: ' + code)
		}
		if (res && res.state.worlds.length > Q.budget(res.state, 0) * Q.budget(res.state, 1)) {
			throw new Error('worlds > product of budgets')
		}
		if (!res) {
			throw new Error('illegal chosen ' + code)
		}
		if (res.outcomes.length > 1) {
			stats.rolls++
		}
		if (!res.branch.rolled && new Set(res.branch.worlds.map((e) => e.k)).size > 1) {
			stats.links = (stats.links ?? 0) + 1
			const kind = code.includes('>>') ? 'linkBranch' : code.includes('>') ? 'linkHop' : 'linkBoard'
			stats.kinds[kind] = (stats.kinds[kind] ?? 0) + 1
		}
		for (const o of res.outcomes) {
			if (o.notes.some((n) => n.startsWith('solid:'))) {
				stats.kinds.solidRoll = (stats.kinds.solidRoll ?? 0) + 1
				console.log('SOLID ROLL on', code)
			}
		}
		s = res.state
		invariants(s)
		stats.plies++
		stats.maxWorlds = Math.max(stats.maxWorlds, s.worlds.length)
		stats.maxRows = Math.max(stats.maxRows, s.worlds[0].b.x.tl.filter(Boolean).length)
		const kind = code === 'submit' ? 'submit' : code.includes('>>') ? 'branch' : code.includes('>') ? 'hop' : code[0] === '?' ? 'measure' : code.includes('|') ? (code.indexOf('|') < code.indexOf('-') ? 'merge' : 'split') : 'physical'
		stats.kinds[kind] = (stats.kinds[kind] ?? 0) + 1
		if (ply % 10 === 0) {
			stats.maxJson = Math.max(stats.maxJson, JSON.stringify(s).length)
		}
	}
	const r = s.result ? s.result.reason + ':' + s.result.winner : 'open'
	stats.results[r] = (stats.results[r] ?? 0) + 1
}
stats.ms = Date.now() - t0
console.log(JSON.stringify(stats))
