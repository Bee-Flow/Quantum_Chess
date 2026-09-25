// Builds patched copies of the variants core in ./core/ (the real files are never changed). The patches follow the
// lead's plan handoff/CORE-CHANGES.md where it covers the multiverse, plus the one extra hook of the faithful design:
//   Q1  applyMiss(b, action, side, { hit }) on idle worlds (moves, splits, merges, measures)
//   Q2  castling and en passant are certain-only (legal only when every world has the key)
//   Q3  unifyWorlds(bs, mover) at the start of stateAfter
//   Q11 squareView guard for display squares beyond board.length
//   U3  replies within a multi-move turn (my best continuation)
//   X2  budgetExtra(b, side): extra structure counted in a side's budget (requested by the faithful design)
// The sources are the committed core (git HEAD 155704f or later), read with `git show`, because the working tree's
// core is being changed by the core team. Usage: node patch-core.mjs
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const REPO = '/home/tom/Projects/Quantum_Chess/Quantum_Chess'
const HERE = new URL('.', import.meta.url).pathname
mkdirSync(HERE + 'core', { recursive: true })

function committed(path) {
	return execSync('git show 155704f:' + path, { cwd: REPO, encoding: 'utf8' })
}

function patch(src, pairs, file) {
	let out = src
	for (const [a, b] of pairs) {
		if (!out.includes(a)) {
			throw new Error(file + ': patch point not found: ' + a.slice(0, 80))
		}
		out = out.split(a).join(b)
	}
	return out
}

const q = patch(committed('src/variants/core/quantum.js'), [
	["import { rescaleWeights } from '../../engine/index.js'", `import { rescaleWeights } from '${REPO}/src/engine/rescale.js'`],
	["from './world.js'", `from '${REPO}/src/variants/core/world.js'`],
	// Q11
	["\t\tconst id = b.board[sq]\n\t\tif (id < 0) {\n\t\t\tcontinue\n\t\t}\n\t\tconst key = id + ':'", "\t\tconst id = b.board[sq]\n\t\tif (!(id >= 0)) {\n\t\t\tcontinue\n\t\t}\n\t\tconst key = id + ':'"],
	// X2
	['function projection(b, side) {', 'function projection(b, side, V) {'],
	["\treturn parts.sort().join(',')\n}", "\treturn parts.sort().join(',') + (V && V.budgetExtra ? '|' + V.budgetExtra(b, side) : '')\n}"],
	['export function budgetOf(worlds, side) {', 'export function budgetOf(worlds, side, V) {'],
	['\t\tset.add(projection(b, side))', '\t\tset.add(projection(b, side, V))'],
	['export function budget(state, side) {\n\treturn budgetOf(state.worlds, side)', 'export function budget(state, side, V) {\n\treturn budgetOf(state.worlds, side, V)'],
	// Q2: certain-only keys
	["\t\ttb = { gens, union }", "\t\tfor (const [k, m] of [...union]) {\n\t\t\tif ((m.certain ?? (m.kind === 'castle' || m.kind === 'ep')) && gens.some((g) => !g.has(k))) {\n\t\t\t\tunion.delete(k)\n\t\t\t}\n\t\t}\n\t\ttb = { gens, union }"],
	// Q1: idle entries of an ordinary move
	["\t\tif (!m) {\n\t\t\treturn { b, w, k: 'miss', cap: -1 }\n\t\t}\n\t\treturn {\n\t\t\tb: applyClassical(V, b, m),",
		"\t\tif (!m) {\n\t\t\treturn { b, w, k: 'miss', cap: -1, idle: true }\n\t\t}\n\t\treturn {\n\t\t\tb: applyClassical(V, b, m),"],
	[`	const keys = new Set(r.worlds.map((e) => e.k))
	if (keys.size === 1) {
		return toBranches(r.worlds, false)
	}
	if (isMeasured(V, state, r.sample)) {
		return toBranches(r.worlds, true)
	}
	// pass = link, unless the budget would break
	if (budgetOf(r.worlds, state.turn) > BUDGET) {
		return toBranches(r.worlds, true)
	}
	return toBranches(r.worlds, false)`, `	const keys = new Set(r.worlds.map((e) => e.k))
	const action = { type: 'move', code: key, key, sample: r.sample }
	if (keys.size === 1) {
		return toBranches(idleApply(V, state, action, r.worlds, true), false)
	}
	if (isMeasured(V, state, r.sample)) {
		return toBranches(idleApply(V, state, action, r.worlds, false), true)
	}
	// pass = link, unless the budget would break
	const linked = idleApply(V, state, action, r.worlds, true)
	if (budgetOf(linked, state.turn, V) > BUDGET) {
		return toBranches(idleApply(V, state, action, r.worlds, false), true)
	}
	return toBranches(linked, false)`],
	// Q1: splits
	["\t\tif (b.board[f] !== X) {\n\t\t\tworlds.push({ b, w, k: 'move', cap: -1 })", "\t\tif (b.board[f] !== X) {\n\t\t\tworlds.push({ b, w, k: 'move', cap: -1, idle: true })"],
	["worlds.push({ b: m1 ? applyClassical(V, b, m1) : b, w: w1, k: 'move', cap: -1 })", "worlds.push({ b: m1 ? applyClassical(V, b, m1) : b, w: w1, k: 'move', cap: -1, idle: !m1 })"],
	["worlds.push({ b: m2 ? applyClassical(V, b, m2) : b, w: w2, k: 'move', cap: -1 })", "worlds.push({ b: m2 ? applyClassical(V, b, m2) : b, w: w2, k: 'move', cap: -1, idle: !m2 })"],
	["\tif (!branching) {\n\t\treturn null\n\t}\n\tconst merged = dedupe(worlds)", "\tif (!branching) {\n\t\treturn null\n\t}\n\tconst done = idleApply(V, state, { type: 'split', code: mv.code, id: X, from: [f], to: [t1, t2] }, worlds, true)\n\tworlds.length = 0\n\tworlds.push(...done)\n\tconst merged = dedupe(worlds)"],
	['if (merged.length > MAX_WORLDS || budgetOf(merged, state.turn) > BUDGET) {', 'if (merged.length > MAX_WORLDS || budgetOf(merged, state.turn, V) > BUDGET) {'],
	// Q1: merges
	["\t\tif (!m) {\n\t\t\treturn { b, w, k: 'miss', cap: -1 }\n\t\t}\n\t\treturn { b: applyClassical(V, b, m), w, k: m.capture",
		"\t\tif (!m) {\n\t\t\treturn { b, w, k: 'miss', cap: -1, idle: true }\n\t\t}\n\t\treturn { b: applyClassical(V, b, m), w, k: m.capture"],
	[`	const keys = new Set(worlds.map((e) => e.k))
	if (keys.size === 1) {
		return toBranches(worlds, false)
	}
	const enemyMaybe = state.worlds.some(({ b }) => b.board[t] >= 0 && b.sd[b.board[t]] !== state.turn)
	if (enemyMaybe || budgetOf(worlds, state.turn) > BUDGET) {
		return toBranches(worlds, true)
	}
	return toBranches(worlds, false)`, `	const keys = new Set(worlds.map((e) => e.k))
	const action = { type: 'merge', code: mv.code, id: X, from: [f1, f2], to: [t] }
	if (keys.size === 1) {
		return toBranches(idleApply(V, state, action, worlds, true), false)
	}
	const enemyMaybe = state.worlds.some(({ b }) => b.board[t] >= 0 && b.sd[b.board[t]] !== state.turn)
	const linked = idleApply(V, state, action, worlds, true)
	if (enemyMaybe || budgetOf(linked, state.turn, V) > BUDGET) {
		return toBranches(idleApply(V, state, action, worlds, false), true)
	}
	return toBranches(linked, false)`],
	// Q1: measure
	["\t\t\tworlds: list.map(({ b, w }) => ({ b, w, k: 'move', cap: -1 })),", "\t\t\tworlds: idleApply(V, state, { type: 'measure', code: mv.code, id: X, from: mv.from, to: [] }, list.map(({ b, w }) => ({ b, w, k: 'move', cap: -1, idle: true })), false),"],
	// Q3
	["\tconst merged = dedupe(branch.worlds)\n\tconst weights", "\tlet bw = branch.worlds\n\tif (V.unifyWorlds) {\n\t\tconst bs = V.unifyWorlds(bw.map((e) => e.b), state.turn)\n\t\tbw = bw.map((e, i) => ({ ...e, b: bs[i] }))\n\t}\n\tconst merged = dedupe(bw)\n\tconst weights"],
], 'quantum.js') + `
/**
 * Q1 (prototype): apply the variant's applyMiss hook to the idle entries of a per-world result.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {object} action the action
 * @param {object[]} entries per-world entries
 * @param {boolean} hit whether the action took effect in some world of the branch
 * @return {object[]}
 */
function idleApply(V, state, action, entries, hit) {
	if (!V.applyMiss) {
		return entries
	}
	return entries.map((e) => (e.idle ? { ...e, b: V.applyMiss(e.b, action, state.turn, { hit }) } : e))
}
`
writeFileSync(HERE + 'core/quantum.mjs', q)

const a = patch(committed('src/variants/core/ai.js'), [
	["from './quantum.js'", "from './quantum.mjs'"],
	["from './world.js'", `from '${REPO}/src/variants/core/world.js'`],
	['function replyValue(V, s, me, L) {\n\tconst them = s.turn\n',
		'function replyValue(V, s, me, L) {\n\tconst them = s.turn\n\tif (them === me) {\n\t\treturn continuationValue(V, s, me)\n\t}\n'],
], 'ai.js') + `
/**
 * U3 (prototype): the value of my best next move of the same turn (at most 40 candidates, in the variant's order).
 *
 * @param {object} V variant
 * @param {object} s state
 * @param {number} me my side
 * @return {number}
 */
function continuationValue(V, s, me) {
	let best = evaluateState(V, s, me)
	const codes = legalMoves(V, s).map((m) => m.code).slice(0, 40)
	for (const c of codes) {
		const list = branches(V, s, c)
		if (!list) {
			continue
		}
		let v = 0
		for (const br of list) {
			v += (br.weight / T) * evaluateState(V, stateAfter(V, s, c, br, list, { light: true }), me)
		}
		best = Math.max(best, v)
	}
	return best
}
`
writeFileSync(HERE + 'core/ai.mjs', a)
console.log('patched core written to', HERE + 'core/')
