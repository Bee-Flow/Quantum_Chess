// Classical perft of the prototype with the FIDE/Fairy-Stockfish legality filter added (king not left in check,
// no castling out of, through or into check), to compare with Fairy-Stockfish (tests/perft.sh: capablanca
// startpos depth 4 = 805128) and its castling test in test.py. The quantum game itself has no such filter.
import { CAPA as V } from './proto.mjs'
import { applyClassical, attacks, generate, royalSquares } from '../../../src/variants/core/world.js'

export function legal(w, side) {
	const out = []
	for (const m of generate(V, w, side).values()) {
		if (m.kind === 'castle') {
			const [kf, r] = V.topology.coords[m.from]
			const tf = V.topology.coords[m.extra.kingTo][0]
			let bad = false
			for (let f = Math.min(kf, tf); f <= Math.max(kf, tf); f++) {
				if (attacks(V, w, 1 - side, V.topology.at([f, r]))) bad = true
			}
			if (bad) continue
		}
		const n = applyClassical(V, w, m)
		const k = royalSquares(V, n, side)
		if (k.length && !attacks(V, n, 1 - side, k[0])) out.push([m, n])
	}
	return out
}
function perft(w, side, d) {
	if (d === 0) return 1
	let c = 0
	for (const [, n] of legal(w, side)) c += d === 1 ? 1 : perft(n, 1 - side, d - 1)
	return c
}
if (process.argv[1].endsWith('perft.mjs')) {
	const w = V.setup({})
	const res = []
	const maxD = Number(process.argv[2] ?? 4)
	for (let d = 1; d <= maxD; d++) {
		const t0 = Date.now()
		res.push(perft(w, 0, d))
		console.log('depth', d, res[d - 1], (Date.now() - t0) + ' ms')
	}
	const fsf = [28, 784, 25228, 805128]
	console.log('Fairy-Stockfish depth 4 = 805128; match:', res[3] === fsf[3])
}
