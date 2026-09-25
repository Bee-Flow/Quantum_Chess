// Timing and a short self-play of the generic computer player on the prototype.
import { SHOGI as V } from './shogi.mjs'
import { applyMove, newGame, legalMoves } from './lib.mjs'
import { fromSfen } from './perft.mjs'
import { chooseMove } from '../../../src/variants/core/ai.js'
import { seededRng } from '../../../src/engine/index.js'
import { T, STATE_VERSION } from '../../../src/variants/core/quantum.js'
const stateFrom = (sfen) => { const { w, side } = fromSfen(sfen); return { v: STATE_VERSION, variant: 'shogi', options: {}, worlds: [{ b: w, w: T }], turn: side, ply: 40, quiet: 0, result: null, history: [] } }
const positions = [['start', newGame(V)], ['middlegame', stateFrom('ln1g5/1r2S1k2/p2pppn2/2ps2p2/1p7/2P6/PPSPPPPLP/2G2K1pr/LN4G1b w BGSLPnp 62')]]
for (const [name, s] of positions) {
	for (const level of ['easy', 'normal', 'hard']) {
		const t = Date.now()
		const m = await chooseMove(V, s, { level, rng: seededRng(3) })
		console.log(name, level, m, (Date.now() - t) + 'ms', 'moves', legalMoves(V, s).length)
	}
}
// self-play easy vs normal, 80 plies
let s = newGame(V)
const rng = seededRng(11)
const line = []
for (let i = 0; i < 80 && !s.result; i++) {
	const m = await chooseMove(V, s, { level: i % 2 ? 'easy' : 'normal', rng })
	line.push(m)
	s = applyMove(V, s, m, rng).state
}
console.log(line.join(' '))
console.log('result', JSON.stringify(s.result), 'worlds', s.worlds.length)
