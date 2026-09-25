// Legal perft of the prototype's move generator (moves that leave the own Khun attacked are removed), to compare
// with Fairy-Stockfish `go perft` for makruk. Usage: node perft.mjs [depth] [fenlike placement json]
import { MAKRUK as V } from './proto.mjs'
import { applyClassical, attacks, generate, royalSquares } from '../../../src/variants/core/world.js'

function legal(w, side) {
	const out = []
	for (const m of generate(V, w, side).values()) {
		const n = applyClassical(V, w, m)
		const k = royalSquares(V, n, side)
		if (k.length && !attacks(V, n, 1 - side, k[0])) {
			out.push([m, n])
		}
	}
	return out
}

function perft(w, side, d) {
	if (d === 0) {
		return 1
	}
	let c = 0
	for (const [, n] of legal(w, side)) {
		c += d === 1 ? 1 : perft(n, 1 - side, d - 1)
	}
	return c
}

const depth = Number(process.argv[2] ?? 4)
const w = V.setup({})
const res = []
for (let d = 1; d <= depth; d++) {
	res.push(perft(w, 0, d))
}
console.log('makruk legal perft', res.join(' '))
// the first moves in FSF's divide format
console.log(legal(w, 0).map(([m]) => m.key).sort().join(' '))
