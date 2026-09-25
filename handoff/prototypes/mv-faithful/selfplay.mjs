// The computer against itself: every ply must be legal, turns must finish, no crash. Usage: node selfplay.mjs <setup> <level> <plies>
import { seededRng } from '/home/tom/Projects/Quantum_Chess/Quantum_Chess/src/engine/index.js'
import { chooseMove } from './core/ai.mjs'
import { applyMove, newGame } from './core/quantum.mjs'
import { V } from './mv.mjs'
const [setupId = 'standard', level = 'normal', plies = '40'] = process.argv.slice(2)
const rng = seededRng(Number(process.env.SEED ?? 7))
let s = newGame(V, { setup: setupId, timelines: 3, window: 4 })
const times = []
let turns = 0, travel = 0, rolls = 0
for (let i = 0; i < Number(plies) && !s.result; i++) {
	const t = Date.now()
	const code = await chooseMove(V, s, { level, rng })
	times.push(Date.now() - t)
	if (!code) { console.log('no move chosen'); break }
	const r = applyMove(V, s, code, rng)
	if (!r) { console.log('ILLEGAL', code); break }
	if (r.outcomes.length > 1) rolls++
	if (code.includes('>')) travel++
	if (r.state.turn !== s.turn) turns++
	s = r.state
}
times.sort((a, b) => a - b)
console.log(JSON.stringify({ setup: setupId, level, plies: s.ply, turns, travel, rolls, worlds: s.worlds.length, rows: s.worlds[0].b.x.r.length, result: s.result, msMedian: times[times.length >> 1], msMax: times[times.length - 1], last: s.history.slice(-6).map((h) => h.code) }))
