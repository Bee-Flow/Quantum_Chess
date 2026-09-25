// The test cases of handoff/research/shogi.md, section 7, run on the prototype (real variants core).
import { SHOGI as V } from './shogi.mjs'
import {
	after, branches, budget, check, codes, hands, legalMoves, newGame, outcomes, ownPieceAt, pieceLocations, show,
	splitsFrom, stateOf, summary, T,
} from './lib.mjs'
import { squareView } from '../../../src/variants/core/quantum.js'

const sq = (n) => V.topology.byName(n)
const has = (s, c) => codes(V, s).includes(c)
const drops = (s, type) => codes(V, s).filter((c) => c.startsWith(type + '@'))
const outs = (s, c) => (outcomes(V, s, c) ?? []).map((o) => [o.key, ...o.notes, Number(o.p.toFixed(4))])
const at = (s, name) => squareView(s, sq(name)).map((o) => [o.side, o.type, Number(o.p.toFixed(4))])
const hr = (t) => console.log('\n=== ' + t)

hr('S1 start position')
{
	const s = newGame(V)
	check('Sente king', at(s, '5i'), [[0, 'k', 1]])
	check('Sente bishop 8h, rook 2h', [at(s, '8h'), at(s, '2h')], [[[0, 'b', 1]], [[0, 'r', 1]]])
	check('Gote rook 8b, bishop 2b', [at(s, '8b'), at(s, '2b')], [[[1, 'r', 1]], [[1, 'b', 1]]])
	check('Gote back rank 9a..1a', ['9a', '8a', '7a', '6a', '5a', '4a', '3a', '2a', '1a'].map((n) => at(s, n)[0][1]).join(''),
		'lnsgkgsnl')
	check('Sente ordinary moves', codes(V, s).length, 30)
	check('Sente splits', legalMoves(V, s, { splits: true }).filter((m) => m.type === 'split').length, 23)
}

hr('S2 optional promotion: into, within and out of the zone')
{
	const s = stateOf(V, [[{ '5i': '0:k', '4d': '0:s', '9a': '1:k', '6c': '0:s' }, 1]])
	const m4d = codes(V, s).filter((c) => c.startsWith('4d-')).sort()
	check('silver 4d', m4d, ['4d-3c', '4d-3c=+s', '4d-3e', '4d-4c', '4d-4c=+s', '4d-5c', '4d-5c=+s', '4d-5e'])
	const m6c = codes(V, s).filter((c) => c.startsWith('6c-')).sort()
	check('silver 6c (in zone)', m6c, ['6c-5b', '6c-5b=+s', '6c-5d', '6c-5d=+s', '6c-6b', '6c-6b=+s', '6c-7b', '6c-7b=+s',
		'6c-7d', '6c-7d=+s'])
	const n = after(V, s, '6c-5d=+s')
	check('after 6c-5d=+s', at(n, '5d'), [[0, '+s', 1]])
	const n2 = after(V, n, '9a-9b')
	check('promoted silver moves as gold (4d holds the other silver)', codes(V, n2).filter((c) => c.startsWith('5d-')).sort(),
		['5d-4c', '5d-5c', '5d-5e', '5d-6c', '5d-6d'])
}

hr('S3 compulsory promotion')
{
	const s = stateOf(V, [[{ '5i': '0:k', '3b': '0:p', '7d': '0:n', '6e': '0:n', '1d': '0:l', '9a': '1:k' }, 1]])
	check('pawn 3b', codes(V, s).filter((c) => c.startsWith('3b-')), ['3b-3a=+p'])
	check('knight 7d', codes(V, s).filter((c) => c.startsWith('7d-')).sort(), ['7d-6b=+n', '7d-8b=+n'])
	check('knight 6e', codes(V, s).filter((c) => c.startsWith('6e-')).sort(), ['6e-5c', '6e-5c=+n', '6e-7c', '6e-7c=+n'])
	check('lance 1d', codes(V, s).filter((c) => c.startsWith('1d-')).sort(),
		['1d-1a=+l', '1d-1b', '1d-1b=+l', '1d-1c', '1d-1c=+l'])
	const g = stateOf(V, [[{ '5a': '1:k', '7f': '1:p', '9i': '0:k' }, 1]], 1)
	check('Gote pawn 7f (enters its zone)', codes(V, g).filter((c) => c.startsWith('7f-')).sort(), ['7f-7g', '7f-7g=+p'])
}

hr('S4 drop restrictions: last ranks and nifu')
{
	const s = stateOf(V, [[{ '5i': '0:k', '5g': '0:p', '4d': '0:+p', '1a': '1:k' }, 1, [[0, 'p'], [0, 'l'], [0, 'n']]]])
	check('pawn drops', drops(s, 'p').length, 64 - 1)
	check('lance drops', drops(s, 'l').length, 70 - 1)
	check('knight drops', drops(s, 'n').length, 61 - 1)
	check('p@5e nifu', has(s, 'p@5e'), false)
	check('p@4e (only a tokin on file 4)', has(s, 'p@4e'), true)
	check('p@3a, l@3a, n@3b', [has(s, 'p@3a'), has(s, 'l@3a'), has(s, 'n@3b')], [false, false, false])
	check('p@3b, l@3b, n@3c', [has(s, 'p@3b'), has(s, 'l@3b'), has(s, 'n@3c')], [true, true, true])
	const g = stateOf(V, [[{ '5i': '0:k', '5a': '1:k' }, 1, [[1, 'p'], [1, 'n']]]], 1)
	check('Gote: p@3i, n@3h illegal; p@3h, n@3g legal', [has(g, 'p@3i'), has(g, 'n@3h'), has(g, 'p@3h'), has(g, 'n@3g')],
		[false, false, true, true])
}

hr('S5 uchifuzume (pawn-drop mate)')
{
	const base = { '5i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:n' }
	const s = stateOf(V, [[base, 1, [[0, 'p'], [0, 'g']]]])
	check('p@1b is illegal (mate)', has(s, 'p@1b'), false)
	check('g@1b is legal', has(s, 'g@1b'), true)
	const s2 = stateOf(V, [[{ '5i': '0:k', '1a': '1:k', '2a': '1:n' }, 1, [[0, 'p']]]])
	check('without the gold p@1b is legal (the king takes the pawn)', has(s2, 'p@1b'), true)
	const s3 = stateOf(V, [[{ '5i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:s' }, 1, [[0, 'p']]]])
	check('Gote silver 2a instead of the knight: p@1b is legal (the silver takes)', has(s3, 'p@1b'), true)
	const s4 = stateOf(V, [[{ '5i': '0:k', '2c': '0:g', '9a': '0:r', '1a': '1:k', '2a': '1:s' }, 1, [[0, 'p']]]])
	check('... but with a Sente rook on 9a pinning that silver: p@1b is illegal', has(s4, 'p@1b'), false)
	const s5 = stateOf(V, [[{ ...base, '5b': '1:r' }, 1, [[0, 'p']]]])
	check('Sente king capturable by the Gote rook on 5b: p@1b is legal', has(s5, 'p@1b'), true)
	const s6 = stateOf(V, [[{ '5i': '0:k', '2c': '0:g', '1c': '0:p', '1a': '1:k', '2a': '1:n' }, 1]])
	check('pawn MOVE to 1b is legal', [has(s6, '1c-1b'), has(s6, '1c-1b=+p')], [true, true])
}

hr('S6 captures change side and demote')
{
	const s = stateOf(V, [[{ '5i': '0:k', '2b': '0:+r', '5a': '1:k', '3a': '1:s' }, 1]], 1)
	const n = after(V, s, '3a-2b')
	check('Gote hand after 3a-2b', hands(n, 1), 'r:1')
	check('Gote can drop the rook', has(n, 'r@5e') || codes(V, { ...n, turn: 1 }).includes('r@5e'), true)
	check('quiet reset by capture', n.quiet, 0)
	const p = stateOf(V, [[{ '5i': '0:k', '5e': '0:p', '5d': '1:+p', '9a': '1:k' }, 1]])
	const q = after(V, p, '5e-5d')
	check('pawn captures straight ahead; tokin goes to hand as pawn', [at(q, '5d'), hands(q, 0)], [[[0, 'p', 1]], 'p:1'])
}

hr('S7 impasse (27-point declaration, automatic at the start of the turn)')
{
	const zone = { '9a': '0:r', '8a': '0:b', '7a': '0:g', '6a': '0:g', '4a': '0:s', '3a': '0:s', '2b': '0:+p', '3b': '0:+p',
		'4b': '0:+p', '6b': '0:+p', '5c': '0:k', '9i': '1:k' }
	const s = stateOf(V, [[zone, 1, [[0, 'r'], [0, 'b']]]], 1)
	const n = after(V, s, '9i-9h')
	check('Sente 28 points, 10 pieces: wins after any Gote move', n.result, { winner: 0, reason: 'impasse' })
	const s27 = stateOf(V, [[zone, 1, [[0, 'r'], [0, 'p'], [0, 'p'], [0, 'p'], [0, 'p']]]], 1)
	check('Sente 27 points: no impasse', after(V, s27, '9i-9h').result, null)
	const zone9 = { ...zone, '4e': '0:+p' }
	delete zone9['4b']
	const s9 = stateOf(V, [[zone9, 1, [[0, 'r'], [0, 'b']]]], 1)
	check('9 pieces in zone (tokin on 4e): no impasse', after(V, s9, '9i-9h').result, null)
	const sc = stateOf(V, [[{ ...zone, '9i': '1:k', '5d': '1:g' }, 1, [[0, 'r'], [0, 'b']]]], 1)
	check('king attacked by a Gote gold on 5d: no impasse', after(V, sc, '9i-9h').result, null)
	// Gote with 27 points wins: the mirror image of the 27-point Sente position
	const mirror = {}
	for (const [k, v] of Object.entries(zone)) {
		const f = 10 - Number(k[0])
		const r = 'abcdefghi'['abcdefghi'.length - 1 - 'abcdefghi'.indexOf(k[1])]
		mirror[String(f) + r] = (v[0] === '0' ? '1' : '0') + v.slice(1)
	}
	const g27 = stateOf(V, [[mirror, 1, [[1, 'r'], [1, 'p'], [1, 'p'], [1, 'p'], [1, 'p']]]], 0)
	check('Gote 27 points (mirror): wins after any Sente move', after(V, g27, '1a-1b').result, { winner: 1, reason: 'impasse' })
}

hr('S8 no legal move loses')
{
	const pl = { '1a': '0:k', '5i': '1:k' }
	const gens = ['s', 'g', 's', 'g', 's', 'g', 's', 'g']
	for (let f = 2; f <= 9; f++) pl[f + 'a'] = '0:' + gens[f - 2]
	for (let f = 1; f <= 9; f++) pl[f + 'b'] = '0:p'
	const s = stateOf(V, [[pl, 1]], 1)
	const n = after(V, s, '5i-5h')
	check('Sente has no move after 5i-5h', n.result, { winner: 1, reason: 'noMoves' })
}

hr('S9 quiet rule and resets')
{
	let s = stateOf(V, [[{ '5i': '0:k', '1i': '0:r', '5a': '1:k', '9a': '1:r' }, 1, [[0, 'p']]]])
	s = after(V, s, '1i-1h')
	check('quiet after a rook move', s.quiet, 1)
	s = after(V, s, '9a-9b')
	s = after(V, s, 'p@5e')
	check('quiet after a drop', s.quiet, 0)
	s = after(V, s, '9b-9a')
	let plies = 1
	const cycle = ['1h-1i', '9a-9b', '1i-1h', '9b-9a']
	while (!s.result) {
		s = after(V, s, cycle[(plies - 1) % 4])
		plies++
	}
	check('draw by the quiet rule after 100 quiet plies', [s.result, s.quiet], [{ winner: null, reason: 'quiet' }, 100])
}

hr('S9b move limit: 500 plies (JSA 500-move rule)')
{
	const s = { ...stateOf(V, [[{ '5i': '0:k', '1i': '0:r', '5a': '1:k' }, 1]]), ply: 499 }
	check('ply 500 ends the game', after(V, s, '1i-1h').result, { winner: null, reason: 'moveLimit' })
}

hr('S10 capture the king ends the game')
{
	const s = stateOf(V, [[{ '5i': '0:k', '5c': '0:p', '5a': '1:k', '4a': '1:g' }, 1]])
	const n = after(V, s, '5c-5b')
	const e = after(V, n, '4a-4b')
	check('5b-5a=+p captures the king', after(V, e, '5b-5a=+p').result, { winner: 0, reason: 'king' })
}

hr('Q1 promotion per possibility')
{
	let s = stateOf(V, [[{ '5i': '0:k', '5e': '0:s', '5a': '1:k' }, 1]])
	s = after(V, s, '5e-4d|6d')
	s = after(V, s, '5a-5b')
	check('outcomes of 4d-4c=+s', outs(s, '4d-4c=+s'), [['move', 1]])
	const n = after(V, s, '4d-4c=+s')
	check('4c', at(n, '4c'), [[0, '+s', 0.5]])
	check('6d', at(n, '6d'), [[0, 's', 0.5]])
	check('Sente budget', budget(n, 0), 2)
	s = after(V, n, '5b-5a')
	check('merge code offered', legalMoves(V, s).filter((m) => m.type === 'merge').map((m) => m.code).includes('6d|4c-5c'),
		true)
	const m = after(V, s, '6d|4c-5c')
	check('after the merge: one square, two faces', at(m, '5c'), [[0, '+s', 0.5], [0, 's', 0.5]])
	const m2 = after(V, m, '5a-5b')
	check('... budget 2, no Measure offered', [budget(m2, 0), legalMoves(V, m2).some((x) => x.type === 'measure')],
		[2, false])
	// the double face resolves when the piece makes a move only one face can make
	const r = after(V, m2, '5c-4d')
	check('5c-4d (only the silver face can): no roll', outs(m2, '5c-4d'), [['move', 1]])
	check('... the piece is now 50% +s on 5c, 50% s on 4d', [at(r, '5c'), at(r, '4d')],
		[[[0, '+s', 0.5]], [[0, 's', 0.5]]])
}

hr('Q2 drop onto a square where a ghost may stand')
{
	const s = stateOf(V, [
		[{ '5i': '0:k', '5a': '1:k', '5e': '1:b' }, 1, [[0, 'g']]],
		[{ '5i': '0:k', '5a': '1:k', '3c': '1:b' }, 1, [[0, 'g']]],
	])
	check('g@5e outcomes', outs(s, 'g@5e'), [['miss', 0.5], ['move', 0.5]])
	const miss = after(V, s, 'g@5e', 0)
	check('miss: bishop found on 5e, gold still in hand', [at(miss, '5e'), hands(miss, 0)], [[[1, 'b', 1]], 'g:1'])
	const move = after(V, s, 'g@5e', 1)
	check('move: gold on 5e, bishop 100% on 3c', [at(move, '5e'), at(move, '3c'), hands(move, 0)],
		[[[0, 'g', 1]], [[1, 'b', 1]], ''])
}

hr('Q3 uchifuzume in some possibilities only')
{
	const s = stateOf(V, [
		[{ '5i': '0:k', '2c': '0:g', '1a': '1:k', '2a': '1:n' }, 1, [[0, 'p']]],
		[{ '5i': '0:k', '3d': '0:g', '1a': '1:k', '2a': '1:n' }, 1, [[0, 'p']]],
	])
	check('p@1b outcomes', outs(s, 'p@1b'), [['miss', 0.5], ['move', 0.5]])
	const miss = after(V, s, 'p@1b', 0)
	check('miss: pawn stays in hand, gold 100% on 2c', [hands(miss, 0), at(miss, '2c')], ['p:1', [[0, 'g', 1]]])
	const move = after(V, s, 'p@1b', 1)
	check('move: pawn on 1b, gold 100% on 3d', [at(move, '1b'), at(move, '3d')], [[[0, 'p', 1]], [[0, 'g', 1]]])
	// the same position reached in play: gold 2d splits to 2c|3d
	let q = stateOf(V, [[{ '5i': '0:k', '2d': '0:g', '1a': '1:k', '2a': '1:n', '9c': '1:p' }, 1, [[0, 'p']]]])
	q = after(V, q, '2d-2c|3d')
	q = after(V, q, '9c-9d')
	check('in play: p@1b outcomes', outs(q, 'p@1b'), [['miss', 0.5], ['move', 0.5]])
}

hr('Q4 pawn push onto a ghost: capture or move, never miss')
{
	const s = stateOf(V, [
		[{ '5i': '0:k', '5e': '0:p', '5a': '1:k', '5d': '1:s' }, 1],
		[{ '5i': '0:k', '5e': '0:p', '5a': '1:k', '4c': '1:s' }, 1],
	])
	check('5e-5d outcomes', outs(s, '5e-5d'), [['move', 0.5], ['capture', 0.5]])
	const c = after(V, s, '5e-5d', 1)
	check('capture: silver in Sente hand', [at(c, '5d'), hands(c, 0)], [[[0, 'p', 1]], 's:1'])
}

hr('Q5 capturing a promoted ghost part: the hand gets the unpromoted piece, certainly')
{
	const s = stateOf(V, [
		[{ '5i': '0:k', '2b': '0:+r', '5a': '1:k', '3a': '1:s' }, 1],
		[{ '5i': '0:k', '2d': '0:+r', '5a': '1:k', '3a': '1:s' }, 1],
	], 1)
	check('3a-2b outcomes', outs(s, '3a-2b'), [['move', 0.5], ['capture', 0.5]])
	const c = after(V, s, '3a-2b', 1)
	check('capture: Gote hand holds a rook in every possibility', [hands(c, 1), c.worlds.length], ['r:1', 1])
}

hr('Q6 impasse only in some possibilities: game-end roll')
{
	const zone = { '9a': '0:r', '8a': '0:b', '7a': '0:g', '6a': '0:g', '3a': '0:s', '2b': '0:+p', '3b': '0:+p',
		'4b': '0:+p', '6b': '0:+p', '5c': '0:k', '9i': '1:k' }
	const s = stateOf(V, [
		[{ ...zone, '4c': '0:s' }, 1, [[0, 'r'], [0, 'b']]],
		[{ ...zone, '4d': '0:s' }, 1, [[0, 'r'], [0, 'b']]],
	], 1)
	check('9i-9h outcomes', outs(s, '9i-9h'), [['move', 'end:{"winner":0,"reason":"impasse"}', 0.5], ['move', 'end:null', 0.5]])
}

hr('Q7 splits never promote; knight splits')
{
	const s = stateOf(V, [[{ '5i': '0:k', '6e': '0:n', '3d': '0:n', '1e': '0:l', '5a': '1:k' }, 1]])
	check('knight 6e splits', splitsFrom(V, s, sq('6e')).map((m) => m.code), ['6e-7c|5c'])
	check('knight 3d cannot split (both targets force promotion)', splitsFrom(V, s, sq('3d')).length, 0)
	const n = after(V, s, '6e-7c|5c')
	check('both parts unpromoted', [at(n, '7c'), at(n, '5c')], [[[0, 'n', 0.5]], [[0, 'n', 0.5]]])
	check('lance 1e splits', splitsFrom(V, s, sq('1e')).map((m) => m.code).sort(),
		['1e-1c|1b', '1e-1d|1b', '1e-1d|1c'].sort())
}

hr('Q8 forced promotion of a ghost part')
{
	let s = stateOf(V, [[{ '5i': '0:k', '1e': '0:l', '5a': '1:k' }, 1]])
	s = after(V, s, '1e-1d|1c')
	s = after(V, s, '5a-5b')
	check('codes from 1c', codes(V, s).filter((c) => c.startsWith('1c-')).sort(), ['1c-1a=+l', '1c-1b', '1c-1b=+l'])
	check('1c-1a=+l outcomes (no roll)', outs(s, '1c-1a=+l'), [['move', 1]])
	const n = after(V, s, '1c-1a=+l')
	check('lance: 50% promoted on 1a, 50% on 1d', [at(n, '1a'), at(n, '1d')], [[[0, '+l', 0.5]], [[0, 'l', 0.5]]])
	const n2 = after(V, n, '5b-5c')
	check('then 1d-1a=+l onto its own promoted part: a roll', outs(n2, '1d-1a=+l'), [['miss', 0.5], ['move', 0.5]])
}

summary()
