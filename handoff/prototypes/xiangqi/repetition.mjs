// Simulation of the proposed core change "repetition" (handoff/research/xiangqi.md, 3.2) with the xiangqi hook
// "perpetual check loses". The driver keeps what the core would keep in the history records. Usage: node repetition.mjs
import { worldKey } from '../../../src/variants/core/world.js'
import { V, after, check, failures, royalDanger, stateOf } from './lib.mjs'

/** The position key of a state: side to move and every world with its weight (worlds are sorted by the core). */
function positionKey(s) {
	return s.turn + '|' + s.worlds.map(({ b, w }) => worldKey(b) + ':' + w).join(';')
}

/**
 * The xiangqi hook: called at the third occurrence of a position with the records of the moves played since its
 * first occurrence. A side that gave check with every one of those moves loses; otherwise it is a draw.
 */
function repetitionResult(records) {
	const perpetual = [0, 1].map((side) => {
		const own = records.filter((r) => r.side === side)
		return own.length > 0 && own.every((r) => r.check)
	})
	if (perpetual[0] !== perpetual[1]) {
		return { winner: perpetual[0] ? 1 : 0, reason: 'perpetualCheck' }
	}
	return { winner: null, reason: 'repetition' }
}

/** Play a line; after every move apply the repetition rule as the core would. */
function playLine(s, line) {
	const records = [{ pos: positionKey(s), side: null, check: false }]
	for (const code of line) {
		const side = s.turn
		s = after(s, code)
		records.push({ pos: positionKey(s), side, check: royalDanger(V, s, s.turn) > 0 })
		const same = records.map((r, i) => (r.pos === records[records.length - 1].pos ? i : -1)).filter((i) => i >= 0)
		if (!s.result && same.length >= 3) {
			return { state: s, result: repetitionResult(records.slice(same[0] + 1)), ply: records.length - 1 }
		}
		if (s.result) {
			return { state: s, result: s.result, ply: records.length - 1 }
		}
	}
	return { state: s, result: null, ply: records.length - 1 }
}

// R1 perpetual check with a chariot: Red loses at the third occurrence (ply 8)
{
	const s = stateOf([[{ f1: '0:k', a9: '0:r', d10: '1:k' }, 1]])
	const line = ['a9-a10', 'd10-d9', 'a10-a9', 'd9-d10', 'a9-a10', 'd10-d9', 'a10-a9', 'd9-d10']
	const r = playLine(s, line)
	check('R1 perpetual check', [r.ply, r.result], [8, { winner: 1, reason: 'perpetualCheck' }])
	const s1 = after(s, 'a9-a10')
	check('R1 a9-a10 is check', royalDanger(V, s1, 1), 1)
}

// R2 repetition without checks: draw
{
	const s = stateOf([[{ f1: '0:k', a1: '0:r', d10: '1:k', i10: '1:r' }, 1]])
	const line = ['f1-f2', 'd10-d9', 'f2-f1', 'd9-d10', 'f1-f2', 'd10-d9', 'f2-f1', 'd9-d10']
	const r = playLine(s, line)
	check('R2 plain repetition', [r.ply, r.result], [8, { winner: null, reason: 'repetition' }])
}

// R3 check on every other move only (alternate check and idle): draw
{
	const s = stateOf([[{ f1: '0:k', a9: '0:r', d10: '1:k', i8: '1:r' }, 1]])
	const line = [
		'a9-a10', 'd10-d9', 'a10-b10', 'i8-i7', 'b10-a10', 'i7-i8', 'a10-a9', 'd9-d10',
		'a9-a10', 'd10-d9', 'a10-b10', 'i8-i7', 'b10-a10', 'i7-i8', 'a10-a9', 'd9-d10',
		'a9-a10', 'd10-d9', 'a10-b10', 'i8-i7', 'b10-a10', 'i7-i8', 'a10-a9', 'd9-d10',
	]
	const r = playLine(s, line)
	check('R3 alternate check and idle', [r.ply, r.result], [10, { winner: null, reason: 'repetition' }])
}

console.log(failures() ? failures() + ' FAILED' : 'all passed')
