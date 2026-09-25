// Every test case of handoff/research/capablanca.md section 7, run on the prototype (real core).
// Run: node handoff/prototypes/capablanca/cases.mjs
import { CAPA as V } from './proto.mjs'
import { stateOf, show, outs, after, codes, newGame, pieces, rights, check, summary } from './lib.mjs'
import { legal } from './perft.mjs'
import { generate, attacks, nameOf } from '../../../src/variants/core/world.js'
import { budget, pieceLocations, legalMoves, T } from '../../../src/variants/core/quantum.js'

const sq = (n) => V.topology.byName(n)
const one = (s) => s.worlds.length === 1 ? pieces(V, s.worlds[0].b) : show(V, s)
const locs = (s, name) => {
	const id = s.worlds.find(({ b }) => b.board[sq(name)] >= 0).b.board[sq(name)]
	return pieceLocations(s, id).map((l) => (l.sq >= 0 ? nameOf(V, l.sq) : l.sq) + ' ' + l.p)
}

// ---------------------------------------------------------------- T1 setup
{
	const s = newGame(V, {})
	const b = s.worlds[0].b
	check('T1 setup', pieces(V, b), 'Ac1 Bd1 Bg1 Ch1 Kf1 Nb1 Ni1 Pa2 Pb2 Pc2 Pd2 Pe2 Pf2 Pg2 Ph2 Pi2 Pj2 Qe1 Ra1 Rj1 ac8 bd8 bg8 ch8 kf8 nb8 ni8 pa7 pb7 pc7 pd7 pe7 pf7 pg7 ph7 pi7 pj7 qe8 ra8 rj8')
	check('T1 rights', b.x.castle.map((c) => c.flag + ':' + nameOf(V, c.king) + '>' + nameOf(V, c.kingTo) + ',' + nameOf(V, c.rook) + '>' + nameOf(V, c.rookTo)),
		['K:f1>i1,j1>h1', 'Q:f1>c1,a1>d1', 'k:f8>i8,j8>h8', 'q:f8>c8,a8>d8'])
	check('T1 squares', [V.topology.size, sq('a1'), sq('j1'), sq('a2'), sq('f1'), sq('a8'), sq('j8')], [80, 0, 9, 10, 5, 70, 79])
	check('T1 shades', ['a1', 'j1', 'f1', 'f8', 'd1', 'g1'].map((n) => V.topology.cells[sq(n)].shade), ['dark', 'light', 'light', 'dark', 'light', 'dark'])
	const c = codes(V, s)
	check('T1 first moves', [c.length, c.filter((x) => x.startsWith('c1') || x.startsWith('h1')).sort()], [28, ['c1-b3', 'c1-d3', 'h1-g3', 'h1-i3']])
	const sp = codes(V, s, { splits: true }).filter((x) => x.includes('|')).sort()
	check('T1 first splits', sp, ['b1-a3|c3', 'c1-b3|d3', 'h1-g3|i3', 'i1-h3|j3'])
	// the pawns no piece of their own side protects
	const bare = (side, rank) => 'abcdefghij'.split('').map((f) => f + rank).filter((n) => !attacks(V, b, side, sq(n)))
	check('T1 unprotected pawns', [bare(0, 2), bare(1, 7)], [['i2'], ['i7']])
}

// ---------------------------------------------------------------- T2 archbishop and chancellor
{
	const count = (type) => {
		const s = stateOf(V, [[{ e4: '0:' + type, a1: '0:k', j8: '1:k' }, 1]])
		return codes(V, s).filter((x) => x.startsWith('e4-')).sort()
	}
	const a = count('a')
	const c = count('c')
	check('T2 archbishop e4', [a.length, a.join(' ')], [22, 'e4-a8 e4-b1 e4-b7 e4-c2 e4-c3 e4-c5 e4-c6 e4-d2 e4-d3 e4-d5 e4-d6 e4-f2 e4-f3 e4-f5 e4-f6 e4-g2 e4-g3 e4-g5 e4-g6 e4-h1 e4-h7 e4-i8'])
	check('T2 chancellor e4', [c.length, c.join(' ')], [24, 'e4-a4 e4-b4 e4-c3 e4-c4 e4-c5 e4-d2 e4-d4 e4-d6 e4-e1 e4-e2 e4-e3 e4-e5 e4-e6 e4-e7 e4-e8 e4-f2 e4-f4 e4-f6 e4-g3 e4-g4 e4-g5 e4-h4 e4-i4 e4-j4'])
	check('T2 queen e4', count('q').length, 30)
	// boxed in by own pawns: the knight part still jumps
	const s = stateOf(V, [[{ e4: '0:c', d4: '0:p', f4: '0:p', e5: '0:p', e3: '0:p', a1: '0:k', j8: '1:k', f6: '1:n' }, 1]])
	check('T2 chancellor boxed in', codes(V, s).filter((x) => x.startsWith('e4-')).sort(), ['e4-c3', 'e4-c5', 'e4-d2', 'e4-d6', 'e4-f2', 'e4-f6', 'e4-g3', 'e4-g5'])
}

// ---------------------------------------------------------------- T3 castling both ways
{
	const s = stateOf(V, [[{ a1: '0:r', f1: '0:k', j1: '0:r', f8: '1:k' }, 1]], 0, { castle: true })
	const cm = legalMoves(V, s).filter((m) => m.kind === 'castle').map((m) => m.code + ' to ' + nameOf(V, m.to))
	check('T3 castling moves', cm, ['O-O to i1', 'O-O-O to c1'])
	check('T3 O-O outcomes', outs(V, s, 'O-O'), 'move 1')
	const a = after(V, s, 'O-O')
	check('T3 O-O', [one(a), rights(a.worlds[0].b)], ['Kf8 Ki1 Ra1 Rh1'.replace('Kf8', 'kf8').split(' ').sort().join(' '), ''])
	const q = after(V, s, 'O-O-O')
	check('T3 O-O-O', [one(q), rights(q.worlds[0].b)], [['Kc1', 'Rd1', 'Rj1', 'kf8'].sort().join(' '), ''])
	const bs = stateOf(V, [[{ f1: '0:k', a8: '1:r', f8: '1:k', j8: '1:r' }, 1]], 1, { castle: true })
	check('T3 black O-O / O-O-O', [one(after(V, bs, 'O-O')), one(after(V, bs, 'O-O-O'))],
		[['Kf1', 'ki8', 'ra8', 'rh8'].sort().join(' '), ['Kf1', 'kc8', 'rd8', 'rj8'].sort().join(' ')])
}

// ---------------------------------------------------------------- T4 castling blocked; no check rule
{
	const cas = (pl) => codes(V, stateOf(V, [[pl, 1]], 0, { castle: true })).filter((x) => x.startsWith('O'))
	const base = { a1: '0:r', f1: '0:k', j1: '0:r', f8: '1:k' }
	check('T4 b1 blocks O-O-O', cas({ ...base, b1: '0:n' }), ['O-O'])
	check('T4 e1 blocks O-O-O', cas({ ...base, e1: '0:q' }), ['O-O'])
	check('T4 g1 blocks O-O', cas({ ...base, g1: '0:b' }), ['O-O-O'])
	check('T4 i1 (enemy) blocks O-O', cas({ ...base, i1: '1:n' }), ['O-O-O'])
	// attacked squares do not matter in Quantum Chess (FIDE / Fairy-Stockfish would forbid both)
	const pl = { a1: '0:r', f1: '0:k', j1: '0:r', j8: '1:k', g8: '1:r', e8: '1:r' }
	const s = stateOf(V, [[pl, 1]], 0, { castle: true })
	const fsf = legal(s.worlds[0].b, 0).filter(([m]) => m.kind === 'castle').map(([m]) => m.key)
	check('T4 castling through attack', [cas(pl), fsf], [['O-O', 'O-O-O'], []])
}

// ---------------------------------------------------------------- T5 castling rights
{
	let s = newGame(V, {})
	for (const m of ['j2-j4', 'j7-j5', 'j1-j3', 'a7-a6', 'j3-j1', 'a6-a5']) s = after(V, s, m)
	check('T5 rook went and came back', rights(s.worlds[0].b), 'Qkq')
	s = after(V, s, 'e2-e3')
	s = after(V, s, 'f8'.length && 'e7-e6')
	s = after(V, s, 'f1-e2')
	check('T5 king moved', rights(s.worlds[0].b), 'kq')
	let c = stateOf(V, [[{ a1: '0:r', f1: '0:k', j1: '0:r', f8: '1:k', j8: '1:r' }, 1]], 1, { castle: true })
	c = after(V, c, 'j8-j1')
	check('T5 rook captured on j1', [outs(V, stateOf(V, [[{ a1: '0:r', f1: '0:k', j1: '0:r', f8: '1:k', j8: '1:r' }, 1]], 1, { castle: true }), 'j8-j1'), rights(c.worlds[0].b)], ['capture 1', 'Q'])
}

// ---------------------------------------------------------------- T6 promotion
{
	const s = stateOf(V, [[{ e7: '0:p', a1: '0:k', j8: '1:k', d8: '1:n' }, 1]])
	check('T6 promotion choices', codes(V, s).filter((x) => x.startsWith('e7')),
		['e7-e8=q', 'e7-e8=c', 'e7-e8=a', 'e7-e8=r', 'e7-e8=b', 'e7-e8=n', 'e7-d8=q', 'e7-d8=c', 'e7-d8=a', 'e7-d8=r', 'e7-d8=b', 'e7-d8=n'])
	check('T6 no plain e7-e8', codes(V, s).includes('e7-e8'), false)
	const n = after(V, s, 'e7-e8=c')
	const w = n.worlds[0].b
	const g = [...generate(V, w, 0).keys()].filter((k) => k.startsWith('e8-')).sort()
	check('T6 new chancellor moves', [w.ty[w.board[sq('e8')]], g.length, g.includes('e8-f6'), g.includes('e8-d8'), g.includes('e8-j8'), g.includes('e8-e1')], ['c', 17, true, true, true, true])
	const bs = stateOf(V, [[{ c2: '1:p', a1: '0:k', j8: '1:k' }, 1]], 1)
	check('T6 black promotes on rank 1', codes(V, bs).filter((x) => x.startsWith('c2')), ['c2-c1=q', 'c2-c1=c', 'c2-c1=a', 'c2-c1=r', 'c2-c1=b', 'c2-c1=n'])
}

// ---------------------------------------------------------------- T7 double step and en passant on the j-file
{
	let s = stateOf(V, [[{ j2: '0:p', i4: '1:p', a1: '0:k', a8: '1:k' }, 1]])
	check('T7 j2 moves', codes(V, s).filter((x) => x.startsWith('j2')), ['j2-j3', 'j2-j4'])
	s = after(V, s, 'j2-j4')
	check('T7 ep square', nameOf(V, s.worlds[0].b.x.ep), 'j3')
	check('T7 i4 moves', codes(V, s).filter((x) => x.startsWith('i4')).sort(), ['i4-i3', 'i4-j3'])
	check('T7 ep outcome', outs(V, s, 'i4-j3'), 'capture 1')
	check('T7 after ep', one(after(V, s, 'i4-j3')), ['Ka1', 'ka8', 'pj3'].sort().join(' '))
	// a double step from rank 3 is not allowed
	const s3 = stateOf(V, [[{ c3: '0:p', a1: '0:k', a8: '1:k' }, 1]])
	check('T7 no double step from rank 3', codes(V, s3).filter((x) => x.startsWith('c3')), ['c3-c4'])
}

// ---------------------------------------------------------------- T8 the Fairy-Stockfish castling position
{
	let s = newGame(V, {})
	for (const m of ['b2-b4', 'f7-f5', 'c2-c3', 'g8-d5', 'a2-a4', 'h8-g6', 'f2-f3', 'i8-h6', 'h2-h3']) s = after(V, s, m)
	const c = codes(V, s)
	check('T8 black moves (55, as in Fairy-Stockfish)', [c.length, c.includes('O-O'), c.includes('O-O-O')], [55, true, false])
	const fsf = ['f5f4', 'a7a6', 'b7b6', 'c7c6', 'd7d6', 'e7e6', 'i7i6', 'j7j6', 'a7a5', 'b7b5', 'c7c5', 'e7e5', 'i7i5', 'j7j5', 'b8a6', 'b8c6', 'h6g4', 'h6i4', 'h6j5', 'h6f7', 'h6g8', 'h6i8', 'd5a2', 'd5b3', 'd5f3', 'd5c4', 'd5e4', 'd5c6', 'd5e6', 'd5f7', 'd5g8', 'j8g8', 'j8h8', 'j8i8', 'e8f7', 'c8b6', 'c8d6', 'g6g2', 'g6g3', 'g6f4', 'g6g4', 'g6h4', 'g6e5', 'g6g5', 'g6i5', 'g6a6', 'g6b6', 'g6c6', 'g6d6', 'g6e6', 'g6f6', 'g6h8', 'f8f7', 'f8g8', 'f8i8']
	const uci = c.map((k) => (k === 'O-O' ? 'f8i8' : k === 'O-O-O' ? 'f8c8' : k.replace('-', '').replace('=', ''))).sort()
	check('T8 same set as Fairy-Stockfish test.py', uci, [...fsf].sort())
	s = after(V, s, 'O-O')
	check('T8 black castled', s.worlds[0].b.ty[s.worlds[0].b.board[sq('i8')]] + s.worlds[0].b.ty[s.worlds[0].b.board[sq('h8')]], 'kr')
}

// ---------------------------------------------------------------- T9 perft with the classical legality filter
{
	const w = V.setup({})
	const perft = (b, side, d) => (d === 0 ? 1 : legal(b, side).reduce((a, [, n]) => a + perft(n, 1 - side, d - 1), 0))
	check('T9 perft 1-3 (depth 4 = 805128 in perft.mjs)', [1, 2, 3].map((d) => perft(w, 0, d)), [28, 784, 25228])
}

// ---------------------------------------------------------------- Q1 own chancellor ghost on the castling path
{
	const s = stateOf(V, [
		[{ a1: '0:r', f1: '0:k', j1: '0:r', h1: '0:c', f8: '1:k' }, 1],
		[{ a1: '0:r', f1: '0:k', j1: '0:r', h3: '0:c', f8: '1:k' }, 1],
	], 0, { castle: true })
	check('Q1 O-O outcomes', outs(V, s, 'O-O'), 'miss 0.5 R | move 0.5 R')
	check('Q1 O-O missed', [one(after(V, s, 'O-O', 0)), rights(after(V, s, 'O-O', 0).worlds[0].b)], [['Ch1', 'Kf1', 'Ra1', 'Rj1', 'kf8'].sort().join(' '), 'KQ'])
	check('Q1 O-O moved', [one(after(V, s, 'O-O', 1)), rights(after(V, s, 'O-O', 1).worlds[0].b)], [['Ch3', 'Ki1', 'Ra1', 'Rh1', 'kf8'].sort().join(' '), ''])
	check('Q1 O-O-O certain', outs(V, s, 'O-O-O'), 'move 1')
}

// ---------------------------------------------------------------- Q2 castling right linked to a ghost (pass = link)
{
	let s = stateOf(V, [
		[{ a1: '0:r', f1: '0:k', j1: '0:r', f8: '1:k', j4: '1:n' }, 1],
		[{ a1: '0:r', f1: '0:k', j1: '0:r', f8: '1:k', a6: '1:n' }, 1],
	], 0, { castle: true })
	check('Q2 j1-j6 outcomes', outs(V, s, 'j1-j6'), 'move 1')
	s = after(V, s, 'j1-j6')
	check('Q2 after j1-j6', show(V, s), [
		'0.5000 Kf1 Ra1 Rj6 kf8 na6 castle=Q',
		'0.5000 Kf1 Ra1 Rj1 kf8 nj4 castle=KQ',
	])
	s = after(V, s, 'f8-e8')
	check('Q2 O-O outcomes', outs(V, s, 'O-O'), 'miss 0.5 R | move 0.5 R')
	check('Q2 O-O moved', one(after(V, s, 'O-O', 1)), ['Ki1', 'Ra1', 'Rh1', 'ke8', 'nj4'].sort().join(' '))
}

// ---------------------------------------------------------------- Q3 chancellor: the jump is certain, the slide links
{
	const s = stateOf(V, [
		[{ e4: '0:c', a1: '0:k', j8: '1:k', e5: '1:n' }, 1],
		[{ e4: '0:c', a1: '0:k', j8: '1:k', g5: '1:n' }, 1],
	])
	check('Q3 e4-f6 (jump)', outs(V, s, 'e4-f6'), 'move 1')
	check('Q3 e4-f6 result', one(after(V, s, 'e4-f6')).length > 0 && after(V, s, 'e4-f6').worlds.every(({ b }) => b.board[sq('f6')] >= 0), true)
	check('Q3 e4-e7 (slide past the ghost)', outs(V, s, 'e4-e7'), 'move 1')
	check('Q3 e4-e7 linked', show(V, after(V, s, 'e4-e7')).sort(), ['0.5000 Ce4 Ka1 kj8 ne5 castle=', '0.5000 Ce7 Ka1 kj8 ng5 castle='])
	check('Q3 e4-e5 (land on the ghost)', outs(V, s, 'e4-e5'), 'move 0.5 R | capture 0.5 R')
}

// ---------------------------------------------------------------- Q4 archbishop split: a jump and a blocked slide
{
	const s = stateOf(V, [
		[{ c1: '0:a', f1: '0:k', f8: '1:k', e3: '1:n' }, 1],
		[{ c1: '0:a', f1: '0:k', f8: '1:k', h6: '1:n' }, 1],
	])
	check('Q4 split outcomes', outs(V, s, 'c1-d3|g5'), 'split 1')
	const n = after(V, s, 'c1-d3|g5')
	check('Q4 archbishop locations', locs(n, 'd3'), ['c1 0.25', 'd3 0.5', 'g5 0.25'])
	check('Q4 worlds and budget', [n.worlds.length, budget(n, 0)], [4, 3])
}

// ---------------------------------------------------------------- Q5 promotion to a chancellor onto a ghost
{
	const s = stateOf(V, [
		[{ g7: '0:p', a1: '0:k', a8: '1:k', h8: '1:n' }, 1],
		[{ g7: '0:p', a1: '0:k', a8: '1:k', d5: '1:n' }, 1],
	])
	check('Q5 g7-h8=c', outs(V, s, 'g7-h8=c'), 'miss 0.5 R | capture 0.5 R')
	check('Q5 captured', one(after(V, s, 'g7-h8=c', 1)), ['Ch8', 'Ka1', 'ka8'].sort().join(' '))
	check('Q5 missed', one(after(V, s, 'g7-h8=c', 0)), ['Ka1', 'Pg7', 'ka8', 'nd5'].sort().join(' '))
	check('Q5 g7-g8=a certain', outs(V, s, 'g7-g8=a'), 'move 1')
}

// ---------------------------------------------------------------- Q6 converging capture of the king (jump + slide)
{
	const s = stateOf(V, [
		[{ c6: '0:c', a1: '0:k', e7: '1:k' }, 1],
		[{ e2: '0:c', a1: '0:k', e7: '1:k' }, 1],
	])
	check('Q6 merge listed', codes(V, s).includes('e2|c6-e7'), true)
	check('Q6 e2|c6-e7', outs(V, s, 'e2|c6-e7'), 'capture 1')
	const n = after(V, s, 'e2|c6-e7')
	check('Q6 result', [one(n), n.result], [['Ce7', 'Ka1'].join(' '), { winner: 0, reason: 'king' }])
	// a black knight that is 50 % on e5 may block the slide from e2: now it is a roll
	const b = stateOf(V, [
		[{ c6: '0:c', a1: '0:k', e7: '1:k', e5: '1:n' }, 1],
		[{ c6: '0:c', a1: '0:k', e7: '1:k', g4: '1:n' }, 1],
		[{ e2: '0:c', a1: '0:k', e7: '1:k', e5: '1:n' }, 1],
		[{ e2: '0:c', a1: '0:k', e7: '1:k', g4: '1:n' }, 1],
	])
	check('Q6 blocked slide', outs(V, b, 'e2|c6-e7'), 'miss 0.25 R | capture 0.75 R')
	check('Q6 blocked slide missed', show(V, after(V, b, 'e2|c6-e7', 0)), ['1.0000 Ce2 Ka1 ke7 ne5 castle='])
}

// ---------------------------------------------------------------- Q7 one part of an archbishop takes the king
{
	const s = stateOf(V, [
		[{ d5: '0:a', j1: '0:k', e7: '1:k' }, 1],
		[{ b1: '0:a', j1: '0:k', e7: '1:k' }, 1],
	])
	check('Q7 d5-e7', outs(V, s, 'd5-e7'), 'miss 0.5 R | capture 0.5 R')
	check('Q7 win', after(V, s, 'd5-e7', 1).result, { winner: 0, reason: 'king' })
	check('Q7 missed', [after(V, s, 'd5-e7', 0).result, one(after(V, s, 'd5-e7', 0))], [null, ['Ab1', 'Kj1', 'ke7'].sort().join(' ')])
}

// ---------------------------------------------------------------- Q8 double step past a ghost, then en passant
{
	let s = stateOf(V, [
		[{ e2: '0:p', a1: '0:k', a8: '1:k', d4: '1:p', e3: '1:n' }, 1],
		[{ e2: '0:p', a1: '0:k', a8: '1:k', d4: '1:p', c6: '1:n' }, 1],
	])
	check('Q8 e2-e4', outs(V, s, 'e2-e4'), 'miss 0.5 R | move 0.5 R')
	s = after(V, s, 'e2-e4', 1)
	check('Q8 after e2-e4', show(V, s), ['1.0000 Ka1 Pe4 ka8 nc6 pd4 castle= ep=e3'])
	check('Q8 en passant', outs(V, s, 'd4-e3'), 'capture 1')
}

// ---------------------------------------------------------------- Q9 split the chancellor out of the way, then castle
{
	let s = stateOf(V, [[{ a1: '0:r', f1: '0:k', h1: '0:c', j1: '0:r', f8: '1:k' }, 1]], 0, { castle: true })
	check('Q9 no O-O yet', codes(V, s).filter((x) => x.startsWith('O')), ['O-O-O'])
	s = after(V, s, 'h1-g3|i3')
	s = after(V, s, 'f8-e8')
	check('Q9 O-O certain', outs(V, s, 'O-O'), 'move 1')
	const n = after(V, s, 'O-O')
	check('Q9 after O-O', show(V, n).sort(), ['0.5000 Cg3 Ki1 Ra1 Rh1 ke8 castle=', '0.5000 Ci3 Ki1 Ra1 Rh1 ke8 castle='])
}

summary()
