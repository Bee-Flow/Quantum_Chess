import { V, visibility, names, newGame, applyOutcome, st, N, candidateMoves, checkInfo, pawnTries } from './proto.mjs'
import { cloneWorld, worldKey, generate, placePiece, OFF } from '/home/user/Quantum_Chess/src/variants/core/world.js'
import { standardSetup } from '/home/user/Quantum_Chess/src/variants/core/orthodox.js'
import { chooseMove } from '/home/user/Quantum_Chess/src/variants/core/ai.js'

const start = V.setup({}, Math.random) // start world: id -> start square and type
const cheb = (a, b) => { const [af, ar] = V.topology.coords[a]; const [bf, br] = V.topology.coords[b]; return Math.max(Math.abs(af - bf), Math.abs(ar - br)) }

/** mode: 'dark' | 'krieg' */
export function aiView(state, me, mode) {
	const vis = mode === 'dark' ? visibility(state, me) : new Set()
	if (mode === 'krieg') for (const { b } of state.worlds) for (let id = 0; id < b.sq.length; id++) if (b.sd[id] === me && b.sq[id] >= 0) vis.add(b.sq[id])
	// step 1: strip
	const stripped = state.worlds.map(({ b, w }) => {
		const c = cloneWorld(b)
		const hasEp = mode === 'dark' && [...generate(V, b, me).values()].some((m) => m.kind === 'ep')
		for (let id = 0; id < c.sq.length; id++) {
			if (c.sd[id] !== me && c.sq[id] >= 0 && !vis.has(c.sq[id])) placePiece(c, id, OFF)
		}
		c.x = { ...c.x, castle: (c.x.castle ?? []).filter((r) => r.side === me), ep: hasEp ? c.x.ep : -1, epVictim: hasEp ? c.x.epVictim : -1 }
		return { b: c, w, real: b }
	})
	// squares free for phantoms: hidden and empty in every stripped world
	const free = (sq) => !vis.has(sq) && stripped.every(({ b }) => b.board[sq] === -1)
	// which enemy ids are alive-and-hidden, per world
	let alive
	if (mode === 'dark') {
		// captured enemy ids are known (seen when captured): OFF in the real worlds
		alive = (real, id) => real.sq[id] >= 0
	} else {
		// Kriegspiel: remove phantoms by announced captures (category + square), nearest start square
		const gone = new Set()
		for (const h of state.history) {
			if (h.side !== me || !h.announce) continue
			for (const cap of h.announce.captures) {
				let best = -1
				for (let id = 0; id < start.sq.length; id++) {
					if (start.sd[id] === me || gone.has(id) || start.ty[id] === 'k') continue
					if ((start.ty[id] === 'p') !== (cap.kind === 'pawn')) continue
					if (best < 0 || cheb(start.sq[id], cap.sq) < cheb(start.sq[best], cap.sq)) best = id
				}
				if (best >= 0) gone.add(best)
			}
		}
		alive = (real, id) => !gone.has(id)
	}
	const used = new Set()
	const worlds = stripped.map(({ b, w, real }) => {
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sd[id] === me || b.sq[id] >= 0 || !alive(real, id)) continue
			let target = start.sq[id]
			if (!free(target) || b.board[target] !== -1) {
				if (b.ty[id] !== 'k') continue
				// nearest free square for the king
				let best = -1
				for (let s = 0; s < V.topology.size; s++) if (free(s) && b.board[s] === -1 && (best < 0 || cheb(s, target) < cheb(best, target))) best = s
				target = best
			}
			if (target >= 0) {
				b.board[target] = id; b.sq[id] = target
				// the type of a phantom: its start type (a promoted pawn stays a pawn)
				b.ty[id] = start.ty[id]
			}
		}
		return { b, w }
	})
	const map = new Map()
	for (const e of worlds) { const k = worldKey(e.b); if (map.has(k)) map.get(k).w += e.w; else map.set(k, { ...e }) }
	return { ...state, worlds: [...map.values()], history: [] }
}

const dump = (s) => s.worlds.map(({ b, w }) => w + ':' + b.board.map((id, sq) => id >= 0 ? N(sq) + b.sd[id] + b.ty[id] : '').filter(Boolean).join(',')).join(' | ')
// no-leak test: darkchess
const A = st([[{ e1: '0:k', a1: '0:r', e8: '1:k', b8: '1:n', h7: '1:p' }, 1]], 0)
const B = st([[{ e1: '0:k', a1: '0:r', e8: '1:k', c6: '1:n', h7: '1:p' }, 1]], 0)
console.log('vis equal', names(visibility(A, 0)).join(' ') === names(visibility(B, 0)).join(' '))
console.log('dark A', dump(aiView(A, 0, 'dark')))
console.log('dark B', dump(aiView(B, 0, 'dark')))
console.log('krieg A', dump(aiView(A, 0, 'krieg')))
console.log('krieg B', dump(aiView(B, 0, 'krieg')))
// full game start: does chooseMove work with the view?
let s = newGame(V)
const real = s
const Vd = Object.assign(Object.create(V), {})
console.log('start view dark', dump(aiView(s, 0, 'dark')).length)
