/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Horde (lichess rules): White has 36 pawns and no king, Black has the ordinary army. White moves first. White pawns
 * on the first or the second rank may double-step (a double step from the first rank cannot be taken en passant), and
 * only Black castles. White wins by capturing the Black king, or when the Black king cannot escape (the core's escape
 * rule, which also ends a classical stalemate of Black as a White win); Black wins by capturing every White piece,
 * promoted pieces included. A side to move without a move is stalemated, which is a draw; this is checked in every
 * possibility, so a ghost that might block the horde's last pawn is settled by the game-end roll. The 50-move draw
 * waits only while White can capture the Black king for certain, not while Black can capture the last White piece for
 * certain (handoff/LEAD-DECISIONS.md L1 waits for a certain king capture). The research spec is
 * handoff/research/horde.md.
 */

import { t } from '@nextcloud/l10n'
import { castlingMoves, castlingRights, orthodoxAfterMove, pawnExtras } from './core/orthodox.js'
import { orthodoxSpec } from './core/orthodoxVariant.js'
import { defineVariant } from './core/variant.js'
import { addPiece, emptyWorld, generate } from './core/world.js'

// Extended in place (never spread): the inherited hooks (`applyMiss` ends the en passant right in idle worlds,
// `unifyWorlds` makes the castling rights follow the whole state) refer to this very object, which defineVariant
// completes.
const spec = orthodoxSpec()
const topo = spec.topology
const rankOf = spec.board.rankOf

/** The White pawns beyond the first four ranks in the start position. */
const FORWARD_PAWNS = ['b5', 'c5', 'f5', 'g5']

/** The computer's bonus for a White pawn by rank index (rank 5: 10, rank 6: 25, rank 7: 60), in centipawns. */
const ADVANCE = [0, 0, 0, 0, 10, 25, 60, 0]

/**
 * The number of pieces of a side on the board.
 *
 * @param {object} w world
 * @param {number} side side index
 * @return {number}
 */
function piecesOf(w, side) {
	let n = 0
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sd[id] === side && w.sq[id] >= 0) {
			n++
		}
	}
	return n
}

/**
 * Whether Black still has its king on the board.
 *
 * @param {object} w world
 * @return {boolean}
 */
function blackKing(w) {
	for (let id = 0; id < w.sq.length; id++) {
		if (w.sd[id] === 1 && w.ty[id] === 'k' && w.sq[id] >= 0) {
			return true
		}
	}
	return false
}

/**
 * The start position: White's 36 pawns on ranks 1 to 4 and b5, c5, f5, g5; Black's ordinary army. Only Black has
 * castling rights, since White has no king.
 *
 * @return {object}
 */
function hordeSetup() {
	const w = emptyWorld(spec)
	for (let r = 0; r < 4; r++) {
		for (let f = 0; f < 8; f++) {
			addPiece(w, 'p', 0, topo.at([f, r]))
		}
	}
	for (const name of FORWARD_PAWNS) {
		addPiece(w, 'p', 0, topo.byName(name))
	}
	const back = 'rnbqkbnr'
	for (let f = 0; f < 8; f++) {
		addPiece(w, back[f], 1, topo.at([f, 7]))
	}
	for (let f = 0; f < 8; f++) {
		addPiece(w, 'p', 1, topo.at([f, 6]))
	}
	w.x = { ep: -1, epVictim: -1, castle: [] }
	w.x.castle = castlingRights(spec, w)
	return w
}

Object.assign(spec, {
	id: 'horde',
	category: 'rules',
	// The classic end rules (docs/rules.md 5 and 6, handoff/LEAD-DECISIONS.md L1) keep the core's defaults for Black's
	// king: a Black king that cannot escape loses (White, without a royal piece, never loses this way), and the 50-move
	// draw waits while White can capture the Black king for certain. The bare-kings draw is off: White has no king, and
	// a horde without pieces has already lost (worldResult reports 'horde' first).
	bareKingsDraw: false,
	setup: hordeSetup,
	rules: () => [
		t('quantumchess', 'White has 36 pawns and no king. Black has the ordinary army and moves second.'),
		t(
			'quantumchess',
			'White has no king to lose. It wins as usual against the Black king: by capturing it, or when it cannot escape.',
		),
		t('quantumchess', 'Black wins by capturing every White piece, including pieces White got by promotion.'),
		t(
			'quantumchess',
			'White pawns on the first or the second rank may move two squares if both squares are free, even if they have moved before. A pawn that moves two squares from the first rank cannot be captured en passant.',
		),
		t('quantumchess', 'Only Black can castle. Pawns promote as usual.'),
		t('quantumchess', 'Pawns are always solid, so White can only split pieces it gets by promotion.'),
		t(
			'quantumchess',
			'Stalemate is a draw: if the player to move cannot move any piece, the game is drawn. If that is so in only some possibilities, a roll decides at once.',
		),
	],
	/**
	 * Double steps (White from rank 1 or 2, Black from rank 7), en passant and Black's castling.
	 *
	 * @param {object} w world
	 * @param {number} side side index
	 * @return {object[]}
	 */
	extraMoves(w, side) {
		return [
			...pawnExtras(spec, w, side, (s, sq) => (s === 0 ? rankOf(sq) <= 1 : rankOf(sq) === 6)),
			...castlingMoves(spec, w, side),
		]
	},
	/**
	 * The orthodox bookkeeping, except that a double step from the first rank leaves no en passant square.
	 *
	 * @param {object} next the new world (mutable)
	 * @param {object} m the move
	 */
	afterMove(next, m) {
		orthodoxAfterMove(spec, next, m)
		if (m.kind === 'double' && rankOf(m.from) === 0) {
			next.x.ep = -1
			next.x.epVictim = -1
		}
	},
	/**
	 * The result in one possibility after `mover` moved: the Black king captured, the horde destroyed, or the side
	 * to move next without a move (stalemate). The order matters: a destroyed horde has no move either.
	 *
	 * @param {object} w world
	 * @param {number} mover the side that just moved
	 * @return {null|{winner: number|null, reason: string}}
	 */
	worldResult(w, mover) {
		if (!blackKing(w)) {
			return { winner: 0, reason: 'king' }
		}
		if (piecesOf(w, 0) === 0) {
			return { winner: 1, reason: 'horde' }
		}
		if (generate(spec, w, 1 - mover).size === 0) {
			return { winner: null, reason: 'stalemate' }
		}
		return null
	},
	// only a safety net: worldResult ends the game first when the side to move has no move
	noMoves() {
		return { winner: null, reason: 'stalemate' }
	},
	reasonText(reason) {
		switch (reason) {
			case 'horde':
				return t('quantumchess', 'the horde was destroyed')
			case 'stalemate':
				return t('quantumchess', 'stalemate')
			default:
				return null
		}
	},
	// every possibility holds the same number of White pieces (a capture is rolled unless all agree), so one count
	sideInfo(state, side) {
		if (side !== 0) {
			return null
		}
		const count = piecesOf(state.worlds[0].b, 0)
		return {
			text: t('quantumchess', 'Horde: {count}', { count }),
			title: t('quantumchess', 'White pieces left. Black wins by capturing all of them.'),
		}
	},
	/**
	 * The computer's term besides material: the advance of the White pawns towards promotion (good for White, bad
	 * for Black).
	 *
	 * @param {object} w world
	 * @param {number} side side index
	 * @return {number}
	 */
	evaluate(w, side) {
		let sum = 0
		for (let id = 0; id < w.sq.length; id++) {
			if (w.sd[id] === 0 && w.ty[id] === 'p' && w.sq[id] >= 0) {
				sum += ADVANCE[rankOf(w.sq[id])]
			}
		}
		return side === 0 ? sum : -sum
	},
})

export default defineVariant(spec)
