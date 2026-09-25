// Computer games with a log: node aigames.mjs <fromSeed> <toSeed> [levelW] [levelB] [show seed]
import { V, Q, P, show, invariants, seeded } from './lib.mjs'
import { chooseMove } from './core/ai.mjs'
const [a = '1', b = '10', lw = 'normal', lb = 'normal', pick = ''] = process.argv.slice(2)
for (let seed = Number(a); seed <= Number(b); seed++) {
	const rng = seeded(seed)
	let s = Q.newGame(V, { setup: 'small', timelines: '2' })
	const log = []
	const st = { split: 0, travel: 0, roll: 0, link: 0, measure: 0, merge: 0 }
	while (!s.result && s.ply < 200) {
		const code = await chooseMove(V, s, { level: s.turn === 0 ? lw : lb, rng })
		const res = Q.applyMove(V, s, code, rng)
		const linked = !res.branch.rolled && new Set(res.branch.worlds.map((e) => e.k)).size > 1
		if (code.includes('|')) st[code.indexOf('|') < code.indexOf('-') ? 'merge' : 'split']++
		if (code.includes('>')) st.travel++
		if (code[0] === '?') st.measure++
		if (res.outcomes.length > 1) st.roll++
		if (linked) st.link++
		log.push(`${s.ply + 1}. ${s.turn ? 'B' : 'W'} ${code}` + (res.outcomes.length > 1 ? `  [roll: ${res.outcomes.map((o) => o.key + ' ' + Math.round(o.weight / Q.T * 100) + '%').join(' / ')} -> ${res.branch.key}]` : linked ? '  [linked]' : '') + `  worlds ${res.state.worlds.length}`)
		s = res.state
		invariants(s)
	}
	console.log(`seed ${seed}: ${JSON.stringify(s.result)} plies ${s.ply} ${JSON.stringify(st)} rows ${s.worlds[0].b.x.tl.filter(Boolean).length}`)
	if (String(seed) === pick) {
		console.log(log.join('\n'))
		console.log(show(s, { history: false }))
	}
}
