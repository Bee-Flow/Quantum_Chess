// The test scenarios of multiverse-final.md section 10, run against the final prototype. node scenf.mjs
// Prints one line per check: "ok" or "FAIL" with got / want.
import { V, P, Q, play, invariants, stateOfWorlds, show } from './libf-fix6.mjs'
import { layoutOf } from '../../tmp/mv-final/layoutf.mjs'
import { chooseMove } from '../../tmp/mv-final/core/ai.mjs'
import { seeded } from './libf-fix6.mjs'

let failed = 0
let passed = 0
const eq = (name, got, want) => {
	const g = JSON.stringify(got)
	const w = JSON.stringify(want)
	if (g !== w) {
		failed++
		console.log('FAIL ' + name + '\n   got  ' + g + '\n   want ' + w)
	} else {
		passed++
		if (process.env.VERBOSE) console.log('ok   ' + name + ' = ' + g)
	}
}
const keys = (s) => Q.ordinaryMoves(V, s).map((m) => m.code)
const oc = (s, code) => (Q.outcomes(V, s, code) ?? []).map((o) => o.key + ' ' + Math.round(o.p * 100) + (o.rolled ? '' : ' certain'))
const legal = (s, code) => Q.isLegal(V, s, code)
const X = (s) => s.worlds[0].b.x
const loc = (s, id) => Q.pieceLocations(s, id).map((l) => (l.sq >= 0 ? V.topology.names[l.sq] : 'off') + ' ' + Math.round(l.p * 100))
const sq = (name) => V.topology.byName(name)
const U = (l) => P.uOf(l, 0)
const idAt = (w, name) => w.board[sq(name)]
// give the piece on square q the id `id` (one ghost with the same id in several worlds)
const setId = (w, q, id) => {
	const old = w.board[q]
	const [t, d] = [w.ty[old], w.sd[old]]
	w.sq[old] = -1
	w.ty[old] = ''
	w.sd[old] = 0
	P.place(w, id, q, t, d)
}
const start = (setup = 'small', o = {}) => Q.newGame(V, { setup, timelines: '3', reach: 'auto', ...o })
const run = (s, codes) => {
	for (const c of codes) {
		const [code, i] = Array.isArray(c) ? c : [c, 0]
		s = play(s, code, i)
		invariants(s)
	}
	return s
}
const one = (w, turn = w.x.s) => stateOfWorlds([[w, 1]], turn)
const bw = (o) => P.buildWorld(o)

// ================================================================ structure and classical rules
{ // S1 start
	const s = start()
	eq('S1 keys', keys(s), ['(0T1)d1-e3', '(0T1)d1-c3', '(0T1)a2-a3', '(0T1)b2-b3', '(0T1)c2-c3', '(0T1)d2-d3', '(0T1)e2-e3'])
	eq('S1 splits', Q.splitsFrom(V, s, sq('(0)d1')).map((m) => m.code), ['(0)d1-(0)c3|(0)e3'])
	eq('S1 submit', legal(s, 'submit'), false)
	eq('S1 limits', [X(s).h, X(s).m, Q.budgetInfo(V, s, 0).limit], [4, 3, 8])
	eq('S1 standard reach', [X(start('standard')).h, keys(start('standard')).length], [8, 20])
}
{ // S2 a move makes a board; S3 branch; S4 optional boards and Submit
	let s = run(start(), ['(0T1)d1-c3'])
	eq('S2 turn / row / history', [s.turn, X(s).tl[0], Q.squareView(s, sq('(0)~3d1')).map((o) => o.type)], [1, [2, 3, null, null], ['hn']])
	s = run(s, ['(0T1)a4-a3'])
	eq('S3 branch keys', keys(s).filter((k) => k.includes('>>')).sort(), ['(0T2)c3>>(0T1)a3', '(0T2)c3>>(0T1)c5', '(0T2)c3>>(0T1)e3'])
	const knight = idAt(s.worlds[0].b, '(0)c3')
	s = run(s, ['(0T2)c3>>(0T1)a3'])
	eq('S3 rows', [X(s).tl[U(0)], X(s).tl[U(1)], X(s).c], [[2, 5, null, null], [3, 3, 0, 2], [1, 0]])
	eq('S3 traveller / past self', [loc(s, knight), Q.squareView(s, sq('(+1)d1')).map((o) => o.type)], [['(+1)a3 100'], ['n']])
	eq('S3 turn / must move', [s.turn, P.mandatory(X(s)).map((u) => P.lOf(u)), legal(s, 'submit')], [1, [1], false])
	s = run(s, ['(+1T1)e4-e3'])
	eq('S4 optional left, submit', [s.turn, P.mandatory(X(s)).map((u) => P.lOf(u)), legal(s, 'submit')], [1, [], true])
	s = run(s, ['submit'])
	eq('S4 after submit', [s.turn, P.mandatory(X(s)).map((u) => P.lOf(u))], [0, [1]])
	s = run(s, ['(+1T2)b2-b3'])
	eq('S4 turn passes by itself', [s.turn, legal(s, 'submit')], [1, false])
}
{ // S5 one hop clears two boards
	const b = bw({ s: 0, c: [1, 0], rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/R4/5/K4' } }, 1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/5/5/5/K4' } } } })
	let s = one(b)
	eq('S5 must move', P.mandatory(X(s)).map((u) => P.lOf(u)), [0, 1])
	eq('S5 hop certain', oc(s, '(0T5)a3>(+1T5)a3'), ['move 100 certain'])
	s = run(s, ['(0T5)a3>(+1T5)a3'])
	eq('S5 both boards used', [X(s).tl[U(0)][1], X(s).tl[U(1)][1], s.turn], [11, 11, 1])
}
{ // S6 an active branch moves the present back; S7 an inactive one does not; S8 the cap
	const mk = (c, other) => bw({ s: 0, c, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/K3R', 8: '4k/5/5/5/K4' } }, ...other } })
	let s = one(mk([0, 1], { '-1': { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/5/5/5/K4' } } }))
	eq('S6 must move before', P.mandatory(X(s)).map((u) => P.lOf(u)), [0, -1])
	s = run(s, ['(0T5)e1>>(0T4)e1'])
	eq('S6 present back', [X(s).tl[U(1)], P.skeleton(X(s)).present, s.turn, legal(s, 'submit'), P.mandatory(X(s))], [[9, 9, 0, 8], 9, 0, true, []])
	s = one(mk([1, 0], { 1: { st: 7, en: 10, parent: [0, 6], boards: { 10: '4k/5/5/5/K4' } } }))
	s = run(s, ['(0T5)e1>>(0T4)e1'])
	eq('S7 inactive +2', [X(s).tl[U(2)], P.skeleton(X(s)).act(U(2)), P.skeleton(X(s)).present, legal(s, 'submit'), P.mandatory(X(s)).map((u) => P.lOf(u))], [[9, 9, 0, 8], false, 10, false, [1]])
	const capped = bw({ m: 1, s: 0, c: [1, 0], rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/K3R', 8: '4k/5/5/5/K4', 6: '5/5/5/5/K3k' } }, 1: { st: 7, en: 10, parent: [0, 6], boards: { 10: '4k/5/5/5/K4' } } } })
	s = one(capped)
	eq('S8 only the king capture travels back', keys(s).filter((k) => k.includes('>>')), ['(0T5)e1>>(0T3)e1'])
	s = run(s, ['(0T5)e1>>(0T3)e1'])
	eq('S8 king captured, no row opens', [s.result, X(s).c, X(s).tl.filter(Boolean).length], [{ winner: 0, reason: 'king' }, [1, 0], 2])
}
{ // S9 a king in the past; S10 the reach; S11 own past self blocks
	const b = bw({ s: 0, rows: { 0: { st: 6, en: 10, boards: { 10: '3k1/5/4N/5/K4', 8: '4k/5/5/5/K4', 6: '4k/5/5/5/K4' } } } })
	let s = one(b)
	eq('S9 danger for Black', Q.royalDanger(V, s, 1), 1)
	eq('S9 certain capture', oc(s, '(0T5)e3>>(0T4)e5'), ['capture 100 certain'])
	s = run(s, ['(0T5)e3>>(0T4)e5'])
	eq('S9 result', s.result, { winner: 0, reason: 'king' })
	const r = (h) => one(bw({ h, s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/4R/5/K4' } } } }))
	eq('S10 reach 2', keys(r(4)).filter((k) => k.startsWith('(0T5)e3>>(0T')), ['(0T5)e3>>(0T4)e3', '(0T5)e3>>(0T3)e3'])
	eq('S10 reach 4', keys(r(8)).filter((k) => k.startsWith('(0T5)e3>>(0T')), ['(0T5)e3>>(0T4)e3', '(0T5)e3>>(0T3)e3', '(0T5)e3>>(0T2)e3', '(0T5)e3>>(0T1)e3'])
	s = one(bw({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/R3K', 8: '4k/5/5/5/R3K', 6: '4k/5/5/5/R3K' } } } }))
	eq('S11 own past self blocks', keys(s).filter((k) => k.startsWith('(0T5)a1>>')), [])
}
{ // S12 pawn directions and the T-L capture
	const b = bw({ s: 0, c: [0, 1], rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/5/2P2/K4' } }, '-1': { st: 7, en: 10, parent: [0, 6], boards: { 10: '4k/5/5/5/K4', 8: '4k/5/5/2n2/K4' } } } })
	const s = one(b)
	eq('S12 pawn keys', keys(s).filter((k) => k.startsWith('(0T5)c2')).sort(), ['(0T5)c2-c3', '(0T5)c2>(−1T5)c2', '(0T5)c2>>(−1T4)c2'])
	eq('S12 T-L capture certain', oc(s, '(0T5)c2>>(−1T4)c2'), ['capture 100 certain'])
}
{ // S13 double step and en passant; S14 promotion; S15 castling
	let s = one(bw({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/3p*1/5/2P*2/K4' } } } }))
	s = run(s, ['(0T5)c2-c4'])
	const ep = Q.ordinaryMoves(V, s).find((m) => m.code === '(0T5)d4-c3')
	eq('S13 en passant', [ep?.kind, oc(s, '(0T5)d4-c3')], ['ep', ['capture 100 certain']])
	s = run(s, ['(0T5)d4-c3'])
	eq('S13 victim gone', Q.squareView(s, sq('(0)c4')).length, 0)
	s = one(bw({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/1P3/5/5/K4' } } } }))
	eq('S14 promotion key', keys(s).filter((k) => k.startsWith('(0T5)b4')), ['(0T5)b4-b5=Q'])
	eq('S14 queen', Q.squareView(run(s, ['(0T5)b4-b5=Q']), sq('(0)b5')).map((o) => o.type), ['q'])
	s = run(one(bw({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: 'k4/5/5/5/K*3R*' } } } })), ['(0T5)a1-c1'])
	eq('S15 castling', [Q.squareView(s, sq('(0)c1')).map((o) => o.type), Q.squareView(s, sq('(0)b1')).map((o) => o.type)], [['k'], ['r']])
}
{ // S16 unicorns and dragons never move on their own board; S17 brawn captures
	eq('S16 just unicorns', keys(start('justunicorns')), ['(0T1)a1-a2', '(0T1)a1-b2'])
	eq('S16 just dragons', keys(start('justdragons')), ['(0T1)a1-a2', '(0T1)a1-b2'])
	let s = run(start('justunicorns'), ['(0T1)a1-a2', '(0T1)e5-e4'])
	eq('S16 unicorns travel', keys(s).filter((k) => /b1|d1/.test(k.slice(5, 7))).sort(), ['(0T2)b1>>(0T1)a2', '(0T2)b1>>(0T1)c2', '(0T2)d1>>(0T1)c2', '(0T2)d1>>(0T1)e2'])
	const b = bw({ md: 2, s: 0, rows: { '-1': { st: 2, en: 2, boards: { 2: '4k/5/2p2/1p1p1/K4' } }, 0: { st: 2, en: 2, boards: { 2: '4k/5/5/2W*2/K4' } }, 1: { st: 2, en: 2, boards: { 2: '4k/5/5/5/K4' } } } })
	s = one(b)
	eq('S17 brawn keys', keys(s).filter((k) => k.startsWith('(0T1)c2')).sort(), ['(0T1)c2-c3', '(0T1)c2-c4', '(0T1)c2>(−1T1)b2', '(0T1)c2>(−1T1)c2', '(0T1)c2>(−1T1)c3', '(0T1)c2>(−1T1)d2'])
}
{ // S18 even start (Two Timelines): labels −0 / +0, one hop clears two boards; S19 Turn Zero
	let s = start('twotimelines')
	eq('S18 rows and must move', [P.mandatory(X(s)).map((u) => P.LAB[u]), keys(s).length], [['−0', '+0'], 44])
	eq('S18 hops', keys(s).filter((k) => k.includes('>')).sort(), ['(+0T1)b1>(−0T1)b3', '(+0T1)g1>(−0T1)g3', '(−0T1)b1>(+0T1)b3', '(−0T1)g1>(+0T1)g3'])
	s = run(s, ['(−0T1)b1>(+0T1)b3'])
	eq('S18 hop ends the turn', [s.turn, X(s).tl[P.uOf(-1, 1)][1], X(s).tl[P.uOf(0, 1)][1]], [1, 3, 3])
	s = run(start('turnzero'), ['(0T1)g1-f3'])
	eq('S19 Black may travel to T0', keys(s).filter((k) => k.includes('(0T0)')).sort(), ['(0T1)b8>>(0T0)b6', '(0T1)g8>>(0T0)g6'])
}
{ // S20 royal types (Reversed Royalty: the queen is royal, the king is a common king)
	eq('S20 royal / solid', [[...V.royalTypes].filter((t) => t[0] !== 'h').sort(), [...V.solidTypes].filter((t) => t[0] !== 'h').sort()], [['k', 'k0', 'y'], ['c', 'k', 'k0', 'p', 'p0', 'w', 'w0', 'y']])
	const b = (fen) => one(bw({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: fen } } } }))
	eq('S20 capturing the common king goes on', run(b('yc3/5/2N2/5/YC3'), ['(0T5)c3-b5']).result, null)
	eq('S20 capturing the royal queen wins', run(b('yc3/5/1N3/5/YC3'), ['(0T5)b3-a5']).result, { winner: 0, reason: 'king' })
}

// ================================================================ quantum
const s1 = () => run(start(), ['(0)d1-(0)c3|(0)e3'])
{ // Q1 split; Q2 a ghost travels (link); Q3 a probe on the new timeline
	let s = s1()
	eq('Q1 split', [s.worlds.length, s.worlds.map((e) => e.w), Q.budget(s, 0), X(s).tl[0], s.turn], [2, [8388608, 8388608], 2, [2, 3, null, null], 1])
	s = run(s, ['(0T1)a4-a3'])
	const knight = idAt(s.worlds.find(({ b }) => b.board[sq('(0)c3')] >= 0).b, '(0)c3')
	eq('Q2 link', oc(s, '(0T2)c3>>(0T1)e3'), ['move 100 certain'])
	s = run(s, ['(0T2)c3>>(0T1)e3'])
	eq('Q2 knight on two timelines', [loc(s, knight), s.worlds.map(({ b }) => b.x.tl[U(1)]), Q.budget(s, 0)], [['(0)e3 50', '(+1)e3 50'], [[3, 3, 0, 2], [3, 3, 0, 2]], 2])
	eq('Q3 probe', oc(s, '(+1T1)e4-e3'), ['miss 50', 'move 50'])
	const miss = run(s, [['(+1T1)e4-e3', 0]])
	eq('Q3 missed: board used', [miss.worlds.length, loc(miss, knight), X(miss).tl[U(1)], miss.turn, legal(miss, 'submit')], [1, ['(+1)e3 100'], [3, 4, 0, 2], 1, true])
}
const e2state = () => {
	// two worlds; a Black knight ghost went c3 -> b1 (A) or c3 -> d1 (B) at T3 ●; White: king e3, bishop a1
	const mk = (h) => bw({ s: 0, rows: { 0: { st: 6, en: 10, boards: { 10: '3k1/5/4K/5/B' + h, 8: '4k/5/5/4K/B' + h, 6: '4k/5/2n2/4K/B4' } } } })
	const A = mk('n3')
	const B = mk('2n1')
	const knightId = idAt(A, '(0)b1')
	setId(B, sq('(0)d1'), knightId)
	// history cells keep their own ids; make the T4 history cells of A and B belong to one history id each
	return stateOfWorlds([[A, 1], [B, 1]])
}
{ // Q4 pass = link through the past (a past shield); Q5 land = roll in the past (shoot the past)
	let s = e2state()
	eq('Q4 link through the past', oc(s, '(0T5)a1>>(0T3)c1'), ['move 100 certain'])
	const bishop = idAt(s.worlds[0].b, '(0)a1')
	const n4 = run(s, ['(0T5)a1>>(0T3)c1'])
	eq('Q4 bishop on two timelines', [loc(n4, bishop), Q.budget(n4, 0), Q.budget(n4, 1)], [['(0)a1 50', '(+1)c1 50'], 2, 2])
	eq('Q5 shoot the past', oc(s, '(0T5)a1>>(0T4)b1'), ['move 50', 'capture 50'])
	const hit = run(s, [['(0T5)a1>>(0T4)b1', 1]])
	eq('Q5 captured: the knight is known now', [hit.worlds.length, Q.squareView(hit, sq('(0)b1')).map((o) => o.type + ' ' + o.p)], [1, ['n 1']])
	eq('Q18 one skeleton after every action', new Set(n4.worlds.map(({ b }) => P.solidExtra(b))).size, 1)
}
{ // Q6 time split; Q7 two boards illegal; Q8 jump split; Q9 merge on another timeline, parts on two boards
	let s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3'])
	const knight = idAt(s.worlds[0].b, '(0)c3')
	eq('Q6 time split targets', Q.splitTargets(V, s, sq('(0)c3')).map((q) => V.topology.names[q]), ['(0)d1', '(0)a4', '(0)~3a3', '(0)~3e3'])
	eq('Q6 time split certain', oc(s, '(0)c3-(0)~3a3|(0)~3e3'), ['split 100 certain'])
	const ts = run(s, ['(0)c3-(0)~3a3|(0)~3e3'])
	eq('Q6 one new timeline, the piece on two squares', [ts.worlds.length, loc(ts, knight), X(ts).tl[U(1)], X(ts).c, ts.turn], [2, ['(+1)a3 50', '(+1)e3 50'], [3, 3, 0, 2], [1, 0], 1])
	eq('Q7 halves on two boards', legal(s, '(0)c3-(0)a4|(0)~3e3'), false)
	const j = bw({ s: 0, c: [1, 0], rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/2N2/5/K4' } }, 1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/5/5/5/K4' } } } })
	let js = one(j)
	const jn = idAt(j, '(0)c3')
	eq('Q8 jump split', oc(js, '(0)c3-(+1)a3|(+1)e3'), ['split 100 certain'])
	js = run(js, ['(0)c3-(+1)a3|(+1)e3'])
	eq('Q8 after', [loc(js, jn), X(js).tl[U(0)][1], X(js).tl[U(1)][1], js.turn], [['(+1)a3 50', '(+1)e3 50'], 11, 11, 1])
	js = run(js, ['(0T5)e5-d5', '(+1T5)e5-d5'])
	eq('Q9 merge on the other timeline', oc(js, '(+1)a3|(+1)e3-(+1)c4'), ['move 100 certain'])
	const mg = run(js, ['(+1)a3|(+1)e3-(+1)c4'])
	eq('Q9 merged, the past remembers', [loc(mg, jn), mg.worlds.length, Q.budget(mg, 0)], [['(+1)c4 100'], 2, 2])
	let two = run(s1(), ['(0T1)a4-a3', '(0T2)c3>>(0T1)e3', '(+1T1)b4-b3', 'submit'])
	eq('Q9 no merge across two boards', Q.legalMoves(V, two).filter((m) => m.type === 'merge').length, 0)
}
{ // Q10 which-path memory (reach 2: the split boards leave the window after 4 advances)
	let s = run(s1(), ['(0T1)a4-a3', '(0)c3|(0)e3-(0)d1'])
	eq('Q10 merged but remembered', [s.worlds.length, Q.budget(s, 0), s.history.at(-1).info.memory], [2, 2, [0, 4]])
	s = run(s, ['(0T2)b4-b3', '(0T3)e2-e3', '(0T3)c4-c3'])
	eq('Q10 still remembered', [s.worlds.length, Q.budget(s, 0), X(s).tl[0][1]], [2, 2, 8])
	s = run(s, ['(0T4)d1-c3'])
	eq('Q10 forgotten', [s.worlds.length, Q.budget(s, 0), X(s).tl[0][1]], [1, 1, 9])
}
{ // Q11 measuring uses the board; Q12 only a part on a board you may play
	let s = run(s1(), ['(0T1)a4-a3'])
	eq('Q11 measure outcomes', oc(s, '?(0)c3'), ['(0)c3 50', '(0)e3 50'])
	eq('Q11 both parts listed', Q.legalMoves(V, s).filter((m) => m.type === 'measure').map((m) => m.code), ['?(0)c3', '?(0)e3'])
	const m = run(s, [['?(0)c3', 0]])
	eq('Q11 after', [m.worlds.length, X(m).tl[0][1], m.turn], [1, 5, 1])
	const t = run(s1(), ['(0T1)a4-a3', '(0T2)c3>>(0T1)e3', '(+1T1)b4-b3', 'submit'])
	eq('Q12 only the part on a board you may play', [t.turn, P.mandatory(X(t)).map((u) => P.lOf(u)), legal(t, '?(0)e3'), legal(t, '?(+1)e3'), Q.legalMoves(V, t).filter((x) => x.type === 'measure').map((x) => x.code)], [0, [1], false, true, ['?(+1)e3']])
}
{ // Q13 twins and a measurement across timelines
	let s = run(s1(), ['(0T1)a4-a3', '(0T2)b2-b3', '(0T2)d5>>(0T1)d3'])
	const w0 = s.worlds[0].b
	eq('Q13 twins', [X(s).tl[U(-1)], Q.squareView(s, sq('(−1)c3')).map((o) => o.type + ' ' + o.p), Q.squareView(s, sq('(−1)e3')).map((o) => o.type + ' ' + o.p), Q.budget(s, 0), P.mandatory(X(s)).map((u) => P.lOf(u))], [[4, 4, 0, 3], ['n 0.5'], ['n 0.5'], 2, [-1]])
	eq('Q13 measure the twin', oc(s, '?(−1)c3'), ['gone 50', '(−1)c3 50'])
	const m = run(s, [['?(−1)c3', 1]])
	eq('Q13 the original is settled', [m.worlds.length, Q.squareView(m, sq('(0)c3')).map((o) => o.type + ' ' + o.p), Q.budget(m, 0)], [1, ['n 1'], 1])
}
{ // Q14 a rolled Missed still opens the timeline; Q15 the game-end roll in the past
	let s = run(s1(), ['(0T1)a4-a3'])
	eq('Q14 outcomes', oc(s, '(0T2)c3>>(0T1)c5'), ['miss 50', 'capture 50'])
	const miss = run(s, [['(0T2)c3>>(0T1)c5', 0]])
	eq('Q14 missed: the timeline opened, nobody arrived', [X(miss).tl[U(1)], X(miss).c, Q.squareView(miss, sq('(+1)c5')).map((o) => o.type), miss.turn], [[3, 3, 0, 2], [1, 0], ['b'], 1])
	const mk = (fen) => bw({ s: 0, rows: { 0: { st: 6, en: 8, boards: { 8: '5/5/2N2/5/K3k', 6: '5/5/4k/5/K4' } } } })
	const A = mk()
	const B = bw({ s: 0, rows: { 0: { st: 6, en: 8, boards: { 8: '5/5/N4/5/K3k', 6: '5/5/4k/5/K4' } } } })
	setId(B, sq('(0)a3'), idAt(A, '(0)c3'))
	s = stateOfWorlds([[A, 1], [B, 1]])
	eq('Q15 danger', Q.royalDanger(V, s, 1), 0.5)
	eq('Q15 outcomes', oc(s, '(0T4)c3>>(0T3)e3'), ['miss 50', 'capture 50'])
	const q15 = run(s, [['(0T4)c3>>(0T3)e3', 0]])
	eq('Q15 missed: no row, the board passed', [q15.result, X(q15).tl.filter(Boolean).length, X(q15).tl[0][1], X(q15).c], [null, 1, 9, [0, 0]])
	eq('Q15 captured', run(s, [['(0T4)c3>>(0T3)e3', 1]]).result, { winner: 0, reason: 'king' })
}
{ // Q16 converging capture; Q17 the danger is the same before and after Submit
	const mk = (fen) => bw({ s: 1, rows: { 0: { st: 6, en: 11, boards: { 11: fen } } } })
	const A = mk('2k2/5/1N3/5/K4')
	const B = mk('2k2/4N/5/5/K4')
	setId(B, sq('(0)e4'), idAt(A, '(0)b3'))
	const s = stateOfWorlds([[A, 1], [B, 1]], 1)
	eq('Q16 converging capture counts', Q.royalDanger(V, s, 1), 1)
	const C = mk('2k1p/5/1N3/5/K4')
	const D = mk('2k1p/5/B4/5/K4')
	const t = stateOfWorlds([[C, 1], [D, 1]], 1)
	const t2 = run(t, ['(0T5)e5-e4'])
	eq('Q17 same danger before and after the turn ends', [Q.royalDanger(V, t, 1), Q.royalDanger(V, t2, 1), t2.turn], [0.5, 0.5, 0])
}
{ // Q19 budget fallback: a link over the budget is rolled, and its Missed still opens the timeline
	const lim = { ...V, budgetRule: () => ({ limit: 1 }) }
	const s = e2state()
	const list = Q.branches(lim, s, '(0T5)a1>>(0T3)c1')
	eq('Q19 rolled over the budget', list.map((b) => b.key + ' ' + Math.round(b.weight / Q.T * 100)), ['miss 50', 'move 50'])
	const missed = Q.stateAfter(lim, s, '(0T5)a1>>(0T3)c1', list[0], list)
	eq('Q19 missed builds the boards', [X(missed).tl[U(1)], Q.squareView(missed, sq('(+1)c1')).length], [[7, 7, 0, 6], 0])
	eq('Q20 budget 8 on every setup', ['small', 'standard', 'twotimelines', 'marauders'].map((x) => Q.budgetInfo(V, start(x), 0).limit), [8, 8, 8, 8])
}
{ // Q21 a twin absent from the first world merges (core fix)
	const A = bw({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/2N2/5/K4' } } } })
	const B = bw({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/4N/5/K4' } } } })
	const C = bw({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/K4' } } } })
	const X0 = idAt(A, '(0)c3')
	setId(B, sq('(0)e3'), X0)
	const s = stateOfWorlds([[C, 2], [A, 1], [B, 1]])
	eq('Q21 absent from world 0', [s.worlds[0].b.ty[X0], loc(s, X0)], ['', ['off 50', '(0)c3 25', '(0)e3 25']])
	eq('Q21 merge', oc(s, '(0)c3|(0)e3-(0)d1'), ['move 100 certain'])
}
{ // Q22 castling certain-only; Q23 en passant after a linked world; Q26 a partial slide loses the right
	const c = (fen) => bw({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: fen } } } })
	const A = c('k4/5/5/5/K*2NR*')
	const B = c('k4/5/5/1N3/K*3R*')
	setId(B, sq('(0)b2'), idAt(A, '(0)d1'))
	eq('Q22 castling past a ghost is illegal', legal(stateOfWorlds([[A, 1], [B, 1]]), '(0T5)a1-c1'), false)
	const A2 = c('k4/5/5/1N3/K*3R*')
	const B2 = c('k4/5/1N3/5/K*3R*')
	setId(B2, sq('(0)b3'), idAt(A2, '(0)b2'))
	eq('Q22 castling certain when free everywhere', oc(stateOfWorlds([[A2, 1], [B2, 1]]), '(0T5)a1-c1'), ['move 100 certain'])
	const E = c('4k/3p*1/5/N1P*2/K4')
	const F = c('4k/3p*1/5/2P*2/K1N2')
	setId(F, sq('(0)c1'), idAt(E, '(0)a2'))
	const s = run(stateOfWorlds([[E, 1], [F, 1]]), ['(0T5)c2-c4'])
	eq('Q23 en passant certain', oc(s, '(0T5)d4-c3'), ['capture 100 certain'])
	// Q26: a rook slide blocked by a black ghost in one world is linked; measured home, the rook has lost castling
	const G = c('k4/5/4n/5/K*3R*')
	const H = c('k4/5/1n3/5/K*3R*')
	setId(H, sq('(0)b3'), idAt(G, '(0)e3'))
	const rook = idAt(G, '(0)e1')
	let q26 = stateOfWorlds([[G, 1], [H, 1]])
	eq('Q26 partial slide is linked', oc(q26, '(0T5)e1-e4'), ['move 100 certain'])
	q26 = run(q26, ['(0T5)e1-e4'])
	eq('Q26 the right is lost in every world', [loc(q26, rook), q26.worlds.map(({ b }) => b.ty[rook])], [['(0)e1 50', '(0)e4 50'], ['r', 'r']])
	q26 = run(q26, ['(0T5)a5-b5'])
	const home = q26.worlds.findIndex(({ b }) => b.sq[rook] === sq('(0)e1'))
	const outs = Q.branches(V, q26, '?(0)e1')
	const m26 = Q.stateAfter(V, q26, '?(0)e1', outs.find((o) => o.key === '(0)e1'), outs)
	eq('Q26 measured home: no castling', [loc(m26, rook), m26.worlds[0].b.ty[rook], m26.turn], [['(0)e1 100'], 'r', 1])
	void home
}
{ // Q24 rejoin across timelines (a part moves onto its other part: no roll); Q25 merge into the past
	const A = bw({ s: 0, c: [1, 0], rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/N4/5/K4' } }, 1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/5/5/5/K4' } } } })
	const B = bw({ s: 0, c: [1, 0], rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/K4' } }, 1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/5/2N2/5/K4' } } } })
	const id = idAt(A, '(0)a3')
	setId(B, sq('(+1)c3'), id)
	const s = stateOfWorlds([[A, 1], [B, 1]])
	eq('Q24 rejoin is certain', oc(s, '(0T5)a3>(+1T5)c3'), ['move 100 certain'])
	eq('Q24 whole again', loc(run(s, ['(0T5)a3>(+1T5)c3']), id), ['(+1)c3 100'])
	const P1 = bw({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/1N3' } } } })
	const P2 = bw({ s: 0, rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/3N1' } } } })
	const kn = idAt(P1, '(0)b1')
	setId(P2, sq('(0)d1'), kn)
	const ps = stateOfWorlds([[P1, 1], [P2, 1]])
	eq('Q25 merge into the past', oc(ps, '(0)b1|(0)d1-(0)~3c1'), ['move 100 certain'])
	const pm = run(ps, ['(0)b1|(0)d1-(0)~3c1'])
	eq('Q25 after', [loc(pm, kn), X(pm).tl[U(1)], pm.worlds.length], [['(+1)c1 100'], [7, 7, 0, 6], 2])
}
{ // Q27 stuck: stalemate and checkmate at once (Marauders), Q28 the stuck test ignores the computer's pruning,
	// Q29 a superposed part on the stuck board is a way out, Q30 the strand warning
	let s = start('marauders')
	eq('Q27 marauders start', [P.mandatory(X(s)).map((u) => P.lOf(u)), keys(s).length, keys(s).filter((k) => k.includes('>(−1T1)')).length], [[0, -1, 1], 34, 8])
	s = run(s, ['(0T1)a1-a2'])
	eq('Q27 after one move', [keys(s).filter((k) => k.includes('>(−1T1)')).length, s.result], [5, null])
	eq('Q30 strand warning', [P.moveWarning(s, '(+1T1)b2-b3'), P.moveWarning(s, '(+1T1)b1>(−1T1)b1')], ['stalemate', null])
	const t = run(s, ['(+1T1)b2-b3'])
	eq('Q27 stuck: stalemate', t.result, { winner: null, reason: 'stalemate' })
	const ai = { ...s, worlds: s.worlds.map(({ b, w }) => ({ b: { ...b, x: { ...b.x, ai: 1 } }, w })) }
	eq('Q28 stuck test with the computer view', [P.stuck(ai), P.stuck(run(ai, ['(+1T1)b2-b3']))], [false, true])
	// checkmate: the stuck side's king can be taken for certain
	const cm = bw({ s: 0, c: [1, 0], rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/5' } }, 1: { st: 9, en: 11, parent: [0, 8], boards: { 11: '4k/5/5/5/r3K' } } } })
	const cs = one(cm)
	eq('Q27 checkmate', [Q.hasLegalMove(V, cs), P.mandatory(X(cs)).map((u) => P.lOf(u)), V.noMoves(cs)], [false, [0], { winner: 1, reason: 'checkmate' }])
	const sm = one(bw({ s: 0, c: [1, 0], rows: { 0: { st: 2, en: 10, boards: { 10: '4k/5/5/5/5' } }, 1: { st: 9, en: 11, parent: [0, 8], boards: { 11: '4k/5/5/5/4K' } } } }))
	eq('Q27 stalemate', V.noMoves(sm), { winner: null, reason: 'stalemate' })
	// Q29: must-move L0 with only a ghost part that cannot move: measuring it uses the board
	const g1 = bw({ s: 0, c: [1, 0], rows: { 0: { st: 2, en: 10, boards: { 10: 'pk3/P4/5/5/5' } }, 1: { st: 9, en: 11, parent: [0, 8], boards: { 11: '4k/5/5/5/4K' } } } })
	const s29 = (() => {
		const A = bw({ m: 1, s: 0, c: [1, 0], rows: { 0: { st: 2, en: 10, boards: { 10: 'k4/1p3/1Pp2/2P2/N4' } }, 1: { st: 9, en: 11, parent: [0, 8], boards: { 11: '4k/5/5/5/K4' } } } })
		const B = bw({ m: 1, s: 0, c: [1, 0], rows: { 0: { st: 2, en: 10, boards: { 10: 'k4/1p3/1Pp2/2P2/5' } }, 1: { st: 9, en: 11, parent: [0, 8], boards: { 11: '4k/5/2N2/5/K4' } } } })
		setId(B, sq('(+1)c3'), idAt(A, '(0)a1'))
		return stateOfWorlds([[A, 1], [B, 1]])
	})()
	eq('Q29 a measurable part is a way out', [keys(s29).filter((k) => k.startsWith('(0T5)')), P.stuck(s29), Q.legalMoves(V, s29).filter((m) => m.type === 'measure').map((m) => m.code)], [[], false, ['?(0)a1']])
	const m29 = run(s29, [['?(0)a1', 0]])
	eq('Q29 the measurement used the board', [X(m29).tl[0][1], m29.turn], [11, 1])
	void g1
}
{ // L1 limits
	const s = { ...start(), ply: V.maxPly - 1 }
	eq('L1 move limit', play(s, '(0T1)d1-c3').result, { winner: null, reason: 'moveLimit' })
	const q = { ...start(), quiet: V.quietPlies - 1 }
	eq('L1 quiet', play(q, '(0T1)d1-c3').result, { winner: null, reason: 'quiet' })
	eq('L1 pawn resets', play(q, '(0T1)a2-a3').quiet, 0)
}
{ // R1 records: arrows and texts
	let s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3', '(0T2)c3>>(0T1)a3'])
	eq('R1 branch record', s.history.at(-1).info, { rows: [2], arrows: [[0, 4, 2, 2, 2, 3, 0, 2]], back: 3 })
	s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3', '(0)c3-(0)~3a3|(0)~3e3'])
	eq('R1 time split text', s.history.at(-1).info.text, '(0T2)c3 split (0T1)a3 | (0T1)e3')
	s = run(s1(), ['(0T1)a4-a3', ['(0T2)c3>>(0T1)c5', 0]])
	eq('R1 missed: no arrow', s.history.at(-1).info, { rows: [2], arrows: [], back: 3 })
}
{ // U1 layout at the start; U2 after a branch; U3 focus key; U4 danger shade
	const L = layoutOf(start())
	eq('U1 start', [L.cells.length, L.layout.boards.map((b) => b.label), L.layout.areas.map((a) => a.shade), L.layout.outlines.length, L.layout.height >= 0.75 * L.layout.width], [25, ['L0 T1 ○ · must move'], ['frame', 'wood'], 4, true])
	let s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3', '(0T2)c3>>(0T1)a3'])
	const L2 = layoutOf(s)
	eq('U2 after a branch', [L2.layout.labels.filter((l) => /^L/.test(l.text) || l.text === 'new').map((l) => l.text), L2.layout.lines.length, L2.layout.areas.map((a) => a.shade).sort()], [['L0', 'L+1', 'new'], 2, ['frame', 'river', 'wood']])
	eq('U2 Black is in 5D check through the past', [Q.royalDanger(V, s, 1), L2.cells.filter((c) => c.shade === 'danger').map((c) => V.topology.names[c.sq])], [1, ['(0)~1a5']])
	const k1 = L2.layout.focus.key
	const s2 = run(s, ['(0T2)b4-b3'])
	const s3 = run(s, ['(+1T1)e4-e3'])
	eq('U3 focus key', [layoutOf(s2).layout.focus.key === k1, layoutOf(s3).layout.focus.key === k1], [true, false])
	const d = one(bw({ s: 1, rows: { 0: { st: 6, en: 11, boards: { 11: '2k2/5/1N3/5/K4' } } } }), 1)
	const L4 = layoutOf(d)
	eq('U4 danger shade and threat line', [L4.cells.filter((c) => c.shade === 'danger').map((c) => V.topology.names[c.sq]), L4.layout.lines.length], [['(0)c5'], 1])
	eq('U5 names', L2.names[sq('(+1)a3')], 'Timeline +1, turn 1, Black to move: a3')
}
{ // A1 the computer's view; A2 the computer wins at once
	let s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3', '(0T2)c3>>(0T1)a3'])
	const view = P.aiView(s)
	const all = keys(s)
	const pruned = keys(view)
	eq('A1 pruned', [pruned.length < all.length, pruned.every((k) => all.includes(k)), pruned.every((k) => k.startsWith('(+1T1)') || k.includes('>(+1T1)'))], [true, true, true])
	const b = bw({ s: 0, rows: { 0: { st: 6, en: 10, boards: { 10: '3k1/5/4N/5/K4', 8: '4k/5/5/5/K4', 6: '4k/5/5/5/K4' } } } })
	const code = await chooseMove(V, one(b), { level: 'normal', rng: seeded(1) })
	eq('A2 the computer takes a king', play(one(b), code).result, { winner: 0, reason: 'king' })
}
console.log(passed + ' passed, ' + failed + ' failed')
