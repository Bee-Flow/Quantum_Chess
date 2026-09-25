// Helpers for the xiangqi prototype: states from explicit worlds, outcome printing, FEN, legal-move perft.
import {
	applyOutcome, branches, budget, legalMoves, outcomes, pieceLocations, royalDanger, splitsFrom, STATE_VERSION, T,
	newGame, stateAfter,
} from '../../../src/variants/core/quantum.js'
import { applyClassical, generate, nameOf, worldFrom, worldKey } from '../../../src/variants/core/world.js'
import V from './xiangqi.mjs'

export { V, applyOutcome, branches, budget, legalMoves, outcomes, pieceLocations, royalDanger, splitsFrom, T, newGame }
export { generate, applyClassical, stateAfter, worldKey }

/** A state from explicit worlds: [[placement, relativeWeight], ...]. */
export function stateOf(worlds, turn = 0) {
	const total = worlds.reduce((a, [, w]) => a + w, 0)
	let rest = T
	const list = worlds.map(([pl, rel, edit], i) => {
		const b = worldFrom(V, pl, {})
		if (edit) {
			edit(b)
		}
		const w = i === worlds.length - 1 ? rest : Math.floor((T * rel) / total)
		rest -= w
		return { b, w }
	})
	return { v: STATE_VERSION, variant: V.id, options: {}, worlds: list, turn, ply: 0, quiet: 0, result: null, history: [] }
}

/** Outcomes as short strings: `key p R [notes]`. */
export function outs(s, code) {
	const o = outcomes(V, s, code)
	return o ? o.map((x) => `${x.key} ${x.p.toFixed(4)}${x.rolled ? ' R' : ''}${x.notes.length ? ' [' + x.notes.join(';') + ']' : ''}`) : null
}

/** The worlds of a state as text. */
export function show(s) {
	return s.worlds.map(({ b, w }) => (w / T).toFixed(4) + ' ' + b.sq.map((q, id) => (q >= 0 ? (b.sd[id] ? b.ty[id] : b.ty[id].toUpperCase()) + nameOf(V, q) : null)).filter(Boolean).join(' '))
}

/** Locations of the piece standing (in some world) on a square. */
export function locs(s, name) {
	const sq = V.topology.byName(name)
	const w = s.worlds.find(({ b }) => b.board[sq] >= 0)
	const id = w.b.board[sq]
	return pieceLocations(s, id).map((l) => (l.sq >= 0 ? nameOf(V, l.sq) : 'off') + ' ' + l.p.toFixed(4)).join(', ')
}

/** Play an outcome (index) of a move that must be legal. */
export function after(s, code, i = 0) {
	const n = applyOutcome(V, s, code, i)
	if (!n) {
		throw new Error('illegal ' + code)
	}
	return n
}

/** Ordinary move codes of the side to move. */
export function codes(s) {
	return legalMoves(V, s).map((m) => m.code)
}

// ------------------------------------------------------------ classical checks

const FEN_TYPE = { r: 'r', n: 'h', h: 'h', b: 'e', e: 'e', a: 'a', k: 'k', c: 'c', p: 'p' }

/** A classical world from a FEN (Fairy-Stockfish letters: r n b a k c p, upper case = Red). */
export function fromFen(fen) {
	const [board, turn] = fen.split(' ')
	const rows = board.split('/')
	const pl = {}
	rows.forEach((row, i) => {
		const r = 9 - i
		let f = 0
		for (const m of row.matchAll(/(\d+)|([a-zA-Z])/g)) {
			if (m[1]) {
				f += Number(m[1])
				continue
			}
			const ch = m[2]
			const side = ch === ch.toUpperCase() ? 0 : 1
			pl['abcdefghi'[f] + (r + 1)] = side + ':' + FEN_TYPE[ch.toLowerCase()]
			f++
		}
	})
	return { world: worldFrom(V, pl, {}), turn: turn === 'b' ? 1 : 0 }
}

/** Whether the general of `side` could be captured by the other side in the world. */
export function generalAttacked(w, side) {
	for (const m of generate(V, w, 1 - side).values()) {
		if (m.capture >= 0 && w.ty[m.capture] === 'k') {
			return true
		}
	}
	return false
}

/** Legal classical moves (check and facing generals forbidden): the rules of real xiangqi. */
export function legalClassical(w, side) {
	const out = []
	for (const m of generate(V, w, side).values()) {
		const n = applyClassical(V, w, m)
		if (!generalAttacked(n, side)) {
			out.push(m)
		}
	}
	return out
}

/** Perft with the legal-move filter. */
export function perft(w, side, depth) {
	if (depth === 0) {
		return 1
	}
	const list = legalClassical(w, side)
	if (depth === 1) {
		return list.length
	}
	let n = 0
	for (const m of list) {
		n += perft(applyClassical(V, w, m), 1 - side, depth - 1)
	}
	return n
}

/** Perft split per first move, keys in UCI form (c1a3). */
export function divide(w, side, depth) {
	const out = {}
	for (const m of legalClassical(w, side)) {
		out[m.key.replace('-', '')] = perft(applyClassical(V, w, m), 1 - side, depth - 1)
	}
	return out
}

/** A small assertion helper that prints PASS / FAIL. */
let fails = 0
export function check(label, got, want) {
	const g = JSON.stringify(got)
	const ok = g === JSON.stringify(want)
	if (!ok) {
		fails++
	}
	console.log((ok ? 'PASS ' : 'FAIL ') + label + (ok ? '' : '\n   got  ' + g + '\n   want ' + JSON.stringify(want)))
}
export function failures() {
	return fails
}
