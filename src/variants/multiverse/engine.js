/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The rules of multiverse chess on top of the quantum layer (handoff/research/multiverse-final.md sections 4, 6.8 to
 * 6.13 and 8): applying a move in one world, the idle worlds (`applyMiss`: a move always makes its boards, the dice
 * only decide what happens to the piece), `allowQuantum` (splits and merges on one board, measurements on a board the
 * side to move may play), castling rights over the worlds, the skeleton key, the captured king, and the end of a turn
 * that cannot be finished (the stuck test: checkmate, stalemate or stranded).
 *
 * Every function that builds a world is pure: it copies the world and never changes its input.
 */

import { t } from '@nextcloud/l10n'
import { branches, ownPieceAt, royalDanger, stateAfter } from '../core/quantum.js'
import { generate as cachedGenerate } from '../core/world.js'
import { genMoves } from './moves.js'
import { liveType, movedType, ROYAL } from './pieces.js'
import { grow, place } from './setup.js'
import {
	canSubmit,
	decode,
	idOf,
	mandatory,
	newRowFor,
	playable,
	ROWS,
	slotAt,
	sqOf,
	vOfSlot,
} from './skeleton.js'

/**
 * A copy of a world that may be changed (the arrays and the per-row parts of `x` are copied; `x` keeps its key
 * order).
 *
 * @param {object} w world
 * @return {object}
 */
export function clone(w) {
	const x = w.x
	return {
		sq: w.sq.slice(),
		ty: w.ty.slice(),
		sd: w.sd.slice(),
		board: w.board.slice(),
		x: { ...x, c: x.c.slice(), tl: x.tl.map((e) => (e ? e.slice() : null)), ep: x.ep.slice(), ord: x.ord.slice() },
	}
}

/**
 * Advance row u: its latest board becomes history (ring slot `1 + en % h`, whose old pieces are removed; the copies
 * get the cells' history ids and `'h' + type`), and the row gets its next board with the same live pieces.
 *
 * @param {object} w mutable world
 * @param {number} u storage row
 */
function advance(w, u) {
	const x = w.x
	const n = x.n
	const en = x.tl[u][1]
	const slot = 1 + (en % x.h)
	for (let y = 0; y < n; y++) {
		for (let c = 0; c < n; c++) {
			const hs = sqOf(u, slot, c, y)
			const hid = idOf(x, u, slot, c, y)
			const old = w.board[hs]
			if (old >= 0) {
				w.sq[old] = -1
				w.board[hs] = -1
			}
			const p = w.board[sqOf(u, 0, c, y)]
			if (p >= 0) {
				place(w, hid, hs, 'h' + w.ty[p], w.sd[p])
			} else {
				w.ty[hid] = ''
				w.sd[hid] = 0
			}
		}
	}
	x.tl[u][1] = en + 1
	x.ep[u] = -1
}

/**
 * Take the piece off a square, if any.
 *
 * @param {object} w mutable world
 * @param {number} sq square
 * @return {number} the piece removed, or −1
 */
function removeAt(w, sq) {
	const id = w.board[sq]
	if (id >= 0) {
		w.sq[id] = -1
		w.board[sq] = -1
	}
	return id
}

/**
 * Open a new timeline for a side: a copy of the stored board (tu, tv) with live types and the new row's ids, without
 * the piece on cell (skipX, skipY) (the target of the arriving piece; −1 for none). The mover's opponent moves there
 * first.
 *
 * @param {object} w mutable world
 * @param {number} side the side that opens it
 * @param {number} tu row of the copied board
 * @param {number} tv half-turn index of the copied board
 * @param {number} skipX file of the cell left out, or −1
 * @param {number} skipY rank of the cell left out, or −1
 * @return {number} the new row
 */
function openRow(w, side, tu, tv, skipX, skipY) {
	const x = w.x
	const n = x.n
	const nu = newRowFor(x, side)
	grow(w, nu)
	const slot = slotAt(x, tu, tv)
	for (let y = 0; y < n; y++) {
		for (let c = 0; c < n; c++) {
			const p = w.board[sqOf(tu, slot, c, y)]
			if (p >= 0 && !(c === skipX && y === skipY)) {
				place(w, idOf(x, nu, 0, c, y), sqOf(nu, 0, c, y), liveType(w.ty[p]), w.sd[p])
			}
		}
	}
	x.tl[nu] = [tv + 1, tv + 1, tu, tv]
	x.ep[nu] = -1
	x.c[side]++
	return nu
}

/**
 * The end of every action but Submit: one more action this turn, and when the side to move has no board left its
 * turn passes by itself.
 *
 * @param {object} x mutable extra state
 */
function autoEnd(x) {
	x.t++
	for (let u = 0; u < ROWS; u++) {
		if (playable(x, x.s, u)) {
			return
		}
	}
	x.s = 1 - x.s
	x.t = 0
}

/**
 * The variant's `apply`: a generated move in one world. A phantom move (the danger list) leaves the world as it is.
 *
 * @param {object} w world
 * @param {object} m the move, as generated in this world
 * @return {object}
 */
export function apply(w, m) {
	if (m.phantom) {
		return w
	}
	const next = clone(w)
	const x = next.x
	const side = x.s
	if (m.kind === 'submit') {
		x.s = 1 - side
		x.t = 0
		return next
	}
	const e = m.extra
	const type = m.promo ? 'q' : movedType(next.ty[m.id])
	if (m.kind === 'branch') {
		// the copied board is read first: it may be the slot of row u that the advance reuses
		const nu = e.noRow ? -1 : openRow(next, side, e.tu, e.tv, e.tx, e.ty)
		advance(next, e.u)
		removeAt(next, m.from)
		if (nu >= 0) {
			place(next, m.id, sqOf(nu, 0, e.tx, e.ty), type, side)
		} else {
			// a branch onto a royal piece: the game ends, no row opens
			x.k = side
		}
	} else if (m.kind === 'hop') {
		advance(next, e.u)
		advance(next, e.tu)
		removeAt(next, m.from)
		if (ROYAL.has(next.ty[removeAt(next, m.to)])) {
			x.k = side
		}
		place(next, m.id, m.to, type, side)
	} else {
		// on its own board: normal, double, en passant, castling
		advance(next, e.u)
		removeAt(next, m.from)
		if (m.capture >= 0) {
			if (ROYAL.has(next.ty[m.capture])) {
				x.k = side
			}
			removeAt(next, next.sq[m.capture])
		}
		place(next, m.id, m.to, type, side)
		if (m.kind === 'castle') {
			removeAt(next, e.rook.from)
			place(next, e.rook.id, e.rook.to, 'r', side)
		} else if (m.kind === 'double') {
			x.ep[e.u] = ((e.ty + decode(m.from).y) >> 1) * 8 + e.tx
		}
	}
	autoEnd(x)
	return next
}

/**
 * Whether a square holds a royal piece of the other side than `side` (in this world; royal pieces are solid, so the
 * same in every world).
 *
 * @param {object} w world
 * @param {number} sq square
 * @param {number} side side index
 * @return {boolean}
 */
function enemyRoyalAt(w, sq, side) {
	const o = w.board[sq]
	return o >= 0 && w.sd[o] !== side && ROYAL.has(w.ty[o])
}

/**
 * The variant's `applyMiss`: a world in which the action did not take effect gets the same new boards, just without
 * the piece moving. It ignores `info.hit`, so a rolled Missed builds the boards too, and the skeleton after an action
 * depends only on its code: the source board passes, a jumped-to board passes, a branch opens its timeline as an
 * untouched copy (none onto an enemy royal piece), a measurement uses the board of the measured part.
 *
 * @param {object} w world
 * @param {object} action the action (see the hook in core/variant.js)
 * @return {object}
 */
export function applyMiss(w, action) {
	if (action.type === 'pass') {
		return w
	}
	const next = clone(w)
	const x = next.x
	const side = x.s
	if (action.type === 'move') {
		const m = action.sample
		if (m.kind === 'submit') {
			x.s = 1 - side
			x.t = 0
			return next
		}
		const e = m.extra
		if (m.kind === 'branch' && !e.noRow) {
			openRow(next, side, e.tu, e.tv, -1, -1)
		}
		advance(next, e.u)
		if (m.kind === 'hop') {
			advance(next, e.tu)
		}
	} else if (action.type === 'measure') {
		advance(next, decode(action.from[0]).u)
	} else {
		// a split or merge: its parts and targets are on one board each (`allowQuantum`)
		const f = decode(action.from[0])
		const to = decode(action.to[0])
		if (to.slot > 0) {
			if (!enemyRoyalAt(next, action.to[0], side)) {
				openRow(next, side, to.u, vOfSlot(x, to.u, to.slot), -1, -1)
			}
			advance(next, f.u)
		} else {
			advance(next, f.u)
			if (to.u !== f.u) {
				advance(next, to.u)
			}
		}
	}
	autoEnd(x)
	return next
}

/**
 * The variant's `allowQuantum` (core hook, see core/variant.js): parts are handled only on latest boards; both halves
 * of a split land on one board; a merge starts from two parts on one board; a measurement needs a part on a board the
 * side to move may play (that board passes).
 *
 * @param {object} state state
 * @param {{type: string, from: number[], to: number[]}} action the split, merge or measurement
 * @return {boolean}
 */
export function allowQuantum(state, { type, from, to }) {
	const x = state.worlds[0].b.x
	const f = decode(from[0])
	if (f.slot !== 0) {
		return false
	}
	if (type === 'measure') {
		return x.s === state.turn && playable(x, state.turn, f.u)
	}
	if (type === 'merge') {
		const g = decode(from[1])
		return g.slot === 0 && g.u === f.u
	}
	const a = decode(to[0])
	const b = decode(to[1])
	return a.u === b.u && a.slot === b.slot
}

/**
 * The variant's `unifyWorlds`: a rook keeps its castling right (type `r0`) only while it is `r0` on the same square
 * in every world; otherwise it becomes `r` everywhere. The input is returned when nothing changes.
 *
 * @param {object[]} bs the worlds of the chosen outcome
 * @return {object[]}
 */
export function unifyWorlds(bs) {
	if (bs.length < 2) {
		return bs
	}
	const b0 = bs[0]
	let lost = null
	for (let id = 0; id < b0.sq.length; id++) {
		let any = false
		let same = true
		for (const b of bs) {
			const r0 = b.ty[id] === 'r0'
			any ||= r0
			same &&= r0 && b.sq[id] === b0.sq[id] && b.sq[id] >= 0
		}
		if (any && !same) {
			(lost ??= []).push(id)
		}
	}
	if (!lost) {
		return bs
	}
	return bs.map((b) => {
		if (!lost.some((id) => b.ty[id] === 'r0')) {
			return b
		}
		const ty = b.ty.slice()
		for (const id of lost) {
			if (ty[id] === 'r0') {
				ty[id] = 'r'
			}
		}
		return { ...b, ty }
	})
}

/**
 * The variant's `solidExtra`: the skeleton, which is the same in every world (side to move, actions this turn,
 * created counts, every row's first and latest board).
 *
 * @param {object} w world
 * @return {string}
 */
export function solidExtra(w) {
	const x = w.x
	return x.s + '/' + x.t + '/' + x.c.join(',') + '/' + x.tl.map((e) => (e ? e[0] + '.' + e[1] : '')).join(';')
}

/**
 * The variant's `worldResult`: a captured royal piece wins for the capturer.
 *
 * @param {object} w world
 * @return {{winner: number, reason: string}|null}
 */
export function worldResult(w) {
	return w.x.k >= 0 ? { winner: w.x.k, reason: 'king' } : null
}

// ---------------------------------------------------------------------------------------------------------------
// A turn that cannot be finished
// ---------------------------------------------------------------------------------------------------------------

/**
 * Whether piece `id` stands on different squares over the worlds.
 *
 * @param {object} state state
 * @param {number} id piece id
 * @return {boolean}
 */
function superposed(state, id) {
	const first = state.worlds[0].b.sq[id]
	return state.worlds.some(({ b }) => b.sq[id] !== first)
}

/**
 * A copy of a skeleton for the completion search (rows and created counts only).
 *
 * @param {object} y extra state
 * @return {object}
 */
function skeletonCopy(y) {
	return { ...y, c: y.c.slice(), tl: y.tl.map((e) => (e ? e.slice() : null)) }
}

/**
 * The abstract actions of the side to move for the completion search, from the unpruned union of its keys over the
 * worlds (castling and en passant only when every world has them): per playable row, whether it has a move on its
 * own board (`solo`), its jumps and branches as target boards, and its superposed pieces with a part there (a
 * measurement uses the row). Null when some key might capture an enemy royal piece: the player may still try it.
 *
 * @param {object} state state
 * @param {number} side the side to move
 * @param {number[]} rows its playable rows
 * @return {{solo: Set<number>, hops: Map<number, number[][]>, branches: Map<number, number[][]>,
 *   measures: Map<number, number[]>}|null}
 */
function abstractActions(state, side, rows) {
	const x = state.worlds[0].b.x
	const all = new Map()
	const count = new Map()
	for (const { b } of state.worlds) {
		for (const m of genMoves(b, side)) {
			if (m.capture >= 0 && ROYAL.has(b.ty[m.capture])) {
				return null
			}
			if (!all.has(m.key)) {
				all.set(m.key, m)
			}
			count.set(m.key, (count.get(m.key) ?? 0) + 1)
		}
	}
	const solo = new Set()
	const hops = new Map()
	const branchTargets = new Map()
	const add = (map, u, target) => {
		const list = map.get(u) ?? map.set(u, []).get(u)
		if (!list.some(([tu, tv]) => tu === target[0] && tv === target[1])) {
			list.push(target)
		}
	}
	for (const m of all.values()) {
		const e = m.extra
		if ((m.kind === 'castle' || m.kind === 'ep') && count.get(m.key) !== state.worlds.length) {
			continue
		}
		if (m.kind === 'hop') {
			add(hops, e.u, [e.tu, e.tv])
		} else if (m.kind === 'branch') {
			add(branchTargets, e.u, [e.tu, e.tv])
		} else {
			solo.add(e.u)
		}
	}
	const measures = new Map()
	for (const u of rows) {
		const ids = []
		for (let y = 0; y < x.n; y++) {
			for (let c = 0; c < x.n; c++) {
				const id = ownPieceAt(state, sqOf(u, 0, c, y))
				if (id >= 0 && !ids.includes(id) && superposed(state, id)) {
					ids.push(id)
				}
			}
		}
		measures.set(u, ids)
	}
	return { solo, hops, branches: branchTargets, measures }
}

/**
 * Whether the side to move cannot finish its turn: no sequence of its actions, each board used once, makes Submit
 * legal in some outcome (handoff/research/multiverse-final.md 6.13 and review note I3). The quick path: every
 * must-move row has a move on its own board in the cached generation (such a move disappears during the turn only
 * when a roll or measurement of another action keeps only worlds without it). Otherwise a depth-first search over
 * skeleton copies with the abstract actions: a move on its own board or a measurement uses one row, a jump uses two
 * rows that were not used yet (and becomes a branch onto the old board once its target row was used), a branch uses
 * its row and opens one (while the side may open timelines). Rows that are not must-move matter only as jump sources
 * onto must-move rows or through a branch that changes the must-move set or makes Submit legal.
 *
 * "Stuck" is always right; "not stuck" is exact apart from four rare one-sided cases (a royal capture that may be
 * Missed, a travel through the oldest stored board of a row that another action advances, a measurement that
 * settles a linked piece, and a key that only some worlds have and that a roll or measurement of another action
 * removes: then every world alone may be stuck while the union is not, and the turn is a gamble).
 *
 * @param {object} V variant
 * @param {object} state state (no result)
 * @return {boolean}
 */
export function stuck(V, state) {
	const x = state.worlds[0].b.x
	const side = state.turn
	if (x.s !== side || canSubmit(x)) {
		return false
	}
	const must = mandatory(x)
	const phys = new Set()
	for (const { b } of state.worlds) {
		for (const m of cachedGenerate(V, b, side).values()) {
			if (m.kind === 'normal' || m.kind === 'double') {
				phys.add(m.extra.u)
			}
		}
		if (must.every((u) => phys.has(u))) {
			return false
		}
	}
	const rows = []
	for (let u = 0; u < ROWS; u++) {
		if (playable(x, side, u)) {
			rows.push(u)
		}
	}
	const acts = abstractActions(state, side, rows)
	if (acts === null) {
		return false
	}
	const memo = new Map()
	const fresh = (y, u) => y.tl[u][1] === x.tl[u][1]
	const advanced = (y, ...us) => {
		const z = skeletonCopy(y)
		for (const u of us) {
			z.tl[u][1] += 1
		}
		return z
	}
	const branched = (y, u, tu, tv) => {
		const z = skeletonCopy(y)
		z.tl[newRowFor(z, side)] = [tv + 1, tv + 1, tu, tv]
		z.c[side] += 1
		z.tl[u][1] += 1
		return z
	}
	/**
	 * Whether the turn can be finished from skeleton y, with the pieces in `measured` already measured.
	 *
	 * @param {object} y skeleton copy
	 * @param {number[]} measured measured pieces, ascending
	 * @return {boolean}
	 */
	const finish = (y, measured) => {
		if (canSubmit(y)) {
			return true
		}
		const key = y.c.join() + '|' + y.tl.map((e) => (e ? e[0] + '.' + e[1] : '')).join(';') + '|' + measured.join()
		if (memo.has(key)) {
			return memo.get(key)
		}
		memo.set(key, false)
		const M = mandatory(y)
		const canBranch = y.c[side] < x.m
		const changes = (z) => canSubmit(z) || mandatory(z).join() !== M.join()
		let ok = false
		for (const u of rows) {
			if (ok || !fresh(y, u)) {
				continue
			}
			const inM = M.includes(u)
			if (inM && acts.solo.has(u)) {
				ok = finish(advanced(y, u), measured)
			}
			for (const id of inM ? acts.measures.get(u) : []) {
				if (!ok && !measured.includes(id)) {
					ok = finish(advanced(y, u), [...measured, id].sort((a, b) => a - b))
				}
			}
			for (const [tu, tv] of acts.hops.get(u) ?? []) {
				if (ok) {
					break
				}
				if (fresh(y, tu)) {
					if (inM || M.includes(tu)) {
						ok = finish(advanced(y, u, tu), measured)
					}
				} else if (canBranch) {
					const z = branched(y, u, tu, tv)
					if (inM || changes(z)) {
						ok = finish(z, measured)
					}
				}
			}
			for (const [tu, tv] of canBranch ? acts.branches.get(u) ?? [] : []) {
				if (ok) {
					break
				}
				const z = branched(y, u, tu, tv)
				if (inM || changes(z)) {
					ok = finish(z, measured)
				}
			}
		}
		memo.set(key, ok)
		return ok
	}
	return !finish(skeletonCopy(x), [])
}

/**
 * The result of a turn that cannot be finished: after an action of the side to move in this turn it stranded itself
 * and loses (`stranded`, also when the roll of that action took the way to finish away); at the start of its turn
 * it loses when one of its royal pieces can be captured for certain (`checkmate`, one key or merge of the opponent
 * takes it in every world), otherwise the game is drawn (`stalemate`).
 *
 * @param {object} V variant
 * @param {object} state state
 * @return {{winner: number|null, reason: string}}
 */
export function endResult(V, state) {
	const side = state.turn
	if (state.worlds[0].b.x.t > 0) {
		return { winner: 1 - side, reason: 'stranded' }
	}
	return royalDanger(V, state, side) >= 1
		? { winner: 1 - side, reason: 'checkmate' }
		: { winner: null, reason: 'stalemate' }
}

/**
 * The variant's `stateResult`: the game ends at once when the side to move cannot finish its turn.
 *
 * @param {object} V variant
 * @param {object} state the new state
 * @return {{winner: number|null, reason: string}|null}
 */
export function stateResult(V, state) {
	return stuck(V, state) ? endResult(V, state) : null
}

/**
 * The variant's `moveWarning`: a text when some outcome of the move ends the game because a turn cannot be finished,
 * the mover's own (it strands its turn and loses) before the opponent's when the game is then drawn; a move that
 * checkmates the opponent gets no warning. When only some outcomes of the roll end the game so (a king capture that
 * may be Missed, a roll that takes away the move that would finish the turn), the text says that it depends on the
 * roll. Null otherwise and for an illegal code.
 *
 * @param {object} V variant
 * @param {object} state state
 * @param {string} code move code
 * @return {string|null}
 */
export function moveWarning(V, state, code) {
	const list = branches(V, state, code) ?? []
	let lose = 0
	let draw = 0
	for (const br of list) {
		const next = stateAfter(V, state, code, br, list, { light: true })
		const r = next.result
		if (!r || !['stranded', 'checkmate', 'stalemate'].includes(r.reason)) {
			continue
		}
		if (next.turn === state.turn) {
			lose++
		} else if (r.winner === null) {
			draw++
		}
	}
	// every outcome ends the game so, or only some (the roll decides)
	if (lose && lose === list.length) {
		return t('quantumchess', 'After this move you cannot finish your turn: you lose')
	}
	if (lose) {
		// TRANSLATORS: a warning before a move of multiverse chess whose roll decides whether the mover loses
		return t(
			'quantumchess',
			'Depending on the roll, you may not be able to finish your turn after this move: then you lose',
		)
	}
	if (draw && draw === list.length) {
		return t('quantumchess', 'After this move your opponent cannot finish their turn: the game ends in a draw')
	}
	if (draw) {
		// TRANSLATORS: a warning before a move of multiverse chess whose roll decides whether the game is drawn
		return t(
			'quantumchess',
			'Depending on the roll, your opponent may not be able to finish their turn after this move: then the game ends in a draw',
		)
	}
	return null
}
