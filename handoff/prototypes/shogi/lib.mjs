// Helpers for the shogi prototype scripts.
import {
	applyOutcome, branches, budget, handView, legalMoves, newGame, outcomes, ownPieceAt, pieceLocations, splitsFrom,
	STATE_VERSION, T, applyMove, royalDanger,
} from '../../../src/variants/core/quantum.js'
import { HAND, nameOf, worldFrom } from '../../../src/variants/core/world.js'

export { applyMove, branches, budget, handView, legalMoves, newGame, outcomes, ownPieceAt, pieceLocations, royalDanger,
	splitsFrom, T }

// worlds: [[placement, relativeWeight, hand?[[side, type]]], ...]; placement as worldFrom ({ '5i': '0:k' })
export function stateOf(V, worlds, turn = 0, edit = null) {
	const total = worlds.reduce((a, [, w]) => a + w, 0)
	let rest = T
	const list = worlds.map(([pl, rel, hand], i) => {
		const b = worldFrom(V, pl, {}, hand ?? [])
		if (edit) edit(b, i)
		const w = i === worlds.length - 1 ? rest : Math.floor((T * rel) / total)
		rest -= w
		return { b, w }
	})
	return { v: STATE_VERSION, variant: V.id, options: {}, worlds: list, turn, ply: 0, quiet: 0, result: null, history: [] }
}

const sym = (b, id) => (b.sd[id] === 0 ? b.ty[id].toUpperCase() : b.ty[id])
export function show(V, s) {
	return s.worlds.map(({ b, w }) => {
		const pcs = b.sq.map((q, id) => (q >= 0 ? sym(b, id) + nameOf(V, q) : null)).filter(Boolean).join(' ')
		const hand = b.sq.map((q, id) => (q === HAND ? sym(b, id) : null)).filter(Boolean).sort().join('')
		return (w / T).toFixed(4) + ' ' + pcs + (hand ? ' hand:' + hand : '')
	})
}
export function outs(V, s, code) {
	const o = outcomes(V, s, code)
	return o
		? o.map((x) => `${x.key}${x.notes.length ? '[' + x.notes.join(';') + ']' : ''} p=${x.p.toFixed(4)}${x.rolled ? ' R' : ''}`)
		: null
}
export function after(V, s, code, i = 0) {
	const n = applyOutcome(V, s, code, i)
	if (!n) throw new Error('illegal ' + code)
	return n
}
export function codes(V, s) {
	return legalMoves(V, s).map((m) => m.code)
}
export function hands(s, side) {
	return handView(s, side).map((h) => h.type + ':' + (h.min === h.max ? h.min : h.min + '-' + h.max)).join(' ')
}

let pass = 0
let fail = 0
export function check(label, got, want) {
	const g = JSON.stringify(got)
	const w = JSON.stringify(want)
	if (g === w) {
		pass++
		console.log('  ok   ' + label + ' = ' + g)
	} else {
		fail++
		console.log('  FAIL ' + label + '\n       got  ' + g + '\n       want ' + w)
	}
}
export function summary() {
	console.log(`\n${pass} checks passed, ${fail} failed`)
	if (fail) process.exitCode = 1
}
