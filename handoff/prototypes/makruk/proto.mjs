// Prototype of the makruk variant on the real variants core, used to check every test case of
// handoff/research/makruk.md. It is the module sketched in section 3 of the spec, without translations.
import { defineVariant } from '../../../src/variants/core/variant.js'
import { whiteBlack } from '../../../src/variants/core/orthodoxVariant.js'
import { BISHOP_DIRS, KING_STEPS, KNIGHT_JUMPS, ROOK_DIRS, standardBoard } from '../../../src/variants/core/orthodox.js'
import { addPiece, applyClassical, attacks, emptyWorld, generate } from '../../../src/variants/core/world.js'

const board = standardBoard(8, 8)
const { rankOf, topology } = board

/** Piece values in centipawns for the computer player. */
export const VALUES = { k: 400, r: 540, n: 320, s: 250, m: 170, p: 100 }

const types = {
	k: { name: 'Khun', moves: [{ leap: KING_STEPS }], royal: true, value: VALUES.k, glyph: { sprite: 'k' } },
	m: { name: 'Met', moves: [{ leap: BISHOP_DIRS }], value: VALUES.m, glyph: { text: 'M', shape: 'circle' } },
	s: {
		name: 'Khon',
		moves: [{ leap: BISHOP_DIRS }, { leap: [[0, 1]], oriented: true }],
		value: VALUES.s,
		glyph: { text: 'Kh', shape: 'circle' },
	},
	n: { name: 'Ma', moves: [{ leap: KNIGHT_JUMPS }], value: VALUES.n, glyph: { sprite: 'n' } },
	r: { name: 'Rua', moves: [{ ride: ROOK_DIRS }], value: VALUES.r, glyph: { sprite: 'r' } },
	p: {
		name: 'Bia',
		moves: [
			{ leap: [[0, 1]], oriented: true, mode: 'move' },
			{ leap: [[1, 1], [-1, 1]], oriented: true, mode: 'capture' },
		],
		solid: true,
		value: VALUES.p,
		glyph: { sprite: 'p' },
		// the sixth rank and beyond (ranks 7 and 8 only matter for hand-made positions)
		promote: { zone: (side, sq) => (side === 0 ? rankOf(sq) >= 5 : rankOf(sq) <= 2), to: ['m'] },
	},
}

/** Back ranks from file a: White has the Khun on d1 and the Met on e1, Black the Met on d8 and the Khun on e8. */
export const BACK = ['rnskmsnr', 'rnsmksnr']

/**
 * The square of a side's Khun, or -1.
 *
 * @param {object} w world
 * @param {number} side side
 * @return {number}
 */
export function khunSquare(w, side) {
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sq[id] >= 0 && w.sd[id] === side && w.ty[id] === 'k') {
			return w.sq[id]
		}
	}
	return -1
}

/**
 * Whether two squares touch (Chebyshev distance 1).
 *
 * @param {number} a square
 * @param {number} b square
 * @return {boolean}
 */
function touch(a, b) {
	const [fa, ra] = topology.coords[a]
	const [fb, rb] = topology.coords[b]
	return Math.max(Math.abs(fa - fb), Math.abs(ra - rb)) === 1
}

/**
 * Count the pieces of a world: `{ total, side: [n0, n1], bia, of(side, type) }`.
 *
 * @param {object} w world
 * @return {object}
 */
function census(w) {
	const out = { total: 0, side: [0, 0], bia: 0, types: [{}, {}] }
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sq[id] < 0) {
			continue
		}
		out.total++
		out.side[w.sd[id]]++
		if (w.ty[id] === 'p') {
			out.bia++
		}
		const t = out.types[w.sd[id]]
		t[w.ty[id]] = (t[w.ty[id]] ?? 0) + 1
	}
	return out
}

/**
 * The pieces' honour limit of the chasing side (Fairy-Stockfish `count_limit`, makruk).
 *
 * @param {object} t the chaser's type counts
 * @return {number}
 */
export function honourLimit(t) {
	if ((t.r ?? 0) >= 2) {
		return 8
	}
	if ((t.r ?? 0) === 1) {
		return 16
	}
	if ((t.s ?? 0) >= 2) {
		return 22
	}
	if ((t.n ?? 0) >= 2) {
		return 32
	}
	if ((t.s ?? 0) === 1) {
		return 44
	}
	return 64
}

/**
 * Whether `side` (to move) is stalemated in a world: its Khun is not attacked, and every ordinary move leaves it
 * attacked (a move that captures the enemy Khun is always safe).
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side side to move
 * @return {boolean}
 */
export function stalemated(V, w, side) {
	const k = khunSquare(w, side)
	if (k < 0 || attacks(V, w, 1 - side, k)) {
		return false
	}
	for (const m of generate(V, w, side).values()) {
		if (m.capture >= 0 && w.ty[m.capture] === 'k') {
			return false
		}
		const next = applyClassical(V, w, m)
		if (!attacks(V, next, 1 - side, m.from === k ? m.to : k)) {
			return false
		}
	}
	return true
}

/** How often the stalemate test ran (for the benchmark). */
export const stats = { stalemateCalls: 0 }

const spec = {
	id: 'makruk',
	category: 'regional',
	rules: () => [],
	sides: whiteBlack(),
	topology,
	types,
	quietPlies: 128,
	setup() {
		const w = emptyWorld(spec)
		for (const side of [0, 1]) {
			const back = BACK[side]
			for (let f = 0; f < 8; f++) {
				addPiece(w, back[f], side, topology.at([f, side === 0 ? 0 : 7]))
			}
			for (let f = 0; f < 8; f++) {
				addPiece(w, 'p', side, topology.at([f, side === 0 ? 2 : 5]))
			}
		}
		w.x = {}
		return w
	},
	worldResult(w, mover) {
		const k0 = khunSquare(w, 0)
		const k1 = khunSquare(w, 1)
		if (k0 < 0 || k1 < 0) {
			return k0 < 0 && k1 < 0 ? { winner: null, reason: 'king' } : { winner: k0 >= 0 ? 0 : 1, reason: 'king' }
		}
		const c = census(w)
		if (c.total === 2) {
			// the side to move takes a Khun that touches its own
			return touch(k0, k1) ? null : { winner: null, reason: 'bareKings' }
		}
		stats.stalemateCalls++
		if (stalemated(spec, w, 1 - mover)) {
			return { winner: null, reason: 'stalemate' }
		}
		return null
	},
	stateResult(state) {
		const ws = state.worlds.map((e) => e.b)
		const info = countInfo(state)
		if (!info) {
			return null
		}
		const k0 = khunSquare(ws[0], 0)
		const k1 = khunSquare(ws[0], 1)
		if (k0 >= 0 && k1 >= 0 && touch(k0, k1)) {
			return null
		}
		return info.done >= info.allow ? { winner: null, reason: 'count' } : null
	},
	noMoves(state) {
		// reached only when the Khun of the side to move is attacked in every possibility (otherwise the
		// stalemate test of worldResult has already ended the game)
		return { winner: 1 - state.turn, reason: 'noMoves' }
	},
}

/**
 * The bare-Khun count of a state: null when it does not run, else
 * `{ lone, chaser, allow, done, limit, pieces }` (allow = chaser moves allowed, done = chaser moves made).
 *
 * @param {object} state state
 * @return {object|null}
 */
export function countInfo(state) {
	const cs = state.worlds.map((e) => census(e.b))
	if (cs.some((c) => c.bia > 0)) {
		return null
	}
	for (const lone of [0, 1]) {
		const chaser = 1 - lone
		if (!cs.every((c) => c.side[lone] === 1) || cs.every((c) => c.side[chaser] === 1)) {
			continue
		}
		let allow = -Infinity
		let limit = 0
		let pieces = 0
		for (const c of cs) {
			const L = honourLimit(c.types[chaser])
			if (L - c.total + 1 > allow) {
				allow = L - c.total + 1
				limit = L
				pieces = c.total
			}
		}
		const q = state.quiet
		const done = state.turn === lone ? Math.ceil(q / 2) : Math.floor(q / 2)
		return { lone, chaser, allow, done, limit, pieces }
	}
	return null
}

export const MAKRUK = defineVariant(spec)
