/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Tooltip texts for the engine's `whyIllegal` codes (ER §4.11, GAME-DESIGN §3.5.3) and resolution labels for icons
 * and copy (GAME-DESIGN §3.5.2, §3.5.5).
 */

import { t } from '@nextcloud/l10n'

/**
 * Translated text for a reason code.
 *
 * The optional context refines two codes: a pawn push that is blocked by a piece on its target square ("Pawns can't
 * capture straight ahead"), and a pawn that has nothing to capture diagonally.
 *
 * @param {string} code a ReasonCode of ER §4.11
 * @param {object} [context] optional context
 * @param {boolean} [context.pawn] the moving piece is a pawn
 * @param {boolean} [context.pawnPush] the move is a straight pawn push onto an occupied square
 * @return {string}
 */
export function reasonText(code, context = {}) {
	switch (code) {
		case 'game_over':
			return t('quantumchess', 'The game is over.')
		case 'malformed':
			return t('quantumchess', 'That is not a valid move.')
		case 'no_piece':
			return t('quantumchess', 'There is no piece on that square.')
		case 'not_your_piece':
			return t('quantumchess', 'That piece belongs to your opponent.')
		case 'piece_mismatch':
			return t('quantumchess', 'The piece letter does not match the piece on that square.')
		case 'merge_mismatch':
			return t('quantumchess', 'Both squares must hold parts of the same piece.')
		case 'cannot_split':
			return t('quantumchess', 'Kings and pawns can\'t split.')
		case 'cannot_merge':
			return t('quantumchess', 'Kings and pawns can\'t merge.')
		case 'not_superposed':
		// TRANSLATORS: "ghost" is a piece that stands on several squares at once (RULES.md glossary)
			return t('quantumchess', 'This piece is not a ghost, so there is nothing to measure.')
		case 'castle_no_right':
			return t('quantumchess', 'Castling on this side is no longer allowed.')
		case 'castle_blocked':
			return t('quantumchess', 'The squares between king and rook must be certainly empty.')
		case 'unreachable':
			return context.pawn
				? t('quantumchess', 'Pawns move straight ahead and capture diagonally.')
				: t('quantumchess', 'This piece can\'t move there.')
		case 'promotion_required':
			return t('quantumchess', 'Choose a piece to promote to.')
		case 'promotion_invalid':
			return t('quantumchess', 'Only a pawn reaching the last rank can promote.')
		case 'nothing_to_capture':
			return t('quantumchess', 'Pawns move diagonally only to capture, and there is nothing to capture there.')
		case 'blocked':
			return context.pawnPush
				? t('quantumchess', 'Pawns can\'t capture straight ahead.')
				: t('quantumchess', 'The way is blocked.')
		case 'own_piece':
			return t('quantumchess', 'Your own piece is on that square.')
		case 'split_target_occupied':
			return t('quantumchess', 'A split can only go to squares that are certainly empty.')
		case 'split_blocked':
			return t('quantumchess', 'Both paths are blocked in every possibility.')
		case 'location_cap':
			return t('quantumchess', 'A piece can stand on at most 4 squares.')
		case 'budget_full':
			return t('quantumchess', 'Budget full: merge or measure a piece first.')
		case 'merge_target_own':
			return t('quantumchess', 'Your own piece is on that square.')
		case 'merge_part_stuck':
			return t('quantumchess', 'One of the parts can\'t reach that square.')
		default:
			return t('quantumchess', 'That move is not possible.')
	}
}

/**
 * Resolution label of a legal move for icons and copy: `certain`, `quantum`, `roll` or `roll-budget`.
 *
 * @param {{resolution: string, fallback?: boolean}} legalMove a LegalMove
 * @return {'certain'|'quantum'|'roll'|'roll-budget'}
 */
export function resolutionLabel(legalMove) {
	if (legalMove.resolution === 'rolled') {
		return legalMove.fallback ? 'roll-budget' : 'roll'
	}
	return legalMove.resolution === 'quantum' ? 'quantum' : 'certain'
}

/**
 * Translated name of a resolution label.
 *
 * @param {'certain'|'quantum'|'roll'|'roll-budget'} label resolution label
 * @param {object} [options] options
 * @param {boolean} [options.physics] use the physics names (GAME-DESIGN §0.2)
 * @return {string}
 */
export function resolutionText(label, { physics = false } = {}) {
	switch (label) {
		case 'certain':
			return t('quantumchess', 'Certain')
		case 'quantum':
			return t('quantumchess', 'Quantum')
		case 'roll-budget':
			return physics
				? t('quantumchess', 'Measurement (budget full)')
			// TRANSLATORS: "Roll" is the random decision of a move (RULES.md glossary)
				: t('quantumchess', 'Roll (budget full)')
		default:
			return physics
				? t('quantumchess', 'Measurement')
			// TRANSLATORS: "Roll" is the random decision of a move (RULES.md glossary)
				: t('quantumchess', 'Roll')
	}
}

/**
 * Translated outcome word (Captured / Moved / Missed), or the square name of a Measure outcome.
 *
 * @param {string} key outcome key
 * @return {string}
 */
export function outcomeLabel(key) {
	switch (key) {
		case 'miss':
		// TRANSLATORS: result of a roll: the move did not happen (RULES.md glossary "Captured / Moved / Missed")
			return t('quantumchess', 'Missed')
		case 'move':
		// TRANSLATORS: result of a roll: the piece moved without capturing (RULES.md glossary)
			return t('quantumchess', 'Moved')
		case 'capture':
		// TRANSLATORS: result of a roll: the piece captured (RULES.md glossary)
			return t('quantumchess', 'Captured')
		default:
			return key
	}
}

/**
 * The labels object for the engine's `rollDisplay(record, labels)`, translated.
 *
 * @return {{miss: string, move: string, capture: string, rolled: string, forced: string}}
 */
export function rollLabels() {
	return {
		miss: outcomeLabel('miss'),
		move: outcomeLabel('move'),
		capture: outcomeLabel('capture'),
		// TRANSLATORS: in "Moved [0.0000, 0.5000) · rolled 0.3712 → Moved"
		rolled: t('quantumchess', 'rolled'),
		// TRANSLATORS: shown instead of a roll value when a lesson forced the result
		forced: t('quantumchess', 'forced'),
	}
}
