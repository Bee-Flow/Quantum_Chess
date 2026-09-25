// Small helpers for the capablanca research cases (adapted from handoff/prototypes/c960/lib.mjs).
import { applyOutcome, legalMoves, newGame, outcomes, STATE_VERSION, T } from '../../../src/variants/core/quantum.js'
import { nameOf, worldFrom } from '../../../src/variants/core/world.js'
import { castlingRights } from '../../../src/variants/core/orthodox.js'

export { newGame, legalMoves, outcomes, applyOutcome }

// state from explicit worlds [[placement, relWeight], ...]; castle: compute castling rights per world
export function stateOf(V, worlds, turn = 0, { castle = false, x = {} } = {}) {
	const total = worlds.reduce((a, [, w]) => a + w, 0)
	let rest = T
	const list = worlds.map(([pl, rel], i) => {
		const b = worldFrom(V, pl, {})
		b.x = { ep: -1, epVictim: -1, castle: [], ...x }
		if (castle) {
			b.x.castle = castlingRights(V, b)
		}
		const w = i === worlds.length - 1 ? rest : Math.floor((T * rel) / total)
		rest -= w
		return { b, w }
	})
	return { v: STATE_VERSION, variant: V.id, options: {}, worlds: list, turn, ply: 0, quiet: 0, result: null, history: [] }
}

export function pieces(V, b) {
	return b.sq
		.map((q, id) => (q >= 0 ? (b.sd[id] ? b.ty[id] : b.ty[id].toUpperCase()) + nameOf(V, q) : null))
		.filter(Boolean)
		.sort()
		.join(' ')
}

export function rights(b) {
	return (b.x.castle ?? []).map((c) => c.flag).join('')
}

export function show(V, s) {
	return s.worlds.map(({ b, w }) => (w / T).toFixed(4) + ' ' + pieces(V, b) + ' castle=' + rights(b)
		+ (b.x.ep >= 0 ? ' ep=' + nameOf(V, b.x.ep) : ''))
}

export function outs(V, s, code) {
	const o = outcomes(V, s, code)
	return o ? o.map((x) => `${x.key}${x.notes.length ? '[' + x.notes.join(';') + ']' : ''} ${x.p}${x.rolled ? ' R' : ''}`).join(' | ') : null
}

export function after(V, s, code, i = 0) {
	const n = applyOutcome(V, s, code, i)
	if (!n) {
		throw new Error('illegal or no outcome ' + i + ': ' + code)
	}
	return n
}

export function codes(V, s, opts) {
	return legalMoves(V, s, opts).map((m) => m.code)
}

let fails = 0
let passes = 0
export function check(label, got, want) {
	const ok = JSON.stringify(got) === JSON.stringify(want)
	if (ok) {
		passes++
		console.log('PASS', label)
	} else {
		fails++
		console.log('FAIL', label, '\n  got: ', JSON.stringify(got), '\n  want:', JSON.stringify(want))
	}
}
export function summary() {
	console.log(`\n${passes} passed, ${fails} failed`)
	if (fails) {
		process.exitCode = 1
	}
}
