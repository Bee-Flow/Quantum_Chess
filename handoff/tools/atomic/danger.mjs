import { V, Q, W } from './proto.mjs'
const T = Q.T
// Proposed generic royalDanger: a capture move counts when the side has no royal piece after it (covers explosions).
function royalDanger2(V, state, side) {
	let best = 0
	for (let e = 0; e < V.sideCount; e++) {
		if (!V.enemies(e, side)) continue
		const acc = new Map()
		for (const { b, w } of state.worlds) {
			for (const m of W.generate(V, b, e).values()) {
				if (m.capture < 0) continue
				const hit = V.royalLoss ? V.royalLoss(b, m, side) : !W.hasRoyal(V, W.applyClassical(V, b, m), side)
				if (hit) acc.set(m.key, (acc.get(m.key) ?? 0) + w)
			}
		}
		for (const w of acc.values()) best = Math.max(best, w / T)
	}
	return best
}
function stateOf(worlds, turn = 0) {
	const total = worlds.reduce((a, [, w]) => a + w, 0)
	let rest = T
	const list = worlds.map(([placement, rel], i) => {
		const b = W.worldFrom(V, placement, { ep: -1, epVictim: -1, castle: [] })
		const w = i === worlds.length - 1 ? rest : Math.floor((T * rel) / total)
		rest -= w
		return { b, w }
	})
	return { v: 1, variant: 'atomic', options: {}, worlds: list, turn, ply: 0, quiet: 0, result: null, history: [] }
}
const s16 = stateOf([[{ e1: '0:k', d2: '0:p', a5: '1:q', e8: '1:k' }, 1]], 1)
console.log('16 white danger', royalDanger2(V, s16, 0))
const s17 = stateOf([
	[{ e1: '0:k', c4: '0:b', a2: '0:p', e8: '1:k', f7: '1:n', a7: '1:p' }, 1],
	[{ e1: '0:k', c4: '0:b', a2: '0:p', e8: '1:k', a6: '1:n', a7: '1:p' }, 1],
])
console.log('17 black danger', royalDanger2(V, s17, 1))
const s6 = stateOf([[{ e4: '0:k', f5: '1:k', a4: '1:r', a2: '0:p' }, 1]], 1)
console.log('6 white danger touching', royalDanger2(V, s6, 0))
// start position after 1.Nf3 a6 2.Ne5: black danger (Nxf7 threat) and white danger
let s = Q.newGame(V)
for (const c of ['g1-f3', 'a7-a6', 'f3-e5']) s = Q.applyOutcome(V, s, c, 0)
console.log('trap black danger', royalDanger2(V, s, 1), 'white', royalDanger2(V, s, 0))
