/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Bee Flow Chess, named after Bee-Flow, the private AI workspace (https://github.com/Bee-Flow/Bee-Flow): orthodox
 * quantum chess in which the king is the Queen Bee and privacy is part of the game.
 *
 * - **Hidden start.** Each side's back rank is shuffled on its own (`backRank`, 5040 orders of R N B Q K B N R), so
 *   neither player knows where the other's Queen Bee starts. There is no castling; double steps, en passant and
 *   promotion are as usual.
 * - **Placeholders.** Like Bee-Flow's Privacy Shield, which swaps personal data for placeholders, a player sees every
 *   enemy piece where it stands (with its odds), but a piece that has not moved yet only as a placeholder (`x`), until
 *   it moves in any possibility (`x.seen`, the same in every world) or is captured (the capture tells its type).
 *   Pawns are always known. `viewOf(state, viewer)` is the state as a player may know it.
 * - **Privacy shield.** A piece next to its own Queen Bee cannot be captured in a world where she stands beside it
 *   (`filterMoves`); the Queen Bee herself is not shielded. Capturing her wins, with the classic end rules.
 *
 * Online the server rules the game (src/variants/referee.js and its PHP twin, lib/Variants/), since the browsers must
 * not know the hidden types. Player-facing rules are in docs/variants.md.
 */

import { t } from '@nextcloud/l10n'
import { orthodoxAfterMove, pawnExtras } from './core/orthodox.js'
import { orthodoxSpec } from './core/orthodoxVariant.js'
import { defineVariant } from './core/variant.js'
import { addPiece, emptyWorld, generate, nameOf, OFF, worldKey } from './core/world.js'

/** The back-rank pieces of one side and how many of each, in the order in which `backRank` counts their orders. */
const PIECES = Object.freeze({ b: 2, k: 1, n: 2, q: 1, r: 2 })
/** The number of different back ranks: 8! / (2! 2! 2!). */
export const ARRANGEMENTS = 5040
/** The placeholder type: an enemy piece whose type the viewer does not know. */
export const HIDDEN = 'x'

/**
 * The number of different orders of the pieces left.
 *
 * @param {Record<string, number>} left pieces left by type
 * @return {number}
 */
function orders(left) {
	let n = 0
	let d = 1
	for (const c of Object.values(left)) {
		n += c
		for (let i = 2; i <= c; i++) {
			d *= i
		}
	}
	let f = 1
	for (let i = 2; i <= n; i++) {
		f *= i
	}
	return f / d
}

/**
 * The back rank with number `index` (0 to 5039), from file a: the orders of the eight pieces in alphabetical order of
 * their letters, so 0 is `bbknnqrr` and 5039 is `rrqnnkbb`.
 *
 * @param {number} index arrangement number
 * @return {string}
 */
export function backRank(index) {
	const left = { ...PIECES }
	let rest = index
	let out = ''
	for (let i = 0; i < 8; i++) {
		for (const ty of Object.keys(left)) {
			if (left[ty] === 0) {
				continue
			}
			left[ty]--
			const n = orders(left)
			if (rest < n) {
				out += ty
				break
			}
			rest -= n
			left[ty]++
		}
	}
	return out
}

/**
 * Whether a value is an arrangement number.
 *
 * @param {unknown} n value
 * @return {boolean}
 */
function isArrangement(n) {
	return Number.isInteger(n) && n >= 0 && n < ARRANGEMENTS
}

const spec = orthodoxSpec()
const topo = spec.topology

/** The squares next to each square (the king's steps), by square index. */
const NEIGHBOURS = topo.coords.map(([f, r]) => {
	const out = []
	for (const [df, dr] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
		const sq = topo.at([f + df, r + dr])
		if (sq >= 0) {
			out.push(sq)
		}
	}
	return out
})

/**
 * Whether a piece stands under the privacy shield in a world: it is not royal, and a royal piece of its own side
 * stands next to it.
 *
 * @param {object} w world
 * @param {number} id piece id
 * @return {boolean}
 */
export function shielded(w, id) {
	const sq = w.sq[id]
	if (sq < 0 || spec.types[w.ty[id]]?.royal) {
		return false
	}
	for (const n of NEIGHBOURS[sq]) {
		const o = w.board[n]
		if (o >= 0 && w.sd[o] === w.sd[id] && spec.types[w.ty[o]]?.royal) {
			return true
		}
	}
	return false
}

/**
 * Whether a piece's type is public: a pawn, or a piece that has moved (`x.seen`).
 *
 * @param {object} w world
 * @param {number} id piece id
 * @return {boolean}
 */
function known(w, id) {
	return w.ty[id] === 'p' || (w.x.seen ?? []).includes(id)
}

/**
 * Merge identical worlds, their weights added, in the order in which they first appear.
 *
 * @param {Array<{b: object, w: number}>} worlds worlds
 * @return {Array<{b: object, w: number}>}
 */
function merged(worlds) {
	const byKey = new Map()
	for (const { b, w } of worlds) {
		const k = worldKey(b)
		const e = byKey.get(k)
		if (e) {
			e.w += w
		} else {
			byKey.set(k, { b, w })
		}
	}
	return [...byKey.values()]
}

/**
 * A world with the types of some pieces replaced.
 *
 * @param {object} b world
 * @param {(id: number) => string|null} typeOf the new type of a piece, or null to keep it
 * @return {object}
 */
function retyped(b, typeOf) {
	let ty = null
	for (let id = 0; id < b.ty.length; id++) {
		const t2 = typeOf(id)
		if (t2 !== null && t2 !== b.ty[id]) {
			ty ??= b.ty.slice()
			ty[id] = t2
		}
	}
	return ty ? { ...b, ty } : b
}

/**
 * The state as `viewer` may know it while the game runs: every enemy piece whose type is not public is a placeholder
 * (`x`), identical worlds are merged, and the shuffles of the back ranks (`options`) are left out. Once the game has
 * ended, the real state.
 *
 * @param {object} state the real state
 * @param {number} viewer side index
 * @return {object}
 */
export function viewOf(state, viewer) {
	if (state.result) {
		return state
	}
	const worlds = merged(state.worlds.map(({ b, w }) => ({
		b: retyped(b, (id) => (b.sd[id] !== viewer && !known(b, id) ? HIDDEN : null)),
		w,
	})))
	return { ...state, options: {}, worlds }
}

/**
 * The state as the computer playing `me` may know it: the enemy pieces whose type is not public get the types of
 * the enemy's back-rank pieces it has not seen yet, in the order of their ids (the Queen Bee first), the same in
 * every world. The computer plays as if that guess were true; every move it picks is checked on the real state.
 *
 * @param {object} state the real state
 * @param {number} me the computer's side
 * @return {object}
 */
export function aiView(state, me) {
	const b0 = state.worlds[0].b
	const enemy = 1 - me
	const left = { k: 1, q: 1, r: 2, b: 2, n: 2 }
	const unknown = []
	for (let id = 0; id < b0.ty.length; id++) {
		// the back-rank pieces of a side have the first eight ids of its sixteen (see `setup`); pawns are known
		if (b0.sd[id] !== enemy || id % 16 >= 8) {
			continue
		}
		if (known(b0, id) || state.worlds.every(({ b }) => b.sq[id] === OFF)) {
			// a piece that moved, or that was taken (the capture told its type), counts as seen
			if (left[b0.ty[id]] > 0) {
				left[b0.ty[id]]--
			}
		} else {
			unknown.push(id)
		}
	}
	const guess = new Map()
	const pool = Object.entries(left).flatMap(([ty, n]) => Array(n).fill(ty))
	unknown.forEach((id, i) => guess.set(id, pool[i] ?? 'n'))
	const worlds = merged(state.worlds.map(({ b, w }) => ({ b: retyped(b, (id) => guess.get(id) ?? null), w })))
	return { ...state, options: {}, worlds }
}

/**
 * What a capture tells, stored on the history record as `{ taken, types }` (as in Fog of war): the squares where the
 * taken pieces stood, and the types that might have stood there, so a captured placeholder is revealed.
 *
 * @param {object} prev the state before the move
 * @param {string} code move code
 * @param {object} branch the outcome played
 * @return {{taken: number[], types: string[][]}|null}
 */
function recordInfo(prev, code, branch) {
	if (!branch.captures.length) {
		return null
	}
	const b = prev.worlds[0].b
	const m = generate(spec, b, prev.turn).get(code)
	if (m && m.kind === 'ep') {
		return { taken: [b.x.epVictim], types: [['p']] }
	}
	const types = branch.captures.map((sq) => {
		const found = new Set()
		for (const { b: pb } of prev.worlds) {
			const occ = pb.board[sq]
			if (occ >= 0 && pb.sd[occ] !== prev.turn) {
				found.add(pb.ty[occ])
			}
		}
		return [...found].sort()
	})
	return { taken: branch.captures.slice(), types }
}

Object.assign(spec, {
	id: 'beeflow',
	category: 'featured',
	hidden: true,
	// for the referee fixtures (tests/fixtures/generate-referee-fixtures.mjs)
	arrangements: ARRANGEMENTS,
	shielded: (w, id) => shielded(w, id),

	/**
	 * The start world: each side's back rank by its own arrangement number (`options.white`, `options.black`), or a
	 * random one; pawns as usual, no castling rights, and no piece seen yet.
	 *
	 * @param {object} [options] arrangement numbers
	 * @param {() => number} [rng] random numbers in [0, 1)
	 * @return {object}
	 */
	setup(options = {}, rng = Math.random) {
		const pick = (n) => (isArrangement(n) ? n : Math.min(ARRANGEMENTS - 1, Math.floor(rng() * ARRANGEMENTS)))
		const ranks = [backRank(pick(options?.white)), backRank(pick(options?.black))]
		const w = emptyWorld(spec)
		for (const side of [0, 1]) {
			const back = side === 0 ? 0 : 7
			const pawns = side === 0 ? 1 : 6
			for (let f = 0; f < 8; f++) {
				addPiece(w, ranks[side][f], side, topo.at([f, back]))
			}
			for (let f = 0; f < 8; f++) {
				addPiece(w, 'p', side, topo.at([f, pawns]))
			}
		}
		w.x = { ep: -1, epVictim: -1, castle: [], seen: [] }
		return w
	},
	// double steps and en passant; no castling
	extraMoves(w, side) {
		return pawnExtras(spec, w, side, (s, sq) => spec.board.rankOf(sq) === (s === 0 ? 1 : 6))
	},
	// the privacy shield
	filterMoves(w, side, list) {
		return list.filter((m) => m.capture < 0 || !shielded(w, m.capture))
	},
	/**
	 * The orthodox bookkeeping (en passant), and the moving piece is seen.
	 *
	 * @param {object} next the new world (mutable)
	 * @param {object} m the move
	 */
	afterMove(next, m) {
		orthodoxAfterMove(spec, next, m)
		const seen = next.x.seen ?? []
		next.x.seen = seen.includes(m.id) ? seen : [...seen, m.id].sort((a, c) => a - c)
	},
	/**
	 * A piece seen in one world is seen in all of them (what the board showed cannot be unseen).
	 *
	 * @param {object[]} bs the worlds of the new state
	 * @return {object[]}
	 */
	unifyWorlds(bs) {
		const all = new Set()
		for (const b of bs) {
			for (const id of b.x.seen ?? []) {
				all.add(id)
			}
		}
		const union = [...all].sort((a, c) => a - c)
		return bs.map((b) => ((b.x.seen ?? []).length === union.length ? b : { ...b, x: { ...b.x, seen: union } }))
	},
	viewOf: (state, viewer) => viewOf(state, viewer),
	aiView: (state, side) => aiView(state, side),
	recordInfo: (prev, code, branch) => recordInfo(prev, code, branch),
	infoText(record, viewer) {
		if (!record.info?.taken?.length || record.side === viewer) {
			return null
		}
		const squares = record.info.taken.map((s) => nameOf(spec, s)).join(', ')
		return [t('quantumchess', 'Capture on {squares}', { squares })]
	},

	rules: () => [
		t(
			'quantumchess',
			'Bee Flow Chess is named after Bee-Flow, the private AI workspace. Your king is the Queen Bee: capture the other Queen Bee to win.',
		),
		t(
			'quantumchess',
			'Each player\'s back rank is shuffled on its own, so nobody knows where the other Queen Bee starts. There is no castling.',
		),
		t(
			'quantumchess',
			'Privacy first: you see where every enemy piece stands, but only as a honeycomb cell until it has moved. Pawns are always known, and a captured piece shows what it was.',
		),
		t(
			'quantumchess',
			'Privacy shield: a piece next to its own Queen Bee cannot be captured. The Queen Bee herself is not shielded, so separate her from her swarm first.',
		),
		t(
			'quantumchess',
			'In pass & play each player sees only their own pieces\' types: hand the device over when asked. The whole board is revealed when the game ends.',
		),
	],
})

// The Queen Bee and the placeholder: the king keeps its moves under a new name and a bee on its crown.
Object.assign(spec.types.k, {
	name: () => t('quantumchess', 'Queen Bee'),
	glyph: { sprite: 'k', bee: true },
})
spec.types[HIDDEN] = {
	name: () => t('quantumchess', 'Hidden piece'),
	moves: [],
	value: 300,
	glyph: { text: '', shape: 'hex' },
}

export default defineVariant(spec)
