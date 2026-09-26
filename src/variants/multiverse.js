/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Multiverse chess (5D): 5D Chess With Multiverse Time Travel with ghosts. Every row is a timeline and time runs to
 * the right; pieces move along files, ranks, back in time and across timelines, a move onto an older board opens a
 * new timeline, and a turn is a move on every must-move board. The quantum rules follow three principles: boards are
 * certain, pieces are quantum; timelines are AND, possibilities are OR; a move always makes its boards, the dice only
 * decide what happens to the piece. The research spec is handoff/research/multiverse-final.md; the modules in
 * multiverse/ hold the geometry and skeleton, the pieces, the setups, the moves, the rules, the records and texts,
 * the drawing and the computer's hooks.
 */

import { t } from '@nextcloud/l10n'
import { defineVariant } from './core/variant.js'
import { computerHooks, viewFilter } from './multiverse/ai.js'
import {
	allowQuantum,
	apply,
	applyMiss,
	endResult,
	moveWarning,
	solidExtra,
	stateResult,
	unifyWorlds,
	worldResult,
} from './multiverse/engine.js'
import { layoutOf, legendOf, threats } from './multiverse/layout.js'
import { generate, SUBMIT } from './multiverse/moves.js'
import { TYPES } from './multiverse/pieces.js'
import { setup, SETUP_ORDER, SETUPS } from './multiverse/setup.js'
import { topology } from './multiverse/skeleton.js'
import {
	codeText,
	dangerText,
	endNote,
	infoText,
	lastMoveMarks,
	outcomeSquare,
	reasonText,
	recordInfo,
	refusalText,
	sideInfo,
	submitLabel,
	turnHint,
	turnMarks,
} from './multiverse/texts.js'

/** The plain-language labels of the setups. */
const SETUP_LABELS = {
	small: () => t('quantumchess', 'Small: quick, best on phones'),
	verysmallopen: () => t('quantumchess', 'Very small and open: the easiest start for learning'),
	standard: () => t('quantumchess', 'Standard: the full game, long, best on a laptop'),
	smallcentered: () => t('quantumchess', 'Small with the king in the centre'),
	verysmall: () => t('quantumchess', 'Very small'),
	noqueens: () => t('quantumchess', 'Simple, no queens'),
	turnzero: () => t('quantumchess', 'Standard with turn zero: Black can travel back to turn 0'),
	twotimelines: () => t('quantumchess', 'Standard on two timelines, −0 and +0'),
	princess: () => t('quantumchess', 'Standard with princesses'),
	reversed: () => t('quantumchess', 'Reversed royalty: the queen is royal, the king is not'),
	defended: () => t('quantumchess', 'Defended pawn: queen and knight swapped'),
	halfreflected: () => t('quantumchess', 'Half reflected: Black\'s king and queen swapped'),
	justknights: () => t('quantumchess', 'Kings and knights'),
	justunicorns: () => t('quantumchess', 'Kings and unicorns'),
	justdragons: () => t('quantumchess', 'Kings and dragons'),
	justbrawns: () => t('quantumchess', 'Kings and brawns'),
	kingofkings: () => t('quantumchess', 'King of kings: a king and four common kings'),
	royalqueens: () => t('quantumchess', 'Royal queen showdown'),
	excessive: () => t('quantumchess', 'Excessive: three kings each, with unicorns and dragons'),
	marauders: () => t('quantumchess', 'Timeline marauders: three timelines'),
	invasion: () => t('quantumchess', 'Timeline invasion: two timelines'),
}

/** The official names of the setups in 5D chess (names of the original game, not translated). */
const OFFICIAL = {
	small: 'Small',
	verysmallopen: 'Very Small – Open',
	standard: 'Standard',
	smallcentered: 'Small – Centered',
	verysmall: 'Very Small',
	noqueens: 'Simple – No Queens',
	turnzero: 'Standard – Turn Zero',
	twotimelines: 'Standard – Two Timelines',
	princess: 'Standard – Princess',
	reversed: 'Standard – Reversed Royalty',
	defended: 'Standard – Defended Pawn',
	halfreflected: 'Standard – Half Reflected',
	justknights: 'Focused – Just Knights',
	justunicorns: 'Focused – Just Unicorns',
	justdragons: 'Focused – Just Dragons',
	justbrawns: 'Focused – Just Brawns',
	kingofkings: 'Misc – King of Kings',
	royalqueens: 'Misc – Royal Queen Showdown',
	excessive: 'Misc – Excessive',
	marauders: 'Misc – Timeline Marauders',
	invasion: 'Misc – Timeline Invasion',
}

/**
 * The brawn's captures, for the setups that have brawns.
 *
 * @return {string}
 */
function brawnNote() {
	return t(
		'quantumchess',
		'Brawns (W) are pawns that also capture sideways or one rank forward together with one timeline forward, or one rank forward and one turn back.',
	)
}

/** A sentence on the unusual pieces of a setup. */
const PIECE_NOTES = {
	princess: () => t('quantumchess', 'The princess (S) moves like a rook or a bishop.'),
	reversed: () => t(
		'quantumchess',
		'The royal queen (Y) moves like a queen and is royal; the common king (C) moves like a king but is not royal.',
	),
	defended: () => t('quantumchess', 'The queen and a knight swap places.'),
	halfreflected: () => t('quantumchess', 'Black\'s king and queen swap places.'),
	justunicorns: () => t('quantumchess', 'Unicorns (U) move along three axes at once.'),
	justdragons: () => t('quantumchess', 'Dragons (D) move along all four axes at once.'),
	justbrawns: brawnNote,
	kingofkings: () => t('quantumchess', 'Common kings (C) move like kings but are not royal.'),
	royalqueens: () => t('quantumchess', 'A royal queen (Y) moves like a queen and is royal like a king.'),
	excessive: () => t(
		'quantumchess',
		'Unicorns (U) move along three axes at once, dragons (D) along all four. Losing any one king loses.',
	),
	marauders: brawnNote,
}

/**
 * How a setup is shown under the option and in the game's info: its plain label, its official name and size, and a
 * sentence on its unusual pieces.
 *
 * @param {string} id setup id
 * @return {string|null}
 */
function describeSetup(id) {
	const S = SETUPS[id]
	if (!S) {
		return null
	}
	// TRANSLATORS: a 5D start position: label, official English name, board size: "Very small (Very Small, 4 × 4)"
	const main = t('quantumchess', '{label} ({name}, {size} × {size})', {
		label: SETUP_LABELS[id](),
		name: OFFICIAL[id],
		size: S.n,
	})
	return PIECE_NOTES[id] ? main + ' ' + PIECE_NOTES[id]() : main
}

const spec = {
	id: 'multiverse',
	category: 'dimensions',
	// time runs to the right for both players: Black's view is chosen with the `view` option, never by turning
	sides: [
		{ id: 'w', name: () => t('quantumchess', 'White'), color: 'white', rotate: 0 },
		{ id: 'b', name: () => t('quantumchess', 'Black'), color: 'black', rotate: 0 },
	],
	topology,
	types: TYPES,
	options: [
		{
			id: 'setup',
			type: 'choice',
			label: () => t('quantumchess', 'Start position'),
			default: 'small',
			values: SETUP_ORDER.map((id) => ({ id, label: SETUP_LABELS[id] })),
			describe: describeSetup,
		},
		{
			id: 'timelines',
			type: 'choice',
			label: () => t('quantumchess', 'Maximum new timelines per player'),
			default: '3',
			values: [
				{ id: '1', label: () => t('quantumchess', 'One') },
				{ id: '2', label: () => t('quantumchess', 'Two') },
				{ id: '3', label: () => t('quantumchess', 'Three') },
			],
		},
		{
			id: 'reach',
			type: 'choice',
			label: () => t('quantumchess', 'How far back pieces can travel'),
			default: 'auto',
			values: [
				{
					id: 'auto',
					label: () => t('quantumchess', 'Automatic (2 turns on boards up to 5 × 5, 4 on larger ones)'),
				},
				{ id: '2', label: () => t('quantumchess', '2 turns (lighter on the device)') },
				{ id: '4', label: () => t('quantumchess', '4 turns (enough for most games)') },
			],
		},
		{
			id: 'view',
			type: 'choice',
			// TRANSLATORS: 5D chess option: whose timelines are shown at the bottom, White or Black (not a drawn game)
			label: () => t('quantumchess', 'Drawn at the bottom'),
			default: 'white',
			values: [
				{ id: 'white', label: () => t('quantumchess', 'White') },
				{ id: 'black', label: () => t('quantumchess', 'Black') },
			],
		},
	],
	setup: (options) => setup(options),
	rules: () => [
		t('quantumchess', 'Each row is a timeline and time runs to the right. You play only on the latest board of a timeline, when it is your move there (○ White, light frame; ● Black, dark frame). Every move adds a new board; the old ones stay as the past.'),
		t('quantumchess', 'On your turn move once on every board marked “must move” (gold, in the present, “Now”); boards marked “optional” (blue) you may play too. The turn ends by itself when no board is left, otherwise press Submit turn. Each move is played at once (and rolled if its result is uncertain); Undo never changes a roll.'),
		t('quantumchess', 'Pieces move along files, ranks, back in time (one step is one turn) and across timelines, keeping their pattern: the rook along one axis, the bishop two, the unicorn (U) three, the dragon (D) four, the queen any; the king steps one along any axes, the knight two along one and one along another; the princess (S) moves as rook or bishop, the royal queen (Y) as a queen, the common king (C) as a king. Landing on the latest board of another timeline jumps there; landing on an older board opens a new timeline that only your piece enters.'),
		t('quantumchess', 'Pawns and brawns (W) step forward or one timeline towards the opponent, capture diagonally or one timeline forward and one turn back or ahead, and become queens; a brawn also captures sideways or one rank forward together with one timeline forward, or one rank forward and one turn back. Capture any enemy king or royal queen, also one in the past, to win.'),
		t('quantumchess', 'Each player may open at most the number of new timelines set for the game (1 to 3). Your n-th new timeline is active (it counts for the present) while your opponent has opened at least n − 1; inactive timelines (hatched) can still be played. Pieces can travel back only as far as the game allows (2 or 4 turns); older boards are sealed: they are no longer shown, and nothing can travel there.'),
		t('quantumchess', 'Boards are certain, pieces are quantum: which boards exist, the present and whose turn it is are the same in every possibility. Timelines are AND, possibilities are OR. Kings, royal queens, common kings, pawns and brawns are solid: they never split.'),
		t('quantumchess', 'A move always makes its boards; the dice only decide what happens to the piece. So a ghost can travel: where it really stood it arrives, elsewhere the new boards appear without it. A Missed move still uses its board, and a Measure is your move on the board of the part you measure; the rest of your turn goes on.'),
		t('quantumchess', 'Both halves of a split land on one board: yours, another timeline’s latest board, or a board in the past. Merges start from one board. You measure only a part on a board you may play. The past is quantum too: new timelines copy ghosts as twins, and after a merge the past remembers both paths until those boards are sealed.'),
		t('quantumchess', 'If your turn cannot be finished from its start, the game ends at once: you lose if a king or royal queen of yours can be taken for certain (checkmate), otherwise it is a draw (stalemate). A move after which you could not finish your turn loses; the game asks before you play it. Red lines show what could take your royal pieces if you passed now (5D check); arrows show the travel of the last turns.'),
		t('quantumchess', 'Moves are written with their board, timeline and turn: (0T2)Nc3>(+1T2)c3 jumps to another timeline, (0T2)Nc3>>(0T1)a3 opens a new one, x marks a capture; the piece letters are K, Q, R, B, N, U, D, S, Y, C and W (brawn), none for a pawn.'),
	],
	generate: (w, side) => generate(w, side, viewFilter),
	apply,
	applyMiss,
	allowQuantum,
	unifyWorlds,
	solidExtra,
	nextSide: (w) => w.x.s,
	actions: (state) => [{ code: SUBMIT, label: submitLabel(spec, state) }],
	worldResult,
	stateResult: (state) => stateResult(spec, state),
	noMoves: (state) => endResult(spec, state),
	reasonText,
	recordInfo: (prev, code, branch, next) => recordInfo(spec, prev, code, branch, next),
	infoText,
	codeText,
	outcomeSquare,
	sideInfo,
	moveWarning: (state, code) => moveWarning(spec, state, code),
	lastMoveMarks,
	turnMarks,
	dangerText: (state, side, percent) => dangerText(state, side, percent, threats(spec, state)),
	endNote: (state) => endNote(state, threats(spec, state)),
	turnHint,
	refusalText,
	budgetRule: () => ({ limit: 8 }),
	layoutOf: (state) => layoutOf(spec, state),
	boardLegend: (state) => legendOf(spec, state),
	// time must keep running to the right: no "Flip board" (the `view` option puts Black at the bottom)
	flipBoard: false,
	// the classic end rules (LEAD-DECISIONS L1, multiverse-final.md F18): turns of several moves have the stuck test
	// instead of the escape rule, and bare kings are no draw because kings can still reach each other through time
	escapeRule: false,
	bareKingsDraw: false,
	drawsWait: true,
	maxPly: 1200,
	quietPlies: 300,
}
Object.assign(spec, computerHooks(spec))

export default defineVariant(spec)
