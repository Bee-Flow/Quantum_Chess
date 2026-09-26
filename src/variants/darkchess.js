/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Fog of war (dark chess as played on chess.com): orthodox chess in which each side sees only its own pieces and the
 * squares they could move to, with the shared quantum rules and their classic end rules (except the bare-kings draw).
 * Nobody is warned of check, castling ignores attacks, and nothing about the opponent's move is announced beyond what
 * the visible squares show.
 * A ghost sees from every square it might be on. The computer searches a view of the position built only from what a
 * human in its seat knows (`aiView`). Player-facing rules are in docs/variants.md.
 */

import { t } from '@nextcloud/l10n'
import { orthodoxSpec } from './core/orthodoxVariant.js'
import { reachable } from './core/quantum.js'
import { defineVariant } from './core/variant.js'
import { addPiece, emptyWorld, generate, linesOf, nameOf, OFF, worldKey } from './core/world.js'

/** The order in which the phantom pieces of the computer's view are placed. */
const PHANTOM_ORDER = ['k', 'q', 'r', 'b', 'n', 'p']
/** Centipawns per square a side could move to (vision is worth something when you are blind). */
const VISION = 2

const spec = Object.assign(orthodoxSpec(), {
	id: 'darkchess',
	category: 'uncertainty',
	hidden: true,
	hiddenStyle: 'fog',
	// The classic "your king cannot escape" and the waiting draws apply: a king that can be taken
	// for certain stands on a square the attacker sees. Bare kings are no draw, as on chess.com: the kings cannot see
	// each other, so a king that steps next to the enemy king unaware is taken, and either side can still win.
	bareKingsDraw: false,
	rules: () => [
		t(
			'quantumchess',
			'You see only your own pieces and the squares they could move to. Everything else is hidden in fog.',
		),
		t(
			'quantumchess',
			'An enemy piece shows up only on a square you can see, with its chance. A ghost part in the fog stays hidden.',
		),
		t(
			'quantumchess',
			'A ghost sees from every square it might be on, so splitting a piece also lets you look further.',
		),
		t(
			'quantumchess',
			'A pawn sees the square in front of it only when that square is empty: a hidden square right in front of your pawn means something is standing there.',
		),
		t('quantumchess', 'En passant shows you the passing pawn for that one turn only.'),
		t(
			'quantumchess',
			'Nobody warns you of danger: your king can be taken, or left without escape, by pieces you never saw.',
		),
		t(
			'quantumchess',
			'Two bare kings are not a draw: a king that steps next to the unseen enemy king can be taken.',
		),
		t('quantumchess', 'In pass & play each player sees only their own view: hand the device over when asked. Undo is off until the game ends, and then the whole board is revealed.'),
	],
	visibility: (state, side) => visibility(state, side),
	aiView: (state, side) => aiView(state, side),
	evaluate: (w, side) => VISION * targetCount(w, side),
	recordInfo: (prev, code, branch) => recordInfo(prev, code, branch),
	infoText: (record, viewer) => infoText(record, viewer),
})

/**
 * The squares a side can see: every square one of its pieces (or one part of a ghost) stands on, every square one of
 * them could move to, and the square of a pawn it could take en passant, in at least one world. Move targets are
 * worked out as if the side were to move now, also during the opponent's turn.
 *
 * @param {object} state state
 * @param {number} side side index
 * @return {Set<number>}
 */
export function visibility(state, side) {
	const out = reachable(spec, state, side)
	for (const { b } of state.worlds) {
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sd[id] === side && b.sq[id] >= 0) {
				out.add(b.sq[id])
			}
		}
		if (b.x.ep >= 0) {
			// the passing pawn is visible while it can be taken en passant (the move's target is the skipped square)
			for (const m of generate(spec, b, side).values()) {
				if (m.kind === 'ep') {
					out.add(b.sq[m.capture])
				}
			}
		}
	}
	return out
}

/** The stamp of each square counted by the current `targetCount` call. */
const marks = new Uint32Array(64)
let stamp = 0

/** What a line of `targetLines` may do: move to an empty square, and capture an enemy piece. */
const MOVE = 1
const CAPTURE = 2

/** The lines of `targetLines` by side, type and square, built on first use. */
const lineTable = [new Map(), new Map()]

/**
 * The lines along which a piece of `side` on `sq` could move, as `{ can, squares }`: those of `linesOf`, with the
 * descriptor's mode as the bits MOVE and CAPTURE, and for a pawn on its start rank the double step (as `pawnExtras`
 * makes it) as one more line: a ride of two squares that only moves. Kept in a table indexed by numbers, as
 * `targetCount` runs very often and the key of `linesOf`'s cache is a string.
 *
 * @param {string} ty piece type
 * @param {number} side side index
 * @param {number} sq square
 * @return {Array<{can: number, squares: number[]}>}
 */
function targetLines(ty, side, sq) {
	let bySquare = lineTable[side].get(ty)
	if (!bySquare) {
		bySquare = new Array(spec.topology.size)
		lineTable[side].set(ty, bySquare)
	}
	if (!bySquare[sq]) {
		const lines = linesOf(spec, ty, side, sq).map(({ d, squares }) => ({
			can: (d.mode === 'capture' ? 0 : MOVE) | (d.mode === 'move' ? 0 : CAPTURE),
			squares,
		}))
		if (ty === 'p' && spec.board.rankOf(sq) === (side === 0 ? 1 : 6)) {
			const fwd = spec.orient(side, [0, 1])
			const one = spec.topology.step(sq, fwd)
			const two = one < 0 ? -1 : spec.topology.step(one, fwd)
			if (two >= 0) {
				lines.push({ can: MOVE, squares: [one, two] })
			}
		}
		bySquare[sq] = lines
	}
	return bySquare[sq]
}

/**
 * The number of distinct squares a side could move to in a world: the targets of `generate`, found without building
 * the moves. The computer calls this for both sides in every world it looks at, most of which it never generates
 * moves for. The orthodox pieces only leap and ride; the pawn adds its double step (in `targetLines`) and en passant
 * (a pawn's capture line onto the en passant square). Castling adds no square: the king's target is also a target of
 * that rook.
 *
 * @param {object} b world
 * @param {number} side side index
 * @return {number}
 */
export function targetCount(b, side) {
	if (++stamp === 0xffffffff) {
		marks.fill(0)
		stamp = 1
	}
	const victim = b.x.ep >= 0 ? b.board[b.x.epVictim] : -1
	const ep = victim >= 0 && b.sd[victim] !== side && b.board[b.x.ep] === -1 ? b.x.ep : -1
	let count = 0
	for (let id = 0; id < b.sq.length; id++) {
		const from = b.sq[id]
		if (from < 0 || b.sd[id] !== side) {
			continue
		}
		const pawn = b.ty[id] === 'p'
		const lines = targetLines(b.ty[id], side, from)
		for (let i = 0; i < lines.length; i++) {
			const { can, squares } = lines[i]
			// a leap has one square, a ride stops at the first piece
			for (let k = 0; k < squares.length; k++) {
				const t = squares[k]
				const occ = b.board[t]
				const hit = occ === -1
					? (can & MOVE) !== 0 || (pawn && t === ep)
					: (can & CAPTURE) !== 0 && b.sd[occ] !== side
				if (hit && marks[t] !== stamp) {
					marks[t] = stamp
					count++
				}
				if (occ !== -1) {
					break
				}
			}
		}
	}
	return count
}

/** The start squares of each piece type of each side, in square order (the phantom slots), built once. */
let startSlots = null

/**
 * The start squares of the pieces of a side, by type, in square order.
 *
 * @param {number} side side index
 * @return {Record<string, number[]>}
 */
function slotsOf(side) {
	if (!startSlots) {
		const b = spec.setup()
		startSlots = [{}, {}]
		for (let id = 0; id < b.sq.length; id++) {
			const list = startSlots[b.sd[id]][b.ty[id]] ?? []
			list.push(b.sq[id])
			startSlots[b.sd[id]][b.ty[id]] = list
		}
		for (const bySide of startSlots) {
			for (const list of Object.values(bySide)) {
				list.sort((a, c) => a - c)
			}
		}
	}
	return startSlots[side]
}

/**
 * How far a square is from the enemy king's home, for the phantom king: the king steps (Chebyshev distance), then the
 * ranks, then the files between them. Compared as a list, so of two squares equally many king steps away the one on
 * or nearer the home rank comes first: a king that has left its square has most often stepped along its back rank
 * (or castled), and this rule treats both sides alike.
 *
 * @param {number} a square
 * @param {number} home the king's start square
 * @return {number[]}
 */
function homeDistance(a, home) {
	const ca = spec.topology.coords[a]
	const ch = spec.topology.coords[home]
	const files = Math.abs(ca[0] - ch[0])
	const ranks = Math.abs(ca[1] - ch[1])
	return [Math.max(files, ranks), ranks, files]
}

/**
 * Whether distance `a` is smaller than distance `b` (lists of `homeDistance`).
 *
 * @param {number[]} a distance
 * @param {number[]} b distance
 * @return {boolean}
 */
function nearer(a, b) {
	const i = a.findIndex((v, k) => v !== b[k])
	return i >= 0 && a[i] < b[i]
}

/**
 * The visible squares on which an enemy piece stands in some world, as `[square, type]` pairs in square order. Each
 * pair is one piece of the computer's view with the same id in every world, so the view never tells which of several
 * pieces of one type it sees. When pieces of several types might stand on the square, the board shows each type with
 * its chance but not in which possibilities it is the one (no line joins an enemy piece to anything), so the pair
 * has one type for all of them: the likeliest, ties to the first in `PHANTOM_ORDER`. Otherwise the view would pair
 * the types with the computer's own ghost parts, and a hidden roll of the enemy (a Measure) that changes that pairing
 * but nothing on the board would change the view.
 *
 * @param {object} state state
 * @param {number} enemy enemy side
 * @param {Set<number>} vis the visible squares
 * @return {Array<[number, string]>}
 */
function visibleSlots(state, enemy, vis) {
	const bySquare = new Map()
	for (const { b, w } of state.worlds) {
		for (let id = 0; id < b.sq.length; id++) {
			const sq = b.sq[id]
			if (b.sd[id] === enemy && sq >= 0 && vis.has(sq)) {
				const types = bySquare.get(sq) ?? new Map()
				types.set(b.ty[id], (types.get(b.ty[id]) ?? 0) + w)
				bySquare.set(sq, types)
			}
		}
	}
	const rank = (ty) => (PHANTOM_ORDER.includes(ty) ? PHANTOM_ORDER.indexOf(ty) : PHANTOM_ORDER.length)
	return [...bySquare.entries()]
		.sort((a, c) => a[0] - c[0])
		.map(([sq, types]) => {
			const [ty] = [...types.entries()].sort((a, c) => c[1] - a[1] || rank(a[0]) - rank(c[0]))[0]
			return [sq, ty]
		})
}

/**
 * The hidden squares that one of `me`'s pawns could capture on in every world. Such a square is empty in every world:
 * an enemy piece there would make it a move target, and an own piece would make it visible. (Pawns are solid, so they
 * stand on the same squares in every world; the intersection keeps this exact without relying on it.)
 *
 * @param {object} state state
 * @param {number} me the computer's side
 * @param {Set<number>} vis the squares `me` sees
 * @return {Set<number>}
 */
function knownEmpty(state, me, vis) {
	let out = null
	for (const { b } of state.worlds) {
		const here = new Set()
		for (let id = 0; id < b.sq.length; id++) {
			if (b.sd[id] !== me || b.ty[id] !== 'p' || b.sq[id] < 0) {
				continue
			}
			for (const { d, squares } of linesOf(spec, 'p', me, b.sq[id])) {
				if (d.mode === 'capture' && !vis.has(squares[0]) && (!out || out.has(squares[0]))) {
					here.add(squares[0])
				}
			}
		}
		out = here
	}
	return out ?? new Set()
}

/**
 * How many enemy pieces of each type are still in play as far as `me` knows: the start army minus the pieces `me` has
 * taken, by the types it saw on the capture square when it took them (`recordInfo`). A capture that might have taken
 * pieces of different types subtracts nothing. The current worlds are not read: a later hidden roll of the enemy
 * (a Measure) can drop the worlds of one type, and the view would learn from that what the player does not see.
 *
 * @param {object} state state
 * @param {number} me the computer's side
 * @return {Record<string, number>}
 */
function aliveTypes(state, me) {
	const start = slotsOf(1 - me)
	const alive = {}
	for (const ty of PHANTOM_ORDER) {
		alive[ty] = start[ty]?.length ?? 0
	}
	for (const record of state.history) {
		for (const types of record.side === me ? (record.info?.types ?? []) : []) {
			if (types.length === 1 && alive[types[0]] !== undefined) {
				alive[types[0]]--
			}
		}
	}
	return alive
}

/**
 * One world of the computer's view: its own pieces as they are, the visible enemy pieces, and phantoms for the hidden
 * enemy army on their start squares (only on hidden empty squares that its pawns do not show empty; the king always,
 * on the nearest such square by `homeDistance` if its own is not one, where it pushes out the phantom whose home that
 * is). Only its own castling rights are kept, and the en passant square
 * only while it can use it.
 *
 * @param {object} b the real world
 * @param {number} me the computer's side
 * @param {object} known what the computer knows about the whole state
 * @param {Set<number>} known.vis the squares it sees
 * @param {Array<[number, string]>} known.slots the visible enemy pieces (see `visibleSlots`)
 * @param {Set<number>} known.empty the hidden squares it knows are empty (see `knownEmpty`)
 * @param {Record<string, number>} known.alive the enemy pieces still in play, by type (see `aliveTypes`)
 * @return {object}
 */
function viewWorld(b, me, { vis, slots, empty, alive }) {
	const enemy = 1 - me
	const c = emptyWorld(spec)
	for (let id = 0; id < b.sq.length; id++) {
		if (b.sd[id] === me) {
			addPiece(c, b.ty[id], me, b.sq[id] >= 0 ? b.sq[id] : OFF)
		}
	}
	const seen = {}
	for (const [sq, ty] of slots) {
		const occ = b.board[sq]
		const here = occ >= 0 && b.sd[occ] === enemy
		addPiece(c, ty, enemy, here ? sq : OFF)
		if (here) {
			seen[ty] = (seen[ty] ?? 0) + 1
		}
	}
	const start = slotsOf(enemy)
	const free = (s) => !vis.has(s) && !empty.has(s) && c.board[s] === -1
	for (const ty of PHANTOM_ORDER) {
		const squares = start[ty] ?? []
		const want = Math.max(0, alive[ty] - (seen[ty] ?? 0))
		squares.forEach((home, i) => {
			let sq = i < want && free(home) ? home : OFF
			if (ty === 'k' && i < want && sq === OFF) {
				// the enemy king is always somewhere: the nearest free square (`homeDistance`), ties to the lowest
				// square (the real king's square is one, as it is hidden and no pawn of `me` could take on it)
				let best = null
				for (let s = 0; s < spec.topology.size; s++) {
					const d = free(s) ? homeDistance(s, home) : null
					if (d && (best === null || nearer(d, best))) {
						sq = s
						best = d
					}
				}
			}
			addPiece(c, ty, enemy, sq)
		})
	}
	const ep = [...generate(spec, b, me).values()].some((m) => m.kind === 'ep')
	c.x = {
		ep: ep ? b.x.ep : -1,
		epVictim: ep ? b.x.epVictim : -1,
		castle: (b.x.castle ?? []).filter((r) => r.side === me),
	}
	return c
}

/**
 * The state as the computer playing `me` may know it: its own pieces in every world with the worlds' weights, which
 * squares it sees are taken by an enemy piece in each world (the odds of its own moves show that), the likeliest type
 * on each (`visibleSlots`), the enemy pieces it has taken, and the public counters. Hidden enemy pieces are replaced
 * by phantoms at home, visible ones get ids that depend only on what is visible, the enemy castling rights, an
 * unusable en passant square, the history and the quiet counter (an unseen capture resets it) are left out. Two
 * states with the same own pieces and the same visible squares taken in each world give equal views. (The odds of
 * one move show how the squares on its own path hang together, not how two squares on different paths do, so the
 * view knows a little more than the board in rare positions.)
 *
 * @param {object} state the real state
 * @param {number} me the computer's side
 * @return {object}
 */
export function aiView(state, me) {
	const vis = visibility(state, me)
	const known = {
		vis,
		slots: visibleSlots(state, 1 - me, vis),
		empty: knownEmpty(state, me, vis),
		alive: aliveTypes(state, me),
	}
	const merged = new Map()
	for (const { b, w } of state.worlds) {
		const c = viewWorld(b, me, known)
		const key = worldKey(c)
		const e = merged.get(key)
		if (e) {
			e.w += w
		} else {
			merged.set(key, { key, b: c, w })
		}
	}
	const worlds = [...merged.values()]
		.sort((a, c) => (a.key < c.key ? -1 : a.key > c.key ? 1 : 0))
		.map(({ b, w }) => ({ b, w }))
	return { ...state, worlds, history: [], quiet: 0 }
}

/**
 * What a capture tells, stored on the history record as `{ taken, types }`. `taken` lists the squares where the taken
 * pieces stood: the capture square, except for en passant, which takes the pawn beside it (en passant is certain, so
 * it is en passant in every world, with the same victim). `types[i]` lists, sorted, the enemy types that might stand
 * on `taken[i]` before the move, in any world: what the capturer saw on that square (a capture square is one of its
 * move targets, so it is visible). The worlds in which the move really took a piece are not singled out: which type
 * stood there in those worlds depends on hidden squares (whether a path was clear, where an enemy ghost stood), which
 * the board does not show.
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

/**
 * The line under the opponent's move in the move list: where one of the viewer's pieces was taken.
 *
 * @param {object} record history record
 * @param {number} viewer the side whose view is shown
 * @return {string[]|null}
 */
function infoText(record, viewer) {
	if (!record.info?.taken?.length || record.side === viewer) {
		return null
	}
	const squares = record.info.taken.map((s) => nameOf(spec, s)).join(', ')
	return [t('quantumchess', 'Capture on {squares}', { squares })]
}

export default defineVariant(spec)
