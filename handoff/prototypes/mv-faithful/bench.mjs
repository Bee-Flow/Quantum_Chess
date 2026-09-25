// Speed and size measurements of the faithful multiverse design. Usage: node bench.mjs <setup> [seed]
import { seededRng } from '/home/tom/Projects/Quantum_Chess/Quantum_Chess/src/engine/index.js'
import { worldKey } from '/home/tom/Projects/Quantum_Chess/Quantum_Chess/src/variants/core/world.js'
import { chooseMove } from './core/ai.mjs'
import { applyMove, branches, legalMoves, newGame, royalDanger, splitsFrom, stateAfter } from './core/quantum.mjs'
import { layoutOf } from './layout.mjs'
import { apply, generate, threats, V } from './mv.mjs'

const setupId = process.argv[2] ?? 'standard'
const seed = Number(process.argv[3] ?? 5)
const time = (fn, reps = 1) => { const t = process.hrtime.bigint(); let r; for (let i = 0; i < reps; i++) r = fn(); return [Number(process.hrtime.bigint() - t) / 1e6 / reps, r] }
const fresh = (b) => ({ ...b, x: { ...b.x } }) // defeats the generation cache (keyed by world object)

// collect states from random quantum games, bucketed by rows and worlds
const buckets = new Map()
for (let g = 0; g < 12 && buckets.size < 40; g++) {
	const rng = seededRng(seed * 1000 + g)
	let s = newGame(V, { setup: setupId, timelines: 3, window: 4 })
	for (let ply = 0; ply < 160 && !s.result; ply++) {
		let codes = legalMoves(V, s).map((m) => m.code)
		if (ply % 3 === 1) {
			const froms = new Set()
			for (const { b } of s.worlds) for (let id = 0; id < b.sq.length; id++) if (b.sd[id] === s.turn && b.sq[id] >= 0 && V.types[b.ty[id]]?.splittable) froms.add(b.sq[id])
			const f = [...froms][Math.floor(rng() * froms.size)]
			const sp = f === undefined ? [] : splitsFrom(V, s, f).map((m) => m.code)
			if (sp.length) codes = sp
		}
		const travel = codes.filter((c) => c.includes('>'))
		const code = travel.length && rng() < 0.25 ? travel[Math.floor(rng() * travel.length)] : codes[Math.floor(rng() * codes.length)]
		s = applyMove(V, s, code, rng).state
		const rows = s.worlds[0].b.x.r.length
		const wb = s.worlds.length >= 64 ? 64 : s.worlds.length >= 8 ? 8 : s.worlds.length === 1 ? 1 : 0
		const key = rows + ':' + wb
		if (wb && !buckets.has(key)) buckets.set(key, s)
	}
}
const out = []
for (const [key, s] of [...buckets.entries()].sort()) {
	const [rows, wb] = key.split(':').map(Number)
	const b = s.worlds[0].b
	const [gMs, list] = time(() => generate(fresh(b), b.x.s), 50)
	const moves = list.filter((m) => m.kind !== 'submit')
	const [thMs] = time(() => threats(fresh(b), 1 - b.x.s), 50)
	const [apMs] = time(() => { for (const m of moves.slice(0, 40)) apply(b, m) }, 5)
	const [wkMs] = time(() => worldKey(b), 50)
	const [lmMs, lm] = time(() => legalMoves(V, { ...s }), 1)
	const codes = lm.map((m) => m.code).filter((c) => c !== '↵').slice(0, 30)
	const [brMs] = time(() => { for (const c of codes) { const l = branches(V, s, c); stateAfter(V, s, c, l[0], l, { light: true }) } }, 1)
	const [rdMs] = time(() => royalDanger(V, { ...s, worlds: s.worlds.map((e) => ({ b: fresh(e.b), w: e.w })) }, s.turn), 1)
	const [loMs, lo] = time(() => layoutOf(s), 5)
	out.push({
		rows, worlds: s.worlds.length, keys: lm.length, genUs: Math.round(gMs * 1000), movesPerBoardWorld: moves.length,
		threatUs: Math.round(thMs * 1000), applyUs: Math.round((apMs / Math.max(1, Math.min(40, moves.length))) * 1000),
		worldKeyUs: Math.round(wkMs * 1000), worldKB: +(JSON.stringify(b).length / 1024).toFixed(1),
		stateKB: +(JSON.stringify(s).length / 1024).toFixed(0), legalMovesMs: +lmMs.toFixed(1),
		perMoveMs: +(brMs / Math.max(1, codes.length)).toFixed(2), royalDangerMs: +rdMs.toFixed(1), layoutMs: +loMs.toFixed(1),
		cells: lo.cells.length,
	})
}
console.table(out)
// the computer: one move at each level on the start position and on the largest collected states
const aiStates = [['start', newGame(V, { setup: setupId, timelines: 3, window: 4 })], ...[...buckets.entries()].filter(([k]) => /^(3|5|7):(1|8)$/.test(k)).slice(0, 4)]
const ai = []
for (const [name, s] of aiStates) {
	for (const level of ['easy', 'normal', 'hard']) {
		const t = Date.now()
		const code = await chooseMove(V, s, { level, rng: seededRng(3) })
		ai.push({ state: name, worlds: s.worlds.length, keys: legalMoves(V, s).length, level, ms: Date.now() - t, code })
	}
}
console.table(ai)
