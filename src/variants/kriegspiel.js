/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Kriegspiel: orthodox quantum chess in which each player sees only their own pieces. An umpire (the rules of ICC
 * wild 16, adapted to capturing the king) refuses attempts that are impossible in every possibility, and after every
 * move tells both players the captures (square, pawn or piece), check with its directions and chance, and the pawn
 * tries of the side to move. The hooks live in kriegspiel/umpire.js (views, candidates, announcements) and
 * kriegspiel/computer.js (the computer's view). Player-facing rules are in docs/variants.md.
 */

import { t } from '@nextcloud/l10n'
import { orthodoxSpec } from './core/orthodoxVariant.js'
import { defineVariant } from './core/variant.js'
import { aiView, evaluate } from './kriegspiel/computer.js'
import { announce, candidateMoves, ownView, umpireLines, visibility } from './kriegspiel/umpire.js'

const spec = Object.assign(orthodoxSpec(), {
	id: 'kriegspiel',
	category: 'uncertainty',
	hidden: true,
	// a normal-looking board that holds only the viewer's pieces (no fog shading)
	hiddenStyle: 'plain',
	// attempts are binding: no odds preview, and results are shown without odds
	umpire: true,
	// The classic end rules (escapeRule, bareKingsDraw, drawsWait) stay on, as in every two-sided variant: the core
	// decides them on the real board, like the classical umpire who announces checkmate, and the whole board is
	// shown when the game ends.
	rules: () => [
		t('quantumchess', 'You see only your own pieces. The umpire sees the whole board.'),
		t(
			'quantumchess',
			'Try any move. The umpire says no if it is impossible in every possibility, or if castling or a split needs a square where a hidden piece might be: then try again. Your turn is not used and your opponent is not told.',
		),
		t(
			'quantumchess',
			'Any other move is played at once, rolled if needed, and you see only its result. A missed move still uses your turn.',
		),
		t(
			'quantumchess',
			'After every move both players hear each capture (its square, and whether a pawn or a piece was taken) and any check, with its directions and the chance that one enemy move, a merge included, could capture the king.',
		),
		t(
			'quantumchess',
			'Before each turn both players hear the number of pawn tries: the pawn captures the player to move might be able to make, en passant included.',
		),
		t(
			'quantumchess',
			'The umpire never refuses a move because of check: moving into check and castling out of, through or into check are allowed. The umpire also ends the game when a king cannot escape or a draw comes, even if you could not see it coming. Promotions, castling and en passant as such are never announced: an en passant capture is heard like any other capture of a pawn.',
		),
		t(
			'quantumchess',
			'If one of your ghosts suddenly becomes solid, an enemy move tried to land on or pass through one of its squares, or settled a piece it was linked to.',
		),
		t(
			'quantumchess',
			'In pass & play, hand the device over when asked. The whole board is shown when the game ends.',
		),
	],
	visibility: (state, side) => visibility(state, side),
	ownView: (state, side) => ownView(state, side),
	candidateMoves: (state) => candidateMoves(spec, state),
	// `end` marks the move that ended the game, after which the umpire names no pawn tries
	recordInfo: (prev, code, branch, next) => ({
		announce: announce(spec, prev, code, branch, next),
		...(next.result ? { end: true } : {}),
	}),
	infoText: (record, viewer, opts) => umpireLines(spec, record, opts),
	aiView: (state, side) => aiView(spec, state, side),
	evaluate: (w, side) => evaluate(spec, w, side),
})

export default defineVariant(spec)
