// The test cases of handoff/research/makruk.md section 7, run on the prototype (real core). Prints the values quoted
// in the spec. Run: node cases.mjs
import { countInfo, MAKRUK as V } from './proto.mjs'
import {
	after, budget, codes, hr, legalMoves, newGame, outcomes, outs, pieceLocations, royalDanger, show, splitsFrom, stateOf,
} from './lib.mjs'

const sq = (n) => V.topology.byName(n)
const K = { a1: '0:k', h8: '1:k' }
const filt = (s, pre) => codes(V, s).filter((c) => c.startsWith(pre)).sort().join(' ')
const res = (s) => JSON.stringify(s.result)

hr('T1 start position')
let s = newGame(V, {})
console.log(show(V, s)[0])
console.log('ordinary', codes(V, s).length, codes(V, s).sort().join(' '))
const withSplits = legalMoves(V, s, { splits: true })
console.log('with splits', withSplits.length, withSplits.filter((m) => m.type === 'split').map((m) => m.code).join(' '))

hr('T2 khon and met movement')
s = stateOf(V, [[{ ...K, e4: '0:s' }, 1]])
console.log('white khon e4:', filt(s, 'e4-'))
s = stateOf(V, [[{ ...K, e5: '1:s' }, 1]], 1)
console.log('black khon e5:', filt(s, 'e5-'))
s = stateOf(V, [[{ ...K, d4: '0:m' }, 1]])
console.log('met d4:', filt(s, 'd4-'))
s = stateOf(V, [[{ ...K, e4: '0:s', e5: '1:n', d5: '1:r', e3: '1:r', d4: '1:n' }, 1]])
console.log('khon e4 among enemies:', filt(s, 'e4-'))

hr('T3 bia: no double step, promotion on the sixth rank (forced, to met)')
s = stateOf(V, [[{ ...K, e3: '0:p', c5: '0:p', b6: '1:n', d6: '1:n' }, 1]])
console.log('white bias:', filt(s, 'e3-'), '|', filt(s, 'c5-'))
let s2 = after(V, s, 'c5-c6=m')
console.log('after c5-c6=m:', show(V, s2), res(s2))
s2 = after(V, s2, 'h8-g8')
console.log('promoted met c6:', filt(s2, 'c6-'))
s = stateOf(V, [[{ ...K, d4: '1:p', e3: '0:n', h1: '0:r' }, 1]], 1)
console.log('black bia d4:', filt(s, 'd4-'))
s = stateOf(V, [[{ ...K, b5: '0:p', b6: '1:s' }, 1]])
console.log('blocked bia b5:', filt(s, 'b5-') || '(none)')

hr('T4 stalemate is a draw')
s = stateOf(V, [[{ f7: '0:k', f5: '0:m', h8: '1:k' }, 1]])
s2 = after(V, s, 'f5-g6')
console.log('f5-g6:', res(s2))
s2 = after(V, s, 'f5-e6')
console.log('f5-e6 instead:', res(s2), 'black moves', codes(V, s2).join(' '))
// checkmate is not stalemate: the game goes on and the khun is captured
s = stateOf(V, [[{ f7: '0:k', a1: '0:r', h8: '1:k' }, 1]])
s2 = after(V, s, 'a1-h1')
console.log('Ra1-h1 (mate):', res(s2), 'black moves', codes(V, s2).join(' '), 'danger', royalDanger(V, s2, 1))
s2 = after(V, s2, 'h8-g8')
console.log('h8-g8 then f7-g8:', res(after(V, s2, 'f7-g8')))

hr('T5 only the two khuns')
s = stateOf(V, [[{ d4: '0:k', e5: '1:m', h8: '1:k' }, 1]])
s2 = after(V, s, 'd4-e5')
console.log('Kxe5 far from h8:', res(s2))
s = stateOf(V, [[{ d4: '0:k', e5: '1:m', f6: '1:k' }, 1]])
s2 = after(V, s, 'd4-e5')
console.log('Kxe5 next to f6:', res(s2), 'turn', s2.turn, 'black can', filt(s2, 'f6-e5'))
s2 = after(V, s2, 'f6-e5')
console.log('f6xe5:', res(s2))

hr('T6 bare-khun count: K+R+R vs K, allowance 8-4+1 = 5 chaser moves')
s = stateOf(V, [[{ a1: '0:k', b2: '0:r', c3: '0:r', h8: '1:k', b7: '1:n' }, 1]], 0, 30)
s2 = after(V, s, 'b2-b7')
console.log('after b2xb7:', res(s2), 'quiet', s2.quiet, JSON.stringify(countInfo(s2)))
let st = s2
const plies = ['h8-g8', 'c3-c4', 'g8-h8', 'c4-c5', 'h8-g8', 'c5-c4', 'g8-h8', 'c4-c5', 'h8-g8', 'c5-c4']
for (const p of plies) {
	st = after(V, st, p)
	console.log(p.padEnd(6), 'quiet', st.quiet, 'done', countInfo(st)?.done, res(st))
	if (st.result) {
		break
	}
}
hr('T6b capture of the khun on the 5th chaser move wins')
st = s2
console.log('c4-g4 as 4th move stalemates:', res(after(V, after(V, after(V, after(V, after(V, after(V, after(V, after(V, s2, 'h8-g8'), 'c3-c4'), 'g8-h8'), 'c4-c5'), 'h8-g8'), 'c5-c4'), 'g8-h8'), 'c4-g4')))
for (const p of ['h8-g8', 'c3-c4', 'g8-h8', 'c4-c5', 'h8-g8', 'c5-c4', 'g8-h8', 'c4-c8', 'h8-h7']) {
	st = after(V, st, p)
}
console.log(show(V, st), 'quiet', st.quiet, 'done', countInfo(st).done, res(st))
console.log('b7-h7 (5th move, captures the khun):', res(after(V, st, 'b7-h7')))
console.log('c8-c7 (5th move, quiet):', res(after(V, st, 'c8-c7')))

hr('T6c the count waits while the khuns touch')
s = stateOf(V, [[{ f6: '0:k', a1: '0:r', b1: '0:r', h8: '1:k' }, 1]], 0, 8)
console.log('before:', JSON.stringify(countInfo(s)))
console.log('f6-f7 (5th move):', res(after(V, s, 'f6-f7')))
s2 = after(V, s, 'f6-g7')
console.log('f6-g7 (5th move, touching):', res(s2), 'then h8-g7:', res(after(V, s2, 'h8-g7')))

hr('T7 too many pieces for the limit: immediate draw')
s = stateOf(V, [[{ a1: '0:k', b1: '0:r', c1: '0:r', d1: '0:n', e1: '0:n', f1: '0:s', g1: '0:s', h1: '0:m', h8: '1:k', h2: '1:m' }, 1]])
s2 = after(V, s, 'g1-h2')
console.log('g1xh2 (9 pieces, limit 8):', res(s2), JSON.stringify(countInfo(s2)))
s = stateOf(V, [[{ a1: '0:k', b1: '0:r', c1: '0:r', d1: '0:n', e1: '0:n', f1: '0:s', h8: '1:k', g2: '1:m' }, 1]])
s2 = after(V, s, 'f1-g2')
console.log('f1xg2 (7 pieces, limit 8):', res(s2), JSON.stringify(countInfo(s2)))

hr('T8 limits table (allowance = limit - pieces + 1)')
const L = (pl) => {
	const x = countInfo(stateOf(V, [[pl, 1]], 1))
	return `limit ${x.limit} pieces ${x.pieces} allow ${x.allow}`
}
console.log('K+R vs K      ', L({ a1: '0:k', b2: '0:r', h8: '1:k' }))
console.log('K+S+S vs K    ', L({ a1: '0:k', b2: '0:s', c2: '0:s', h8: '1:k' }))
console.log('K+N+N vs K    ', L({ a1: '0:k', b2: '0:n', c2: '0:n', h8: '1:k' }))
console.log('K+S+N+N vs K  ', L({ a1: '0:k', b2: '0:s', c2: '0:n', d2: '0:n', h8: '1:k' }))
console.log('K+S+M vs K    ', L({ a1: '0:k', b2: '0:s', c2: '0:m', h8: '1:k' }))
console.log('K+N+M+M vs K  ', L({ a1: '0:k', b2: '0:n', c2: '0:m', d2: '0:m', h8: '1:k' }))
console.log('K+M vs K      ', L({ a1: '0:k', b2: '0:m', h8: '1:k' }))
console.log('with a bia: ', countInfo(stateOf(V, [[{ a1: '0:k', b2: '0:r', c4: '0:p', h8: '1:k' }, 1]], 1)))

hr('T9 64-move rule')
s = stateOf(V, [[{ a1: '0:k', b2: '0:r', h8: '1:k', g7: '1:n', c3: '0:p' }, 1]], 0, 127)
console.log('b2-b3 at quiet 127:', res(after(V, s, 'b2-b3')))
s2 = after(V, s, 'c3-c4')
console.log('c3-c4 at quiet 127:', res(s2), 'quiet', s2.quiet)
s = stateOf(V, [[{ a1: '0:k', b2: '0:r', h8: '1:k', g7: '1:n', c3: '0:p' }, 1]], 0, 126)
console.log('b2-b3 at quiet 126:', res(after(V, s, 'b2-b3')))
s = stateOf(V, [[{ a1: '0:k', b2: '0:r', h8: '1:k', c4: '1:n', c3: '0:p' }, 1], [{ a1: '0:k', b2: '0:r', h8: '1:k', e5: '1:n', c3: '0:p' }, 1]], 0, 127)
console.log('rolled bia push at quiet 127:', outs(V, s, 'c3-c4'), 'quiet after Missed', after(V, s, 'c3-c4', 0).quiet, res(after(V, s, 'c3-c4', 0)))

hr('Q1 bia push onto the promotion square where a ghost ma might be')
s = stateOf(V, [[{ ...K, c5: '0:p', c6: '1:n' }, 1], [{ ...K, c5: '0:p', a5: '1:n' }, 1]])
console.log(outs(V, s, 'c5-c6=m'))
for (let i = 0; i < 2; i++) {
	const x = after(V, s, 'c5-c6=m', i)
	console.log(i, show(V, x).join(' / '))
}
console.log('capture-promotion c5-b6 onto a ghost ma:')
s = stateOf(V, [[{ ...K, c5: '0:p', b6: '1:n' }, 1], [{ ...K, c5: '0:p', a4: '1:n' }, 1]])
console.log(outs(V, s, 'c5-b6=m'))

hr('Q2 splits: met, khon (forward step), promoted met; bia and khun never split')
s = stateOf(V, [[{ ...K, d4: '0:m', f5: '0:s', b3: '0:p' }, 1]])
console.log('met d4:', splitsFrom(V, s, sq('d4')).map((m) => m.code).join(' '))
console.log('khon f5:', splitsFrom(V, s, sq('f5')).map((m) => m.code).join(' '))
console.log('bia b3:', splitsFrom(V, s, sq('b3')).length, 'khun a1:', splitsFrom(V, s, sq('a1')).length)
s2 = after(V, s, 'f5-f6|g6')
console.log('after f5-f6|g6:', show(V, s2).join(' / '), 'budget', budget(s2, 0))
s = stateOf(V, [[{ ...K, c5: '0:p' }, 1]])
s2 = after(V, after(V, after(V, s, 'c5-c6=m'), 'h8-g8'), 'c6-b7|d7')
console.log('promoted met split c6-b7|d7:', show(V, s2).join(' / '))

hr('Q3 stalemate in one possibility only: game-end roll')
s = stateOf(V, [[{ f7: '0:k', f5: '0:m', h8: '1:k' }, 1], [{ f7: '0:k', e4: '0:m', h8: '1:k' }, 1]])
console.log(outs(V, s, 'f5-g6'))
for (let i = 0; i < 2; i++) {
	const x = after(V, s, 'f5-g6', i)
	console.log(i, res(x), show(V, x).join(' / '))
}

hr('Q4 bare-khun count waits for a ghost: the last black piece is a 50/50 met')
s = stateOf(V, [[{ a1: '0:k', b1: '0:r', c1: '0:r', h8: '1:k', b6: '1:m' }, 1], [{ a1: '0:k', b1: '0:r', c1: '0:r', h8: '1:k', f6: '1:m' }, 1]], 0, 20)
console.log('count before:', countInfo(s))
console.log(outs(V, s, 'b1-b6'))
for (let i = 0; i < 2; i++) {
	const x = after(V, s, 'b1-b6', i)
	console.log(i, 'quiet', x.quiet, JSON.stringify(countInfo(x)), show(V, x).join(' / '))
}

hr('Q5 khun captures the last enemy piece, a ghost part')
s = stateOf(V, [[{ d4: '0:k', e5: '1:s', h8: '1:k' }, 1], [{ d4: '0:k', g5: '1:s', h8: '1:k' }, 1]])
console.log(outs(V, s, 'd4-e5'))
for (let i = 0; i < 2; i++) {
	const x = after(V, s, 'd4-e5', i)
	console.log(i, res(x), show(V, x).join(' / '))
}

hr('Q6 danger ring and king capture by a ghost ma')
s = stateOf(V, [[{ a1: '0:k', e6: '0:n', f8: '1:k' }, 1], [{ a1: '0:k', c6: '0:n', f8: '1:k' }, 1]], 1)
console.log('danger black', royalDanger(V, s, 1))
s = stateOf(V, [[{ a1: '0:k', e6: '0:n', g7: '1:k' }, 1], [{ a1: '0:k', c6: '0:n', g7: '1:k' }, 1]])
console.log('e6-g7', outs(V, s, 'e6-g7'))
