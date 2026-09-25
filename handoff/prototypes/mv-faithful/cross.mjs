// Cross-check of the prototype's move generation, present/submit logic and "check" (phantom threats) against
// 5d-chess-js 1.2.1 on random games. Usage: node cross.mjs <variant> <seed> <games> <plies> <window turns> <cap>
// variant: standard | defended_pawn | half_reflected | princess | reversed_royalty | turn_zero | two_timelines
import { createRequire } from 'node:module'
import { dump } from './dbg.mjs'
import { apply, generate, info, labelOf, SETUPS, SUBMIT, threats, V } from './mv.mjs'

const require = createRequire(import.meta.url)
const Chess = require('../../tmp/mv-faithful/package/dist/5d-chess.js')

const [variant = 'standard', seedArg = '1', gamesArg = '10', pliesArg = '60', winArg = '30', capArg = '5'] = process.argv.slice(2)
const BUILTIN = { standard: 'standard', defended_pawn: 'defended', half_reflected: 'halfreflected', princess: 'princess', reversed_royalty: 'reversed', turn_zero: 'turnzero', two_timelines: 'twotimelines' }
const SETUP = BUILTIN[variant] ?? variant
// custom setups: 5DFEN with unmoved markers on K, R, P, W
function customFen(id) {
	const S = SETUPS[id]
	const star = (f) => f.replace(/[KRPWkrpw]/g, (c) => c + '*')
	return '[Size "' + S.n + 'x' + S.n + '"]\n[Board "custom"]\n' + S.rows.map(([l, f]) => '[' + star(f) + ':' + l + ':1:w]').join('\n')
}
let seed = Number(seedArg)
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const even = variant === 'two_timelines'
const mapL = (t) => (even ? (t > 0 ? t - 1 : t) : t)
const sigJ = (m) => `${mapL(m.start.timeline)}:${2 * m.start.turn + (m.start.player === 'black' ? 1 : 0)}:${m.start.file - 1}${m.start.rank - 1}>${mapL(m.end.timeline)}:${2 * m.end.turn + (m.end.player === 'black' ? 1 : 0)}:${m.end.file - 1}${m.end.rank - 1}`
const sigP = (w, m) => { const e = m.extra; return `${w.x.r[e.slot][0]}:${e.v}:${e.x0}${e.y0}>${w.x.r[e.s2][0]}:${e.v2}:${e.x2}${e.y2}` }

const stats = { games: 0, plies: 0, positions: 0, travel: 0, branches: 0, hops: 0, mismatch: 0, windowCut: 0, capCut: 0, refMoves: 0, myMoves: 0, checkCmp: 0, checks: 0, checkBad: 0, submitBad: 0, maxRows: 0 }
const winT = Number(winArg)
const cap = Number(capArg)
for (let g = 0; g < Number(gamesArg); g++) {
	const c = BUILTIN[variant] ? new Chess(null, variant) : new Chess()
	c.skipDetection = true
	if (!BUILTIN[variant]) c.fen(customFen(variant))
	let w = V.setup({ setup: SETUP, window: winT, timelines: cap })
	for (let step = 0; step < Number(pliesArg); step++) {
		const side = w.x.s
		const mine = generate(w, side).filter((m) => m.kind !== 'submit')
		const theirs = c.moves('object', false, false)
		stats.positions++
		stats.myMoves += mine.length
		stats.refMoves += theirs.length
		const A = new Set(mine.map((m) => sigP(w, m)))
		const B = new Set(theirs.map(sigJ))
		const bySig = new Map(mine.map((m) => [sigP(w, m), m]))
		let onlyA = [...A].filter((s) => !B.has(s))
		// deliberate deviations: castling without the check test (Quantum Chess has no check), and en passant right
		// after any physical double step (5d-chess-js infers it from the board one turn back and misses some)
		onlyA = onlyA.filter((s) => {
			const m = bySig.get(s)
			if (m.kind === 'castle') { stats.castleDev = (stats.castleDev ?? 0) + 1; return false }
			if (m.kind === 'ep') { stats.epDev = (stats.epDev ?? 0) + 1; return false }
			return true
		})
		let onlyB = [...B].filter((s) => !A.has(s))
		const I = info(w.x)
		// moves the prototype leaves out on purpose: targets beyond the history window, branches beyond the cap
		onlyB = onlyB.filter((s) => {
			const [, e] = s.split('>')
			const [L, v] = e.split(':').map(Number)
			const slot = I.byL.get(L)
			const r = slot === undefined ? null : w.x.r[slot]
			if (r && v < r[2] - w.x.g[1] && v >= r[1]) { stats.windowCut++; return false }
			if (r && v < r[2] && I.c[side] >= cap) { stats.capCut++; return false }
			if (winT < 30) { stats.pathCut = (stats.pathCut ?? 0) + 1; return false } // a ride through a sealed board
			return true
		})
		if (onlyA.length || onlyB.length) {
			stats.mismatch++
			if (process.env.DUMP && stats.mismatch < 3) dump(w)
			if (stats.mismatch < 6) console.log('MISMATCH', variant, 'game', g, 'step', step, 'rows', JSON.stringify(w.x.r), 'onlyMine', onlyA.slice(0, 6), 'onlyRef', onlyB.slice(0, 6))
		}
		const inCheck = c.inCheck
		const myCheck = threats(w, 1 - side).length > 0
		stats.checkCmp++
		if (inCheck) stats.checks++
		if (inCheck !== myCheck) {
			stats.checkBad++
			if (stats.checkBad < 4) {
				console.log('CHECK mismatch', g, step, 'side', side, 'ref', inCheck, 'mine', myCheck, JSON.stringify(threats(w, 1 - side, true).slice(0, 3)))
				if (process.env.DUMP) dump(w)
				try { const ch = require('../../tmp/mv-faithful/package/dist/5d-chess.js'); } catch (e) {}
				if (process.env.DUMP) console.log('ref checks', JSON.stringify(c.checks('object').slice(0, 3).map((m) => [m.start, m.end])))
			}
		}
		const subMine = (I.present & 1) !== side
		if (!inCheck && subMine !== c.submittable()) { stats.submitBad++; console.log('SUBMIT mismatch', g, step, subMine) }
		if (Math.max(...w.x.r.map((r) => r[2])) >= 2 * 14) break
		if (Math.abs(I.lmin) >= 5 || I.lmax >= 5) break
		if ((subMine && rng() < 0.4) || mine.length === 0) {
			if (!subMine || inCheck) { stats.checkStop = (stats.checkStop ?? 0) + 1; break }
			w = apply(w, { key: SUBMIT, kind: 'submit', extra: {} })
			c.submit()
			stats.plies++
			continue
		}
		const m = mine[Math.floor(rng() * mine.length)]
		const sig = sigP(w, m)
		const ref = theirs.find((x) => sigJ(x) === sig && (!x.promotion || x.promotion === 'Q'))
		if (!ref) { console.log('no reference move for', m.key); break }
		if (m.extra.travel !== 'physical') { stats.travel++; if (m.extra.travel === 'branch') stats.branches++; else stats.hops++ }
		w = apply(w, m)
		c.move(ref)
		if (w.x.s !== side) { // the prototype ends the turn by itself when no board of the mover is left
			if (!c.submittable() && c.inCheck) { stats.checkStop = (stats.checkStop ?? 0) + 1; break }
			if (!c.submittable()) { console.log('AUTO-END but ref not submittable', m.key, JSON.stringify(w.x.r), 'ref present', JSON.stringify(c.board.timelines.map((t) => [t.timeline, t.present, t.active, t.turns.length ? [t.turns[t.turns.length - 1].turn, t.turns[t.turns.length - 1].player] : null]))); break }
			c.submit()
		}
		stats.plies++
		stats.maxRows = Math.max(stats.maxRows, w.x.r.length)
		if (w.x.k >= 0) break
	}
	stats.games++
}
console.log(JSON.stringify({ variant, seed: Number(seedArg), window: winT, cap, ...stats, avgMine: Math.round(stats.myMoves / stats.positions), avgRef: Math.round(stats.refMoves / stats.positions) }))
