import { V, Q, W } from './proto.mjs'
const { chooseMove } = await import('/home/user/Quantum_Chess/src/variants/core/ai.js')
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
	const out = []
	for (const { b, w } of state.worlds) {
		const pcs = []
		for (let id = 0; id < b.sq.length; id++) if (b.sq[id] >= 0) pcs.push((b.sd[id] ? b.ty[id] : b.ty[id].toUpperCase()) + N(b.sq[id]))
		out.push((w / T).toFixed(4) + ' ' + pcs.sort().join(' '))
	}
	return out.join('\n   ') + '\n   result=' + JSON.stringify(state.result) + ' turn=' + state.turn
}
function outs(state, code) {
	const o = Q.outcomes(V, state, code)
	return o ? o.map((x) => x.key + (x.notes.length ? '[' + x.notes.join(';') + ']' : '') + ' ' + x.p.toFixed(4) + (x.rolled ? ' R' : '')).join(' | ') : 'ILLEGAL'
}
const log = (...a) => console.log(...a)
// 2 with pawn
{
	const s = stateOf([[{ a8: '1:k', d7: '1:b', e7: '1:b', f7: '1:n', d6: '1:r', e6: '1:q', f6: '1:n', d5: '1:q', e5: '1:r', h3: '0:b', b1: '0:k', a2: '0:p' }, 1]])
	log('2', outs(s, 'h3-e6'), show(Q.applyOutcome(V, s, 'h3-e6', 0)))
}
// 9 with pawns
{
	const s = stateOf([
		[{ a1: '0:k', a2: '0:p', e1: '0:r', e5: '1:p', h8: '1:k', h7: '1:p', d6: '1:n' }, 1],
		[{ a1: '0:k', a2: '0:p', e1: '0:r', e5: '1:p', h8: '1:k', h7: '1:p', h6: '1:n' }, 1],
	])
	log('9 outcomes e1-e5:', outs(s, 'e1-e5'), 'budget b', Q.budget(s, 1))
	const t = Q.applyOutcome(V, s, 'e1-e5', 0)
	const kn = t.worlds[0].b.ty.indexOf('n')
	log('9', show(t), 'knight locs', JSON.stringify(Q.pieceLocations(t, kn).map((l) => [l.sq < 0 ? l.sq : N(l.sq), l.p])), 'budget b', Q.budget(t, 1), 'budget w', Q.budget(t, 0))
	log('9 legal black', Q.legalMoves(V, t).map((m) => m.code).join(' '))
	log('9 measure ?h6:', outs(t, '?h6'))
	log('9 h6-f5:', outs(t, 'h6-f5'))
}
// 10 with pawns
{
	const s = stateOf([
		[{ a1: '0:k', a2: '0:p', b2: '0:b', e5: '1:n', h8: '1:k', h7: '1:p', f6: '1:r' }, 1],
		[{ a1: '0:k', a2: '0:p', b2: '0:b', a6: '1:n', h8: '1:k', h7: '1:p', f6: '1:r' }, 1],
	])
	log('10 outcomes b2-e5:', outs(s, 'b2-e5'))
	log('10 capture', show(Q.applyOutcome(V, s, 'b2-e5', 1)))
	log('10 move', show(Q.applyOutcome(V, s, 'b2-e5', 0)))
}
// 15 own ghost with pawns
{
	const s = stateOf([
		[{ a1: '0:k', a2: '0:p', e1: '0:r', d4: '0:n', e5: '1:p', h8: '1:k', h7: '1:p' }, 1],
		[{ a1: '0:k', a2: '0:p', e1: '0:r', h4: '0:n', e5: '1:p', h8: '1:k', h7: '1:p' }, 1],
	])
	log('15 outcomes e1-e5:', outs(s, 'e1-e5'), 'budget w before', Q.budget(s, 0))
	const t = Q.applyOutcome(V, s, 'e1-e5', 0)
	log('15', show(t), 'budget w', Q.budget(t, 0))
}
// 17 ghost next to king: bishop hits f7 part
{
	const s = stateOf([
		[{ e1: '0:k', c4: '0:b', a2: '0:p', e8: '1:k', f7: '1:n', a7: '1:p' }, 1],
		[{ e1: '0:k', c4: '0:b', a2: '0:p', e8: '1:k', a6: '1:n', a7: '1:p' }, 1],
	])
	log('17 outcomes c4-f7:', outs(s, 'c4-f7'))
	log('17 danger black', Q.royalDanger(V, s, 1))
}
// 13 result
{
	const s = stateOf([[{ a1: '0:k', g7: '0:p', h8: '1:r', g8: '1:k' }, 1]])
	log('13', show(Q.applyOutcome(V, s, 'g7-h8=q', 0)))
}
// 18 slider blocked by ghost then capture
{
	const s = stateOf([
		[{ e1: '0:k', a1: '0:r', a8: '1:r', b8: '1:n', h8: '1:k', h7: '1:p', a4: '1:b' }, 1],
		[{ e1: '0:k', a1: '0:r', a8: '1:r', b8: '1:n', h8: '1:k', h7: '1:p', d4: '1:b' }, 1],
	])
	log('18 outcomes a1-a8:', outs(s, 'a1-a8'))
}
// AI: finds Nxf7
{
	let s = Q.newGame(V)
	for (const c of ['g1-f3', 'a7-a6', 'f3-e5', 'a6-a5']) s = Q.applyOutcome(V, s, c, 0)
	for (const level of ['easy', 'normal']) {
		const m = await chooseMove(V, s, { level, rng: () => 0.5 })
		log('AI', level, JSON.stringify(m?.code ?? m))
	}
	// Black to move after 1.Nf3: does the AI defend f7?
	let s2 = Q.applyOutcome(V, Q.newGame(V), 'g1-f3', 0)
	const m2 = await chooseMove(V, s2, { level: 'normal', rng: () => 0.5 })
	log('AI black after Nf3', JSON.stringify(m2?.code ?? m2))
}
// random game fuzz: 30 games of 80 plies
{
	let seed = 1
	const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
	let ends = {}
	let maxW = 0
	const t0 = Date.now()
	for (let g = 0; g < 30; g++) {
		let s = Q.newGame(V)
		for (let p = 0; p < 120 && !s.result; p++) {
			const moves = Q.legalMoves(V, s, { splits: rng() < 0.3 })
			const m = moves[Math.floor(rng() * moves.length)]
			const r = Q.applyMove(V, s, m.code, rng)
			s = r.state
			maxW = Math.max(maxW, s.worlds.length)
			if (Q.budget(s, 0) > 8 || Q.budget(s, 1) > 8) throw new Error('budget')
			for (const { b } of s.worlds) {
				const ks = b.ty.map((t, i) => (t === 'k' && b.sq[i] >= 0 ? b.sd[i] : -1)).filter((x) => x >= 0)
				if (!s.result && ks.length !== 2) throw new Error('king missing while running')
			}
		}
		const k = s.result ? s.result.reason + ':' + s.result.winner : 'running'
		ends[k] = (ends[k] ?? 0) + 1
	}
	log('fuzz', JSON.stringify(ends), 'maxWorlds', maxW, 'ms', Date.now() - t0)
}
