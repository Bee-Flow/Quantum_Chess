// Classical move generation check: perft of the prototype (core generator + "general may not be capturable" filter)
// against Fairy-Stockfish (xiangqi, built with largeboards). Usage: node perft.mjs [path-to-fairy-stockfish]
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { divide, fromFen, perft } from './lib.mjs'

const FSF = process.argv[2] ?? new URL('../../tmp/xiangqi/fsf-src/stockfish', import.meta.url).pathname
const POSITIONS = [
	['rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w', 3],
	['1rbaka2R/5r3/6n2/2p1p1p2/4P1bP1/PpC3Bc1/1nPR2P2/2N2AN2/1c2K1p2/2BAC4 w', 3],
	['4kcP1N/8n/3rb4/9/9/9/9/3p1A3/4K4/5CB2 w', 3],
	// flying general, cannon screens, soldiers across the river, stalemate-like positions
	['3k5/9/9/9/9/9/9/9/9/4K4 w', 3],
	['4k4/4a4/9/9/9/9/9/9/4A4/3K5 b', 3],
	['3akab2/9/4b4/9/2p1c1p2/9/9/4C4/4A4/3AK4 w', 3],
	['4k4/9/9/9/9/9/9/9/2p1p1p2/3K5 w', 3],
]

/** FSF divide for a FEN. */
function fsf(fen, depth) {
	const input = `setoption name UCI_Variant value xiangqi\nposition fen ${fen} - - 0 1\ngo perft ${depth}\nquit\n`
	const text = execFileSync(FSF, [], { input }).toString()
	const out = {}
	for (const line of text.split('\n')) {
		const m = /^([a-i]\d+[a-i]\d+): (\d+)$/.exec(line.trim())
		if (m) {
			out[m[1]] = Number(m[2])
		}
	}
	return out
}

let bad = 0
for (const [fen, depth] of POSITIONS) {
	const { world, turn } = fromFen(fen)
	const t0 = Date.now()
	const mine = divide(world, turn, depth)
	const total = Object.values(mine).reduce((a, b) => a + b, 0)
	let line = `${fen}  depth ${depth}: ${total} (${Date.now() - t0} ms)`
	if (existsSync(FSF)) {
		const ref = fsf(fen, depth)
		const refTotal = Object.values(ref).reduce((a, b) => a + b, 0)
		const keys = new Set([...Object.keys(mine), ...Object.keys(ref)])
		const diff = [...keys].filter((k) => mine[k] !== ref[k])
		line += `  FSF ${refTotal}` + (diff.length ? '  DIFF ' + diff.map((k) => `${k}:${mine[k]}/${ref[k]}`).join(' ') : '  equal')
		if (diff.length) {
			bad++
		}
	}
	console.log(line)
}
const start = fromFen(POSITIONS[0][0])
console.log('start perft 1..3:', [1, 2, 3].map((d) => perft(start.world, 0, d)).join(' '))
console.log(bad ? `${bad} position(s) differ` : 'all positions equal')
