// Probe: with replySide null inside a turn (spec 6.15), the first move of a multi-move turn is judged without any
// answer: the computer grabs a defended pawn with its queen on its first board, and the queen is lost after the turn.
// White must move on L0 and L+1 (both T5 ○). L0: K a1, Q c1; black pawns c4 (defended by b5), king e4 (no checks available).
// L+1: K a1, black king e5 behind pawns d4 e4.
import { V, P, Q, seeded, stateOfWorlds } from '../../tmp/mv-final/libf.mjs'
import { chooseMove } from '../../tmp/mv-final/core/ai.mjs'
const w = P.buildWorld({ n: 5, h: 4, m: 3, md: 0, s: 0, c: [1, 0], rows: {
	0: { st: 2, en: 10, boards: { 10: '1p3/2p1k/5/5/K1Q2' } },
	1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/3pp/5/5/K4' } },
} })
const start = stateOfWorlds([[w, 1]], 0)
const qid = w.board[P.sqOf(0, 0, 2, 0)]
console.log('must move', P.mandatory(w.x).map((u) => P.LAB[u]), 'queen id', qid, w.ty[qid])
const level = process.argv[2] ?? 'normal'
let lost = 0
for (let seed = 1; seed <= 12; seed++) {
	const rng = seeded(seed)
	let s = start
	const played = []
	while (!s.result && s.turn === 0) {
		const code = await chooseMove(V, s, { level, rng })
		played.push(code)
		s = Q.applyMove(V, s, code, rng).state
	}
	const takes = s.result ? [] : Q.legalMoves(V, s).filter((m) => m.type === 'move' && m.to >= 0
		&& s.worlds.some(({ b }) => b.board[m.to] === qid))
	if (takes.length) lost++
	console.log(`seed ${seed}: ${played.join(', ')}${takes.length ? '  -> Black takes the queen: ' + takes.map((m) => m.code).join(', ') : ''}`)
}
console.log(`${level} (replySide ${process.env.MVQ_REPLY === 'cont' ? 'core default' : 'spec: null in own turn'}): queen en prise after ${lost} of 12 turns`)
