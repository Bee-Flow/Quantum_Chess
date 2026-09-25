// Measurements: node bench.mjs <setup> [timelines]   (env MVQ_B=5 for a 5x5 capacity)
import { V, P, Q, seeded } from './lib.mjs'
import { layoutOf } from './layout.mjs'
import { chooseMove } from './core/ai.mjs'
import { worldKey } from '/home/tom/Projects/Quantum_Chess/Quantum_Chess/src/variants/core/world.js'

const setup = process.argv[2] ?? 'small'
const tl = process.argv[3] ?? '2'
const doAi = process.argv[4] !== 'noai'

// collect states from random play that prefers splits, travel and keeping kings alive
function collect(seed, plies) {
	const rng = seeded(seed)
	let s = Q.newGame(V, { setup, timelines: tl })
	const got = [s]
	for (let ply = 0; ply < plies && !s.result; ply++) {
		let codes = Q.legalMoves(V, s).map((m) => m.code)
		if (ply % 3 === 1 && Q.budget(s, s.turn) < 8) {
			const froms = new Set()
			for (const { b } of s.worlds) {
				for (let id = 0; id < b.sq.length; id++) {
					if (b.sd[id] === s.turn && b.sq[id] >= 0 && V.types[b.ty[id]]?.splittable) {
						froms.add(b.sq[id])
					}
				}
			}
			for (const f of froms) {
				const sp = Q.splitsFrom(V, s, f).map((m) => m.code)
				if (sp.length) {
					codes = sp
					break
				}
			}
		}
		// avoid king captures to keep games going
		const safe = codes.filter((c) => {
			const o = Q.outcomes(V, s, c)
			return o && !o.some((b) => b.notes.some((n) => n.startsWith('end:{')))
		})
		const pool = safe.length ? safe : codes
		const code = pool[Math.floor(rng() * pool.length)]
		const res = Q.applyMove(V, s, code, rng)
		s = res.state
		if (!s.result) {
			got.push(s)
		}
	}
	return got
}

const time = (f, reps = 1) => {
	const t0 = performance.now()
	let r
	for (let i = 0; i < reps; i++) {
		r = f()
	}
	return { ms: (performance.now() - t0) / reps, r }
}

let all = []
for (let seed = 1; seed <= 6; seed++) {
	all.push(...collect(seed * 31, 70))
}
const pick = (pred) => all.filter(pred)
const buckets = [
	['1 world', (s) => s.worlds.length === 1],
	['2-8 worlds', (s) => s.worlds.length >= 2 && s.worlds.length <= 8],
	['9-32 worlds', (s) => s.worlds.length >= 9 && s.worlds.length <= 32],
	['33-64 worlds', (s) => s.worlds.length >= 33],
]
console.log(`setup ${setup} timelines ${tl} capacity ${P.BC}x${P.BC}; ${all.length} states`)
for (const [name, pred] of buckets) {
	const list = pick(pred)
	if (!list.length) {
		continue
	}
	let gen = 0, moves = 0, br = 0, brN = 0, after = 0, danger = 0, lay = 0, json = 0, worlds = 0, rows = 0, keyMs = 0
	for (const s0 of list) {
		const s = JSON.parse(JSON.stringify(s0)) // fresh caches
		const g = time(() => Q.legalMoves(V, s))
		gen += g.ms
		moves += g.r.length
		const codes = g.r.map((m) => m.code)
		const sample = codes.filter((_, i) => i % Math.max(1, Math.floor(codes.length / 12)) === 0)
		for (const c of sample) {
			const b = time(() => Q.branches(V, s, c))
			br += b.ms
			brN++
			if (b.r) {
				after += time(() => Q.stateAfter(V, s, c, b.r[0], b.r)).ms / sample.length
			}
		}
		danger += time(() => Q.royalDanger(V, s, s.turn)).ms
		lay += time(() => layoutOf(s)).ms
		keyMs += time(() => s.worlds.forEach(({ b }) => worldKey(b))).ms
		json += JSON.stringify(s).length / s.worlds.length
		worlds += s.worlds.length
		rows += s.worlds[0].b.x.tl.filter(Boolean).length
	}
	const k = list.length
	console.log(`${name}: n=${k} avgWorlds ${(worlds / k).toFixed(1)} avgRows ${(rows / k).toFixed(1)} | legalMoves ${(gen / k).toFixed(2)} ms (${(moves / k).toFixed(0)} codes) | branches/move ${(br / brN).toFixed(2)} ms | stateAfter ${(after / k).toFixed(2)} ms | danger ${(danger / k).toFixed(2)} ms | layoutOf ${(lay / k).toFixed(2)} ms | worldKey all ${(keyMs / k).toFixed(2)} ms | JSON/world ${(json / k / 1024).toFixed(1)} KB`)
}
// generate one world (median of many)
{
	const s = all[Math.min(all.length - 1, 40)]
	const b = s.worlds[0].b
	const reps = 400
	const t0 = performance.now()
	for (let i = 0; i < reps; i++) {
		P.generate({ ...b }, b.x.s)
	}
	console.log(`generate one world (${b.x.tl.filter(Boolean).length} rows): ${((performance.now() - t0) / reps * 1000).toFixed(0)} us`)
	const m = P.generate(b, b.x.s).find((mm) => mm.kind !== 'submit')
	const t1 = performance.now()
	for (let i = 0; i < reps; i++) {
		P.apply(b, m)
	}
	console.log(`apply one move: ${((performance.now() - t1) / reps * 1000).toFixed(0)} us (${m.kind})`)
}
if (doAi) {
	const states = [all[4], all[Math.floor(all.length / 3)], all[Math.floor((2 * all.length) / 3)], all[all.length - 1]].filter(Boolean)
	for (const level of ['easy', 'normal', 'hard']) {
		let tot = 0
		let mx = 0
		for (const s of states) {
			const t0 = performance.now()
			await chooseMove(V, JSON.parse(JSON.stringify(s)), { level, rng: seeded(5) })
			const ms = performance.now() - t0
			tot += ms
			mx = Math.max(mx, ms)
		}
		console.log(`AI ${level}: avg ${(tot / states.length).toFixed(0)} ms, max ${mx.toFixed(0)} ms (worlds ${states.map((s) => s.worlds.length).join(',')})`)
	}
}
