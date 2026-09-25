// Depth-4 perft of the three Fairy-Stockfish regression positions (tests/perft.sh): 3290240, 4485547, 92741.
import { fromFen, perft } from './lib.mjs'
for (const [fen, want] of [
	['rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w', 3290240],
	['1rbaka2R/5r3/6n2/2p1p1p2/4P1bP1/PpC3Bc1/1nPR2P2/2N2AN2/1c2K1p2/2BAC4 w', 4485547],
	['4kcP1N/8n/3rb4/9/9/9/9/3p1A3/4K4/5CB2 w', 92741],
]) {
	const { world, turn } = fromFen(fen)
	const t0 = Date.now()
	const n = perft(world, turn, 4)
	console.log(`${n === want ? 'PASS' : 'FAIL'} perft 4 = ${n} (want ${want}) ${Date.now() - t0} ms  ${fen}`)
}
