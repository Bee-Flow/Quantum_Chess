/**
 * SPDX-FileCopyrightText: 2026 BeeFlow
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Iterative-deepening expectimax in E-space (GAME-DESIGN §6.1, SPEC §4.1).
 *
 * Values are expected scores **for the side to move** in [0, 1] (win 1, draw ½, loss 0); results convert them to
 * White's expected score. Decision nodes are negamax with alpha-beta; a rolled move is a chance node over its
 * outcomes (`applyForSearch`, at most 3 children, 8 for a Measure) with Star1 bounds and, when enabled, Star2 probing.
 *
 * - Transposition table keyed by `positionHash` (the last `history` entry), killer and history heuristics.
 * - Move ordering: certain king captures, king shots, captures by P(capture) × MVV-LVA, checks, merges, standard
 *   moves, Measures, splits.
 * - Quiescence on captures (≥ 25 % or ≥ 50 % by level) and on every king shot; stand pat on `staticE`.
 * - Split pruning: inside the tree only splits whose two targets are among the piece's best standard targets; the
 *   root keeps the level's full split set. Moves whose resulting positions hash equal are searched once.
 * - E1b is skipped inside the search (`applyForSearch`, ENGINE-RULES App. C); `staticE` detects a trapped mover at the
 *   leaves, and the search finds the forced capture one ply later anyway. Every move actually played goes through the
 *   normal `applyMove`.
 *
 * The searcher is **resumable**: `step(sliceDeadline)` runs until the slice deadline, and a later `step()` continues
 * (a restarted iteration finds its finished subtrees in the transposition table). The worker runs one long slice; the
 * main-thread fallback runs short ones between frames.
 */

import {
	applyForSearch,
	BUDGET,
	budget,
	findMove,
	generateMoves,
	kingDanger,
	squareName,
	T,
} from '../engine/index.js'
import { CHEAP, features, staticE, toCp, toE } from './evaluate.js'
import { between, KING as KING_T, KNIGHT as KNIGHT_T, RAYS as RAYS_T, reaches } from './geometry.js'
import { levelOf, PIECE_VALUES } from './levels.js'

const EXACT = 0
const LOWER = 1
const UPPER = 2

/** Values closer than this to 0 or 1 are reported as exactly 0 or 1 (a won or lost game). */
export const WIN_EPSILON = 1e-4

/** Per-ply discount of won/lost values, so that faster wins (and slower losses) are preferred. */
const PLY_DISCOUNT = 1e-6

const TT_MAX = 200000

/** Decision nodes stop once they are within this of beta: improvements this small never change a choice. */
const CUT_EPSILON = 2e-4

/** Delta pruning margin in quiescence (centipawns). */
const DELTA_MARGIN = 150

/** At most this many captures (besides king shots) per quiescence node. */
const Q_MAX_MOVES = 6

/** Thrown inside the recursion to unwind a search that must stop (never escapes the Searcher). */
class Stop {
	/**
	 * @param {'slice'|'limit'} reason why the search stops
	 */
	constructor(reason) {
		this.reason = reason
	}
}

/**
 * The value of a finished game for the side to move in it.
 *
 * @param {object} state state with a result
 * @param {number} ply distance from the root (for the win discount)
 * @return {number}
 */
function terminalValue(state, ply) {
	const r = state.result.result
	if (r === '1/2-1/2') {
		return 0.5
	}
	const whiteWon = r === '1-0'
	const moverWon = (state.turn === 'w') === whiteWon
	return moverWon ? 1 - ply * PLY_DISCOUNT : ply * PLY_DISCOUNT
}

/**
 * Round a value to exactly 0 or 1 when it means a decided game.
 *
 * @param {number} v value
 * @return {number}
 */
export function cleanValue(v) {
	if (v >= 1 - WIN_EPSILON) {
		return 1
	}
	if (v <= WIN_EPSILON) {
		return 0
	}
	return v
}

/**
 * The capture weight of a LegalMove (0 when it cannot capture).
 *
 * @param {object} m LegalMove
 * @return {number}
 */
export function captureWeight(m) {
	if (!m.capture) {
		return 0
	}
	if (m.resolution !== 'rolled') {
		return T
	}
	for (let i = 0; i < m.outcomes.length; i++) {
		if (m.outcomes[i].key === 'capture') {
			return m.outcomes[i].weight
		}
	}
	return 0
}

/**
 * The piece a capturing LegalMove would take (id), or −1.
 *
 * @param {object} f features of the state before the move
 * @param {object} m LegalMove
 * @return {number}
 */
export function victimOf(f, m) {
	if (!m.capture || m.type === 'measure' || m.type === 'split') {
		return -1
	}
	const t = m.to[0]
	const id = f.occ[t]
	if (id >= 0 && (id < 16) !== (m.piece < 16)) {
		return id
	}
	// En passant: the pawn behind the target square.
	const behind = m.piece < 16 ? t - 8 : t + 8
	const ep = f.occ[behind]
	return ep >= 0 ? ep : -1
}

/**
 * The outcome keys of a LegalMove, as `applyForSearch` expects them: `[{key, weight}]` (one entry with key null
 * for a move that is not rolled).
 *
 * @param {object} m LegalMove
 * @return {Array<{key: string|null, weight: number}>}
 */
export function outcomeList(m) {
	if (m.resolution !== 'rolled') {
		return [{ key: null, weight: T }]
	}
	return m.outcomes
}

/**
 * Does the piece of a standard move or merge attack the enemy king square from its target (on the lines of certain
 * pieces only)? A cheap ordering hint for "moves that may leave the enemy king unable to escape".
 *
 * @param {object} f features
 * @param {object} m LegalMove
 * @param {number} king enemy king square
 * @return {boolean}
 */
function givesCheck(f, m, king) {
	if (king < 0 || m.type === 'split' || m.type === 'measure') {
		return false
	}
	const type = f.types[m.piece]
	const t = m.to[0]
	if (type === 'p') {
		const df = Math.abs((t & 7) - (king & 7))
		const dr = (king >> 3) - (t >> 3)
		return df === 1 && dr === (m.piece < 16 ? 1 : -1)
	}
	if (!reaches(type, t, king)) {
		return false
	}
	if (type === 'n' || type === 'k') {
		return true
	}
	const lane = between(t, king)
	for (let j = 0; j < lane.length; j++) {
		const o = f.occ[lane[j]]
		if (o >= 0 && o !== m.piece && f.p[lane[j]] > 0.5) {
			return false
		}
	}
	return true
}

/**
 * Search options → normalised parameters.
 *
 * @param {object} options search options
 * @return {object}
 */
function paramsOf(options) {
	const level = levelOf(options.level ?? 4)
	const qFull = level.quiescence === 'full'
	return {
		level,
		maxDepth: options.maxDepth ?? level.depth,
		qMax: qFull ? 4 : 2,
		qThreshold: qFull ? 0.25 : 0.5,
		splitTargets: level.level >= 4 ? 4 : 3,
		splitTypes: new Set(level.splitTypes),
		lmr: options.lmr ?? level.lmr,
		star2: options.star2 ?? level.star2,
		futility: level.level >= 2,
	}
}

/**
 * A resumable expectimax search of one position.
 */
export class Searcher {
	/**
	 * Options:
	 * - `level` (1–5 or a level object; default 4): depth, quiescence, split and reduction settings.
	 * - `timeMs` (default: the level's; `Infinity` for none), `maxMs` (overrun limit), `nodeBudget` (default none).
	 * - `maxDepth`: override the level's depth.
	 * - `rootMoves`: codes to restrict the root to (default: every legal move).
	 * - `rootSplits`: `'all'` (default) or `'pruned'`; `splitTop`: `{type: n}` keep only the best n root splits of
	 *   those types (level 3).
	 * - `multiPv` (default 1) and `margin` (default 0): root moves whose value may be within `margin` of the
	 *   `multiPv`-th best get exact values; the others get upper bounds.
	 * - `rootEpsilon` (with `margin` 0): a root move must beat the best by more than this to replace it (moves
	 *   within the tie window are cut early).
	 * - `include`: codes whose values must be exact.
	 * - `exactOutcomes`: search every outcome of a rolled root move with a full window (per-outcome values).
	 * - `usePartial` (default true): let moves searched in an unfinished last iteration count; analysis turns it off
	 *   to report every move from the same depth.
	 * - `ignoreKing`: `'w'`/`'b'`: that side does not notice danger to its own king (level noise).
	 * - `onProgress({depth, code, E, value, nodes, timeMs})` after each completed iteration.
	 * - `now`: clock (ms), default `performance.now`.
	 * - `tt`: a Map to share a transposition table between searches of the same game.
	 *
	 * @param {object} state engine state (result null)
	 * @param {object} [options] options
	 */
	constructor(state, options = {}) {
		this.state = state
		this.options = options
		this.p = paramsOf(options)
		this.now = options.now || (() => performance.now())
		this.start = this.now()
		const timeMs = options.timeMs ?? this.p.level.timeMs
		this.deadline = Number.isFinite(timeMs) ? this.start + timeMs : Infinity
		const maxMs = options.maxMs ?? this.p.level.maxMs
		this.extendTo = Number.isFinite(maxMs) && Number.isFinite(timeMs) ? this.start + maxMs : this.deadline
		this.extended = false
		this.nodeBudget = options.nodeBudget ?? Infinity
		this.sliceDeadline = Infinity
		this.nodes = 0
		this.tt = options.tt || new Map()
		this.killers = []
		this.history = new Map()
		this.ignoreKing = options.ignoreKing === 'w' ? 0 : options.ignoreKing === 'b' ? 1 : -1
		this.multiPv = Math.max(1, options.multiPv ?? 1)
		this.margin = options.margin ?? 0
		this.rootEpsilon = options.rootEpsilon ?? 0
		this.include = new Set(options.include || [])
		this.exactOutcomes = Boolean(options.exactOutcomes)
		this.usePartial = options.usePartial ?? true
		this.onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
		this.done = false
		this.depth = 0 // last completed iteration
		this.iter = null // the iteration in progress: {depth, index}
		this.stopped = false
		this.root = this.buildRoot()
	}

	/**
	 * Root entries: every legal move (filtered), with its outcome children applied once.
	 *
	 * @return {object[]}
	 */
	buildRoot() {
		const state = this.state
		let moves = generateMoves(state)
		if (this.options.rootMoves) {
			const wanted = new Set(this.options.rootMoves)
			moves = moves.filter((m) => wanted.has(m.code))
		}
		const f = features(state)
		if (this.options.rootSplits === 'pruned') {
			moves = this.pruneSplits(f, moves, this.p.splitTargets)
		}
		if (this.options.splitTop) {
			moves = this.topSplits(f, moves, this.options.splitTop)
		}
		const scored = this.score(f, moves, 0, null)
		return scored.map(({ m }, i) => ({
			move: m,
			code: m.code,
			order: i,
			children: outcomeList(m).map((o) => ({ key: o.key, weight: o.weight, state: null, value: null })),
			value: null,
			exact: false,
			depth: 0,
		}))
	}

	/**
	 * Count a node and stop the search when a limit is reached.
	 */
	tick() {
		this.nodes++
		if (this.nodes >= this.nodeBudget) {
			throw new Stop('limit')
		}
		if ((this.nodes & 1) === 0) {
			const t = this.now()
			if (t >= this.sliceDeadline && this.sliceDeadline < this.deadline) {
				throw new Stop('slice')
			}
			// Analysis (usePartial off) always completes the first iteration, so that every root move gets a value; a
			// move choice may stop inside it once at least one move has one.
			if (t >= this.deadline && (this.depth > 0 || (this.usePartial && this.iter !== null && this.iter.index > 0))) {
				if (!this.extended && this.extendTo > this.deadline && this.unstable()) {
					this.extended = true
					this.deadline = this.extendTo
					return
				}
				throw new Stop('limit')
			}
		}
	}

	/**
	 * Is the current iteration's best move worse than the previous iteration's (a reason to think longer)?
	 *
	 * @return {boolean}
	 */
	unstable() {
		if (this.iter === null || this.depth === 0) {
			return false
		}
		const first = this.root[0]
		return first.depth === this.iter.depth && first.prevValue !== undefined && first.value < first.prevValue - 0.05
	}

	/**
	 * Run until done or until the slice deadline. Returns true when the search is finished.
	 *
	 * @param {number} [sliceDeadline] clock value at which to pause (Infinity: run to the end)
	 * @return {boolean}
	 */
	step(sliceDeadline = Infinity) {
		if (this.done) {
			return true
		}
		this.sliceDeadline = sliceDeadline
		if (this.root.length === 0 || (this.root.length === 1 && !this.options.rootMoves)) {
			if (this.root.length === 1 && this.root[0].value === null) {
				// A single legal move: one shallow look for its value, never a deep search.
				try {
					this.iter = { depth: 1, index: 0 }
					this.searchRoot(1)
					this.depth = 1
				} catch (e) {
					if (!(e instanceof Stop)) {
						throw e
					}
				}
			}
			this.done = true
			return true
		}
		try {
			while (true) {
				const d = this.iter === null ? this.depth + 1 : this.iter.depth
				if (d > this.p.maxDepth) {
					break
				}
				if (this.iter === null) {
					this.iter = { depth: d, index: 0 }
					for (const e of this.root) {
						e.prevValue = e.value
					}
				}
				this.searchRoot(d)
				this.depth = d
				this.iter = null
				this.snapshot()
				this.sortRoot()
				this.report()
				if (this.decided()) {
					break
				}
			}
		} catch (e) {
			if (!(e instanceof Stop)) {
				throw e
			}
			if (e.reason === 'slice') {
				return false
			}
			if (!this.usePartial) {
				this.restore()
			}
			this.sortRoot()
		}
		this.done = true
		return true
	}

	/**
	 * Remember the root values of a completed iteration.
	 */
	snapshot() {
		for (const e of this.root) {
			e.stable = { value: e.value, exact: e.exact, depth: e.depth, kids: e.children.map((c) => c.value) }
		}
	}

	/**
	 * Drop the values of an unfinished iteration (analysis wants one consistent depth for every move).
	 */
	restore() {
		for (const e of this.root) {
			if (e.stable !== undefined) {
				e.value = e.stable.value
				e.exact = e.stable.exact
				e.depth = e.stable.depth
				e.children.forEach((c, i) => {
					c.value = e.stable.kids[i]
				})
			}
		}
	}

	/**
	 * Stop deepening when the best move is a proven win (nothing deeper can improve it) or every other move is lost.
	 *
	 * @return {boolean}
	 */
	decided() {
		const best = this.root[0]
		return best.exact && cleanValue(best.value) === 1 && this.multiPv === 1 && this.include.size === 0
	}

	/**
	 * Sort root entries: the deepest searched first, then by value; exact values before bounds.
	 */
	sortRoot() {
		const deepest = Math.max(...this.root.map((e) => e.depth))
		const firstDone = this.root[0].depth === deepest
		this.root.sort((a, b) => {
			// Trust a partial iteration only through the moves it finished (the previous best is searched first).
			const da = firstDone ? (a.depth === deepest ? 1 : 0) : 0
			const db = firstDone ? (b.depth === deepest ? 1 : 0) : 0
			if (da !== db) {
				return db - da
			}
			const va = a.value ?? -1
			const vb = b.value ?? -1
			if (va !== vb) {
				return vb - va
			}
			if (a.exact !== b.exact) {
				return a.exact ? -1 : 1
			}
			return a.order - b.order
		})
	}

	/**
	 * Progress callback after an iteration.
	 */
	report() {
		if (this.onProgress === null) {
			return
		}
		const best = this.root[0]
		this.onProgress({
			depth: this.depth,
			code: best.code,
			value: cleanValue(best.value),
			E: this.toWhite(cleanValue(best.value)),
			nodes: this.nodes,
			timeMs: Math.round(this.now() - this.start),
		})
	}

	/**
	 * A mover's value → White's expected score.
	 *
	 * @param {number} v value for the side to move at the root
	 * @return {number}
	 */
	toWhite(v) {
		return this.state.turn === 'w' ? v : 1 - v
	}

	/**
	 * One iteration over the root moves (resumes at `iter.index` after a slice pause).
	 *
	 * @param {number} depth iteration depth
	 */
	searchRoot(depth) {
		const exactValues = []
		for (let i = 0; i < this.iter.index; i++) {
			const e = this.root[i]
			if (e.exact && e.depth === depth) {
				exactValues.push(e.value)
			}
		}
		for (let i = this.iter.index; i < this.root.length; i++) {
			const e = this.root[i]
			let alpha = 0
			if (!this.include.has(e.code) && exactValues.length >= this.multiPv) {
				exactValues.sort((a, b) => b - a)
				alpha = this.margin > 0
					? Math.max(0, exactValues[this.multiPv - 1] - this.margin)
					: Math.min(1, exactValues[this.multiPv - 1] + this.rootEpsilon)
			}
			const v = this.rootValue(e, depth, alpha, 1)
			e.value = v
			e.exact = v > alpha || alpha === 0
			e.depth = depth
			if (e.exact) {
				exactValues.push(v)
			}
			this.iter.index = i + 1
		}
	}

	/**
	 * Value of a root move for the side to move (chance node over its outcomes).
	 *
	 * @param {object} e root entry
	 * @param {number} depth iteration depth
	 * @param {number} alpha lower bound
	 * @param {number} beta upper bound
	 * @return {number}
	 */
	rootValue(e, depth, alpha, beta) {
		for (const c of e.children) {
			if (c.state === null) {
				c.state = applyForSearch(this.state, e.move, c.key)
			}
		}
		if (e.children.length === 1) {
			const c = e.children[0]
			const v = this.childValue(c.state, depth - 1, alpha, beta, 1)
			c.value = v
			return v
		}
		if (this.exactOutcomes) {
			let sum = 0
			for (const c of e.children) {
				c.value = this.childValue(c.state, depth - 1, 0, 1, 1)
				sum += (c.weight / T) * c.value
			}
			return sum
		}
		return this.chance(this.state, e.move, e.children, depth, alpha, beta, 0, false, 0)
	}

	/**
	 * The mover's value of a child state (1 − the child's value for its own side to move).
	 *
	 * @param {object} child state after the move
	 * @param {number} depth remaining depth for the child
	 * @param {number} alpha mover's alpha
	 * @param {number} beta mover's beta
	 * @param {number} ply ply of the child
	 * @return {number}
	 */
	childValue(child, depth, alpha, beta, ply) {
		if (child.result !== null) {
			return 1 - terminalValue(child, ply)
		}
		return 1 - this.node(child, depth, 1 - beta, 1 - alpha, ply)
	}

	/**
	 * Chance node over a rolled move's outcomes with Star1 bounds (and Star2 probing when enabled). Returns the
	 * mover's value: exact inside (alpha, beta), otherwise a bound.
	 *
	 * @param {object} state position before the move
	 * @param {object} move LegalMove
	 * @param {Array<{key: string, weight: number, state: object|null}>|null} kids pre-built outcome entries or null
	 * @param {number} depth remaining depth of this node (children get depth − 1)
	 * @param {number} alpha lower bound
	 * @param {number} beta upper bound
	 * @param {number} ply ply of this node
	 * @param {boolean} q quiescence
	 * @param {number} qd quiescence depth of this node
	 * @return {number}
	 */
	chance(state, move, kids, depth, alpha, beta, ply, q, qd) {
		const outs = kids || move.outcomes.map((o) => ({ key: o.key, weight: o.weight, state: null }))
		const order = outs.slice().sort((a, b) => b.weight - a.weight)
		const upper = new Float64Array(order.length).fill(1)
		let upperSum = 1
		if (this.p.star2 && !q && depth >= 2) {
			// Star2 probing: one move per outcome gives a lower bound for the replier, an upper bound for us.
			upperSum = 0
			for (let i = 0; i < order.length; i++) {
				const o = order[i]
				if (o.state === null) {
					o.state = applyForSearch(state, move, o.key)
				}
				const u = o.state.result !== null ? 1 - terminalValue(o.state, ply + 1) : 1 - this.probe(o.state, depth - 1, ply + 1)
				upper[i] = u
				upperSum += (o.weight / T) * u
			}
			if (upperSum <= alpha) {
				return upperSum
			}
		}
		let sum = 0
		let rem = 1
		let remUpper = upperSum
		for (let i = 0; i < order.length; i++) {
			const o = order[i]
			const pr = o.weight / T
			rem = Math.max(0, rem - pr)
			remUpper = Math.max(0, remUpper - pr * upper[i])
			if (o.state === null) {
				o.state = applyForSearch(state, move, o.key)
			}
			let x
			if (o.state.result !== null) {
				x = 1 - terminalValue(o.state, ply + 1)
			} else {
				const a = Math.max(0, (alpha - sum - remUpper) / pr)
				const b = Math.min(1, (beta - sum) / pr)
				if (q) {
					// A capture continues the exchange; after a miss or a plain move one more ply of captures at most.
					x = 1 - this.qsearch(o.state, 1 - b, 1 - a, ply + 1, o.key === 'capture' ? qd + 1 : qd + 2)
				} else {
					x = 1 - this.node(o.state, depth - 1, 1 - b, 1 - a, ply + 1)
				}
			}
			if (kids !== null) {
				o.value = x
			}
			sum += pr * x
			if (sum + remUpper <= alpha) {
				return sum + remUpper
			}
			if (sum >= beta) {
				return sum
			}
		}
		return sum
	}

	/**
	 * Star2 probe: the replier's value of its first (best-ordered) move only — a lower bound of its node value.
	 *
	 * @param {object} state position (result null)
	 * @param {number} depth remaining depth
	 * @param {number} ply ply
	 * @return {number}
	 */
	probe(state, depth, ply) {
		this.tick()
		const e = this.tt.get(state.history[state.history.length - 1])
		if (e !== undefined && e.depth >= depth && e.flag !== UPPER) {
			return e.value
		}
		const moves = this.orderedMoves(state, ply, e !== undefined ? e.move : null, depth)
		if (moves.length === 0) {
			return 0
		}
		const m = moves[0].m
		if (m.resolution !== 'rolled') {
			return this.childValue(applyForSearch(state, m), depth - 1, 0, 1, ply + 1)
		}
		return this.chance(state, m, null, depth, 0, 1, ply, false, 0)
	}

	/**
	 * Decision node (negamax): the side to move's value.
	 *
	 * @param {object} state position (result null)
	 * @param {number} depth remaining depth
	 * @param {number} alpha lower bound
	 * @param {number} beta upper bound
	 * @param {number} ply distance from the root
	 * @return {number}
	 */
	node(state, depth, alpha, beta, ply) {
		if (depth <= 0) {
			return this.qsearch(state, alpha, beta, ply, 0)
		}
		this.tick()
		const hash = state.history[state.history.length - 1]
		const entry = this.tt.get(hash)
		let ttMove = null
		if (entry !== undefined) {
			ttMove = entry.move
			if (entry.depth >= depth) {
				if (entry.flag === EXACT) {
					return entry.value
				}
				if (entry.flag === LOWER && entry.value >= beta) {
					return entry.value
				}
				if (entry.flag === UPPER && entry.value <= alpha) {
					return entry.value
				}
			}
		}
		const mover = state.turn === 'w' ? 0 : 1
		if (this.ignoreKing !== 1 - mover && kingDanger(state, mover === 0 ? 'b' : 'w') === T) {
			// A certain king capture is available: the game is won.
			return 1 - ply * PLY_DISCOUNT
		}
		const alpha0 = alpha
		const ownDanger = kingDanger(state, state.turn)
		let quietCut = false
		if (this.p.futility && depth === 1 && ownDanger === 0) {
			quietCut = staticE(state, this.ignoreKing) + 0.12 <= alpha
		}
		const moves = this.orderedMoves(state, ply, ttMove, depth)
		let best = -1
		let bestCode = null
		const seen = new Set()
		for (let i = 0; i < moves.length; i++) {
			const { m, tactical } = moves[i]
			if (quietCut && !tactical && best >= 0) {
				continue
			}
			let v
			if (m.resolution !== 'rolled') {
				const child = applyForSearch(state, m)
				const h = child.history[child.history.length - 1]
				if (seen.has(h)) {
					continue
				}
				seen.add(h)
				let reduce = 0
				if (this.p.lmr && depth >= 3 && i >= 4 && !tactical && ownDanger === 0) {
					reduce = m.type === 'split' && depth >= 4 && i >= 10 ? 2 : 1
				}
				if (reduce > 0) {
					v = this.childValue(child, depth - 1 - reduce, alpha, alpha + 1e-9, ply + 1)
					if (v > alpha) {
						v = this.childValue(child, depth - 1, alpha, beta, ply + 1)
					}
				} else {
					v = this.childValue(child, depth - 1, alpha, beta, ply + 1)
				}
			} else {
				v = this.chance(state, m, null, depth, alpha, beta, ply, false, 0)
			}
			if (v > best) {
				best = v
				bestCode = m.code
			}
			if (v > alpha) {
				alpha = v
			}
			if (alpha >= beta - CUT_EPSILON) {
				if (!tactical) {
					this.addKiller(ply, m.code)
					this.history.set(m.code, (this.history.get(m.code) || 0) + depth * depth)
				}
				break
			}
		}
		if (best < 0) {
			// Every move was pruned or a duplicate: fall back to the static value.
			best = staticE(state, this.ignoreKing)
		}
		const flag = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT
		this.store(hash, depth, best, flag, bestCode)
		return best
	}

	/**
	 * Store a transposition-table entry (keeps the deeper entry; trims the oldest quarter when full).
	 *
	 * @param {string} hash position hash
	 * @param {number} depth depth
	 * @param {number} value value
	 * @param {number} flag EXACT, LOWER or UPPER
	 * @param {string|null} move best move code
	 */
	store(hash, depth, value, flag, move) {
		const old = this.tt.get(hash)
		if (old !== undefined && old.depth > depth) {
			return
		}
		if (old === undefined && this.tt.size >= TT_MAX) {
			let n = TT_MAX >> 2
			for (const k of this.tt.keys()) {
				this.tt.delete(k)
				if (--n <= 0) {
					break
				}
			}
		}
		this.tt.set(hash, { depth, value, flag, move: move ?? (old ? old.move : null) })
	}

	/**
	 * Remember a quiet move that caused a cutoff at this ply.
	 *
	 * @param {number} ply ply
	 * @param {string} code move code
	 */
	addKiller(ply, code) {
		let k = this.killers[ply]
		if (k === undefined) {
			k = this.killers[ply] = []
		}
		if (k[0] !== code) {
			k[1] = k[0]
			k[0] = code
		}
	}

	/**
	 * Quiescence: stand pat on the static value, then captures (and king shots) with their chance nodes.
	 *
	 * @param {object} state position (result null)
	 * @param {number} alpha lower bound
	 * @param {number} beta upper bound
	 * @param {number} ply distance from the root
	 * @param {number} qd quiescence depth
	 * @return {number}
	 */
	qsearch(state, alpha, beta, ply, qd) {
		this.tick()
		// Quiescence results go to the transposition table too, with a negative depth for the quiescence plies
		// already used: this lets a search that restarts after a time slice resume where it stopped.
		const hash = state.history[state.history.length - 1]
		const qDepth = -qd / 16
		const entry = this.tt.get(hash)
		if (entry !== undefined && entry.depth >= qDepth) {
			if (entry.flag === EXACT || (entry.flag === LOWER && entry.value >= beta) || (entry.flag === UPPER && entry.value <= alpha)) {
				return entry.value
			}
		}
		const stand = staticE(state, this.ignoreKing)
		if (stand >= 1) {
			return 1 - ply * PLY_DISCOUNT
		}
		if (stand <= 0) {
			return ply * PLY_DISCOUNT
		}
		if (qd >= this.p.qMax || stand >= beta) {
			return stand
		}
		const alpha0 = alpha
		let best = stand
		if (stand > alpha) {
			alpha = stand
		}
		const caps = this.captures(state)
		const f = features(state)
		const standCp = toCp(stand)
		let tried = 0
		for (let i = 0; i < caps.length; i++) {
			const c = caps[i]
			const m = findMove(state, c.code)
			if (m === null) {
				continue
			}
			const w = captureWeight(m)
			if (w === 0 && m.promo === undefined) {
				continue
			}
			if (!c.king) {
				// Deeper in quiescence only likelier captures: the threshold rises to 50 % and then to certainty.
				const threshold = qd === 0 ? this.p.qThreshold : qd === 1 ? Math.max(0.5, this.p.qThreshold) : 1
				if (w > 0 && w / T < threshold) {
					continue
				}
				if (++tried > Q_MAX_MOVES) {
					break
				}
				// Delta pruning: even the optimistic gain cannot lift this node above alpha.
				const vid = victimOf(f, m)
				const gain = (w / T) * (vid >= 0 ? PIECE_VALUES[f.types[vid]] : 0) + (m.promo === 'q' ? 800 : 0)
				if (toE(standCp + gain + DELTA_MARGIN) <= alpha) {
					continue
				}
			}
			let v
			if (m.resolution !== 'rolled') {
				v = this.qChild(applyForSearch(state, m), alpha, beta, ply + 1, qd + 1)
			} else {
				v = this.chance(state, m, null, 0, alpha, beta, ply, true, qd)
			}
			if (v > best) {
				best = v
			}
			if (v > alpha) {
				alpha = v
			}
			if (alpha >= beta) {
				break
			}
		}
		this.store(hash, qDepth, best, best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT, null)
		return best
	}

	/**
	 * Mover's value of a quiescence child.
	 *
	 * @param {object} child state after the move
	 * @param {number} alpha mover's alpha
	 * @param {number} beta mover's beta
	 * @param {number} ply ply of the child
	 * @param {number} qd quiescence depth of the child
	 * @return {number}
	 */
	qChild(child, alpha, beta, ply, qd) {
		if (child.result !== null) {
			return 1 - terminalValue(child, ply)
		}
		return 1 - this.qsearch(child, 1 - beta, 1 - alpha, ply, qd)
	}

	/**
	 * Candidate captures of the side to move, generated from the attack map without the full move list: standard
	 * captures, converging captures (merges), en passant and queen promotions. Legality is checked by `findMove`.
	 * Sorted king shots first, then by estimated gain.
	 *
	 * @param {object} state position
	 * @return {Array<{code: string, king: boolean, score: number}>}
	 */
	captures(state) {
		const f = features(state)
		const mover = state.turn === 'w' ? 0 : 1
		const base = mover * 16
		const out = []
		const seen = new Set()
		const parts = new Map()
		const add = (id, from, to, pa, promo) => {
			const vid = f.occ[to]
			const king = vid === (mover === 0 ? 16 : 0)
			if (king && this.ignoreKing === 1 - mover) {
				return
			}
			const code = squareName(from) + '-' + squareName(to) + (promo ? '=Q' : '')
			if (seen.has(code)) {
				return
			}
			seen.add(code)
			const victim = vid >= 0 ? PIECE_VALUES[f.types[vid]] : promo ? 800 : 100
			out.push({ code, king, score: (king ? 1e6 : 0) + pa * (vid >= 0 ? f.p[to] : 1) * victim * 10 - PIECE_VALUES[f.types[id]] / 10 })
			if (!promo && vid >= 0) {
				let list = parts.get(id)
				if (list === undefined) {
					list = []
					parts.set(id, list)
				}
				list.push({ from, to })
			}
		}
		const enemy = (s) => {
			const o = f.occ[s]
			return o >= 0 && (o < 16 ? 0 : 1) !== mover
		}
		const epSq = state.ep === '-' ? -1 : (state.ep.charCodeAt(1) - 49) * 8 + (state.ep.charCodeAt(0) - 97)
		for (let from = 0; from < 64; from++) {
			const id = f.occ[from]
			if (id < base || id >= base + 16) {
				continue
			}
			const type = f.types[id]
			const pf = f.p[from]
			if (type === 'p') {
				const dir = mover === 0 ? 8 : -8
				const last = mover === 0 ? 7 : 0
				const file = from & 7
				for (const df of [-1, 1]) {
					if (file + df < 0 || file + df > 7) {
						continue
					}
					const to = from + dir + df
					if (enemy(to) || to === epSq) {
						add(id, from, to, pf, to >> 3 === last)
					}
				}
				const push = from + dir
				if (push >> 3 === last && f.occ[push] < 0) {
					add(id, from, push, pf, true)
				}
				continue
			}
			if (type === 'n' || type === 'k') {
				const list = f.types[id] === 'n' ? KNIGHT_T[from] : KING_T[from]
				for (let j = 0; j < list.length; j++) {
					if (enemy(list[j])) {
						add(id, from, list[j], pf, false)
					}
				}
				continue
			}
			const d0 = type === 'b' ? 4 : 0
			const d1 = type === 'r' ? 4 : 8
			for (let d = d0; d < d1; d++) {
				const ray = RAYS_T[from * 8 + d]
				let clear = 1
				for (let j = 0; j < ray.length; j++) {
					const s = ray[j]
					const o = f.occ[s]
					if (o < 0 || o === id) {
						continue
					}
					if (enemy(s)) {
						add(id, from, s, pf * clear, false)
					}
					clear *= 1 - f.p[s]
					if (clear < 0.05) {
						break
					}
				}
			}
		}
		// Converging captures: two parts of one piece attacking the same enemy square.
		for (const [id, list] of parts) {
			if (f.partsCount[id] < 2 || f.types[id] === 'p' || f.types[id] === 'k') {
				continue
			}
			for (let a = 0; a < list.length; a++) {
				for (let b = a + 1; b < list.length; b++) {
					if (list[a].to !== list[b].to || list[a].from === list[b].from) {
						continue
					}
					const f1 = Math.min(list[a].from, list[b].from)
					const f2 = Math.max(list[a].from, list[b].from)
					const to = list[a].to
					const vid = f.occ[to]
					const code = squareName(f1) + '|' + squareName(f2) + '-' + squareName(to)
					if (!seen.has(code)) {
						seen.add(code)
						const king = vid === (mover === 0 ? 16 : 0)
						out.push({ code, king, score: (king ? 2e6 : 0) + f.p[to] * PIECE_VALUES[f.types[vid]] * 12 })
					}
				}
			}
		}
		out.sort((x, y) => y.score - x.score)
		return out
	}

	/**
	 * Keep only splits whose targets are both among the piece's best `k` standard targets (ENGINE-RULES App. C).
	 *
	 * @param {object} f features
	 * @param {object[]} moves LegalMoves
	 * @param {number} k targets kept per piece
	 * @return {object[]}
	 */
	pruneSplits(f, moves, k) {
		const targets = new Map()
		for (const m of moves) {
			if (m.type === 'standard' && !m.capture && f.occ[m.to[0]] < 0 && f.partsCount[m.piece] >= 1) {
				const type = f.types[m.piece]
				if (type === 'p' || type === 'k') {
					continue
				}
				let list = targets.get(m.piece)
				if (list === undefined) {
					list = []
					targets.set(m.piece, list)
				}
				list.push({ sq: m.to[0], score: this.targetScore(f, m.piece, m.from[0], m.to[0]) })
			}
		}
		const keep = new Map()
		for (const [id, list] of targets) {
			list.sort((a, b) => b.score - a.score)
			keep.set(id, new Set(list.slice(0, k).map((x) => x.sq)))
		}
		return moves.filter((m) => {
			if (m.type !== 'split') {
				return true
			}
			if (!this.p.splitTypes.has(f.types[m.piece])) {
				return false
			}
			const set = keep.get(m.piece)
			return set !== undefined && set.has(m.to[0]) && set.has(m.to[1])
		})
	}

	/**
	 * Keep only the best `n` root splits of the given piece types (level 3: the top 6 splits for R and Q).
	 *
	 * @param {object} f features
	 * @param {object[]} moves LegalMoves
	 * @param {object} top `{type: n}`
	 * @return {object[]}
	 */
	topSplits(f, moves, top) {
		const byType = new Map()
		for (const m of moves) {
			if (m.type === 'split' && top[f.types[m.piece]] !== undefined) {
				const s = this.targetScore(f, m.piece, m.from[0], m.to[0]) + this.targetScore(f, m.piece, m.from[0], m.to[1])
				const t = f.types[m.piece]
				if (!byType.has(t)) {
					byType.set(t, [])
				}
				byType.get(t).push({ m, s })
			}
		}
		const allowed = new Set()
		for (const [t, list] of byType) {
			list.sort((a, b) => b.s - a.s)
			for (const x of list.slice(0, top[t])) {
				allowed.add(x.m.code)
			}
		}
		return moves.filter((m) => m.type !== 'split' || top[f.types[m.piece]] === undefined || allowed.has(m.code))
	}

	/**
	 * Heuristic score of a piece moving from `from` to the empty square `to`: centralisation, safety from cheaper
	 * attackers, and pressure on enemy pieces.
	 *
	 * @param {object} f features
	 * @param {number} id piece id
	 * @param {number} from square
	 * @param {number} to square
	 * @return {number}
	 */
	targetScore(f, id, from, to) {
		const c = id < 16 ? 0 : 1
		const type = f.types[id]
		const val = PIECE_VALUES[type]
		const centre = (x) => 7 - (Math.abs(3.5 - (x & 7)) + Math.abs(3.5 - (x >> 3)))
		let s = (centre(to) - centre(from)) * 4
		const e = 1 - c
		const threat = f.att[e * 64 + to]
		if (threat > 0) {
			s -= f.att[CHEAP + e * 64 + to] < val ? val * threat : f.att[c * 64 + to] >= 0.5 ? 0 : val * threat * 0.5
		}
		// Attacking the enemy king zone or undefended pieces from the new square.
		const k = f.kingSq[e]
		if (k >= 0 && reaches(type, to, k)) {
			s += 40
		}
		return s
	}

	/**
	 * The ordered move list of a node, with the level's pruning applied.
	 *
	 * @param {object} state position
	 * @param {number} ply ply
	 * @param {string|null} ttMove TT move code
	 * @param {number} depth remaining depth
	 * @return {Array<{m: object, tactical: boolean, score: number}>}
	 */
	orderedMoves(state, ply, ttMove, depth) {
		const f = features(state)
		let moves = generateMoves(state)
		moves = this.pruneSplits(f, moves, depth >= 3 ? this.p.splitTargets : Math.max(2, this.p.splitTargets - 1))
		const mover = state.turn === 'w' ? 0 : 1
		// Measures only when the budget is full or a part is attacking something (a certain capture may follow).
		const full = budget(state, state.turn) >= BUDGET
		moves = moves.filter((m) => m.type !== 'measure' || full || this.usefulMeasure(f, m, mover))
		if (this.ignoreKing === 1 - mover) {
			const k = f.kingSq[this.ignoreKing]
			moves = moves.filter((m) => m.to.length === 0 || m.to[0] !== k)
		}
		return this.score(f, moves, ply, ttMove)
	}

	/**
	 * Is a Measure worth searching when the budget is not full? Only if the piece has a part attacking an enemy piece
	 * (the Measure may make a capture certain).
	 *
	 * @param {object} f features
	 * @param {object} m measure LegalMove
	 * @param {number} mover colour index
	 * @return {boolean}
	 */
	usefulMeasure(f, m, mover) {
		const id = m.piece
		const type = f.types[id]
		for (let s = 0; s < 64; s++) {
			if (f.occ[s] !== id) {
				continue
			}
			for (let t = 0; t < 64; t++) {
				const o = f.occ[t]
				if (o >= 0 && (o < 16 ? 0 : 1) !== mover && reaches(type, s, t)) {
					return true
				}
			}
		}
		return false
	}

	/**
	 * Score and sort moves (GD §6.1 ordering).
	 *
	 * @param {object} f features
	 * @param {object[]} moves LegalMoves
	 * @param {number} ply ply
	 * @param {string|null} ttMove TT move code
	 * @return {Array<{m: object, tactical: boolean, score: number}>}
	 */
	score(f, moves, ply, ttMove) {
		const killers = this.killers[ply] || []
		const out = new Array(moves.length)
		for (let i = 0; i < moves.length; i++) {
			const m = moves[i]
			const mover = m.piece < 16 ? 0 : 1
			const enemyKing = f.kingSq[1 - mover]
			let score = 0
			let tactical = false
			const cw = captureWeight(m)
			if (m.code === ttMove) {
				score = 1e10
				tactical = true
			}
			if (cw > 0) {
				const vid = victimOf(f, m)
				const pc = cw / T
				tactical = true
				if (vid === 0 || vid === 16) {
					score += 1e9 + pc * 1e8
				} else {
					const vv = vid >= 0 ? PIECE_VALUES[f.types[vid]] : 100
					score += (pc >= 0.25 ? 3e6 : 5e5) + pc * (vv * 10 - PIECE_VALUES[f.types[m.piece]] / 10)
				}
			} else if (m.promo === 'q') {
				score += 2.5e6
				tactical = true
			} else if (m.type === 'merge') {
				score += 6e5
			} else if (m.type === 'standard') {
				score += (this.history.get(m.code) || 0) + 1e3
				if (killers[0] === m.code) {
					score += 9e5
				} else if (killers[1] === m.code) {
					score += 8e5
				}
			} else if (m.type === 'measure') {
				score += 500
			} else {
				score += (this.history.get(m.code) || 0) / 4
			}
			if (m.type !== 'split' && m.type !== 'measure' && givesCheck(f, m, enemyKing)) {
				score += 2e6
				tactical = true
			}
			if (m.type === 'standard' && !m.capture) {
				score += this.targetScore(f, m.piece, m.from[0], m.to[0])
			}
			out[i] = { m, tactical, score }
		}
		out.sort((a, b) => b.score - a.score)
		return out
	}

	/**
	 * Principal variation from the root entry: follows transposition-table moves, taking the most probable outcome of
	 * each roll.
	 *
	 * @param {object} e root entry
	 * @param {number} [maxLen] maximum length
	 * @return {string[]}
	 */
	pv(e, maxLen = 8) {
		const out = [e.code]
		let kid = e.children[0]
		for (const c of e.children) {
			if (c.weight > kid.weight) {
				kid = c
			}
		}
		let state = kid.state
		const seen = new Set()
		while (state !== null && state.result === null && out.length < maxLen) {
			const h = state.history[state.history.length - 1]
			if (seen.has(h)) {
				break
			}
			seen.add(h)
			const t = this.tt.get(h)
			if (t === undefined || t.move === null) {
				break
			}
			const m = findMove(state, t.move)
			if (m === null) {
				break
			}
			out.push(m.code)
			const o = outcomeList(m).reduce((a, b) => (b.weight > a.weight ? b : a))
			state = applyForSearch(state, m, o.key)
		}
		return out
	}

	/**
	 * A full-window value of a position for its side to move at a given depth (used after the main search for fog
	 * bands and replies; shares the transposition table). Returns null when a limit stops it.
	 *
	 * @param {object} state position
	 * @param {number} depth depth
	 * @param {number} [extraNodes] node allowance on top of the current count
	 * @return {number|null}
	 */
	valueOf(state, depth, extraNodes = 20000) {
		if (state.result !== null) {
			return terminalValue(state, 0)
		}
		const saved = [this.nodeBudget, this.deadline, this.sliceDeadline]
		this.nodeBudget = this.nodes + extraNodes
		this.deadline = Infinity
		this.sliceDeadline = Infinity
		try {
			return depth <= 0 ? this.qsearch(state, 0, 1, 0, 0) : this.node(state, depth, 0, 1, 0)
		} catch (e) {
			if (!(e instanceof Stop)) {
				throw e
			}
			return null
		} finally {
			[this.nodeBudget, this.deadline, this.sliceDeadline] = saved
		}
	}

	/**
	 * The search result (SPEC §4.1 `search()`): best move, White's E, per-move values.
	 *
	 * @return {object}
	 */
	result() {
		const elapsed = this.now() - this.start
		const moves = this.root.map((e) => ({
			code: e.code,
			type: e.move.type,
			resolution: e.move.resolution,
			value: e.value === null ? null : cleanValue(e.value),
			E: e.value === null ? null : this.toWhite(cleanValue(e.value)),
			exact: e.exact,
			depth: e.depth,
			outcomes: e.children.length > 1 || e.move.resolution === 'rolled'
				? e.children.map((c) => ({ key: c.key, weight: c.weight, value: c.value === null ? null : cleanValue(c.value), E: c.value === null ? null : this.toWhite(cleanValue(c.value)) }))
				: null,
		}))
		const best = this.root[0]
		return {
			code: best ? best.code : null,
			value: best && best.value !== null ? cleanValue(best.value) : null,
			E: best && best.value !== null ? this.toWhite(cleanValue(best.value)) : null,
			pv: best ? this.pv(best) : [],
			depth: this.depth,
			nodes: this.nodes,
			timeMs: Math.round(elapsed),
			nps: elapsed > 0 ? Math.round(this.nodes / (elapsed / 1000)) : 0,
			moves,
		}
	}
}

/**
 * Search a position synchronously (SPEC §4.1). See `Searcher` for the options.
 *
 * Result: `{code, value, E, pv, depth, nodes, timeMs, nps, moves: [{code, type, resolution, value, E, exact, depth,
 * outcomes}]}` — `value` for the side to move, `E` White's expected score; `moves` best first.
 *
 * @param {object} state engine state (game not over)
 * @param {object} [options] search options
 * @return {object}
 */
export function search(state, options = {}) {
	const s = new Searcher(state, options)
	s.step()
	return s.result()
}
