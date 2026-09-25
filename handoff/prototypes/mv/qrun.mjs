import V from './qvariant.mjs'
import * as P from './proto.mjs'
import { newGame, applyMove, applyOutcome, branches, legalMoves, splitsFrom, budget, BUDGET, MAX_WORLDS, T, royalDanger, pieceLocations, outcomes } from '/home/user/Quantum_Chess/src/variants/core/quantum.js'
import { optionValues } from '/home/user/Quantum_Chess/src/variants/core/variant.js'

const out = (s, code) => { const o = outcomes(V, s, code); return o && o.map((b) => `${b.key}${b.notes.length ? '[' + b.notes.map((n) => n.slice(0, 12)).join(',') + ']' : ''} ${(b.p * 100).toFixed(1)}%`) }
const mustPlay = (s, code, i = 0) => { const n = applyOutcome(V, s, code, i); if (!n) throw new Error('illegal ' + code); return n }
const tl = (s) => JSON.stringify(s.worlds.map(({ b }) => V.solidExtra(b)).filter((v, i, a) => a.indexOf(v) === i))

let s = newGame(V, optionValues(V, {}))
// S1 split on the first board
console.log('S1 split outcomes', out(s, 'L0:g1-L0:f3|L0:h3'))
s = mustPlay(s, 'L0:g1-L0:f3|L0:h3')
console.log('S1 worlds', s.worlds.length, 'turn', s.turn, 'skeletons', tl(s), 'submit legal', !!branches(V, s, '/'))
s = mustPlay(s, '/'); s = mustPlay(s, '(0T1)e7-e6'); s = mustPlay(s, '/')
// S2 ghost part moves
console.log('S2 ghost part f3-e5 outcomes', out(s, '(0T2)f3-e5'))
const miss = mustPlay(s, '(0T2)f3-e5', 0)
console.log('S2 after Missed: worlds', miss.worlds.length, 'turn', miss.turn, 'L0 end', miss.worlds[0].b.x.tl[0][1], 'ply', miss.ply, 'knight at', pieceLocations(miss, 6).map((l) => V.topology.names[l.sq] ?? l.sq))
const hit = mustPlay(s, '(0T2)f3-e5', 1)
console.log('S2 after Moved: L0 end', hit.worlds[0].b.x.tl[0][1], 'worlds', hit.worlds.length)
// S3 time travel into the past with a ghost: branch from h3 part
console.log('S3 ghost part travel h3>>(0T1)g5? outcomes', out(s, '(0T2)h3>>(0T1)g5'))
// S4 split into the past: take the 'Moved' state? use fresh: 1. Nf3 / e6 2. split Nf3 into two T1 squares
let t = newGame(V, optionValues(V, {}))
for (const c of ['(0T1)g1-f3', '/', '(0T1)e7-e6', '/']) t = mustPlay(t, c)
const past = legalMoves(V, t, { splits: true }).filter((m) => m.type === 'split' && m.from[0] === V.topology.byName('L0:f3'))
const pastPairs = past.filter((m) => m.to.every((q) => Math.floor(q / 64) % 7 !== 0))
console.log('S4 split pairs from f3:', past.length, 'into the past (both on history):', pastPairs.map((m) => m.code).slice(0, 4))
const sp = pastPairs.find((m) => { const a = Math.floor(m.to[0] / 64), b = Math.floor(m.to[1] / 64); return a === b })
console.log('S4 same past board split', sp.code, out(t, sp.code))
const t2 = mustPlay(t, sp.code)
console.log('S4 after: worlds', t2.worlds.length, 'skeletons', tl(t2), 'budget W', budget(t2, 0))
// S5 cross-board split: one physical, one branch
const cross = past.find((m) => { const a = Math.floor(m.to[0] / 64) % 7, b = Math.floor(m.to[1] / 64) % 7; return (a === 0) !== (b === 0) })
console.log('S5 cross-board split', cross.code, out(t, cross.code))
// S6 danger = official check: fool's mate
let f = newGame(V, optionValues(V, {}))
for (const c of ['(0T1)f2-f3', '/', '(0T1)e7-e6', '/', '(0T2)g2-g4', '/', '(0T2)d8-h4', '/']) f = mustPlay(f, c)
console.log('S6 danger for White', royalDanger(V, f, 0))
const f2 = mustPlay(mustPlay(f, '(0T3)e1>>(0T2)f2'), '/')
console.log('S6 after king escape, Black to move, danger White', royalDanger(V, f2, 0), 'skeletons', tl(f2))
const f3 = mustPlay(mustPlay(f, '(0T3)a2-a3'), '/')
console.log('S6 after a3: black capture h4-e1 outcomes', out(f3, '(0T3)h4-e1'), 'result', mustPlay(f3, '(0T3)h4-e1').result)

// fuzz with the real core and invariants
function check(s) {
	if (s.worlds.length > MAX_WORLDS) throw new Error('worlds')
	if (s.worlds.reduce((a, e) => a + e.w, 0) !== T) throw new Error('weights')
	for (const { b } of s.worlds) {
		for (let id = 0; id < b.sq.length; id++) if (b.sq[id] >= 0 && b.board[b.sq[id]] !== id) throw new Error('sq/board')
		b.board.forEach((id, q) => { if (id >= 0 && b.sq[id] !== q) throw new Error('board/sq') })
	}
	for (let side = 0; side < 2; side++) if (budget(s, side) > BUDGET) throw new Error('budget ' + budget(s, side))
	const solid = (b) => b.board.map((id) => (id >= 0 && V.solidTypes.has(b.ty[id]) ? b.sd[id] + b.ty[id] : '.')).join(',')
	const first = solid(s.worlds[0].b), fx = V.solidExtra(s.worlds[0].b)
	for (const { b } of s.worlds) { if (solid(b) !== first) throw new Error('solid'); if (V.solidExtra(b) !== fx) throw new Error('skeleton') }
	if (s.result && legalMoves(V, s).length) throw new Error('result with moves')
}
let seed = 1
const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
const stat = { games: 0, plies: 0, maxWorlds: 0, results: {}, splits: 0, measures: 0, misses: 0, solidNotes: 0, maxRows: 0, ms: 0 }
const t0 = Date.now()
for (const setup of ['standard', 'small']) {
	for (let g = 0; g < 6; g++) {
		let s = newGame(V, optionValues(V, { setup }))
		for (let ply = 0; ply < 120 && !s.result; ply++) {
			let codes = legalMoves(V, s).map((m) => m.code)
			if (ply % 4 === 1) {
				const froms = new Set()
				for (const { b } of s.worlds) for (let id = 0; id < b.sq.length; id++) if (b.sd[id] === s.turn && b.sq[id] >= 0 && V.types[b.ty[id]]?.splittable) froms.add(b.sq[id])
				const list = [...froms]; const fsq = list[Math.floor(rng() * list.length)]
				const sp = fsq === undefined ? [] : splitsFrom(V, s, fsq).map((m) => m.code)
				if (sp.length) codes = sp
			}
			if (!codes.length) throw new Error('no legal move without result')
			const code = codes[Math.floor(rng() * codes.length)]
			const res = applyMove(V, s, code, rng)
			if (!res) throw new Error('illegal ' + code)
			if (code.includes('|')) stat.splits++
			if (code[0] === '?') stat.measures++
			if (res.branch.key === 'miss') stat.misses++
			if (res.branch.notes.some((n) => n.startsWith('solid'))) stat.solidNotes++
			s = res.state
			check(s)
			stat.plies++
			stat.maxWorlds = Math.max(stat.maxWorlds, s.worlds.length)
			stat.maxRows = Math.max(stat.maxRows, s.worlds[0].b.x.tl.filter(Boolean).length)
		}
		stat.games++
		const r = s.result ? s.result.reason : 'unfinished'
		stat.results[r] = (stat.results[r] ?? 0) + 1
	}
}
stat.ms = Date.now() - t0
console.log('FUZZ', stat)
