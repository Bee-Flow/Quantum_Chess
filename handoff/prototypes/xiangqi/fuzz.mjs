// Random games with splits (like tests/js/variants/fuzz.spec.js) on the prototype, plus a few computer moves.
// Usage: node fuzz.mjs [games] [plies]
import { seededRng } from '../../../src/engine/index.js'
import { chooseMove } from '../../../src/variants/core/ai.js'
import { applyMove, BUDGET, budget, legalMoves, MAX_WORLDS, newGame, splitsFrom, T } from '../../../src/variants/core/quantum.js'
import { V, check, failures, stateOf } from './lib.mjs'

const GAMES = Number(process.argv[2] ?? 30)
const PLIES = Number(process.argv[3] ?? 120)

/** The invariants of fuzz.spec.js plus "every running world has both generals". */
function invariants(s) {
	if (s.worlds.length < 1 || s.worlds.length > MAX_WORLDS) {
		throw new Error('world count ' + s.worlds.length)
	}
	if (s.worlds.reduce((a, e) => a + e.w, 0) !== T) {
		throw new Error('weights')
	}
	for (let side = 0; side < 2; side++) {
		if (budget(s, side) > BUDGET) {
			throw new Error('budget')
		}
	}
	const solid = (b) => b.board.map((id) => (id >= 0 && V.solidTypes.has(b.ty[id]) ? b.sd[id] + b.ty[id] : '.')).join(',')
	const first = solid(s.worlds[0].b)
	for (const { b } of s.worlds) {
		if (solid(b) !== first) {
			throw new Error('solid pieces differ')
		}
		if (!s.result && b.ty.filter((ty, id) => ty === 'k' && b.sq[id] >= 0).length !== 2) {
			throw new Error('a running world without a general')
		}
	}
	if (s.result && legalMoves(V, s).length) {
		throw new Error('finished game with legal moves')
	}
}

const t0 = Date.now()
let maxWorlds = 0
const results = {}
for (let g = 0; g < GAMES; g++) {
	const rng = seededRng(1000 + g)
	let s = newGame(V)
	for (let ply = 0; ply < PLIES && !s.result; ply++) {
		let codes = legalMoves(V, s).map((m) => m.code)
		if (ply % 3 === 1) {
			const froms = new Set()
			for (const { b } of s.worlds) {
				for (let id = 0; id < b.sq.length; id++) {
					if (b.sd[id] === s.turn && b.sq[id] >= 0 && V.types[b.ty[id]].splittable) {
						froms.add(b.sq[id])
					}
				}
			}
			const list = [...froms]
			const f = list[Math.floor(rng() * list.length)]
			const splits = f === undefined ? [] : splitsFrom(V, s, f).map((m) => m.code)
			if (splits.length) {
				codes = splits
			}
		}
		if (!codes.length) {
			throw new Error('no legal move in a running game')
		}
		const res = applyMove(V, s, codes[Math.floor(rng() * codes.length)], rng)
		s = res.state
		invariants(s)
		maxWorlds = Math.max(maxWorlds, s.worlds.length)
	}
	const key = s.result ? s.result.reason + ':' + s.result.winner : 'running'
	results[key] = (results[key] ?? 0) + 1
}
console.log(`fuzz: ${GAMES} games x ${PLIES} plies in ${Date.now() - t0} ms, max worlds ${maxWorlds}, results ${JSON.stringify(results)}`)

// the computer: takes a free chariot, and flies to win
{
	const s = stateOf([[{ d1: '0:k', a1: '0:r', f10: '1:k', a7: '1:r', i10: '1:h' }, 1]])
	check('AI takes the free chariot', await chooseMove(V, s, { level: 'normal', rng: () => 0.5 }), 'a1-a7')
	const f = stateOf([[{ d1: '0:k', a1: '0:r', d10: '1:k', a7: '1:r' }, 1]])
	check('AI flies to win', await chooseMove(V, f, { level: 'easy', rng: () => 0.5 }), 'd1-d10')
}
// a self-play game at level normal
{
	let s = newGame(V)
	const t1 = Date.now()
	const rng = seededRng(7)
	for (let ply = 0; ply < 40 && !s.result; ply++) {
		const code = await chooseMove(V, s, { level: 'normal', rng })
		s = applyMove(V, s, code, rng).state
		invariants(s)
	}
	console.log(`self-play normal: ${s.ply} plies in ${Date.now() - t1} ms, result ${JSON.stringify(s.result)}`)
}
console.log(failures() ? failures() + ' FAILED' : 'all passed')
