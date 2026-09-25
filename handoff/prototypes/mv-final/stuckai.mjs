// Self-play: positions where the spec's stuck test says "not stuck" but the corrected step 6 says "stuck".
import { V, P, Q, seeded } from '../../tmp/mv-final/libf.mjs'
import { chooseMove } from '../../tmp/mv-final/core/ai.mjs'
import * as F from './mvf-fix6.mjs'
const [setup = 'marauders', seeds = '20', level = 'easy'] = process.argv.slice(2)
let games = 0, missed = 0, endings = {}
for (let seed = 1; seed <= Number(seeds); seed++) {
	const rng = seeded(seed)
	let s = Q.newGame(V, { setup, timelines: '3' })
	let hit = false
	while (!s.result && s.ply < 200) {
		if (!hit && F.stuck(s) && !P.stuck(s)) {
			hit = true
			missed++
			const truth = Q.royalDanger(V, s, s.turn) >= 1 ? 'checkmate' : 'stalemate'
			console.log(`seed ${seed} ply ${s.ply}: stuck side ${s.turn} not detected (exact: ${truth})`)
		}
		const code = await chooseMove(V, s, { level, rng })
		s = Q.applyMove(V, s, code, rng).state
	}
	games++
	const k = s.result ? s.result.reason : 'open'
	endings[k] = (endings[k] ?? 0) + 1
	if (hit) console.log(`   ... game ended ${JSON.stringify(s.result)} at ply ${s.ply}`)
}
console.log({ setup, level, games, gamesWithMissedStuck: missed, endings })
