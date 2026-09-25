import { V, Q, W } from './proto.mjs'
const T = Q.T
const N = (s) => V.topology.names[s]
const at = (n) => V.topology.byName(n)

function stateOf(worlds, turn = 0, x = null) {
	const total = worlds.reduce((a, [, w]) => a + w, 0)
	let rest = T
	const list = worlds.map(([placement, rel], i) => {
		const b = W.worldFrom(V, placement, x ? JSON.parse(JSON.stringify(x)) : { ep: -1, epVictim: -1, castle: [] })
		const w = i === worlds.length - 1 ? rest : Math.floor((T * rel) / total)
		rest -= w
		return { b, w }
	})
	return { v: 1, variant: 'atomic', options: {}, worlds: list, turn, ply: 0, quiet: 0, result: null, history: [] }
}
function show(state) {
	const out = []
	for (const { b, w } of state.worlds) {
		const pcs = []
		for (let id = 0; id < b.sq.length; id++) if (b.sq[id] >= 0) pcs.push((b.sd[id] ? b.ty[id] : b.ty[id].toUpperCase()) + N(b.sq[id]))
		out.push((w / T).toFixed(4) + ' ' + pcs.sort().join(' ') + ' ' + JSON.stringify(b.x.castle?.map((c) => c.flag) ?? []))
	}
	return out.join('\n   ') + '\n   result=' + JSON.stringify(state.result) + ' turn=' + state.turn
}
function outs(state, code) {
	const o = Q.outcomes(V, state, code)
	return o ? o.map((x) => x.key + (x.notes.length ? '[' + x.notes.join(';') + ']' : '') + ' ' + x.p.toFixed(4) + (x.rolled ? ' R' : '')).join(' | ') : 'ILLEGAL'
}
function legal(state) {
	return Q.legalMoves(V, state).map((m) => m.code)
}
function playAll(state, codes) {
	for (const c of codes) {
		const r = Q.branches(V, state, c)
		if (!r) throw new Error('illegal ' + c)
		state = Q.applyOutcome(V, state, c, 0)
	}
	return state
}
const log = (...a) => console.log(...a)

// 1. Opening trap: 1.Nf3 a6 2.Ne5 a5 3.Nxf7 blows up e8
{
	let s = Q.newGame(V)
	log('1 start moves', legal(s).length)
	s = playAll(s, ['g1-f3', 'a7-a6', 'f3-e5', 'a6-a5'])
	log('1 outcomes e5-f7:', outs(s, 'e5-f7'))
	s = playAll(s, ['e5-f7'])
	log('1', show(s))
}
// 1b. Qd2 trap: 1.e4 d5 2.Nf3 dxe4 3.Bb5 Qxd2
{
	let s = Q.newGame(V)
	s = playAll(s, ['e2-e4', 'd7-d5', 'g1-f3', 'd5-e4', 'f1-b5'])
	log('1b outcomes d8-d2:', outs(s, 'd8-d2'))
	s = playAll(s, ['d8-d2'])
	log('1b', show(s))
}
// 2. contrived explosion (lichess test): k7/3bbn2/3rqn2/3qr3/8/7B/8/1K6 w, Bh3xe6
{
	const s = stateOf([[{ a8: '1:k', d7: '1:b', e7: '1:b', f7: '1:n', d6: '1:r', e6: '1:q', f6: '1:n', d5: '1:q', e5: '1:r', h3: '0:b', b1: '0:k' }, 1]])
	log('2 outcomes h3-e6:', outs(s, 'h3-e6'))
	log('2', show(playAll(s, ['h3-e6'])))
}
// 3. pawns survive: rnbqkbnr/1ppppp1p/p5p1/8/8/1P6/PBPPPPPP/RN1QKBNR w, Bb2xh8
{
	let s = Q.newGame(V)
	s = playAll(s, ['b2-b3', 'a7-a6', 'c1-b2', 'g7-g6'])
	log('3 outcomes b2-h8:', outs(s, 'b2-h8'))
	log('3', show(playAll(s, ['b2-h8'])))
}
// 4. king cannot capture; king step onto ghost square rolls
{
	const s = stateOf([[{ e1: '0:k', e2: '1:r', e8: '1:k' }, 1]])
	log('4a legal', legal(s).filter((c) => c.startsWith('e1')).join(' '))
	const g = stateOf([[{ e1: '0:k', e2: '1:n', e8: '1:k' }, 1], [{ e1: '0:k', c3: '1:n', e8: '1:k' }, 1]])
	log('4b outcomes e1-e2:', outs(g, 'e1-e2'))
}
// 5. capture next to own king is illegal; quantum version rolls miss/move
{
	const s = stateOf([[{ g1: '0:k', a2: '0:r', f2: '1:n', e8: '1:k' }, 1]])
	log('5a legal a2-f2?', legal(s).includes('a2-f2'), ' a2-e2?', legal(s).includes('a2-e2'))
	const g = stateOf([[{ g1: '0:k', a2: '0:r', f2: '1:n', e8: '1:k' }, 1], [{ g1: '0:k', a2: '0:r', c5: '1:n', e8: '1:k' }, 1]])
	log('5b outcomes a2-f2:', outs(g, 'a2-f2'))
}
// 6. touching kings: rook cannot capture king
{
	const s = stateOf([[{ e4: '0:k', f5: '1:k', a4: '1:r' }, 1]], 1)
	log('6 legal a4-e4?', legal(s).includes('a4-e4'), 'danger white', Q.royalDanger(V, s, 0))
	const s2 = stateOf([[{ e3: '0:k', f5: '1:k', a3: '1:r' }, 1]], 1)
	log('6b legal a3-e3?', legal(s2).includes('a3-e3'), outs(s2, 'a3-e3'))
}
// 7. en passant explosion centre
{
	const s = stateOf([[{ e1: '0:k', e5: '0:p', e8: '1:k', d7: '1:p', c7: '1:n', c6: '1:p', e6: '1:q', f7: '1:b', a8: '1:r' }, 1]], 1)
	let t = playAll(s, ['d7-d5'])
	log('7 ep outcomes e5-d6:', outs(t, 'e5-d6'))
	log('7', show(playAll(t, ['e5-d6'])))
}
// 8. exploded rook loses castling
{
	const x = { ep: -1, epVictim: -1, castle: null }
	const s0 = W.worldFrom(V, { e1: '0:k', a1: '0:r', h1: '0:r', a2: '0:p', e8: '1:k', a8: '1:r' }, {})
	const { castlingRights } = await import('/home/user/Quantum_Chess/src/variants/core/orthodox.js')
	const castle = castlingRights(V, s0)
	const s = stateOf([[{ e1: '0:k', a1: '0:r', h1: '0:r', a2: '0:p', e8: '1:k', a8: '1:r' }, 1]], 1, { ep: -1, epVictim: -1, castle })
	log('8 outcomes a8-a2:', outs(s, 'a8-a2'))
	const t = playAll(s, ['a8-a2'])
	log('8', show(t), 'white castling', legal(t).filter((c) => c.startsWith('O')))
}
// 9. ghost in the blast radius: black knight 50% d6 / 50% h6, white rook e1 takes pawn e5
{
	const s = stateOf([
		[{ a1: '0:k', e1: '0:r', e5: '1:p', h8: '1:k', d6: '1:n' }, 1],
		[{ a1: '0:k', e1: '0:r', e5: '1:p', h8: '1:k', h6: '1:n' }, 1],
	])
	log('9 outcomes e1-e5:', outs(s, 'e1-e5'), 'budget b', Q.budget(s, 1))
	const t = playAll(s, ['e1-e5'])
	const kn = t.worlds[0].b.ty.indexOf('n')
	log('9', show(t), 'knight locs', JSON.stringify(Q.pieceLocations(t, kn).map((l) => [l.sq < 0 ? l.sq : N(l.sq), l.p])), 'budget b', Q.budget(t, 1), 'budget w', Q.budget(t, 0))
	// black measures its knight
	log('9 measure outcomes ?h6:', outs(t, '?h6'))
}
// 10. land = roll: bishop onto ghost knight
{
	const s = stateOf([
		[{ a1: '0:k', b2: '0:b', e5: '1:n', h8: '1:k', f6: '1:r' }, 1],
		[{ a1: '0:k', b2: '0:b', a6: '1:n', h8: '1:k', f6: '1:r' }, 1],
	])
	log('10 outcomes b2-e5:', outs(s, 'b2-e5'))
	log('10 capture branch', show(Q.applyOutcome(V, s, 'b2-e5', 1)))
}
// 11. converging capture next to the king: certain win; single part: 50%
{
	const s = stateOf([
		[{ e1: '0:k', d5: '0:n', e7: '1:k', f6: '1:b' }, 1],
		[{ e1: '0:k', h5: '0:n', e7: '1:k', f6: '1:b' }, 1],
	])
	log('11 merges', legal(s).filter((c) => c.includes('|')).join(' '))
	log('11 outcomes d5|h5-f6:', outs(s, 'd5|h5-f6'))
	log('11 outcomes d5-f6:', outs(s, 'd5-f6'))
	log('11 outcomes h5-f6:', outs(s, 'h5-f6'))
}
// 12. bare kings: classical and quantum game-end roll
{
	const s = stateOf([[{ e1: '0:k', a1: '0:r', h8: '1:k', b1: '1:n' }, 1]])
	log('12a outcomes a1-b1:', outs(s, 'a1-b1'))
	const g = stateOf([
		[{ h1: '0:k', e2: '0:r', a8: '1:k', e5: '1:b', d6: '1:n' }, 1],
		[{ h1: '0:k', e2: '0:r', a8: '1:k', e5: '1:b', b1: '1:n' }, 1],
	])
	log('12b outcomes e2-e5:', outs(g, 'e2-e5'))
}
// 13. promotion capture explodes the new queen and the king next to it
{
	const s = stateOf([[{ a1: '0:k', g7: '0:p', h8: '1:r', g8: '1:k' }, 1]])
	log('13 legal', legal(s).filter((c) => c.startsWith('g7')).join(' '))
	log('13 outcomes g7-h8=q:', outs(s, 'g7-h8=q'))
	const s2 = stateOf([[{ a1: '0:k', g7: '0:p', h8: '1:r', e8: '1:k', f8: '1:b' }, 1]])
	log('13b', show(playAll(s2, ['g7-h8=q'])))
}
// 14. ghost capturer: knight 50% c3 / 50% g1 takes solid pawn d5 next to black queen
{
	const s = stateOf([
		[{ e1: '0:k', c3: '0:n', d5: '1:p', d6: '1:q', e8: '1:k' }, 1],
		[{ e1: '0:k', g1: '0:n', d5: '1:p', d6: '1:q', e8: '1:k' }, 1],
	])
	log('14 outcomes c3-d5:', outs(s, 'c3-d5'))
}
// 15. own ghost part in radius
{
	const s = stateOf([
		[{ a1: '0:k', e1: '0:r', d4: '0:n', e5: '1:p', h8: '1:k' }, 1],
		[{ a1: '0:k', e1: '0:r', h4: '0:n', e5: '1:p', h8: '1:k' }, 1],
	])
	log('15 outcomes e1-e5:', outs(s, 'e1-e5'), 'budget w before', Q.budget(s, 0))
	const t = playAll(s, ['e1-e5'])
	log('15', show(t), 'budget w', Q.budget(t, 0))
}
// 16. danger ring: queen threatens to take a pawn next to the king
{
	const s = stateOf([[{ e1: '0:k', d2: '0:p', a5: '1:q', e8: '1:k' }, 1]], 1)
	log('16 danger white (core)', Q.royalDanger(V, s, 0), 'a5-d2', outs(s, 'a5-d2'))
}
