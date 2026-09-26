/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Antichess (lichess rules, also called Losing chess): capturing is compulsory, the king is an ordinary piece that can
 * be captured (no check, no castling, pawns may promote to a king), and a side wins when it has lost all its pieces or
 * has no move. The game is drawn when no capture can ever happen again (bishops on opposite colours, locked pawns).
 * Compulsory capture works on two levels: in every possibility on its own (`filterMoves`), and over the whole state
 * (`compulsoryCapture`: if a move might capture in some possibility, only such capture tries are legal).
 * Player-facing rules are in docs/variants.md.
 */

import { t } from '@nextcloud/l10n'
import { pawnExtras, standardSetup } from './core/orthodox.js'
import { orthodoxSpec } from './core/orthodoxVariant.js'
import { defineVariant } from './core/variant.js'
import { generate } from './core/world.js'

// Extended in place (never spread): the inherited hooks (`afterMove`, `applyMiss`, `unifyWorlds`) refer to this very
// object, which defineVariant completes.
const spec = orthodoxSpec({ royalKing: false, promoteTo: ['q', 'r', 'b', 'n', 'k'] })
const topo = spec.topology

// Every piece counts the same (lichess counts pieces, not their strength); the computer wants to lose them.
for (const type of Object.values(spec.types)) {
	type.value = 100
}
// Only captures and pawn moves reset the 50-move counter: the solid, non-royal king would reset it by default.
spec.types.k.resetsQuiet = false

/** Whether a square is light, by square index (a1 is dark). */
const LIGHT = topo.coords.map(([f, r]) => (f + r) % 2 === 1)

/** What it costs a side to have a capture in a world, since it will have to take (the computer, in centipawns). */
const MUST_CAPTURE = 40
/** Value of one legal move more than the opponent (the computer's mobility term, in centipawns). */
const MOBILITY = 2

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
 * Whether a move list holds a capture.
 *
 * @param {Map<string, object>} moves moves by key
 * @return {boolean}
 */
function hasCapture(moves) {
	for (const m of moves.values()) {
		if (m.capture >= 0) {
			return true
		}
	}
	return false
}

/**
 * The lichess draw "no capture can ever happen again" (scalachess `Antichess.isInsufficientMaterial`): only bishops
 * and pawns are left; each side's bishops stand on one square colour and the two colours differ; every pawn stands on
 * its own bishops' colour and is blocked by a pawn directly in front of it; and the side to move has no capture (the
 * only one still possible is en passant, right after a double step).
 *
 * @param {object} w world
 * @param {number} next the side to move
 * @return {boolean}
 */
function noCaptureEver(w, next) {
	const colour = [null, null]
	let pawns = false
	for (let id = 0; id < w.sq.length; id++) {
		const s = w.sq[id]
		if (s < 0) {
			continue
		}
		const type = w.ty[id]
		if (type === 'p') {
			pawns = true
		} else if (type !== 'b') {
			return false
		} else if (colour[w.sd[id]] === null) {
			colour[w.sd[id]] = LIGHT[s]
		} else if (colour[w.sd[id]] !== LIGHT[s]) {
			return false
		}
	}
	if (colour[0] === null || colour[1] === null || colour[0] === colour[1]) {
		return false
	}
	if (pawns) {
		for (let id = 0; id < w.sq.length; id++) {
			const s = w.sq[id]
			if (s < 0 || w.ty[id] !== 'p') {
				continue
			}
			const side = w.sd[id]
			if (LIGHT[s] !== colour[side]) {
				return false
			}
			const front = topo.step(s, spec.orient(side, [0, 1]))
			if (front < 0 || w.board[front] < 0 || w.ty[w.board[front]] !== 'p') {
				return false
			}
		}
	}
	return !hasCapture(generate(spec, w, next))
}

Object.assign(spec, {
	id: 'antichess',
	category: 'rules',
	setup() {
		return standardSetup(spec, 'rnbqkbnr', { castling: false })
	},
	rules: () => [
		t(
			'quantumchess',
			'Lose all your pieces to win. You also win if it is your turn and none of your pieces can move.',
		),
		t(
			'quantumchess',
			'Capturing is compulsory: if any of your moves might capture, in any possibility, you must play one of them. You choose which one.',
		),
		t(
			'quantumchess',
			'While you must capture, you cannot split or measure, and you may merge only if the merge might capture.',
		),
		t(
			'quantumchess',
			'Where a capture attempt finds nothing to take, it counts as an ordinary move if you had no other capture in that possibility, and it misses if you had one. A pawn\'s diagonal capture attempt always misses there.',
		),
		t(
			'quantumchess',
			'The king is an ordinary piece: there is no check, kings can be captured, and losing yours does not end the game. Kings are still always solid.',
		),
		t('quantumchess', 'There is no castling. A pawn may also promote to a king.'),
		t(
			'quantumchess',
			'The game is a draw when no capture can ever happen again: only bishops and pawns are left, the two sides\' bishops stand on different square colours, and every pawn is blocked by a pawn and stands on its own bishops\' colour.',
		),
		t(
			'quantumchess',
			'If whether you can move depends on where a ghost really is (yours or your opponent\'s), a roll decides whether you have no move and win.',
		),
	],
	// double steps and en passant; no castling
	extraMoves(w, side) {
		return pawnExtras(spec, w, side, (s, sq) => spec.board.rankOf(sq) === (s === 0 ? 1 : 6))
	},
	// the classical rule in every possibility: where a capture exists, only captures
	filterMoves(w, side, list) {
		return list.some((m) => m.capture >= 0) ? list.filter((m) => m.capture >= 0) : list
	},
	// over the whole state: if some move might capture in some possibility, only such moves are legal
	compulsoryCapture: true,
	// The classic end rules (docs/rules.md 5 and 6) are wrong in losing chess, where
	// the king is an ordinary piece: no "your king cannot escape" win, two lone kings are not a draw, and no draw
	// waits for a king capture. The core's defaults are already off here (no royal piece, compulsory capture); they
	// are stated on purpose, so a change of those defaults cannot switch them on.
	escapeRule: false,
	bareKingsDraw: false,
	drawsWait: false,
	// the wins before the draw, as lichess checks them: a side to move without a move wins even where no capture can
	// ever happen again (and the core checks this before its 50-move draw)
	worldResult(w, mover) {
		const next = 1 - mover
		if (piecesOf(w, next) === 0) {
			return { winner: next, reason: 'allLost' }
		}
		if (piecesOf(w, mover) === 0) {
			return { winner: mover, reason: 'allLost' }
		}
		if (generate(spec, w, next).size === 0) {
			return { winner: next, reason: 'stalemate' }
		}
		return noCaptureEver(w, next) ? { winner: null, reason: 'bishops' } : null
	},
	// only a safety net: worldResult ends the game first when the side to move has no move
	noMoves(state) {
		return { winner: state.turn, reason: 'stalemate' }
	},
	reasonText(reason) {
		switch (reason) {
			case 'allLost':
				// TRANSLATORS: Antichess, why the game was won: the winner has lost all its pieces
				return t('quantumchess', 'the winner has no pieces left')
			case 'stalemate':
				// TRANSLATORS: Antichess, why the game was won: the winner was to move and could not move (stalemate)
				return t('quantumchess', 'the winner has no move left')
			case 'bishops':
				// TRANSLATORS: Antichess, why the game was drawn: the pieces left can never capture anything again
				return t('quantumchess', 'no capture can ever happen again')
			default:
				return null
		}
	},
	// every possibility holds the same pieces (only their squares differ), so the first world gives the count
	sideInfo(state, side) {
		const count = piecesOf(state.worlds[0].b, side)
		return {
			text: t('quantumchess', 'Pieces: {count}', { count }),
			title: t('quantumchess', 'Pieces on the board: lose them all to win'),
		}
	},
	materialSign: -1,
	/**
	 * The computer's terms besides the reversed material: a side that can capture in this world must capture (bad
	 * for it, good for the side that offered the piece), and a little mobility.
	 *
	 * @param {object} w world
	 * @param {number} side side index
	 * @return {number}
	 */
	evaluate(w, side) {
		const mine = generate(spec, w, side)
		const theirs = generate(spec, w, 1 - side)
		let score = MOBILITY * (mine.size - theirs.size)
		if (hasCapture(mine)) {
			score -= MUST_CAPTURE
		}
		if (hasCapture(theirs)) {
			score += MUST_CAPTURE
		}
		return score
	},
})

export default defineVariant(spec)
