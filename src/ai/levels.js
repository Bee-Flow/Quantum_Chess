/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The computer player's level table: the five levels, the strengths at which it proposes candidate moves to an LLM
 * opponent, piece values and the leaf conversion constant. Pure data: safe to import from Node tools, the worker and
 * the UI thread.
 *
 * Vocabulary: the **rules engine** (src/engine) knows the rules; the **computer player** (src/ai) is the built-in
 * opponent that searches with it; an **LLM opponent** is a persona whose moves a language model picks from the
 * computer player's candidates.
 *
 * Level fields:
 * - `depth`: nominal search depth in plies (the search deepens iteratively up to it within `timeMs`).
 * - `quiescence`: `'captures'` (captures with P ≥ 50 % and king shots) or `'full'` (captures with P ≥ 25 %, all king
 *   shots, deeper).
 * - `timeMs`: think time; `maxMs` (level 5 only): the search may run over `timeMs` up to this when its best move
 *   just collapsed.
 * - `displayMs`: `[min, max]` total time the move is *shown* to take; `bestMove()` returns the remaining wait.
 * - `nodeBudget`: node budget for deterministic runs (tests, self-play); real games are limited by time.
 * - `softmaxT`: temperature of the softmax over expected scores; `0` = deterministic (ties within `tieWindow`).
 * - `randomRate`, `topHalfRate`, `secondRate`: chance to play a random legal move / a move from the top half /
 *   the second-best move.
 * - `splitRate`, `splitTypes`, `splitTop`: which pieces may split, how often (level 1 "for fun"), and for which types
 *   only the best N splits are kept at the root.
 * - `merges`: `true`, `false` or `'hanging'` (only when a part of the piece is attacked).
 * - `measures`: `true`, `false` or `'useful'` (only when the budget is full or a part attacks an enemy piece).
 * - `kingShotMin`: level 1–2 policy: always take a king shot with at least this chance, never one below it;
 *   `null`: the search decides.
 * - `defendRate`: chance that the level notices danger to its own king.
 * - `rollBonus`: bonus (in expected score) for rolled moves when choosing.
 * - `useSolver`: use the exact solver in small positions (≤ `SOLVER_MAX_PIECES` pieces and ≤
 *   `SOLVER_MAX_WORLDS` possibilities).
 * - `lmr`, `star2`: late-move reductions (splits) and Star2 probing at chance nodes.
 */

/**
 * Version of the computer player. It is part of the cache key of stored game reviews and benchmark results: bump it
 * whenever evaluation, search or levels change the values it reports.
 */
export const ENGINE_VERSION = 'qc-ai-1.0.0'

/** Leaf conversion constant from centipawns to expected score: `E = 1 / (1 + e^(−cp / LEAF_K))`. */
export const LEAF_K = 250

/** Piece values in centipawns. The king has no material value. */
export const PIECE_VALUES = Object.freeze({ p: 100, n: 300, b: 300, r: 500, q: 900, k: 0 })

/** Level 5 uses the exact solver when at most this many pieces … */
export const SOLVER_MAX_PIECES = 8

/** … and at most this many possibilities (worlds) remain. */
export const SOLVER_MAX_WORLDS = 16

const ALL_SPLIT_TYPES = Object.freeze(['n', 'b', 'r', 'q'])

/** The five levels, index = level − 1. */
export const LEVELS = Object.freeze([
	Object.freeze({
		level: 1,
		id: 'wobbles',
		name: 'Wobbles',
		label: 'beginner',
		depth: 1,
		quiescence: 'captures',
		timeMs: 50,
		displayMs: Object.freeze([700, 1200]),
		nodeBudget: 5000,
		softmaxT: 0.25,
		randomRate: 0.30,
		topHalfRate: 0,
		secondRate: 0,
		tieWindow: 0,
		splitRate: 0.20,
		splitTypes: Object.freeze(['n', 'b']),
		splitTop: null,
		merges: false,
		measures: false,
		kingShotMin: 0.5,
		defendRate: 0.5,
		rollBonus: 0,
		lmr: false,
		star2: false,
		useSolver: false,
		cannedLine: 'wobbles',
	}),
	Object.freeze({
		level: 2,
		id: 'dice',
		name: 'Dice',
		label: 'casual',
		depth: 2,
		quiescence: 'captures',
		timeMs: 250,
		displayMs: Object.freeze([600, 900]),
		nodeBudget: 15000,
		softmaxT: 0.08,
		randomRate: 0,
		topHalfRate: 0.10,
		secondRate: 0,
		tieWindow: 0,
		splitRate: 1,
		splitTypes: Object.freeze(['n', 'b']),
		splitTop: null,
		merges: 'hanging',
		measures: false,
		kingShotMin: 0.25,
		defendRate: 0.85,
		rollBonus: 0.03,
		lmr: false,
		star2: false,
		useSolver: false,
		cannedLine: 'dice',
	}),
	Object.freeze({
		level: 3,
		id: 'quark',
		name: 'Quark',
		label: 'club',
		depth: 3,
		quiescence: 'full',
		timeMs: 1000,
		displayMs: Object.freeze([1000, 1000]),
		nodeBudget: 30000,
		softmaxT: 0.02,
		randomRate: 0,
		topHalfRate: 0,
		secondRate: 0.03,
		tieWindow: 0,
		splitRate: 1,
		splitTypes: ALL_SPLIT_TYPES,
		splitTop: Object.freeze({ r: 6, q: 6 }),
		merges: true,
		measures: 'useful',
		kingShotMin: null,
		defendRate: 1,
		rollBonus: 0,
		lmr: false,
		star2: false,
		useSolver: false,
		cannedLine: 'quark',
	}),
	Object.freeze({
		level: 4,
		id: 'tangle',
		name: 'Tangle',
		label: 'strong',
		depth: 5,
		quiescence: 'full',
		timeMs: 2500,
		displayMs: Object.freeze([2500, 2500]),
		nodeBudget: 120000,
		softmaxT: 0.005,
		randomRate: 0,
		topHalfRate: 0,
		secondRate: 0,
		tieWindow: 0,
		splitRate: 1,
		splitTypes: ALL_SPLIT_TYPES,
		splitTop: null,
		merges: true,
		measures: true,
		kingShotMin: null,
		defendRate: 1,
		rollBonus: 0,
		lmr: true,
		star2: false,
		useSolver: false,
		cannedLine: 'tangle',
	}),
	Object.freeze({
		level: 5,
		id: 'observer',
		name: 'The Observer',
		label: 'expert',
		depth: 7,
		quiescence: 'full',
		timeMs: 5000,
		maxMs: 8000,
		displayMs: Object.freeze([5000, 5000]),
		nodeBudget: 250000,
		softmaxT: 0,
		randomRate: 0,
		topHalfRate: 0,
		secondRate: 0,
		tieWindow: 0.002,
		splitRate: 1,
		splitTypes: ALL_SPLIT_TYPES,
		splitTop: null,
		merges: true,
		measures: true,
		kingShotMin: null,
		defendRate: 1,
		rollBonus: 0,
		lmr: true,
		star2: true,
		useSolver: true,
		cannedLine: 'observer',
	}),
])

/**
 * Strengths of an LLM opponent: which level and think time produce its candidate moves, and how far below the best a
 * candidate may be to count as acceptable.
 */
export const STRENGTHS = Object.freeze({
	relaxed: Object.freeze({ level: 3, timeMs: 400, toleranceFactor: 2.5 }),
	balanced: Object.freeze({ level: 4, timeMs: 800, toleranceFactor: 1 }),
	sharp: Object.freeze({ level: 5, timeMs: 1500, toleranceFactor: 0.4 }),
})

/**
 * The level object for a level number (1–5) or a level object. Throws a TypeError for anything else.
 *
 * @param {number|object} level level number or level object
 * @return {object}
 */
export function levelOf(level) {
	if (typeof level === 'object' && level !== null && Number.isInteger(level.level)) {
		return level
	}
	const n = Number(level)
	if (!Number.isInteger(n) || n < 1 || n > LEVELS.length) {
		throw new TypeError('level must be 1–5')
	}
	return LEVELS[n - 1]
}
