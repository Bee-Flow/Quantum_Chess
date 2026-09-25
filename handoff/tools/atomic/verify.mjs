import { V, Q, W } from './proto.mjs'
const T = Q.T
const N = (s) => V.topology.names[s]
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
function show(state) {
	return state.worlds.map(({ b, w }) => {
		const pcs = []
		for (let id = 0; id < b.sq.length; id++) if (b.sq[id] >= 0) pcs.push((b.sd[id] ? b.ty[id] : b.ty[id].toUpperCase()) + N(b.sq[id]))
		return (w / T).toFixed(3) + ' ' + pcs.sort().join(' ')
	}).join(' || ') + ' result=' + JSON.stringify(state.result)
}
const s7 = stateOf([[{ e3: '0:k', a2: '0:p', f5: '1:k', a3: '1:r' }, 1]], 1)
console.log('T7b', show(Q.applyOutcome(V, s7, 'a3-e3', 0)))
const s11 = stateOf([[{ e1: '0:k', d5: '0:n', e7: '1:k', f6: '1:b' }, 1], [{ e1: '0:k', h5: '0:n', e7: '1:k', f6: '1:b' }, 1]])
console.log('T11', show(Q.applyOutcome(V, s11, 'd5|h5-f6', 0)))
const s15 = stateOf([[{ e1: '0:k', c4: '0:b', a2: '0:p', e8: '1:k', f7: '1:n', a7: '1:p' }, 1], [{ e1: '0:k', c4: '0:b', a2: '0:p', e8: '1:k', a6: '1:n', a7: '1:p' }, 1]])
console.log('T15b move', show(Q.applyOutcome(V, s15, 'c4-f7', 0)))
console.log('T15b cap', show(Q.applyOutcome(V, s15, 'c4-f7', 1)))
const s16 = stateOf([[{ e1: '0:k', a1: '0:r', a8: '1:r', b8: '1:n', h8: '1:k', h7: '1:p', a4: '1:b' }, 1], [{ e1: '0:k', a1: '0:r', a8: '1:r', b8: '1:n', h8: '1:k', h7: '1:p', d4: '1:b' }, 1]])
console.log('T16 miss', show(Q.applyOutcome(V, s16, 'a1-a8', 0)))
console.log('T16 cap', show(Q.applyOutcome(V, s16, 'a1-a8', 1)))
const s15a = stateOf([[{ e1: '0:k', d2: '0:p', a5: '1:q', e8: '1:k' }, 1]], 1)
console.log('T15a', show(Q.applyOutcome(V, s15a, 'a5-d2', 0)))
const s6 = stateOf([[{ g1: '0:k', a2: '0:r', f2: '1:n', e8: '1:k' }, 1], [{ g1: '0:k', a2: '0:r', c5: '1:n', e8: '1:k' }, 1]])
console.log('T6b miss', show(Q.applyOutcome(V, s6, 'a2-f2', 0)))
// T2 intermediate after d5-e4
let s = Q.newGame(V)
for (const c of ['e2-e4', 'd7-d5', 'g1-f3', 'd5-e4']) s = Q.applyOutcome(V, s, c, 0)
console.log('T2 mid', show(s))
