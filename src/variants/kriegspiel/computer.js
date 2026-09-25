/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The computer player's view of a Kriegspiel game (handoff/research/kriegspiel.md, section 3.6). The computer knows
 * exactly what a human in its seat knows: its own pieces in every possibility, every announcement of the umpire and
 * the umpire's answers to its attempts. It never reads an enemy piece, an enemy move code, the enemy budget, the en
 * passant square or the quiet counter.
 *
 * The enemy army is guessed as phantoms: every enemy piece that was not announced as captured stands on its start
 * square (unless one of the computer's own pieces might stand there), the piece that captured last stands on the
 * capture square, and when the umpire announced pawn tries, phantom pawns stand on every square the computer's pawns
 * could capture on. A check announcement is kept in the view, and `evaluate` then wants the king off the announced
 * lines. When the umpire refuses every move the phantoms suggest, the computer tries the moves a player could try
 * until the umpire accepts one, and searches a view in which that move is possible.
 */

import { branches, legalMoves } from '../core/quantum.js'
import { cloneWorld } from '../core/world.js'
import { candidateMoves, hasCaptureOnlyMove, onCheckLine, ownView, visibility } from './umpire.js'

/** The penalty (centipawns) for a king that still stands on a line of the check announced against it. */
export const CHECK_PENALTY = 250

/** The start squares of each side's pieces: variant → Map(side → [{ type, sq }]). */
const slotCache = new WeakMap()

/**
 * The Chebyshev distance of two squares (the number of king steps between them on an empty board).
 *
 * @param {object} V variant
 * @param {number} a square
 * @param {number} b square
 * @return {number}
 */
function distance(V, a, b) {
	const ca = V.topology.coords[a]
	const cb = V.topology.coords[b]
	return Math.max(...ca.map((v, i) => Math.abs(v - cb[i])))
}

/**
 * The index of the entry of `list` whose square is nearest to `target` (ties: the lowest square), or -1.
 *
 * @param {object} V variant
 * @param {Array<{sq: number}>} list entries with a square
 * @param {number} target square
 * @return {number}
 */
function nearest(V, list, target) {
	let best = -1
	for (let i = 0; i < list.length; i++) {
		if (best < 0) {
			best = i
			continue
		}
		const d = distance(V, list[i].sq, target) - distance(V, list[best].sq, target)
		if (d < 0 || (d === 0 && list[i].sq < list[best].sq)) {
			best = i
		}
	}
	return best
}

/**
 * The phantom slots of a side: its pieces in the start position, `[{ type, sq }]`, royal pieces first, then by
 * descending value, then by square.
 *
 * @param {object} V variant
 * @param {number} side side index
 * @return {Array<{type: string, sq: number}>}
 */
function slotsOf(V, side) {
	let perSide = slotCache.get(V)
	if (perSide === undefined) {
		perSide = new Map()
		slotCache.set(V, perSide)
	}
	let slots = perSide.get(side)
	if (slots === undefined) {
		const start = V.setup({}, () => 0)
		slots = []
		for (let id = 0; id < start.sq.length; id++) {
			if (start.sd[id] === side && start.sq[id] >= 0) {
				slots.push({ type: start.ty[id], sq: start.sq[id] })
			}
		}
		const rank = (s) => (V.royalTypes.has(s.type) ? 1 : 0)
		slots.sort((a, b) => rank(b) - rank(a) || V.types[b.type].value - V.types[a.type].value
			|| a.type.localeCompare(b.type) || a.sq - b.sq)
		perSide.set(side, slots)
	}
	return slots
}

/**
 * The enemy slots still alive after the captures the umpire announced for `me`'s moves: a pawn capture removes the
 * pawn slot nearest to the capture square, a piece capture the non-pawn slot nearest to it (a pawn slot when no piece
 * is left: the victim was a promoted pawn).
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} me the computer's side
 * @param {number} enemy the enemy side
 * @return {Array<{type: string, sq: number}>}
 */
function aliveSlots(V, state, me, enemy) {
	const alive = slotsOf(V, enemy).slice()
	for (const h of state.history) {
		if (h.side !== me) {
			continue
		}
		for (const c of h.info?.announce?.captures ?? []) {
			const sq = V.topology.byName(c.sq)
			if (sq < 0 || c.kind === 'king') {
				continue
			}
			const pawn = c.kind === 'pawn'
			const entries = alive.map((s, i) => ({ sq: s.sq, i, s })).filter((e) => !V.royalTypes.has(e.s.type))
			let pool = entries.filter((e) => hasCaptureOnlyMove(V, e.s.type) === pawn)
			if (!pool.length) {
				pool = entries
			}
			const k = nearest(V, pool, sq)
			if (k >= 0) {
				alive.splice(pool[k].i, 1)
			}
		}
	}
	return alive
}

/**
 * The square nearest to `target` that is not taken (ties: the lowest square), or -1.
 *
 * @param {object} V variant
 * @param {number} target square
 * @param {Set<number>} taken squares that may not be used
 * @return {number}
 */
function nearestFree(V, target, taken) {
	const free = []
	for (let sq = 0; sq < V.topology.size; sq++) {
		if (!taken.has(sq)) {
			free.push({ sq })
		}
	}
	const k = nearest(V, free, target)
	return k < 0 ? -1 : free[k].sq
}

/**
 * The own view with the phantoms added (the same squares in every world) and the check note in `x.aiCheck`.
 *
 * @param {object} own the own view
 * @param {number} enemy the enemy side
 * @param {Array<{type: string, sq: number}>} phantoms phantom pieces on squares that hold no own piece in any world
 * @param {object|null} aiCheck the check note, or null
 * @return {object}
 */
function withPhantoms(own, enemy, phantoms, aiCheck) {
	const worlds = own.worlds.map(({ b, w }) => {
		const c = cloneWorld(b)
		for (const p of phantoms) {
			const id = c.sq.length
			c.sq.push(p.sq)
			c.ty.push(p.type)
			c.sd.push(enemy)
			c.board[p.sq] = id
		}
		if (aiCheck) {
			c.x = { ...c.x, aiCheck }
		}
		return { b: c, w }
	})
	return { ...own, worlds }
}

/**
 * The phantom army: the king always (on its start square, or the nearest square without an own piece), every other
 * alive slot whose start square holds no own piece in any world, the last capturer moved onto the square of its
 * capture, and phantom pawns on the free capture squares of the own pawns when the umpire announced pawn tries.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {number} me the computer's side
 * @param {number} enemy the enemy side
 * @param {object|undefined} last the latest history record
 * @return {Array<{type: string, sq: number}>}
 */
function phantomArmy(V, state, me, enemy, last) {
	const taken = visibility(state, me)
	const phantoms = []
	for (const slot of aliveSlots(V, state, me, enemy)) {
		let sq = slot.sq
		if (taken.has(sq)) {
			if (!V.royalTypes.has(slot.type)) {
				continue
			}
			sq = nearestFree(V, slot.sq, taken)
			if (sq < 0) {
				continue
			}
		}
		phantoms.push({ type: slot.type, sq })
		taken.add(sq)
	}
	// the piece that captured last now stands on the capture square
	const cap = last && last.side !== me ? last.info?.announce?.captures?.[0] : null
	const X = cap && cap.kind !== 'king' ? V.topology.byName(cap.sq) : -1
	if (X >= 0 && !taken.has(X)) {
		const movable = phantoms.map((p, i) => ({ sq: p.sq, i, p })).filter((e) => !V.royalTypes.has(e.p.type))
		const pieces = movable.filter((e) => !hasCaptureOnlyMove(V, e.p.type))
		const pool = pieces.length ? pieces : movable
		const k = nearest(V, pool, X)
		if (k >= 0) {
			taken.delete(pool[k].p.sq)
			phantoms[pool[k].i] = { type: pool[k].p.type, sq: X }
			taken.add(X)
		}
	}
	// pawn tries: something stands on some square an own pawn could capture on
	if (last?.info?.announce?.tries > 0) {
		const b = state.worlds[0].b
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sd[id] !== me || b.sq[id] < 0 || !hasCaptureOnlyMove(V, b.ty[id])) {
				continue
			}
			for (const line of captureTargets(V, b.ty[id], me, b.sq[id])) {
				if (!taken.has(line)) {
					phantoms.push({ type: 'p', sq: line })
					taken.add(line)
				}
			}
		}
	}
	return phantoms
}

/**
 * The squares a piece of a type with capture-only moves (a pawn) could capture on from `sq`.
 *
 * @param {object} V variant
 * @param {string} type piece type
 * @param {number} side side index
 * @param {number} sq square
 * @return {number[]}
 */
function captureTargets(V, type, side, sq) {
	const out = []
	for (const d of V.types[type].moves) {
		if (d.mode !== 'capture' || !d.leap) {
			continue
		}
		for (const raw of d.leap) {
			const t = V.topology.step(sq, d.oriented ? V.orient(side, raw) : raw)
			if (t >= 0) {
				out.push(t)
			}
		}
	}
	return out.sort((a, b) => a - b)
}

/**
 * The square of a side's royal piece in a world, or -1.
 *
 * @param {object} V variant
 * @param {object} b world
 * @param {number} side side index
 * @return {number}
 */
function royalSquare(V, b, side) {
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sd[id] === side && b.sq[id] >= 0 && V.royalTypes.has(b.ty[id])) {
			return b.sq[id]
		}
	}
	return -1
}

/**
 * A view in which a move the umpire accepts is possible, for when the umpire refuses every move of the phantom view:
 * the moves a player could try (the candidates, then the measurements and merges of the own view) are attempted in
 * order, and the first one accepted gets a view with only the phantom king, placed where it does not block that move
 * (and a phantom pawn on the target of a pawn try). Null when the umpire accepts nothing.
 *
 * @param {object} V variant
 * @param {object} state the real state
 * @param {number} me the computer's side
 * @param {number} enemy the enemy side
 * @param {object} own the own view
 * @param {object|null} aiCheck the check note
 * @return {object|null}
 */
function fallbackView(V, state, me, enemy, own, aiCheck) {
	const list = candidateMoves(V, state)
	const attempts = [
		...list.filter((m) => m.kind === 'try'),
		...list.filter((m) => m.kind !== 'try'),
		...legalMoves(V, own).filter((m) => m.type !== 'move'),
	]
	const accepted = attempts.find((m) => branches(V, state, m.code))
	if (!accepted) {
		return null
	}
	const taken = visibility(state, me)
	const extra = accepted.kind === 'try' && !taken.has(accepted.to) ? [{ type: 'p', sq: accepted.to }] : []
	for (const p of extra) {
		taken.add(p.sq)
	}
	const king = slotsOf(V, enemy).find((s) => V.royalTypes.has(s.type))
	const squares = []
	for (let sq = 0; sq < V.topology.size; sq++) {
		if (!taken.has(sq) && sq !== accepted.to) {
			squares.push({ sq })
		}
	}
	while (king && squares.length) {
		const k = nearest(V, squares, king.sq)
		const view = withPhantoms(own, enemy, [{ type: king.type, sq: squares[k].sq }, ...extra], aiCheck)
		if (branches(V, view, accepted.code)) {
			return view
		}
		squares.splice(k, 1)
	}
	return withPhantoms(own, enemy, extra, aiCheck)
}

/**
 * The state as the computer (side `me`) may know it, for its search (the `aiView` hook): the own view plus the
 * phantom army, the check note of the latest announcement, `history: []` and `quiet: 0`.
 *
 * @param {object} V variant
 * @param {object} state the real state
 * @param {number} me the computer's side
 * @return {object}
 */
export function aiView(V, state, me) {
	const enemy = V.sides.findIndex((s, i) => V.enemies(me, i))
	const own = ownView(state, me)
	// the latest announcement's check and pawn tries are those of the side to move
	const last = state.turn === me ? state.history.at(-1) : undefined
	const check = last?.info?.announce?.check
	const k = royalSquare(V, state.worlds[0].b, me)
	const aiCheck = check && k >= 0 ? { side: me, k, dirs: check.dirs.slice() } : null
	const view = withPhantoms(own, enemy, phantomArmy(V, state, me, enemy, last), aiCheck)
	// the computer tries the moves the phantoms suggest; when the umpire refuses them all, it tries the others
	if (!state.result && !legalMoves(V, view).some((m) => branches(V, state, m.code))) {
		return fallbackView(V, state, me, enemy, own, aiCheck) ?? view
	}
	return view
}

/**
 * The computer's own term (the `evaluate` hook), read only in its views: after a check was announced against side
 * `x.aiCheck.side`, a world in which that side's king still stands on one of the announced lines through its square
 * is worth `CHECK_PENALTY` less for that side and as much more for the other side.
 *
 * @param {object} V variant
 * @param {object} w world
 * @param {number} side the side the value is for
 * @return {number}
 */
export function evaluate(V, w, side) {
	const c = w.x?.aiCheck
	if (!c) {
		return 0
	}
	const k = royalSquare(V, w, c.side)
	if (k < 0 || !c.dirs.some((d) => onCheckLine(V, c.k, k, d))) {
		return 0
	}
	return side === c.side ? -CHECK_PENALTY : CHECK_PENALTY
}
