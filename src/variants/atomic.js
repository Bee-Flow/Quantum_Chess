/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Atomic chess: the lichess rules with "capture the king" instead of check (as the Internet Chess Club's atomic).
 * Every capture is an explosion that removes the capturing piece, the captured piece and every piece except pawns on
 * the eight squares around the capture square. Kings never capture, no capture may blow up the mover's own king, and
 * a side whose king is blown up has lost; only the two kings left is a draw. The shared "your king cannot escape" rule
 * (docs/rules.md 5) applies: a side whose every action leaves its king to be blown up for certain has lost at once,
 * which ends a lichess stalemate such as T17 as the capture-the-king game would. The explosion is applied world by
 * world, so a ghost is destroyed only in the possibilities where it really stands in the blast. Player-facing rules
 * are in docs/variants.md; the full spec is handoff/research/atomic.md.
 */

import { t } from '@nextcloud/l10n'
import { KING_STEPS, orthodoxAfterMove } from './core/orthodox.js'
import { orthodoxSpec } from './core/orthodoxVariant.js'
import { defineVariant } from './core/variant.js'
import { hasRoyal, linesOf, OFF, placePiece } from './core/world.js'

/** Piece values in centipawns: S. Pav's atomic values fitted on lichess games (N 1.5, B 1.8, R 3.4, Q 7.8 pawns). */
const ATOMIC_VALUES = Object.freeze({ p: 100, n: 150, b: 180, r: 340, q: 780, k: 400 })

/** The computer's value of one of its own pieces next to its king that the enemy could capture (a blow-up threat). */
const THREAT_VALUE = 60

const spec = orthodoxSpec()
const topo = spec.topology

/** The blast area of every square: the square itself and its (up to eight) neighbours. */
const BLAST = topo.coords.map((c, sq) => [sq, ...KING_STEPS.map((v) => topo.step(sq, v)).filter((s) => s >= 0)])

/**
 * Whether two squares are the same or neighbours (Chebyshev distance at most 1).
 *
 * @param {number} a square
 * @param {number} b square
 * @return {boolean}
 */
function near(a, b) {
	const ca = topo.coords[a]
	const cb = topo.coords[b]
	return Math.abs(ca[0] - cb[0]) <= 1 && Math.abs(ca[1] - cb[1]) <= 1
}

/**
 * The square of a side's king in a world, or -1 when it is gone.
 *
 * @param {object} w world
 * @param {number} side side index
 * @return {number}
 */
function kingSquare(w, side) {
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sd[id] === side && w.sq[id] >= 0 && w.ty[id] === 'k') {
			return w.sq[id]
		}
	}
	return -1
}

/**
 * How many squares of a side's king area (the king and its neighbours) hold a piece of that side which the enemy
 * could capture with an ordinary move, blowing the king up; at most 2. A capture next to the enemy's own king is
 * illegal, so such squares do not count.
 *
 * @param {object} w world
 * @param {number} side side index
 * @return {number}
 */
export function kingThreats(w, side) {
	const k = kingSquare(w, side)
	const enemy = 1 - side
	const ek = kingSquare(w, enemy)
	if (k < 0 || ek < 0) {
		return 0
	}
	const targets = []
	for (const q of BLAST[k]) {
		const id = w.board[q]
		if (id >= 0 && w.sd[id] === side && !near(q, ek)) {
			targets.push(q)
		}
	}
	if (!targets.length) {
		return 0
	}
	const hit = []
	for (let id = 0; id < w.sq.length && hit.length < 2; id++) {
		if (w.sd[id] !== enemy || w.sq[id] < 0) {
			continue
		}
		for (const line of linesOf(spec, w.ty[id], enemy, w.sq[id])) {
			if (line.d.mode === 'move') {
				continue
			}
			// the first occupied square of a line is the only one a leap or a slide can capture on
			const target = line.kind === 'leap'
				? (line.via.every((s) => w.board[s] === -1) ? line.squares[0] : -1)
				: (line.squares.find((s) => w.board[s] !== -1) ?? -1)
			if (target >= 0 && targets.includes(target) && !hit.includes(target)) {
				hit.push(target)
			}
		}
	}
	return Math.min(hit.length, 2)
}

// kings never capture: a king's capture would always blow up the king itself
spec.types.k.moves = [{ leap: KING_STEPS, mode: 'move' }]
for (const [type, value] of Object.entries(ATOMIC_VALUES)) {
	spec.types[type].value = value
}

Object.assign(spec, {
	id: 'atomic',
	category: 'rules',
	// The classic end rules (docs/rules.md 5 and 6, handoff/LEAD-DECISIONS.md L1). "Your king cannot escape" is stated
	// on purpose rather than taken from the core's default: its test counts a blow-up next to the king as a capture of
	// it (T1, T17), and a side without any legal move still draws (T27). The bare-kings draw is atomic's own
	// `worldResult`, decided possibility by possibility, so that a ghost blown up in only some of them is settled by
	// the game-end roll (T14); the core's copy, which needs bare kings in every possibility, is off so that the rule is
	// not applied twice. The generic draws still wait while the side to move can blow up the enemy king for certain.
	escapeRule: true,
	bareKingsDraw: false,
	rules: () => [
		t(
			'quantumchess',
			'Every capture is an explosion. The capturing piece, the captured piece and every piece except pawns on the eight squares around the capture square are removed, whoever they belong to.',
		),
		t('quantumchess', 'Pawns survive explosions, unless they capture or are captured themselves.'),
		t('quantumchess', 'Blow up the enemy king to win: capture it, or capture any piece or pawn next to it.'),
		t(
			'quantumchess',
			'Kings never capture, and you may never capture on a square next to your own king. A king move or a move onto a square next to your own king is rolled if an enemy piece might stand there: it misses if the piece is really there.',
		),
		t(
			'quantumchess',
			'Kings may stand next to each other. While they touch, neither king can be captured directly.',
		),
		t('quantumchess', 'En passant explodes around the square the capturing pawn moves to.'),
		t(
			'quantumchess',
			'A ghost caught in an explosion is destroyed only in the possibilities where it really stood there. It survives with the chance of its other parts, and no dice are rolled for it.',
		),
		t('quantumchess', 'The game is a draw when only the two kings are left.'),
	],
	/**
	 * The squares an explosion on `sq` reaches: the square itself and its neighbours.
	 *
	 * @param {number} sq capture square
	 * @return {number[]}
	 */
	blastArea(sq) {
		return BLAST[sq]
	},
	/**
	 * No capture on a square next to (or on) the mover's own king: it would blow the king up. This also covers en
	 * passant (its capture square is the square the pawn lands on) and the parts of a merge.
	 *
	 * @param {object} w world
	 * @param {number} side side to move
	 * @param {object[]} list generated moves
	 * @return {object[]}
	 */
	filterMoves(w, side, list) {
		const k = kingSquare(w, side)
		return k < 0 ? list : list.filter((m) => m.capture < 0 || !near(m.to, k))
	},
	/**
	 * The orthodox bookkeeping, then the explosion: the capturer and every non-pawn piece around the capture square
	 * leave the board (the captured piece is already gone), and the castling rights of an exploded king or rook end.
	 *
	 * @param {object} next the new world (mutable)
	 * @param {object} m the move
	 */
	afterMove(next, m) {
		orthodoxAfterMove(spec, next, m)
		if (m.capture < 0) {
			return
		}
		const area = BLAST[m.to]
		for (const s of area) {
			const id = next.board[s]
			if (id >= 0 && (s === m.to || next.ty[id] !== 'p')) {
				placePiece(next, id, OFF)
			}
		}
		if (next.x.castle?.length) {
			next.x.castle = next.x.castle.filter((c) => !area.includes(c.rook) && !area.includes(c.king))
		}
	},
	/**
	 * A side whose king is gone has lost; only the two kings left is a draw (kings never capture, so nothing can
	 * happen any more). Both are decided in each possibility; the game-end roll settles possibilities that differ.
	 *
	 * @param {object} w world
	 * @return {null|{winner: number|null, reason: string}}
	 */
	worldResult(w) {
		const white = hasRoyal(spec, w, 0)
		const black = hasRoyal(spec, w, 1)
		if (!white || !black) {
			// both kings at once cannot happen (no capture may blow up the mover's own king); kept for safety
			return { winner: white === black ? null : white ? 0 : 1, reason: 'exploded' }
		}
		for (let id = 0; id < w.sq.length; id++) {
			if (w.sq[id] >= 0 && w.ty[id] !== 'k') {
				return null
			}
		}
		return { winner: null, reason: 'bareKings' }
	},
	/**
	 * The text of atomic's own result reason.
	 *
	 * @param {string} reason reason code
	 * @return {string|null}
	 */
	reasonText(reason) {
		return reason === 'exploded' ? t('quantumchess', 'a king was blown up') : null
	},
	/**
	 * The board with the last explosion marked: the cells of its blast area shaded (`hill`, `hilldark`) and outlined.
	 * Without a capture in the last move, the plain board.
	 *
	 * @param {object} state state
	 * @return {object} a topology
	 */
	layoutOf(state) {
		const caps = state.history?.at(-1)?.captures ?? []
		if (!caps.length) {
			return topo
		}
		const hot = new Set(caps.flatMap((c) => BLAST[c] ?? []))
		const cells = topo.cells.map((c) => (hot.has(c.sq)
			? { ...c, shade: c.shade === 'dark' ? 'hilldark' : 'hill' }
			: c))
		const outlines = []
		for (const c of caps) {
			const area = (BLAST[c] ?? []).map((s) => topo.cells[s])
			if (!area.length) {
				continue
			}
			const x1 = Math.min(...area.map((a) => a.x))
			const x2 = Math.max(...area.map((a) => a.x + a.w))
			const y1 = Math.min(...area.map((a) => a.y))
			const y2 = Math.max(...area.map((a) => a.y + a.h))
			outlines.push(
				{ x1, y1, x2, y2: y1 },
				{ x1: x2, y1, x2, y2 },
				{ x1: x2, y1: y2, x2: x1, y2 },
				{ x1, y1: y2, x2: x1, y2: y1 },
			)
		}
		return { ...topo, cells, layout: { ...topo.layout, outlines: [...(topo.layout.outlines ?? []), ...outlines] } }
	},
	/**
	 * King safety for the computer: a piece next to one's own king that the enemy can capture is a threat to blow the
	 * king up.
	 *
	 * @param {object} w world
	 * @param {number} side side index
	 * @return {number} centipawns for `side`
	 */
	evaluate(w, side) {
		return THREAT_VALUE * (kingThreats(w, 1 - side) - kingThreats(w, side))
	},
})

export default defineVariant(spec)
