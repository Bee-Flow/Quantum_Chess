/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Chess960 (Fischer Random Chess, FIDE Guidelines II with the Scharnagl numbering): orthodox chess whose back rank is
 * one of 960 shuffled start positions (bishops on opposite colours, the king between the rooks, Black mirrors White).
 * Castling ends on the ordinary squares (king c/g, rook d/f) whatever the start; the player castles by moving the
 * king onto the castling rook (as on lichess), the key stays `O-O` / `O-O-O`. As everywhere in Quantum Chess there is
 * no check, castling never rolls and a right is lost as soon as its king or rook is not 100 % home. Winning and
 * drawing are the core's classic rules (docs/rules.md 5 and 6), kept at their defaults: capture the king, "your king
 * cannot escape" (`escapeRule`), the bare-kings draw (`bareKingsDraw`, no own `worldResult`) and draws that wait while
 * the king can be taken for certain (`drawsWait`). The research spec is handoff/research/chess960.md.
 */

import { t } from '@nextcloud/l10n'
import { backRank960, isPosition, ORTHODOX_POSITION, POSITIONS } from './chess960/numbering.js'
import { castlingMoves, pawnExtras, standardSetup } from './core/orthodox.js'
import { orthodoxSpec } from './core/orthodoxVariant.js'
import { defineVariant } from './core/variant.js'

export { backRank960, isPosition, positionNumber } from './chess960/numbering.js'

/** What the computer gives a knight or bishop that has left its back rank (development). */
const DEVELOPED = 12
/** What the computer gives an own pawn in front of a king on its back rank: one rank ahead, two ranks ahead. */
const SHELTER = [10, 4]
/** What a king on its back rank near a corner (files a-c or g-h, where castling takes it) is worth. */
const TUCKED = 15
/** What a king off its back rank costs while the enemy still has a queen. */
const EXPOSED = 30

// Extended in place (never spread): the orthodox hooks refer to this very object, which defineVariant completes.
const spec = orthodoxSpec()
const topo = spec.topology

/**
 * The shelter squares of a king by `side * 64 + square`: the squares one and two ranks in front of it on its file and
 * the two files next to it, as `[oneAhead, twoAhead]` lists (empty for a king off its back rank).
 */
const SHELTER_SQUARES = []
for (const side of [0, 1]) {
	const back = side === 0 ? 0 : 7
	const dir = side === 0 ? 1 : -1
	for (let sq = 0; sq < topo.size; sq++) {
		const [f, r] = topo.coords[sq]
		const rows = [[], []]
		if (r === back) {
			for (let df = -1; df <= 1; df++) {
				for (let k = 1; k <= 2; k++) {
					const s = topo.at([f + df, r + dir * k])
					if (s >= 0) {
						rows[k - 1].push(s)
					}
				}
			}
		}
		SHELTER_SQUARES[side * topo.size + sq] = rows
	}
}

/**
 * The computer's positional terms for one side in a world: developed minor pieces, a king on its back rank near a
 * corner and its pawn shelter, and a king that left its back rank while the enemy queen is still on the board.
 *
 * @param {object} w world
 * @param {number} side side index
 * @return {number}
 */
function positional(w, side) {
	const back = side === 0 ? 0 : 7
	let score = 0
	let king = -1
	let enemyQueen = false
	for (let id = 0; id < w.sq.length; id++) {
		const s = w.sq[id]
		if (s < 0) {
			continue
		}
		const type = w.ty[id]
		if (w.sd[id] !== side) {
			enemyQueen ||= type === 'q'
		} else if (type === 'k') {
			king = s
		} else if ((type === 'n' || type === 'b') && topo.coords[s][1] !== back) {
			score += DEVELOPED
		}
	}
	if (king < 0) {
		return score
	}
	const [file, r] = topo.coords[king]
	if (r !== back) {
		return enemyQueen ? score - EXPOSED : score
	}
	if (file <= 2 || file >= 6) {
		score += TUCKED
	}
	const rows = SHELTER_SQUARES[side * topo.size + king]
	for (let k = 0; k < rows.length; k++) {
		for (const s of rows[k]) {
			const id = w.board[s]
			if (id >= 0 && w.sd[id] === side && w.ty[id] === 'p') {
				score += SHELTER[k]
			}
		}
	}
	return score
}

Object.assign(spec, {
	id: 'chess960',
	category: 'rules',

	options: [
		{
			id: 'position',
			type: 'number',
			label: () => t('quantumchess', 'Start position (0–959)'),
			min: 0,
			max: POSITIONS - 1,
			random: true,
			default: ORTHODOX_POSITION,
			// chess notation, not translated (like a FEN): "RNBQKBNR (518)"
			describe: (n) => (isPosition(n) ? backRank960(n).toUpperCase() + ' (' + n + ')' : null),
		},
	],

	/**
	 * The start world of the chosen position; without a valid number (callers that pass no options) a random one.
	 *
	 * @param {object} [options] option values (`position`)
	 * @param {() => number} [rng] random numbers in [0, 1)
	 * @return {object}
	 */
	setup(options = {}, rng = Math.random) {
		const p = options?.position
		const n = isPosition(p) ? p : Math.min(POSITIONS - 1, Math.floor(rng() * POSITIONS))
		// standardSetup mirrors the rank for Black and records the rights of the outer rooks: king to c/g, rook to d/f
		return standardSetup(spec, backRank960(n))
	},

	/**
	 * Double steps, en passant and castling; a castling move goes from the king onto its rook (`to` is the rook's
	 * square, `extra.kingTo` the king's destination), which is never an ordinary king move.
	 *
	 * @param {object} w world
	 * @param {number} side side to move
	 * @return {object[]}
	 */
	extraMoves(w, side) {
		return [
			...pawnExtras(spec, w, side, (s, sq) => spec.board.rankOf(sq) === (s === 0 ? 1 : 6)),
			...castlingMoves(spec, w, side, { toRook: true }),
		]
	},

	/**
	 * The computer's own terms: development, king safety (near a corner, behind pawns, not exposed), own minus enemy.
	 *
	 * @param {object} w world
	 * @param {number} side side index
	 * @return {number}
	 */
	evaluate(w, side) {
		return positional(w, side) - positional(w, 1 - side)
	},

	rules: () => [
		t(
			'quantumchess',
			'The back-rank pieces start in one of 960 shuffled positions: the bishops on squares of different colours, the king between the rooks. Black mirrors White, and the pawns start as usual.',
		),
		t(
			'quantumchess',
			'Each start position has a number from 0 to 959; 518 is the ordinary chess setup. Pick a number or let the game choose one.',
		),
		t(
			'quantumchess',
			'To castle, move your king onto the rook you want to castle with. Afterwards they stand as in ordinary chess: king on g and rook on f (O-O), or king on c and rook on d (O-O-O).',
		),
		t(
			'quantumchess',
			'Neither piece may have moved, and every square the king or that rook crosses or lands on must be empty, apart from the two of them.',
		),
		t(
			'quantumchess',
			'Sometimes only the king or only the rook moves, or the two swap places. Some start positions allow castling on the very first move.',
		),
		t(
			'quantumchess',
			'A ghost that might stand on one of those squares blocks castling, and a right is lost for good as soon as its king or rook is not 100 % on its starting square.',
		),
		t('quantumchess', 'Castling ignores attacks: you may castle out of, through or into attack.'),
		t(
			'quantumchess',
			'The game is a draw when only the two kings are left, unless the player to move can capture the other king.',
		),
	],
})

export default defineVariant(spec)
