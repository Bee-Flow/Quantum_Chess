import { V, P, Q, stateOfWorlds } from '../../tmp/mv-final/libf.mjs'
import { evaluateState } from '../../tmp/mv-final/core/ai.mjs'
const w = P.buildWorld({ n: 5, h: 4, m: 3, md: 0, s: 0, c: [1, 0], rows: {
	0: { st: 2, en: 10, boards: { 10: '1p3/2p1k/5/5/K1Q2' } },
	1: { st: 9, en: 10, parent: [0, 8], boards: { 10: '4k/3pp/5/5/K4' } },
} })
const s = stateOfWorlds([[w, 1]], 0)
const view = P.aiView(s)
console.log('view pruned', view !== s)
for (const code of ['(0T5)c1-c4', '(0T5)c1>(+1T5)b1', '(0T5)a1-a2', '(+1T5)a1-a2']) {
	const list = Q.branches(V, view, code)
	if (!list) { console.log(code, 'not in view'); continue }
	const n = Q.stateAfter(V, view, code, list[0], list, { light: true })
	console.log(code.padEnd(20), 'turn after', n.turn, 'static value', Math.round(evaluateState(V, n, 0)))
}
