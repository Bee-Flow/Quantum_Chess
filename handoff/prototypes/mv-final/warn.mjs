// Probe: moveWarning (spec 6.14 / H4) on the move that ENDS a game by leaving the OPPONENT stuck.
// Self-play on Timeline Marauders; for every game that ends by checkmate/stalemate created by the opponent's move,
// ask moveWarning(stateBefore, lastCode) as the mover would see it.
import { V, P, Q, seeded } from '../../tmp/mv-final/libf.mjs'
import { chooseMove } from '../../tmp/mv-final/core/ai.mjs'

const seeds = Number(process.argv[2] ?? 8)
for (let seed = 1; seed <= seeds; seed++) {
	const rng = seeded(seed)
	let s = Q.newGame(V, { setup: 'marauders', timelines: '3' })
	let prev = null
	let code = null
	while (!s.result && s.ply < 200) {
		code = await chooseMove(V, s, { level: 'easy', rng })
		prev = s
		s = Q.applyMove(V, s, code, rng).state
	}
	const r = s.result
	if (r && (r.reason === 'checkmate' || r.reason === 'stalemate')) {
		const mover = prev.turn
		const stuckSide = s.turn
		const warn = P.moveWarning(prev, code)
		console.log(`seed ${seed}: ${code} by side ${mover} -> ${r.reason} winner ${r.winner}; stuck side ${stuckSide}; ` +
			`moveWarning = ${warn}${stuckSide !== mover && warn ? '  <-- WRONG: the mover is warned about the OPPONENT being stuck' : ''}`)
	} else {
		console.log(`seed ${seed}: ${r ? r.reason : 'open'}`)
	}
}
