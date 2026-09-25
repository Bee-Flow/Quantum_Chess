import { V, visibility, names, newGame, applyOutcome, st, N, candidateMoves, pawnTries } from './proto.mjs'
import { cloneWorld, worldKey, generate, placePiece, OFF } from '/home/user/Quantum_Chess/src/variants/core/world.js'
import { chooseMove } from '/home/user/Quantum_Chess/src/variants/core/ai.js'
import { branches } from '/home/user/Quantum_Chess/src/variants/core/quantum.js'

const START = V.setup({}, Math.random)
const cheb = (a, b) => { const [af, ar] = V.topology.coords[a]; const [bf, br] = V.topology.coords[b]; return Math.max(Math.abs(af - bf), Math.abs(ar - br)) }
const ORDER = ['k', 'q', 'r', 'b', 'n', 'p']
/** start squares of each type of a side, in square order */
function startSquares(side) {
	const out = {}
	for (let id = 0; id < START.sq.length; id++) if (START.sd[id] === side) (out[START.ty[id]] ??= []).push(START.sq[id])
	for (const t in out) out[t].sort((a, b) => a - b)
	return out
}
function ownSquares(state, me) { const s = new Set(); for (const { b } of state.worlds) for (let id = 0; id < b.sq.length; id++) if (b.sd[id] === me && b.sq[id] >= 0) s.add(b.sq[id]); return s }

export function aiView(state, me, mode) {
	const enemy = 1 - me
	const vis = mode === 'dark' ? visibility(state, me) : ownSquares(state, me)
	const slots = startSquares(enemy)
	// alive enemy counts by type (public): darkchess: start counts minus captured (types seen); kriegspiel: by category
	const alive = {}
	for (const t of ORDER) alive[t] = (slots[t] ?? []).length
	const b0 = state.worlds[0].b
	if (mode === 'dark') {
		for (let id = 0; id < b0.sq.length; id++) if (b0.sd[id] === enemy && b0.sq[id] === OFF) alive[b0.ty[id]]--
	} else {
		// from announcements: captured pawns / pieces; a captured piece is taken from the most numerous... here: nearest start square
		for (const h of state.history) for (const c of h.announce?.captures ?? []) if (h.side === me) {
			if (c.kind === 'pawn') alive.p--
			else { let bestT = null, bestD = 99; for (const t of ['q', 'r', 'b', 'n']) for (const s of slots[t]) if (alive[t] > 0 && cheb(s, c.sq) < bestD) { bestD = cheb(s, c.sq); bestT = t } if (bestT) alive[bestT]-- }
		}
	}
	const n0 = b0.sq.length
	const worlds = state.worlds.map(({ b, w }) => {
		const c = cloneWorld(b)
		const hasEp = mode === 'dark' && [...generate(V, b, me).values()].some((m) => m.kind === 'ep')
		const seen = {}
		for (let id = 0; id < n0; id++) {
			if (c.sd[id] === me || c.sq[id] < 0) continue
			if (vis.has(c.sq[id])) { seen[c.ty[id]] = (seen[c.ty[id]] ?? 0) + 1; continue }
			placePiece(c, id, OFF)
		}
		c.x = { ...c.x, castle: (c.x.castle ?? []).filter((r) => r.side === me), ep: hasEp ? c.x.ep : -1, epVictim: hasEp ? c.x.epVictim : -1 }
		// phantom slots, appended with fixed ids in every world
		for (const t of ORDER) {
			const sqs = slots[t] ?? []
			const want = Math.max(0, alive[t] - (seen[t] ?? 0))
			for (let i = 0; i < sqs.length; i++) {
				const id = c.sq.length
				c.sq.push(OFF); c.ty.push(t); c.sd.push(enemy)
				if (i >= want) continue
				let sq = sqs[i]
				const ok = (s) => !vis.has(s) && c.board[s] === -1
				if (!ok(sq)) {
					if (t !== 'k') continue
					let best = -1
					for (let s = 0; s < V.topology.size; s++) if (ok(s) && (best < 0 || cheb(s, sqs[i]) < cheb(best, sqs[i]))) best = s
					sq = best
				}
				if (sq >= 0) { c.sq[id] = sq; c.board[sq] = id }
			}
		}
		return { b: c, w }
	})
	const map = new Map()
	for (const e of worlds) { const k = worldKey(e.b); if (map.has(k)) map.get(k).w += e.w; else map.set(k, { ...e }) }
	return { ...state, worlds: [...map.values()], history: [] }
}

const dump = (s) => s.worlds.map(({ b, w }) => (w / 16777216) + ':' + b.board.map((id, sq) => id >= 0 ? N(sq) + b.sd[id] + b.ty[id] : '').filter(Boolean).join(',')).join(' | ')
const A = st([[{ e1: '0:k', a1: '0:r', e8: '1:k', b8: '1:n', h7: '1:p' }, 1]], 0)
const B = st([[{ e1: '0:k', a1: '0:r', e8: '1:k', c6: '1:n', h7: '1:p' }, 1]], 0)
// NOTE: test states have only 3 black pieces; counts use start counts, so here "alive" is the full army: fine for equality
console.log('dark A', dump(aiView(A, 0, 'dark')))
console.log('dark B', dump(aiView(B, 0, 'dark')))
console.log('equal dark', dump(aiView(A, 0, 'dark')) === dump(aiView(B, 0, 'dark')), 'equal krieg', dump(aiView(A, 0, 'krieg')) === dump(aiView(B, 0, 'krieg')))
let s = newGame(V)
console.log('start krieg', dump(aiView(s, 0, 'krieg')))
// timing of chooseMove on view
const VK = Object.assign(Object.create(Object.getPrototypeOf(V)), V, { aiView: (st, me) => aiView(st, me, 'krieg') })
const t0 = Date.now()
const mv = await chooseMove(VK, s, { level: 'normal', rng: () => 0.3 })
console.log('krieg AI first move', mv, Date.now() - t0, 'ms')
const VD = Object.assign(Object.create(Object.getPrototypeOf(V)), V, { aiView: (st, me) => aiView(st, me, 'dark') })
const mv2 = await chooseMove(VD, s, { level: 'normal', rng: () => 0.3 })
console.log('dark AI first move', mv2)
