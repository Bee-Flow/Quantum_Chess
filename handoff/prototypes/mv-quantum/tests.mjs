// The test scenarios of the design (section 7), run against the prototype. node tests.mjs
import { V, P, Q, show, play, outs, invariants, stateOfWorlds } from './lib.mjs'
import { layoutOf } from './layout.mjs'

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
	}
}
const keys = (s) => Q.ordinaryMoves(V, s).map((m) => m.code)
const oc = (s, code) => (Q.outcomes(V, s, code) ?? []).map((o) => o.key + ' ' + Math.round(o.p * 100) + (o.rolled ? '' : ' certain'))
const legal = (s, code) => Q.isLegal(V, s, code)
const X = (s) => s.worlds[0].b.x
const loc = (s, id) => Q.pieceLocations(s, id).map((l) => (l.sq >= 0 ? V.topology.names[l.sq] : 'off') + ' ' + Math.round(l.p * 100))
const n5 = (u, slot, x, y) => P.idOf(5, u, slot, x, y)
const sq = (name) => V.topology.byName(name)
// give the piece on square q the id `id` (one ghost with the same id in several worlds)
const setId = (w, q, id) => {
	const old = w.board[q]
	const [t, d] = [w.ty[old], w.sd[old]]
	w.sq[old] = -1
	w.ty[old] = ''
	w.sd[old] = 0
	P.place(w, id, q, t, d)
}
const start = () => Q.newGame(V, { setup: 'small', timelines: '2' })
const run = (s, codes) => {
	for (const c of codes) {
		const [code, i] = Array.isArray(c) ? c : [c, 0]
		s = play(s, code, i)
		invariants(s)
	}
	return s
}

// ---------------------------------------------------------------- structure and classical rules
{ // T1 start
	const s = start()
	eq('T1 keys', keys(s), ['(0T1)d1-e3', '(0T1)d1-c3', '(0T1)a2-a3', '(0T1)b2-b3', '(0T1)c2-c3', '(0T1)d2-d3', '(0T1)e2-e3'])
	eq('T1 splits', Q.splitsFrom(V, s, sq('L0:d1')).map((m) => m.code), ['L0:d1-L0:c3|L0:e3'])
	eq('T1 submit', legal(s, 'submit'), false)
	eq('T1 json', JSON.stringify(s).length < 3000, true)
}
{ // T2 a move makes a board; the turn passes by itself
	const s = run(start(), ['(0T1)d1-c3'])
	eq('T2 turn', s.turn, 1)
	eq('T2 tl', X(s).tl[0], [0, 1, null, null])
	eq('T2 knight id 3 on L0:c3', loc(s, 3), ['L0:c3 100'])
	eq('T2 history knight', Q.squareView(s, sq('L0~1:d1')).map((o) => o.type + o.id), ['hn' + n5(0, 1, 3, 0)])
}
{ // T3 branch; T4 optional boards and submit
	let s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3'])
	eq('T3 has branch', keys(s).filter((k) => k.includes('>>')).sort(), ['(0T2)c3>>(0T1)a3', '(0T2)c3>>(0T1)c5', '(0T2)c3>>(0T1)e3'])
	s = run(s, ['(0T2)c3>>(0T1)a3'])
	eq('T3 rows', [X(s).tl[0], X(s).tl[1]], [[0, 3, null, null], [1, 1, 0, 0]])
	eq('T3 created', X(s).c, [1, 0])
	eq('T3 traveller', loc(s, 3), ['L+1:a3 100'])
	eq('T3 past self copied', Q.squareView(s, sq('L+1:d1')).map((o) => o.type + o.id), ['n' + n5(1, 0, 3, 0)])
	eq('T3 turn/mandatory', [s.turn, P.mandatory(X(s))], [1, [1]])
	s = run(s, ['(+1T1)e4-e3'])
	eq('T4 turn stays', s.turn, 1)
	eq('T4 submit legal', legal(s, 'submit'), true)
	s = run(s, ['submit'])
	eq('T4 white must move L+1 only', [s.turn, P.mandatory(X(s))], [0, [1]])
	s = run(s, ['(+1T2)b2-b3'])
	eq('T4 turn passes by itself', s.turn, 1)
}
{ // T5 one hop clears two boards
	const b = P.buildWorld({ n: 5, s: 0, c: [1, 0], rows: { 0: { st: 0, en: 4, boards: { 4: '4k/5/R4/5/K4' } }, 1: { st: 3, en: 4, parent: [0, 2], boards: { 4: '4k/5/5/5/K4' } } } })
	let s = stateOfWorlds([[b, 1]])
	eq('T5 mandatory', P.mandatory(X(s)), [0, 1])
	eq('T5 hop certain', oc(s, '(0T3)a3>(+1T3)a3'), ['move 100 certain'])
	s = run(s, ['(0T3)a3>(+1T3)a3'])
	eq('T5 rows', [X(s).tl[0][1], X(s).tl[1][1], s.turn], [5, 5, 1])
}
{ // T6 an active branch rewinds the present; T7 an inactive one does not
	const mk = (c, other) => P.buildWorld({ n: 5, s: 0, c, rows: { 0: { st: 0, en: 8, boards: { 8: '4k/5/5/5/K3R', 6: '4k/5/5/5/K4' } }, ...other } })
	let s = stateOfWorlds([[mk([0, 1], { '-1': { st: 7, en: 8, parent: [0, 6], boards: { 8: '4k/5/5/5/K4' } } }), 1]])
	eq('T6 mandatory before', P.mandatory(X(s)), [0, 2])
	s = run(s, ['(0T5)e1>>(0T4)e1'])
	eq('T6 new row active, present back', [X(s).tl[1], P.skeleton(X(s)).present, s.turn, legal(s, 'submit')], [[7, 7, 0, 6], 7, 0, true])
	s = stateOfWorlds([[mk([1, 0], { 1: { st: 5, en: 8, parent: [0, 4], boards: { 8: '4k/5/5/5/K4' } } }), 1]])
	s = run(s, ['(0T5)e1>>(0T4)e1'])
	eq('T7 inactive +2', [X(s).tl[3], P.skeleton(X(s)).act(3), P.skeleton(X(s)).present, legal(s, 'submit'), P.mandatory(X(s))], [[7, 7, 0, 6], false, 8, false, [1]])
	// T8 the cap
	const capped = P.buildWorld({ n: 5, m: 1, s: 0, c: [1, 0], rows: { 0: { st: 0, en: 8, boards: { 8: '4k/5/5/5/K3R', 6: '4k/5/5/5/K4', 4: '5/5/5/5/K3k' } }, 1: { st: 5, en: 8, parent: [0, 4], boards: { 8: '4k/5/5/5/K4' } } } })
	s = stateOfWorlds([[capped, 1]])
	eq('T8 only the king capture travels back', keys(s).filter((k) => k.includes('>>')), ['(0T5)e1>>(0T3)e1'])
	s = run(s, ['(0T5)e1>>(0T3)e1'])
	eq('T8 king captured, no row', [s.result, X(s).c, X(s).tl.filter(Boolean).length], [{ winner: 0, reason: 'king' }, [1, 0], 2])
}
{ // T9 a king in the past; T10 the window; T11 own past self
	const b = P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 2, en: 6, boards: { 6: '3k1/5/4N/5/K4', 4: '4k/5/5/5/K4', 2: '4k/5/5/5/K4' } } } })
	let s = stateOfWorlds([[b, 1]])
	eq('T9 danger', Q.royalDanger(V, s, 1), 1)
	eq('T9 capture certain', oc(s, '(0T4)e3>>(0T3)e5'), ['capture 100 certain'])
	s = run(s, ['(0T4)e3>>(0T3)e5'])
	eq('T9 result', s.result, { winner: 0, reason: 'king' })
	const r = P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 0, en: 6, boards: { 6: '4k/5/4R/5/K4', 4: '4k/5/5/5/K3R', 2: '4k/5/5/5/K3R' } } } })
	s = stateOfWorlds([[r, 1]])
	eq('T10 T-ride', keys(s).filter((k) => k.startsWith('(0T4)e3>>(0T')), ['(0T4)e3>>(0T3)e3', '(0T4)e3>>(0T2)e3'])
	const r2 = P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 0, en: 6, boards: { 6: '4k/5/5/5/R3K', 4: '4k/5/5/5/R3K', 2: '4k/5/5/5/R3K' } } } })
	s = stateOfWorlds([[r2, 1]])
	eq('T11 own past self blocks', keys(s).filter((k) => k.startsWith('(0T4)a1>>(0T')), [])
}
{ // T12 pawns: timeline step (hop), T-L capture (branch), never along T alone
	const b = P.buildWorld({ n: 5, s: 0, c: [0, 1], rows: { 0: { st: 0, en: 4, boards: { 4: '4k/5/5/2P2/K4' } }, '-1': { st: 2, en: 4, parent: [0, 1], boards: { 4: '4k/5/5/5/K4', 2: '4k/5/5/2n2/K4' } } } })
	const s = stateOfWorlds([[b, 1]])
	eq('T12 pawn keys', keys(s).filter((k) => k.includes(')c2')), ['(0T3)c2-c3', '(0T3)c2>(-1T3)c2', '(0T3)c2>>(-1T2)c2'])
	eq('T12 T-L capture certain', oc(s, '(0T3)c2>>(-1T2)c2'), ['capture 100 certain'])
}
{ // T13 double steps and en passant; timeline double step
	const b = P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 0, en: 4, boards: { 4: '4k/3p*1/5/2P*2/K4' } } } })
	let s = stateOfWorlds([[b, 1]])
	s = run(s, ['(0T3)c2-c4'])
	eq('T13 ep key', keys(s).filter((k) => k === '(0T3)d4-c3'), ['(0T3)d4-c3'])
	s = run(s, ['(0T3)d4-c3'])
	eq('T13 ep captured', Q.squareView(s, sq('L0:c4')).length, 0)
	const t = P.buildWorld({ n: 5, s: 0, c: [0, 2], rows: { 0: { st: 0, en: 4, boards: { 4: '4k/5/5/2P*2/K4' } }, '-1': { st: 3, en: 4, parent: [0, 2], boards: { 4: '4k/5/5/5/K4' } }, '-2': { st: 3, en: 4, parent: [0, 2], boards: { 4: '4k/5/5/5/K4' } } } })
	s = stateOfWorlds([[t, 1]])
	eq('T13 timeline double', keys(s).filter((k) => k.startsWith('(0T3)c2>')), ['(0T3)c2>(-1T3)c2', '(0T3)c2>(-2T3)c2'])
}
{ // T14 promotion to a queen only; T15 castling on the small board
	const b = P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 0, en: 8, boards: { 8: '4k/1P3/5/5/K4' } } } })
	let s = stateOfWorlds([[b, 1]])
	eq('T14 promo', keys(s).filter((k) => k.startsWith('(0T5)b4-b5')), ['(0T5)b4-b5=q'])
	s = run(s, ['(0T5)b4-b5=q'])
	eq('T14 queen', Q.squareView(s, sq('L0:b5'))[0].type, 'q')
	const c = P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 0, en: 8, boards: { 8: 'k4/5/5/5/K*3R*' } } } })
	s = run(stateOfWorlds([[c, 1]]), ['(0T5)a1-c1'])
	eq('T15 castled', [Q.squareView(s, sq('L0:c1'))[0].type, Q.squareView(s, sq('L0:b1'))[0].type], ['k', 'r'])
}

// ---------------------------------------------------------------- quantum
const q1 = () => run(start(), ['L0:d1-L0:c3|L0:e3'])
{ // Q1 split
	const s = q1()
	eq('Q1', [s.worlds.length, s.worlds.map((w) => w.w), Q.budget(s, 0), X(s).tl[0], s.turn], [2, [8388608, 8388608], 2, [0, 1, null, null], 1])
}
{ // Q2 a ghost travels; Q3 a probe on another timeline
	let s = run(q1(), ['(0T1)a4-a3'])
	eq('Q2 not rolled', oc(s, '(0T2)c3>>(0T1)e3'), ['move 100 certain'])
	s = run(s, ['(0T2)c3>>(0T1)e3'])
	eq('Q2 knight', loc(s, 3), ['L0:e3 50', 'L+1:e3 50'])
	eq('Q2 row opens in every world', [X(s).tl[1], s.worlds.every(({ b }) => b.x.tl[1] !== null)], [[1, 1, 0, 0], true])
	eq('Q2 budget', Q.budget(s, 0), 2)
	eq('Q3 probe', oc(s, '(+1T1)e4-e3'), ['miss 50', 'move 50'])
	const miss = run(s, [['(+1T1)e4-e3', 0]])
	eq('Q3 missed', [miss.worlds.length, loc(miss, 3), X(miss).tl[1], miss.turn, legal(miss, 'submit')], [1, ['L+1:e3 100'], [1, 2, 0, 0], 1, true])
}
const q4state = () => {
	const rows = (v4, v5, v6) => ({ 0: { st: 2, en: 6, boards: { 2: '4k/5/2n2/5/B3K', 3: '4k/5/2n2/4K/B4', 4: v4, 5: v5, 6: v6 } } })
	const A = P.buildWorld({ n: 5, s: 0, rows: rows('4k/5/5/4K/Bn3', '4k/5/4K/5/Bn3', '3k1/5/4K/5/Bn3') })
	const B = P.buildWorld({ n: 5, s: 0, rows: rows('4k/5/5/4K/B2n1', '4k/5/4K/5/B2n1', '3k1/5/4K/5/B2n1') })
	return stateOfWorlds([[A, 1], [B, 1]])
}
{ // Q4 pass = link through the past; Q5 land = roll in the past
	let s = q4state()
	eq('Q4 not rolled', oc(s, '(0T4)a1>>(0T2)c1'), ['move 100 certain'])
	s = run(s, ['(0T4)a1>>(0T2)c1'])
	eq('Q4 bishop', loc(s, 0), ['L0:a1 50', 'L+1:c1 50'])
	eq('Q4 linked', s.worlds.map(({ b }) => [b.sq[0] === sq('L+1:c1'), b.board[sq('L0:d1')] >= 0]).sort(), [[false, false], [true, true]])
	eq('Q4 budget', [Q.budget(s, 0), Q.budget(s, 1)], [2, 2])
	s = q4state()
	eq('Q5 rolled', oc(s, '(0T4)a1>>(0T3)b1'), ['move 50', 'capture 50'])
	const cap = run(s, [['(0T4)a1>>(0T3)b1', 1]])
	eq('Q5 knight known now', [cap.worlds.length, Q.squareView(cap, sq('L0:b1')).map((o) => o.type)], [1, ['n']])
}
{ // Q6 time split; Q7 a split over two boards is illegal
	const s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3'])
	eq('Q6 split into the past', oc(s, 'L0:c3-L0~1:a3|L0~1:e3'), ['split 100 certain'])
	const t = run(s, ['L0:c3-L0~1:a3|L0~1:e3'])
	eq('Q6 result', [t.worlds.length, loc(t, 3), X(t).tl[1], X(t).c, t.turn], [2, ['L+1:a3 50', 'L+1:e3 50'], [1, 1, 0, 0], [1, 0], 1])
	eq('Q7 two boards', legal(s, 'L0:c3-L0:a4|L0~1:e3'), false)
}
const hopState = () => stateOfWorlds([[P.buildWorld({ n: 5, s: 0, c: [1, 0], rows: { 0: { st: 0, en: 4, boards: { 4: '4k/5/2N2/5/K4' } }, 1: { st: 3, en: 4, parent: [0, 2], boards: { 4: '4k/5/5/5/K4' } } } }), 1]])
{ // Q8 hop split clears two boards; Q9 merges
	let s = hopState()
	eq('Q8 hop split', oc(s, 'L0:c3-L+1:a3|L+1:e3'), ['split 100 certain'])
	s = run(s, ['L0:c3-L+1:a3|L+1:e3'])
	eq('Q8 result', [loc(s, n5(0, 0, 2, 2)), X(s).tl[0][1], X(s).tl[1][1], s.turn], [['L+1:a3 50', 'L+1:e3 50'], 5, 5, 1])
	s = run(s, ['(0T3)e5-d5', '(+1T3)e5-d5'])
	eq('Q9 merge on one board', oc(s, 'L+1:a3|L+1:e3-L+1:c4'), ['move 100 certain'])
	const m = run(s, ['L+1:a3|L+1:e3-L+1:c4'])
	eq('Q9 merged', loc(m, n5(0, 0, 2, 2)), ['L+1:c4 100'])
	eq('Q9 still two worlds (the past remembers)', [m.worlds.length, Q.budget(m, 0)], [2, 2])
	let g = run(start(), ['L0:d1-L0:c3|L0:e3', '(0T1)a4-a3', '(0T2)c3>>(0T1)e3', '(+1T1)b4-b3', 'submit'])
	eq('Q9 parts on two boards cannot merge', legalMergeCodes(g), [])
}
function legalMergeCodes(s) {
	return Q.legalMoves(V, s).filter((m) => m.type === 'merge').map((m) => m.code)
}
{ // Q10 which-path memory
	let s = run(start(), ['L0:d1-L0:c3|L0:e3', '(0T1)a4-a3', 'L0:c3|L0:e3-L0:d1'])
	eq('Q10 after merge', [s.worlds.length, Q.budget(s, 0), loc(s, 3)], [2, 2, ['L0:d1 100']])
	s = run(s, ['(0T2)b4-b3', '(0T3)e2-e3', '(0T3)c4-c3'])
	eq('Q10 still remembered', [s.worlds.length, Q.budget(s, 0), X(s).tl[0][1]], [2, 2, 6])
	s = run(s, ['(0T4)d1-c3'])
	eq('Q10 sealed', [s.worlds.length, Q.budget(s, 0), X(s).tl[0][1]], [1, 1, 7])
}
{ // Q11 measuring spends a board; Q12 only on a board you may play
	let s = run(q1(), ['(0T1)a4-a3'])
	eq('Q11 outcomes', oc(s, '?L0:c3'), ['L0:c3 50', 'L0:e3 50'])
	const t = run(s, [['?L0:c3', 0]])
	eq('Q11 board spent', [t.worlds.length, X(t).tl[0][1], t.turn, loc(t, 3)], [1, 3, 1, ['L0:c3 100']])
	const two = (x3) => P.buildWorld({ n: 5, s: 0, c: [1, 0], rows: { 0: { st: 0, en: 4, boards: { 4: '4k/5/5/5/K4' } }, 1: { st: 3, en: 5, parent: [0, 2], boards: { 5: x3 } } } })
	const a = two('4k/5/N4/5/K4')
	const b = two('4k/5/4N/5/K4')
	setId(b, P.sqOf(1, 0, 4, 2), n5(1, 0, 0, 2))
	const s12 = stateOfWorlds([[a, 1], [b, 1]])
	eq('Q12 not on a board you may play', [legal(s12, '?L+1:a3'), Q.legalMoves(V, s12).filter((m) => m.type === 'measure').length], [false, 0])
}
{ // Q13 twins; the opponent cannot raise your budget
	let s = run(q1(), ['(0T1)a4-a3', '(0T2)b2-b3'])
	eq('Q13 budget before', Q.budget(s, 0), 2)
	s = run(s, ['(0T2)d5>>(0T1)d3'])
	const t1 = n5(2, 0, 2, 2)
	const t2 = n5(2, 0, 4, 2)
	eq('Q13 twins', [loc(s, t1), loc(s, t2), Q.budget(s, 0), X(s).tl[2]], [['off 50', 'L−1:c3 50'], ['off 50', 'L−1:e3 50'], 2, [2, 2, 0, 1]])
	eq('Q13 mandatory', [s.turn, P.mandatory(X(s))], [0, [2]])
	eq('Q13 measure a twin', oc(s, '?L−1:c3'), ['gone 50', 'L−1:c3 50'])
	const m = run(s, [['?L−1:c3', 1]])
	eq('Q13 all copies settle', [m.worlds.length, loc(m, 3), Q.budget(m, 0)], [1, ['L0:c3 100'], 1])
}
{ // Q14 a rolled Missed still opens the timeline
	const s = run(q1(), ['(0T1)a4-a3'])
	eq('Q14 outcomes', oc(s, '(0T2)c3>>(0T1)c5'), ['miss 50', 'capture 50'])
	const m = run(s, [['(0T2)c3>>(0T1)c5', 0]])
	eq('Q14 missed opens the row', [X(m).tl[1], X(m).c, loc(m, 3), Q.squareView(m, sq('L+1:c5')).map((o) => o.type)], [[1, 1, 0, 0], [1, 0], ['L0:e3 100'], ['b']])
}
{ // Q15 a ghost attacks a king in the past: the game-end roll
	const rows = (v3, v4) => ({ 0: { st: 2, en: 4, boards: { 2: '5/5/4k/5/KN3', 3: v3, 4: v4 } } })
	const A = P.buildWorld({ n: 5, s: 0, rows: rows('5/5/2N1k/5/K4', '5/4k/2N2/5/K4') })
	const B = P.buildWorld({ n: 5, s: 0, rows: rows('5/5/N3k/5/K4', '5/4k/N4/5/K4') })
	setId(B, P.sqOf(0, 0, 0, 2), n5(0, 0, 2, 2))
	setId(B, P.sqOf(0, 1 + (3 % 4), 0, 2), n5(0, 1 + (3 % 4), 2, 2))
	const s = stateOfWorlds([[A, 1], [B, 1]])
	eq('Q15 danger', Q.royalDanger(V, s, 1), 0.5)
	eq('Q15 outcomes', oc(s, '(0T3)c3>>(0T2)e3'), ['miss 50', 'capture 50'])
	const miss = run(s, [['(0T3)c3>>(0T2)e3', 0]])
	eq('Q15 missed: no row, the board passed', [miss.result, X(miss).tl.filter(Boolean).length, X(miss).tl[0][1], X(miss).c], [null, 1, 5, [0, 0]])
	const win = run(s, [['(0T3)c3>>(0T2)e3', 1]])
	eq('Q15 captured', win.result, { winner: 0, reason: 'king' })
}
{ // Q16 danger is the union over the opponent's possible captures (after a pass)
	const mk = (fen) => P.buildWorld({ n: 5, s: 1, rows: { 0: { st: 0, en: 5, boards: { 5: fen } } } })
	const A = mk('2k2/5/1N3/5/K4')
	const B = mk('2k2/4N/5/5/K4')
	setId(B, P.sqOf(0, 0, 4, 3), n5(0, 0, 1, 2))
	const s = stateOfWorlds([[A, 1], [B, 1]], 1)
	eq('Q16 union', Q.royalDanger(V, s, 1), 1)
}
{ // Q17 a king step onto a maybe-occupied square is rolled (solid pieces are never ghosts)
	const A = P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 0, en: 4, boards: { 4: '4k/5/5/1n3/K4' } } } })
	const B = P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 0, en: 4, boards: { 4: '4k/5/2n2/5/K4' } } } })
	setId(B, P.sqOf(0, 0, 2, 2), n5(0, 0, 1, 1))
	const s = stateOfWorlds([[A, 1], [B, 1]])
	eq('Q17 king step rolled', oc(s, '(0T3)a1-b2'), ['move 50', 'capture 50'])
}
{ // Q18 structure never rolls: see fuzz; Q19 budget fallback
	const s = q4state()
	const n = run(s, ['(0T4)a1>>(0T2)c1'])
	eq('Q18 one skeleton', new Set(n.worlds.map(({ b }) => P.solidExtra(b))).size, 1)
}

// ---------------------------------------------------------------- core hooks, limits and results (design 7, part 3)
{ // Q19 the budget fallback: a link that would break the budget is rolled, and a rolled Missed still uses its boards
	const lim = { ...V, budgetRule: () => ({ limit: 1 }) }
	const s = q4state()
	eq('Q19 link within the budget', oc(s, '(0T4)a1>>(0T2)c1'), ['move 100 certain'])
	eq('Q19 over the budget: rolled', (Q.outcomes(lim, s, '(0T4)a1>>(0T2)c1') ?? []).map((o) => o.key + ' ' + Math.round(o.p * 100) + (o.rolled ? '' : ' certain')), ['miss 50', 'move 50'])
	const list = Q.branches(lim, s, '(0T4)a1>>(0T2)c1')
	const missed = Q.stateAfter(lim, s, '(0T4)a1>>(0T2)c1', list[0], list)
	eq('Q19 rolled Missed: the timeline opens, nobody arrives', [X(missed).tl[1], loc(missed, 0), Q.squareView(missed, sq('L+1:c1')).length], [[3, 3, 0, 2], ['L0:a1 100'], 0])
}
{ // Q20 budget rule per setup
	const sm = Q.newGame(V, { setup: 'small', timelines: '2' })
	const big = Q.newGame(V, { setup: 'standard', timelines: '2' })
	const many = Q.newGame(V, { setup: 'small', timelines: '3' })
	eq('Q20 limits', [Q.budgetInfo(V, sm, 0).limit, Q.budgetInfo(V, big, 1).limit, Q.budgetInfo(V, many, 0).limit], [8, 4, 4])
}
{ // Q21 a piece absent from the first world (a twin) can merge (core bug fix in perWorldMerge)
	const X0 = n5(0, 0, 2, 2)
	const A = P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 0, en: 4, boards: { 4: '4k/5/2N2/5/K4' } } } })
	const B = P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 0, en: 4, boards: { 4: '4k/5/4N/5/K4' } } } })
	setId(B, P.sqOf(0, 0, 4, 2), X0)
	const C = P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 0, en: 4, boards: { 4: '4k/5/5/5/K4' } } } })
	const s = stateOfWorlds([[C, 2], [A, 1], [B, 1]])
	eq('Q21 X absent from world 0', [s.worlds[0].b.ty[X0], loc(s, X0)], ['', ['off 50', 'L0:c3 25', 'L0:e3 25']])
	eq('Q21 merge legal', Q.isLegal(V, s, 'L0:c3|L0:e3-L0:d1'), true)
	eq('Q21 merge outcome', oc(s, 'L0:c3|L0:e3-L0:d1'), ['move 100 certain'])
	eq('Q21 merged', loc(run(s, ['L0:c3|L0:e3-L0:d1']), X0), ['off 50', 'L0:d1 50'])
}
{ // Q22 the phantom danger list never feeds the converging-capture check (no crash, union kept)
	const mk = (fen) => P.buildWorld({ n: 5, s: 1, rows: { 0: { st: 0, en: 5, boards: { 5: fen } } } })
	const A = mk('2k2/5/1N3/5/K4')
	const B = mk('2k2/4N/5/5/K4')
	setId(B, P.sqOf(0, 0, 4, 3), n5(0, 0, 1, 2))
	const s = stateOfWorlds([[A, 1], [B, 1]], 1)
	eq('Q22 danger (Black to move, White ghost knight)', Q.royalDanger(V, s, 1), 1)
	const g = P.generate(A, 0)
	eq('Q22 phantom list', g.map((m) => [m.key, m.id]), [['†', -1]])
}
{ // Q23 castling needs the same castling in every world (certain-only), en passant too
	const c = (fen) => P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 0, en: 8, boards: { 8: fen } } } })
	const A = c('k4/5/5/5/K*2NR*')
	const B = c('k4/5/5/1N3/K*3R*')
	setId(B, P.sqOf(0, 0, 1, 1), n5(0, 0, 3, 0))
	let s = stateOfWorlds([[A, 1], [B, 1]])
	eq('Q23 castling blocked by a ghost is illegal', legal(s, '(0T5)a1-c1'), false)
	const A2 = c('k4/5/5/1N3/K*3R*')
	const B2 = c('k4/5/1N3/5/K*3R*')
	setId(B2, P.sqOf(0, 0, 1, 2), n5(0, 0, 1, 1))
	s = stateOfWorlds([[A2, 1], [B2, 1]])
	eq('Q23 castling certain when free in every world', oc(s, '(0T5)a1-c1'), ['move 100 certain'])
}
{ // Q24 a Missed world still expires en passant (the idle board advances)
	const A = P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 0, en: 4, boards: { 4: '4k/3p*1/5/N1P*2/K4' } } } })
	const B = P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 0, en: 4, boards: { 4: '4k/3p*1/5/2P*2/K1N2' } } } })
	setId(B, P.sqOf(0, 0, 2, 0), n5(0, 0, 0, 1))
	let s = stateOfWorlds([[A, 1], [B, 1]])
	s = run(s, ['(0T3)c2-c4'])
	eq('Q24 ep set in every world', s.worlds.map(({ b }) => b.x.ep[0]), [2 * 8 + 2, 2 * 8 + 2])
	eq('Q24 ep legal and certain', oc(s, '(0T3)d4-c3'), ['capture 100 certain'])
}
{ // L1 no legal move: loss when a king can certainly be taken, else a draw
	const stuck = (fen) => stateOfWorlds([[P.buildWorld({ n: 5, s: 0, c: [1, 0], rows: { 0: { st: 0, en: 8, boards: { 8: '4k/5/5/5/5' } }, 1: { st: 7, en: 9, parent: [0, 6], boards: { 9: fen } } } }), 1]])
	const s1 = stuck('4k/5/5/5/r3K')
	eq('L1 no move', [Q.hasLegalMove(V, s1), P.mandatory(X(s1))], [false, [0]])
	eq('L1 stuck in danger', V.noMoves(s1), { winner: 1, reason: 'stuck' })
	eq('L1 stuck, no danger', V.noMoves(stuck('4k/5/5/5/4K')), { winner: null, reason: 'noMoves' })
}
{ // L2 the move limit and the quiet limit
	const s = { ...start(), ply: V.maxPly - 1 }
	eq('L2 move limit', play(s, '(0T1)d1-c3').result, { winner: null, reason: 'moveLimit' })
	const q = { ...start(), quiet: V.quietPlies - 1 }
	eq('L2 quiet', play(q, '(0T1)d1-c3').result, { winner: null, reason: 'quiet' })
	eq('L2 pawn resets', play(q, '(0T1)a2-a3').quiet, 0)
}
{ // A1 the computer's view keeps the mandatory boards only (plus king captures and hops onto mandatory boards)
	const s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3', '(0T2)c3>>(0T1)a3'])
	const view = V.aiView(s, 1)
	const all = keys(s)
	const pruned = keys(view)
	eq('A1 mandatory rows', P.mandatory(X(s)), [1])
	eq('A1 pruned ⊂ legal, fewer', [pruned.every((k) => all.includes(k)), pruned.length < all.length], [true, true])
	eq('A1 only the mandatory board or hops onto it', pruned.every((k) => k.startsWith('(+1T1)') || k.includes('>(+1T1)')), true)
	eq('A1 a hop onto the mandatory board is kept', pruned.some((k) => k.startsWith('(0T2)')), true)
	eq('A1 no mandatory boards: no pruning', V.aiView(start(), 0), start())
}
{ // A2 the computer finds a king capture in the past and plays a legal move from the start
	const b = P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 2, en: 6, boards: { 6: '3k1/5/4N/5/K4', 4: '4k/5/5/5/K4', 2: '4k/5/5/5/K4' } } } })
	const s = stateOfWorlds([[b, 1]])
	const { chooseMove } = await import('./core/ai.mjs')
	const code = await chooseMove(V, s, { level: 'normal', rng: () => 0.5 })
	eq('A2 a king capture', play(s, code).result, { winner: 0, reason: 'king' })
	const first = await chooseMove(V, start(), { level: 'easy', rng: () => 0.3 })
	eq('A2 a legal first move', Q.isLegal(V, start(), first), true)
}
{ // R1 the history record keeps the travel for the arrows; a rolled Missed keeps none
	const s = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3', '(0T2)c3>>(0T1)a3'])
	eq('R1 arrow', s.history.at(-1).info, { rows: [1], arrows: [[0, 2, 2, 2, 1, 1, 0, 2]] })
	const m = run(q1(), ['(0T1)a4-a3', ['(0T2)c3>>(0T1)c5', 0]])
	eq('R1 missed: rows only', m.history.at(-1).info, { rows: [1], arrows: [] })
}

{ // Q25 a part rejoins its other part on another timeline (the core's join rule): no roll, both boards pass
	const mk = (l0, l1) => P.buildWorld({ n: 5, s: 0, c: [1, 0], rows: { 0: { st: 0, en: 4, boards: { 4: l0 } }, 1: { st: 3, en: 4, parent: [0, 2], boards: { 4: l1 } } } })
	const A = mk('4k/5/N4/5/K4', '4k/5/5/5/K4')
	const B = mk('4k/5/5/5/K4', '4k/5/2N2/5/K4')
	setId(B, P.sqOf(1, 0, 2, 2), n5(0, 0, 0, 2))
	let s = stateOfWorlds([[A, 1], [B, 1]])
	eq('Q25 hop onto the own part', oc(s, '(0T3)a3>(+1T3)c3'), ['move 100 certain'])
	s = run(s, ['(0T3)a3>(+1T3)c3'])
	eq('Q25 rejoined', [loc(s, n5(0, 0, 0, 2)), X(s).tl[0][1], X(s).tl[1][1]], [['L+1:c3 100'], 5, 5])
}
{ // Q26 two parts on one board merge in the past: the new timeline gets the whole knight
	const mk = (fen) => P.buildWorld({ n: 5, s: 0, rows: { 0: { st: 0, en: 4, boards: { 4: fen, 2: '4k/5/5/5/K4', 0: '4k/5/5/5/K4' } } } })
	const A = mk('4k/5/5/5/KN3')
	const B = mk('4k/5/5/5/K2N1')
	setId(B, P.sqOf(0, 0, 3, 0), n5(0, 0, 1, 0))
	const s = stateOfWorlds([[A, 1], [B, 1]])
	const code = 'L0:b1|L0:d1-L0~1:c1'
	eq('Q26 merge into the past', oc(s, code), ['move 100 certain'])
	const t = run(s, [code])
	eq('Q26 knight whole on L+1', [loc(t, n5(0, 0, 1, 0)), X(t).tl[1], t.worlds.length], [['L+1:c1 100'], [1, 1, 0, 0], 2])
}
// ---------------------------------------------------------------- UI
{
	const s = start()
	const L = layoutOf(s)
	eq('U1 start', [L.cells.length, L.layout.boards.map((b) => b.label), L.layout.areas.map((a) => a.shade).sort(), L.layout.outlines.length], [25, ['L0 T1 ○'], ['frame', 'wood'], 4])
	eq('U1 phone shape', L.layout.height >= 0.75 * L.layout.width, true)
	const t = run(start(), ['(0T1)d1-c3', '(0T1)a4-a3', '(0T2)c3>>(0T1)a3'])
	const M = layoutOf(t)
	eq('U2 rows, connector, halos', [M.layout.labels.filter((l) => /^L/.test(l.text)).map((l) => l.text), M.layout.lines.length, M.layout.areas.map((a) => a.shade).sort()], [['L0', 'L+1'], 1, ['frame', 'river', 'wood']])
	eq('U2 L+1 drawn below L0', M.layout.labels.find((l) => l.text === 'L+1').y > M.layout.labels.find((l) => l.text === 'L0').y, true)
	eq('U2 travel arrow (shaft + head)', M.layout.outlines.length, 4 + 4 + 3)
	const u = run(t, ['(+1T1)e4-e3'])
	eq('U3 focus key kept inside a turn when the present stays', [layoutOf(u).layout.focus.key === M.layout.focus.key, u.turn], [false, 1])
	const o = run(t, ['(0T2)b4-b3'])
	eq('U3 focus key kept by a move on an optional board (same turn, present, rows)', [layoutOf(o).layout.focus.key === M.layout.focus.key, o.turn], [true, 1])
	const B = layoutOf({ ...t, options: { ...t.options, view: 'black' } })
	eq('U4 black view: rows reversed, time left to right', [B.layout.labels.find((l) => l.text === 'L+1').y < B.layout.labels.find((l) => l.text === 'L0').y,
		B.layout.boards.find((b) => b.label === 'T1 ○').x < B.layout.boards.find((b) => b.label === 'L0 T2 ●').x], [true, true])
	eq('U5 names', M.names[sq('L+1:a3')], 'Timeline +1, turn 1, Black to move: a3')
}
console.log(`${passed} passed, ${failed} failed`)
