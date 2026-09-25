// The test cases of handoff/research/xiangqi.md section 7, run on the real core. Usage: node cases.mjs
import { OFF, placePiece } from '../../../src/variants/core/world.js'
import {
	V, after, budget, check, codes, failures, locs, newGame, outs, royalDanger, show, splitsFrom, stateOf,
} from './lib.mjs'

const sq = (n) => V.topology.byName(n)
/** Targets of the ordinary moves from a square, sorted by name. */
const targets = (s, from) => codes(s).filter((c) => c.startsWith(from + '-') && !c.includes('|')).map((c) => c.split('-')[1]).sort()

// T1 start position
{
	const s = newGame(V)
	const list = codes(s)
	check('T1 start: 44 moves', list.length, 44)
	check('T1 horse b1', targets(s, 'b1'), ['a3', 'c3'])
	check('T1 elephant c1', targets(s, 'c1'), ['a3', 'e3'])
	check('T1 advisor d1', targets(s, 'd1'), ['e2'])
	check('T1 general e1', targets(s, 'e1'), ['e2'])
	check('T1 soldier e4', targets(s, 'e4'), ['e5'])
	check('T1 chariot a1', targets(s, 'a1'), ['a2', 'a3'])
	check('T1 cannon b3', targets(s, 'b3'), ['a3', 'b10', 'b2', 'b4', 'b5', 'b6', 'b7', 'c3', 'd3', 'e3', 'f3', 'g3'])
	check('T1 b3-b10 captures the horse', outs(s, 'b3-b10'), ['capture 1.0000'])
	check('T1 b3-b8 illegal (no screen)', outs(s, 'b3-b8'), null)
	check('T1 budget', [budget(s, 0), budget(s, 1)], [1, 1])
}

// T2 hobbling the horse
{
	const s = stateOf([[{ d1: '0:k', e5: '0:h', d6: '0:p', f10: '1:k', d7: '1:h' }, 1]])
	check('T2 red horse e5', targets(s, 'e5'), ['c4', 'c6', 'd3', 'd7', 'f3', 'f7', 'g4', 'g6'])
	check('T2 e5-d7 captures', outs(s, 'e5-d7'), ['capture 1.0000'])
	const b = stateOf([[{ d1: '0:k', e5: '0:h', d6: '0:p', f10: '1:k', d7: '1:h' }, 1]], 1)
	check('T2 black horse d7 (leg d6 blocks c5 and e5)', targets(b, 'd7'), ['b6', 'b8', 'c9', 'e9', 'f6', 'f8'])
	check('T2 d7-e5 illegal', outs(b, 'd7-e5'), null)
	const c = stateOf([[{ d1: '0:k', e5: '0:h', e6: '1:p', d5: '0:c', f10: '1:k' }, 1]])
	check('T2 horse e5 with legs e6 and d5 blocked', targets(c, 'e5'), ['d3', 'f3', 'g4', 'g6'])
}

// T3 elephant: eye and river
{
	const s = stateOf([[{ d1: '0:k', c5: '0:e', f10: '1:k' }, 1]])
	check('T3 elephant c5 never crosses', targets(s, 'c5'), ['a3', 'e3'])
	const b = stateOf([[{ d1: '0:k', c5: '0:e', d4: '1:p', a3: '1:r', f10: '1:k' }, 1]])
	check('T3 eye d4 blocks c5-e3; a3 captured', targets(b, 'c5'), ['a3'])
	check('T3 c5-a3', outs(b, 'c5-a3'), ['capture 1.0000'])
	const e = stateOf([[{ d1: '0:k', e3: '0:e', f10: '1:k' }, 1]])
	check('T3 elephant e3', targets(e, 'e3'), ['c1', 'c5', 'g1', 'g5'])
}

// T4 cannon: one screen, own or enemy; never two
{
	let s = newGame(V)
	s = after(s, 'h3-e3')
	s = after(s, 'h10-g8')
	check('T4 central cannon e3-e7 captures over its own soldier', outs(s, 'e3-e7'), ['capture 1.0000'])
	check('T4 e3-e10 illegal (two screens)', outs(s, 'e3-e10'), null)
	check('T4 e3-e5 illegal (the cannon cannot pass e4)', outs(s, 'e3-e5'), null)
}

// T5 soldier
{
	const s = stateOf([[{ d1: '0:k', e4: '0:p', a6: '0:p', i10: '0:p', f10: '1:k', e5: '1:p' }, 1]])
	check('T5 red soldier e4 (own half)', targets(s, 'e4'), ['e5'])
	check('T5 red soldier a6 (crossed)', targets(s, 'a6'), ['a7', 'b6'])
	check('T5 red soldier i10 (last rank)', targets(s, 'i10'), ['h10'])
	const b = stateOf([[{ d1: '0:k', e4: '0:p', f10: '1:k', e5: '1:p' }, 1]], 1)
	check('T5 black soldier e5 (crossed)', targets(b, 'e5'), ['d5', 'e4', 'f5'])
}

// T6 general and advisor stay in the palace
{
	const s = stateOf([[{ d3: '0:k', e2: '0:a', f10: '1:k' }, 1]])
	check('T6 general d3', targets(s, 'd3'), ['d2', 'e3'])
	check('T6 advisor e2', targets(s, 'e2'), ['d1', 'f1', 'f3'])
}

// T7 the flying general captures
{
	const s = stateOf([[{ d1: '0:k', a1: '0:r', d10: '1:k', i10: '1:r' }, 1]])
	check('T7 d1-d10 legal', outs(s, 'd1-d10'), ['capture 1.0000'])
	check('T7 result', after(s, 'd1-d10').result, { winner: 0, reason: 'general' })
	const b = stateOf([[{ d1: '0:k', a1: '0:r', d5: '1:c', d10: '1:k', i10: '1:r' }, 1]])
	check('T7 blocked file: no fly', outs(b, 'd1-d10'), null)
}

// T8 opening the file loses (suicide)
{
	let s = stateOf([[{ d1: '0:k', d5: '0:r', a1: '0:r', d10: '1:k', i10: '1:r' }, 1]])
	check('T8 danger before', royalDanger(V, s, 0), 0)
	s = after(s, 'd5-h5')
	check('T8 danger after d5-h5', royalDanger(V, s, 0), 1)
	check('T8 d10-d1', outs(s, 'd10-d1'), ['capture 1.0000'])
	check('T8 result', after(s, 'd10-d1').result, { winner: 1, reason: 'general' })
}

// T9 no legal move is a loss
{
	let s = stateOf([[{ e1: '0:k', d1: '0:a', f1: '0:a', e2: '0:c', d10: '1:k', d2: '1:p', f2: '1:p', e4: '1:p' }, 1]], 1)
	s = after(s, 'e4-e3')
	check('T9 result after e4-e3', s.result, { winner: 1, reason: 'noMoves' })
	const q = stateOf([[{ e1: '0:k', d1: '0:a', f1: '0:a', e2: '0:c', d10: '1:k', d2: '1:p', f2: '1:p', e5: '1:p' }, 1]], 1)
	check('T9 red still has a move with the soldier on e4', after(q, 'e5-e4').result, null)
}

// T10 no piece that can cross the river: draw, unless the generals face each other
{
	const s = stateOf([[{ f2: '0:k', d1: '0:a', d9: '1:k', e2: '1:p' }, 1]])
	check('T10 f2-e2', outs(s, 'f2-e2'), ['capture 1.0000'])
	check('T10 result', after(s, 'f2-e2').result, { winner: null, reason: 'noAttackers' })
	const f = stateOf([[{ f2: '0:k', d1: '0:a', e9: '1:k', e2: '1:p' }, 1]])
	const a = after(f, 'f2-e2')
	check('T10 facing: game goes on', a.result, null)
	check('T10 facing: black flies', outs(a, 'e9-e2'), ['capture 1.0000'])
}

// Q1 a ghost screen for a cannon (land = roll), and pass = link
{
	const s = stateOf([
		[{ d1: '0:k', b3: '0:c', f10: '1:k', b6: '1:h', b9: '1:r' }, 1],
		[{ d1: '0:k', b3: '0:c', f10: '1:k', d6: '1:h', b9: '1:r' }, 1],
	])
	check('Q1 b3-b9', outs(s, 'b3-b9'), ['miss 0.5000 R', 'capture 0.5000 R'])
	check('Q1 b3-b9 captured', show(after(s, 'b3-b9', 1)), ['1.0000 Kd1 Cb9 kf10 hb6'])
	check('Q1 b3-b9 missed', show(after(s, 'b3-b9', 0)), ['1.0000 Kd1 Cb3 kf10 hd6 rb9'])
	check('Q1 b3-b8 (pass = link)', outs(s, 'b3-b8'), ['move 1.0000'])
	const l = after(s, 'b3-b8')
	check('Q1 cannon after b3-b8', locs(l, 'b8'), 'b3 0.5000, b8 0.5000')
	check('Q1 budget after link', budget(l, 0), 2)
	check('Q1 b3-b6 (target maybe occupied)', outs(s, 'b3-b6'), ['miss 0.5000 R', 'move 0.5000 R'])
}

// Q2 a ghost cannot be its own screen
{
	const s = stateOf([
		[{ d1: '0:k', b3: '0:c', f10: '1:k', b6: '1:h' }, 1],
		[{ d1: '0:k', b3: '0:c', f10: '1:k', b9: '1:h' }, 1],
	])
	check('Q2 b3-b9 illegal', outs(s, 'b3-b9'), null)
	check('Q2 b3-b6', outs(s, 'b3-b6'), ['miss 0.5000 R', 'move 0.5000 R'])
}

// Q3 the flying general over a ghost blocker
{
	const s = stateOf([
		[{ d1: '0:k', d5: '0:r', a1: '0:r', d10: '1:k', i10: '1:r' }, 1],
		[{ d1: '0:k', h5: '0:r', a1: '0:r', d10: '1:k', i10: '1:r' }, 1],
	], 1)
	check('Q3 danger to Red', royalDanger(V, s, 0), 0.5)
	check('Q3 d10-d1', outs(s, 'd10-d1'), ['miss 0.5000 R', 'capture 0.5000 R'])
	check('Q3 capture result', after(s, 'd10-d1', 1).result, { winner: 1, reason: 'general' })
	check('Q3 miss: chariot now 100% d5', show(after(s, 'd10-d1', 0)), ['1.0000 Kd1 Rd5 Ra1 kd10 ri10'])
}

// Q4 a ghost on the horse's leg
{
	const s = stateOf([
		[{ d1: '0:k', e5: '0:h', f10: '1:k', e6: '1:r' }, 1],
		[{ d1: '0:k', e5: '0:h', f10: '1:k', a6: '1:r' }, 1],
	])
	check('Q4 e5-d7 (pass = link)', outs(s, 'e5-d7'), ['move 1.0000'])
	check('Q4 horse after e5-d7', locs(after(s, 'e5-d7'), 'd7'), 'e5 0.5000, d7 0.5000')
	check('Q4 e5-e6 not a horse move', outs(s, 'e5-e6'), null)
	const sp = after(s, 'e5-d7|f7')
	check('Q4 split e5-d7|f7', locs(sp, 'd7'), 'e5 0.5000, d7 0.2500, f7 0.2500')
	check('Q4 budget after split', budget(sp, 0), 3)
}

// Q5 soldiers are solid: land = roll; no sideways step before the river
{
	const s = stateOf([
		[{ d1: '0:k', e6: '0:p', e5: '0:p', f10: '1:k', d6: '1:h' }, 1],
		[{ d1: '0:k', e6: '0:p', e5: '0:p', f10: '1:k', d8: '1:h' }, 1],
	])
	check('Q5 e6-d6', outs(s, 'e6-d6'), ['move 0.5000 R', 'capture 0.5000 R'])
	check('Q5 e5-d5 illegal', outs(s, 'e5-d5'), null)
	check('Q5 soldier splits are impossible', splitsFrom(V, s, sq('e6')), [])
}

// Q6 advisor split inside the palace
{
	const s = stateOf([[{ e1: '0:k', e2: '0:a', f10: '1:k', a10: '1:r' }, 1]])
	check('Q6 advisor e2 splits', splitsFrom(V, s, sq('e2')).map((m) => m.code).sort(),
		['e2-d1|d3', 'e2-d1|f1', 'e2-d1|f3', 'e2-d3|f3', 'e2-f1|d3', 'e2-f1|f3'])
	check('Q6 general cannot split', splitsFrom(V, s, sq('e1')), [])
}

// Q7 elephant split with a ghost on one eye: that half stays home
{
	const s = stateOf([
		[{ d1: '0:k', e3: '0:e', f10: '1:k', d4: '1:h' }, 1],
		[{ d1: '0:k', e3: '0:e', f10: '1:k', i6: '1:h' }, 1],
	])
	const a = after(s, 'e3-c5|g5')
	check('Q7 elephant after split', locs(a, 'g5'), 'e3 0.2500, c5 0.2500, g5 0.5000')
	check('Q7 budget', budget(a, 0), 3)
	check('Q7 no split across the river', splitsFrom(V, s, sq('e3')).some((m) => /[6-9]|10/.test(m.code.split('-')[1])), false)
}

// Q8 converging capture of the general: preparation beats dice
{
	const s = stateOf([
		[{ d1: '0:k', a9: '0:r', e9: '1:k' }, 1],
		[{ d1: '0:k', e5: '0:r', e9: '1:k' }, 1],
	])
	check('Q8 a9|e5-e9', outs(s, 'a9|e5-e9'), ['capture 1.0000'])
	check('Q8 result', after(s, 'a9|e5-e9').result, { winner: 0, reason: 'general' })
	check('Q8 single part a9-e9', outs(s, 'a9-e9'), ['miss 0.5000 R', 'capture 0.5000 R'])
	check('Q8 danger ring (single moves only)', royalDanger(V, s, 1), 0.5)
}

// Q9 game-end roll on "no piece left that can cross the river"
{
	const s = stateOf([
		[{ e2: '0:k', d1: '0:a', d9: '1:k', e3: '1:h', a8: '1:r' }, 1],
		[{ e2: '0:k', d1: '0:a', d9: '1:k', g8: '1:h', e3: '1:r' }, 1, (w) => placePiece(w, w.board[sq('g8')], OFF)],
	])
	check('Q9 e2-e3', outs(s, 'e2-e3'), ['capture 0.5000 R [end:null]', 'capture 0.5000 R [end:{"winner":null,"reason":"noAttackers"}]'])
	check('Q9 draw branch', after(s, 'e2-e3', 1).result, { winner: null, reason: 'noAttackers' })
}

console.log(failures() ? failures() + ' FAILED' : 'all passed')
