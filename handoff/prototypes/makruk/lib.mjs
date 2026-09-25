// Helpers for the makruk research cases (adapted from handoff/prototypes/c960/lib.mjs).
import {
	applyOutcome, branches, budget, legalMoves, newGame, outcomes, pieceLocations, royalDanger, splitsFrom, STATE_VERSION, T,
} from '../../../src/variants/core/quantum.js'
import { nameOf, worldFrom } from '../../../src/variants/core/world.js'

export { applyOutcome, branches, budget, legalMoves, newGame, outcomes, pieceLocations, royalDanger, splitsFrom, T }

/**
 * A state from explicit worlds `[[placement, relWeight], ...]`.
 *
 * @param {object} V variant
 * @param {Array} worlds worlds
 * @param {number} turn side to move
 * @param {number} quiet quiet plies
 * @return {object}
 */
export function stateOf(V, worlds, turn = 0, quiet = 0) {
	const total = worlds.reduce((a, [, w]) => a + w, 0)
	let rest = T
	const list = worlds.map(([pl, rel], i) => {
		const b = worldFrom(V, pl, {})
		const w = i === worlds.length - 1 ? rest : Math.floor((T * rel) / total)
		rest -= w
		return { b, w }
	})
	return { v: STATE_VERSION, variant: V.id, options: {}, worlds: list, turn, ply: 0, quiet, result: null, history: [] }
}

export function pieces(V, b) {
	return b.sq
		.map((q, id) => (q >= 0 ? (b.sd[id] ? b.ty[id] : b.ty[id].toUpperCase()) + nameOf(V, q) : null))
		.filter(Boolean)
		.sort()
		.join(' ')
}

export function show(V, s) {
	return s.worlds.map(({ b, w }) => (w / T).toFixed(4) + ' ' + pieces(V, b))
}

export function outs(V, s, code) {
	const o = outcomes(V, s, code)
	return o
		? o.map((x) => `${x.key}${x.notes.length ? '[' + x.notes.join(';') + ']' : ''} p=${x.p.toFixed(4)}${x.rolled ? ' R' : ''}`)
		: null
}

export function after(V, s, code, i = 0) {
	const n = applyOutcome(V, s, code, i)
	if (!n) {
		throw new Error('illegal or no outcome ' + i + ': ' + code)
	}
	return n
}

export function codes(V, s) {
	return legalMoves(V, s).map((m) => m.code)
}

export function hr(t) {
	console.log('\n=== ' + t)
}
