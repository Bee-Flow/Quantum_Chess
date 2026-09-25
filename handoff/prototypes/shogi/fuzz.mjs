// Random games on the prototype with the invariants of the generic fuzz test plus the shogi ones.
// Usage: node fuzz.mjs <firstSeed> <games> <plies>
import { SHOGI as V, farRanks, pawnFilesOf } from './shogi.mjs'
import { applyMove, budget, legalMoves, newGame, splitsFrom, T } from './lib.mjs'
import { seededRng } from '../../../src/engine/index.js'
import { HAND } from '../../../src/variants/core/world.js'

const [first = 1, games = 10, PLIES = 150] = process.argv.slice(2).map(Number)
const stats = { plies: 0, splits: 0, merges: 0, measures: 0, drops: 0, dropMiss: 0, captures: 0, promotions: 0,
	maxWorlds: 0, twoFaces: 0, rolled: 0, endRoll: 0, results: {}, uchiMiss: 0, ms: 0 }
function fail(msg, s) { console.log('INVARIANT', msg); console.log(JSON.stringify(s.worlds.map((e) => e.b.sq))); process.exit(1) }
function check(s) {
	if (s.worlds.reduce((a, e) => a + e.w, 0) !== T) fail('weights', s)
	if (s.worlds.length > 64) fail('worlds', s)
	for (const side of [0, 1]) if (budget(s, side) > 8) fail('budget', s)
	const solid = (b) => b.board.map((id) => (id >= 0 && V.solidTypes.has(b.ty[id]) ? b.sd[id] + b.ty[id] : '.')).join(',')
	const hand = (b) => b.sq.map((q, id) => (q === HAND ? id + ':' + b.sd[id] + b.ty[id] : '')).filter(Boolean).join(',')
	const s0 = solid(s.worlds[0].b)
	const h0 = hand(s.worlds[0].b)
	for (const { b } of s.worlds) {
		if (solid(b) !== s0) fail('solid', s)
		if (hand(b) !== h0) fail('hands differ', s)
		let count = 0
		for (let id = 0; id < b.sq.length; id++) {
			count++
			const q = b.sq[id]
			if (q >= 0 && b.board[q] !== id) fail('board', s)
			if (q >= 0) {
				const t = b.ty[id]
				if ((t === 'p' || t === 'l') && farRanks(b.sd[id], q, 1)) fail('immobile ' + t, s)
				if (t === 'n' && farRanks(b.sd[id], q, 2)) fail('immobile n', s)
			}
			if (q === HAND && b.ty[id][0] === '+') fail('promoted in hand', s)
		}
		if (count !== 40) fail('piece count ' + count, s)
		for (const side of [0, 1]) {
			const pawns = b.sq.filter((q, id) => q >= 0 && b.sd[id] === side && b.ty[id] === 'p').length
			if (pawnFilesOf(b, side).size !== pawns) fail('nifu', s)
		}
	}
	// same piece on the same square with different types in different worlds
	const seen = new Map()
	for (const { b } of s.worlds) for (let id = 0; id < b.sq.length; id++) if (b.sq[id] >= 0) {
		const k = id + '@' + b.sq[id]
		const t = seen.get(k)
		if (t !== undefined && t !== b.ty[id]) { stats.twoFaces++; break }
		seen.set(k, b.ty[id])
	}
	stats.maxWorlds = Math.max(stats.maxWorlds, s.worlds.length)
	if (s.result) {
		if (legalMoves(V, s).length) fail('moves after result', s)
		stats.results[s.result.reason] = (stats.results[s.result.reason] ?? 0) + 1
	}
}
const t0 = Date.now()
for (let g = first; g < first + games; g++) {
	const rng = seededRng(g * 7919 + 5)
	let s = newGame(V)
	check(s)
	for (let ply = 0; ply < PLIES && !s.result; ply++) {
		let list = legalMoves(V, s)
		let codes = list.map((m) => m.code)
		const q = list.filter((m) => m.type !== 'move').map((m) => m.code)
		const caps = list.filter((m) => m.type === 'move' && m.drop === null).map((m) => m.code)
		if (ply % 3 === 1) {
			const froms = new Set()
			for (const { b } of s.worlds) for (let id = 0; id < b.sq.length; id++) {
				if (b.sd[id] === s.turn && b.sq[id] >= 0 && V.types[b.ty[id]].splittable) froms.add(b.sq[id])
			}
			const fl = [...froms]
			const f = fl[Math.floor(rng() * fl.length)]
			const splits = f === undefined ? [] : splitsFrom(V, s, f).map((m) => m.code)
			if (splits.length) codes = splits
		} else if (q.length && rng() < 0.08) {
			codes = q
		} else if (caps.length && rng() < 0.5) {
			codes = caps
		}
		const code = codes[Math.floor(rng() * codes.length)]
		const res = applyMove(V, s, code, rng)
		if (!res) fail('illegal ' + code, s)
		stats.plies++
		if (code.includes('|') && /\|.*-/.test(code)) stats.merges++
		else if (code.includes('|')) stats.splits++
		else if (code[0] === '?') stats.measures++
		else if (code.includes('@')) { stats.drops++; if (res.branch.key === 'miss') stats.dropMiss++ }
		if (code.includes('=')) stats.promotions++
		if (res.branch.captures.length) stats.captures++
		if (res.branch.rolled) stats.rolled++
		if (res.branch.notes.some((n) => n.startsWith('end:'))) stats.endRoll++
		s = res.state
		check(s)
	}
}
stats.ms = Date.now() - t0
console.log(JSON.stringify(stats))
