// Legal perft of the prototype from a makruk FEN (board part and side to move), to compare with Fairy-Stockfish.
// Usage: node perftfen.mjs "<fen>" depth
import { MAKRUK as V } from './proto.mjs'
import { applyClassical, attacks, generate, royalSquares, worldFrom } from '../../../src/variants/core/world.js'

export function fromFen(fen) {
	const [boardPart, stm] = fen.split(' ')
	const placement = {}
	boardPart.replace(/~/g, '').split('/').forEach((row, i) => {
		let f = 0
		for (const ch of row) {
			if (/\d/.test(ch)) {
				f += Number(ch)
				continue
			}
			const side = ch === ch.toUpperCase() ? 0 : 1
			placement['abcdefgh'[f] + (8 - i)] = side + ':' + ch.toLowerCase()
			f++
		}
	})
	return { w: worldFrom(V, placement, {}), side: stm === 'w' ? 0 : 1 }
}
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
	if (d === 0) return 1
	let c = 0
	for (const [, n] of legal(w, side)) c += d === 1 ? 1 : perft(n, 1 - side, d - 1)
	return c
}
if (process.argv[2]) {
	const { w, side } = fromFen(process.argv[2])
	const d = Number(process.argv[3] ?? 3)
	const res = []
	for (let i = 1; i <= d; i++) res.push(perft(w, side, i))
	console.log(res.join(' '))
}
