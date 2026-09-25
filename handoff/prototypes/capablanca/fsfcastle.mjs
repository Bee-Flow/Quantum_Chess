// Reproduces the capablanca castling test of Fairy-Stockfish (test.py, test_castling) with the prototype's generator
// plus the classical legality filter of perft.mjs.
import { CAPA as V } from './proto.mjs'
import { legal } from './perft.mjs'
import { nameOf } from '../../../src/variants/core/world.js'

function uci(m) {
	if (m.kind === 'castle') return nameOf(V, m.from) + nameOf(V, m.extra.kingTo)
	return nameOf(V, m.from) + nameOf(V, m.to) + (m.promo ?? '')
}
function play(seq) {
	let w = V.setup({})
	let side = 0
	for (const u of seq) {
		const found = legal(w, side).find(([m]) => uci(m) === u)
		if (!found) throw new Error('illegal ' + u)
		w = found[1]
		side = 1 - side
	}
	return { w, side }
}
const expect1 = ['f5f4', 'a7a6', 'b7b6', 'c7c6', 'd7d6', 'e7e6', 'i7i6', 'j7j6', 'a7a5', 'b7b5', 'c7c5', 'e7e5', 'i7i5', 'j7j5', 'b8a6', 'b8c6', 'h6g4', 'h6i4', 'h6j5', 'h6f7', 'h6g8', 'h6i8', 'd5a2', 'd5b3', 'd5f3', 'd5c4', 'd5e4', 'd5c6', 'd5e6', 'd5f7', 'd5g8', 'j8g8', 'j8h8', 'j8i8', 'e8f7', 'c8b6', 'c8d6', 'g6g2', 'g6g3', 'g6f4', 'g6g4', 'g6h4', 'g6e5', 'g6g5', 'g6i5', 'g6a6', 'g6b6', 'g6c6', 'g6d6', 'g6e6', 'g6f6', 'g6h8', 'f8f7', 'f8g8', 'f8i8']
let { w, side } = play(['b2b4', 'f7f5', 'c2c3', 'g8d5', 'a2a4', 'h8g6', 'f2f3', 'i8h6', 'h2h3'])
const got = legal(w, side).map(([m]) => uci(m)).sort()
console.log('FSF list 1 equal:', JSON.stringify(got) === JSON.stringify([...expect1].sort()), got.length, expect1.length)
console.log('  missing', expect1.filter((u) => !got.includes(u)), 'extra', got.filter((u) => !expect1.includes(u)))
;({ w, side } = play(['a2a4', 'f7f5', 'b2b3', 'g8d5', 'b1a3', 'i8h6', 'c1a2', 'h8g6', 'c2c4']))
console.log('FSF 2 contains f8i8:', legal(w, side).some(([m]) => uci(m) === 'f8i8'))
;({ w, side } = play(['f2f4', 'g7g6', 'g1d4', 'j7j6', 'h1g3', 'b8a6', 'i1h3', 'h7h6']))
console.log('FSF 3 contains f1i1:', legal(w, side).some(([m]) => uci(m) === 'f1i1'))
