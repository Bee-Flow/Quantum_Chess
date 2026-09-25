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
import { layoutOf } from './multiverse/layout.js'
import { generate, SUBMIT } from './multiverse/moves.js'
import { TYPES } from './multiverse/pieces.js'
import { setup, SETUP_ORDER, SETUPS } from './multiverse/setup.js'
import { topology } from './multiverse/skeleton.js'
import {
	codeText,
	infoText,
	lastMoveMarks,
	reasonText,
	recordInfo,
	sideInfo,
	submitLabel,
} from './multiverse/texts.js'

/** The plain-language labels of the setups. */
const SETUP_LABELS = {
	small: () => t('quantumchess', 'Small: quick, best on phones'),
	verysmallopen: () => t('quantumchess', 'Very small and open: the easiest start, learn here'),
	standard: () => t('quantumchess', 'Standard: the real game, long; best on a laptop'),
	smallcentered: () => t('quantumchess', 'Small with the king in the centre'),
	verysmall: () => t('quantumchess', 'Very small'),
	noqueens: () => t('quantumchess', 'Simple, no queens'),
	turnzero: () => t('quantumchess', 'Standard with turn zero: Black may travel to T0'),
	twotimelines: () => t('quantumchess', 'Standard on two timelines, −0 and +0'),
	princess: () => t('quantumchess', 'Standard with princesses'),
	reversed: () => t('quantumchess', 'Reversed royalty: the queen is royal, the king is not'),
	defended: () => t('quantumchess', 'Defended pawn'),
	halfreflected: () => t('quantumchess', 'Half reflected'),
	justknights: () => t('quantumchess', 'Kings and knights'),
	justunicorns: () => t('quantumchess', 'Kings and unicorns'),
	justdragons: () => t('quantumchess', 'Kings and dragons'),
	justbrawns: () => t('quantumchess', 'Kings and brawns'),
	kingofkings: () => t('quantumchess', 'King of kings: common kings'),
	royalqueens: () => t('quantumchess', 'Royal queen showdown'),
	excessive: () => t('quantumchess', 'Excessive: three kings each, every piece'),
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

/** A sentence on the unusual pieces of a setup. */
const PIECE_NOTES = {
	princess: () => t('quantumchess', 'The princess moves like a rook or a bishop.'),
	reversed: () => t(
		'quantumchess',
		'The royal queen moves like a queen; the common king moves like a king but is not royal.',
	),
	justunicorns: () => t('quantumchess', 'Unicorns move along three axes at once.'),
	justdragons: () => t('quantumchess', 'Dragons move along all four axes at once.'),
	justbrawns: () => t('quantumchess', 'Brawns are pawns with extra captures.'),
	kingofkings: () => t('quantumchess', 'Common kings move like kings but are not royal.'),
	royalqueens: () => t('quantumchess', 'A royal queen moves like a queen and is royal like a king.'),
	excessive: () => t('quantumchess', 'Unicorns move along three axes at once, dragons along all four.'),
	marauders: () => t('quantumchess', 'Brawns are pawns with extra captures.'),
}

/**
 * How a setup is shown under the option and in the game's info: its official name and size, and a sentence on its
 * unusual pieces.
 *
 * @param {string} id setup id
 * @return {string|null}
 */
function describeSetup(id) {
	const S = SETUPS[id]
	if (!S) {
		return null
	}
	// TRANSLATORS: the official (English) name of a 5D chess start position and its board size, e.g. "Small (5 × 5)"
	const main = t('quantumchess', '{name} ({size} × {size})', { name: OFFICIAL[id], size: S.n })
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
			label: () => t('quantumchess', 'New timelines per player'),
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
				{ id: 'auto', label: () => t('quantumchess', 'Automatic (2 turns on small boards, 4 on large ones)') },
				{ id: '2', label: () => t('quantumchess', '2 turns (lighter)') },
				{ id: '4', label: () => t('quantumchess', '4 turns (as far as real games go)') },
			],
		},
		{
			id: 'view',
			type: 'choice',
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
		t('quantumchess', 'Each row is a timeline and time runs to the right. You play only on the latest board of a timeline, when it is your move there (○ White, ● Black). Every move adds a new board; the old ones stay as the past.'),
		t('quantumchess', 'On your turn move once on every board marked “must move” (the present, “Now”); boards marked “optional” you may play too. The turn ends by itself when no board is left, otherwise press Submit turn. Each move is rolled at once; Undo never changes a roll.'),
		t('quantumchess', 'Pieces move along files, ranks, back in time (one step is one turn) and across timelines, keeping their pattern: rook one axis, bishop two, unicorn three, dragon four, queen any. Landing on the latest board of another timeline jumps there; landing on an older board opens a new timeline that only your piece enters.'),
		t('quantumchess', 'Pawns and brawns step forward or one timeline towards the opponent, capture diagonally or one timeline forward and one turn back or ahead, and become queens. Capture any enemy king or royal queen, also one in the past, to win. Each player may open 1 to 3 timelines; old boards are sealed after the travel reach.'),
		t('quantumchess', 'Boards are certain, pieces are quantum: which boards exist, the present and whose turn it is are the same in every possibility. Timelines are AND, possibilities are OR.'),
		t('quantumchess', 'A move always makes its boards; the dice only decide what happens to the piece. So a ghost can travel: where it really stood it arrives, elsewhere the new boards appear without it. A Missed move and a Measure still use their board.'),
		t('quantumchess', 'Both halves of a split land on one board: yours, another timeline’s latest board, or a board in the past. Merges start from one board. You measure only a part on a board you may play. The past is quantum too: new timelines copy ghosts as twins, and after a merge the past remembers both paths until those boards are sealed.'),
		t('quantumchess', 'If your turn cannot be finished from its start, the game ends at once: you lose if a king of yours can be taken for certain (checkmate), otherwise it is a draw (stalemate). A move after which you could not finish your turn loses; the game asks before you play it.'),
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
	sideInfo,
	moveWarning: (state, code) => moveWarning(spec, state, code),
	lastMoveMarks,
	budgetRule: () => ({ limit: 8 }),
	layoutOf: (state) => layoutOf(spec, state),
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
